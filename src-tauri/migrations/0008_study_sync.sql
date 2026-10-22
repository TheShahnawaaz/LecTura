ALTER TABLE study_logs ADD COLUMN batch_id TEXT;
CREATE UNIQUE INDEX study_logs_batch ON study_logs(batch_id) WHERE batch_id IS NOT NULL;
CREATE TABLE sync_identity (
 id INTEGER PRIMARY KEY CHECK(id=1), installation_id TEXT NOT NULL, display_name TEXT NOT NULL,
 sharing_enabled INTEGER NOT NULL DEFAULT 1, sharing_epoch TEXT NOT NULL, enabled_at INTEGER NOT NULL,
 enrollment_state TEXT NOT NULL DEFAULT 'new', sharing_dirty INTEGER NOT NULL DEFAULT 0,
 notice_version INTEGER NOT NULL DEFAULT 1, local_sequence INTEGER NOT NULL DEFAULT 0,
 last_status_at INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER,
 failures INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, safe_error TEXT,
 batch_limit INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE local_study_batches (
 batch_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, batch_sequence INTEGER NOT NULL,
 video_id TEXT NOT NULL, course_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
 focused_ms INTEGER NOT NULL, capture_hash TEXT NOT NULL, UNIQUE(session_id,batch_sequence)
);
-- No video FK: deletion/re-import can never silently erase queued snapshots or receipts.
CREATE TABLE study_outbox (
 event_id TEXT PRIMARY KEY, sharing_epoch TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, attempted INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending',
 acknowledged_at INTEGER, reason TEXT
);
CREATE INDEX study_outbox_pending ON study_outbox(state,created_at);
