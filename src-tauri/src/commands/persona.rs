use include_dir::include_dir;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::paths::{copy_dir_recursive, resolve_content_root};

/// 编译期嵌入 `src/core/personae` 下各 skill 完整目录（含 references 等），安装包不再附带 default-data 资源目录。
static EMBEDDED_PERSONAE: include_dir::Dir = include_dir!("$CARGO_MANIFEST_DIR/../src/core/personae");

const PERSONA_INDEX_FILE: &str = "personae-index.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "avatarPath", skip_serializing_if = "Option::is_none")]
    pub avatar_path: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonaIndexEntry {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "avatarPath")]
    pub avatar_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PersonaIndex {
    pub version: u32,
    pub entries: Vec<PersonaIndexEntry>,
}

/// `personae/` 下是否已有任意子目录含 `SKILL.md`（视为用户数据已就绪，避免误跳过）
fn any_persona_skill_on_disk(personas_dir: &Path) -> bool {
    if !personas_dir.is_dir() {
        return false;
    }
    let Ok(entries) = fs::read_dir(personas_dir) else {
        return false;
    };
    entries.flatten().any(|e| {
        let p = e.path();
        p.is_dir() && p.join("SKILL.md").is_file()
    })
}

/// 将内置 persona 写入 `data/personae/`（含 references 等），并生成 `personae-index.json`。
/// NSIS 安装钩子可在首次安装时把 `bundle-data/personae` 复制到 `data/personae`（与 exe 同级）；
/// 若仅有 personae 无索引则在此补全。否则从 exe 同目录 `bundle-data/personae` 复制，或回退 `include_dir` 嵌入。
pub fn init_builtin_personas(app: &AppHandle) -> Result<(), String> {
    let data_dir = resolve_content_root(app)?;
    let personas_dir = data_dir.join("personae");
    let index_path = data_dir.join(PERSONA_INDEX_FILE);

    if any_persona_skill_on_disk(&personas_dir) {
        if !index_path.exists() {
            let index = rebuild_index_from_disk(&data_dir)?;
            save_index(&index_path, &index)?;
            log::info!("Wrote missing {} for existing personae on disk", PERSONA_INDEX_FILE);
        }
        return Ok(());
    }

    fs::create_dir_all(&personas_dir)
        .map_err(|e| format!("Failed to create personae dir: {}", e))?;

    let mut from_packaged_resources = false;
    if let Ok(resource_dir) = app.path().resource_dir() {
        let packaged = resource_dir.join("bundle-data").join("personae");
        if packaged.is_dir() {
            copy_dir_recursive(&packaged, &personas_dir)?;
            from_packaged_resources = true;
            log::info!(
                "Initialized personae from bundle resources {} -> {}",
                packaged.display(),
                personas_dir.display()
            );
        }
    }

    if !from_packaged_resources {
        let mut n_files = 0usize;
        for file in EMBEDDED_PERSONAE.files() {
            let dest = personas_dir.join(file.path());
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!(
                        "Failed to create parent dir {}: {}",
                        parent.display(),
                        e
                    )
                })?;
            }
            fs::write(&dest, file.contents()).map_err(|e| {
                format!("Failed to write {}: {}", dest.display(), e)
            })?;
            n_files += 1;
        }
        if n_files == 0 {
            log::warn!(
                "No bundle-data resources and empty embed; nothing under {}",
                personas_dir.display()
            );
            return Ok(());
        }
        log::info!(
            "Initialized personae from compile-time embed ({} files) -> {}",
            n_files,
            personas_dir.display()
        );
    }

    let index = rebuild_index_from_disk(&data_dir)?;
    save_index(&data_dir.join(PERSONA_INDEX_FILE), &index)?;
    Ok(())
}

fn load_index(path: &Path) -> Result<PersonaIndex, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read index: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse index: {}", e))
}

fn save_index(path: &Path, index: &PersonaIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create parent: {}", e))?;
    }
    let json = serde_json::to_string_pretty(index).map_err(|e| format!("serialize index: {}", e))?;
    fs::write(path, json).map_err(|e| format!("write index: {}", e))
}

fn index_path(data_dir: &Path) -> PathBuf {
    data_dir.join(PERSONA_INDEX_FILE)
}

