use tauri::State;
use crate::db::DbPool;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Folder {
    pub id: String,
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
pub struct Note {
    pub id: i32,
    pub video_id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i32,
    pub video_id: String,
    pub timestamp: i32,
    pub label: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_folders(pool: State<'_, DbPool>) -> Result<Vec<Folder>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, position, created_at FROM folders ORDER BY position ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            position: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_folder(pool: State<'_, DbPool>, id: String, name: String, position: i32) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO folders (id, name, position) VALUES (?1, ?2, ?3)",
        (&id, &name, &position),
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
pub fn save_note(pool: State<'_, DbPool>, video_id: String, content: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO notes (video_id, content, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
        (&video_id, &content),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_note(pool: State<'_, DbPool>, video_id: String) -> Result<Option<Note>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, video_id, content, updated_at FROM notes WHERE video_id = ?1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query_map([&video_id], |row| {
        Ok(Note {
            id: row.get(0)?,
            video_id: row.get(1)?,
            content: row.get(2)?,
            updated_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next() {
        let note = row.map_err(|e| e.to_string())?;
        Ok(Some(note))
    } else {
        Ok(None)
    }
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
