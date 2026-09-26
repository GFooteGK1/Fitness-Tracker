# Local release rehearsal — September 23, 2026

Real local PostgreSQL contention, application recovery, mobile acceptance and
synthetic logical restore have now been exercised. This is release preparation,
not production deployment or validation of physiological programming quality.
No paid Supabase service, paid model call, hosted mutation or production export
was used. The existing numerical-policy gate remains false.

## Targets and candidate

The isolated stack is `sociusfit-programming-local` on dedicated rootless Podman
connection `sociusfit-local`. PostgreSQL is 17.6; API `127.0.0.1:55321`, database
port 55322, application `127.0.0.1:3011`. Windows listeners were rechecked as
loopback-only. The app receives only the local anonymous key and an allowlist of
operating-system environment variables. It refuses automatic `.env` files.
Synthetic administration uses the local service key only to create test accounts.

The revised `20260921010000_coach_proposal_context_revision.sql` SHA256 is
`0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`.
This supersedes the preparation-time migration hash in older receipts. The
reviewed file was reapplied only to the local fixture and committed successfully.

## Defect found and fixed

The first multi-session run found that a workout mutation holds an owner-specific
recommendation-refresh lock. Initial proposal creation reached that lock before
the final revision assertion and waited for the harness's six-second lock timeout.
The existing NOWAIT assertion alone therefore did not bound this earlier wait.

Five decision RPCs now set a function-scoped one-second `lock_timeout`: revision
read, initial proposal, weekly review, replacement proposal and acceptance.
SQLSTATE `55P03` maps to HTTP 409 with a distinct busy-context message. The
existing stale-context `40001` fence remains. Caller timeout settings are restored
when the function returns. No earlier revision lock was introduced, avoiding a
reversal of the source writer's lock order.

One second bounds **each lock acquisition**, not the entire request. A failed
RPC rolls back its writes. Review storage and proposal creation are separate RPCs;
a saved review can remain if subsequent proposal creation conflicts.

## Real database and application evidence

- [21 real concurrency checks](local-concurrency-2026-09-23.json) passed using
  backend PIDs 1758, 1762 and 1760. Source insert/correction/deletion, commit and
  rollback schedules, retained proposal fences, deferred review commit failure,
  stale acceptance, fresh recovery, accepted replay, tenant isolation and internal
  ACLs were checked. Observer lock evidence distinguishes actual waiting from
  sequential calls. Early conflicts completed in approximately 975–1018 ms;
  deferred stale review failed at commit with `40001` in 3 ms. A real app
  acceptance request under a held source lock returned 409 with no acceptance.
- [14 fresh-account app checks](local-app-flow-2026-09-23.json) passed after the
  migration fix. Actual Auth, HTTP routes, compiler, RPCs and database readback
  verified initial acceptance, next review, source mutation, the exact stale
  conflict, hidden stale controls, fresh proposal recovery and foreign-owner
  denial. Auth uses the installed browser cookie adapter; this is not a mocked
  service test. The run preserved all synthetic records.
- Normal browser sign-in also succeeded. At 390×844, the real Program page showed
  the pending proposal, rejected acceptance after an independent source update,
  removed stale acceptance controls, generated a fresh review and accepted only
  the matching proposal. The historical explanation remained available.
  [Database readback](local-browser-readback-2026-09-23.json) confirmed the adjacent
  week active and the earlier accepted intent hash unchanged.
- An expanded historical explanation exposed horizontal overflow from a long
  evidence code. Both explanation bodies now wrap long words. Expanded-state
  readback changed from document width 552 px to 375 px in a 390 px viewport.
  Sanitized [stale-context](local-mobile/stale-context.png) and
  [accepted-origin](local-mobile/accepted-origin.png) screenshots are committed.
  Additional originals are preserved under ignored `output/app-quality-release/` as
  `mobile-stale-context.png`, `mobile-accepted-origin.png` and
  `mobile-accepted-origin-wrapped.png`. This is desktop Chromium with mobile
  dimensions, not physical-phone evidence. Browser viewport override was reset.

