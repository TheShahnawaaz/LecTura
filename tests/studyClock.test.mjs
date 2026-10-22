import test from "node:test";
import assert from "node:assert/strict";
import {
  StudyClock,
  BatchDelivery,
  randomBatchId,
} from "../src/lib/studyClock.mjs";
function fixture(video = "video-1") {
  let n = 0;
  const batches = [];
  return {
    batches,
    clock: new StudyClock({
      videoId: video,
      courseId: "course-1",
      emit: (b) => batches.push(b),
      id: () => `synthetic_id_${String(++n).padStart(8, "0")}`,
    }),
  };
}
test("focused wall time ignores seek and speed, pauses, focus loss and sleep", () => {
  const { clock, batches } = fixture();
  const wall = Date.UTC(2026, 9, 22, 12);
  clock.tick(0, wall, true);
  clock.tick(1000, wall + 1000, true, 200);
  clock.tick(2000, wall + 2000, true, 400);
  clock.tick(3000, wall + 3000, false);
  clock.tick(4000, wall + 4000, false);
  clock.tick(5000, wall + 5000, true);
  clock.tick(6000, wall + 6000, true);
  clock.tick(90000, wall + 90000, true);
  clock.tick(91000, wall + 91000, true);
  clock.flush();
  assert.equal(
    batches.reduce((a, b) => a + b.focusedMilliseconds, 0),
    4000,
  );
  assert.equal(batches.length, 3);
});
test("UTC midnight splits exact contiguous activity; clock rollback never invents time", () => {
  const { clock, batches } = fixture();
  const wall = Date.UTC(2026, 9, 22, 23, 59, 59, 500);
  clock.tick(0, wall, true);
  clock.tick(1000, wall + 1000, true);
  clock.flush();
  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((b) => b.focusedMilliseconds),
    [500, 500],
  );
  for (const b of batches)
    assert.equal(
      Math.floor(b.startedAt / 86400000),
      Math.floor((b.endedAt - 1) / 86400000),
    );
  clock.tick(2000, wall - 100000, true);
  clock.flush();
  assert.equal(batches.length, 2);
});
test("video switch flush keeps the old course/video and stable sequential batch identities", () => {
  const a = fixture("old"),
    b = fixture("new");
  const wall = Date.UTC(2026, 9, 22);
  a.clock.tick(0, wall, true);
  a.clock.tick(1000, wall + 1000, true);
  a.clock.flush();
  b.clock.tick(2000, wall + 2000, true);
  b.clock.tick(3000, wall + 3000, true);
  b.clock.flush();
  assert.equal(a.batches[0].videoId, "old");
  assert.equal(b.batches[0].videoId, "new");
  assert.equal(a.batches[0].batchSequence, 0);
  assert.ok(Object.isFrozen(a.batches[0]));
});
test("failed local invocation retries the exact immutable batch and then drains later batches", async () => {
  let scheduled,
    fail = true;
  const received = [];
  const delivery = new BatchDelivery(
    async (b) => {
      received.push(b);
      if (fail) throw new Error("synthetic failure");
    },
    (fn) => {
      scheduled = fn;
    },
  );
  const a = Object.freeze({ batchId: "synthetic_batch_01" }),
    b = Object.freeze({ batchId: "synthetic_batch_02" });
  delivery.add(a);
  delivery.add(b);
  await new Promise((r) => setImmediate(r));
  assert.equal(delivery.queue.length, 2);
  fail = false;
  scheduled();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(received, [a, a, b]);
  assert.equal(delivery.queue.length, 0);
});

test("native-WebView batch IDs use random bytes without randomUUID", () => {
  const a = randomBatchId(),
    b = randomBatchId();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, b);
});
