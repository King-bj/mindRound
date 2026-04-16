use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "avatarPath", skip_serializing_if = "Option::is_none")]
    pub avatar_path: Option<String>,
    pub tags: Vec<String>,
}

/// 获取应用数据目录
fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))
}

/// 首次运行时初始化内置 persona 数据
/// 检测 personae/ 目录是否存在且非空，若为空则写入内置数据
pub fn init_builtin_personas(app: &AppHandle) -> Result<(), String> {
    let data_dir = get_data_dir(app)?;
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

    log::info!("Initialized {} built-in personas", BUILTIN_PERSONAS.len());
    Ok(())
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
    let data_dir = get_data_dir(&app)?;
    let personas_dir = data_dir.join("personae");

    if !personas_dir.exists() {
        return Ok(vec![]);
    }

    let mut personas = vec![];

    let entries = fs::read_dir(&personas_dir)
        .map_err(|e| format!("Failed to read personae dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let id = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let skill_path = path.join("SKILL.md");
            if skill_path.exists() {
                if let Ok(content) = fs::read_to_string(&skill_path) {
                    let (_name, display_name, description, tags) = parse_frontmatter(&content);

                    // Check for avatar
                    let avatar_path = path.join("avatar.png");
                    let avatar = if avatar_path.exists() {
                        Some(avatar_path.to_string_lossy().to_string())
                    } else {
                        None
                    };

                    // 优先使用 displayName，回退到 name，最后用 id
                    let display = display_name.or(_name).unwrap_or_else(|| id.clone());

                    personas.push(Persona {
                        id,
                        name: display,
                        description: description.unwrap_or_default(),
                        avatar_path: avatar,
                        tags,
                    });
                }
            }
        }
    }

    Ok(personas)
}

#[tauri::command]
pub async fn get_persona_skill(app: AppHandle, persona_id: String) -> Result<String, String> {
    let data_dir = get_data_dir(&app)?;
    let skill_path = data_dir
        .join("personae")
        .join(&persona_id)
        .join("SKILL.md");

    fs::read_to_string(&skill_path)
        .map_err(|e| format!("Failed to read SKILL.md: {}", e))
}
