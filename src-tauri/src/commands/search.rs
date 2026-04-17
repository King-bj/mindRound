//! Agent 工具：web_search。默认 DuckDuckGo HTML 端点（无需 key），可配置 Tavily / Serper。
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 MindRound/0.1";

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

/// 前端唯一入口：根据 provider 分发
#[tauri::command]
pub async fn agent_web_search(args: SearchArgs) -> Result<Vec<SearchResult>, String> {
    let max = args.max_results.unwrap_or(5).clamp(1, 20);
    let provider = args
        .provider
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_else(|| "ddg".to_string());

    let results = match provider.as_str() {
        "ddg" | "duckduckgo" => search_ddg(&args.query, max).await?,
        "tavily" => {
            let key = args
                .api_key
                .as_deref()
                .ok_or_else(|| "Tavily 需要 api_key".to_string())?;
            search_tavily(&args.query, max, key).await?
        }
        "serper" => {
            let key = args
                .api_key
                .as_deref()
                .ok_or_else(|| "Serper 需要 api_key".to_string())?;
            search_serper(&args.query, max, key).await?
        }
        other => return Err(format!("未知搜索引擎: {}", other)),
    };

    Ok(results)
}

async fn search_ddg(query: &str, max: usize) -> Result<Vec<SearchResult>, String> {
    let q = urlencoding::encode(query);
    let url = format!("https://html.duckduckgo.com/html/?q={}", q);

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("DDG status {}", resp.status()));
    }
    let body = resp.text().await.map_err(|e| format!("body: {}", e))?;
    parse_ddg_html(&body, max)
}

/// 单独抽出解析逻辑方便单测
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

async fn search_tavily(query: &str, max: usize, key: &str) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client: {}", e))?;

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
        .map_err(|e| format!("tavily request: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Tavily status {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        ));
    }
    let data: TavilyResp = resp.json().await.map_err(|e| format!("tavily parse: {}", e))?;
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

async fn search_serper(query: &str, max: usize, key: &str) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let body = serde_json::json!({ "q": query, "num": max });
    let resp = client
        .post("https://google.serper.dev/search")
        .header("X-API-KEY", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("serper request: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Serper status {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        ));
    }
    let data: SerperResp = resp.json().await.map_err(|e| format!("serper parse: {}", e))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    const DDG_FIXTURE: &str = include_str!("../../tests/fixtures/ddg.html");

    #[test]
    fn parses_ddg_three_results() {
        let r = parse_ddg_html(DDG_FIXTURE, 10).expect("parse");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].title, "Example One");
        assert_eq!(r[0].url, "https://example.com/page1");
        assert_eq!(r[0].snippet, "First snippet content");
        assert_eq!(r[1].url, "https://rust-lang.org/");
        assert_eq!(r[2].snippet, "");
    }

    #[test]
    fn parses_ddg_respects_max() {
        let r = parse_ddg_html(DDG_FIXTURE, 2).unwrap();
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn normalize_ddg_extracts_uddg() {
        let href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Ffoo.com%2Fbar&rut=xx";
        assert_eq!(normalize_ddg_href(href), "https://foo.com/bar");
    }
}
