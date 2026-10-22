# Operator runbook (future provisioning, not executed)

Real rollout requires separate authorization. Resolve recipient identity/contact, expected users/hours, appropriate requirements if minors are involved, privacy wording and retention review first. Learner ages remain unknown until established appropriately.

## Configuration and access

Keep Workers/D1 on Free. `cloud/worker/wrangler.toml` contains a deliberately unusable database placeholder, not a production account or database identifier. Its rate-limit namespace numbers are public examples; confirm uniqueness within the intended account before use. Rate limiting is approximate per Cloudflare location; the atomic D1 registration/event budgets are separate global controls. Enrollment/auth fail closed if rate-limit bindings are absent.

The operator must provision an independent high-entropy application-admin bearer credential and store only its SHA-256 hash in the Worker's `ADMIN_TOKEN_HASH` secret. This is not a Cloudflare account API key. Do not put a raw admin credential in `.env`, shell history, a URL, frontend storage or the learner build. Rotate by replacing the server hash and restarting the local proxy with the new credential; all old admin access then fails. Never log request bodies or Authorization. Worker observability is disabled in the example configuration to avoid default body/credential logging; separately review platform logging and provider data processing.

After the operator has separately provisioned and reviewed the service, build the learner app with `LECTURA_SYNC_ORIGIN` set to the fixed HTTPS origin and `LECTURA_SYNC_RECIPIENT` set to the intended administrator's understandable identity/contact. No learner URL, login, invite, pairing code or settings step exists. Leaving this configuration absent keeps the network sender inactive, while sharing remains the visible default preference.

For the actual local admin proxy, set only the public service origin, then enter the dedicated credential interactively:

```sh
LECTURA_ADMIN_ORIGIN=https://YOUR_REVIEWED_WORKER_HOST node admin-local/server.mjs
```

The proxy requires a TTY and stores the entered credential only in process memory. Close the process when finished. It never binds to the LAN. Phone/LAN access is a separate authentication/networking design.

## Enrollment, replacement and revocation

Open a short registration window only when expecting a learner. The learner provides a display name, sees what is shared and with whom, and can pause. Verify the pending installation out of band; names alone are insufficient. Approve as a new learner unless explicitly replacing a verified prior installation. Use the exact learner ID shown in the learner card for replacement; review the warning. Replacement atomically revokes prior installations and preserves historical ownership. Repeated approval is a conflict rather than creating another learner.

To handle a lost laptop, revoke its installation and close the registration window. Existing unsent activity on that laptop cannot silently pass the approval guard. A true wipe generates a new installation/secret; never recover ownership by name or hardware fingerprint. A paused installation must resume with a new sharing epoch. Revoked/rejected approval cannot be restored by learner controls.

## Outages and recovery

Offline study is saved to SQLite first. Network/5xx errors persist exponential backoff with jitter; 429 observes bounded `Retry-After`; 401/403 suspends uploads and checks status conservatively. Unknown acknowledgments retain the queue. Partial acks mark only sent IDs explicitly acknowledged. 413 reduces the batch size. A single oversized/invalid event is blocked; an immutable conflict quarantines the affected request (which may contain several events) for operator inspection. Do not replace event IDs to work around conflicts or delete receipt keys to “fix totals.”

An enrollment secret lost from the OS store is not recoverable through the display name. Preserve the local database and OS credential entry together. Migration creates `lectura.pre-sync-<timestamp>.db` alongside the original DB using SQLite's online backup. To roll back, close the app, retain the newer DB separately, restore the backup into a synthetic copy first, and verify with the compatible old app version before replacing a real database. Never operate on a running user's DB or include the credential store in a shared backup.

## Retention, export and restore

The scheduled retention handler prunes bounded batches. Observe backlog and storage growth; review a separately authorized maintenance change if 1,000/day cannot keep up with retention needs. The hard 30-day accepted-event age and 90-day ledger are coupled; do not relax event age after deleting deduplication receipts. Keep locally blocked old events for a reviewed reconciliation process that preserves immutable IDs.

Before destructive server migrations, an authorized operator should use Cloudflare's documented D1 export facility to produce a local SQL export, store it in a protected location, and import into a separate synthetic/local D1 instance to verify learners, snapshots, receipt uniqueness and rollup totals. This repository's `tests/backup-restore.test.mjs` exercises the schema/receipt behavior through SQLite export/restore; it is not a production backup. Time Travel is additional recovery assistance, not the whole backup strategy. Do not auto-upload exports to other services or enable paid storage.

## Capacity policy and known limits

The default per-service caps are 20 pending installations, 50 new registrations/day, and 6,000 accepted new events/day; enrollment windows are at most 60 minutes. These caps are conservative controls, not a guarantee of free-tier eligibility. Idempotent replay does not consume the new-event budget. Existing approved devices work outside the enrollment window.

One 8-hour learner generates roughly 2,880 ten-second study events plus coalesced progress. The 6,000-event cap may intentionally defer two heavy users. Each accepted event performs receipt, study/rollup/progress, counter and index work; database billing can count index effects and differs from SQL statement count. The local ten-event fixture reported 121 rows written and 119 read on the ingestion trigger path; this is emulated evidence only. Measure actual account rows read/written, storage and Worker CPU, maintain headroom, and aggregate more coarsely through a reviewed change if needed. Exhaustion should preserve local data and fail closed, never trigger a paid upgrade. The health screen shows app counters, not account-wide Cloudflare quota headroom or exact error telemetry.

Primary implementation references: [D1 atomic batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [rate-limit bindings and their accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Re-check current account limits and eligibility during authorized provisioning.
