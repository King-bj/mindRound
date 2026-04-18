//! Agent 工具：web_search。
//!
//! 多引擎 fallback + 重试 + UA 随机化：
//! - Bing 中国站（cn.bing.com）优先，国内网络更可达
//! - DDG 三端点轮询（html / www / lite），对单端点做有限退避重试
//! - 免 key 回退：Brave HTML、SearxNG 公共镜像池
//! - Tavily / Serper（需 api_key）单独路径，失败后也降级到 Bing → DDG 链
//! - 全链路 wall-clock 预算，超时不再串后续引擎
//! - 有任何一个引擎返回 >=1 条即返回；全部失败才合并错误向上报
use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:121.0) Gecko/20100101 Firefox/121.0",
];

/// 每次请求之间的退避；长度为 n 表示最多 n+1 次 HTTP 尝试
const RETRY_DELAYS_MS: &[u64] = &[400];

/// 全链路搜索 wall-clock 预算（毫秒），跑完一家后检查，超预算则不再尝试后续引擎
const GLOBAL_BUDGET_MS: u64 = 18_000;

/// SearxNG 公共镜像（若全部挂了，用户可在设置中换 provider）
const SEARXNG_INSTANCES: &[&str] = &[
    "https://searx.be/search",
    "https://baresearch.org/search",
    "https://search.inetol.net/search",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// 搜索命令入参
#[derive(Debug, Deserialize)]
pub struct SearchArgs {
    pub query: String,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

/// 单引擎执行过程中的分层错误
#[derive(Debug, Clone)]
pub enum EngineErr {
    /// 被限流 / 反爬（HTTP 202/403/429 等）
    RateLimited(String),
    /// 网络级故障（超时、连接重置、DNS）
    Network(String),
    /// HTML / JSON 解析失败
    Parse(String),
    /// 请求成功但无有效结果
    Empty,
}

impl std::fmt::Display for EngineErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineErr::RateLimited(m) => write!(f, "rate_limited({})", m),
            EngineErr::Network(m) => write!(f, "network({})", m),
            EngineErr::Parse(m) => write!(f, "parse({})", m),
            EngineErr::Empty => write!(f, "empty"),
        }
    }
}

/// 外部直接用到的"尝试标签 + 错误"对，用于拼接最终错误信息
type AttemptErr = (String, EngineErr);

