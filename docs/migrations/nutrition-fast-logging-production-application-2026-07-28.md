# Nutrition fast-logging production application — 2026-07-28

## Scope and authorization

- Target: Supabase project `fitness-tracker` (`auolnfwetmfcwhtvakzy`).
- Migration: `supabase/migrations/20260728143952_nutrition_fast_logging.sql`.
- Verifier: `docs/migrations/verify-nutrition-fast-logging.sql`.
- Greg approved the production migration, commit, merge, and deployment on
  2026-07-28.

## Preflight

- Supabase CLI 2.110.0 authenticated to the personal production project.
- The project reported PostgreSQL 17.6, five auth users, and 358 meals.
- `food_catalog_entries`, the three fast-log meal columns, and migration-history
  version `20260728143952` were absent.
- `supabase migration list --linked` showed the prior personal-record migration
  aligned locally and remotely, with only `20260728143952` local-only.
- `supabase db push --linked --dry-run` reported exactly
  `20260728143952_nutrition_fast_logging.sql` pending and no seed or role changes.

## Application and repeatability

The linked CLI applied the generated migration once with `supabase db push` and
recorded it in migration history. The exact transactional migration file was
then executed a second time through the linked database query path. Both
executions completed successfully, proving the migration is repeatable against
the live post-migration schema.

## Rollback-only verification

The verifier completed with:

`nutrition fast-log verification passed; fixtures rolled back`

It checked the table and meal provenance structure, four authenticated owner
policies, least-privilege grants, forced RLS, request-id uniqueness, own-row
catalog access, cross-user catalog denial, and tenant-consistent source-meal
foreign-key rejection using two existing auth users.

Independent readback after the verifier returned:

| Check | Result |
| --- | --- |
| Auth users / meals | `5` / `358` |
| Catalog rows | `0` |
| Migration-history rows | `1` |
| Meal provenance columns / constraints | `3` / `4` |
| Fast-log indexes | `4` |
| Catalog RLS enabled / forced | `true` / `true` |
| Catalog policies | `4` |
| Authenticated CRUD / anonymous CRUD | allowed / denied |
| Trigger function `search_path` | empty |

The auth-user and meal counts match preflight, and the empty catalog proves the
rollback-only verifier left no persistent fixture.

## Advisors

The post-application Security and Performance Advisors reported no finding on
`food_catalog_entries`, the request-id index, the source-meal index, or the
tenant source-meal constraint. Their output retained the documented existing
backup-table RLS errors, legacy function/auth warnings, intentional coach RPC
warnings, and older RLS/index performance findings. This migration introduced
no advisor finding.

## Application release

The database is ready for the application write paths. GitHub exact-commit CI,
the Vercel preview, squash merge, main CI, production deployment, and route
canaries are recorded in the handoff after release.

## Recovery boundary

Application rollback is safe while retaining the additive columns and private
catalog. Database rollback would require removing catalog data first, then the
new table, indexes, constraints, and meal columns; it is not the normal recovery
path once athletes have stored reviewed foods or quick-log provenance.
