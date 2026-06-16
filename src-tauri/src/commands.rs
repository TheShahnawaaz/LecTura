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
    pub speed_limit: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub position: i32,
    pub created_at: String,
    pub emoji: Option<String>,
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
    #[serde(default)]
    pub study_time: Option<i32>,
    #[serde(default)]
    pub error_log: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Bookmark {
    pub id: i32,
    pub video_id: String,
    pub timestamp: i32,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub screenshot_path: Option<String>,
    pub is_doubt: Option<bool>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GlobalBookmark {
    pub bookmark: Bookmark,
    pub video_title: String,
    pub playlist_title: String,
    pub playlist_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemStatus {
    pub ytdlp_ready: bool,
    pub ffmpeg_ready: bool,
}

#[tauri::command]
pub fn get_folders(pool: State<'_, DbPool>) -> Result<Vec<Folder>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, parent_id, name, position, created_at, emoji FROM folders ORDER BY position ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            position: row.get(3)?,
            created_at: row.get(4)?,
            emoji: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn update_folder_emoji(pool: State<'_, DbPool>, folder_id: String, emoji: Option<String>) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE folders SET emoji = ?1 WHERE id = ?2",
        (emoji, &folder_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
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
        "SELECT id, playlist_id, title, duration, thumbnail_url, url, local_path, download_status, download_progress, watched_progress, is_completed, created_at,
                (SELECT COALESCE(SUM(duration_seconds), 0) FROM study_logs WHERE video_id = videos.id) as study_time,
                error_log
         FROM videos WHERE playlist_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([&playlist_id], |row| {
        let is_completed_val: i32 = row.get(10)?;
        let study_time_val: i32 = row.get(12)?;
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
            study_time: Some(study_time_val),
            error_log: row.get(13)?,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentStudyLog {
    pub id: i32,
    pub video_id: String,
    pub video_title: String,
    pub playlist_id: String,
    pub playlist_title: String,
    pub duration_seconds: i32,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HourlyActivity {
    pub hour: i32,
    pub duration_seconds: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VideoStudyDetail {
    pub video_id: String,
    pub video_title: String,
    pub playlist_id: String,
    pub playlist_title: String,
    pub duration_seconds: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DayStudyDetails {
    pub date: String,
    pub total_seconds: i32,
    pub hourly_activity: Vec<HourlyActivity>,
    pub video_details: Vec<VideoStudyDetail>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StudyStats {
    pub total_study_seconds: i32,
    pub total_video_covered_seconds: i32,
    pub completed_lectures_count: i32,
    pub daily_logs: HashMap<String, i32>,
    pub recent_logs: Vec<RecentStudyLog>,
    pub total_doubts_count: i32,
    pub total_bookmarks_count: i32,
}

#[tauri::command]
pub fn log_study_time(pool: State<'_, DbPool>, video_id: String, duration_seconds: i32) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO study_logs (video_id, duration_seconds) VALUES (?1, ?2)",
        (video_id, duration_seconds),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_study_stats(pool: State<'_, DbPool>) -> Result<StudyStats, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // 1. Total study seconds
    let total_study_seconds: i32 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM study_logs",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 2. Total video covered seconds (completed videos duration)
    let total_video_covered_seconds: i32 = conn.query_row(
        "SELECT COALESCE(SUM(duration), 0) FROM videos WHERE is_completed = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 3. Completed lectures count
    let completed_lectures_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM videos WHERE is_completed = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 4. Daily study logs
    let mut stmt = conn.prepare(
        "SELECT date(created_at, 'localtime') as day, SUM(duration_seconds) FROM study_logs GROUP BY day"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
    }).map_err(|e| e.to_string())?;

    let mut daily_logs = HashMap::new();
    for row in rows {
        let (day, seconds) = row.map_err(|e| e.to_string())?;
        daily_logs.insert(day, seconds);
    }

    // 5. Recent study logs (10 most recent)
    let mut stmt_logs = conn.prepare(
        "SELECT 
            l.id, l.video_id, v.title as video_title, 
            COALESCE(p.id, '') as playlist_id, 
            COALESCE(p.title, 'Unassigned Course') as playlist_title,
            l.duration_seconds, 
            datetime(l.created_at, 'localtime') as created_at
         FROM study_logs l
         JOIN videos v ON l.video_id = v.id
         LEFT JOIN playlists p ON v.playlist_id = p.id
         ORDER BY l.created_at DESC
         LIMIT 10"
    ).map_err(|e| e.to_string())?;
    
    let log_rows = stmt_logs.query_map([], |row| {
        Ok(RecentStudyLog {
            id: row.get(0)?,
            video_id: row.get(1)?,
            video_title: row.get(2)?,
            playlist_id: row.get(3)?,
            playlist_title: row.get(4)?,
            duration_seconds: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut recent_logs = Vec::new();
    for row in log_rows {
        recent_logs.push(row.map_err(|e| e.to_string())?);
    }

    // 6. Total bookmark/doubt counts
    let total_doubts_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM bookmarks WHERE is_doubt = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_bookmarks_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM bookmarks WHERE is_doubt = 0",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(StudyStats {
        total_study_seconds,
        total_video_covered_seconds,
        completed_lectures_count,
        daily_logs,
        recent_logs,
        total_doubts_count,
        total_bookmarks_count,
    })
}

#[tauri::command]
pub fn get_day_study_details(pool: State<'_, DbPool>, date_str: String) -> Result<DayStudyDetails, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // 1. Total seconds for that day
    let total_seconds: i32 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM study_logs WHERE date(created_at, 'localtime') = ?1",
        [&date_str],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 2. Hourly activity
    let mut stmt_hourly = conn.prepare(
        "SELECT CAST(strftime('%H', created_at, 'localtime') AS INTEGER) as hr, SUM(duration_seconds) 
         FROM study_logs 
         WHERE date(created_at, 'localtime') = ?1 
         GROUP BY hr"
    ).map_err(|e| e.to_string())?;

    let hourly_rows = stmt_hourly.query_map([&date_str], |row| {
        Ok(HourlyActivity {
            hour: row.get(0)?,
            duration_seconds: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut hourly_activity = Vec::new();
    for row in hourly_rows {
        hourly_activity.push(row.map_err(|e| e.to_string())?);
    }

    // 3. Video details
    let mut stmt_videos = conn.prepare(
        "SELECT 
            v.id, v.title, 
            COALESCE(p.id, '') as playlist_id, 
            COALESCE(p.title, 'Unassigned Course') as playlist_title, 
            SUM(l.duration_seconds) as total_seconds
         FROM study_logs l
         JOIN videos v ON l.video_id = v.id
         LEFT JOIN playlists p ON v.playlist_id = p.id
         WHERE date(l.created_at, 'localtime') = ?1
         GROUP BY v.id
         ORDER BY total_seconds DESC"
    ).map_err(|e| e.to_string())?;

    let video_rows = stmt_videos.query_map([&date_str], |row| {
        Ok(VideoStudyDetail {
            video_id: row.get(0)?,
            video_title: row.get(1)?,
            playlist_id: row.get(2)?,
            playlist_title: row.get(3)?,
            duration_seconds: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut video_details = Vec::new();
    for row in video_rows {
        video_details.push(row.map_err(|e| e.to_string())?);
    }

    Ok(DayStudyDetails {
        date: date_str,
        total_seconds,
        hourly_activity,
        video_details,
    })
}

#[tauri::command]
pub fn get_bookmarks(pool: State<'_, DbPool>, video_id: String) -> Result<Vec<Bookmark>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, video_id, timestamp, label, notes, screenshot_path, is_doubt, created_at FROM bookmarks WHERE video_id = ?1 ORDER BY timestamp ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&video_id], |row| {
        let is_doubt_val: Option<i32> = row.get(6)?;
        Ok(Bookmark {
            id: row.get(0)?,
            video_id: row.get(1)?,
            timestamp: row.get(2)?,
            label: row.get(3)?,
            notes: row.get(4)?,
            screenshot_path: row.get(5)?,
            is_doubt: Some(is_doubt_val.unwrap_or(0) != 0),
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn add_bookmark(
    pool: State<'_, DbPool>, 
    video_id: String, 
    timestamp: i32, 
    label: Option<String>,
    notes: Option<String>,
    screenshot_path: Option<String>,
    is_doubt: Option<bool>,
) -> Result<Bookmark, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let is_doubt_val = if is_doubt.unwrap_or(false) { 1 } else { 0 };
    conn.execute(
        "INSERT INTO bookmarks (video_id, timestamp, label, notes, screenshot_path, is_doubt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&video_id, &timestamp, &label, &notes, &screenshot_path, &is_doubt_val),
    ).map_err(|e| e.to_string())?;
    
    let last_id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, video_id, timestamp, label, notes, screenshot_path, is_doubt, created_at FROM bookmarks WHERE id = ?1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query_map([last_id], |row| {
        let db_is_doubt: Option<i32> = row.get(6)?;
        Ok(Bookmark {
            id: row.get(0)?,
            video_id: row.get(1)?,
            timestamp: row.get(2)?,
            label: row.get(3)?,
            notes: row.get(4)?,
            screenshot_path: row.get(5)?,
            is_doubt: Some(db_is_doubt.unwrap_or(0) != 0),
            created_at: row.get(7)?,
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
    
    // Optionally delete the screenshot file if it exists to clean up disk space
    if let Ok(mut stmt) = conn.prepare("SELECT screenshot_path FROM bookmarks WHERE id = ?1") {
        if let Ok(Some(path_str)) = stmt.query_row([id], |row| row.get::<_, Option<String>>(0)) {
            let p = std::path::PathBuf::from(path_str);
            if p.exists() {
                let _ = std::fs::remove_file(p);
            }
        }
    }

    conn.execute(
        "DELETE FROM bookmarks WHERE id = ?1",
        [id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_bookmark(
    pool: State<'_, DbPool>,
    id: i32,
    label: Option<String>,
    notes: Option<String>,
    is_doubt: Option<bool>,
    screenshot_path: Option<String>,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let is_doubt_val = if is_doubt.unwrap_or(false) { 1 } else { 0 };

    if let Some(ref path) = screenshot_path {
        // Optionally delete the old screenshot file if it exists and is different
        if let Ok(mut stmt) = conn.prepare("SELECT screenshot_path FROM bookmarks WHERE id = ?1") {
            if let Ok(Some(old_path)) = stmt.query_row([id], |row| row.get::<_, Option<String>>(0)) {
                if old_path != *path {
                    let p = std::path::PathBuf::from(old_path);
                    if p.exists() {
                        let _ = std::fs::remove_file(p);
                    }
                }
            }
        }

        conn.execute(
            "UPDATE bookmarks SET label = ?1, notes = ?2, is_doubt = ?3, screenshot_path = ?4 WHERE id = ?5",
            (&label, &notes, &is_doubt_val, &screenshot_path, &id),
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE bookmarks SET label = ?1, notes = ?2, is_doubt = ?3 WHERE id = ?4",
            (&label, &notes, &is_doubt_val, &id),
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_all_bookmarks(pool: State<'_, DbPool>) -> Result<Vec<GlobalBookmark>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("
        SELECT 
            b.id, b.video_id, b.timestamp, b.label, b.notes, b.screenshot_path, b.is_doubt, b.created_at,
            v.title as video_title,
            p.title as playlist_title,
            p.id as playlist_id
        FROM bookmarks b
        JOIN videos v ON b.video_id = v.id
        JOIN playlists p ON v.playlist_id = p.id
        ORDER BY b.created_at DESC
    ").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        let is_doubt_val: Option<i32> = row.get(6)?;
        let bookmark = Bookmark {
            id: row.get(0)?,
            video_id: row.get(1)?,
            timestamp: row.get(2)?,
            label: row.get(3)?,
            notes: row.get(4)?,
            screenshot_path: row.get(5)?,
            is_doubt: Some(is_doubt_val.unwrap_or(0) != 0),
            created_at: row.get(7)?,
        };
        Ok(GlobalBookmark {
            bookmark,
            video_title: row.get(8)?,
            playlist_title: row.get(9)?,
            playlist_id: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn save_screenshot(
    app_handle: tauri::AppHandle,
    video_id: String,
    timestamp: i32,
    base64_data: String,
) -> Result<String, String> {
    use std::fs;
    use base64::{Engine as _, engine::general_purpose};

    let mut data_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| "Could not resolve app data directory".to_string())?;
    
    data_dir.push("screenshots");
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }
    
    let clean_base64 = if base64_data.contains(",") {
        base64_data.split(',').nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };
    
    let bytes = general_purpose::STANDARD.decode(clean_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    // Detect PNG format from base64 string metadata
    let extension = if base64_data.contains("image/png") {
        "png"
    } else {
        "jpg"
    };
    // Use alphanumeric characters for video_id to prevent any directory traversal
    let clean_video_id: String = video_id.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
    let filename = format!("{}_{}_{}.{}", clean_video_id, timestamp, now, extension);
    data_dir.push(filename);
    
    fs::write(&data_dir, bytes).map_err(|e| e.to_string())?;
    
    let path_str = data_dir.to_str()
        .ok_or_else(|| "Invalid path string".to_string())?;
    Ok(path_str.to_string())
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
    #[serde(default)]
    pub total_study_time: Option<i32>,
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
            SUM(CASE WHEN is_completed = 1 THEN COALESCE(duration, 0) ELSE 0 END) as completed_duration,
            (SELECT COALESCE(SUM(duration_seconds), 0) FROM study_logs WHERE video_id IN (SELECT id FROM videos WHERE playlist_id = v.playlist_id)) as total_study_time
         FROM videos v
         WHERE playlist_id IS NOT NULL
         GROUP BY playlist_id"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        let study_time_val: i32 = row.get(7)?;
        Ok(PlaylistStats {
            playlist_id: row.get(0)?,
            total_videos: row.get(1)?,
            completed_videos: row.get(2)?,
            total_duration: row.get(3)?,
            total_watched: row.get(4)?,
            downloaded_videos: row.get(5)?,
            completed_duration: row.get(6)?,
            total_study_time: Some(study_time_val),
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
    pub emoji: Option<String>,
}

#[tauri::command]
pub fn search_library(pool: State<'_, DbPool>, query: String) -> Result<Vec<SearchItem>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let like_query = format!("%{}%", query);
    let mut results = Vec::new();

    // 1. Search Folders
    let mut stmt = conn.prepare(
        "SELECT f.id, f.name, f.parent_id, p.name as parent_name, f.emoji
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
            emoji: row.get(4)?,
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
            emoji: None,
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
            emoji: None,
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

fn parse_progress(line: &str) -> Option<(f32, String, String, String)> {
    if !line.contains("[download]") || !line.contains('%') {
        return None;
    }
    
    let parts: Vec<&str> = line.split_whitespace().collect();
    let mut percent: f32 = 0.0;
    let mut size = String::new();
    let mut speed = String::new();
    let mut eta = String::new();
    
    for (i, &part) in parts.iter().enumerate() {
        if part.ends_with('%') {
            percent = part.trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
            
            if i + 2 < parts.len() && parts[i + 1] == "of" {
                size = parts[i + 2].to_string();
            }
            if i + 4 < parts.len() && parts[i + 3] == "at" {
                speed = parts[i + 4].to_string();
            }
            
            if let Some(eta_idx) = parts.iter().position(|&x| x == "ETA") {
                if eta_idx + 1 < parts.len() {
                    eta = parts[eta_idx + 1].to_string();
                }
            }
            break;
        }
    }
    
    if percent > 0.0 || line.contains("100%") {
        Some((percent, size, speed, eta))
    } else {
        None
    }
}

async fn download_video_inner(
    app_handle: tauri::AppHandle, 
    pool: DbPool, 
    video_id: String, 
    url: String,
    speed_limit: Option<String>,
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
        "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best".to_string(),
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

    if let Some(ref limit) = speed_limit {
        if limit != "unlimited" && !limit.is_empty() {
            args.push("--limit-rate".to_string());
            args.push(limit.clone());
        }
    }

    args.push("-o".to_string());
    args.push(output_path.to_str().ok_or("Invalid output path")?.to_string());
    args.push(url);

    let video_title = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT title FROM videos WHERE id = ?1",
            [&video_id],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| "Video".to_string())
    };

    {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE videos SET download_status = 'downloading', download_progress = 0, error_log = NULL WHERE id = ?1",
            [&video_id],
        ).map_err(|e| e.to_string())?;
    }
    
    let _ = app_handle.emit_all("download-progress", serde_json::json!({
        "video_id": video_id,
        "progress": 0,
        "status": "downloading",
        "speed": "",
        "eta": "",
        "size": ""
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
    let mut log_lines = Vec::<String>::new();
    
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                if log_lines.len() >= 100 {
                    log_lines.remove(0);
                }
                log_lines.push(format!("[OUT] {}", line));

                if let Some((pct, size, speed, eta)) = parse_progress(&line) {
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
                        "status": "downloading",
                        "speed": speed,
                        "eta": eta,
                        "size": size
                    }));
                }
            }
            CommandEvent::Stderr(line) => {
                if log_lines.len() >= 100 {
                    log_lines.remove(0);
                }
                log_lines.push(format!("[ERR] {}", line));
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    success = true;
                } else {
                    if log_lines.len() >= 100 {
                        log_lines.remove(0);
                    }
                    log_lines.push(format!("[EXIT] Terminated with code {:?}", payload.code));
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
                "UPDATE videos SET download_status = 'completed', download_progress = 100, local_path = ?1, error_log = NULL WHERE id = ?2",
                (local_path_str, &video_id),
            ).map_err(|e| e.to_string())?;
        }
        let _ = app_handle.emit_all("download-progress", serde_json::json!({
            "video_id": video_id,
            "progress": 100,
            "status": "completed",
            "local_path": local_path_str,
            "video_title": video_title
        }));

        Ok(())
    } else {
        let full_error_log = log_lines.join("\n");
        {
            let conn = pool.get().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE videos SET download_status = 'failed', error_log = ?1 WHERE id = ?2",
                (&full_error_log, &video_id),
            ).map_err(|e| e.to_string())?;
        }
        let _ = app_handle.emit_all("download-progress", serde_json::json!({
            "video_id": video_id,
            "progress": 0,
            "status": "failed",
            "error_log": full_error_log,
            "video_title": video_title
        }));

        Err("yt-dlp failed to download video".to_string())
    }
}

pub fn trigger_queue_processing(app_handle: tauri::AppHandle, pool: DbPool) {
    let active_downloads = app_handle.state::<ActiveDownloads>();
    
    // Count currently executing downloads (status is 'downloading')
    let active_count = {
        let map = active_downloads.map.lock().unwrap();
        map.len()
    };
    
    if active_count >= 2 {
        return;
    }
    
    let slots_available = 2 - active_count;
    if slots_available <= 0 {
        return;
    }
    
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return,
    };
    
    let mut stmt = match conn.prepare(
        "SELECT id, url FROM videos WHERE download_status = 'pending' ORDER BY created_at ASC LIMIT ?1"
    ) {
        Ok(s) => s,
        Err(_) => return,
    };
    
    let rows = match stmt.query_map([slots_available], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(r) => r,
        Err(_) => return,
    };
    
    let mut pending_videos = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            pending_videos.push(item);
        }
    }
    
    for (video_id, url) in pending_videos {
        // Set to downloading immediately
        if conn.execute(
            "UPDATE videos SET download_status = 'downloading', download_progress = 0, error_log = NULL WHERE id = ?1",
            [&video_id],
        ).is_err() {
            continue;
        }
        
        let app_handle_clone = app_handle.clone();
        let pool_clone = pool.clone();
        let video_id_clone = video_id.clone();
        let url_clone = url.clone();
        
        tauri::async_runtime::spawn(async move {
            let speed_limit = {
                let state = app_handle_clone.state::<ActiveDownloads>();
                let limit = state.speed_limit.lock().unwrap();
                limit.clone()
            };
            
            let _ = download_video_inner(
                app_handle_clone.clone(),
                pool_clone.clone(),
                video_id_clone,
                url_clone,
                speed_limit,
            ).await;
            
            // Recurse to run next pending
            trigger_queue_processing(app_handle_clone, pool_clone);
        });
    }
}

#[tauri::command]
pub fn download_playlist(
    app_handle: tauri::AppHandle, 
    pool: State<'_, DbPool>, 
    _active_downloads: State<'_, ActiveDownloads>,
    playlist_id: String
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();
    
    let conn = pool_clone.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET download_status = 'pending', download_progress = 0, error_log = NULL 
         WHERE playlist_id = ?1 AND download_status != 'completed'",
        [&playlist_id],
    ).map_err(|e| e.to_string())?;
    
    // Find all videos that were set to pending so we can broadcast their initial status to frontend
    let mut stmt = conn.prepare("SELECT id FROM videos WHERE playlist_id = ?1 AND download_status = 'pending'").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&playlist_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for row in rows {
        if let Ok(video_id) = row {
            let _ = app_handle.emit_all("download-progress", serde_json::json!({
                "video_id": video_id,
                "progress": 0,
                "status": "pending"
            }));
        }
    }

    trigger_queue_processing(app_handle, pool_clone);
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
    conn.execute(
        "UPDATE videos SET download_status = 'pending', download_progress = 0, error_log = NULL WHERE id = ?1",
        [&video_id],
    ).map_err(|e| e.to_string())?;
    
    let _ = app_handle.emit_all("download-progress", serde_json::json!({
        "video_id": video_id,
        "progress": 0,
        "status": "pending"
    }));

    trigger_queue_processing(app_handle, pool_clone);
    Ok(())
}

#[tauri::command]
pub fn cancel_download(
    app_handle: tauri::AppHandle,
    pool: State<'_, DbPool>,
    active_downloads: State<'_, ActiveDownloads>,
    video_id: String,
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();

    // 1. Terminate the child process if running
    {
        let mut map = active_downloads.map.lock().unwrap();
        if let Some(child) = map.remove(&video_id) {
            let _ = child.kill();
        }
    }
    
    // 2. Reset database state
    let conn = pool_clone.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET download_status = 'none', download_progress = 0, error_log = NULL WHERE id = ?1",
        [&video_id],
    ).map_err(|e| e.to_string())?;
    
    // 3. Emit progress event
    let _ = app_handle.emit_all("download-progress", serde_json::json!({
        "video_id": video_id,
        "progress": 0,
        "status": "none"
    }));

    // Trigger next queue item
    trigger_queue_processing(app_handle, pool_clone);
    Ok(())
}

#[tauri::command]
pub fn cancel_playlist_download(
    app_handle: tauri::AppHandle,
    pool: State<'_, DbPool>,
    active_downloads: State<'_, ActiveDownloads>,
    playlist_id: String,
) -> Result<(), String> {
    let pool_clone = pool.inner().clone();

    // 1. Find all videos in this playlist
    let conn = pool_clone.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id FROM videos WHERE playlist_id = ?1").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&playlist_id], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    
    let mut video_ids = Vec::new();
    for row in rows {
        video_ids.push(row.map_err(|e| e.to_string())?);
    }
    
    // 2. Kill active child processes and reset DB state for all videos
    {
        let mut map = active_downloads.map.lock().unwrap();
        for video_id in video_ids {
            if let Some(child) = map.remove(&video_id) {
                let _ = child.kill();
            }
            
            let _ = conn.execute(
                "UPDATE videos SET download_status = 'none', download_progress = 0, error_log = NULL 
                 WHERE id = ?1 AND download_status IN ('downloading', 'pending')",
                [&video_id],
            );
            
            let _ = app_handle.emit_all("download-progress", serde_json::json!({
                "video_id": video_id,
                "progress": 0,
                "status": "none"
            }));
        }
    }
    
    // Trigger next queue items
    trigger_queue_processing(app_handle, pool_clone);
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

#[tauri::command]
pub fn get_download_queue(pool: State<'_, DbPool>) -> Result<Vec<Video>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, playlist_id, title, duration, thumbnail_url, url, local_path, download_status, download_progress, watched_progress, is_completed, created_at,
                (SELECT COALESCE(SUM(duration_seconds), 0) FROM study_logs WHERE video_id = videos.id) as study_time,
                error_log
         FROM videos 
         WHERE download_status IN ('pending', 'downloading', 'failed')
         ORDER BY CASE download_status 
             WHEN 'downloading' THEN 1 
             WHEN 'pending' THEN 2 
             WHEN 'failed' THEN 3 
             ELSE 4 END, created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        let is_completed_val: i32 = row.get(10)?;
        let study_time_val: i32 = row.get(12)?;
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
            study_time: Some(study_time_val),
            error_log: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn clear_failed_download(pool: State<'_, DbPool>, video_id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET download_status = 'none', download_progress = 0, error_log = NULL WHERE id = ?1",
        [&video_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_download_speed_limit(active_downloads: State<'_, ActiveDownloads>, limit: Option<String>) -> Result<(), String> {
    let mut limit_val = active_downloads.speed_limit.lock().unwrap();
    *limit_val = limit;
    Ok(())
}

#[tauri::command]
pub fn extract_video_frame(
    app_handle: tauri::AppHandle,
    local_path: String,
    timestamp_secs: i32,
) -> Result<String, String> {
    use std::fs;
    use std::process::Command;
    use base64::{Engine as _, engine::general_purpose};

    // 1. Get FFMPEG path
    let ffmpeg_path = get_ffmpeg_path(&app_handle)
        .ok_or_else(|| "FFmpeg binary not found. Please install or download it in Settings.".to_string())?;

    // 2. Resolve temporary directory for screenshot extraction
    let mut temp_dir = app_handle.path_resolver().app_data_dir()
        .ok_or_else(|| "Could not resolve app data directory".to_string())?;
    temp_dir.push("screenshots");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    
    // Use .png extension to get a lossless frame
    let temp_filename = format!("temp_frame_{}_{}.png", timestamp_secs, now);
    let temp_file_path = temp_dir.join(&temp_filename);

    // 3. Format timestamp to hh:mm:ss for ffmpeg seek
    let hours = timestamp_secs / 3600;
    let minutes = (timestamp_secs % 3600) / 60;
    let seconds = timestamp_secs % 60;
    let formatted_time = format!("{:02}:{:02}:{:02}", hours, minutes, seconds);

    // 4. Run ffmpeg command to extract a single frame losslessly as PNG
    let output = Command::new(&ffmpeg_path)
        .arg("-ss")
        .arg(&formatted_time)
        .arg("-i")
        .arg(&local_path)
        .arg("-vframes")
        .arg("1")
        .arg("-y")
        .arg(&temp_file_path)
        .output()
        .map_err(|e| format!("Failed to run FFmpeg process: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg failed to extract frame: {}", stderr));
    }

    // 5. Read the temp image file, encode to base64, and delete the temp file
    if !temp_file_path.exists() {
        return Err("FFmpeg completed but target image file was not created.".to_string());
    }

    let bytes = fs::read(&temp_file_path)
        .map_err(|e| format!("Failed to read extracted frame file: {}", e))?;
    
    // Delete the temp file to keep directories clean
    let _ = fs::remove_file(&temp_file_path);

    let base64_str = general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:image/png;base64,{}", base64_str);

    Ok(data_url)
}

#[tauri::command]
pub fn get_youtube_thumbnail_base64(video_id: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};

    let maxres_url = format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id);
    let hq_url = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", video_id);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&maxres_url).send();
    
    let bytes = match response {
        Ok(res) if res.status().is_success() => {
            let bytes_vec = res.bytes().map_err(|e| e.to_string())?.to_vec();
            if bytes_vec.len() < 3000 {
                // Fetch fallback hqdefault if maxresdefault is the 120x90 placeholder
                let res_fallback = client.get(&hq_url).send()
                    .map_err(|e| format!("Failed to fetch fallback YouTube thumbnail: {}", e))?;
                if res_fallback.status().is_success() {
                    res_fallback.bytes().map_err(|e| e.to_string())?.to_vec()
                } else {
                    bytes_vec
                }
            } else {
                bytes_vec
            }
        }
        _ => {
            // Fetch fallback
            let res_fallback = client.get(&hq_url).send()
                .map_err(|e| format!("Failed to fetch fallback YouTube thumbnail: {}", e))?;
            if res_fallback.status().is_success() {
                res_fallback.bytes().map_err(|e| e.to_string())?.to_vec()
            } else {
                return Err("Failed to download YouTube thumbnail".to_string());
            }
        }
    };

    let base64_str = general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:image/jpeg;base64,{}", base64_str);
    Ok(data_url)
}

#[tauri::command]
pub fn open_app_data_folder(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("No app data directory")?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let db_path = app_dir.join("lectura.db");
        if db_path.exists() {
            Command::new("open")
                .args(&["-R", db_path.to_str().unwrap()])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .args(&["-R", app_dir.to_str().unwrap()])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(&["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args(&["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let parent = path_buf.parent().ok_or("No parent directory")?.to_string_lossy().to_string();
        Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn verify_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn delete_video_file(pool: State<'_, DbPool>, video_id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    // 1. Get the local path
    let local_path: Option<String> = conn.query_row(
        "SELECT local_path FROM videos WHERE id = ?1",
        [&video_id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // 2. Delete file if it exists
    if let Some(path) = local_path {
        if !path.is_empty() {
            let path_buf = std::path::Path::new(&path);
            if path_buf.exists() {
                let _ = std::fs::remove_file(path_buf);
            }
        }
    }

    // 3. Reset database record
    conn.execute(
        "UPDATE videos SET download_status = 'none', download_progress = 0, local_path = NULL WHERE id = ?1",
        [&video_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OrphanFile {
    pub file_name: String,
    pub file_path: String,
    pub file_size_bytes: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MissingFile {
    pub video_id: String,
    pub video_title: String,
    pub playlist_id: Option<String>,
    pub expected_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HealthyFile {
    pub video_id: String,
    pub video_title: String,
    pub playlist_id: Option<String>,
    pub file_path: String,
    pub file_size_bytes: u64,
}

fn dir_size(path: &std::path::Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                total += dir_size(&entry.path());
            }
        }
    }
    total
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StorageReport {
    pub orphaned_files: Vec<OrphanFile>,
    pub missing_files: Vec<MissingFile>,
    pub healthy_files: Vec<HealthyFile>,
    pub total_orphaned_size_bytes: u64,
    pub total_healthy_size_bytes: u64,
    pub db_file_size_bytes: u64,
    pub app_dir_size_bytes: u64,
    pub ffmpeg_ready: bool,
    pub ytdlp_ready: bool,
}

#[tauri::command]
pub fn scan_storage(app_handle: tauri::AppHandle, pool: State<'_, DbPool>) -> Result<StorageReport, String> {
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("No app data directory")?;
    let downloads_dir = app_dir.join("downloads");
    
    // 1. Fetch all videos with download_status = 'completed' or local_path is not null from DB
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, title, local_path, playlist_id FROM videos WHERE download_status = 'completed' OR local_path IS NOT NULL"
    ).map_err(|e| e.to_string())?;
    
    struct DbVideo {
        id: String,
        title: String,
        local_path: Option<String>,
        playlist_id: Option<String>,
    }
    
    let db_videos_iter = stmt.query_map([], |row| {
        Ok(DbVideo {
            id: row.get(0)?,
            title: row.get(1)?,
            local_path: row.get(2)?,
            playlist_id: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut db_videos = Vec::new();
    for v in db_videos_iter {
        if let Ok(video) = v {
            db_videos.push(video);
        }
    }
    
    // 2. Scan downloads directory on disk
    let mut files_on_disk = Vec::new();
    let mut total_orphaned_size_bytes = 0;
    let mut total_healthy_size_bytes = 0;
    
    if downloads_dir.exists() && downloads_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&downloads_dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        // Ignore hidden files
                        if !file_name.starts_with('.') {
                            let metadata = entry.metadata().ok();
                            let file_size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
                            let file_path = path.to_string_lossy().to_string();
                            files_on_disk.push((file_name, file_path, file_size_bytes));
                        }
                    }
                }
            }
        }
    }
    
    // 3. Find orphaned files (on disk, but not linked in DB)
    let mut orphaned_files = Vec::new();
    for (file_name, file_path, file_size_bytes) in &files_on_disk {
        let is_linked = db_videos.iter().any(|v| {
            if let Some(ref l_path) = v.local_path {
                l_path == file_path || std::path::Path::new(l_path) == std::path::Path::new(file_path)
            } else {
                false
            }
        });
        
        if !is_linked {
            orphaned_files.push(OrphanFile {
                file_name: file_name.clone(),
                file_path: file_path.clone(),
                file_size_bytes: *file_size_bytes,
            });
            total_orphaned_size_bytes += file_size_bytes;
        }
    }
    
    // 4. Find missing files and healthy files
    let mut missing_files = Vec::new();
    let mut healthy_files = Vec::new();
    for v in &db_videos {
        if let Some(ref l_path) = v.local_path {
            let path_buf = std::path::Path::new(l_path);
            if !path_buf.exists() {
                missing_files.push(MissingFile {
                    video_id: v.id.clone(),
                    video_title: v.title.clone(),
                    playlist_id: v.playlist_id.clone(),
                    expected_path: l_path.clone(),
                });
            } else {
                let file_size_bytes = path_buf.metadata().ok().map(|m| m.len()).unwrap_or(0);
                total_healthy_size_bytes += file_size_bytes;
                healthy_files.push(HealthyFile {
                    video_id: v.id.clone(),
                    video_title: v.title.clone(),
                    playlist_id: v.playlist_id.clone(),
                    file_path: l_path.clone(),
                    file_size_bytes,
                });
            }
        } else {
            missing_files.push(MissingFile {
                video_id: v.id.clone(),
                video_title: v.title.clone(),
                playlist_id: v.playlist_id.clone(),
                expected_path: String::from("No path stored"),
            });
        }
    }
    
    // 5. Gather additional details
    let db_path = app_dir.join("lectura.db");
    let db_file_size_bytes = db_path.metadata().map(|m| m.len()).unwrap_or(0);
    let app_dir_size_bytes = dir_size(&app_dir);
    let ytdlp_ready = check_ytdlp_ready();
    let ffmpeg_ready = check_ffmpeg_ready(&app_handle);

    Ok(StorageReport {
        orphaned_files,
        missing_files,
        healthy_files,
        total_orphaned_size_bytes,
        total_healthy_size_bytes,
        db_file_size_bytes,
        app_dir_size_bytes,
        ffmpeg_ready,
        ytdlp_ready,
    })
}

#[tauri::command]
pub fn clean_storage(
    pool: State<'_, DbPool>,
    delete_orphans: Vec<String>,
    heal_missing_ids: Vec<String>,
) -> Result<(), String> {
    let mut conn = pool.get().map_err(|e| e.to_string())?;

    // 1. Delete orphan files
    for path_str in delete_orphans {
        let path = std::path::Path::new(&path_str);
        if path.exists() && path.is_file() {
            let _ = std::fs::remove_file(path);
        }
    }

    // 2. Heal missing records in DB
    if !heal_missing_ids.is_empty() {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for video_id in heal_missing_ids {
            tx.execute(
                "UPDATE videos SET download_status = 'none', download_progress = 0, local_path = NULL WHERE id = ?1",
                [&video_id],
            ).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(())
}
