# Protocol v1

All production requests use a fixed HTTPS origin without credential-bearing redirects. All responses are JSON and `Cache-Control: no-store`; no public CORS policy is exposed. POST bodies must be `application/json`. Public errors contain safe codes and no SQL, token or payload details. Server times are integer UTC milliseconds.

The old plan called the sharing epoch a consent epoch. The implementation calls it `sharingEpoch` because default-enabled sharing no longer has a separate consent checkbox. The internal `/device/consent` route remains a sharing-state protocol endpoint, not an opt-in screen.

| Route | Authority | Request / response |
| --- | --- | --- |
| POST `/v1/enroll` | Bounded public registration | installationId, displayName (trimmed 1–80 UTF-16 code units), client-generated 64-hex secret, sharingEpoch, noticeVersion=1 → state |
| GET `/v1/device/status` | Own installation bearer | state, sharingEnabled, sharingEpoch, serverTime; never peer data or credential |
| POST `/v1/device/consent` | Own installation bearer | enabled boolean, sharingEpoch, noticeVersion=1; new epoch required on disabled→enabled; never changes admin approval |
| POST `/v1/events` | Approved, enabled, unrevoked installation | `{events:[...]}` max 10 / 64 KiB → schemaVersion=1, exact acknowledgedEventIds, serverReceivedAt |
| GET `/v1/admin/enrollments` | Admin | Bounded installation request/state metadata, 50 + one lookahead row |
| POST `/v1/admin/enrollments/:id/approve` | Admin | `{}` creates a learner; optional replaceLearnerId explicitly relinks and revokes older installations |
| POST `/v1/admin/enrollments/:id/reject` | Admin | `{}` |
| POST `/v1/admin/installations/:id/revoke` | Admin | `{}` |
| GET `/v1/admin/learners` | Admin | Installation-linked summary, 50 + lookahead rows; cursor is bounded offset |
| GET `/v1/admin/learners/:id/activity` | Admin | days=1…30, cursor; daily rollups, latest progress and raw sessions, each capped at 200 + lookahead |
| GET `/v1/admin/health` | Admin | Fixed UTC reporting, app controls/counters, pending count and retention summary |
| POST `/v1/admin/enrollment-window` | Admin | minutes=0…60; zero closes registration |
| POST `/v1/admin/ingestion` | Admin | enabled boolean; kill switch leaves local outboxes intact |

Common event fields: schemaVersion=1, eventId, installationId, sharingEpoch, eventType, capturedAt, localSequence, courseId, courseTitle, videoId, videoTitle, playbackPositionSeconds and completed. IDs are bounded, titles max 300 code units, positions finite and 0…604800 seconds, sequences positive safe integers. Every unknown field is rejected.

`study_batch` adds sessionId, batchSequence, startedAt, endedAt and focusedMilliseconds. Its contiguous interval is at most 65 seconds, focused duration at most 60 seconds and no more than interval length plus 1 second of clock tolerance. It must remain within one UTC reporting day. UTC timestamps must be within the 30-day accepted horizon and 5-minute future tolerance. A `progress_snapshot` has no duration fields and cannot increment focused totals.

D1 receipts use `(installation_id,event_id)` plus a canonical top-level sorted-key SHA-256 hash. A second unique `(installation_id,session_id,batch_sequence)` key prevents changing only an event ID to duplicate a batch. The transaction derives the learner from approved installation ownership; client-supplied learner ownership is never accepted. Duration/rollup/progress writes occur only on a new receipt. Replayed equal hashes receive the same acknowledgment; different hashes conflict. Guard triggers re-check state/epoch/owner eligibility when the write executes, covering concurrent revocation and replacement.

A request emits at most ten ingestion SQL statements plus one authentication lookup; each prepared ingestion statement has five bound values. Trigger work is real database CPU/row/index work and must be included in production quota measurement. Batch atomicity is based on D1's documented `batch` transaction facility, and tested against the local workerd/D1 engine.

Retry-safe transport is at least once. These identifiers make effects on studied duration idempotent; the implementation does not claim exactly-once network delivery.
