//! Native-only study sharing. No secret, transport URL setter, or raw payload crosses IPC.
use crate::db::DbPool;
use chrono::Utc;
use rand::{rngs::OsRng, Rng, RngCore};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

pub fn now() -> i64 {
    Utc::now().timestamp_millis()
}
fn random_id() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn digest(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
fn valid_id(s: &str) -> bool {
    s.len() >= 16
        && s.len() <= 100
        && s.bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn safe_title(s: String) -> String {
    let mut title = String::new();
    let mut units = 0;
    for ch in s.chars().filter(|c| !c.is_control()) {
        if units + ch.len_utf16() > 300 {
            break;
        }
        units += ch.len_utf16();
        title.push(ch);
    }
    if title.is_empty() {
        "Untitled".into()
    } else {
        title
    }
}
// Empty defaults ensure this implementation cannot enroll or transmit to a real service.
fn origin() -> Option<String> {
    if option_env!("LECTURA_SYNC_RECIPIENT")?.trim().is_empty() {
        return None;
    }
    let raw = option_env!("LECTURA_SYNC_ORIGIN")?;
    let u = reqwest::Url::parse(raw).ok()?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return None;
    }
    Some(raw.trim_end_matches('/').to_owned())
}
fn recipient() -> String {
    option_env!("LECTURA_SYNC_RECIPIENT")
        .unwrap_or("Course administrator (service not configured)")
        .to_owned()
}
fn entry(id: &str) -> Result<keyring::Entry, String> {
    credential_entry("com.lectura.study-sync", id)
}
fn credential_entry(service: &str, id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service, id).map_err(|_| "secure_store_unavailable".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    needs_name: bool,
    sharing_enabled: bool,
    configured: bool,
    recipient: String,
    enrollment_state: String,
    pending: i64,
    blocked: i64,
    last_success_at: Option<i64>,
    safe_error: Option<String>,
}
#[tauri::command]
pub fn study_sync_status(pool: State<'_, DbPool>) -> Result<SyncStatus, String> {
    {
        let c = pool.get().map_err(|_| "database_unavailable")?;
        status(&c)
    }
}
fn status(c: &Connection) -> Result<SyncStatus, String> {
    let row=c.query_row("SELECT sharing_enabled,enrollment_state,last_success_at,safe_error FROM sync_identity WHERE id=1",[],|r|Ok((r.get::<_,bool>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<i64>>(2)?,r.get::<_,Option<String>>(3)?))).optional().map_err(|_|"database_unavailable")?;
    let pending = c
        .query_row(
            "SELECT COUNT(*) FROM study_outbox WHERE state='pending'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "database_unavailable")?;
    let blocked = c
        .query_row(
            "SELECT COUNT(*) FROM study_outbox WHERE state='blocked'",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "database_unavailable")?;
    let needs_name = row.is_none();
    let (enabled, state, last, error) = row.unwrap_or((true, "name_required".into(), None, None));
    Ok(SyncStatus {
        needs_name,
        sharing_enabled: enabled,
        configured: origin().is_some(),
        recipient: recipient(),
        enrollment_state: state,
        pending,
        blocked,
        last_success_at: last,
        safe_error: error,
    })
}
#[tauri::command]
pub fn study_sync_set_name(
    pool: State<'_, DbPool>,
    display_name: String,
    sharing_enabled: bool,
) -> Result<(), String> {
    let name = display_name.trim();
    if name.is_empty() || name.encode_utf16().count() > 80 || name.chars().any(char::is_control) {
        return Err("Enter a name of 1–80 characters".into());
    }
    let mut c = pool.get().map_err(|_| "database_unavailable")?;
    let tx = c.transaction().map_err(|_| "database_unavailable")?;
    if tx
        .query_row("SELECT COUNT(*) FROM sync_identity", [], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(|_| "database_unavailable")?
        > 0
    {
        return Ok(());
    }
    let id = random_id();
    let secret = random_id();
    // Persist the credential before any request. Failure leaves study local and enrollment uncreated.
    entry(&id)?
        .set_password(&secret)
        .map_err(|_| "secure_store_unavailable")?;
    tx.execute("INSERT INTO sync_identity(id,installation_id,display_name,sharing_epoch,sharing_enabled,enabled_at) VALUES(1,?1,?2,?3,?4,?5)",params![id,name,random_id(),sharing_enabled,now()]).map_err(|_|"database_unavailable")?;
    tx.commit().map_err(|_| "database_unavailable")?;
    Ok(())
}
#[tauri::command]
pub fn study_sync_set_enabled(
    pool: State<'_, DbPool>,
    coordinator: State<'_, Coordinator>,
    enabled: bool,
) -> Result<(), String> {
    let mut c = pool.get().map_err(|_| "database_unavailable")?;
    set_enabled(&mut c, enabled)?;
    drop(c);
    let _lease = coordinator.lease.lock().map_err(|_| "sync_unavailable")?;
    coordinator.wake();
    Ok(())
}
#[tauri::command]
pub fn study_sync_wake(coordinator: State<'_, Coordinator>) {
    coordinator.wake();
}

pub fn set_enabled(c: &mut Connection, enabled: bool) -> Result<(), String> {
    let tx = c.transaction().map_err(|_| "database_unavailable")?;
    let state: Option<(bool, String)> = tx
        .query_row(
            "SELECT sharing_enabled,enrollment_state FROM sync_identity WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|_| "database_unavailable")?;
    let Some((old, state)) = state else {
        return Err("name_required".into());
    };
    if old == enabled {
        return Ok(());
    }
    if enabled && (state == "revoked" || state == "rejected") {
        return Err("Administrator approval is required for this installation".into());
    }
    tx.execute("DELETE FROM study_outbox WHERE state!='acknowledged'", [])
        .map_err(|_| "database_unavailable")?;
    tx.execute("UPDATE sync_identity SET sharing_enabled=?1,sharing_epoch=?2,enabled_at=?3,sharing_dirty=1,next_attempt_at=0,failures=0,safe_error=NULL WHERE id=1",params![enabled,random_id(),now()]).map_err(|_|"database_unavailable")?;
    tx.commit().map_err(|_| "database_unavailable")?;
    Ok(())
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudyBatch {
    pub batch_id: String,
    pub session_id: String,
    pub batch_sequence: i64,
    pub course_id: String,
    pub video_id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub focused_milliseconds: i64,
    pub playback_position_seconds: f64,
    pub completed: bool,
}
fn snapshot(tx: &Transaction, course: &str, video: &str) -> Result<(String, String), String> {
    tx.query_row("SELECT p.title,v.title FROM videos v JOIN playlist_videos pv ON pv.video_id=v.id JOIN playlists p ON p.id=pv.playlist_id WHERE v.id=?1 AND p.id=?2",params![video,course],|r|Ok((r.get(0)?,r.get(1)?))).map(|(a,b)|(safe_title(a),safe_title(b))).map_err(|_|"video_context_unavailable".into())
}
fn enqueue(tx: &Transaction, mut payload: Value, at: i64) -> Result<(), String> {
    let identity:Option<(String,String,i64)>=tx.query_row("SELECT installation_id,sharing_epoch,enabled_at FROM sync_identity WHERE id=1 AND sharing_enabled=1 AND enrollment_state NOT IN ('revoked','rejected')",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|_|"database_unavailable")?;
    let Some((id, epoch, enabled_at)) = identity else {
        return Ok(());
    };
    if payload
        .get("startedAt")
        .and_then(Value::as_i64)
        .unwrap_or(at)
        < enabled_at
    {
        return Ok(());
    }
    tx.execute(
        "UPDATE sync_identity SET local_sequence=local_sequence+1 WHERE id=1",
        [],
    )
    .map_err(|_| "database_unavailable")?;
    let sequence: i64 = tx
        .query_row(
            "SELECT local_sequence FROM sync_identity WHERE id=1",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "database_unavailable")?;
    payload["schemaVersion"] = json!(1);
    payload["installationId"] = json!(id);
    payload["sharingEpoch"] = json!(epoch);
    payload["capturedAt"] = json!(at);
    payload["localSequence"] = json!(sequence);
    let serialized = serde_json::to_string(&payload).map_err(|_| "serialization_failed")?;
    let event_id = payload["eventId"].as_str().ok_or("invalid_event")?;
    tx.execute("INSERT INTO study_outbox(event_id,sharing_epoch,payload,payload_hash,created_at) VALUES(?1,?2,?3,?4,?5)",params![event_id,epoch,serialized,digest(&serialized),at]).map_err(|_|"outbox_write_failed")?;
    Ok(())
}
pub fn capture(c: &mut Connection, b: &StudyBatch) -> Result<bool, String> {
    if !valid_id(&b.batch_id)
        || !valid_id(&b.session_id)
        || b.batch_sequence < 0
        || b.batch_sequence > 9007199254740991
        || b.started_at < 0
        || b.ended_at < 0
        || b.course_id.is_empty()
        || b.course_id.len() > 200
        || b.video_id.len() > 200
        || b.focused_milliseconds < 1
        || b.focused_milliseconds > 60000
        || b.ended_at <= b.started_at
        || b.ended_at - b.started_at > 65000
        || b.focused_milliseconds > b.ended_at - b.started_at + 1000
        || b.started_at.div_euclid(86400000) != (b.ended_at - 1).div_euclid(86400000)
        || !b.playback_position_seconds.is_finite()
        || !(0.0..=604800.0).contains(&b.playback_position_seconds)
        || b.ended_at > now() + 300000
    {
        return Err("invalid_batch".into());
    }
    let tx = c.transaction().map_err(|_| "database_unavailable")?;
    let capture_hash = digest(&serde_json::to_string(b).map_err(|_| "invalid_batch")?);
    let existing: Option<String> = tx
        .query_row(
            "SELECT capture_hash FROM local_study_batches WHERE batch_id=?1",
            [&b.batch_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| "database_unavailable")?;
    if let Some(old) = existing {
        if old != capture_hash {
            return Err("batch_conflict".into());
        }
        return Ok(false);
    }
    let (course_title, video_title) = snapshot(&tx, &b.course_id, &b.video_id)?;
    tx.execute(
        "INSERT INTO local_study_batches VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            b.batch_id,
            b.session_id,
            b.batch_sequence,
            b.video_id,
            b.course_id,
            b.started_at,
            b.ended_at,
            b.focused_milliseconds,
            capture_hash
        ],
    )
    .map_err(|_| "batch_conflict")?;
    // Fractional seconds are retained; existing SUM-based stats continue to reflect focused wall time.
    tx.execute("INSERT INTO study_logs(video_id,duration_seconds,batch_id,created_at,course_id) VALUES(?1,?2,?3,datetime(?4/1000,'unixepoch'),?5)",params![b.video_id,b.focused_milliseconds as f64/1000.0,b.batch_id,b.started_at,b.course_id]).map_err(|_|"study_write_failed")?;
    enqueue(
        &tx,
        json!({"eventId":b.batch_id,"eventType":"study_batch","sessionId":b.session_id,"batchSequence":b.batch_sequence,
 "courseId":b.course_id,"courseTitle":course_title,"videoId":b.video_id,"videoTitle":video_title,
 "startedAt":b.started_at,"endedAt":b.ended_at,"focusedMilliseconds":b.focused_milliseconds,
 "playbackPositionSeconds":b.playback_position_seconds,"completed":b.completed}),
        b.ended_at,
    )?;
    tx.commit().map_err(|_| "database_unavailable")?;
    Ok(true)
}
pub fn progress(
    c: &mut Connection,
    video: &str,
    course: &str,
    seconds: i32,
    completed: bool,
) -> Result<(), String> {
    if !(0..=604800).contains(&seconds) {
        return Err("invalid_progress".into());
    }
    let tx = c.transaction().map_err(|_| "database_unavailable")?;
    let (course_title, video_title) = snapshot(&tx, course, video)?;
    tx.execute(
        "UPDATE videos SET watched_progress=?1,is_completed=?2 WHERE id=?3",
        params![seconds, completed, video],
    )
    .map_err(|_| "database_unavailable")?;
    // Only replace never-attempted snapshots; attempted immutable payloads keep their exact IDs.
    tx.execute("DELETE FROM study_outbox WHERE state='pending' AND attempted=0 AND json_extract(payload,'$.eventType')='progress_snapshot' AND json_extract(payload,'$.videoId')=?1 AND json_extract(payload,'$.courseId')=?2",params![video,course]).map_err(|_|"database_unavailable")?;
    enqueue(
        &tx,
        json!({"eventId":random_id(),"eventType":"progress_snapshot","courseId":course,"courseTitle":course_title,"videoId":video,"videoTitle":video_title,"playbackPositionSeconds":seconds,"completed":completed}),
        now(),
    )?;
    tx.commit().map_err(|_| "database_unavailable")?;
    Ok(())
}

#[derive(Clone, Default)]
pub struct Coordinator {
    lease: Arc<Mutex<()>>,
    wake_signal: Arc<(Mutex<bool>, Condvar)>,
    last_wake: Arc<Mutex<Option<Instant>>>,
}
#[derive(Debug)]
struct Identity {
    id: String,
    name: String,
    epoch: String,
    enabled: bool,
    state: String,
    dirty: bool,
    last_status: i64,
    next: i64,
    failures: u32,
    limit: i64,
}
fn identity(c: &Connection) -> Result<Option<Identity>, String> {
    c.query_row("SELECT installation_id,display_name,sharing_epoch,sharing_enabled,enrollment_state,sharing_dirty,last_status_at,next_attempt_at,failures,batch_limit FROM sync_identity WHERE id=1",[],|r|Ok(Identity{id:r.get(0)?,name:r.get(1)?,epoch:r.get(2)?,enabled:r.get(3)?,state:r.get(4)?,dirty:r.get(5)?,last_status:r.get(6)?,next:r.get(7)?,failures:r.get(8)?,limit:r.get(9)?})).optional().map_err(|_|"database_unavailable".into())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ack {
    schema_version: u32,
    acknowledged_event_ids: Vec<String>,
    server_received_at: i64,
}
pub fn apply_ack(c: &mut Connection, sent: &[String], raw: &Value) -> Result<usize, String> {
    let ack: Ack = serde_json::from_value(raw.clone()).map_err(|_| "invalid_ack")?;
    if ack.schema_version != 1
        || ack.server_received_at < 0
        || ack
            .acknowledged_event_ids
            .iter()
            .any(|id| !sent.contains(id))
    {
        return Err("invalid_ack".into());
    }
    let tx = c.transaction().map_err(|_| "database_unavailable")?;
    let mut count = 0;
    for id in ack.acknowledged_event_ids {
        count+=tx.execute("UPDATE study_outbox SET state='acknowledged',acknowledged_at=?1 WHERE event_id=?2 AND state='pending'",params![now(),id]).map_err(|_|"database_unavailable")?;
    }
    if count > 0 {
        tx.execute(
            "UPDATE sync_identity SET last_success_at=?1 WHERE id=1",
            [now()],
        )
        .map_err(|_| "database_unavailable")?;
    }
    tx.commit().map_err(|_| "database_unavailable")?;
    Ok(count)
}
fn retry(c: &Connection, code: &str, failures: u32, after: Option<i64>) -> Result<(), String> {
    let max = (30000_i64.saturating_mul(1_i64 << failures.min(7))).min(3600000);
    let delay = after
        .unwrap_or_else(|| rand::thread_rng().gen_range(1000..=max))
        .clamp(1000, 3600000);
    c.execute("UPDATE sync_identity SET failures=MIN(failures+1,32),next_attempt_at=?1,safe_error=?2 WHERE id=1",params![now()+delay,code]).map_err(|_|"database_unavailable")?;
    Ok(())
}
fn transport_builder() -> reqwest::blocking::ClientBuilder {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
}
impl Coordinator {
    pub fn wake(&self) {
        let mut last = self.last_wake.lock().unwrap_or_else(|e| e.into_inner());
        if last.is_some_and(|at| at.elapsed() < Duration::from_secs(30)) {
            return;
        }
        *last = Some(Instant::now());
        let (lock, signal) = &*self.wake_signal;
        *lock.lock().unwrap_or_else(|e| e.into_inner()) = true;
        signal.notify_one();
    }
    pub fn start(&self, pool: DbPool) {
        let worker = self.clone();
        std::thread::spawn(move || loop {
            if let Ok(_lease) = worker.lease.try_lock() {
                let _ = worker.tick(&pool);
            }
            let (lock, signal) = &*worker.wake_signal;
            let pending = lock.lock().unwrap_or_else(|e| e.into_inner());
            let (mut pending, _) = signal
                .wait_timeout_while(pending, Duration::from_secs(60), |wake| !*wake)
                .unwrap_or_else(|e| e.into_inner());
            let early = *pending;
            *pending = false;
            drop(pending);
            if early {
                std::thread::sleep(Duration::from_millis(
                    rand::thread_rng().gen_range(0..=5000),
                ));
            }
        });
    }
    fn tick(&self, pool: &DbPool) -> Result<(), String> {
        let Some(origin) = origin() else {
            return Ok(());
        };
        let client = transport_builder()
            .build()
            .map_err(|_| "transport_unavailable")?;
        self.tick_with(pool, &origin, &client, &|id| {
            entry(id)?
                .get_password()
                .map_err(|_| "secure_store_unavailable".into())
        })
    }
    // Private dependency boundary: production always supplies the fixed HTTPS origin, OS store,
    // certificate-validating client, and disabled redirects. Only cfg(test) can inject fixtures.
    fn tick_with(
        &self,
        pool: &DbPool,
        origin: &str,
        client: &reqwest::blocking::Client,
        read_secret: &dyn Fn(&str) -> Result<String, String>,
    ) -> Result<(), String> {
        let c = pool.get().map_err(|_| "database_unavailable")?;
        let Some(i) = identity(&c)? else {
            return Ok(());
        };
        if !i.enabled && !i.dirty {
            return Ok(());
        }
        if i.state == "revoked" || i.state == "rejected" {
            return Ok(());
        }
        // Clamp rollback-induced future deadlines; monotonic sleep above prevents tight loops.
        if i.next > now() + 3600000 {
            c.execute(
                "UPDATE sync_identity SET next_attempt_at=?1 WHERE id=1",
                [now() + 3600000],
            )
            .map_err(|_| "database_unavailable")?;
            return Ok(());
        }
        if i.next > now() {
            return Ok(());
        }
        let secret = match read_secret(&i.id) {
            Ok(s) => s,
            Err(_) => {
                retry(&c, "secure_store_unavailable", i.failures, None)?;
                return Ok(());
            }
        };
        if i.state == "new" {
            if !i.enabled {
                return Ok(());
            }
            let payload = json!({"installationId":i.id,"displayName":i.name,"secret":secret,"sharingEpoch":i.epoch,"noticeVersion":1});
            let result = client
                .post(format!("{origin}/v1/enroll"))
                .json(&payload)
                .send();
            return match result {
                Ok(r) if r.status().is_success() => {
                    let v: Value = match r.json() {
                        Ok(v) => v,
                        Err(_) => {
                            retry(&c, "invalid_response", i.failures, None)?;
                            return Ok(());
                        }
                    };
                    let state = match v["state"]
                        .as_str()
                        .filter(|s| ["pending", "approved", "rejected", "revoked"].contains(s))
                    {
                        Some(state) => state,
                        None => {
                            retry(&c, "invalid_response", i.failures, Some(300000))?;
                            return Ok(());
                        }
                    };
                    c.execute("UPDATE sync_identity SET enrollment_state=?1,last_status_at=?2,failures=0,next_attempt_at=0,safe_error=NULL WHERE id=1",params![state,now()]).map_err(|_|"database_unavailable")?;
                    Ok(())
                }
                Ok(r) => retry(
                    &c,
                    if r.status().as_u16() == 409 {
                        "installation_conflict"
                    } else {
                        "enrollment_delayed"
                    },
                    i.failures,
                    Some(300000),
                ),
                Err(_) => retry(&c, "offline", i.failures, None),
            };
        }
        if i.dirty {
            let result = client
                .post(format!("{origin}/v1/device/consent"))
                .bearer_auth(&secret)
                .json(&json!({"enabled":i.enabled,"sharingEpoch":i.epoch,"noticeVersion":1}))
                .send();
            match result {
                Ok(r) if r.status().is_success() => {
                    c.execute("UPDATE sync_identity SET sharing_dirty=0,failures=0,next_attempt_at=0,safe_error=NULL WHERE id=1",[]).map_err(|_|"database_unavailable")?;
                }
                Ok(r) if [401, 403].contains(&r.status().as_u16()) => {
                    c.execute("UPDATE sync_identity SET enrollment_state='auth_error',safe_error='authorization_required',last_status_at=?1,next_attempt_at=?2 WHERE id=1",params![now(),now()+3600000]).map_err(|_|"database_unavailable")?;
                }
                _ => {
                    retry(&c, "sharing_update_delayed", i.failures, None)?;
                }
            }
            return Ok(());
        }
        if !i.enabled {
            return Ok(());
        }
        let pending: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM study_outbox WHERE state='pending'",
                [],
                |r| r.get(0),
            )
            .map_err(|_| "database_unavailable")?;
        if i.state != "approved" || (pending > 0 && now() - i.last_status >= 300000) {
            if now() - i.last_status < 300000 {
                return Ok(());
            }
            // Bound failed pending polls as well as successful ones to at most one per five minutes.
            c.execute(
                "UPDATE sync_identity SET last_status_at=?1 WHERE id=1",
                [now()],
            )
            .map_err(|_| "database_unavailable")?;
            let response = client
                .get(format!("{origin}/v1/device/status"))
                .bearer_auth(&secret)
                .send();
            match response {
                Ok(r) if r.status().is_success() => {
                    let v: Value = match r.json() {
                        Ok(v) => v,
                        Err(_) => {
                            retry(&c, "invalid_response", i.failures, None)?;
                            return Ok(());
                        }
                    };
                    let state = match v["state"]
                        .as_str()
                        .filter(|s| ["pending", "approved", "rejected", "revoked"].contains(s))
                    {
                        Some(state) => state,
                        None => {
                            retry(&c, "invalid_response", i.failures, Some(300000))?;
                            return Ok(());
                        }
                    };
                    c.execute("UPDATE sync_identity SET enrollment_state=?1,last_status_at=?2,failures=0,next_attempt_at=0,safe_error=NULL WHERE id=1",params![state,now()]).map_err(|_|"database_unavailable")?;
                }
                Ok(r) if [401, 403].contains(&r.status().as_u16()) => {
                    c.execute("UPDATE sync_identity SET enrollment_state='auth_error',safe_error='authorization_required',last_status_at=?1,next_attempt_at=?2 WHERE id=1",params![now(),now()+3600000]).map_err(|_|"database_unavailable")?;
                }
                _ => {
                    retry(&c, "offline", i.failures, None)?;
                }
            }
            return Ok(());
        }
        if pending == 0 {
            return Ok(());
        }
        c.execute("UPDATE study_outbox SET state='blocked',reason='older_than_30_days' WHERE state='pending' AND created_at<?1",[now()-30*86400000]).map_err(|_|"database_unavailable")?;
        let rows: Vec<(String, String, String)> = {
            let mut s=c.prepare("SELECT event_id,payload,payload_hash FROM study_outbox WHERE state='pending' ORDER BY created_at,event_id LIMIT ?1").map_err(|_|"database_unavailable")?;
            let rows = s
                .query_map([i.limit], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map_err(|_| "database_unavailable")?;
            rows.collect::<Result<_, _>>()
                .map_err(|_| "database_unavailable")?
        };
        if rows.is_empty() {
            return Ok(());
        }
        for (id, payload, expected) in &rows {
            if digest(payload) != *expected {
                c.execute("UPDATE study_outbox SET state='blocked',reason='payload_integrity_error' WHERE event_id=?1", [id]).map_err(|_| "database_unavailable")?;
                return Ok(());
            }
        }
        let events: Vec<Value> = rows
            .iter()
            .map(|(_, p, _)| serde_json::from_str(p))
            .collect::<Result<_, _>>()
            .map_err(|_| "invalid_outbox")?;
        for (id, _, _) in &rows {
            c.execute(
                "UPDATE study_outbox SET attempted=attempted+1 WHERE event_id=?1",
                [id],
            )
            .map_err(|_| "database_unavailable")?;
        }
        drop(c); // No connection or transaction held during the study HTTP request.
        let response = client
            .post(format!("{origin}/v1/events"))
            .bearer_auth(&secret)
            .json(&json!({"events":events}))
            .send();
        let mut c = pool.get().map_err(|_| "database_unavailable")?;
        match response {
            Ok(r) if r.status().is_success() => {
                let v: Value = match r.json() {
                    Ok(v) => v,
                    Err(_) => {
                        retry(&c, "invalid_ack", i.failures, None)?;
                        return Ok(());
                    }
                };
                let sent: Vec<String> = rows.iter().map(|(id, _, _)| id.clone()).collect();
                match apply_ack(&mut c, &sent, &v) {
                    Ok(count) if count == sent.len() => {
                        c.execute("UPDATE sync_identity SET failures=0,next_attempt_at=0,safe_error=NULL WHERE id=1",[]).map_err(|_|"database_unavailable")?;
                    }
                    Ok(_) => {
                        retry(&c, "partial_ack", i.failures, None)?;
                    }
                    Err(_) => {
                        retry(&c, "invalid_ack", i.failures, None)?;
                    }
                }
            }
            Ok(r) => {
                let code = r.status().as_u16();
                match code {
                    401 | 403 => {
                        c.execute("UPDATE sync_identity SET enrollment_state='auth_error',safe_error='authorization_required',last_status_at=?1,next_attempt_at=?2 WHERE id=1",params![now(),now()+3600000]).map_err(|_|"database_unavailable")?;
                    }
                    413 if i.limit > 1 => {
                        c.execute("UPDATE sync_identity SET batch_limit=MAX(1,batch_limit/2),next_attempt_at=?1 WHERE id=1",[now()+60000]).map_err(|_|"database_unavailable")?;
                    }
                    400 | 409 | 413 | 415 | 422 => {
                        for (id, _, _) in &rows {
                            c.execute("UPDATE study_outbox SET state='blocked',reason=?1 WHERE event_id=?2",params![if code==409{"immutable_conflict"}else{"invalid_payload"},id]).map_err(|_|"database_unavailable")?;
                        }
                    }
                    _ => {
                        let after = r
                            .headers()
                            .get("Retry-After")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<i64>().ok())
                            .map(|s| s.saturating_mul(1000).clamp(30000, 3600000));
                        retry(
                            &c,
                            if code == 429 {
                                "service_delayed"
                            } else {
                                "service_unavailable"
                            },
                            i.failures,
                            after,
                        )?;
                    }
                }
            }
            Err(_) => {
                retry(&c, "offline", i.failures, None)?;
            }
        }
        c.execute(
            "DELETE FROM study_outbox WHERE state='acknowledged' AND acknowledged_at<?1",
            [now() - 7 * 86400000],
        )
        .map_err(|_| "database_unavailable")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        crate::db::run_migrations(&mut c).unwrap();
        c.execute_batch("INSERT INTO playlists(id,title) VALUES('course-1','Synthetic course');INSERT INTO videos(id,playlist_id,title,duration,url,local_path) VALUES('video-1','course-1','Synthetic video',600,'https://synthetic.invalid/video','/synthetic/private/path');INSERT INTO playlist_videos(playlist_id,video_id) VALUES('course-1','video-1');INSERT INTO bookmarks(video_id,timestamp,notes,screenshot_path,is_doubt) VALUES('video-1',2,'PRIVATE NOTE','/synthetic/private/screenshot',1)").unwrap();
        c.execute("INSERT INTO sync_identity(id,installation_id,display_name,sharing_epoch,enabled_at,enrollment_state) VALUES(1,'synthetic_installation_0001','Alex (synthetic)','synthetic_sharing_epoch_0001',?1,'approved')",[now()-100000]).unwrap();
        c
    }
    fn batch() -> StudyBatch {
        let at = now() - 20000;
        StudyBatch {
            batch_id: "synthetic_batch_000001".into(),
            session_id: "synthetic_session_0001".into(),
            batch_sequence: 0,
            course_id: "course-1".into(),
            video_id: "video-1".into(),
            started_at: at,
            ended_at: at + 10000,
            focused_milliseconds: 10000,
            playback_position_seconds: 100.0,
            completed: false,
        }
    }
    fn count(c: &Connection, table: &str) -> i64 {
        c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }
    #[test]
    fn atomic_capture_rolls_back_both_directions_and_is_idempotent() {
        let mut c = fixture();
        let b = batch();
        c.execute_batch("CREATE TRIGGER fail_outbox BEFORE INSERT ON study_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
        assert!(capture(&mut c, &b).is_err());
        assert_eq!(count(&c, "study_logs"), 0);
        assert_eq!(count(&c, "local_study_batches"), 0);
        c.execute_batch("DROP TRIGGER fail_outbox;CREATE TRIGGER fail_local BEFORE INSERT ON study_logs BEGIN SELECT RAISE(ABORT,'synthetic failure');END;").unwrap();
        assert!(capture(&mut c, &b).is_err());
        assert_eq!(count(&c, "study_outbox"), 0);
        assert_eq!(count(&c, "local_study_batches"), 0);
        c.execute_batch("DROP TRIGGER fail_local").unwrap();
        assert!(capture(&mut c, &b).unwrap());
        assert!(!capture(&mut c, &b).unwrap());
        assert_eq!(count(&c, "study_logs"), 1);
        assert_eq!(count(&c, "study_outbox"), 1);
        let mut conflict = b.clone();
        conflict.session_id = "synthetic_other_session".into();
        assert!(capture(&mut c, &conflict).is_err());
    }
    #[test]
    fn shared_video_capture_keeps_the_selected_course_and_does_not_duplicate_global_time() {
        let mut c = fixture();
        c.execute_batch("INSERT INTO playlists(id,title) VALUES('course-2','Synthetic second course');INSERT INTO playlist_videos(playlist_id,video_id) VALUES('course-2','video-1')").unwrap();
        let mut b = batch();
        b.course_id = "course-2".into();
        capture(&mut c, &b).unwrap();
        let raw: String = c
            .query_row("SELECT payload FROM study_outbox", [], |r| r.get(0))
            .unwrap();
        let payload: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(payload["courseId"], "course-2");
        assert_eq!(payload["courseTitle"], "Synthetic second course");
        let stats = crate::commands::library_stats(&c).unwrap();
        assert_eq!(
            stats
                .iter()
                .find(|p| p.playlist_id == "course-1")
                .unwrap()
                .total_study_time,
            Some(0)
        );
        assert_eq!(
            stats
                .iter()
                .find(|p| p.playlist_id == "course-2")
                .unwrap()
                .total_study_time,
            Some(10)
        );
        assert_eq!(
            crate::commands::study_stats(&c)
                .unwrap()
                .total_study_seconds,
            10
        );
    }
    #[test]
    fn migration_from_v8_seeds_membership_and_course_attribution_without_erasing_history() {
        let mut c = fixture();
        c.execute_batch("INSERT INTO study_logs(video_id,duration_seconds) VALUES('video-1',25);DROP INDEX study_logs_course;ALTER TABLE study_logs DROP COLUMN course_id;DROP TRIGGER preserve_shared_video;DROP TABLE playlist_videos;PRAGMA user_version=8").unwrap();
        crate::db::run_migrations(&mut c).unwrap();
        assert_eq!(
            c.query_row("SELECT course_id FROM study_logs", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "course-1"
        );
        assert_eq!(count(&c, "playlist_videos"), 1);
        assert_eq!(count(&c, "bookmarks"), 1);
        assert_eq!(
            c.query_row("SELECT local_path FROM videos", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "/synthetic/private/path"
        );
        assert_eq!(
            crate::commands::study_stats(&c)
                .unwrap()
                .total_study_seconds,
            25
        );
    }
    #[test]
    fn fractional_seconds_remain_readable_in_existing_local_stats() {
        let mut c = fixture();
        let mut b = batch();
        b.focused_milliseconds = 1250;
        b.ended_at = b.started_at + 1250;
        capture(&mut c, &b).unwrap();
        let stats = crate::commands::study_stats(&c).unwrap();
        assert_eq!(stats.total_study_seconds, 1);
        assert_eq!(stats.recent_logs[0].duration_seconds, 1);
        let date: String = c
            .query_row(
                "SELECT date(created_at, 'localtime') FROM study_logs",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let day = crate::commands::day_study_details(&c, date).unwrap();
        assert_eq!(day.total_seconds, 1);
        assert_eq!(day.video_details[0].duration_seconds, 1);
    }
    #[test]
    fn pause_preserves_study_and_discards_unsent_and_resume_starts_a_new_epoch() {
        let mut c = fixture();
        capture(&mut c, &batch()).unwrap();
        let old: String = c
            .query_row("SELECT sharing_epoch FROM sync_identity", [], |r| r.get(0))
            .unwrap();
        set_enabled(&mut c, false).unwrap();
        assert_eq!(count(&c, "study_logs"), 1);
        assert_eq!(count(&c, "study_outbox"), 0);
        assert!(!status(&c).unwrap().sharing_enabled);
        let mut b = batch();
        b.batch_id = "synthetic_batch_000002".into();
        b.batch_sequence = 1;
        capture(&mut c, &b).unwrap();
        assert_eq!(count(&c, "study_logs"), 2);
        assert_eq!(count(&c, "study_outbox"), 0);
        set_enabled(&mut c, true).unwrap();
        let new: String = c
            .query_row("SELECT sharing_epoch FROM sync_identity", [], |r| r.get(0))
            .unwrap();
        assert_ne!(old, new);
        assert_eq!(count(&c, "study_outbox"), 0);
        // A delayed pre-resume capture cannot leak old-epoch history.
        b.batch_id = "synthetic_batch_000003".into();
        b.batch_sequence = 2;
        capture(&mut c, &b).unwrap();
        assert_eq!(count(&c, "study_outbox"), 0);
        c.execute(
            "UPDATE sync_identity SET enrollment_state='revoked',sharing_enabled=0",
            [],
        )
        .unwrap();
        assert!(set_enabled(&mut c, true).is_err());
    }
    #[test]
    fn only_known_acknowledgments_transition_and_partial_acks_retain_remaining() {
        let mut c = fixture();
        let b = batch();
        capture(&mut c, &b).unwrap();
        let mut second = b.clone();
        second.batch_id = "synthetic_batch_000002".into();
        second.batch_sequence = 1;
        capture(&mut c, &second).unwrap();
        let sent = vec![b.batch_id.clone(), second.batch_id.clone()];
        assert!(apply_ack(&mut c,&sent,&json!({"schemaVersion":1,"acknowledgedEventIds":["unknown_event"],"serverReceivedAt":now()})).is_err());
        assert_eq!(status(&c).unwrap().pending, 2);
        assert_eq!(apply_ack(&mut c,&sent,&json!({"schemaVersion":1,"acknowledgedEventIds":[b.batch_id],"serverReceivedAt":now()})).unwrap(),1);
        assert_eq!(status(&c).unwrap().pending, 1);
    }
    #[test]
    fn dedicated_payload_excludes_private_fields_and_survives_video_deletion() {
        let mut c = fixture();
        capture(&mut c, &batch()).unwrap();
        let raw: String = c
            .query_row("SELECT payload FROM study_outbox", [], |r| r.get(0))
            .unwrap();
        for forbidden in [
            "PRIVATE NOTE",
            "/synthetic/private",
            "screenshot",
            "url",
            "local_path",
            "bookmarks",
        ] {
            assert!(!raw.contains(forbidden), "{forbidden}");
        }
        c.execute("DELETE FROM videos WHERE id='video-1'", [])
            .unwrap();
        assert_eq!(count(&c, "study_outbox"), 1);
        assert_eq!(count(&c, "local_study_batches"), 1);
    }
    #[test]
    fn progress_coalesces_only_never_attempted_snapshots_and_adds_no_time() {
        let mut c = fixture();
        progress(&mut c, "video-1", "course-1", 50, false).unwrap();
        progress(&mut c, "video-1", "course-1", 60, false).unwrap();
        assert_eq!(count(&c, "study_outbox"), 1);
        assert_eq!(count(&c, "study_logs"), 0);
        c.execute("UPDATE study_outbox SET attempted=1", [])
            .unwrap();
        progress(&mut c, "video-1", "course-1", 70, false).unwrap();
        assert_eq!(count(&c, "study_outbox"), 2);
    }
    #[test]
    fn migration_is_repeatable_and_preserves_private_local_data_and_default_is_enabled() {
        let mut c = fixture();
        crate::db::run_migrations(&mut c).unwrap();
        assert_eq!(count(&c, "bookmarks"), 1);
        assert_eq!(
            c.query_row("SELECT notes FROM bookmarks", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "PRIVATE NOTE"
        );
        c.execute("DELETE FROM sync_identity", []).unwrap();
        let s = status(&c).unwrap();
        assert!(s.needs_name && s.sharing_enabled);
        assert_eq!(s.pending, 0);
    }
    #[test]
    fn restart_retains_immutable_payload_and_persisted_backoff_without_real_credentials() {
        let path = std::env::temp_dir().join(format!("lectura-synthetic-{}.db", random_id()));
        let c = fixture();
        c.backup(rusqlite::DatabaseName::Main, &path, None).unwrap();
        drop(c);
        let mut c = Connection::open(&path).unwrap();
        capture(&mut c, &batch()).unwrap();
        retry(&c, "offline", 1, Some(300000)).unwrap();
        let payload: String = c
            .query_row("SELECT payload FROM study_outbox", [], |r| r.get(0))
            .unwrap();
        drop(c);
        let c = Connection::open(&path).unwrap();
        assert_eq!(identity(&c).unwrap().unwrap().failures, 1);
        assert_eq!(
            c.query_row("SELECT payload FROM study_outbox", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            payload
        );
        drop(c);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "requires the isolated loopback TLS runner; never uses production configuration"]
    fn synthetic_native_tls_outbox() {
        let origin =
            std::env::var("LECTURA_SYNTHETIC_TLS_ORIGIN").expect("use npm run test:native:tls");
        let parsed = reqwest::Url::parse(&origin).unwrap();
        assert_eq!(parsed.scheme(), "https");
        assert_eq!(parsed.host_str(), Some("localhost"));
        let ca = std::fs::read(std::env::var("LECTURA_SYNTHETIC_TLS_CA").unwrap()).unwrap();
        let client = transport_builder()
            .add_root_certificate(reqwest::Certificate::from_pem(&ca).unwrap())
            .build()
            .unwrap();
        let id = std::env::var("LECTURA_SYNTHETIC_INSTALLATION").unwrap();
        let secret = "11".repeat(32);
        let epoch = "synthetic_sharing_epoch_0001";
        let use_keychain = std::env::var("LECTURA_SYNTHETIC_KEYCHAIN").as_deref() == Ok("1");
        let service = "com.lectura.study-sync.synthetic-test";
        struct Cleanup {
            service: &'static str,
            id: String,
            active: bool,
        }
        impl Drop for Cleanup {
            fn drop(&mut self) {
                if self.active {
                    let _ = credential_entry(self.service, &self.id)
                        .and_then(|e| e.delete_password().map_err(|_| "cleanup_failed".into()));
                }
            }
        }
        let mut cleanup = Cleanup {
            service,
            id: id.clone(),
            active: use_keychain,
        };
        if use_keychain {
            let e = credential_entry(service, &id).unwrap();
            assert!(matches!(e.get_password(), Err(keyring::Error::NoEntry)));
            e.set_password(&secret)
                .expect("isolated synthetic Keychain write unavailable");
            assert_eq!(e.get_password().unwrap(), secret);
        }
        let read = |requested: &str| {
            assert_eq!(requested, id);
            if use_keychain {
                credential_entry(service, requested)?
                    .get_password()
                    .map_err(|_| "synthetic_secure_store_unavailable".into())
            } else {
                Ok(secret.clone())
            }
        };
        let dir = std::path::PathBuf::from(std::env::var("LECTURA_SYNTHETIC_DB_DIR").unwrap());
        let pool = crate::db::init_db(dir).unwrap();
        let coordinator = Coordinator::default();
        {
            let c = pool.get().unwrap();
            c.execute_batch("INSERT INTO playlists(id,title) VALUES('course-1','Synthetic native course');INSERT INTO videos(id,playlist_id,title,duration,url) VALUES('video-1','course-1','Synthetic native video',600,'https://synthetic.invalid/video');INSERT INTO playlist_videos(playlist_id,video_id) VALUES('course-1','video-1')").unwrap();
            c.execute("INSERT INTO sync_identity(id,installation_id,display_name,sharing_epoch,enabled_at) VALUES(1,?1,'Synthetic native learner',?2,?3)",params![id,epoch,now()-100000]).unwrap();
        }
        let control = |mode: &str| {
            client
                .post(format!("{origin}/__synthetic/mode"))
                .header("X-LecTura-Synthetic", "fixture")
                .json(&json!({"mode":mode}))
                .send()
                .unwrap()
                .error_for_status()
                .unwrap();
        };
        let summary = || -> Value {
            client
                .get(format!("{origin}/__synthetic/summary"))
                .header("X-LecTura-Synthetic", "fixture")
                .send()
                .unwrap()
                .error_for_status()
                .unwrap()
                .json()
                .unwrap()
        };
        let mutate = |sql: &str| {
            pool.get().unwrap().execute_batch(sql).unwrap();
        };
        let mut first = batch();
        first.started_at = now() - 20000;
        first.ended_at = first.started_at + 10000;
        capture(&mut pool.get().unwrap(), &first).unwrap();
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(
            identity(&pool.get().unwrap()).unwrap().unwrap().state,
            "pending"
        );
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(summary()["eventCalls"], 0);
        assert_eq!(summary()["focusedMs"], 0);
        client
            .post(format!("{origin}/v1/admin/enrollments/{id}/approve"))
            .bearer_auth("aa".repeat(32))
            .json(&json!({}))
            .send()
            .unwrap()
            .error_for_status()
            .unwrap();
        mutate("UPDATE sync_identity SET last_status_at=0");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(
            identity(&pool.get().unwrap()).unwrap().unwrap().state,
            "approved"
        );
        control("drop_after_commit");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 1);
        assert_eq!(summary()["focusedMs"], 10000);
        let calls = summary()["eventCalls"].as_i64().unwrap();
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(summary()["eventCalls"], calls);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 0);
        assert_eq!(summary()["focusedMs"], 10000);
        assert_eq!(summary()["receipts"], 1);
        let mut second = first.clone();
        second.batch_id = "synthetic_batch_000002".into();
        second.batch_sequence = 1;
        capture(&mut pool.get().unwrap(), &second).unwrap();
        // The normal client must reject the ephemeral untrusted certificate without sending a payload.
        let untrusted = transport_builder().build().unwrap();
        let calls = summary()["eventCalls"].as_i64().unwrap();
        coordinator
            .tick_with(&pool, &origin, &untrusted, &read)
            .unwrap();
        assert_eq!(summary()["eventCalls"], calls);
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 1);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        control("redirect");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(summary()["redirected"], 0);
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 1);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        control("429");
        let before = now();
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert!(identity(&pool.get().unwrap()).unwrap().unwrap().next >= before + 59000);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        control("413");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(identity(&pool.get().unwrap()).unwrap().unwrap().limit, 5);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        control("unknown_ack");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 1);
        assert_eq!(summary()["focusedMs"], 20000);
        mutate("UPDATE sync_identity SET next_attempt_at=0");
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(status(&pool.get().unwrap()).unwrap().pending, 0);
        assert_eq!(summary()["focusedMs"], 20000);
        set_enabled(&mut pool.get().unwrap(), false).unwrap();
        coordinator
            .tick_with(&pool, &origin, &client, &read)
            .unwrap();
        assert_eq!(summary()["sharingEnabled"], false);
        if use_keychain {
            let e = credential_entry(service, &id).unwrap();
            e.delete_password().unwrap();
            assert!(matches!(e.get_password(), Err(keyring::Error::NoEntry)));
            cleanup.active = false;
        }
    }
}
