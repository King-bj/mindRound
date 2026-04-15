use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub chat_type: String,
    pub title: String,
    pub persona_ids: Vec<String>,
    pub current_speaker_index: u32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessageDTO {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    #[serde(rename = "personaId", skip_serializing_if = "Option::is_none")]
    pub persona_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MessagesData {
    pub messages: Vec<MessageDTO>,
}

fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {}", e))
}

#[tauri::command]
pub async fn create_chat(
    app: AppHandle,
    chat_type: String,
    title: String,
    persona_ids: Vec<String>,
) -> Result<ChatMeta, String> {
    let data_dir = get_data_dir(&app)?;
    let chats_dir = data_dir.join("chats");

    // Create chats directory if not exists
    fs::create_dir_all(&chats_dir).map_err(|e| format!("Failed to create chats dir: {}", e))?;

    // Generate ID
    let id = generate_id();
    let now = generate_timestamp();

    let chat_meta = ChatMeta {
        id: id.clone(),
        chat_type,
        title,
        persona_ids,
        current_speaker_index: 0,
        created_at: now.clone(),
    };

    // Create chat directory
    let chat_dir = chats_dir.join(&id);
    fs::create_dir_all(&chat_dir).map_err(|e| format!("Failed to create chat dir: {}", e))?;

    // Write meta.json
    let meta_path = chat_dir.join("meta.json");
    let meta_json = serde_json::to_string_pretty(&chat_meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    fs::write(&meta_path, meta_json).map_err(|e| format!("Failed to write meta.json: {}", e))?;

    // Write messages.json
    let messages_data = MessagesData { messages: vec![] };
    let messages_path = chat_dir.join("messages.json");
    let messages_json = serde_json::to_string_pretty(&messages_data)
        .map_err(|e| format!("Failed to serialize messages: {}", e))?;
    fs::write(&messages_path, messages_json)
        .map_err(|e| format!("Failed to write messages.json: {}", e))?;

    // Write memory.md
    let memory_path = chat_dir.join("memory.md");
    fs::write(&memory_path, "# 对话记忆\n")
        .map_err(|e| format!("Failed to write memory.md: {}", e))?;

    Ok(chat_meta)
}

#[tauri::command]
pub async fn get_chat(app: AppHandle, chat_id: String) -> Result<Option<ChatMeta>, String> {
    let data_dir = get_data_dir(&app)?;
    let meta_path = data_dir.join("chats").join(&chat_id).join("meta.json");

    if !meta_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read meta.json: {}", e))?;
    let meta: ChatMeta =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse meta.json: {}", e))?;

    Ok(Some(meta))
}

#[tauri::command]
pub async fn get_messages(app: AppHandle, chat_id: String) -> Result<Vec<MessageDTO>, String> {
    let data_dir = get_data_dir(&app)?;
    let messages_path = data_dir.join("chats").join(&chat_id).join("messages.json");

    let content = fs::read_to_string(&messages_path)
        .map_err(|e| format!("Failed to read messages.json: {}", e))?;
    let data: MessagesData =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse messages.json: {}", e))?;

    Ok(data.messages)
}

#[tauri::command]
pub async fn add_message(
    app: AppHandle,
    chat_id: String,
    message: MessageDTO,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let messages_path = data_dir.join("chats").join(&chat_id).join("messages.json");

    let content = fs::read_to_string(&messages_path)
        .map_err(|e| format!("Failed to read messages.json: {}", e))?;
    let mut data: MessagesData =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse messages.json: {}", e))?;

    data.messages.push(message);

    let messages_json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize messages: {}", e))?;
    fs::write(&messages_path, messages_json)
        .map_err(|e| format!("Failed to write messages.json: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_memory(app: AppHandle, chat_id: String) -> Result<String, String> {
    let data_dir = get_data_dir(&app)?;
    let memory_path = data_dir.join("chats").join(&chat_id).join("memory.md");

    match fs::read_to_string(&memory_path) {
        Ok(content) => Ok(content),
        Err(_) => Ok("# 对话记忆\n".to_string()),
    }
}

#[tauri::command]
pub async fn update_memory(
    app: AppHandle,
    chat_id: String,
    content: String,
) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let memory_path = data_dir.join("chats").join(&chat_id).join("memory.md");

    fs::write(&memory_path, content).map_err(|e| format!("Failed to write memory.md: {}", e))?;

    Ok(())
}

fn generate_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let millis = duration.subsec_millis();
    format!("{}.{:03}Z", secs, millis)
}

fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let nanos = duration.subsec_nanos();
    format!("chat_{}_{}", duration.as_secs(), nanos)
}
