import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { database } from "./d1-adapter.mjs";
import worker, { handle, retain } from "../cloud/worker/index.mjs";
import { hash, event } from "../cloud/worker/validation.mjs";
globalThis.crypto ||= webcrypto;
const now = Date.UTC(2026, 9, 22, 12),
  secret = "11".repeat(32),
  admin = "aa".repeat(32),
  install = "synthetic_installation_0001",
  epoch = "synthetic_sharing_epoch_0001";
const enrollment = {
  installationId: install,
  displayName: "Alex <script> (synthetic)",
  secret,
  sharingEpoch: epoch,
  noticeVersion: 1,
};
function request(path, method = "GET", body, token) {
  return new Request("https://synthetic.invalid" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function fixture(t) {
  const DB = await database();
  t.after(() => DB.close());
  return {
    DB,
    ADMIN_TOKEN_HASH: await hash(admin),
    ENROLL_RATE: { limit: async () => ({ success: true }) },
    AUTH_RATE: { limit: async () => ({ success: true }) },
  };
}
const call = (env, path, method, body, token) =>
  handle(request(path, method, body, token), env, now);
async function open(env) {
  await call(
    env,
    "/v1/admin/enrollment-window",
    "POST",
    { minutes: 15 },
    admin,
  );
}
async function approved(env) {
  await open(env);
  await call(env, "/v1/enroll", "POST", enrollment);
  await call(
    env,
    `/v1/admin/enrollments/${install}/approve`,
    "POST",
    {},
    admin,
  );
}
const batch = (n = 1) => ({
  schemaVersion: 1,
  eventId: `synthetic_event_${String(n).padStart(8, "0")}`,
  installationId: install,
  sharingEpoch: epoch,
  eventType: "study_batch",
  capturedAt: now - 10000,
  localSequence: n,
  courseId: "course-1",
  courseTitle: "Synthetic math",
  videoId: "video-1",
  videoTitle: "Synthetic proofs",
  playbackPositionSeconds: n * 10,
  completed: false,
  sessionId: "synthetic_session_0001",
  batchSequence: n,
  startedAt: now - 20000,
  endedAt: now - 10000,
  focusedMilliseconds: 10000,
});
const total = async (db) =>
  (await db.prepare("SELECT SUM(focused_ms) AS n FROM daily_rollups").first())
    .n || 0;
async function rejectsCode(fn, code) {
  await assert.rejects(fn, (e) => e.code === code);
}
test("registration defaults closed; replay requires the same persisted secret; pending cannot upload", async (t) => {
  const env = await fixture(t);
  await rejectsCode(
    () => call(env, "/v1/enroll", "POST", enrollment),
    "enrollment_closed",
  );
  await open(env);
  await call(env, "/v1/enroll", "POST", enrollment);
  await call(env, "/v1/enroll", "POST", enrollment);
  await rejectsCode(
    () =>
      call(env, "/v1/enroll", "POST", {
        ...enrollment,
        secret: "22".repeat(32),
      }),
    "installation_conflict",
  );
  await rejectsCode(
    () => call(env, "/v1/events", "POST", { events: [batch()] }, secret),
    "inactive_installation",
  );
  assert.equal(await total(env.DB), 0);
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) n FROM installations").first()).n,
    1,
  );
});
test("simultaneous last pending slot and registration budget are enforced atomically", async (t) => {
  const env = await fixture(t);
  await open(env);
  await env.DB.prepare(
    "UPDATE controls SET pending_cap=1,daily_budget=1",
  ).run();
  const values = await Promise.allSettled(
    [
      enrollment,
      {
        ...enrollment,
        installationId: "synthetic_installation_0002",
        secret: "22".repeat(32),
      },
    ].map((v) => call(env, "/v1/enroll", "POST", v)),
  );
  assert.equal(values.filter((v) => v.status === "fulfilled").length, 1);
  assert.equal(
    (await env.DB.prepare("SELECT registrations FROM controls").first())
      .registrations,
    1,
  );
});
test("lost-response retries and duplicates add duration once; conflicts roll the entire request back", async (t) => {
  const env = await fixture(t);
  await approved(env);
  await call(env, "/v1/events", "POST", { events: [batch(), batch()] }, secret);
  const ack = await (
    await call(env, "/v1/events", "POST", { events: [batch()] }, secret)
  ).json();
  assert.deepEqual(ack.acknowledgedEventIds, [batch().eventId]);
  assert.equal(await total(env.DB), 10000);
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/events",
        "POST",
        { events: [batch(2), { ...batch(), videoTitle: "changed" }] },
        secret,
      ),
    "event_conflict",
  );
  assert.equal(await total(env.DB), 10000);
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/events",
        "POST",
        { events: [{ ...batch(), eventId: "synthetic_different_event" }] },
        secret,
      ),
    "event_conflict",
  );
  assert.equal(await total(env.DB), 10000);
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) n FROM event_receipts").first()).n,
    1,
  );
});
test("progress has zero duration and late offline snapshots cannot regress progress", async (t) => {
  const env = await fixture(t);
  await approved(env);
  await call(env, "/v1/events", "POST", { events: [batch(5)] }, secret);
  const {
    sessionId,
    batchSequence,
    startedAt,
    endedAt,
    focusedMilliseconds,
    ...p
  } = batch(3);
  p.eventType = "progress_snapshot";
  await call(env, "/v1/events", "POST", { events: [p] }, secret);
  assert.equal(await total(env.DB), 10000);
  assert.equal(
    (await env.DB.prepare("SELECT position FROM progress_snapshots").first())
      .position,
    50,
  );
});
test("privacy unknown fields, owners, old events, invalid intervals and device peer reads are rejected", async (t) => {
  const env = await fixture(t);
  await approved(env);
  for (const key of [
    "notes",
    "screenshot",
    "localPath",
    "fullURL",
    "learnerId",
    "database",
  ])
    await rejectsCode(
      () =>
        call(
          env,
          "/v1/events",
          "POST",
          { events: [{ ...batch(), [key]: "private" }] },
          secret,
        ),
      "invalid_fields",
    );
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/events",
        "POST",
        { events: [{ ...batch(), startedAt: now - 31 * 86400000 }] },
        secret,
      ),
    "invalid_number",
  );
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/events",
        "POST",
        { events: [{ ...batch(), focusedMilliseconds: 60000 }] },
        secret,
      ),
    "invalid_interval",
  );
  await rejectsCode(
    () => call(env, "/v1/admin/learners", "GET", undefined, secret),
    "unauthorized",
  );
  await rejectsCode(
    () => call(env, "/v1/device/status", "GET", undefined, "22".repeat(32)),
    "unauthorized",
  );
  assert.equal(await total(env.DB), 0);
});
test("pause rotates epoch; resume cannot revive revoked security approval", async (t) => {
  const env = await fixture(t);
  await approved(env);
  const next = "synthetic_sharing_epoch_0002";
  await call(
    env,
    "/v1/device/consent",
    "POST",
    { enabled: false, sharingEpoch: next, noticeVersion: 1 },
    secret,
  );
  await rejectsCode(
    () => call(env, "/v1/events", "POST", { events: [batch()] }, secret),
    "inactive_installation",
  );
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/device/consent",
        "POST",
        { enabled: true, sharingEpoch: next, noticeVersion: 1 },
        secret,
      ),
    "new_sharing_epoch_required",
  );
  await call(
    env,
    "/v1/device/consent",
    "POST",
    {
      enabled: true,
      sharingEpoch: "synthetic_sharing_epoch_0003",
      noticeVersion: 1,
    },
    secret,
  );
  await rejectsCode(
    () => call(env, "/v1/events", "POST", { events: [batch()] }, secret),
    "inactive_installation",
  );
  await call(
    env,
    `/v1/admin/installations/${install}/revoke`,
    "POST",
    {},
    admin,
  );
  await rejectsCode(
    () =>
      call(
        env,
        "/v1/device/consent",
        "POST",
        { enabled: true, sharingEpoch: next, noticeVersion: 1 },
        secret,
      ),
    "revoked",
  );
});
test("transaction guard prevents stale-auth write after revoke; relink preserves history and revokes old", async (t) => {
  const env = await fixture(t);
  await approved(env);
  await call(env, "/v1/events", "POST", { events: [batch()] }, secret);
  const old = await env.DB.prepare(
    "SELECT * FROM installations WHERE installation_id=?",
  )
    .bind(install)
    .first();
  await call(
    env,
    `/v1/admin/installations/${install}/revoke`,
    "POST",
    {},
    admin,
  );
  const b = batch(2),
    payloadHash = await hash(JSON.stringify(b));
  await assert.rejects(() =>
    env.DB.batch([
      env.DB.prepare("INSERT INTO event_receipts VALUES(?,?,?,?,?)").bind(
        install,
        b.eventId,
        payloadHash,
        now,
        JSON.stringify(b),
      ),
    ]),
  );
  const replacement = {
    ...enrollment,
    installationId: "synthetic_installation_0002",
    secret: "22".repeat(32),
  };
  await call(env, "/v1/enroll", "POST", replacement);
  await call(
    env,
    `/v1/admin/enrollments/${replacement.installationId}/approve`,
    "POST",
    { replaceLearnerId: old.learner_id },
    admin,
  );
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) n FROM learners").first()).n,
    1,
  );
  assert.equal(await total(env.DB), 10000);
  const states = (
    await env.DB.prepare(
      "SELECT state FROM installations ORDER BY installation_id",
    ).all()
  ).results.map((x) => x.state);
  assert.deepEqual(states, ["revoked", "approved"]);
});
test("daily event cap fails closed; retention keeps receipt dedupe and rejects old late replay", async (t) => {
  const env = await fixture(t);
  await approved(env);
  await env.DB.prepare("UPDATE controls SET daily_event_cap=1").run();
  await call(env, "/v1/events", "POST", { events: [batch()] }, secret);
  await call(env, "/v1/events", "POST", { events: [batch()] }, secret);
  await rejectsCode(
    () => call(env, "/v1/events", "POST", { events: [batch(2)] }, secret),
    "event_budget",
  );
  assert.equal(await total(env.DB), 10000);
  await retain(env.DB, now + 31 * 86400000);
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) n FROM study_events").first()).n,
    0,
  );
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) n FROM event_receipts").first()).n,
    1,
  );
  const d = await env.DB.prepare(
    "SELECT * FROM installations WHERE installation_id=?",
  )
    .bind(install)
    .first();
  assert.throws(() => event(batch(), d, now + 31 * 86400000));
});
test("rate limits, JSON body size, missing admin config fail closed with no CORS", async (t) => {
  const env = await fixture(t);
  env.ENROLL_RATE = { limit: async () => ({ success: false }) };
  const r = await worker.fetch(request("/v1/enroll", "POST", enrollment), env);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  delete env.ADMIN_TOKEN_HASH;
  assert.equal(
    (
      await worker.fetch(
        request("/v1/admin/learners", "GET", undefined, admin),
        env,
      )
    ).status,
    503,
  );
  const large = request("/v1/enroll", "POST", { x: "x".repeat(100000) });
  env.ENROLL_RATE = { limit: async () => ({ success: true }) };
  assert.equal((await worker.fetch(large, env)).status, 413);
});

test("weekly summary covers exactly seven UTC reporting days and includes the last reported video", async (t) => {
  const env = await fixture(t);
  await approved(env);
  await call(env, "/v1/events", "POST", { events: [batch()] }, secret);
  const learner = (
    await env.DB.prepare("SELECT learner_id FROM installations").first()
  ).learner_id;
  await env.DB.prepare(
    "INSERT INTO daily_rollups VALUES(?,date(?/1000,'unixepoch'),?,?,?,?,?)",
  )
    .bind(
      learner,
      now - 7 * 86400000,
      "older-course",
      "older-video",
      "Synthetic older course",
      "Synthetic older video",
      60000,
    )
    .run();
  const v = await (
    await call(env, "/v1/admin/learners", "GET", undefined, admin)
  ).json();
  assert.equal(v.items[0].week_ms, 10000);
  assert.equal(v.items[0].last_video_title, "Synthetic proofs");
});