fn rebuild_index_from_disk(data_dir: &Path) -> Result<PersonaIndex, String> {
    let personas_dir = data_dir.join("personae");
    if !personas_dir.exists() {
        return Ok(PersonaIndex {
            version: 1,
            entries: vec![],
        });
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&personas_dir).map_err(|e| format!("read personae: {}", e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let skill_path = path.join("SKILL.md");
        if !skill_path.exists() {
            continue;
        }
        let content = fs::read_to_string(&skill_path).map_err(|e| format!("read skill: {}", e))?;
        let (_name, display_name, description, tags) = parse_frontmatter(&content);
        let display = display_name.or(_name).unwrap_or_else(|| id.clone());
        let avatar_path = path.join("avatar.png");
        let avatar = if avatar_path.exists() {
            Some("avatar.png".to_string())
        } else {
            None
        };
        entries.push(PersonaIndexEntry {
            id,
            display_name: display,
            description: description.unwrap_or_default(),
            tags,
            avatar_path: avatar,
        });
    }
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(PersonaIndex {
        version: 1,
        entries,
    })
}

fn resolve_avatar_abs(
    data_dir: &Path,
    persona_id: &str,
    index_rel: Option<&String>,
) -> Option<String> {
    let base = data_dir.join("personae").join(persona_id);
    if let Some(rel) = index_rel {
        let p = base.join(rel);
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    let default_png = base.join("avatar.png");
    if default_png.exists() {
        Some(default_png.to_string_lossy().to_string())
    } else {
        None
    }
}

/// 解析 YAML 块标量内容
fn parse_block_scalar(lines: &[&str], folded: bool) -> String {
    // 计算最小缩进
    let min_indent = lines
        .iter()
        .filter(|l| !l.is_empty())
        .map(|l| l.len() - l.trim_start().len())
        .min()
        .unwrap_or(0);

    let dedented: Vec<String> = lines
        .iter()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                line.chars().skip(min_indent).collect()
            }
        })
        .collect();

    if folded {
        let mut result = String::new();
        for (j, line) in dedented.iter().enumerate() {
            if line.is_empty() {
                result.push('\n');
            } else if j > 0 && !dedented[j - 1].is_empty() {
                result.push(' ');
                result.push_str(line);
            } else {
                result.push_str(line);
            }
        }
        result.trim().to_string()
    } else {
        dedented.join("\n").trim().to_string()
    }
}

/// 取 YAML frontmatter：仅首行与下一处单独成行的 `---` 为边界，避免正文中 `---` 子串或水平线误截断。
fn extract_frontmatter_lines(content: &str) -> Option<Vec<&str>> {
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.iter().position(|l| l.trim() == "---")?;
    let end_rel = lines[start + 1..]
        .iter()
        .position(|l| l.trim() == "---")?;
    let end = start + 1 + end_rel;
    Some(lines[start + 1..end].to_vec())
}

/// 解析 SKILL.md 的 frontmatter，支持 YAML 多行块标量
/// 返回 (name, displayName, description, tags)
fn parse_frontmatter(
    content: &str,
) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    let mut name = None;
    let mut display_name = None;
    let mut description = None;
    let mut tags = vec![];

    let Some(lines) = extract_frontmatter_lines(content) else {
        return (name, display_name, description, tags);
    };
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 1..].trim();

            if value == "|"
                || value == ">"
                || value.starts_with("|-")
                || value.starts_with(">-")
            {
                // YAML 多行块标量：收集后续缩进行
                let folded = value.starts_with('>');
                let mut block_lines: Vec<&str> = vec![];
                i += 1;
                while i < lines.len() {
                    let next_line = lines[i];
                    if next_line.is_empty()
                        || next_line.starts_with("  ")
                        || next_line.starts_with('\t')
                    {
                        block_lines.push(next_line);
                        i += 1;
                    } else {
                        break;
                    }
                }
                let block_content = parse_block_scalar(&block_lines, folded);
                match key {
                    "name" => name = Some(block_content),
                    "displayName" => display_name = Some(block_content),
                    "description" => description = Some(block_content),
                    "tags" => {
                        let tags_str =
                            block_content.trim_matches(|c| c == '[' || c == ']');
                        tags = tags_str
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                    _ => {}
                }
                continue;
            }

            match key {
                "name" => name = Some(value.to_string()),
                "displayName" => display_name = Some(value.to_string()),
                "description" => description = Some(value.to_string()),
                "tags" => {
                    let tags_str = value.trim_matches(|c| c == '[' || c == ']');
                    tags = tags_str
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
                _ => {}
            }
        }
        i += 1;
    }

    (name, display_name, description, tags)
}

