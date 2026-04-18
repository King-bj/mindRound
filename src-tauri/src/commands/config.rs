use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fs;
use tauri::AppHandle;

use super::paths::{
    app_storage_root, credentials_json_path, resolve_content_root, settings_json_path,
};

/// Agent 搜索提供者（与前端 `AppConfig['searchProvider']` 一致，JSON 为字符串）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SearchProvider {
    #[default]
    Ddg,
    Tavily,
    Serper,
}

impl SearchProvider {
    fn as_str(self) -> &'static str {
        match self {
            SearchProvider::Ddg => "ddg",
            SearchProvider::Tavily => "tavily",
            SearchProvider::Serper => "serper",
        }
    }

    fn parse(s: &str) -> Self {
        match s.trim() {
            "tavily" => SearchProvider::Tavily,
            "serper" => SearchProvider::Serper,
            _ => SearchProvider::Ddg,
        }
    }
}

impl Serialize for SearchProvider {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for SearchProvider {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(SearchProvider::parse(&s))
    }
}

/// 合并后对外配置（`get_config` / `update_config`）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(rename = "apiBaseUrl")]
    pub api_base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
    #[serde(rename = "dataDir")]
    pub data_dir: String,
    #[serde(rename = "searchProvider", default)]
    pub search_provider: SearchProvider,
    #[serde(rename = "searchApiKey", default)]
    pub search_api_key: String,
    #[serde(rename = "sandboxFolders", default)]
    pub sandbox_folders: Vec<String>,
}

/// 仅写入 `settings.json` 的字段（不含 apiKey）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(rename = "apiBaseUrl")]
    pub api_base_url: String,
    pub model: String,
    #[serde(rename = "dataDir")]
    pub data_dir: String,
    #[serde(rename = "searchProvider", default)]
    pub search_provider: SearchProvider,
    #[serde(rename = "searchApiKey", default)]
    pub search_api_key: String,
    #[serde(rename = "sandboxFolders", default)]
    pub sandbox_folders: Vec<String>,
}

/// 仅写入 `credentials.json`
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Credentials {
    #[serde(rename = "apiKey")]
    pub api_key: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o".to_string(),
            data_dir: String::new(),
            search_provider: SearchProvider::default(),
            search_api_key: String::new(),
            sandbox_folders: Vec::new(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        let s = AppSettings::default();
        Self {
            api_base_url: s.api_base_url,
            api_key: String::new(),
            model: s.model,
            data_dir: s.data_dir,
            search_provider: s.search_provider,
            search_api_key: s.search_api_key,
            sandbox_folders: s.sandbox_folders,
        }
    }
}

impl From<&AppConfig> for AppSettings {
    fn from(c: &AppConfig) -> Self {
        Self {
            api_base_url: c.api_base_url.clone(),
            model: c.model.clone(),
            data_dir: c.data_dir.clone(),
            search_provider: c.search_provider,
            search_api_key: c.search_api_key.clone(),
            sandbox_folders: c.sandbox_folders.clone(),
        }
    }
}

impl From<&AppConfig> for Credentials {
    fn from(c: &AppConfig) -> Self {
        Self {
            api_key: c.api_key.clone(),
        }
    }
}

/// 首次启动在存储根下生成默认 `settings.json` 与 `credentials.json`
pub fn ensure_default_config_files(app: &AppHandle) -> Result<(), String> {
    let root = app_storage_root(app)?;
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create app storage dir: {}", e))?;

    let settings_path = settings_json_path(app)?;
    if !settings_path.exists() {
        let s = AppSettings::default();
        let json = serde_json::to_string_pretty(&s)
            .map_err(|e| format!("Failed to serialize default settings: {}", e))?;
        fs::write(&settings_path, json)
            .map_err(|e| format!("Failed to write settings.json: {}", e))?;
    }

    let cred_path = credentials_json_path(app)?;
    if !cred_path.exists() {
        let c = Credentials::default();
        let json = serde_json::to_string_pretty(&c)
            .map_err(|e| format!("Failed to serialize default credentials: {}", e))?;
        fs::write(&cred_path, json)
            .map_err(|e| format!("Failed to write credentials.json: {}", e))?;
    }

    Ok(())
}

fn read_settings(app: &AppHandle) -> AppSettings {
    let path = match settings_json_path(app) {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() {
        return AppSettings::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return AppSettings::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn read_credentials(app: &AppHandle) -> Credentials {
    let path = match credentials_json_path(app) {
        Ok(p) => p,
        Err(_) => return Credentials::default(),
    };
    if !path.exists() {
        return Credentials::default();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Credentials::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn merge_config(settings: AppSettings, creds: Credentials) -> AppConfig {
    AppConfig {
        api_base_url: settings.api_base_url,
        api_key: creds.api_key,
        model: settings.model,
        data_dir: settings.data_dir,
        search_provider: settings.search_provider,
        search_api_key: settings.search_api_key,
        sandbox_folders: settings.sandbox_folders,
    }
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    let settings = read_settings(&app);
    let creds = read_credentials(&app);

    let settings_path = settings_json_path(&app)?;
    let cred_path = credentials_json_path(&app)?;
    let mut cfg = if !settings_path.exists() && !cred_path.exists() {
        AppConfig::default()
    } else {
        merge_config(settings, creds)
    };

    // settings 里 dataDir 留空时，对外仍返回实际内容根（安装目录/data 或自定义路径）
    if cfg.data_dir.trim().is_empty() {
        cfg.data_dir = resolve_content_root(&app)?
            .to_string_lossy()
            .to_string();
    }

    Ok(cfg)
}

#[tauri::command]
pub async fn update_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let root = app_storage_root(&app)?;
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create app storage dir: {}", e))?;

    let settings: AppSettings = (&config).into();
    let creds: Credentials = (&config).into();

    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    let cred_json = serde_json::to_string_pretty(&creds)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    fs::write(settings_json_path(&app)?, settings_json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;
    fs::write(credentials_json_path(&app)?, cred_json)
        .map_err(|e| format!("Failed to write credentials.json: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_data_dir_command(app: AppHandle) -> Result<String, String> {
    let root = resolve_content_root(&app)?;
    Ok(root.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_provider_serializes_as_plain_string() {
        assert_eq!(
            serde_json::to_string(&SearchProvider::Tavily).unwrap(),
            "\"tavily\""
        );
        assert_eq!(
            serde_json::from_str::<SearchProvider>("\"serper\"").unwrap(),
            SearchProvider::Serper
        );
        assert_eq!(
            serde_json::from_str::<SearchProvider>("\"bogus\"").unwrap(),
            SearchProvider::Ddg
        );
    }

    #[test]
    fn app_settings_defaults_for_legacy_json() {
        let legacy = r#"{"apiBaseUrl":"https://x","model":"m","dataDir":""}"#;
        let s: AppSettings = serde_json::from_str(legacy).unwrap();
        assert_eq!(s.search_provider, SearchProvider::Ddg);
        assert!(s.search_api_key.is_empty());
        assert!(s.sandbox_folders.is_empty());
    }
}
