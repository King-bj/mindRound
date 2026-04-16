use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use super::paths::resolve_content_root;

/// 编译时嵌入所有内置 persona 的 SKILL.md 文件
const BUILTIN_PERSONAS: &[(&str, &str)] = &[
    ("elon-musk-skill", include_str!("../../../src/core/personae/elon-musk-skill/SKILL.md")),
    ("feynman-skill", include_str!("../../../src/core/personae/feynman-skill/SKILL.md")),
    ("jiajing-perspective-skill", include_str!("../../../src/core/personae/jiajing-perspective-skill/SKILL.md")),
    ("laozi-skill", include_str!("../../../src/core/personae/laozi-skill/SKILL.md")),
    ("luoyonghao-skill", include_str!("../../../src/core/personae/luoyonghao-skill/SKILL.md")),
    ("paul-graham-skill", include_str!("../../../src/core/personae/paul-graham-skill/SKILL.md")),
    ("spongebob-skill", include_str!("../../../src/core/personae/spongebob-skill/SKILL.md")),
    ("steve-jobs-skill", include_str!("../../../src/core/personae/steve-jobs-skill/SKILL.md")),
    ("trump-skill", include_str!("../../../src/core/personae/trump-skill/SKILL.md")),
    ("zhang-yiming-skill", include_str!("../../../src/core/personae/zhang-yiming-skill/SKILL.md")),
    ("zhangxuefeng-skill", include_str!("../../../src/core/personae/zhangxuefeng-skill/SKILL.md")),
];

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

/// 首次运行时初始化内置 persona 数据
/// 检测 personae/ 目录是否存在且非空，若为空则写入内置数据
pub fn init_builtin_personas(app: &AppHandle) -> Result<(), String> {
    let data_dir = resolve_content_root(app)?;
    let personas_dir = data_dir.join("personae");

    // 如果目录已存在且非空，跳过初始化
    if personas_dir.exists() {
        if let Ok(entries) = fs::read_dir(&personas_dir) {
            if entries.count() > 0 {
                return Ok(());
            }
        }
    }

    // 创建 personae 目录
    fs::create_dir_all(&personas_dir)
        .map_err(|e| format!("Failed to create personae dir: {}", e))?;

    // 写入所有内置 persona
    for (id, content) in BUILTIN_PERSONAS {
        let persona_dir = personas_dir.join(id);
        fs::create_dir_all(&persona_dir)
            .map_err(|e| format!("Failed to create persona dir: {}", e))?;
        let skill_path = persona_dir.join("SKILL.md");
        fs::write(&skill_path, content)
            .map_err(|e| format!("Failed to write SKILL.md for {}: {}", id, e))?;
    }

    let index = build_builtin_index();
    save_index(&data_dir.join(PERSONA_INDEX_FILE), &index)?;

    log::info!("Initialized {} built-in personas", BUILTIN_PERSONAS.len());
    Ok(())
}

fn build_builtin_index() -> PersonaIndex {
    let mut entries = Vec::new();
    for (id, content) in BUILTIN_PERSONAS {
        let (name, display_name, description, tags) = parse_frontmatter(content);
        let display = display_name.or(name).unwrap_or_else(|| id.to_string());
        entries.push(PersonaIndexEntry {
            id: id.to_string(),
            display_name: display,
            description: description.unwrap_or_default(),
            tags,
            avatar_path: None,
        });
    }
    entries.sort_by(|a, b| a.id.cmp(&b.id));
    PersonaIndex {
        version: 1,
        entries,
    }
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

/// 解析 SKILL.md 的 frontmatter，支持 YAML 多行块标量
/// 返回 (name, displayName, description, tags)
fn parse_frontmatter(
    content: &str,
) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    let mut name = None;
    let mut display_name = None;
    let mut description = None;
    let mut tags = vec![];

    if let Some(start) = content.find("---") {
        if let Some(end) = content[start + 3..].find("---") {
            let frontmatter = &content[start + 3..start + 3 + end];
            let lines: Vec<&str> = frontmatter.lines().collect();
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
        }
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

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = fs::metadata(src).map_err(|e| format!("source: {}", e))?;
    if src == dst {
        return Err("source and dest are the same".to_string());
    }
    if !meta.is_dir() {
        return Err("source is not a directory".to_string());
    }
    fs::create_dir_all(dst).map_err(|e| format!("mkdir dest: {}", e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("read src: {}", e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ty = entry.file_type().map_err(|e| format!("file_type: {}", e))?;
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| format!("copy {:?}: {}", from, e))?;
        }
    }
    Ok(())
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
