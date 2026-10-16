# Reviewed-session storage and actual set reports

Date: September 27 Chicago / September 28 UTC, 2026.
Canonical child: `Fitness-Tracker-u5l.6.7`; W5 remains in progress.

The additive migration `20260928010000_reviewed_session_set_reports.sql` permits
the distinct reviewed-session format and requires exact correspondence with its
dated parent-plan session, including position. Mixed legacy children under a
reviewed parent are rejected. Existing legacy constraint semantics are retained.
This is a storage/correspondence check, not a second numerical compiler or proof
of review authority. The existing TypeScript read parser still validates content.

`record_reviewed_session_set` derives the owner from Auth, locks the session and
active accepted plan, resolves one stable activity, and saves the full original
prescription and activity beside explicit actual work. Reports retain set number,
side, occurrence timestamp, reps/duration/distance, load unit/convention, actual
RPE and scale, rest, stopped status, symptoms, notes and optional rep-level mean
concentric velocity with device/method. Missing values stay null. Additional
actual sets do not change targets. Sensor reports do not become formal tests.

The owner-only FORCE-RLS table is append-only through the RPC. Corrections use
the next revision for the same session/activity/set/side; a stale revision fails.
Same-request exact replay returns the original receipt even after terminal/stale
state. A changed payload with the same key fails. Reports and corrections advance
the coaching context revision; authenticated reviewed-context reads include raw
versions and cannot silently reuse old evidence. Consumers must select the latest
revision per set rather than summing corrections.

Reviewed proposal creation/acceptance through old RPCs remains explicitly fenced.
The old session completion path is also fenced because it cannot preserve this
set contract. A new atomic completion integration is still required. No HTTP
capture UI or route was added; numerical generation remains disabled.

## Verification

- Seven focused regression suites passed: 232 tests (storage/capture, old signals,
  context revisions, TS set reports, authenticated context, reviewed rolling week,
  weekly API). An additional legacy storage/old signal compatibility case passed
  in the final 35-test database suite.
- Full TypeScript and focused ESLint passed; diff whitespace check passed.
- Independent review ran 120 tests and found no remaining blockers after fixes.
  Review caught string-enum coercion/calendar rollover and mixed-format children;
  each was repaired and covered. Proposal insert/status fences are tested.
- Local migration applied once to the verified synthetic PostgreSQL17 container
  `supabase_db_sociusfit-programming-local`, after loopback listener/label checks.
  SHA256: `A9DC6FC1B193D9D113059F09A409F82B452085D9EF58C248F50026A09398E035`.
  Log: `output/app-quality-release/reviewed-set-migration-bc39fafe-9db2-4200-a054-079c1ef2812a.log`.
- Real Auth/PostgREST/PostgreSQL week run
  `d461c3bc-e406-4213-a312-ac28de60044a` passed 39 checks: exact five-session storage,
  readback, owner isolation, source invalidation, correction history/snapshots,
  concurrent competing revision writers and identical concurrent retry receipts.
- Session regression run `b06c0718-27b8-49b2-9ebe-e54c35843a8b` passed 24 checks.
  Receipts: `output/app-quality-release/reviewed-dose-<runId>/receipt.json`.

The harness seeds fresh synthetic accepted parent plans through administrative
fixture setup. It does not prove proposal acceptance, user completion or hosted
migration compatibility. Existing local fixtures remain intact. No production
migration, deployment, hosted write or numerical activation occurred.

## Remaining W5 work

Atomic reviewed completion must preserve each actual set in the canonical workout,
avoid double-counting corrections, and retain monitoring/provenance distinctions.
Then complete canonical movement/equipment mapping, trusted numerical proposal
registration and atomic source-current acceptance, route/UI integration and full
saved/read/render/lifecycle checks. Compiler results still say non-persistable:
storage capacity alone does not grant generation or acceptance authority.
Broader P0/P1/W10, holdout and release gates remain open. Changes uncommitted.
