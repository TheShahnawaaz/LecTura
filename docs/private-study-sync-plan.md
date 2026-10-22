# Draft plan: zero-configuration learner study analytics

**Status: design for review, not implementation or deployment approval.**

Repository: [TheShahnawaaz/LecTura](https://github.com/TheShahnawaaz/LecTura). Code inspected at commit **1efd44891b08199aed2cc8d47a9521e8f6927fd4**, version 0.3.3. Prepared 19 October 2026. This draft PR must contain only this plan, not the parked implementation.

## 1. Decision in one paragraph

Keep LecTura local-first. Add a small Cloudflare Worker API and D1 database on the **Free plan**, using the included workers.dev hostname rather than buying a domain. Cloudflare describes workers.dev as appropriate for personal/hobby use and recommends a custom domain for production/business-critical use; this household pilot does not promise production SLA guarantees. The learner is asked for a display name at most once, alongside a clear explanation and affirmative choice to share the selected study activity. They never enter a server URL, pairing code, account login or developer setting. A random installation ID and installation-specific credential handle automatic enrollment. Unknown installations are **pending administrator approval**, so a public installer does not grant strangers trusted write access. The administrator can run a dashboard locally on their laptop and connect to the central API when needed. Their laptop does not need to stay on for learner uploads. The admin must configure/authenticate their own access once; that requirement is not imposed on learners.

This does not prove who a learner is. A device ID identifies an installation, not a person, and a supplied name is self-asserted. Approval and any reinstall relinking are admin decisions, never inferred from matching names or hardware fingerprints.

## 2. Requirements and boundaries

### Accepted requirements

- One person normally uses one laptop. Record a display name plus random installation ID.
- No learner settings/setup beyond, at most, entering their name and acknowledging sharing.
- See which course/video they study, actual focused study duration, and separate playback progress/completion.
- Server setup and normal household use should fit the free tier; no paid upgrades, domain, subscriptions or unexpected charges.
- A local admin dashboard is acceptable. Central storage remains accessible whenever the admin opens it.
- Offline study continues normally. New versus already-sent data is tracked durably; retrying must not double-count study time.
- No notes, screenshots, download contents, local filesystem paths or whole database upload.
- Explicit visible consent, disclosure and a straightforward way to stop sharing. No hidden monitoring.
- Preserve the brother's existing study history. No historical backfill by default.

### Out of scope for this draft

No deployment, Cloudflare account creation, actual secret/credential provisioning, app release, merge, payment setup or changes to existing study data. No identity verification, remote screen viewing, keystrokes, surveillance, exact attention measurement, remote control, content downloads or third-party notifications. Do not reuse the superseded pairing-code/settings prototype as the approved UX.

## 3. What the current code already does

| Area | Confirmed current behavior | Relevance |
| --- | --- | --- |
| Study heartbeat | Player counts one second while playing and document.hasFocus(), sends batches of ten seconds and flushes remaining time on pause/unmount/video change | Reuse the focused-wall-time definition, but attach stable session/batch identifiers and timestamps |
| Local study write | log_study_time inserts one study_logs row with video ID, duration and database timestamp | Extend with one transaction that also queues a minimal immutable event |
| Progress | update_video_progress writes watched_progress and is_completed separately | Progress is a snapshot, never additional studied duration |
| Statistics | get_study_stats sums study_logs for actual time and completed-video duration for covered content; joins current titles | Do not upload this whole result: it also includes bookmark/doubt counts and loses historical titles after edits/deletion |
| Data storage | lectura.db, foreign keys enabled, migrations; downloaded video and screenshot files in app data | Add independent sync tables without cascading dependency on videos |
| UI lifetime | App.jsx remains active; Settings dialogs are transient | Sync worker must not depend on Settings being open |

Pinned source references:
- [PlayerView study heartbeat](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src/components/PlayerView.jsx#L388-L444)
- [log_study_time](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/src/commands.rs#L463-L471)
- [App study callback](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src/App.jsx#L410-L435)
- [progress write](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/src/commands.rs#L409-L417)
- [statistics query](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/src/commands.rs#L474-L566)
- [schema and migrations](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/src/db.rs)
- [re-import replacement](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/src/commands.rs#L367-L405)

### Necessary adjacent integrity work

Existing INSERT OR REPLACE import behavior plus cascade foreign keys can erase video study logs/bookmarks, and one global video primary key cannot retain membership in two courses. Do not make analytics depend on those destructive joins. Snapshot approved course/video titles into events at capture time, with no video FK on the outbox. A safe metadata UPSERT and explicit course-membership strategy need a focused migration/regression change before calling the full application history-preserving. This is necessary data integrity, not permission to undertake unrelated UI/download bug fixes. Back up the local DB before any migration and prove preservation with a seeded fixture.

## 4. Learner experience

### First launch after the feature exists

1. Existing users stay local-only until they choose sharing; no automatic historical upload.
2. Show a small, understandable introduction: “Share study activity with the course administrator: your name, course/video titles, study times and playback progress. Notes, screenshots and downloaded files stay on this laptop.” Show the administrator's configured identity/contact label, not just an opaque server address.
3. Offer “Continue locally” and a clear affirmative “Share my study activity.” If sharing, ask for a display name once. No preselected consent.
4. Generate random installation identity and credential locally and persist them before enrollment. Enrollment sends only the display name, installation identity and authentication material, not study activity.
5. Study works immediately. Show “Sharing requested, awaiting administrator approval” without making the learner configure anything else.
6. After admin approval, enrollment status changes automatically and explicitly disclosed activity collected since opt-in can sync. Never capture pre-consent history. If consent is revoked before approval, discard that unsent sharing queue.

A compact status near the profile or study dashboard displays Local only / Waiting for approval / Synced / N pending / Offline / Sharing paused / Action needed. A privacy control remains available to stop sharing; “no extra configuration” cannot mean hiding the privacy control.

### Normal use

- No account/password prompts, URLs or pairing codes.
- Study is saved locally first, even with the network off or the service at quota.
- Sync runs outside the player, on application start after consent, on connectivity restoration and at a low regular cadence when events exist.
- Admin view refreshes on demand or while open. It is recent activity, not a promise of second-by-second live presence.
- Display last device activity separately from last server receipt and last successful sync.

### Names and identity

Allow reasonable Unicode names with a short length limit; trim whitespace and render as text. Names are not unique keys. Two people can have the same name. A name change does not merge records, rotate identity or expose other learners. Do not collect email, phone, OS username, serial number, MAC address, IP-derived identity or hardware fingerprint. Infrastructure may necessarily process connection IP addresses; do not persist them as learner analytics, and disclose any narrowly scoped short-lived abuse handling.

## 5. Architecture and trust boundaries

Learner Tauri app → HTTPS Worker API → D1.

Admin browser → loopback-only local dashboard/proxy → authenticated HTTPS Worker admin API → D1.

The Worker endpoint and administrator display label can be public release configuration. They are not credentials. Do not put an admin token, Cloudflare account API token, D1 service credential or shared learner secret in the distributed application.

### Administrator access recommendation

A small local dashboard server binds only to 127.0.0.1, serves its UI and proxies admin requests. Store its admin credential in the operating-system credential store, or accept it interactively into process memory; never bake it into frontend JavaScript/localStorage or commit it. Worker validates the dedicated application-admin credential on every admin request and fails closed if absent. Cloudflare account-management credentials are not dashboard credentials.

Use high-entropy rotated admin credentials, HTTPS upstream, constant-time comparison or hashed token lookup, no query-string credentials and no sensitive request-body logs. Restrict local proxy to fixed backend origin and fixed routes: not an open arbitrary-URL proxy. Require a per-launch CSRF token, strict Origin/Host validation and JSON content type on mutating calls. Do not expose the local server to the LAN. Remote pages must not be able to use the loopback proxy through DNS rebinding or permissive CORS.

A later hosted admin UI is optional; it would require its own authenticated architecture. Do not turn the D1 API into a public dashboard to avoid admin setup.

### Device credential recommendation

Generate a separate 256-bit random installation secret with the OS CSPRNG; persist it before the first enrollment attempt. For a small service, a server-stored hash of an installation bearer secret over HTTPS is simpler than custom signing protocols. Never return it in normal status responses or put it in the webview. Prefer OS secure credential storage in native Rust; storing it unencrypted in the general app DB would expose it to more existing frontend/file capabilities and should not be the production default.

The server stores only the token hash, scoped to one device/learner and analytics write/status permissions. Device requests cannot read analytics, approve themselves, change learner ownership or access another device's status. Revoke the token if the installation is lost or compromised. A copied credential can impersonate that installation: this is not tamper-proof attendance or human identity proof.

Because client-selected secrets are supported for retry-safe enrollment, an exact enrollment replay is accepted only if installation ID and token hash both match. A different secret cannot claim an existing ID. A lost local secret cannot be recovered by supplying the same display name.

## 6. Name-only enrollment: honest security model

A public endpoint plus a public app cannot automatically distinguish the brother's install from a stranger's install. There is no hidden device-ID trick that solves this. Do not embed an “enrollment secret” in the app and call it secure.

**Recommended conservative default:** pending enrollment plus admin approval. Registration submits minimal data; a pending credential can only check its own status. No course/video/study payload reaches D1 until approval. Admin sees display name, short random installation ID, requested time and state. Admin verifies expected enrollment out of band and approves it. This adds an administrator action, not a learner setup step.

Abuse controls:
- Strict request-size/body limits, JSON schema and allowlist; random ID format and bounded name length.
- Rate-limit enrollment and status checks using available platform controls, with an application-wide registration budget and a hard pending-record cap.
- Validate/rate-limit before expensive SQL; do not create endless D1 rows for unauthenticated random input.
- Keep new registration closed by default except while the admin enables a short enrollment window. Existing approved installations continue syncing outside that window. The learner app waits automatically; no learner code is required.
- Expire abandoned pending registrations, with predictable retry state and no identity hijack. The same valid request should be idempotent.
- Enforce enrollment-window validity, pending-cap and daily-budget consumption atomically with registration insertion. Concurrent read-then-insert checks are not sufficient; test simultaneous requests at the remaining last slot.
- Fail closed when the global budget is exhausted. Free-service unavailability is preferable to silently enabling a paid plan.
- IP-based limits are imperfect behind shared networks or rotating addresses; supplement them with global budgets. Do not promise immunity to distributed denial of service. Workers requests can consume quota even when rejected.
- CAPTCHA would contradict the desired frictionless learner experience unless later explicitly accepted; do not make it a hidden prerequisite.

If the user later wants fully automatic approval, label it an intentional **unverified public-enrollment** mode with stronger abuse risk and potentially misleading names. It is not the recommended default.

## 7. Local data model and transactional capture

Schema names below are proposed, not existing objects. Use a migration and backup rather than ad hoc production edits.

### sync_identity (single installation)

installation_id; secure credential-store reference (not raw token); enrollment_state; learner_id when approved; consent_version; consent_granted_at; consent_revoked_at; service_origin/version; last_status_check_at; last_successful_sync_at; consecutive_failures; next_attempt_at; last_safe_error_code.

### study_outbox

- event_id: random globally unique ID, primary key.
- installation_id, consent_epoch, schema_version.
- immutable allowlisted payload JSON and payload_hash.
- local_study_log_id where useful for audit, not a cascading FK.
- local sequence number; created_at; attempt_count; next_attempt_at.
- state: pending / retry_wait / blocked / acknowledged; acknowledged_at optional.
- expiry/blocked reason when manual action is needed.

Keep acknowledged receipts for a bounded troubleshooting window, then compact them. Never mark an event sent merely because a request was started. Local outbox and actual local study records are different responsibilities: disabling sharing discards unsent sharing copies, not study history.

### Capture algorithm

1. Player measures actual focused/playing elapsed time using a monotonic clock, not playback speed or video position. Cap suspicious long timer gaps and exclude paused, unfocused or sleeping periods. Define whether picture-in-picture/unfocused watching counts; default preserves today's focus-only semantics.
2. Capture UTC start/end plus monotonic focused duration for each batch. A batch can span unfocused gaps but duration must include only eligible intervals; do not reconstruct timestamps solely as now minus focusedSeconds when gaps occurred.
3. Use a stable session ID and batch sequence/ID so repeat invocation of the same local flush cannot insert study time twice.
4. In one SQLite transaction, INSERT the local study batch idempotently and INSERT its outbox event if consent permits. If either fails, neither commits. A later retry uses the same batch/event ID.
5. Snapshot only allowed course/video identifiers and titles. Do not serialize the existing Video struct or get_study_stats response wholesale.
6. Commit before any network request. Never hold a DB write transaction while waiting for HTTP.
7. Progress snapshots use a separate event type and zero added duration. Coalesce redundant pending progress snapshots without altering immutable already-attempted events.
8. Flush at sensible intervals (retain current ten-second durability initially) and on pause/video switch. Graceful application close can attempt a short flush; a forced process kill can lose the last in-memory seconds. Document that bound rather than claiming perfect capture.

### Proposed payloads

Common fields: schemaVersion, eventId, installationId, consentEpoch, eventType, capturedAt, localSequence.

study_batch: sessionId, batchSequence, courseId, courseTitle, videoId, videoTitle, startedAt, endedAt, focusedMilliseconds, playbackPositionSeconds, completed.

progress_snapshot: courseId, courseTitle, videoId, videoTitle, observedAt, playbackPositionSeconds, completed. This event never increments focused-time totals.

Optional timezone offset for the event may be included only if disclosed and needed for day grouping. Recommended default is UTC timestamps plus an service reporting timezone chosen before collection; do not infer location. No notes, screenshots, local paths, full video URLs, cookies, download errors, complete DB records or unrelated environment data.

Use strict unknown-field rejection on server and a dedicated serializer on client. Validate lengths, types, ranges, supported version, timestamps and finite numbers. Titles are untrusted text. Validate focused duration against interval length with documented clock tolerance, but recognize clients can lie; analytics is observational, not an anti-cheat system.

## 8. Central D1 schema and APIs

### Proposed tables

- learners(learner_id PK, display_name, created_at, status).
- installations(installation_id PK, learner_id nullable FK, token_hash UNIQUE, state, consent_version, requested_at, approved_at, revoked_at, last_received_at). Never use name as a key.
- enrollment_controls(singleton, window_expires_at, pending_cap, daily_budget).
- event_receipts(installation_id, event_id, payload_hash, accepted_at, PRIMARY KEY(installation_id,event_id)). Compact idempotency ledger.
- study_events(installation_id,event_id,learner_id,session_id,batch_sequence,course/video snapshots,start/end,focused_ms,server_received_at). Unique batch identity as well as event identity where appropriate.
- progress_snapshots(learner_id,installation_id,course_id,video_id,position,completed,observed_at,local_sequence), updated only by newer same-installation sequence; never let a late offline batch regress latest status.
- daily_rollups(learner_id,reporting_day,course_id,video_id,focused_ms), using one fixed service reporting timezone selected before collection. Generated/update only for genuinely new accepted study batches.
- admin_audit(time, action, object_id, outcome), excluding raw tokens and payload bodies.

Indexes follow exact admin query paths: learner/time, installation/receipt, learner/course/video. Avoid indexing every field: index writes count against D1 write quotas.

### Endpoint contract

| Endpoint | Authentication | Responsibility |
| --- | --- | --- |
| POST /v1/enroll | None; bounded registration controls | Minimal name, installation ID, credential registration; idempotent pending record |
| GET /v1/device/status | Installation credential | Own enrollment/consent/revocation state, no peer records |
| POST /v1/events | Approved installation credential | Validate bounded immutable events, transactional idempotent ingest, explicit acknowledgments |
| POST /v1/device/consent | Own credential | Record explicit opt-out or affirmative re-opt-in with a new consent epoch; no implied history deletion or admin-approval override |
| GET /v1/admin/enrollments | Admin | View pending requests |
| POST /v1/admin/enrollments/:id/approve | Admin | Assign new learner or explicit reviewed relink, activate credential |
| POST /v1/admin/enrollments/:id/reject | Admin | Deny request |
| POST /v1/admin/installations/:id/revoke | Admin | Revoke device credential |
| GET /v1/admin/learners | Admin | Paginated summary and freshness |
| GET /v1/admin/learners/:id/activity | Admin | Bounded date-range detail and totals |
| POST /v1/admin/enrollment-window | Admin | Open/close bounded registration period |

Server derives learner_id from the authenticated installation. If payload attempts to specify a different owner, reject it. The admin cannot accidentally query all data through an unbounded endpoint; use cursor pagination and capped date ranges. Do not expose D1 directly to browsers or desktop clients.

### Ingestion and acknowledgment semantics

- Start with at most **10 events per request**, plus a strict byte limit (for example 64 KiB). Enforce a maximum 45 total planned SQL statements including authentication/status/accounting under the Free-plan 50-query/invocation limit; every query must also fit 100 bound parameters. Ten events allow several guarded writes each. Increasing to 25 requires demonstrated SQL consolidation and measured query headroom, not merely a changed array limit.
- Validate the entire batch before mutation; reject malformed batches explicitly. Deduplicate repeated identical event IDs within the request.
- Re-check approved state, current consent epoch, non-revoked credential and immutable learner ownership inside the same transactional/conditional write as ingestion. A request that passed authentication before a concurrent revocation/relink must not write afterward under stale ownership.
- Transactionally insert receipt and event/aggregate changes. Use D1's documented atomic batch facility or a proven conditional SQL pattern; never read-then-increment totals outside the uniqueness guard.
- An already-recorded event with the same canonical payload hash is success and can be acknowledged again. Same ID with a different payload is a conflict, not a second duration contribution.
- Acknowledgment identifies exact durable event IDs, server receipt time and schema version. Return only after the write commits. On ambiguous timeout, retry the same immutable IDs.
- Prefer all-or-nothing validation/ingestion for a bounded request initially. Client must still safely handle valid partial acknowledgment because future server versions or reconciliation may return it: mark only the subset acknowledged, retain the rest.
- Unknown IDs in an acknowledgment invalidate that response; keep the queue. Never delete unsent events based on a count or “latest timestamp.”
- Do not claim end-to-end exactly-once transport. Transport is at least once; durable identifiers plus unique constraints make the **effect on studied duration idempotent**.

## 9. Sender lifecycle, retry and ordering

One native sync coordinator owns transmission. A mutex/lease prevents overlapping flushes across timers, reconnect callbacks and manual refresh. Fetch a bounded batch, release DB locks, send, then apply validated acknowledgments in a new transaction. New activity can continue entering the outbox throughout.

Suggested cadence: one wake per minute while the app is open, upload only if approved/consented and pending work exists; flush on startup/reconnect with jitter. Enrollment polling no more often than five minutes while pending, with backoff and foreground refresh. No continuous requests when local-only or empty. Avoid timers inside an unmounted settings dialog.

Retry categories:
- Network timeout/offline/5xx: exponential backoff with full jitter, e.g. 30 seconds → 1 minute → 2 → 4 → ... up to 1 hour; persist attempts/deadline across app restarts.
- 429: respect Retry-After with safe upper/lower bounds, retain events and expose delayed status.
- 401/403: stop automatic upload, preserve the queue, refresh own enrollment state; do not hammer credentials or silently re-enroll/merge.
- 409 event conflict: quarantine the specific immutable event and show an actionable diagnostic; never invent a replacement ID to double-count it.
- 413: reduce batch size, never truncate payload silently.
- Unsupported schema/invalid payload: block with safe reason, no infinite tight retries.
- Partial ack: mark that subset, schedule remaining events with normal backoff.

Restart loads the same identity, outbox and retry state. Clock rollback must not create an endless sleep or a tight loop: clamp persisted deadlines and use monotonic runtime scheduling. Out-of-order offline arrivals add legitimate duration but do not replace a newer playback snapshot. Do not assume event timestamps are unique or trustworthy identifiers.

## 10. Reinstall, laptop replacement and relinking

A reinstall that preserves app data and secure credential storage keeps its identity. A true data wipe generates a fresh random installation ID and secret. Do not try to recover identity via hardware fingerprint or matching names.

A newly installed app follows the same name-only pending enrollment flow. Admin can explicitly select “replace installation for this existing learner,” verify it is the intended person out of band, revoke the old installation and link the new one. Preserve historical event ownership and record an audit entry. Never permit the new device to self-claim an old learner just by knowing a learner ID or name.

Old queued events from a revoked device cannot continue silently after replacement. If recovering them is necessary, use a separately reviewed export/reconciliation process with immutable IDs. A wiped laptop's unsynced data cannot be recovered from the server because it never arrived. State that limitation plainly.

## 11. Admin dashboard on the owner's laptop

Minimum useful screens:
- Overview: learner name, last recorded activity, last receipt, total focused time for chosen day/week, active course/video snapshot, enrollment/revocation state and stale/offline indicator.
- Learner detail: course → video activity, focused duration, playback position/completion and timestamped sessions. Show separate labels for real focused time and video content covered.
- Enrollment review: approve/reject/replace installation, with clear warning that name is unverified.
- Service health: recent safe error counts, quota headroom where available, pending enrollment cap, retention/storage summary and credential revocation controls.

“Currently watching” must be qualified: show “last reported video, 3 minutes ago,” not an asserted live state after the app goes offline. A focused timer is not proof that someone understood the content, and lack of focus is not proof they were not studying elsewhere.

Daily statistics use one fixed, explicitly labeled service reporting timezone selected before collection and handle daylight-saving transitions. Split focused intervals at reporting-day boundaries rather than assigning a whole midnight-crossing interval to its end day. If a batch only contains total focused time across gaps, retain focused sub-intervals locally or split at capture-time boundaries; do not invent a distribution. UTC event timestamps remain canonical. Historical timezone rebucketing is not offered after raw detail is pruned: changing the service timezone is a reviewed migration/new reporting version, not an innocuous dashboard toggle. If arbitrary historical timezone viewing becomes a requirement, retain sufficient time-bucket detail and revise storage estimates first. Build the UI mobile-friendly if useful, but a loopback-only dashboard is private to that laptop; accessing it from a phone is a separate networking/auth decision, not accomplished by responsive CSS alone.

## 12. Free-tier capacity and operating policy

Current official limits checked 19 October 2026:
- Provided hostname: workers.dev avoids a domain purchase for this personal pilot; verify the service guidance before broader production use. [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- Workers Free: **100,000 requests/day**, **10 ms CPU/request**. Network waiting is distinct from CPU, but parsing/auth/validation/SQL preparation still costs CPU. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- D1 Free: **5 million rows read/day**, **100,000 rows written/day**, **5 GB total account storage**. Indexed changes can increase billed/written rows. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- D1 Free: **500 MB per database**, 10 databases/account, 50 SQL queries per Worker invocation, 100 bound parameters/query, and seven-day Time Travel. Do not confuse 5 GB account storage with a single 5 GB free DB. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- Free quota exhaustion produces failures instead of guaranteed continued service; retain local outbox data. [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/)

Illustrative household estimate, not a benchmark: 8 focused hours/day at one ten-second batch gives 2,880 study events per learner/day. At 10 events/request the ingestion minimum is 288 requests/day, while a once-per-minute cadence could use up to 480 requests during those eight hours. Allowing 4–8 row writes per new event (receipt/event/rollup/index effects) gives roughly 11,520–23,040 writes/learner/day before progress and enrollment overhead. One or two learners plausibly fit the free budget, but actual schema/index measurements are a release gate, not a promise. Larger cohorts require increasing event aggregation windows or redesign, not an automatic paid upgrade.

Use safe default caps and monitoring before 70–80% of relevant budgets. The admin laptop's availability does not affect collection; opening a dashboard only adds its bounded reads. Do not poll all learners every few seconds. Paginate raw history and query indexed aggregates.

Storage growth is not free forever. Measure actual row+index size, then select retention. Proposed conservative default: 30 days raw event detail, 365 days daily rollups, and a compact 90-day receipt ledger with maximum accepted event age of 30 days. Events older than that are retained locally as explicitly blocked for admin reconciliation, not silently dropped. Enforce the age bound using server time for every duration-bearing event, with a bounded documented future-clock tolerance; reconciliation must never bypass the immutable identity/deduplication rules. This age bound is necessary if deduplication keys are deleted; deleting receipts while accepting arbitrarily old replayed events would reintroduce double counting. If uninterrupted long-offline history is more important, retain receipt IDs longer and budget storage accordingly. This tradeoff should be visible in the draft review.

Time Travel is recovery assistance, not a complete backup/export strategy. Provide an admin-only database/rollup export procedure and verify restore. Do not auto-upload backups to additional services or configure paid storage. Do not enable Workers Paid: its base price is not an unlimited fixed cost. No billing details or upgrade are required by this design; verify account-specific eligibility during separately authorized provisioning.

## 13. Privacy, security and retention checks

- Require explicit learner opt-in, no pre-consent queue/backfill; if learner is underage, appropriate guardian/admin requirements need to be resolved before rollout, without assuming age from “brother.”
- Separate consent epoch from device identity and admin approval/security revocation. Disable stops capture/sends and removes unsent copies; server-retained history remains until an authorized deletion/retention action. An explicit affirmative re-opt-in from the same simple privacy surface creates a new consent epoch using the same installation, with no server URL/code/login. It can resume only if admin approval is still valid: it cannot reactivate an admin-revoked credential. Opt-out notification is retried separately without study payloads when connectivity returns; local cessation is immediate.
- Endpoint fixed in trusted release config; TLS validation on, no redirects forwarding credentials, no “ignore certificate errors.”
- Rust owns secret storage and network access. Frontend receives only safe status, never token/secret/hash.
- Audit existing Tauri configuration: current CSP is null and filesystem capabilities broad. Introduce a deliberate CSP/command boundary review for the credential-bearing change; generic filesystem access must not expose new secrets. [Current config](https://github.com/TheShahnawaaz/LecTura/blob/1efd44891b08199aed2cc8d47a9521e8f6927fd4/src-tauri/tauri.conf.json#L21-L52)
- Dedicated payload types with strict unknown-field rejection. No arbitrary URL, SQL, filesystem path or raw database endpoint.
- Hash server-side tokens, redact Authorization and request bodies in logs, rate-limit authentication failures and return generic public errors.
- Source-controlled migrations/config contain placeholders, never real secrets or account IDs that grant access.
- Admin access is scoped and revocable; device access is write-own only. Row owner comes from authentication, never client payload.
- No claim of encryption-at-rest beyond the chosen services/OS facilities; verify service data handling during setup. “Private dashboard” means authenticated access, not that a hosting provider cannot process stored data.

## 14. File-level implementation plan

This list guides later implementation; it is not a statement that these changes exist in this draft PR.

1. src-tauri/src/db.rs: versioned sync tables, stable local batch IDs, idempotent migration and backup/rollback notes. Separate outbox lifecycle from video deletion.
2. src-tauri/src/study_sync.rs (new): capture serializer, atomic enqueue helper, native coordinator, secure credential-store adapter, enrollment/status/ack/retry logic and focused unit tests.
3. src-tauri/src/commands.rs: extend log_study_time with batch/session metadata and one transaction; hook update_video_progress into separate deduplicated progress snapshots. Restrict IPC inputs.
4. src-tauri/src/main.rs: register only minimal safe consent/status commands; manage coordinator; startup recovery. No learner URL/pairing command in production UX.
5. src/components/PlayerView.jsx: stable session/batch identity, monotonic focused-time accumulation, exact batch timestamp capture, pause/video-change flush; fix stale callback identity only where required for correctness.
6. src/App.jsx: connect heartbeat metadata; application-lifetime coordinator/status; first-use consent/name surface with no settings prerequisites.
7. src/components/StudySharingNotice.jsx (new): plain-language disclosure, name field, local-only choice, consent/paused/pending status. No password/code/URL.
8. cloud/worker/: schema/migrations, strict routes, authorization, enrollment budget, D1 idempotent ingest, aggregation and limits.
9. admin-local/: loopback server/proxy, secure admin credential adapter, CSRF/Host/Origin checks and responsive UI.
10. tests/: isolated SQLite persistence tests, Worker/D1 integration tests, frontend lifecycle tests and a two-installation end-to-end fixture.
11. docs/: setup/runbook, privacy/retention details, architecture/API schema, free-budget estimates, migration/backup and operator recovery.

Dependencies must come from official registries and be pinned with lockfiles. Do not add an entire remote-monitoring SDK. Reconcile Node/Vite engines and target-specific Tauri prerequisites before build checks; a successful Node test does not prove native desktop packaging.

## 15. Test matrix and release gates

| Test | Required evidence |
| --- | --- |
| Default local-only | No enrollment, identity transmission or study HTTP calls before affirmative consent |
| Enrollment retry | Same persisted identity/credential retries safely after timeout/restart; different secret cannot claim ID |
| Pending approval | No study payload upload before admin approves; normal offline/local study unaffected |
| Atomic capture | Inject error after local write/before outbox insert and vice versa; both rollback; repeated batch ID counts once |
| Offline/restart | Persist events, kill/reopen process, retain IDs/payload/attempt state and sync later |
| Duplicate/replay | Same batch repeated across requests increments duration once; conflicting same-ID payload rejected |
| Timeout after commit | Server commits but response lost; retry yields same ack without extra time |
| Partial/unknown ack | Only acknowledged sent IDs transition; unacknowledged remain; unknown IDs leave queue intact |
| Ordering | Older offline progress cannot overwrite newer same-device snapshot; duration still aggregates |
| Duration semantics | Pause/unfocus/sleep, high playback speed and seek do not inflate focused duration; video-switch attribution correct |
| Unauthorized writes | Missing/revoked/pending/wrong credential cannot insert any activity |
| Cross-learner access | A device cannot read/list peers, claim a learner or approve itself |
| Privacy contract | Add notes/screenshot/path/fullURL fields and assert both serializer exclusion and server rejection |
| Local admin security | CSRF, hostile Origin/Host, DNS rebinding/open-proxy attempts denied; no admin token in frontend bundle/storage |
| Revocation/reinstall | Name-only duplicate never merges; admin relink revokes old token, preserves history, audits mapping; concurrent revoke/relink versus ingestion cannot write under stale approval/ownership |
| Consent re-enable | New affirmative consent epoch resumes an approved paused installation, never a security-revoked one; old queued consent-epoch events cannot leak |
| Quota/abuse | Enrollment floods and 429/5xx do not exceed app budget or lose local events; backoff survives restart |
| Migration integrity | Seed bookmarks/history/download paths; migration and re-import-safe changes preserve them |
| Retention/dedupe | Pruning raw rows cannot permit a late replay to add duration again; old blocked events remain explainable |
| Platform builds | macOS arm64/x64 and Windows targeted compile, offline smoke and secure-store behavior |

Definition of ready: tests above pass against the final implementation; no secrets in repository/artifacts; local-only behavior verified; free-tier estimates measured; admin/learner notice understandable; rollback and restore rehearsed. Test on synthetic data before any real learner transmission. A draft PR is not a release or security certification.

## 16. Rollout and operator workflow

Phase A: review this plan and chosen defaults. Planning branch contains documentation only.

Phase B: implement local capture/outbox under a disabled feature flag, tests and safe migration. Keep ordinary local study unchanged.

Phase C: implement/test Worker/D1 and local admin against synthetic data; budget/abuse and authentication review. No real account provisioning until separately authorized.

Phase D: with explicit permission, create a Free-plan Worker/D1, apply reviewed migration, provision admin access securely, configure public endpoint in a test build. No paid upgrade/domain. Native distribution must still meet current platform build/signing requirements.

Phase E: one consented pilot installation, admin opens registration window and approves expected request. Check offline retries, dashboard totals and privacy payload capture. Compare server focused totals against known local batches.

Phase F: ship only after review and explicit release authority. Watch bounded safe diagnostics and quota headroom; keep an admin kill switch for new enrollments and ingestion. Turning the feature off must never break local playback/study.

Admin recovery runbook: revoke stolen token; close enrollment; export data before destructive migration; restore within documented window; refresh dashboard credential; investigate stale status without requesting private notes/screenshots. Never “fix duplicates” by deleting receipt ledger blindly.

## 17. Draft decisions and unresolved tradeoffs

Recommended defaults, without blocking the plan on further questions:
- Workers+D1 Free, workers.dev domain; local admin dashboard/proxy.
- Name once with affirmative sharing consent; local-only alternative.
- Registration windows plus admin approval; not open auto-approval.
- Random installation credential stored natively; no hardware fingerprints, no automatic name matching.
- No historical backfill; collect selected activity only after consent.
- Ten-second local durability, approximately minute-level transmission, maximum 10 events/batch initially.
- Actual focused duration distinct from progress; recent activity rather than asserted live monitoring.
- Raw/rollup/receipt retention and old-offline reconciliation as described above, subject to measured storage.

Items to settle during review: exact administrator label, expected learner count and daily hours, guardian requirements if applicable, reporting timezone, consent wording, raw-history retention preference and acceptable offline horizon. These are review choices, not reasons to introduce hidden tracking or paid services.

## 18. Current workspace and publication status

The previous implementation attempt was stopped immediately when requirements changed. It is preserved separately, unpushed, and its pairing/settings UX is superseded. It must not be included in this plan-only draft PR.

The clean planning worktree is on docs/study-sync-plan, based on the reviewed main commit. GitHub CLI is installed but gh auth status reports no logged-in GitHub host. Therefore creating the actual remote draft PR requires reconnecting an authorized GitHub identity; no remote PR URL is claimed until publication is verified. A durable copy of this plan and the parked-code checkpoint will be retained separately so loss of the cloud checkout does not erase the work.
