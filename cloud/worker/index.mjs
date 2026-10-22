import {
  ApiError,
  fail,
  object,
  id,
  integer,
  enrollment,
  event,
  canonical,
  hash,
  body,
  DAY,
} from "./validation.mjs";
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const all = async (db, sql, ...v) => (await stmt(db, sql, ...v).all()).results;
function bearer(r) {
  const v = r.headers.get("Authorization") || "";
  if (!/^Bearer [a-f0-9]{64}$/.test(v)) fail(401, "unauthorized");
  return v.slice(7);
}
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
async function rate(request, env, binding, now) {
  if (!env[binding]) fail(503, "service_not_configured");
  // The short-lived platform rate-limit key is not stored in learner analytics or D1.
  const key = await hash(
    `${Math.floor(now / DAY)}:${request.headers.get("CF-Connecting-IP") || "local-test"}`,
  );
  if (!(await env[binding].limit({ key })).success) fail(429, "rate_limited");
}
async function device(r, env, now) {
  await rate(r, env, "AUTH_RATE", now);
  const tokenHash = await hash(bearer(r));
  const row = await stmt(
    env.DB,
    "SELECT * FROM installations WHERE token_hash=?",
    tokenHash,
  ).first();
  if (!row) fail(401, "unauthorized");
  return row;
}
async function audit(db, action, target, now) {
  return stmt(
    db,
    "INSERT INTO admin_audit(time,action,object_id) VALUES(?,?,?)",
    now,
    action,
    target,
  );
}
function paging(url) {
  const cursor = +(url.searchParams.get("cursor") || 0);
  integer(cursor, 0, 10000000);
  return cursor;
}
export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url),
    p = url.pathname,
    method = request.method,
    db = env.DB;
  if (url.protocol !== "https:" && !env.TEST_ONLY) fail(400, "https_required");
  if (!db) fail(503, "service_not_configured");
  if (p === "/v1/enroll" && method === "POST") {
    await rate(request, env, "ENROLL_RATE", now);
    const v = enrollment(await body(request, 2048)),
      tokenHash = await hash(v.secret);
    const old = await stmt(
      db,
      "SELECT token_hash,state FROM installations WHERE installation_id=?",
      v.installationId,
    ).first();
    if (old) {
      if (!equal(old.token_hash, tokenHash)) fail(409, "installation_conflict");
      return json({ state: old.state });
    }
    try {
      await stmt(
        db,
        "INSERT INTO installations(installation_id,token_hash,display_name,requested_at,sharing_epoch,notice_version) VALUES(?,?,?,?,?,?)",
        v.installationId,
        tokenHash,
        v.displayName,
        now,
        v.sharingEpoch,
        v.noticeVersion,
      ).run();
    } catch (e) {
      if (String(e).includes("enrollment_closed"))
        fail(429, "enrollment_closed");
      // A racing identical enrollment is safe; a different secret never claims the ID.
      const raced = await stmt(
        db,
        "SELECT token_hash,state FROM installations WHERE installation_id=?",
        v.installationId,
      ).first();
      if (raced && equal(raced.token_hash, tokenHash))
        return json({ state: raced.state });
      if (raced) fail(409, "installation_conflict");
      throw e;
    }
    return json({ state: "pending" }, 201);
  }
  if (p.startsWith("/v1/admin/")) {
    if (!/^[a-f0-9]{64}$/.test(env.ADMIN_TOKEN_HASH || ""))
      fail(503, "admin_not_configured");
    await rate(request, env, "AUTH_RATE", now);
    if (!equal(await hash(bearer(request)), env.ADMIN_TOKEN_HASH))
      fail(401, "unauthorized");
    if (p === "/v1/admin/enrollments" && method === "GET") {
      return json({
        items: await all(
          db,
          "SELECT installation_id,display_name,state,requested_at,learner_id FROM installations ORDER BY requested_at DESC,installation_id LIMIT 51 OFFSET ?",
          paging(url),
        ),
        limit: 50,
      });
    }
    if (p === "/v1/admin/health" && method === "GET") {
      return json({
        reportingTimezone: "UTC",
        controls: await stmt(db, "SELECT * FROM controls WHERE id=1").first(),
        pending: await stmt(
          db,
          "SELECT COUNT(*) AS count FROM installations WHERE state='pending'",
        ).first(),
        retention: {
          rawDays: 30,
          rollupDays: 365,
          receiptDays: 90,
          maxEventAgeDays: 30,
        },
        warning:
          "Application counters are not Cloudflare account quota measurements. Names and installations are unverified.",
      });
    }
    if (p === "/v1/admin/enrollment-window" && method === "POST") {
      const v = object(await body(request, 1024), ["minutes"]);
      integer(v.minutes, 0, 60);
      await db.batch([
        stmt(
          db,
          "UPDATE controls SET window_expires_at=? WHERE id=1",
          v.minutes ? now + v.minutes * 60000 : 0,
        ),
        await audit(db, "enrollment_window", "service", now),
      ]);
      return json({ ok: true });
    }
    if (p === "/v1/admin/ingestion" && method === "POST") {
      const v = object(await body(request, 1024), ["enabled"]);
      if (typeof v.enabled !== "boolean") fail(400, "invalid_fields");
      await db.batch([
        stmt(db, "UPDATE controls SET ingest_enabled=? WHERE id=1", +v.enabled),
        await audit(db, "ingestion_" + v.enabled, "service", now),
      ]);
      return json({ ok: true });
    }
    const approval = p.match(
      /^\/v1\/admin\/enrollments\/([a-zA-Z0-9_-]{16,100})\/(approve|reject)$/,
    );
    if (approval && method === "POST") {
      const [, installationId, action] = approval,
        v = object(await body(request, 2048), ["replaceLearnerId"]);
      if (v.replaceLearnerId !== undefined) id(v.replaceLearnerId);
      const learnerId = v.replaceLearnerId || crypto.randomUUID();
      const commands = [];
      if (action === "approve") {
        if (v.replaceLearnerId) {
          if (
            !(await stmt(
              db,
              "SELECT 1 FROM learners WHERE learner_id=?",
              learnerId,
            ).first())
          )
            fail(404, "not_found");
          // Only the selected pending request can authorize replacement. All writes run as one D1 batch.
          commands.push(
            stmt(
              db,
              "UPDATE installations SET state='revoked',revoked_at=? WHERE learner_id=? AND EXISTS(SELECT 1 FROM installations WHERE installation_id=? AND state='pending')",
              now,
              learnerId,
              installationId,
            ),
          );
        } else
          commands.push(
            stmt(
              db,
              "INSERT INTO learners SELECT ?,display_name,? FROM installations WHERE installation_id=? AND state='pending'",
              learnerId,
              now,
              installationId,
            ),
          );
        commands.push(
          stmt(
            db,
            "UPDATE installations SET learner_id=?,state='approved',approved_at=? WHERE installation_id=? AND state='pending'",
            learnerId,
            now,
            installationId,
          ),
        );
      } else
        commands.push(
          stmt(
            db,
            "UPDATE installations SET state='rejected' WHERE installation_id=? AND state='pending'",
            installationId,
          ),
        );
      commands.push(
        await audit(
          db,
          action + (v.replaceLearnerId ? "_replace" : ""),
          installationId,
          now,
        ),
      );
      const result = await db.batch(commands);
      if (!result[result.length - 2].meta.changes) fail(409, "not_pending");
      return json({ ok: true });
    }
    const revoke = p.match(
      /^\/v1\/admin\/installations\/([a-zA-Z0-9_-]{16,100})\/revoke$/,
    );
    if (revoke && method === "POST") {
      object(await body(request, 1024), []);
      await db.batch([
        stmt(
          db,
          "UPDATE installations SET state='revoked',revoked_at=? WHERE installation_id=?",
          now,
          revoke[1],
        ),
        await audit(db, "revoke", revoke[1], now),
      ]);
      return json({ ok: true });
    }
    if (p === "/v1/admin/learners" && method === "GET") {
      const start = now - 6 * DAY;
      const items = await all(
        db,
        `SELECT l.*,i.installation_id,i.state,i.last_received_at,i.last_sync_at,
        (SELECT MAX(observed_at) FROM progress_snapshots WHERE learner_id=l.learner_id) AS last_activity_at,
        (SELECT course_title FROM progress_snapshots WHERE learner_id=l.learner_id ORDER BY observed_at DESC LIMIT 1) AS last_course_title,
        (SELECT video_title FROM progress_snapshots WHERE learner_id=l.learner_id ORDER BY observed_at DESC LIMIT 1) AS last_video_title,
        COALESCE((SELECT SUM(focused_ms) FROM daily_rollups WHERE learner_id=l.learner_id AND reporting_day=date(?/1000,'unixepoch')),0) AS today_ms,
        COALESCE((SELECT SUM(focused_ms) FROM daily_rollups WHERE learner_id=l.learner_id AND reporting_day>=date(?/1000,'unixepoch')),0) AS week_ms
        FROM learners l LEFT JOIN installations i ON i.installation_id=(SELECT installation_id FROM installations
        WHERE learner_id=l.learner_id ORDER BY (state='approved') DESC,requested_at DESC,installation_id DESC LIMIT 1)
        ORDER BY l.created_at DESC,l.learner_id,i.installation_id LIMIT 51 OFFSET ?`,
        now,
        start,
        paging(url),
      );
      return json({ items, limit: 50, reportingTimezone: "UTC" });
    }
    const activity = p.match(
      /^\/v1\/admin\/learners\/([a-zA-Z0-9_-]{16,100})\/activity$/,
    );
    if (activity && method === "GET") {
      const days = +(url.searchParams.get("days") || 7);
      integer(days, 1, 30);
      const offset = paging(url);
      const startDay = Math.floor(now / DAY) * DAY - (days - 1) * DAY;
      return json({
        reportingTimezone: "UTC",
        rollups: await all(
          db,
          "SELECT * FROM daily_rollups WHERE learner_id=? AND reporting_day>=date(?/1000,'unixepoch') ORDER BY reporting_day DESC,course_id,video_id LIMIT 201 OFFSET ?",
          activity[1],
          startDay,
          offset,
        ),
        progress: await all(
          db,
          "SELECT * FROM progress_snapshots WHERE learner_id=? ORDER BY observed_at DESC LIMIT 201 OFFSET ?",
          activity[1],
          offset,
        ),
        sessions: await all(
          db,
          "SELECT * FROM study_events WHERE learner_id=? AND ended_at>=? ORDER BY ended_at DESC LIMIT 201 OFFSET ?",
          activity[1],
          startDay,
          offset,
        ),
        limit: 200,
      });
    }
    fail(404, "not_found");
  }
  const d = await device(request, env, now);
  if (p === "/v1/device/status" && method === "GET")
    return json({
      state: d.state,
      sharingEnabled: !!d.sharing_enabled,
      sharingEpoch: d.sharing_epoch,
      serverTime: now,
    });
  if (p === "/v1/device/consent" && method === "POST") {
    const v = object(await body(request, 1024), [
      "enabled",
      "sharingEpoch",
      "noticeVersion",
    ]);
    id(v.sharingEpoch);
    if (typeof v.enabled !== "boolean" || v.noticeVersion !== 1)
      fail(400, "invalid_fields");
    // This never changes admin security approval or revocation state.
    if (v.enabled && (d.state === "revoked" || d.state === "rejected"))
      fail(403, "revoked");
    if (v.enabled && !d.sharing_enabled && v.sharingEpoch === d.sharing_epoch)
      fail(409, "new_sharing_epoch_required");
    await stmt(
      db,
      "UPDATE installations SET sharing_enabled=?,sharing_epoch=?,notice_version=? WHERE installation_id=? AND (?=0 OR state NOT IN ('revoked','rejected'))",
      +v.enabled,
      v.sharingEpoch,
      v.noticeVersion,
      d.installation_id,
      +v.enabled,
    ).run();
    return json({ ok: true });
  }
  if (p === "/v1/events" && method === "POST") {
    if (d.state !== "approved" || !d.sharing_enabled || d.revoked_at)
      fail(403, "inactive_installation");
    const v = object(await body(request), ["events"]);
    if (!Array.isArray(v.events) || !v.events.length || v.events.length > 10)
      fail(400, "invalid_batch");
    const unique = new Map();
    for (const raw of v.events) {
      event(raw, d, now);
      const payload = canonical(raw),
        payloadHash = await hash(payload);
      if (
        unique.has(raw.eventId) &&
        unique.get(raw.eventId).payloadHash !== payloadHash
      )
        fail(409, "event_conflict");
      unique.set(raw.eventId, { raw, payload, payloadHash });
    }
    const commands = [...unique.values()].map((e) =>
      stmt(
        db,
        `INSERT INTO event_receipts(installation_id,event_id,payload_hash,accepted_at,payload) VALUES(?,?,?,?,?)
      ON CONFLICT(installation_id,event_id) DO UPDATE SET payload_hash=excluded.payload_hash`,
        d.installation_id,
        e.raw.eventId,
        e.payloadHash,
        now,
        e.payload,
      ),
    );
    // <= 12 externally issued statements (auth SELECT + batch <=10), each <=5 parameters.
    try {
      await db.batch(commands);
    } catch (e) {
      const s = String(e);
      if (s.includes("inactive_installation"))
        fail(403, "inactive_installation");
      if (s.includes("event_budget")) fail(429, "event_budget");
      if (s.includes("event_conflict") || s.includes("UNIQUE constraint"))
        fail(409, "event_conflict");
      throw e;
    }
    return json({
      schemaVersion: 1,
      acknowledgedEventIds: [...unique.keys()],
      serverReceivedAt: now,
    });
  }
  fail(404, "not_found");
}
export default {
  async fetch(r, env) {
    try {
      return await handle(r, env);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 503;
      const response = json(
        { error: e instanceof ApiError ? e.code : "service_unavailable" },
        status,
      );
      if (status === 429) response.headers.set("Retry-After", "300");
      return response;
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(retain(env.DB));
  },
};
export async function retain(db, now = Date.now()) {
  // Bounded maintenance: at most 1000 rows/table/run; fail-closed accepted-age validation remains mandatory.
  await db.batch([
    stmt(
      db,
      "DELETE FROM study_events WHERE rowid IN (SELECT rowid FROM study_events WHERE ended_at<? LIMIT 1000)",
      now - 30 * DAY,
    ),
    stmt(
      db,
      "DELETE FROM daily_rollups WHERE rowid IN (SELECT rowid FROM daily_rollups WHERE reporting_day<date(?/1000,'unixepoch') LIMIT 1000)",
      now - 365 * DAY,
    ),
    stmt(
      db,
      "DELETE FROM event_receipts WHERE rowid IN (SELECT rowid FROM event_receipts WHERE accepted_at<? LIMIT 1000)",
      now - 90 * DAY,
    ),
    stmt(
      db,
      "UPDATE installations SET state='rejected' WHERE installation_id IN (SELECT installation_id FROM installations WHERE state='pending' AND requested_at<? LIMIT 1000)",
      now - 7 * DAY,
    ),
    stmt(
      db,
      "DELETE FROM progress_snapshots WHERE rowid IN (SELECT rowid FROM progress_snapshots WHERE observed_at<? LIMIT 1000)",
      now - 365 * DAY,
    ),
    stmt(
      db,
      "DELETE FROM admin_audit WHERE id IN (SELECT id FROM admin_audit WHERE time<? LIMIT 1000)",
      now - 365 * DAY,
    ),
  ]);
}
