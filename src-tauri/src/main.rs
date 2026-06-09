// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod db;
mod commands;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path_resolver().app_data_dir().ok_or_else(|| {
                "Failed to resolve app data directory"
            })?;
            
            let pool = db::init_db(app_dir)?;
            app.manage(pool);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_folders,
            commands::create_folder,
            commands::delete_folder,
            commands::get_playlists,
            commands::get_playlist_videos,
            commands::add_playlist_with_videos,
            commands::update_video_progress,
            commands::get_bookmarks,
            commands::add_bookmark,
            commands::delete_bookmark,
            commands::update_download_progress,
            commands::get_system_status,
            commands::download_ffmpeg,
            commands::download_playlist,
            commands::import_playlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
