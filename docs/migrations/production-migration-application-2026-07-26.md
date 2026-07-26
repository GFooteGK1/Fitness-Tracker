# Production Migration Application — 2026-07-26

## Scope

After explicit approval, the following migrations were applied once to the
production Supabase project and verified:

- `personal-records-migration.sql`
- `view-templates-migration.sql`
- `verify-autonomous-queue-migrations.sql` (rollback-only verification)

No application deploy, commit, or push was performed.

## Target and preflight

- Project: `fitness-tracker`
- Project ref: `auolnfwetmfcwhtvakzy`
- PostgreSQL: `17.6`
- Execution role: `postgres`
- Auth users: `5`
- Workouts: `154`
- `public.personal_records` before apply: absent
- `public.view_templates` before apply: absent

## Application and verification

Both migration executions returned `Success. No rows returned`.

The exact repository verifier then completed without error. It checked table
structure, explicit grants, and own-user/cross-user RLS behavior using two
existing auth identities. All fixtures and mutations were enclosed in a
transaction ending in `ROLLBACK`.

Independent post-apply readback returned:

| Check | Result |
| --- | ---: |
| PostgreSQL version | `17.6` |
| Auth users | `5` |
| Workouts | `154` |
| Personal-record rows | `0` |
| Default-template rows | `1` |
| User-template rows | `0` |
| RLS enabled and forced on both tables | `true` |
| Expected policy count | `5` |
| Personal-record grants correct | `true` |
| View-template grants correct | `true` |
| Default template schema correct | `true` |
| Default template sections correct | `true` |

The unchanged user/workout counts and zero verifier-owned rows confirm that the
rollback-only proof did not persist fixtures.

## Security Advisor readback

The production linter was explicitly rerun after application. Its baseline
remained 3 errors and 4 warnings, with no new migration-related finding. The
three errors are the pre-existing RLS-disabled backup tables:

- `public.whoop_sleep_backup`
- `public.whoop_workouts_backup`
- `public.whoop_recovery_backup`

The existing advisor findings remain tracked in `Fitness-Tracker-k50`; they were
outside this approved production change.
