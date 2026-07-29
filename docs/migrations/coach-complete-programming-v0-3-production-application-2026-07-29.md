# Complete programming v0.3 production migration application — 2026-07-29

## Target

- Supabase project: `fitness-tracker`
- Project reference: `auolnfwetmfcwhtvakzy`
- PostgreSQL: 17.6
- Execution path: authenticated Supabase CLI `db query --linked`

The current Supabase changelog was reviewed before application. Its active
breaking-change notices concern Management API log queries, extension version
pinning, and self-hosted services; none changes PostgreSQL check-constraint
semantics or this hosted-project migration path.

## Preflight

Read-only production inspection confirmed five auth users, one training
program, two plan versions, 96 prescribed sessions, and a validated legacy-only
`prescribed_sessions_contract_check` constraint.

## Application

`coach-complete-programming-v0-3-migration.sql` was applied to production
twice. Both executions completed successfully. The migration replaced only the
prescription JSON check, kept legacy v0.2 rows valid, added the validated v0.3
format, and changed no plan or session row.

## Verification

`verify-coach-complete-programming-v0-3-migration.sql` completed successfully.
The rollback-only verifier proved that representative legacy v0.2 and complete
v0.3 prescriptions pass, an incomplete prescription fails, and the live
constraint contains both contract markers.

Independent readback after the verifier confirmed:

| Check | Result |
| --- | --- |
| Auth users | 5 |
| Training programs | 1 |
| Plan versions | 2 |
| Prescribed sessions | 96 |
| Constraint validated | `true` |
| Legacy v0.2 accepted | `true` |
| Complete v0.3 accepted | `true` |

The counts exactly match preflight, so the migration and verifier did not alter
Greg's accepted program state.

## Security posture

Direct production readback confirmed forced RLS remains enabled on
`training_programs`, `training_plan_versions`, `prescribed_sessions`, and
`adaptation_proposals`; anonymous select and insert privileges remain denied on
all four. The existing plan-version content-protection trigger and prescribed-
session content-protection trigger remain installed. The authenticated update
grant on prescribed sessions also remains unchanged so session completion state
can progress through the existing protected path.

This compatibility migration creates no table, function, policy, grant,
trigger, index, extension, or RPC. The authenticated CLI exposes no Database
Advisor command, so the hosted Advisor results were not re-read through this
release path. The direct RLS, privilege, trigger, row-count, and installed-
constraint readbacks cover every object this migration could affect.

## Application release

The matching application source is commit `7d8679b` with release evidence in
`e38f00a`. PR #48's exact final-head CI passed tests, strict TypeScript, lint,
and production build in 1m47s, and its Vercel preview was Ready. The PR was
squash-merged to `main` as `cea983d`.

Main CI run `30452185991` passed the same gates in 2m05s. Supabase's merge
integration completed successfully and recorded migration version
`20260728234500`. Vercel reported the exact merge commit deployed successfully
to Production. The public `/program` route returned HTTP 200.

Post-merge database readback again confirmed five auth users, one program, two
versions, 96 sessions, and a validated constraint accepting both formats. The
counts still match preflight.

The protected preview redirects to Vercel SSO, so the browser's active work
identity was not connected to this personal project. A direct authenticated
browser canary was not performed because the local browser-control runtime could
not start. No production plan was created or accepted during verification; the
rollback-only database verifier supplied live contract proof without altering
Greg's athlete state.