The fixture omits some historical dashboard views, so dashboard coverage is not
claimed. The existing server sign-in route returned no cookie; the normal browser
sign-in worked. Existing Next 15 synchronous-cookie warnings remain a separate
auth-maintenance concern tracked in `Fitness-Tracker-9po`. New setup/intent correction and sensor-count display
retain their earlier synthetic browser coverage; this real run did not exercise
all feature-flag combinations.

## Synthetic recovery

[Recovery receipt](local-recovery-2026-09-23.json): 95 tables, 351 rows and one
accepted plan matched a consistent exported snapshot after a full custom-format
dump and single-transaction restore into a new local database. Counts and row
hashes, schema, owners, grants, RLS and representative functions matched. All 287
CHECK definitions were compared canonically because PostgreSQL removes redundant
parentheses during restore. Other schema text was compared directly after
normalizing random dump markers.

This snapshot preceded the contention fix. It verifies the recovery harness,
not the final candidate schema or production recovery. Existing local cluster
roles, extension binaries and configuration were reused. Object storage, external
services, sequences against an MVCC snapshot and point-in-time recovery are not
covered. Initial ownership and CHECK-format comparison attempts are preserved;
the source database and all restored targets remain intact.

## Verification and repeatability

107 focused API, helper, database and Program UI tests passed across nine files.
Independent runtime review passed 83 tests across seven overlapping files; these
counts are not additive. Full TypeScript and focused ESLint passed. An ignored
earlier metadata probe needed explicit query-result types for the TypeScript
check; no application typing change was needed. Independent review also checked
the local target isolation, recovery comparisons and final concurrency harness.
The production build passed with local-only configuration and no service keys.
Build ID `lpaPhHxhPDuzGAXeYPFmB` then passed the same 14 checks in production mode
with another fresh account pair at 14:16:18 UTC; see the
[production-mode receipt](local-production-app-flow-2026-09-23.json). Dev and
production app processes were stopped afterward. Local Supabase remains running.

## Old/new schema rehearsal

[Ten cutover checks](local-cutover-2026-09-23.json) passed in a separate new local
database built from 58 manifest-verified pre-revision bootstrap sections and real
Supabase Auth schema. The cached revision section was excluded; the exact revised
migration above was then applied. Old pending first acceptance and a new unstamped
write returned `40001` without record changes. An already accepted request replayed
identically and preserved the original plan/session/proposal/program hashes.
A new stamped proposal was accepted. Reapplying the migration preserved records,
function catalog definitions and all five timeout settings.

The source database was read-only throughout this separate rehearsal. The first
empty fixture stopped on a missing UUID extension; explicitly creating the
already-installed extension version in a new fixture resolved it. All fixtures
are preserved. This proves schema and writer compatibility boundaries, not an
operator-controlled traffic pause, app rollback or production cutover.

## Repeat commands

```powershell
node scripts/release/local-app-server.mjs dev
node scripts/release/local-app-flow.mjs --new-run
node scripts/release/local-context-concurrency.mjs --http
node scripts/release/local-recovery-rehearsal.mjs
node scripts/release/local-cutover-rehearsal.mjs
```

These scripts require the already-provisioned isolated stack. `--new-run` creates
two new synthetic local accounts and preserves their records. Default app-flow
mode reserves the foundation accounts; it fails if they already have a program.
`--resume-review` is restricted to its still-current, pre-mutation checkpoint.
Private credentials and dumps remain ignored. Stop the dev server before using
the server helper's `build` or `start` mode. Production start requires the receipt
written by a successful local build, matching `.next/BUILD_ID`, the fixed local
API and anonymous-key hash. This prevents accidentally serving an unrelated
build with a different baked-in public database destination. An unreceipted build
was rejected before launch; a rebuilt artifact `N1fNUQnlscYENMsnBEVzj` started
successfully and returned 401 for an anonymous weekly read. The launcher guard
was independently reviewed; the app source was unchanged from the full
production-mode flow above. The verification server was stopped afterward.

## Remaining release boundary

Production recovery still needs secure export access and an explicitly approved
private backup/recovery destination. A tested production write-pause mechanism,
a retained revision-compatible application rollback artifact, final candidate CI
and target-specific migration/deployment approval remain release gates. The old
main application is not a compatible rollback after the revision migration.
Local rehearsal does not prove hosted networking, effective production settings
or production recovery. No merge or deployment is authorized by this receipt.
