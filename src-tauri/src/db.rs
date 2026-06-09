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
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
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
