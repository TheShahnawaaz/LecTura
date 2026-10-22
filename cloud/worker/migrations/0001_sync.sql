PRAGMA foreign_keys = ON;
CREATE TABLE learners (
 learner_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE installations (
 installation_id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 learner_id TEXT REFERENCES learners(learner_id), state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','approved','rejected','revoked')), requested_at INTEGER NOT NULL,
 approved_at INTEGER, revoked_at INTEGER, sharing_enabled INTEGER NOT NULL DEFAULT 1,
 sharing_epoch TEXT NOT NULL, notice_version INTEGER NOT NULL, last_received_at INTEGER, last_sync_at INTEGER
);
CREATE INDEX installations_learner_requested ON installations(learner_id,requested_at DESC);
CREATE TABLE controls (
 id INTEGER PRIMARY KEY CHECK(id=1), window_expires_at INTEGER NOT NULL DEFAULT 0,
 pending_cap INTEGER NOT NULL DEFAULT 20, daily_budget INTEGER NOT NULL DEFAULT 50,
 budget_day TEXT NOT NULL DEFAULT '', registrations INTEGER NOT NULL DEFAULT 0,
 ingest_enabled INTEGER NOT NULL DEFAULT 1, event_day TEXT NOT NULL DEFAULT '',
 accepted_events INTEGER NOT NULL DEFAULT 0, daily_event_cap INTEGER NOT NULL DEFAULT 6000
);
INSERT INTO controls(id) VALUES(1);
CREATE TABLE event_receipts (
 installation_id TEXT NOT NULL REFERENCES installations(installation_id), event_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL, accepted_at INTEGER NOT NULL, payload TEXT,
 PRIMARY KEY(installation_id,event_id)
);
CREATE TABLE study_events (
 installation_id TEXT NOT NULL, event_id TEXT NOT NULL, learner_id TEXT NOT NULL REFERENCES learners(learner_id),
 session_id TEXT NOT NULL, batch_sequence INTEGER NOT NULL, course_id TEXT NOT NULL, course_title TEXT NOT NULL,
 video_id TEXT NOT NULL, video_title TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
 focused_ms INTEGER NOT NULL, received_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,event_id), UNIQUE(installation_id,session_id,batch_sequence)
);
CREATE INDEX study_learner_time ON study_events(learner_id,ended_at);
CREATE TABLE progress_snapshots (
 installation_id TEXT NOT NULL, learner_id TEXT NOT NULL, course_id TEXT NOT NULL, video_id TEXT NOT NULL,
 course_title TEXT NOT NULL, video_title TEXT NOT NULL, position REAL NOT NULL, completed INTEGER NOT NULL,
 observed_at INTEGER NOT NULL, local_sequence INTEGER NOT NULL,
 PRIMARY KEY(installation_id,course_id,video_id)
);
CREATE INDEX progress_learner_time ON progress_snapshots(learner_id,observed_at DESC);
CREATE TABLE daily_rollups (
 learner_id TEXT NOT NULL, reporting_day TEXT NOT NULL, course_id TEXT NOT NULL, video_id TEXT NOT NULL,
 course_title TEXT NOT NULL, video_title TEXT NOT NULL, focused_ms INTEGER NOT NULL,
 PRIMARY KEY(learner_id,reporting_day,course_id,video_id)
);
CREATE TABLE admin_audit (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL);
-- Enrollment checks and accounting execute inside the same INSERT transaction, including concurrency.
CREATE TRIGGER enrollment_guard BEFORE INSERT ON installations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM controls WHERE id=1 AND window_expires_at>NEW.requested_at
 AND (SELECT COUNT(*) FROM installations WHERE state='pending')<pending_cap
 AND CASE WHEN budget_day=date(NEW.requested_at/1000,'unixepoch') THEN registrations ELSE 0 END<daily_budget)
 THEN RAISE(ABORT,'enrollment_closed') END;
END;
CREATE TRIGGER enrollment_account AFTER INSERT ON installations BEGIN
 UPDATE controls SET registrations=CASE WHEN budget_day=date(NEW.requested_at/1000,'unixepoch') THEN registrations+1 ELSE 1 END,
 budget_day=date(NEW.requested_at/1000,'unixepoch') WHERE id=1;
