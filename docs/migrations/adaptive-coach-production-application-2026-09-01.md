# Adaptive coach production database application — 2026-09-01

## Result

Greg explicitly authorized writing the layered adaptive-coach schema to the
production `fitness-tracker` Supabase project on 2026-09-01. The four additive
migrations applied successfully in the approved order. Production migration
history and a zero-change dry run confirm that the database is current.

During this database application, no application commit, push, deployment,
production athlete workflow, Qwik import, adaptation proposal, or plan
acceptance was performed. Branch publication was authorized separately later.

## Target identity and preflight

- Supabase project name: `fitness-tracker`
- Project ref: `auolnfwetmfcwhtvakzy`
- PostgreSQL release reported by the project inventory: `17.6.1.054`
- CLI used: Supabase CLI `2.116.0`, invoked ephemerally without changing project
  dependencies.

The isolated worktree initially had no Supabase link. After explicit production
approval it was linked to the exact project ref. The first migration-list check
found remote version `20260730130953` without a local file, so the dry run
failed closed. Production migration history was not repaired or changed.

`supabase migration fetch` retrieved the missing historical migration as
`20260730130953_coach_workout_runner_v0_5.sql`. That exact reconstructed file
was restored locally with SHA-256:

`F505BFAB66839C9F3DB236E311E10AFA55C5827B41EBC00350467F819B244A43`

After restoration, all six prior local and remote versions aligned. The final
dry run listed exactly these four pending migrations, in order, and reported no
seed or role file:

1. `20260901152000_layered_adaptive_evidence.sql`
2. `20260901170000_atomic_coach_session_completion.sql`
3. `20260901183000_qwik_vbt_import.sql`
4. `20260901220000_coach_trust_review.sql`

## Application

The linked CLI applied the exact preflighted set with:

```text
npx.cmd --yes --package supabase@2.116.0 supabase db push --linked --yes
```

All four migrations reported `Applying migration ...` and the command completed
with `Finished supabase db push.` No seed or role file was applied.

## Production readback

Post-application evidence:

- `supabase migration list --linked` reports all ten local and remote migration
  versions aligned through `20260901220000`.
- `supabase db push --linked --dry-run` reports `Remote database is up to date`
  with an empty migration, seed, and role set.
- `supabase db lint --linked --schema public --level error --fail-on error`
  returned no findings.
- `supabase inspect db table-stats --linked` shows all seven new tables live:
  `measurement_imports`, `performance_observation_groups`,
  `performance_observation_values`, `performance_observation_links`,
  `coach_memory_review_events`, `measurement_import_review_events`, and
  `adaptation_proposal_review_events`.
- Each of those seven tables had an estimated row count of zero immediately
  after application. No athlete Qwik or review data was created by the release.
- `supabase inspect db index-stats --linked` shows the expected owner-scoped,
  source-idempotency, comparability, lineage, session, workout, and review-event
  indexes on the new tables.
- Production TypeScript schema generation includes the seven tables plus
  `record_coach_session_result_v2`, `record_qwik_import_v1`,
  `review_coach_memory`, `correct_coach_memory_with_review`,
  `review_qwik_import_v1`, and `reject_adaptation_proposal`.

## Verification boundaries

The exact SQL repeat-application and rollback-only verifier files already pass
against disposable PostgreSQL-compatible databases locally. They were not
executed directly against production in this pass because this host has no
`psql`, the supported schema-dump command requires unavailable Docker Desktop,
and the signed-in browser-control runtime failed before opening the Supabase SQL
editor. A proposed credential-extraction helper was rejected and was not
created, run, or repackaged.

Therefore the confirmed production claims are migration application, migration
history alignment, zero-change dry run, live table/index/RPC presence, zero new
import/review rows, and zero database-lint errors. Direct production execution
of the apply-twice and rollback-only SQL suites remains unverified.

## Recovery boundary

The migrations are additive. The safe recovery path is to leave the new schema
in place and keep the currently deployed application unchanged. No destructive
down migration is approved. Dropping the new tables, functions, constraints,
policies, or history would require a separate data-retention review and explicit
authorization.

## Next release gate

The production application still needs a separately authorized deployment and
authenticated end-to-end canary before the feature can be called released. That
canary must verify goal, assessment, accepted plan,
canonical session completion, normalized Qwik import and review, explained
replacement proposal, explicit acceptance, and cross-athlete isolation without
using Greg's real athlete data.
