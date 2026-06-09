use tauri::{State, Manager};
use crate::db::DbPool;
use serde::{Serialize, Deserialize};
use tauri::api::process::{Command, CommandEvent, CommandChild};
use std::fs::File;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

pub struct ActiveDownloads {
    pub map: Mutex<HashMap<String, CommandChild>>,
    pub active_playlists: Mutex<HashSet<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i32,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Playlist {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub url: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Video {
    pub id: String,
    pub playlist_id: Option<String>,
    pub title: String,
    pub duration: i32,
    pub thumbnail_url: Option<String>,
    pub url: String,
    pub local_path: Option<String>,
    pub download_status: String,
    pub download_progress: i32,
    pub watched_progress: i32,
    pub is_completed: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i32,
    pub video_id: String,
    pub timestamp: i32,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemStatus {
    pub ytdlp_ready: bool,
    pub ffmpeg_ready: bool,
}

#[tauri::command]
pub fn get_folders(pool: State<'_, DbPool>) -> Result<Vec<Folder>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, parent_id, name, position, created_at FROM folders ORDER BY position ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            position: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_folder(pool: State<'_, DbPool>, id: String, name: String, parent_id: Option<String>, position: i32) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO folders (id, parent_id, name, position) VALUES (?1, ?2, ?3, ?4)",
        (&id, &parent_id, &name, &position),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(pool: State<'_, DbPool>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM folders WHERE id = ?1",
        [&id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a playlist AND its downloaded asset files from disk.
/// Always removes every downloaded video file before wiping the DB rows.
#[tauri::command]
pub fn delete_playlist_with_assets(pool: State<'_, DbPool>, playlist_id: String) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;

    // Collect all local paths before touching the DB
    let local_paths: Vec<Option<String>> = {
        let mut stmt = conn.prepare(
            "SELECT local_path FROM videos WHERE playlist_id = ?1"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&playlist_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    // Delete files from disk (best-effort, ignore individual errors)
    for path_opt in &local_paths {
        if let Some(path) = path_opt {
            if !path.is_empty() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    // Delete DB rows in a transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM videos WHERE playlist_id = ?1", [&playlist_id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM playlists WHERE id = ?1", [&playlist_id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// Move all direct children (subfolders + playlists) to root, then delete the folder.
#[tauri::command]
pub fn delete_folder_move_to_root(pool: State<'_, DbPool>, folder_id: String) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Orphan direct child folders to root
    tx.execute(
        "UPDATE folders SET parent_id = NULL WHERE parent_id = ?1",
        [&folder_id],
    ).map_err(|e| e.to_string())?;

    // Orphan direct playlists to root
    tx.execute(
        "UPDATE playlists SET folder_id = NULL WHERE folder_id = ?1",
        [&folder_id],
    ).map_err(|e| e.to_string())?;

    // Delete the folder itself
    tx.execute("DELETE FROM folders WHERE id = ?1", [&folder_id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Recursively collect all descendant folder IDs (including the root one).
fn collect_descendant_folder_ids(conn: &rusqlite::Connection, root_id: &str) -> Result<Vec<String>, String> {
    let mut all_ids = vec![root_id.to_string()];
    let mut queue = vec![root_id.to_string()];

    while let Some(current) = queue.pop() {
        let mut stmt = conn.prepare(
            "SELECT id FROM folders WHERE parent_id = ?1"
        ).map_err(|e| e.to_string())?;
        let children: Vec<String> = stmt.query_map([&current], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        for child in children {
            all_ids.push(child.clone());
            queue.push(child);
        }
    }
    Ok(all_ids)
}

/// Recursively delete a folder, all its descendant subfolders, all playlists,
/// and all videos. Optionally also delete video asset files from disk.
#[tauri::command]
pub fn delete_folder_cascade(
    pool: State<'_, DbPool>,
    folder_id: String,
    delete_assets: bool,
) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;

    // Collect all folder IDs in the subtree
    let all_folder_ids = collect_descendant_folder_ids(&conn, &folder_id)?;

    if delete_assets {
        // Gather all local_paths for videos in these folders' playlists
        for fid in &all_folder_ids {
            let mut stmt = conn.prepare(
                "SELECT v.local_path FROM videos v
                 JOIN playlists p ON v.playlist_id = p.id
                 WHERE p.folder_id = ?1 AND v.local_path IS NOT NULL AND v.local_path != ''"
            ).map_err(|e| e.to_string())?;
            let paths: Vec<String> = stmt.query_map([fid], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            for path in paths {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    // DB deletions in a transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for fid in &all_folder_ids {
        // Delete videos for all playlists in this folder
        tx.execute(
            "DELETE FROM videos WHERE playlist_id IN (SELECT id FROM playlists WHERE folder_id = ?1)",
            [fid],
        ).map_err(|e| e.to_string())?;
        // Delete playlists in this folder
        tx.execute("DELETE FROM playlists WHERE folder_id = ?1", [fid])
            .map_err(|e| e.to_string())?;
    }
    // Delete all the folders in reverse order (deepest first avoids FK issues)
    for fid in all_folder_ids.iter().rev() {
        tx.execute("DELETE FROM folders WHERE id = ?1", [fid])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_folder(pool: State<'_, DbPool>, folder_id: String, parent_id: Option<String>) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Check for potential cycles if moving into a parent folder
    if let Some(ref target_parent_id) = parent_id {
        if target_parent_id == &folder_id {
            return Err("Cannot move a folder inside itself.".to_string());
        }
        
        // Check if target_parent_id is a descendant of folder_id
        let descendants = collect_descendant_folder_ids(&conn, &folder_id)?;
        if descendants.contains(target_parent_id) {
            return Err("Cannot move a folder inside its own subfolders.".to_string());
        }
    }
    
    conn.execute(
        "UPDATE folders SET parent_id = ?1 WHERE id = ?2",
        (parent_id, &folder_id),
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn move_playlist(pool: State<'_, DbPool>, playlist_id: String, folder_id: Option<String>) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE playlists SET folder_id = ?1 WHERE id = ?2",
        (folder_id, &playlist_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}


#[tauri::command]
pub fn get_playlists(pool: State<'_, DbPool>) -> Result<Vec<Playlist>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, folder_id, title, description, thumbnail_url, url, created_at FROM playlists ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            thumbnail_url: row.get(4)?,
            url: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_playlist_videos(pool: State<'_, DbPool>, playlist_id: String) -> Result<Vec<Video>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, playlist_id, title, duration, thumbnail_url, url, local_path, download_status, download_progress, watched_progress, is_completed, created_at 
         FROM videos WHERE playlist_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([&playlist_id], |row| {
        let is_completed_val: i32 = row.get(10)?;
        Ok(Video {
            id: row.get(0)?,
            playlist_id: row.get(1)?,
            title: row.get(2)?,
            duration: row.get(3)?,
            thumbnail_url: row.get(4)?,
            url: row.get(5)?,
            local_path: row.get(6)?,
            download_status: row.get(7)?,
            download_progress: row.get(8)?,
            watched_progress: row.get(9)?,
            is_completed: is_completed_val != 0,
            created_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn add_playlist_with_videos(pool: State<'_, DbPool>, playlist: Playlist, videos: Vec<Video>) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT OR REPLACE INTO playlists (id, folder_id, title, description, thumbnail_url, url) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &playlist.id,
            &playlist.folder_id,
            &playlist.title,
            &playlist.description,
            &playlist.thumbnail_url,
            &playlist.url,
        ),
    ).map_err(|e| e.to_string())?;
    
    for video in videos {
        tx.execute(
            "INSERT OR REPLACE INTO videos (id, playlist_id, title, duration, thumbnail_url, url, local_path, download_status, download_progress, watched_progress, is_completed) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            (
                &video.id,
                &video.playlist_id,
                &video.title,
                &video.duration,
                &video.thumbnail_url,
                &video.url,
                &video.local_path,
                &video.download_status,
                &video.download_progress,
                &video.watched_progress,
                if video.is_completed { 1 } else { 0 },
            ),
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_video_progress(pool: State<'_, DbPool>, video_id: String, seconds: i32, is_completed: bool) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET watched_progress = ?1, is_completed = ?2 WHERE id = ?3",
        (seconds, if is_completed { 1 } else { 0 }, &video_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_bookmarks(pool: State<'_, DbPool>, video_id: String) -> Result<Vec<Bookmark>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, video_id, timestamp, label, created_at FROM bookmarks WHERE video_id = ?1 ORDER BY timestamp ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&video_id], |row| {
        Ok(Bookmark {
            id: row.get(0)?,
            video_id: row.get(1)?,
            timestamp: row.get(2)?,
            label: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn add_bookmark(pool: State<'_, DbPool>, video_id: String, timestamp: i32, label: Option<String>) -> Result<Bookmark, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bookmarks (video_id, timestamp, label) VALUES (?1, ?2, ?3)",
        (&video_id, &timestamp, &label),
    ).map_err(|e| e.to_string())?;
    
    let last_id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, video_id, timestamp, label, created_at FROM bookmarks WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query_map([last_id], |row| {
        Ok(Bookmark {
            id: row.get(0)?,
            video_id: row.get(1)?,
            timestamp: row.get(2)?,
            label: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next() {
        let bookmark = row.map_err(|e| e.to_string())?;
        Ok(bookmark)
    } else {
        Err("Failed to retrieve created bookmark".to_string())
    }
}

#[tauri::command]
pub fn delete_bookmark(pool: State<'_, DbPool>, id: i32) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bookmarks WHERE id = ?1",
        [id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_download_progress(
    pool: State<'_, DbPool>, 
    video_id: String, 
    status: String, 
    progress: i32, 
    local_path: Option<String>
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET download_status = ?1, download_progress = ?2, local_path = ?3 WHERE id = ?4",
        (status, progress, local_path, video_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// Helpers for checking system binaries
fn check_ytdlp_ready() -> bool {
    match Command::new_sidecar("yt-dlp") {
        Ok(cmd) => {
            match cmd.args(["--version"]).spawn() {
                Ok(_) => true,
                Err(_) => false,
            }
        }
        Err(_) => false,
    }
}

fn get_ffmpeg_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 1. Check local sandboxed app_data_dir
    if let Some(mut path) = app_handle.path_resolver().app_data_dir() {
        #[cfg(target_os = "windows")]
        path.push("ffmpeg.exe");
        #[cfg(not(target_os = "windows"))]
        path.push("ffmpeg");
        
        if path.exists() {
            return Some(path);
        }
    }

    // 2. Check system PATH
    if std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
    {
        return Some(std::path::PathBuf::from("ffmpeg"));
    }

    // 3. Check common macOS absolute locations (where Homebrew installs binaries)
    #[cfg(target_os = "macos")]
    {
        let common_paths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
        for path_str in common_paths {
            let path = std::path::PathBuf::from(path_str);
            if path.exists() {
                if std::process::Command::new(&path)
                    .arg("-version")
                    .output()
                    .map(|output| output.status.success())
                    .unwrap_or(false)
                {
                    return Some(path);
                }
            }
        }
    }

    None
}

fn check_ffmpeg_ready(app_handle: &tauri::AppHandle) -> bool {
    get_ffmpeg_path(app_handle).is_some()
}

#[tauri::command]
pub fn get_system_status(app_handle: tauri::AppHandle) -> Result<SystemStatus, String> {
    let ytdlp_ready = check_ytdlp_ready();
    let ffmpeg_ready = check_ffmpeg_ready(&app_handle);
    Ok(SystemStatus {
        ytdlp_ready,
        ffmpeg_ready,
    })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlaylistStats {
    pub playlist_id: String,
    pub total_videos: i32,
    pub completed_videos: i32,
    pub total_duration: i32,
    pub total_watched: i32,
    pub downloaded_videos: i32,
    pub completed_duration: i32,
}

#[tauri::command]
pub fn get_library_stats(pool: State<'_, DbPool>) -> Result<Vec<PlaylistStats>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT 
            playlist_id, 
            COUNT(id) as total_videos, 
            SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_videos,
            SUM(duration) as total_duration,
            SUM(watched_progress) as total_watched,
            SUM(CASE WHEN local_path IS NOT NULL THEN 1 ELSE 0 END) as downloaded_videos,
            SUM(CASE WHEN is_completed = 1 THEN COALESCE(duration, 0) ELSE 0 END) as completed_duration
         FROM videos 
         WHERE playlist_id IS NOT NULL
         GROUP BY playlist_id"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(PlaylistStats {
            playlist_id: row.get(0)?,
            total_videos: row.get(1)?,
            completed_videos: row.get(2)?,
            total_duration: row.get(3)?,
            total_watched: row.get(4)?,
            downloaded_videos: row.get(5)?,
            completed_duration: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchItem {
    pub id: String,
    pub title: String,
    pub item_type: String, // "folder" | "playlist" | "video"
    pub parent_folder_id: Option<String>,
    pub playlist_id: Option<String>,
    pub subtitle: String,
}

#[tauri::command]
pub fn search_library(pool: State<'_, DbPool>, query: String) -> Result<Vec<SearchItem>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let like_query = format!("%{}%", query);
    let mut results = Vec::new();

    // 1. Search Folders
    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, f.parent_id, p.name as parent_name
         FROM folders f
         LEFT JOIN folders p ON f.parent_id = p.id
         WHERE f.name LIKE ?1
         LIMIT 10"
    ).map_err(|e| e.to_string())?;
    
    let folder_rows = stmt.query_map([&like_query], |row| {
        let parent_name: Option<String> = row.get(3)?;
        let subtitle = match parent_name {
            Some(name) => format!("Folder in {}", name),
            None => "Folder in Library Root".to_string(),
        };
        Ok(SearchItem {
            id: row.get(0)?,
            title: row.get(1)?,
            item_type: "folder".to_string(),
            parent_folder_id: row.get(2)?,
            playlist_id: None,
            subtitle,
        })
    }).map_err(|e| e.to_string())?;
    
    for row in folder_rows {
        results.push(row.map_err(|e| e.to_string())?);
    }

    // 2. Search Playlists (Courses)
    let mut stmt = conn.prepare(
        "SELECT p.id, p.title, p.folder_id, f.name as folder_name
         FROM playlists p
         LEFT JOIN folders f ON p.folder_id = f.id
         WHERE p.title LIKE ?1 OR p.description LIKE ?1
         LIMIT 10"
    ).map_err(|e| e.to_string())?;
    
    let playlist_rows = stmt.query_map([&like_query], |row| {
        let folder_name: Option<String> = row.get(3)?;
        let subtitle = match folder_name {
            Some(name) => format!("Course in {}", name),
            None => "Course in Library Root".to_string(),
        };
        Ok(SearchItem {
            id: row.get(0)?,
            title: row.get(1)?,
            item_type: "playlist".to_string(),
            parent_folder_id: row.get(2)?,
            playlist_id: None,
            subtitle,
        })
    }).map_err(|e| e.to_string())?;
    
    for row in playlist_rows {
        results.push(row.map_err(|e| e.to_string())?);
    }

    // 3. Search Videos (Lectures)
    let mut stmt = conn.prepare(
        "SELECT v.id, v.title, v.playlist_id, p.title as playlist_title
         FROM videos v
         INNER JOIN playlists p ON v.playlist_id = p.id
         WHERE v.title LIKE ?1
         LIMIT 15"
    ).map_err(|e| e.to_string())?;
    
    let video_rows = stmt.query_map([&like_query], |row| {
        let playlist_title: String = row.get(3)?;
        Ok(SearchItem {
            id: row.get(0)?,
            title: row.get(1)?,
            item_type: "video".to_string(),
            parent_folder_id: None,
            playlist_id: Some(row.get(2)?),
            subtitle: format!("Video in {}", playlist_title),
        })
    }).map_err(|e| e.to_string())?;
    
    for row in video_rows {
        results.push(row.map_err(|e| e.to_string())?);
    }

    Ok(results)
}


fn perform_ffmpeg_download(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("No app data directory")?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let url = if cfg!(target_os = "windows") {
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    } else {
        "https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.zip"
    };
    
    let response = reqwest::blocking::get(url).map_err(|e| format!("Failed to download ffmpeg: {}", e))?;
    let bytes = response.bytes().map_err(|e| format!("Failed to read response bytes: {}", e))?;
    
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip archive: {}", e))?;
    
    let mut ffmpeg_found = false;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let file_name = file.name();
        
        let is_ffmpeg = if cfg!(target_os = "windows") {
            file_name.ends_with("ffmpeg.exe")
        } else {
            file_name == "ffmpeg" || file_name.ends_with("/ffmpeg")
        };
        
        if is_ffmpeg {
            let mut dest_path = app_dir.clone();
            #[cfg(target_os = "windows")]
            dest_path.push("ffmpeg.exe");
            #[cfg(not(target_os = "windows"))]
            dest_path.push("ffmpeg");
            
            let mut outfile = File::create(&dest_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            
            #[cfg(not(target_os = "windows"))]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&dest_path).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&dest_path, perms).map_err(|e| e.to_string())?;
            }
            
            ffmpeg_found = true;
            break;
        }
    }
    
    if ffmpeg_found {
        Ok(())
    } else {
        Err("ffmpeg binary not found in zip archive".to_string())
    }
}

#[tauri::command]
pub fn download_ffmpeg(app_handle: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        let _ = app_handle.emit_all("ffmpeg-download-status", "downloading");
        
        match perform_ffmpeg_download(&app_handle) {
            Ok(_) => {
                let _ = app_handle.emit_all("ffmpeg-download-status", "success");
            }
            Err(e) => {
                let _ = app_handle.emit_all("ffmpeg-download-status", format!("failed: {}", e));
            }
        }
    });
    Ok(())
}

fn parse_progress(line: &str) -> Option<f32> {
    if line.contains("[download]") && line.contains('%') {
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts {
            if part.ends_with('%') {
                if let Ok(pct) = part.trim_end_matches('%').parse::<f32>() {
                    return Some(pct);
                }
            }
        }
    }
    None
}

async fn download_video_inner(
    app_handle: tauri::AppHandle, 
    pool: DbPool, 
    video_id: String, 
    url: String
) -> Result<(), String> {
    let active_downloads = app_handle.state::<ActiveDownloads>();
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("No app data directory")?;
    let downloads_dir = app_dir.join("downloads");
    if !downloads_dir.exists() {
        std::fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;
    }
    
    let output_path = downloads_dir.join(format!("{}.mp4", video_id));
    
    let mut args = vec![
        "-f".to_string(), 
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string(),
    ];

    if let Some(ffmpeg_path) = get_ffmpeg_path(&app_handle) {
        if ffmpeg_path.is_absolute() {
            if let Some(parent) = ffmpeg_path.parent() {
                if let Some(parent_str) = parent.to_str() {
                    args.push("--ffmpeg-location".to_string());
                    args.push(parent_str.to_string());
                }
            }
        }
    }

    args.push("-o".to_string());
    args.push(output_path.to_str().ok_or("Invalid output path")?.to_string());
    args.push(url);

    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE videos SET download_status = 'downloading', download_progress = 0 WHERE id = ?1",
            [&video_id],
        ).map_err(|e| e.to_string())?;
    }
    
    let _ = app_handle.emit_all("download-progress", serde_json::json!({
        "video_id": video_id,
        "progress": 0,
        "status": "downloading"
    }));
    
    let (mut rx, child) = Command::new_sidecar("yt-dlp")
        .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;
    
    // Insert active download process child handle
    {
        let mut map = active_downloads.map.lock().unwrap();
        map.insert(video_id.clone(), child);
    }
    
    let mut success = false;
    
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                if let Some(pct) = parse_progress(&line) {
                    let progress_val = pct as i32;
                    let _ = pool.get().map(|conn| {
                        let _ = conn.execute(
                            "UPDATE videos SET download_progress = ?1 WHERE id = ?2",
                            (progress_val, &video_id),
                        );
                    });
                    
                    let _ = app_handle.emit_all("download-progress", serde_json::json!({
                        "video_id": video_id,
                        "progress": progress_val,
                        "status": "downloading"
                    }));
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    success = true;
                }
            }
            _ => {}
        }
    }
    
    // Remove process from active downloads map
    {
        let mut map = active_downloads.map.lock().unwrap();
        map.remove(&video_id);
    }
    
    if success {
        let local_path_str = output_path.to_str().ok_or("Invalid local path")?;
        {
            let conn = pool.get().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE videos SET download_status = 'completed', download_progress = 100, local_path = ?1 WHERE id = ?2",
                (local_path_str, &video_id),
            ).map_err(|e| e.to_string())?;
        }
        let _ = app_handle.emit_all("download-progress", serde_json::json!({
            "video_id": video_id,
            "progress": 100,
            "status": "completed",
            "local_path": local_path_str
        }));
        Ok(())
    } else {
        {
            let conn = pool.get().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE videos SET download_status = 'failed' WHERE id = ?1",
                [&video_id],
            ).map_err(|e| e.to_string())?;
        }
        let _ = app_handle.emit_all("download-progress", serde_json::json!({
            "video_id": video_id,
            "progress": 0,
            "status": "failed"
        }));
        Err("yt-dlp failed to download video".to_string())
    }
}

#[tauri::command]
pub fn download_playlist(
    app_handle: tauri::AppHandle, 
    pool: State<'_, DbPool>, 
    active_downloads: State<'_, ActiveDownloads>,
    playlist_id: String
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();
    
    let conn = pool_clone.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, url, download_status FROM videos WHERE playlist_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&playlist_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;
    
    let mut videos_to_download = Vec::new();
    for row in rows {
        let (id, url, status) = row.map_err(|e| e.to_string())?;
        if status != "completed" {
            videos_to_download.push((id, url));
        }
    }
    
    // Mark playlist as active
    {
        let mut active = active_downloads.active_playlists.lock().unwrap();
        active.insert(playlist_id.clone());
    }
    
    let playlist_id_clone = playlist_id.clone();
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let active_downloads_state = app_handle_clone.state::<ActiveDownloads>();
        for (video_id, url) in videos_to_download {
            // Check if playlist download has been cancelled
            {
                let active = active_downloads_state.active_playlists.lock().unwrap();
                if !active.contains(&playlist_id_clone) {
                    break;
                }
            }
            let _ = download_video_inner(app_handle_clone.clone(), pool_clone.clone(), video_id, url).await;
        }
        
        // Remove from active playlists when done
        {
            let mut active = active_downloads_state.active_playlists.lock().unwrap();
            active.remove(&playlist_id_clone);
        }
    });
    
    Ok(())
}

#[tauri::command]
pub fn download_video(
    app_handle: tauri::AppHandle, 
    pool: State<'_, DbPool>, 
    _active_downloads: State<'_, ActiveDownloads>,
    video_id: String
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();
    
    let conn = pool_clone.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT url FROM videos WHERE id = ?1").map_err(|e| e.to_string())?;
    let url: String = stmt.query_row([&video_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    
    tauri::async_runtime::spawn(async move {
        let _ = download_video_inner(app_handle, pool_clone, video_id, url).await;
    });
    
    Ok(())
}

#[tauri::command]
pub fn cancel_download(
    app_handle: tauri::AppHandle,
    pool: State<'_, DbPool>,
    active_downloads: State<'_, ActiveDownloads>,
    video_id: String,
) -> Result<(), String> {
    // 1. Terminate the child process if running
    {
        let mut map = active_downloads.map.lock().unwrap();
        if let Some(child) = map.remove(&video_id) {
            let _ = child.kill();
        }
    }
    
    // 2. Reset database state
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET download_status = 'none', download_progress = 0 WHERE id = ?1",
        [&video_id],
    ).map_err(|e| e.to_string())?;
    
    // 3. Emit progress event
    let _ = app_handle.emit_all("download-progress", serde_json::json!({
        "video_id": video_id,
        "progress": 0,
        "status": "none"
    }));
    
    Ok(())
}

#[tauri::command]
pub fn cancel_playlist_download(
    app_handle: tauri::AppHandle,
    pool: State<'_, DbPool>,
    active_downloads: State<'_, ActiveDownloads>,
    playlist_id: String,
) -> Result<(), String> {
    // 1. Cancel the sequential playlist loop
    {
        let mut active = active_downloads.active_playlists.lock().unwrap();
        active.remove(&playlist_id);
    }
    
    // 2. Find all videos in this playlist
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id FROM videos WHERE playlist_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&playlist_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    
    let mut video_ids = Vec::new();
    for row in rows {
        video_ids.push(row.map_err(|e| e.to_string())?);
    }
    
    // 3. Kill active child processes and reset DB state for all videos
    {
        let mut map = active_downloads.map.lock().unwrap();
        for video_id in video_ids {
            if let Some(child) = map.remove(&video_id) {
                let _ = child.kill();
            }
            
            let _ = conn.execute(
                "UPDATE videos SET download_status = 'none', download_progress = 0 WHERE id = ?1 AND download_status IN ('downloading', 'pending')",
                [&video_id],
            );
            
            let _ = app_handle.emit_all("download-progress", serde_json::json!({
                "video_id": video_id,
                "progress": 0,
                "status": "none"
            }));
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn import_playlist(url: String) -> Result<String, String> {
    let (mut rx, _child) = Command::new_sidecar("yt-dlp")
        .map_err(|e| format!("Failed to resolve sidecar: {}", e))?
        .args(["--dump-single-json", "--flat-playlist", &url])
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;
    
    let mut output = String::new();
    
    tauri::async_runtime::block_on(async {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line) = event {
                output.push_str(&line);
                output.push('\n');
            }
        }
    });
    
    if output.is_empty() {
        Err("Failed to get metadata from yt-dlp. Make sure the URL is public and valid.".to_string())
    } else {
        Ok(output)
    }
}