END;
-- Exact replay can update only the same hash. It does not run insert side effects.
CREATE TRIGGER receipt_conflict BEFORE UPDATE ON event_receipts WHEN OLD.payload_hash<>NEW.payload_hash BEGIN
 SELECT RAISE(ABORT,'event_conflict');
END;
CREATE TRIGGER receipt_guard BEFORE INSERT ON event_receipts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM installations i, controls c WHERE c.id=1
 AND i.installation_id=NEW.installation_id AND i.state='approved' AND i.revoked_at IS NULL
 AND i.sharing_enabled=1 AND i.learner_id IS NOT NULL AND c.ingest_enabled=1
 AND i.sharing_epoch=json_extract(NEW.payload,'$.sharingEpoch')) THEN RAISE(ABORT,'inactive_installation') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM event_receipts WHERE installation_id=NEW.installation_id AND event_id=NEW.event_id) AND NOT EXISTS(SELECT 1 FROM controls WHERE id=1 AND
 CASE WHEN event_day=date(NEW.accepted_at/1000,'unixepoch') THEN accepted_events ELSE 0 END<daily_event_cap)
 THEN RAISE(ABORT,'event_budget') END;
END;
CREATE TRIGGER receipt_apply AFTER INSERT ON event_receipts BEGIN
 INSERT INTO study_events SELECT NEW.installation_id,NEW.event_id,i.learner_id,
 json_extract(NEW.payload,'$.sessionId'),json_extract(NEW.payload,'$.batchSequence'),
 json_extract(NEW.payload,'$.courseId'),json_extract(NEW.payload,'$.courseTitle'),
 json_extract(NEW.payload,'$.videoId'),json_extract(NEW.payload,'$.videoTitle'),
 json_extract(NEW.payload,'$.startedAt'),json_extract(NEW.payload,'$.endedAt'),
 json_extract(NEW.payload,'$.focusedMilliseconds'),NEW.accepted_at FROM installations i
 WHERE i.installation_id=NEW.installation_id AND json_extract(NEW.payload,'$.eventType')='study_batch';
 INSERT INTO daily_rollups SELECT i.learner_id,date(json_extract(NEW.payload,'$.startedAt')/1000,'unixepoch'),
 json_extract(NEW.payload,'$.courseId'),json_extract(NEW.payload,'$.videoId'),
 json_extract(NEW.payload,'$.courseTitle'),json_extract(NEW.payload,'$.videoTitle'),
 json_extract(NEW.payload,'$.focusedMilliseconds') FROM installations i WHERE i.installation_id=NEW.installation_id
 AND json_extract(NEW.payload,'$.eventType')='study_batch'
 ON CONFLICT(learner_id,reporting_day,course_id,video_id) DO UPDATE SET focused_ms=focused_ms+excluded.focused_ms,
 course_title=excluded.course_title,video_title=excluded.video_title;
 INSERT INTO progress_snapshots SELECT NEW.installation_id,i.learner_id,
 json_extract(NEW.payload,'$.courseId'),json_extract(NEW.payload,'$.videoId'),
 json_extract(NEW.payload,'$.courseTitle'),json_extract(NEW.payload,'$.videoTitle'),
 json_extract(NEW.payload,'$.playbackPositionSeconds'),json_extract(NEW.payload,'$.completed'),
 json_extract(NEW.payload,'$.capturedAt'),json_extract(NEW.payload,'$.localSequence')
 FROM installations i WHERE i.installation_id=NEW.installation_id
 ON CONFLICT(installation_id,course_id,video_id) DO UPDATE SET position=excluded.position,completed=excluded.completed,
 observed_at=excluded.observed_at,local_sequence=excluded.local_sequence,course_title=excluded.course_title,video_title=excluded.video_title
 WHERE excluded.local_sequence>progress_snapshots.local_sequence;
 UPDATE installations SET last_received_at=NEW.accepted_at,last_sync_at=NEW.accepted_at WHERE installation_id=NEW.installation_id;
 UPDATE controls SET accepted_events=CASE WHEN event_day=date(NEW.accepted_at/1000,'unixepoch') THEN accepted_events+1 ELSE 1 END,
 event_day=date(NEW.accepted_at/1000,'unixepoch') WHERE id=1;
 -- Keep the compact immutable hash receipt, with raw detail solely in its dedicated tables.
 UPDATE event_receipts SET payload=NULL WHERE installation_id=NEW.installation_id AND event_id=NEW.event_id;
END;
