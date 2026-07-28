# Personal-record idempotency production application — 2026-07-28

## Scope and authorization

- Target: Supabase project `fitness-tracker` (`auolnfwetmfcwhtvakzy`).
- Migration: `supabase/migrations/20260728134202_personal_record_idempotency.sql`.
- Greg approved the reviewed cleanup, commit, merge, and deployment on
  2026-07-28.
- The migration changes only `public.personal_records` data and its uniqueness
  boundary. It does not alter RLS policies, grants, functions, or exposed API
  schemas.

## Preflight

- The linked migration history showed exactly one local-only migration.
- `supabase db push --linked --dry-run` reported exactly
  `20260728134202_personal_record_idempotency.sql` pending, with no seed or role
  changes.
- A read-only production query identified 14 redundant or intermediate rows in
  six `(user_id, workout_id, exercise, pr_type)` groups for one user. The
  reviewed ranking retains the lowest time result and the highest result for
  every other PR type, with deterministic timestamp and ID tie-breakers.
- The matching unique constraint did not exist before application.
- The current Supabase breaking-change changelog contained no entry relevant to
  this ordinary Postgres data cleanup, unique constraint, migration push, or
  JavaScript upsert conflict target.

## Application

The linked CLI applied the migration once with:

```text
npx.cmd --no-install supabase db push --linked --yes
Applying migration 20260728134202_personal_record_idempotency.sql...
Finished supabase db push.
```

The migration runs inside an explicit transaction. It deletes ranked rows
greater than one and then adds
`personal_records_one_per_workout_exercise_type` on
`(user_id, workout_id, exercise, pr_type)`.

## Independent readback

A separate read-only production query after application returned:

```text
total_personal_records: 12
duplicate_groups: 0
uniqueness_constraints: 1
migration_history_rows: 1
```

This proves the reviewed duplicate groups were collapsed, the database
idempotency boundary is live, and Supabase recorded the migration once. The
matching application upsert may now deploy safely.

The post-application Supabase Security and Performance Advisors reported no
finding on `personal_records` or the new constraint. Their output retained the
repository's previously documented backup-table RLS errors, legacy function and
authentication warnings, intentional authenticated coach RPC warnings, and
existing RLS/index performance findings; this migration introduced none of
them.

## Recovery boundary

The uniqueness constraint can be removed only after rolling the application
write path back to the earlier insert behavior. The 14 removed rows were
reviewed redundant/intermediate representations; restoring deleted rows would
require a database backup and is neither necessary nor part of normal rollback.