#[tauri::command]
pub async fn scan_personas(app: AppHandle) -> Result<Vec<Persona>, String> {
    let data_dir = resolve_content_root(&app)?;
    let personas_dir = data_dir.join("personae");

    if !personas_dir.exists() {
        return Ok(vec![]);
    }

    let idx_path = index_path(&data_dir);
    let mut index = if idx_path.exists() {
        load_index(&idx_path).ok()
    } else {
        None
    };

    if index.is_none() || index.as_ref().map(|i| i.entries.is_empty()).unwrap_or(true) {
        let rebuilt = rebuild_index_from_disk(&data_dir)?;
        save_index(&idx_path, &rebuilt)?;
        index = Some(rebuilt);
    }

    let index = index.unwrap();
    let map: HashMap<String, PersonaIndexEntry> =
        index.entries.into_iter().map(|e| (e.id.clone(), e)).collect();

    let mut personas = vec![];
    let mut dir_entries: Vec<_> = fs::read_dir(&personas_dir)
        .map_err(|e| format!("Failed to read personae dir: {}", e))?
        .flatten()
        .collect();
    dir_entries.sort_by_key(|e| e.path());

    for entry in dir_entries {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let skill_path = path.join("SKILL.md");
        if !skill_path.exists() {
            continue;
        }

        if let Some(idx_entry) = map.get(&id) {
            let avatar = resolve_avatar_abs(&data_dir, &id, idx_entry.avatar_path.as_ref());
            personas.push(Persona {
                id: id.clone(),
                name: idx_entry.display_name.clone(),
                description: idx_entry.description.clone(),
                avatar_path: avatar,
                tags: idx_entry.tags.clone(),
            });
        } else {
            let content = fs::read_to_string(&skill_path).map_err(|e| {
                format!(
                    "Failed to read SKILL.md for {}: {}",
                    id,
                    e
                )
            })?;
            let (_name, display_name, description, tags) = parse_frontmatter(&content);
            let display = display_name.or(_name).unwrap_or_else(|| id.clone());
            let avatar = resolve_avatar_abs(&data_dir, &id, None);
            personas.push(Persona {
                id,
                name: display,
                description: description.unwrap_or_default(),
                avatar_path: avatar,
                tags,
            });
        }
    }

    Ok(personas)
}

#[tauri::command]
pub async fn get_persona_skill(app: AppHandle, persona_id: String) -> Result<String, String> {
    let data_dir = resolve_content_root(&app)?;
    let skill_path = data_dir
        .join("personae")
        .join(&persona_id)
        .join("SKILL.md");

    fs::read_to_string(&skill_path)
        .map_err(|e| format!("Failed to read SKILL.md: {}", e))
}

fn is_valid_persona_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// 从本地目录导入 skill 包到 personae/{persona_id}，可选复制头像为 avatar.png
#[tauri::command]
pub async fn import_persona_skill(
    app: AppHandle,
    source_path: String,
    persona_id: String,
    display_name: String,
    avatar_source_path: Option<String>,
) -> Result<(), String> {
    let data_dir = resolve_content_root(&app)?;
    if !is_valid_persona_id(&persona_id) {
        return Err(
            "Invalid persona id: use letters, digits, hyphen and underscore only.".to_string(),
        );
    }
    let src = PathBuf::from(source_path.trim());
    if !src.is_dir() {
        return Err("Source path is not a directory".to_string());
    }
    if !src.join("SKILL.md").exists() {
        return Err("Source folder must contain SKILL.md".to_string());
    }

    let dest = data_dir.join("personae").join(&persona_id);
    if dest.exists() {
        return Err("Target persona already exists".to_string());
    }

    copy_dir_recursive(&src, &dest)?;

    if let Some(ref avatar_src) = avatar_source_path {
        let ap = PathBuf::from(avatar_src.trim());
        if ap.is_file() {
            let dest_avatar = dest.join("avatar.png");
            fs::copy(&ap, &dest_avatar).map_err(|e| format!("Copy avatar: {}", e))?;
        }
    }

    let skill_content = fs::read_to_string(dest.join("SKILL.md"))
        .map_err(|e| format!("Read imported SKILL: {}", e))?;
    let (_name, _display, description, tags) = parse_frontmatter(&skill_content);
    let avatar_path = if dest.join("avatar.png").exists() {
        Some("avatar.png".to_string())
    } else {
        None
    };

    let new_entry = PersonaIndexEntry {
        id: persona_id.clone(),
        display_name: display_name.trim().to_string(),
        description: description.unwrap_or_default(),
        tags,
        avatar_path,
    };

    let idx_path = index_path(&data_dir);
    let mut index = if idx_path.exists() {
        load_index(&idx_path).unwrap_or(PersonaIndex {
            version: 1,
            entries: vec![],
        })
    } else {
        rebuild_index_from_disk(&data_dir).unwrap_or(PersonaIndex {
            version: 1,
            entries: vec![],
        })
    };

    index.entries.retain(|e| e.id != persona_id);
    index.entries.push(new_entry);
    index.entries.sort_by(|a, b| a.id.cmp(&b.id));
    save_index(&idx_path, &index)?;

    Ok(())
}