/// 前端唯一入口：根据 provider 选择引擎链，多引擎 fallback
#[tauri::command]
pub async fn agent_web_search(args: SearchArgs) -> Result<Vec<SearchResult>, String> {
    let max = args.max_results.unwrap_or(5).clamp(1, 20);
    let provider = args
        .provider
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_else(|| "ddg".to_string());

    let client = build_client()?;
    let mut errors: Vec<AttemptErr> = Vec::new();
    let budget_start = Instant::now();

    // 1) 先按指定 provider 执行（若有 key 用 key）
    let ordered_primary = match provider.as_str() {
        "tavily" => {
            if let Some(k) = args.api_key.as_deref() {
                match search_tavily(&client, &args.query, max, k).await {
                    Ok(v) if !v.is_empty() => return Ok(v),
                    Ok(_) => errors.push(("Tavily".to_string(), EngineErr::Empty)),
                    Err(e) => errors.push(("Tavily".to_string(), e)),
                }
            } else {
                errors.push((
                    "Tavily".to_string(),
                    EngineErr::Parse("missing api_key".to_string()),
                ));
            }
            true
        }
        "serper" => {
            if let Some(k) = args.api_key.as_deref() {
                match search_serper(&client, &args.query, max, k).await {
                    Ok(v) if !v.is_empty() => return Ok(v),
                    Ok(_) => errors.push(("Serper".to_string(), EngineErr::Empty)),
                    Err(e) => errors.push(("Serper".to_string(), e)),
                }
            } else {
                errors.push((
                    "Serper".to_string(),
                    EngineErr::Parse("missing api_key".to_string()),
                ));
            }
            true
        }
        _ => false,
    };

    // 2) Bing 中国站（免 key，默认链首位 / 付费失败后的降级）
    if within_search_budget(budget_start) {
        match run_with_retry(|| search_bing(&client, &args.query, max)).await {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => errors.push(("Bing·cn".to_string(), EngineErr::Empty)),
            Err(e) => errors.push(("Bing·cn".to_string(), e)),
        }
    }

    // 3) DDG 三端点轮询
    for ep in ddg_endpoints() {
        if !within_search_budget(budget_start) {
            break;
        }
        match run_with_retry(|| fetch_and_parse_ddg(&client, ep.url, ep.kind, &args.query, max))
            .await
        {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => errors.push((format!("DDG·{}", ep.label), EngineErr::Empty)),
            Err(e) => errors.push((format!("DDG·{}", ep.label), e)),
        }
    }

    // 4) Brave HTML（免 key）
    if within_search_budget(budget_start) {
        match run_with_retry(|| search_brave(&client, &args.query, max)).await {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => errors.push(("Brave".to_string(), EngineErr::Empty)),
            Err(e) => errors.push(("Brave".to_string(), e)),
        }
    }

    // 5) SearxNG 公共镜像池
    for inst in SEARXNG_INSTANCES {
        if !within_search_budget(budget_start) {
            break;
        }
        match run_with_retry(|| search_searxng(&client, inst, &args.query, max)).await {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => errors.push((format!("SearxNG·{}", short_host(inst)), EngineErr::Empty)),
            Err(e) => errors.push((format!("SearxNG·{}", short_host(inst)), e)),
        }
    }

    let _ = ordered_primary;
    Err(format_errors(&errors))
}

// ============ HTTP 客户端与通用工具 ============

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(pick_user_agent())
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| format!("client: {}", e))
}

#[inline]
fn within_search_budget(start: Instant) -> bool {
    start.elapsed() < Duration::from_millis(GLOBAL_BUDGET_MS)
}

/// 基于系统时间做一个便宜的"随机"选择（避免引入 rand 依赖）
fn pick_user_agent() -> &'static str {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as usize)
        .unwrap_or(0);
    USER_AGENTS[nanos % USER_AGENTS.len()]
}

fn short_host(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| url.to_string())
}

