# Legacy database object security production application — 2026-07-30

## Scope and authorization

- Target: Supabase project `fitness-tracker` (`auolnfwetmfcwhtvakzy`).
- Migration:
  `supabase/migrations/20260730151344_secure_legacy_database_objects.sql`.
- Greg explicitly approved remediation of the three exposed WHOOP backup
  tables and the broken `get_meals_around_workout` helper on 2026-07-30.
- The migration deletes no table, function, policy, or row. It changes access
  control on three archival tables and replaces the body and grants of one
  unused helper while preserving its input and output signature.

## Preflight

- Repository-wide search found no application caller for the three backup
  tables or the helper. References were limited to historical migration,
  security, and status documentation.
- The backup tables had no RLS policies, RLS and FORCE RLS were both disabled,
  and `anon` plus `authenticated` had effective SELECT, INSERT, UPDATE, and
  DELETE privileges.
- Row counts were 10 recovery, 10 sleep, and 8 workout rows.
- `get_meals_around_workout(uuid, integer)` was SECURITY INVOKER but executable
  by PUBLIC, `anon`, and `authenticated`. Its body referenced the removed
  `meals.meal_name` column, producing database-lint SQLSTATE `42703`.
- Security Advisor reported three ERROR findings, one for each RLS-disabled
  backup table. The current Supabase API-security guidance treats grants and
  RLS as separate required controls; the April 2026 Data API default-privilege
  change does not retroactively alter existing table grants.
- `supabase db push --linked --dry-run` showed exactly
  `20260730151344_secure_legacy_database_objects.sql` pending.

## Application and repeatability

The linked CLI applied the transaction-wrapped migration once through
`supabase db push --linked --yes`. A direct second execution of the same file
completed successfully.

The migration:

- enables and forces RLS on all three backup tables;
- creates no user policy and revokes all table privileges from PUBLIC, `anon`,
  and `authenticated`;
- retains explicit service-role SELECT, INSERT, UPDATE, and DELETE;
- keeps the helper signature but derives its label from `meals.items`;
- uses SECURITY INVOKER with an empty search path; and
- limits function execution to `service_role`.

## Rollback-only verifier

`verify-secure-legacy-database-objects.sql` completed against production and
ended in `ROLLBACK`. It checked forced RLS, absence of Data API user CRUD,
retained service-role CRUD, function execution grants, invoker mode, empty
search path, executable SQL against a nonexistent workout, and unchanged row
counts.

## Independent postflight

| Check | Result |
| --- | --- |
| Recovery / sleep / workout backup rows | `10 / 10 / 8` |
| RLS enabled and forced on all three | `true` |
| Backup-table user policies | `0` |
| `anon` CRUD on all three | `false` |
| `authenticated` CRUD on all three | `false` |
| `service_role` CRUD on all three | `true` |
| Helper `anon` / authenticated execute | `false / false` |
| Helper service-role execute | `true` |
| Helper security definer | `false` |
| Helper search path | empty |
| Missing-column reference present | `false` |
| Migration history local/remote aligned | `true` |
| Final migration dry-run | up to date |

Database lint no longer reports `get_meals_around_workout`. Security Advisor
no longer reports the three ERROR findings; it now reports the expected INFO
state that these RLS-enabled archive tables have no user policies. Unrelated
pre-existing warnings remain tracked in `Fitness-Tracker-k50`.

The focused WHOOP regression suite also passed: 25 files and 280 tests covering
schema expectations, RLS behavior, sync ranges, upserts, parsing, token refresh,
OAuth, retries, and error handling.

## Release boundary

The database containment is live. The migration, documented copy, verifier,
regression test, and this evidence record remain local and uncommitted on
branch `codex/fix-prod-db-security-upc`. No application commit, push, pull
request, Vercel deployment, credential change, or data deletion occurred.
