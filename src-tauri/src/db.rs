use rusqlite::Connection;
use std::path::PathBuf;
use r2d2_sqlite::SqliteConnectionManager;
use r2d2::Pool;

pub type DbPool = Pool<SqliteConnectionManager>;

const MIGRATIONS: &[&str] = &[
    // Version 1: Initial schema setup
    r#"
    CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        folder_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        playlist_id TEXT,
        title TEXT NOT NULL,
        duration INTEGER NOT NULL,
        thumbnail_url TEXT,
        url TEXT NOT NULL,
        local_path TEXT,
        download_status TEXT DEFAULT 'none',
        download_progress INTEGER DEFAULT 0,
        watched_progress INTEGER DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        label TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    "#,
    // Version 2: Drop the legacy notes table if it exists
    r#"
    DROP TABLE IF EXISTS notes;
    "#,
    // Version 3: Add emoji column to folders table
    r#"
    ALTER TABLE folders ADD COLUMN emoji TEXT;
    "#,
    // Version 4: Add study_logs table for tracking active study sessions
    r#"
    CREATE TABLE IF NOT EXISTS study_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
    "#,
    // Version 5: Create indexes for foreign keys and query performance
    r#"
    CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_folder_id ON playlists (folder_id);
    CREATE INDEX IF NOT EXISTS idx_videos_playlist_id ON videos (playlist_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_video_id ON bookmarks (video_id);
    CREATE INDEX IF NOT EXISTS idx_study_logs_video_id ON study_logs (video_id);
    CREATE INDEX IF NOT EXISTS idx_study_logs_created_at ON study_logs (created_at);
    "#,
];

pub fn init_db(mut path: PathBuf) -> Result<DbPool, Box<dyn std::error::Error>> {
    // Ensure parent directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path)?;
    }
    
    path.push("lectura.db");
    
    let manager = SqliteConnectionManager::file(path)
        .with_init(|conn| conn.execute_batch("PRAGMA foreign_keys = ON;"));
    
    let pool = Pool::new(manager)?;
    
    // Run migrations using a connection from the pool
    let mut conn = pool.get()?;
    
    run_migrations(&mut conn)?;
    
    Ok(pool)
}

fn run_migrations(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let mut current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    
    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let migration_version = (i + 1) as i32;
        if current_version < migration_version {
            let tx = conn.transaction()?;
            tx.execute_batch(migration)?;
            tx.pragma_update(None, "user_version", migration_version)?;
            tx.commit()?;
            current_version = migration_version;
            println!("Database migrated to version {}", migration_version);
        }
    }
    Ok(())
}