/// 按 RETRY_DELAYS_MS 指数退避重试单个请求；仅对"可重试"的错误类型重试
async fn run_with_retry<F, Fut>(mut f: F) -> Result<Vec<SearchResult>, EngineErr>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<SearchResult>, EngineErr>>,
{
    let mut last_err: Option<EngineErr> = None;
    for attempt in 0..=RETRY_DELAYS_MS.len() {
        match f().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                let retryable = matches!(
                    e,
                    EngineErr::RateLimited(_) | EngineErr::Network(_) | EngineErr::Empty
                );
                last_err = Some(e);
                if !retryable {
                    break;
                }
                if attempt < RETRY_DELAYS_MS.len() {
                    tokio::time::sleep(Duration::from_millis(RETRY_DELAYS_MS[attempt])).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or(EngineErr::Empty))
}

fn format_errors(errors: &[AttemptErr]) -> String {
    if errors.is_empty() {
        return "所有搜索引擎都失败了（无更多信息）".to_string();
    }
    let joined = errors
        .iter()
        .map(|(name, e)| format!("{} {}", name, e))
        .collect::<Vec<_>>()
        .join(" | ");
    format!("所有搜索引擎都失败了：{}", joined)
}

/// 按 HTTP 状态码与 body 粗判"是否被限流/封禁"
fn classify_status(status: reqwest::StatusCode, body_hint: &str) -> Option<EngineErr> {
    let code = status.as_u16();
    // 202 在 HTTP 语义上属 2xx，但 DDG 等常用 202 表示反爬/排队，须在 is_success 之前单独处理
    if code == 202 || code == 403 || code == 429 || code == 503 {
        return Some(EngineErr::RateLimited(format!("HTTP {}", code)));
    }
    if status.is_success() {
        return None;
    }
    Some(EngineErr::Network(format!("HTTP {} {}", code, body_hint)))
}

// ============ Bing（中国站）============

async fn search_bing(
    client: &reqwest::Client,
    query: &str,
    max: usize,
) -> Result<Vec<SearchResult>, EngineErr> {
    let url = format!(
        "https://cn.bing.com/search?q={}&ensearch=0",
        urlencoding::encode(query)
    );
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .header(reqwest::header::COOKIE, "setmkt=zh-CN")
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    if let Some(err) = classify_status(status, snippet_for_hint(&body)) {
        return Err(err);
    }
    let results = parse_bing_html(&body, max).map_err(EngineErr::Parse)?;
    if results.is_empty() {
        return Err(EngineErr::Empty);
    }
    Ok(results)
}

/// Bing 网页结果：`li.b_algo` 下 `h2 > a` + `.b_caption p` / `.b_lineclamp2` / `.b_snippet`
pub fn parse_bing_html(body: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let doc = Html::parse_document(body);
    let row_sel = Selector::parse("li.b_algo").map_err(|e| e.to_string())?;
    let link_sel = Selector::parse("h2 > a").map_err(|e| e.to_string())?;
    let desc_sel = Selector::parse(".b_caption p, .b_lineclamp2, .b_snippet")
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in doc.select(&row_sel) {
        if out.len() >= max {
            break;
        }
        let Some(a) = row.select(&link_sel).next() else {
            continue;
        };
        let href = a.value().attr("href").unwrap_or("").trim();
        if href.is_empty() || !(href.starts_with("http://") || href.starts_with("https://")) {
            continue;
        }
        let title = a.text().collect::<String>().trim().to_string();
        if title.is_empty() {
            continue;
        }
        let snippet = row
            .select(&desc_sel)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        out.push(SearchResult {
            title,
            url: href.to_string(),
            snippet,
        });
    }
    Ok(out)
}

// ============ DDG ============

#[derive(Clone, Copy)]
enum DdgKind {
    Html,
    Lite,
}

struct DdgEndpoint {
    label: &'static str,
    url: &'static str,
    kind: DdgKind,
}

fn ddg_endpoints() -> Vec<DdgEndpoint> {
    vec![
        DdgEndpoint {
            label: "html",
            url: "https://html.duckduckgo.com/html/",
            kind: DdgKind::Html,
        },
        DdgEndpoint {
            label: "www",
            url: "https://duckduckgo.com/html/",
            kind: DdgKind::Html,
        },
        DdgEndpoint {
            label: "lite",
            url: "https://lite.duckduckgo.com/lite/",
            kind: DdgKind::Lite,
        },
    ]
}

async fn fetch_and_parse_ddg(
    client: &reqwest::Client,
    endpoint: &str,
    kind: DdgKind,
    query: &str,
    max: usize,
) -> Result<Vec<SearchResult>, EngineErr> {
    let url = format!("{}?q={}", endpoint, urlencoding::encode(query));
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    if let Some(err) = classify_status(status, snippet_for_hint(&body)) {
        return Err(err);
    }

    let parsed = match kind {
        DdgKind::Html => parse_ddg_html(&body, max),
        DdgKind::Lite => parse_ddg_lite(&body, max),
    };
    let results = parsed.map_err(EngineErr::Parse)?;
    if results.is_empty() {
        return Err(EngineErr::Empty);
    }
    Ok(results)
}

fn snippet_for_hint(body: &str) -> &str {
    let trimmed = body.trim();
    &trimmed[..trimmed.len().min(80)]
}

/// DDG 标准 HTML 版（html.duckduckgo.com / duckduckgo.com/html）
pub fn parse_ddg_html(body: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let doc = Html::parse_document(body);
    let row_sel = Selector::parse(".result, .web-result").map_err(|e| e.to_string())?;
    let title_sel = Selector::parse(".result__title a, .result__a").map_err(|e| e.to_string())?;
    let snippet_sel = Selector::parse(".result__snippet").map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in doc.select(&row_sel) {
        if out.len() >= max {
            break;
        }
        let Some(a) = row.select(&title_sel).next() else {
            continue;
        };
        let title = a.text().collect::<String>().trim().to_string();
        let href_raw = a.value().attr("href").unwrap_or("").trim();
        if title.is_empty() || href_raw.is_empty() {
            continue;
        }
        let url = normalize_ddg_href(href_raw);
        let snippet = row
            .select(&snippet_sel)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        out.push(SearchResult {
            title,
            url,
            snippet,
        });
    }
    Ok(out)
}

/// DDG Lite 版（lite.duckduckgo.com/lite），结果以 table 组织：
/// 每 3 个 <tr>：链接行（含 `a.result-link`）→ 摘要行（`.result-snippet`）→ 空行
pub fn parse_ddg_lite(body: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let doc = Html::parse_document(body);
    // 较宽松的选择器：直接抓所有 a.result-link
    let link_sel = Selector::parse("a.result-link").map_err(|e| e.to_string())?;
    // 备选：某些镜像用 `<a class="result-link">` 且摘要在 `td.result-snippet`
    let snippet_sel = Selector::parse(".result-snippet").map_err(|e| e.to_string())?;

    let links: Vec<ElementRef> = doc.select(&link_sel).collect();
    let snippets: Vec<ElementRef> = doc.select(&snippet_sel).collect();

    let mut out = Vec::new();
    for (i, a) in links.iter().enumerate() {
        if out.len() >= max {
            break;
        }
        let title = a.text().collect::<String>().trim().to_string();
        let href = a.value().attr("href").unwrap_or("").trim();
        if title.is_empty() || href.is_empty() {
            continue;
        }
        let url = normalize_ddg_href(href);
        let snippet = snippets
            .get(i)
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        out.push(SearchResult {
            title,
            url,
            snippet,
        });
    }
    Ok(out)
}

/// DDG HTML 的结果链接往往是 `//duckduckgo.com/l/?uddg=<encoded>`
fn normalize_ddg_href(href: &str) -> String {
    let href = if href.starts_with("//") {
        format!("https:{}", href)
    } else {
        href.to_string()
    };

    if let Ok(parsed) = url::Url::parse(&href) {
        if parsed.host_str() == Some("duckduckgo.com") && parsed.path() == "/l/" {
            if let Some(uddg) = parsed
                .query_pairs()
                .find(|(k, _)| k == "uddg")
                .map(|(_, v)| v.into_owned())
            {
                return uddg;
            }
        }
    }
    href
}

// ============ Brave HTML ============

async fn search_brave(
    client: &reqwest::Client,
    query: &str,
    max: usize,
) -> Result<Vec<SearchResult>, EngineErr> {
    let url = format!(
        "https://search.brave.com/search?q={}&source=web",
        urlencoding::encode(query)
    );
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "text/html")
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    if let Some(err) = classify_status(status, snippet_for_hint(&body)) {
        return Err(err);
    }
    let results = parse_brave_html(&body, max).map_err(EngineErr::Parse)?;
    if results.is_empty() {
        return Err(EngineErr::Empty);
    }
    Ok(results)
}

