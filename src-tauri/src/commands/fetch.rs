//! Agent 工具：web_fetch。拉 URL → Markdown。带 SSRF 白名单防护。
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use url::Host;

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 MindRound/0.1";

/// 单次 fetch 上限（字节）
const DEFAULT_MAX_BYTES: usize = 512 * 1024;

#[derive(Debug, Deserialize)]
pub struct FetchArgs {
    pub url: String,
    /// Markdown 输出的字符上限（仅对转换后的 Markdown 截断，避免爆上下文）
    #[serde(default)]
    pub max_chars: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct FetchResult {
    pub url: String,
    pub status: u16,
    pub content_type: String,
    pub markdown: String,
    /// 截断提示（若内容被截断）
    pub truncated: bool,
}

#[tauri::command]
pub async fn agent_web_fetch(args: FetchArgs) -> Result<FetchResult, String> {
    let parsed = url::Url::parse(&args.url).map_err(|e| format!("非法 URL: {}", e))?;
    is_allowed_url(&parsed)?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let resp = client
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|e| format!("request: {}", e))?;
    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("body: {}", e))?;
    let truncated_bytes = bytes.len() > DEFAULT_MAX_BYTES;
    let slice = &bytes[..bytes.len().min(DEFAULT_MAX_BYTES)];

    let markdown = if content_type.contains("html") {
        // html2md 只接受 &str
        let html = String::from_utf8_lossy(slice);
        html2md::parse_html(&html)
    } else if content_type.contains("json") || content_type.contains("text") {
        String::from_utf8_lossy(slice).to_string()
    } else {
        format!(
            "[Non-text content-type: {}. Length: {} bytes]",
            content_type,
            bytes.len()
        )
    };

    let max_chars = args.max_chars.unwrap_or(16_000).clamp(500, 60_000);
    let (markdown, md_truncated) = if markdown.chars().count() > max_chars {
        let cut: String = markdown.chars().take(max_chars).collect();
        (cut, true)
    } else {
        (markdown, false)
    };

    Ok(FetchResult {
        url: parsed.to_string(),
        status: status.as_u16(),
        content_type,
        markdown,
        truncated: truncated_bytes || md_truncated,
    })
}

/// 公开以便 TS 侧在早期也能走 Rust 校验；SSRF 白名单：仅 http(s)，拒绝内网/环回/保留段
pub fn is_allowed_url(u: &url::Url) -> Result<(), String> {
    match u.scheme() {
        "http" | "https" => {}
        other => return Err(format!("仅允许 http/https，收到 {}", other)),
    }

    let host = u.host().ok_or_else(|| "URL 缺少 host".to_string())?;

    match host {
        Host::Ipv4(ip) => {
            let ip = IpAddr::V4(ip);
            if is_private_ip(&ip) {
                return Err(format!("拒绝访问内网/保留地址: {}", ip));
            }
            Ok(())
        }
        Host::Ipv6(ip) => {
            let ip = IpAddr::V6(ip);
            if is_private_ip(&ip) {
                return Err(format!("拒绝访问内网/保留地址: {}", ip));
            }
            Ok(())
        }
        Host::Domain(host) => {
            // 文本域名：先做 localhost 粗过滤（DNS 解析留给 reqwest）
            let lower = host.to_ascii_lowercase();
            if matches!(
                lower.as_str(),
                "localhost" | "local" | "ip6-localhost" | "ip6-loopback"
            ) || lower.ends_with(".localhost")
                || lower.ends_with(".local")
                || lower.ends_with(".internal")
            {
                return Err(format!("拒绝访问内部域名: {}", lower));
            }
            Ok(())
        }
    }
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_documentation()
                || {
                    let o = v4.octets();
                    // 169.254.x.x 链路本地、100.64-127.x.x CGN
                    (o[0] == 100 && (64..=127).contains(&o[1])) || (o[0] == 127)
                }
        }
        IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || v6.is_unique_local() || v6.is_unicast_link_local()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> url::Url {
        url::Url::parse(s).unwrap()
    }

    #[test]
    fn allows_public_http() {
        assert!(is_allowed_url(&u("https://example.com/path")).is_ok());
        assert!(is_allowed_url(&u("http://public.site/")).is_ok());
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(is_allowed_url(&u("file:///etc/passwd")).is_err());
        assert!(is_allowed_url(&u("ftp://foo/")).is_err());
        assert!(is_allowed_url(&u("javascript:alert(1)")).is_err());
    }

    #[test]
    fn rejects_private_literals() {
        assert!(is_allowed_url(&u("http://127.0.0.1/")).is_err());
        assert!(is_allowed_url(&u("http://localhost/")).is_err());
        assert!(is_allowed_url(&u("http://10.0.0.1/")).is_err());
        assert!(is_allowed_url(&u("http://172.16.0.1/")).is_err());
        assert!(is_allowed_url(&u("http://192.168.1.1/")).is_err());
        assert!(is_allowed_url(&u("http://169.254.1.1/")).is_err());
        assert!(is_allowed_url(&u("http://[::1]/")).is_err());
    }

    #[test]
    fn rejects_local_suffixes() {
        assert!(is_allowed_url(&u("http://foo.local/")).is_err());
        assert!(is_allowed_url(&u("http://db.internal/")).is_err());
    }
}
