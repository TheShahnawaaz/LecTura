# Initial checkpoint validation — 22 October 2026

The later `follow-up-validation.md` supersedes the native TLS/Keychain, visual, course-membership and publication gaps recorded here. This file preserves the initial checkpoint evidence.

Validated on the connected Mac's local task workspace, based on repository commit `1efd44891b08199aed2cc8d47a9521e8f6927fd4`. No checkout instructions were present (`AGENTS.md`, checkout `.agents/skills`, and the specified local Codex memory summary locations were absent). The checkout was initially clean. The exact saved plan is preserved byte-for-byte in `docs/private-study-sync-plan.md` (42,344 bytes), and the 43,278-byte companion patch was recovered locally. The older implementation backup was not used.

## Passed against the final implementation

| Check | Result |
| --- | --- |
| Node security, lifecycle, SQLite, backup/restore and workerd/D1 suite | **23 tests passed**, 0 failed |
| Rust native persistence and history tests | **9 tests passed**, 0 failed |
| Rust library and binary check, macOS arm64 | Passed, with test-only sidecar override |
| React/Vite production build, Node 22.22.0 | Passed |
| New-code Prettier, JavaScript syntax and selective Rust formatting checks | Passed |
| Git whitespace check | Passed |

The tests cover default-enabled disclosure with no checkbox, recipient/name-only UI, duplicate clicks, repeated pause/resume, pause after revocation, interrupted UI mutation/refresh and recovery, escaped names/titles, loopback Host/Origin/CSRF/CORS/open-proxy boundaries, enrollment closure and concurrent last-slot budgets, replay/changed-secret enrollment, pending/revoked writes, cross-device/admin access, atomic local capture failure in both directions, stable batch retries, immutable payload conflicts, partial/unknown acknowledgments, progress ordering and zero duration, sleep/focus/seek/high-speed semantics, UTC midnight splitting and exact seven-day summaries, metadata re-import preservation, fractional local statistics, deletion-independent outbox snapshots, restart/backoff persistence, age/retention bounds, and synthetic export/restore with deduplication retained.

The actual local workerd/D1 fixture used two fictional installations with identical names, verified that they remained separate learners, retried committed events, and checked all-or-nothing conflict rollback. A separate ten-event SQL batch using the actual ingestion table/trigger path reported **121 rows written and 119 rows read** in emulated D1. This is a small local measurement, not a claim about account billing, distributed rate-limit accuracy, production CPU, storage growth or free-tier eligibility. The application keeps conservative budgets and fails closed.

Full command output is included under `validation/` in the review archive. Test data and credentials are explicitly synthetic. Native tests never opened an OS credential entry, existing application database or real service endpoint. The synthetic dashboard process was stopped after validation.

## Initial failures resolved during validation

- The sandbox initially could not reach repository/Library download hosts or bind loopback listeners. Authorized network/local execution was used; no automatic approval denial remained.
- This Mac had Node 20.18 as its command default, which is below the locked Vite engine requirement. The existing `/opt/homebrew/bin/node` 22.22.0 was used without changing Node defaults.
- Rustup initially had no toolchain. The user approved build dependencies, stable Rust was installed, and the original no-default preference was restored after checks. Scripts explicitly select `+stable`.
- The repository's missing platform `yt-dlp` sidecar initially blocked Tauri's build step. Tests/checks use a configuration override with an empty sidecar list; the shipping configuration is preserved.
- Disk exhaustion interrupted a broader check and the new test-runtime install. Only task-generated build outputs were removed; rebuilding with debug metadata disabled and regenerating the interrupted new lockfile resolved it.
- Tests caught and fixed a dashboard syntax error, cross-site initial navigation handling, a runtime fixture adapter mismatch, and fractional-second compatibility with existing local statistics.

## Unrun checks and release limitations

- Full native app launch, real OS secure-store behavior, real TLS/HTTP sender integration and an uninterrupted native player-to-dashboard end-to-end test were **not run**. No real learner enrollment, uploads or application-admin credentials were created.
- The browser bridge timed out repeatedly. Chrome initially displayed the origin guard rejection; that navigation case was fixed and is covered by HTTP/DOM regression tests, but a final visual browser/native WebView smoke check was **not verified**. DOM checks are not a visual-layout certification.
- macOS x64 and Windows builds, packaging/signing, official sidecar integration, and YouTube/offline playback under the tightened CSP remain platform release gates.
- Real Cloudflare account setup, D1 migration/deployment, account-wide quota/CPU/storage measurements, recipient configuration, a production backup/restore rehearsal, and real credential provisioning remain separately authorized work. The source defaults to no configured service endpoint.
- Reporting is fixed UTC. Another timezone requires a reviewed capture/data migration, not a settings toggle. Full shared-video membership across courses is not implemented; an ambiguous import is rejected rather than reassigning historical ownership.
- Existing root dependency install reported 24 advisories (2 low, 5 moderate, 16 high, 1 critical). No unrelated upgrade was attempted and the original dependency lockfile is unchanged. Existing upstream warnings remain: Vite's >500 kB chunk advisory, `active_playlists` dead-code warning, and Rust's future incompatibility notice for `block` 0.1.6. Happy DOM also warns about evaluating JavaScript; the test evaluates only source-controlled synthetic fixture code.
- No inferred learner age exists. Appropriate requirements where minors may be involved must be resolved before real rollout.

No PR, push, merge, release, deployment, account setup or paid service change was performed. This is reviewable local implementation, not release approval or security certification.
