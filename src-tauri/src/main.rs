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
            
            let active_downloads = commands::ActiveDownloads {
                map: std::sync::Mutex::new(std::collections::HashMap::new()),
                active_playlists: std::sync::Mutex::new(std::collections::HashSet::new()),
                speed_limit: std::sync::Mutex::new(None),
            };
            app.manage(active_downloads);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_folders,
            commands::create_folder,
            commands::delete_folder,
            commands::delete_playlist_with_assets,
            commands::delete_folder_move_to_root,
            commands::delete_folder_cascade,
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
            commands::download_video,
            commands::cancel_download,
            commands::cancel_playlist_download,
            commands::import_playlist,
            commands::get_library_stats,
            commands::move_folder,
            commands::move_playlist,
            commands::search_library,
            commands::update_folder_emoji,
            commands::log_study_time,
            commands::get_study_stats,
            commands::get_day_study_details,
            commands::get_download_queue,
            commands::clear_failed_download,
            commands::set_download_speed_limit,
            commands::get_all_bookmarks,
            commands::save_screenshot,
            commands::extract_video_frame,
            commands::get_youtube_thumbnail_base64,
            commands::update_bookmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
