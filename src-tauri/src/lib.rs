mod commands;

use commands::{
    add_message, create_chat, create_dir, delete_file, file_exists, get_chat, get_config,
    get_data_dir_command, get_memory, get_messages, get_persona_skill, get_settings_file_path,
    import_persona_skill, init_builtin_personas, list_dir, migrate_user_data, open_folder,
    read_file, scan_personas, update_config, update_memory, write_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 首次运行时初始化内置 persona 数据
            if let Err(e) = init_builtin_personas(app.handle()) {
                log::error!("Failed to initialize built-in personas: {}", e);
            } else {
                log::info!("Built-in personas initialized successfully");
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
            import_persona_skill,
            // Config commands
            get_config,
            update_config,
            get_data_dir_command,
            get_settings_file_path,
            migrate_user_data,
            // Platform commands
            open_folder,
            read_file,
            write_file,
            file_exists,
            create_dir,
            delete_file,
            list_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
