# Private study sync implementation

This is a local, synthetic-tested implementation for review, based on `docs/private-study-sync-plan.md` recovered from Library (42,344 bytes, reviewed base `1efd44891b08199aed2cc8d47a9521e8f6927fd4`). The companion Library patch was recovered separately (43,278 bytes); it contains the same planning document. The old implementation ZIP was not reused.

The user's October 22 amendment supersedes the original plan's opt-in language: sharing is enabled by default, with no separate checkbox or affirmative consent gate. The learner sees a persistent, plain-language sharing notice, supplies a name once, and can pause before continuing or at any later time. Enrollment still requires administrator approval. Age is unknown; appropriate requirements for minors must be resolved before a real rollout. No age is inferred from a family relationship.

## Included behavior

- React player measures focused playing wall time with a monotonic clock, caps sleep/timer gaps, keeps stable session and batch IDs, splits intervals at UTC midnight, and retries a failed local flush with the same immutable batch. Playback speed and seeks do not add studied duration.
- SQLite migration 8 makes a consistent online backup before migration. Local study insertion and the dedicated outbox payload commit in one transaction. Duplicate batch IDs do not double count. No historical rows are scanned into the queue. A forced quit can lose the last in-memory batch (normally up to about ten seconds); persistent local-write failures can leave more in memory until recovery. Outbox snapshots do not have cascading video foreign keys.
- Name-only automatic enrollment sends no study metadata. Registration starts closed, opens for at most 60 minutes, and uses a transaction-enforced pending cap and daily budget. Pending devices can check their own status but cannot ingest or read analytics.
- The native coordinator owns all secrets and HTTP. It persists retry deadlines, uses a single sender lease, wakes at startup/reconnect with jitter, normally sends at minute cadence, and polls pending status at most once per five minutes. Approved empty queues do not produce periodic network requests.
- Installation-specific random 256-bit secrets use the OS credential store (`keyring`); D1 stores SHA-256 token hashes. No administrator credential is present in the learner app or frontend. The fixed HTTPS service origin and recipient label are trusted build-time configuration, with no learner configuration screen.
- D1 batches and SQLite triggers guard approval, revocation, sharing epoch, ownership, deduplication and event budget at mutation time. Exact retries acknowledge the same IDs. Conflicting immutable identities roll the request back. Older progress cannot overwrite a newer local sequence, and progress adds zero duration.
- Pause stops local capture immediately and deletes unsent sharing copies, while keeping local study history. The command joins any in-flight sender before returning; an already submitted request cannot be recalled. A payload-free state update is retried separately. Resume creates a new sharing epoch and cannot override security revocation.
- The local administrator server binds only to `127.0.0.1:4179`. The administrator enters an application credential interactively into process memory. A fixed-route HTTPS proxy, strict Host/Origin checks, per-launch CSRF, JSON-only mutations, no CORS and a restrictive CSP protect the API boundary. The UI contains no admin credential and uses text rendering for names/titles.
- Dashboard views show names, course/video IDs and titles, focused duration, playback position/completion, daily and last-seven-day UTC activity, raw sessions, last recorded activity, server receipt, and last sync receipt. Enrollment review supports approve/reject, explicit replacement/relink and revocation. Health includes application caps, retention and an ingestion kill switch.

## Run the synthetic dashboard

Use Node 22.12 or newer (an existing Node 22.22 was used on this Mac):

```sh
node admin-local/server.mjs --demo
```

Open `http://127.0.0.1:4179`. This mode constructs no upstream client and uses fictional fixtures only. It does not enroll a real laptop, store a real application credential, or contact Cloudflare. The demo's registration and ingestion controls change only process-local synthetic state.

## Tests and builds

Install from the three committed lockfiles, with approval where your environment requires it:

```sh
npm ci --ignore-scripts
npm --prefix tests ci --ignore-scripts
npm --prefix cloud/worker ci --ignore-scripts
npm test
npm run test:native
npm run build
```

`npm test` includes Node security/validation tests, a standard-library Python SQLite adapter, React/DOM lifecycle tests, and an actual local `workerd` + emulated D1 integration fixture. It opens loopback listeners, so restricted sandboxes may need local execution permission. Python 3 with SQLite JSON support is needed for the lightweight SQL adapter; override `LECTURA_TEST_PYTHON` to select an installed runtime. No tests use an existing LecTura database, OS credential entry, or a production endpoint.

`test:native` uses the `stable` Rust toolchain explicitly and disables the missing sidecar in **test configuration only**. It checks both library and binary, then runs native tests, without opening the desktop application. The repository does not include platform `yt-dlp` sidecars; real packaging still needs the official reviewed sidecars and platform signing setup. Rust test/debug metadata is disabled to limit disk use.

New code formatting is checked with `npm run check:sync`. There is no existing TypeScript or ESLint project configuration to claim as an additional check. The original root dependency lockfile is preserved. Existing dependency advisories and bundle-size/native upstream warnings are recorded in the validation report and were not fixed as unrelated work.

## Data and privacy contract

Only allowlisted scalar payload fields leave the native sender: schema/event/installation/sharing-epoch identifiers, global local sequence, captured UTC time, course/video IDs and title snapshots, playback position/completion, and—for focused study batches—session/batch identity, start/end UTC milliseconds and focused milliseconds. No notes, screenshots, files, local paths, full video URLs, download errors, device fingerprints or whole database are serialized. Strict server unknown-field rejection provides a second boundary.

The reporting timezone is fixed **UTC** in this implementation. It is not inferred from location or exposed as a dashboard toggle. UTC has no DST transitions. Supporting another timezone requires reviewing capture splitting and a versioned data migration before collection; historical rebucketing after raw retention is not promised.

Server raw events retain 30 days, daily rollups 365 days, receipts 90 days and progress at most 365 days. Maintenance is bounded to 1,000 eligible rows per table/run. Duration-bearing events older than 30 days or more than five minutes in the future are rejected, even after receipt pruning. Old queued activity is explicitly blocked locally for reconciliation rather than silently discarded. Pending requests become rejected after seven days, preserving their credential/installation tombstone. A pause does not delete already received server history.

## Deliberate constraints and release gaps

- Cross-course reuse of the same video is rejected atomically. Metadata re-import safely updates an existing course/video while preserving progress, study logs, bookmarks and downloaded paths. Full multi-course video memberships are not implemented. This is a conservative explicit membership policy, not a claim that shared membership is supported.
- Authentication is installation-based and names are unverified. A copied credential can impersonate that installation. This is observational study reporting, not verified identity, attendance, understanding, or live presence.
- Production provisioning, deployment, credentials, account-specific free-plan eligibility/quotas and real learner approval have **not** been performed. The build defaults to no configured endpoint, preventing enrollment and upload.
- macOS arm64 compile/persistence checks do not establish macOS x64/Windows packaging, real OS secure-store behavior, or a complete native player/network end-to-end run. Native HTTP retry branches have persistence/ack tests and server fixtures; real TLS/secure-store integration remains a release gate.
- Cloudflare CPU and billed row/index measurements cannot be inferred from local timing. Review account metrics during separately authorized synthetic staging before real rollout. Never auto-upgrade or enable a paid service.
- The UI browser bridge was unreliable during validation; see the validation report for verified DOM flows and the remaining visual/native smoke checks. DOM tests do not replace a visual inspection of platform WebViews and YouTube/offline playback under the tightened CSP.