/// Brave 搜索结果页：`#results` 下每条 `[data-type=web]` 或 `.snippet`，含 `a.h` / `.title`
pub fn parse_brave_html(body: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let doc = Html::parse_document(body);
    // Brave 的结构改过几次，综合容错：优先 `.snippet`，其次 `[data-type=web]`
    let row_sel =
        Selector::parse(".snippet[data-type=web], div.snippet, article[data-type=web]")
            .map_err(|e| e.to_string())?;
    let link_sel = Selector::parse("a.h, a.result-header, a[href][data-testid=result-title-a]")
        .map_err(|e| e.to_string())?;
    let title_sel = Selector::parse(".title, .snippet-title, .h-title").map_err(|e| e.to_string())?;
    let desc_sel = Selector::parse(".snippet-description, .snippet-content, .desc, p")
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in doc.select(&row_sel) {
        if out.len() >= max {
            break;
        }
        let Some(a) = row.select(&link_sel).next() else {
            continue;
        };
        let href = a.value().attr("href").unwrap_or("").trim();
        if href.is_empty() || !(href.starts_with("http://") || href.starts_with("https://")) {
            continue;
        }
        let title = row
            .select(&title_sel)
            .next()
            .map(|t| t.text().collect::<String>())
            .unwrap_or_else(|| a.text().collect::<String>())
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }
        let snippet = row
            .select(&desc_sel)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        out.push(SearchResult {
            title,
            url: href.to_string(),
            snippet,
        });
    }
    Ok(out)
}

