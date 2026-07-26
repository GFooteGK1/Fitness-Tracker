# Autonomous Queue Migration Verification — 2026-07-26

## Scope

This record covers:

- `personal-records-migration.sql`
- `view-templates-migration.sql`
- `verify-autonomous-queue-migrations.sql`

Production was not modified.

## Disposable target

- Project: `fitness-tracker-migration-test`
- Project ref: `qmxeigfchcxlatfnvaum`
- Region: West US (`us-west-2`)
- PostgreSQL: 17.6
- Plan: Free
- Data API: enabled
- Automatic table exposure: disabled
- GitHub/Vercel integrations: none

The target contained only a minimal RLS-protected `public.workouts` prerequisite
and two synthetic `auth.users` rows. It contained no production data.

## Results

1. Applied `personal-records-migration.sql`: success.
2. Applied it again without changes: success.
3. Applied `view-templates-migration.sql`: success.
4. Applied it again without changes: success.
5. Ran `verify-autonomous-queue-migrations.sql`: success. The script exercised
   both authenticated identities, including denied cross-user inserts/reads and
   own-row PR deletion, inside a transaction ending in `ROLLBACK`.
6. Ran an independent post-verification readback:

| Check | Result |
| --- | --- |
| Personal-record fixture rows | 0 |
| Default template rows | 1 |
| User-template fixture rows | 0 |
| RLS enabled and forced on both tables | true |
| Expected policy count | 5 |
| Personal-record authenticated grants | correct |
| View-template authenticated grants | correct |

Security Advisor reported zero errors. Its only warning was the default
fresh-project Auth setting, `Leaked Password Protection Disabled`, which is
unrelated to either migration.

## Cleanup

The disposable project was permanently deleted after verification. Supabase
confirmed deletion and the organization project list returned to the single
production `fitness-tracker` project.
