use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "avatarPath", skip_serializing_if = "Option::is_none")]
    pub avatar_path: Option<String>,
    pub tags: Vec<String>,
}

fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>, Vec<String>) {
    let mut name = None;
    let mut description = None;
    let mut tags = vec![];

    if let Some(start) = content.find("---") {
        if let Some(end) = content[start + 3..].find("---") {
            let frontmatter = &content[start + 3..start + 3 + end];
            for line in frontmatter.lines() {
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim();
                    let value = line[colon_pos + 1..].trim();
                    match key {
                        "name" => name = Some(value.to_string()),
                        "description" => description = Some(value.to_string()),
                        "tags" => {
                            // Parse tags: [tag1, tag2] or tag1, tag2
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
            }
        }
    }

    (name, description, tags)
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
                    let (name, description, tags) = parse_frontmatter(&content);

                    // Check for avatar
                    let avatar_path = path.join("avatar.png");
                    let avatar = if avatar_path.exists() {
                        Some(avatar_path.to_string_lossy().to_string())
                    } else {
                        None
                    };

                    personas.push(Persona {
                        id,
                        name: name.unwrap_or_default(),
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
