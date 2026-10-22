import { canonical, hash } from "../cloud/worker/validation.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { runtimeDatabase } from "./d1-runtime-adapter.mjs";
test("actual workerd Worker + emulated D1 accepts two synthetic installations, deduplicates and rolls back conflicts", async (t) => {
  const db = await runtimeDatabase();
  t.after(() => db.close());
  const admin = "aa".repeat(32),
    now = Date.now();
  const send = async (path, method = "GET", body, token) => {
    const r = await db.runtime.dispatchFetch(
      "https://synthetic.invalid" + path,
      {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: r.status, body: await r.json() };
  };
  assert.equal(
    (await send("/v1/admin/enrollment-window", "POST", { minutes: 15 }, admin))
      .status,
    200,
  );
  const ids = ["synthetic_installation_0001", "synthetic_installation_0002"];
  for (let i = 0; i < 2; i++) {
    const secret = String(i + 1).repeat(64),
      sharingEpoch = "synthetic_sharing_epoch_0001";
    assert.equal(
      (
        await send("/v1/enroll", "POST", {
          installationId: ids[i],
          displayName: "Alex (synthetic)",
          secret,
          sharingEpoch,
          noticeVersion: 1,
        })
      ).status,
      201,
    );
    assert.equal(
      (await send(`/v1/admin/enrollments/${ids[i]}/approve`, "POST", {}, admin))
        .status,
      200,
    );
    const e = {
      schemaVersion: 1,
      eventId: "synthetic_study_event_0001",
      installationId: ids[i],
      sharingEpoch,
      eventType: "study_batch",
      capturedAt: now,
      localSequence: 1,
      courseId: "course-1",
      courseTitle: "Synthetic math",
      videoId: "video-1",
      videoTitle: "Synthetic proofs",
      playbackPositionSeconds: 10,
      completed: false,
      sessionId: "synthetic_session_0001",
      batchSequence: 1,
      startedAt: now - 10000,
      endedAt: now,
      focusedMilliseconds: 10000,
    };
    assert.equal(
      (await send("/v1/events", "POST", { events: [e] }, secret)).status,
      200,
    );
    assert.equal(
      (await send("/v1/events", "POST", { events: [e] }, secret)).status,
      200,
    );
    const conflict = await send(
      "/v1/events",
      "POST",
      {
        events: [
          {
            ...e,
            eventId: "synthetic_study_event_0002",
            batchSequence: 2,
            localSequence: 2,
          },
          { ...e, focusedMilliseconds: 5000 },
        ],
      },
      secret,
    );
    assert.equal(conflict.status, 409);
  }
  assert.equal(
    (await db.prepare("SELECT COUNT(*) n FROM learners").first()).n,
    2,
  );
  assert.equal(
    (await db.prepare("SELECT SUM(focused_ms) n FROM daily_rollups").first()).n,
    20000,
  );
  const rows = await db.prepare("SELECT * FROM event_receipts").all();
  assert.equal(rows.results.length, 2);
  assert.ok(rows.results.every((r) => r.payload === null));
  const summary = await send("/v1/admin/learners", "GET", undefined, admin);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.items.length, 2);
  const sampleAt = Math.floor(now / 86400000) * 86400000 - 43200000;
  const sample = Array.from({ length: 10 }, (_, n) => ({
    schemaVersion: 1,
    eventId: `synthetic_capacity_event_${String(n).padStart(8, "0")}`,
    installationId: ids[0],
    sharingEpoch: "synthetic_sharing_epoch_0001",
    eventType: "study_batch",
    capturedAt: sampleAt + (n + 1) * 10000,
    localSequence: 100 + n,
    courseId: "course-1",
    courseTitle: "Synthetic math",
    videoId: "video-1",
    videoTitle: "Synthetic proofs",
    playbackPositionSeconds: 100 + n * 10,
    completed: false,
    sessionId: "synthetic_capacity_session",
    batchSequence: n,
    startedAt: sampleAt + n * 10000,
    endedAt: sampleAt + (n + 1) * 10000,
    focusedMilliseconds: 10000,
  }));
  const commands = [];
  for (const e of sample) {
    const payload = canonical(e);
    commands.push(
      db
        .prepare(
          "INSERT INTO event_receipts(installation_id,event_id,payload_hash,accepted_at,payload) VALUES(?,?,?,?,?)",
        )
        .bind(e.installationId, e.eventId, await hash(payload), now, payload),
    );
  }
  const measured = await db.batch(commands);
  assert.equal(
    (await db.prepare("SELECT SUM(focused_ms) n FROM daily_rollups").first()).n,
    120000,
  );
  console.log(
    JSON.stringify({
      syntheticLocalD1: {
        events: 10,
        rowsWritten: measured.reduce(
          (n, r) => n + (r.meta.rows_written || 0),
          0,
        ),
        rowsRead: measured.reduce((n, r) => n + (r.meta.rows_read || 0), 0),
      },
    }),
  );
});
