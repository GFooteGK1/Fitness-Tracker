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

The matching application source is commit `7d8679b` in PR #48. Exact source-
head CI passed tests, strict TypeScript, lint, and production build in 2m05s.
Vercel reported the preview Ready; its direct URL redirects to Vercel SSO, so
the browser's active work identity was not connected to this personal project.
The PR has not yet merged and the application has not yet deployed to
production. Final exact-head CI, merge, Vercel production verification, and the
strongest safe application canary remain.
