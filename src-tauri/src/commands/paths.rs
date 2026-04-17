//! 应用数据路径：`settings.json` 与 `credentials.json` 位于 `app_storage_root`；
//! 正式版（桌面 release）为安装目录下 `data/`，debug 与移动端为系统 `app_data_dir`。
//! 用户内容根可由 `settings.json` 的 `dataDir` 覆盖。
//!
//! 注意：不可使用 `PathResolver::executable_dir()`：在 Windows 上未实现（恒失败），且在其他平台表示的是
//! XDG 的 `~/.local/bin` 等用户目录，并非「可执行文件所在目录」。
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 可执行文件所在目录（用于 Windows/Linux 安装目录旁的 `data/`）。
/// `current_exe()` 在常见安装场景下可解析到真实路径；失败时返回明确错误。
fn install_dir_from_current_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    exe.parent()
        .ok_or_else(|| "Current executable path has no parent directory".to_string())
        .map(Path::to_path_buf)
}

/// 系统应用数据目录（仅 debug 桌面与移动平台用作存储根）
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

/// 配置与内置默认内容（personae/chats）所依赖的存储根目录
pub fn app_storage_root(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        app_data_dir(app)
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if cfg!(debug_assertions) {
            app_data_dir(app)
        } else {
            #[cfg(target_os = "macos")]
            {
                // .app 包内路径常只读；release 与 debug 一致使用系统应用数据目录
                app_data_dir(app)
            }
            #[cfg(not(target_os = "macos"))]
            {
                Ok(install_dir_from_current_exe()?.join("data"))
            }
        }
    }
}

/// `settings.json`（非敏感项）绝对路径
pub fn settings_json_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_root(app)?.join("settings.json"))
}

/// `credentials.json`（apiKey）绝对路径
pub fn credentials_json_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_root(app)?.join("credentials.json"))
}

/// 从 settings.json 读取 `dataDir` 字段（非空则视为自定义内容根）
pub fn read_custom_data_dir_from_settings(app: &AppHandle) -> Option<String> {
    let path = settings_json_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v.get("dataDir")?
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 用户数据内容根：`dataDir` 配置优先，否则为 `app_storage_root`
pub fn resolve_content_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_storage_root(app)?;
    fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create app storage dir: {}", e))?;

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
        Ok(root)
    }
}

/// 供前端展示或打开 `settings.json`（不含 apiKey）
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

pub(crate) fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
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

    // 复制 personae-index.json（如果源文件存在且目标文件不存在）
    let index_src = from_root.join("personae-index.json");
    let index_dst = to_root.join("personae-index.json");
    if index_src.exists() && !index_dst.exists() {
        fs::copy(&index_src, &index_dst).map_err(|e| {
            format!(
                "Failed to copy index file {} -> {}: {}",
                index_src.display(),
                index_dst.display(),
                e
            )
        })?;
    }

    Ok(())
}
