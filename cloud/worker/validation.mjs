export const DAY = 86400000;
export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, code) => {
  throw new ApiError(status, code);
};
export function object(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    fail(400, "invalid_fields");
  return value;
}
export function text(value, max = 200, min = 1) {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(400, "invalid_text");
  return value;
}
export function id(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    fail(400, "invalid_id");
  return value;
}
export function integer(v, min, max) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail(400, "invalid_number");
  return v;
}
export function enrollment(v) {
  object(v, [
    "installationId",
    "displayName",
    "secret",
    "sharingEpoch",
    "noticeVersion",
  ]);
  id(v.installationId);
  id(v.sharingEpoch);
  text(v.displayName, 80);
  if (
    !v.displayName.trim() ||
    v.displayName !== v.displayName.trim() ||
    !/^[a-f0-9]{64}$/.test(v.secret)
  )
    fail(400, "invalid_enrollment");
  if (v.noticeVersion !== 1) fail(400, "unsupported_notice");
  return v;
}
const common = [
  "schemaVersion",
  "eventId",
  "installationId",
  "sharingEpoch",
  "eventType",
  "capturedAt",
  "localSequence",
  "courseId",
  "courseTitle",
  "videoId",
  "videoTitle",
  "playbackPositionSeconds",
  "completed",
];
export function event(v, installation, now) {
  const study = v?.eventType === "study_batch";
  object(
    v,
    study
      ? [
          ...common,
          "sessionId",
          "batchSequence",
          "startedAt",
          "endedAt",
          "focusedMilliseconds",
        ]
      : common,
  );
  if (
    v.schemaVersion !== 1 ||
    !["study_batch", "progress_snapshot"].includes(v.eventType)
  )
    fail(400, "unsupported_schema");
  id(v.eventId);
  id(v.installationId);
  id(v.sharingEpoch);
  if (
    v.installationId !== installation.installation_id ||
    v.sharingEpoch !== installation.sharing_epoch
  )
    fail(403, "inactive_installation");
  integer(v.localSequence, 1, Number.MAX_SAFE_INTEGER);
  text(v.courseId, 200);
  text(v.videoId, 200);
  text(v.courseTitle, 300);
  text(v.videoTitle, 300);
  integer(v.capturedAt, now - 30 * DAY, now + 300000);
  if (
    typeof v.completed !== "boolean" ||
    !Number.isFinite(v.playbackPositionSeconds) ||
    v.playbackPositionSeconds < 0 ||
    v.playbackPositionSeconds > 604800
  )
    fail(400, "invalid_progress");
  if (study) {
    id(v.sessionId);
    integer(v.batchSequence, 0, Number.MAX_SAFE_INTEGER);
    integer(v.startedAt, now - 30 * DAY, now + 300000);
    integer(v.endedAt, v.startedAt + 1, now + 300000);
    integer(v.focusedMilliseconds, 1, 60000);
    if (
      v.endedAt - v.startedAt > 65000 ||
      v.focusedMilliseconds > v.endedAt - v.startedAt + 1000 ||
      Math.floor(v.startedAt / DAY) !== Math.floor((v.endedAt - 1) / DAY) ||
      v.capturedAt < v.endedAt
    )
      fail(400, "invalid_interval");
  }
  return v;
}
export function canonical(v) {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, v[k]]),
    ),
  );
}
export async function hash(s) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function body(request, limit = 65536) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    fail(415, "json_required");
  if (+request.headers.get("content-length") > limit)
    fail(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "invalid_json");
  let bytes = 0,
    chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) {
        await reader.cancel();
        fail(413, "body_too_large");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    fail(400, "invalid_json");
  }
}
