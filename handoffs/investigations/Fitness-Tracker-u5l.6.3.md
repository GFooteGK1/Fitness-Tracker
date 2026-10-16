# W5 authenticated source adapter verification

Owner: programming-quality thread. Local workspace: `.worktrees/programming-quality`.
Status: resolved; real local Auth/PostgREST/PostgreSQL integration passed. No production action.

September 27, 2026:

- Unit implementation passed 277 tests, lint and full typecheck after adding
  explicit missing-row guards (initial TypeScript TS18048). Independent review
  resolved silent PostgREST row-clamp detection with exact counts, lifecycle
  expiry during reads, and deterministic ordering. No blocker remains there.
- Real loopback Supabase was verified healthy and restricted to loopback ports.
  First fresh synthetic integration run `fcc75612-735f-478d-987a-ad6670674507`
  created two users and a new accepted fixture base. Source insertion as admin
  failed with SQLSTATE `42501`; the transaction returned an explicit failure.
  Receipt is under `output/app-quality-release/reviewed-dose-<runId>/receipt.json`.
  No uncertain mutation was retried; existing data and partial fixture retained.
  Revised hypothesis: workload fixtures must use the authenticated canonical
  capture flow, as the existing local-app-flow helper does, rather than direct
  admin workout insertion. Next attempt will provision the fresh owner profile,
  log through begin/freeze/commit RPCs and amend through amend_logged_activity.
  These are local test-fixture writes; the adapter remains read-only.

- Second run `e5e0b570-7cdd-47b5-aabe-acf1cda39d4c` passed canonical capture,
  then failed the owned-history assertion (zero normalized rows). Read-only SQL
  on the exact synthetic fixture proved expected blocks/date and created_at
  23:04:06.211Z, after the app run started near 23:04:04Z and failed in 745ms.
  Database clock lead caused created_at<=app-asOf filtering. Admin PostgREST
  fixture inspection returned 42501; the verified local container supplied
  decisive read-only evidence. Before third attempt: current adapter retains
  post-cutoff rows and rejects skew instead of reporting empty complete history.
  The success-path test waits only to the canonical receipt capturedAt, bounded
  below five seconds. No backdating, relaxed assertions, uncertain-write retry
  or production action. Prior synthetic fixtures remain preserved.

- Third run `e56b1a75-e661-425d-bf0c-73da1be27153` passed all24 assertions at
  2026-09-27T23:07:32.417Z: owned source read, stable repeated binding, no revision
  change from adapter reads, owner-only offline compilation, real RLS denial,
  canonical amendment/revision change, rejected stale registration and unchanged
  accepted plan. Receipt remains in its isolated output directory. 278 regression
  tests and lint pass after the skew guard. No remaining failure from this cycle.