// ============ SearxNG ============

async fn search_searxng(
    client: &reqwest::Client,
    instance: &str,
    query: &str,
    max: usize,
) -> Result<Vec<SearchResult>, EngineErr> {
    // 大多数 SearxNG 实例支持 format=json，但有些关了；优先 JSON，失败退 HTML
    let url = format!(
        "{}?q={}&format=json",
        instance,
        urlencoding::encode(query)
    );
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status = resp.status();
    if status.is_success() {
        let txt = resp
            .text()
            .await
            .map_err(|e| EngineErr::Network(e.to_string()))?;
        match parse_searxng_json(&txt, max) {
            Ok(v) if !v.is_empty() => return Ok(v),
            _ => {} // 走 HTML 兜底
        }
    } else if let Some(err) = classify_status(status, "") {
        // 非 json 路径：继续尝试 HTML
        if !matches!(err, EngineErr::Network(_) | EngineErr::RateLimited(_)) {
            return Err(err);
        }
    }

    // HTML 兜底
    let html_url = format!("{}?q={}", instance, urlencoding::encode(query));
    let resp2 = client
        .get(&html_url)
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status2 = resp2.status();
    let body2 = resp2
        .text()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    if let Some(err) = classify_status(status2, snippet_for_hint(&body2)) {
        return Err(err);
    }
    let results = parse_searxng_html(&body2, max).map_err(EngineErr::Parse)?;
    if results.is_empty() {
        return Err(EngineErr::Empty);
    }
    Ok(results)
}

#[derive(Deserialize)]
struct SearxNgJson {
    #[serde(default)]
    results: Vec<SearxNgJsonItem>,
}

#[derive(Deserialize)]
struct SearxNgJsonItem {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    content: String,
}

fn parse_searxng_json(body: &str, max: usize) -> Result<Vec<SearchResult>, EngineErr> {
    let parsed: SearxNgJson =
        serde_json::from_str(body).map_err(|e| EngineErr::Parse(e.to_string()))?;
    Ok(parsed
        .results
        .into_iter()
        .filter(|r| !r.title.is_empty() && !r.url.is_empty())
        .take(max)
        .map(|r| SearchResult {
            title: r.title,
            url: r.url,
            snippet: r.content,
        })
        .collect())
}

