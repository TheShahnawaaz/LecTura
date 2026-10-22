import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1-adapter.mjs";
test("synthetic SQL export and restore preserve rollups, ownership and immutable receipt dedupe", async (t) => {
  const db = await database(),
    restored = await database();
  t.after(() => db.close());
  t.after(() => restored.close());
  const now = Date.now(),
    id = "synthetic_installation_0001",
    epoch = "synthetic_sharing_epoch_0001",
    learner = "synthetic_learner_0001";
  await db
    .prepare("UPDATE controls SET window_expires_at=?")
    .bind(now + 60000)
    .run();
  await db
    .prepare(
      "INSERT INTO installations(installation_id,token_hash,display_name,requested_at,sharing_epoch,notice_version) VALUES(?,?,?,?,?,1)",
    )
    .bind(id, "synthetic-test-hash-only", "Alex (synthetic)", now, epoch)
    .run();
  await db
    .prepare("INSERT INTO learners VALUES(?,?,?)")
    .bind(learner, "Alex (synthetic)", now)
    .run();
  await db
    .prepare(
      "UPDATE installations SET state='approved',learner_id=? WHERE installation_id=?",
    )
    .bind(learner, id)
    .run();
  const event = {
    eventId: "synthetic_event_0001",
    installationId: id,
    sharingEpoch: epoch,
    eventType: "study_batch",
    sessionId: "synthetic_session_0001",
    batchSequence: 1,
    localSequence: 1,
    courseId: "course-1",
    courseTitle: "Synthetic course",
    videoId: "video-1",
    videoTitle: "Synthetic video",
    startedAt: now - 10000,
    endedAt: now,
    capturedAt: now,
    focusedMilliseconds: 10000,
    playbackPositionSeconds: 10,
    completed: false,
  };
  const insert = (connection) =>
    connection
      .prepare(
        "INSERT INTO event_receipts VALUES(?,?,?,?,?) ON CONFLICT(installation_id,event_id) DO UPDATE SET payload_hash=excluded.payload_hash",
      )
      .bind(
        id,
        event.eventId,
        "synthetic-immutable-hash",
        now,
        JSON.stringify(event),
      )
      .run();
  await insert(db);
  const dump = await db.export();
  await restored.restore(dump);
  await insert(restored);
  assert.equal(
    (
      await restored
        .prepare("SELECT SUM(focused_ms) n FROM daily_rollups")
        .first()
    ).n,
    10000,
  );
  assert.equal(
    (await restored.prepare("SELECT learner_id FROM study_events").first())
      .learner_id,
    learner,
  );
  assert.equal(
    (await restored.prepare("SELECT COUNT(*) n FROM event_receipts").first()).n,
    1,
  );
});
