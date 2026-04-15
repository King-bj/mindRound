use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(rename = "apiBaseUrl")]
    pub api_base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
    #[serde(rename = "dataDir")]
    pub data_dir: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4o".to_string(),
            data_dir: String::new(),
        }
    }
}

fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    Ok(data_dir.join("settings.json"))
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_path(&app)?;

    if !config_path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;

    let config: AppConfig = serde_json::from_str(&content)
        .unwrap_or_default();

    Ok(config)
}

#[tauri::command]
pub async fn update_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;

    // Ensure data directory exists
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let config_path = get_config_path(&app)?;
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_data_dir_command(app: AppHandle) -> Result<String, String> {
    let data_dir = get_data_dir(&app)?;

    // Ensure data directory exists
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    Ok(data_dir.to_string_lossy().to_string())
}