/// SearxNG HTML 结果页：`article.result > h3 > a` + `.content`
pub fn parse_searxng_html(body: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let doc = Html::parse_document(body);
    let row_sel = Selector::parse("article.result, .result").map_err(|e| e.to_string())?;
    let link_sel = Selector::parse("h3 > a, a.url_wrapper, a.result-url, a[href]")
        .map_err(|e| e.to_string())?;
    let desc_sel = Selector::parse(".content, p.content, .result-content, .snippet")
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in doc.select(&row_sel) {
        if out.len() >= max {
            break;
        }
        let Some(a) = row.select(&link_sel).next() else {
            continue;
        };
        let href = a.value().attr("href").unwrap_or("").trim();
        if href.is_empty() || !(href.starts_with("http://") || href.starts_with("https://")) {
            continue;
        }
        let title = a.text().collect::<String>().trim().to_string();
        if title.is_empty() {
            continue;
        }
        let snippet = row
            .select(&desc_sel)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        out.push(SearchResult {
            title,
            url: href.to_string(),
            snippet,
        });
    }
    Ok(out)
}

// ============ Tavily / Serper（需 api_key） ============

#[derive(Deserialize)]
struct TavilyResp {
    results: Vec<TavilyResult>,
}

#[derive(Deserialize)]
struct TavilyResult {
    title: String,
    url: String,
    #[serde(default)]
    content: String,
}

async fn search_tavily(
    client: &reqwest::Client,
    query: &str,
    max: usize,
    key: &str,
) -> Result<Vec<SearchResult>, EngineErr> {
    let body = serde_json::json!({
        "api_key": key,
        "query": query,
        "max_results": max,
        "include_answer": false,
    });
    let resp = client
        .post("https://api.tavily.com/search")
        .json(&body)
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status = resp.status();
    if let Some(err) = classify_status(status, "") {
        return Err(err);
    }
    let data: TavilyResp = resp.json().await.map_err(|e| EngineErr::Parse(e.to_string()))?;
    Ok(data
        .results
        .into_iter()
        .take(max)
        .map(|r| SearchResult {
            title: r.title,
            url: r.url,
            snippet: r.content,
        })
        .collect())
}

#[derive(Deserialize)]
struct SerperResp {
    #[serde(default)]
    organic: Vec<SerperOrganic>,
}

#[derive(Deserialize)]
struct SerperOrganic {
    title: String,
    link: String,
    #[serde(default)]
    snippet: String,
}

