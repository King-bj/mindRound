mod commands;

use commands::{
    add_message, create_chat, get_chat, get_config, get_data_dir_command, get_memory,
    get_messages, get_persona_skill, open_folder, scan_personas, update_config, update_memory,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Chat commands
            create_chat,
            get_chat,
            get_messages,
            add_message,
            get_memory,
            update_memory,
            // Persona commands
            scan_personas,
            get_persona_skill,
            // Config commands
            get_config,
            update_config,
            get_data_dir_command,
            // Platform commands
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
