//! 应用数据路径：固定 `settings.json` 在 app_data_dir，用户内容根可由配置 `dataDir` 覆盖。
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 系统应用数据目录（`settings.json` 所在根目录）
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

/// `settings.json` 绝对路径（始终位于 app_data_dir）
pub fn settings_json_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

/// 从固定位置的 settings.json 读取 `dataDir` 字段（非空则视为自定义内容根）
pub fn read_custom_data_dir_from_settings(app: &AppHandle) -> Option<String> {
    let path = settings_json_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v.get("dataDir")?
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 用户数据内容根：`dataDir` 配置优先，否则为 app_data_dir
pub fn resolve_content_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_data_dir(app)?;
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    if let Some(custom) = read_custom_data_dir_from_settings(app) {
        let p = PathBuf::from(&custom);
        fs::create_dir_all(&p).map_err(|e| {
            format!(
                "Failed to create custom data dir {}: {}",
                custom, e
            )
        })?;
        Ok(p)
    } else {
        Ok(app_dir)
    }
}

/// 供前端写入 settings.json 的绝对路径
#[tauri::command]
pub async fn get_settings_file_path(app: AppHandle) -> Result<String, String> {
    let p = settings_json_path(&app)?;
    Ok(p.to_string_lossy().to_string())
}

fn subdir_is_missing_or_empty(path: &Path) -> bool {
    if !path.exists() {
        return true;
    }
    fs::read_dir(path)
        .map(|mut d| d.next().is_none())
        .unwrap_or(true)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let name = entry.file_name();
        let to = dst.join(&name);
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| {
                format!(
                    "Failed to copy {} -> {}: {}",
                    from.display(),
                    to.display(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

/// 将 `personae/`、`chats/` 从旧根复制到新根（目标对应子目录不存在或为空时才复制，避免覆盖）
#[tauri::command]
pub async fn migrate_user_data(from: String, to: String) -> Result<(), String> {
    let from_root = PathBuf::from(from.trim());
    let to_root = PathBuf::from(to.trim());
    if from_root.as_os_str().is_empty() || to_root.as_os_str().is_empty() {
        return Ok(());
    }
    if from_root == to_root {
        return Ok(());
    }
    if !from_root.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(&to_root)
        .map_err(|e| format!("Failed to create target root {}: {}", to_root.display(), e))?;

    for sub in ["personae", "chats"] {
        let src = from_root.join(sub);
        if !src.is_dir() {
            continue;
        }
        let dst = to_root.join(sub);
        if !subdir_is_missing_or_empty(&dst) {
            continue;
        }
        copy_dir_recursive(&src, &dst)?;
    }

    Ok(())
}