async fn search_serper(
    client: &reqwest::Client,
    query: &str,
    max: usize,
    key: &str,
) -> Result<Vec<SearchResult>, EngineErr> {
    let body = serde_json::json!({ "q": query, "num": max });
    let resp = client
        .post("https://google.serper.dev/search")
        .header("X-API-KEY", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| EngineErr::Network(e.to_string()))?;
    let status = resp.status();
    if let Some(err) = classify_status(status, "") {
        return Err(err);
    }
    let data: SerperResp = resp.json().await.map_err(|e| EngineErr::Parse(e.to_string()))?;
    Ok(data
        .organic
        .into_iter()
        .take(max)
        .map(|r| SearchResult {
            title: r.title,
            url: r.link,
            snippet: r.snippet,
        })
        .collect())
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;
    const DDG_HTML_FIXTURE: &str = include_str!("../../tests/fixtures/ddg.html");
    const DDG_LITE_FIXTURE: &str = include_str!("../../tests/fixtures/ddg_lite.html");
    const BING_FIXTURE: &str = include_str!("../../tests/fixtures/bing.html");
    const BRAVE_FIXTURE: &str = include_str!("../../tests/fixtures/brave.html");
    const SEARXNG_FIXTURE: &str = include_str!("../../tests/fixtures/searxng.html");

    #[test]
    fn parses_ddg_three_results() {
        let r = parse_ddg_html(DDG_HTML_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].title, "Example One");
        assert_eq!(r[0].url, "https://example.com/page1");
        assert_eq!(r[0].snippet, "First snippet content");
        assert_eq!(r[1].url, "https://rust-lang.org/");
        assert_eq!(r[2].snippet, "");
    }

    #[test]
    fn parses_ddg_respects_max() {
        let r = parse_ddg_html(DDG_HTML_FIXTURE, 2).unwrap();
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn normalize_ddg_extracts_uddg() {
        let href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Ffoo.com%2Fbar&rut=xx";
        assert_eq!(normalize_ddg_href(href), "https://foo.com/bar");
    }

    #[test]
    fn parses_ddg_lite_three_results() {
        let r = parse_ddg_lite(DDG_LITE_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].title, "Lite One");
        assert_eq!(r[0].url, "https://example.com/lite1");
        assert_eq!(r[0].snippet, "Lite snippet 1");
        assert_eq!(r[2].url, "https://rust-lang.org/lite");
    }

    #[test]
    fn parses_bing_three_results() {
        let r = parse_bing_html(BING_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].title, "Bing Result One");
        assert_eq!(r[0].url, "https://example.com/bing1");
        assert_eq!(r[0].snippet, "Bing snippet one");
        assert_eq!(r[1].url, "https://example.com/bing2");
        assert_eq!(r[2].snippet, "Bing snippet three lineclamp");
    }

    #[test]
    fn parses_brave_three_results() {
        let r = parse_brave_html(BRAVE_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].title, "Brave Result One");
        assert_eq!(r[0].url, "https://example.com/brave1");
        assert_eq!(r[0].snippet, "Brave snippet one");
        assert_eq!(r[2].title, "Brave Result Three");
    }

    #[test]
    fn parses_searxng_three_results() {
        let r = parse_searxng_html(SEARXNG_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].url, "https://example.com/sx1");
        assert_eq!(r[0].title, "Searx One");
        assert_eq!(r[0].snippet, "Searx snippet 1");
    }

    #[test]
    fn parses_searxng_json() {
        let body = r#"{"results":[
            {"title":"T1","url":"https://a.com","content":"c1"},
            {"title":"T2","url":"https://b.com","content":"c2"}
        ]}"#;
        let r = parse_searxng_json(body, 10).expect("json");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].title, "T1");
        assert_eq!(r[1].url, "https://b.com");
    }

    #[test]
    fn classify_status_rate_limited() {
        assert!(matches!(
            classify_status(reqwest::StatusCode::TOO_MANY_REQUESTS, ""),
            Some(EngineErr::RateLimited(_))
        ));
        assert!(matches!(
            classify_status(reqwest::StatusCode::from_u16(202).unwrap(), ""),
            Some(EngineErr::RateLimited(_))
        ));
        assert!(classify_status(reqwest::StatusCode::OK, "").is_none());
    }

    #[test]
    fn format_errors_joins_attempts() {
        let errs = vec![
            ("DDG·html".to_string(), EngineErr::RateLimited("HTTP 429".to_string())),
            ("Brave".to_string(), EngineErr::Network("timeout".to_string())),
            ("SearxNG·searx.be".to_string(), EngineErr::Empty),
        ];
        let s = format_errors(&errs);
        assert!(s.contains("DDG·html"));
        assert!(s.contains("rate_limited"));
        assert!(s.contains("Brave"));
        assert!(s.contains("SearxNG"));
    }

    #[tokio::test]
    async fn run_with_retry_retries_then_succeeds() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let counter = std::sync::Arc::new(AtomicUsize::new(0));
        let c2 = counter.clone();
        let res = run_with_retry(|| {
            let c = c2.clone();
            async move {
                let n = c.fetch_add(1, Ordering::SeqCst);
                if n < 1 {
                    Err(EngineErr::Network("boom".to_string()))
                } else {
                    Ok(vec![SearchResult {
                        title: "ok".into(),
                        url: "https://x".into(),
                        snippet: String::new(),
                    }])
                }
            }
        })
        .await
        .expect("should succeed on second try");
        assert_eq!(res.len(), 1);
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn run_with_retry_stops_on_parse_error() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let counter = std::sync::Arc::new(AtomicUsize::new(0));
        let c2 = counter.clone();
        let res = run_with_retry(|| {
            let c = c2.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err::<Vec<SearchResult>, _>(EngineErr::Parse("bad".to_string()))
            }
        })
        .await;
        assert!(res.is_err());
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }
}
