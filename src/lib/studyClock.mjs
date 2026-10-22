// getRandomValues also works in native WebViews without secure-context randomUUID support.
export function randomBatchId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
// Focused wall time, independent of playback speed and seeks. No gaps are reconstructed.
export class StudyClock {
  constructor({ videoId, courseId, emit, id = randomBatchId }) {
    this.videoId = videoId;
    this.courseId = courseId;
    this.emit = emit;
    this.id = id;
    this.session = id();
    this.sequence = 0;
    this.last = null;
    this.batch = null;
    this.playback = 0;
    this.completed = false;
  }
  tick(
    mono,
    wall,
    eligible,
    playback = this.playback,
    completed = this.completed,
  ) {
    this.playback = Number.isFinite(playback) ? Math.max(0, playback) : 0;
    this.completed = !!completed;
    if (this.last) {
      const delta = mono - this.last.mono,
        wallDelta = wall - this.last.wall;
      if (
        this.last.eligible &&
        eligible &&
        delta > 0 &&
        delta <= 2500 &&
        Math.abs(wallDelta - delta) < 1000
      ) {
        let start = this.last.wall,
          remaining = Math.round(delta),
          end = wall;
        while (remaining > 0) {
          const boundary = (Math.floor(start / 86400000) + 1) * 86400000;
          const part = Math.min(remaining, Math.max(0, boundary - start));
          if (!part) {
            this.flush();
            break;
          }
          if (!this.batch)
            this.batch = {
              startedAt: start,
              endedAt: start,
              focusedMilliseconds: 0,
            };
          this.batch.focusedMilliseconds += part;
          this.batch.endedAt = Math.min(start + part, end);
          remaining -= part;
          start += part;
          if (start >= boundary || this.batch.focusedMilliseconds >= 10000)
            this.flush();
        }
      } else this.flush(); // Pause, focus loss, sleep and clock discontinuity end a contiguous interval.
    }
    this.last = { mono, wall, eligible };
  }
  flush() {
    if (!this.batch) return;
    const b = this.batch;
    this.batch = null;
    if (b.endedAt <= b.startedAt || b.focusedMilliseconds < 1) return;
    this.emit(
      Object.freeze({
        ...b,
        batchId: this.id(),
        sessionId: this.session,
        batchSequence: this.sequence++,
        videoId: this.videoId,
        courseId: this.courseId,
        playbackPositionSeconds: this.playback,
        completed: this.completed,
      }),
    );
  }
}
export class BatchDelivery {
  constructor(send, schedule = (fn) => setTimeout(fn, 5000)) {
    this.send = send;
    this.schedule = schedule;
    this.queue = [];
    this.running = false;
    this.waiting = false;
  }
  add(batch) {
    this.queue.push(batch);
    void this.drain();
  }
  async drain() {
    if (this.running || this.waiting) return;
    this.running = true;
    try {
      while (this.queue.length) {
        await this.send(this.queue[0]);
        this.queue.shift();
      }
    } catch {
      this.waiting = true;
      this.schedule(() => {
        this.waiting = false;
        void this.drain();
      });
    } finally {
      this.running = false;
    }
  }
}
