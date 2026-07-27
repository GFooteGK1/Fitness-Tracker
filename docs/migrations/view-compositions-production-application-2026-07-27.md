# View-composition cache production application — 2026-07-27

## Target

- Supabase project: `fitness-tracker`
- Project reference: `auolnfwetmfcwhtvakzy`
- PostgreSQL: 17.6
- Execution role: `postgres`

## Applied

After explicit release approval, `view-compositions-migration.sql` was applied
to production and then applied a second time. Both clean executions returned
`Success. No rows returned`, proving the migration is repeatable against the
live schema.

The first editor submission was rejected before application because stale text
from an older query remained after the migration text. PostgreSQL returned a
syntax error, the transactional migration made no database change, the editor
was cleared explicitly, and the clean apply sequence above was then completed.

## Verification

`verify-view-compositions-migration.sql` ran against two existing auth users.
It checked the table, cache identity constraint, index, enabled and forced RLS,
the exact policy set, and least-privilege grants. It then exercised own-row
insert/read and cross-user isolation as the `authenticated` role. Its final
result was:

`view_compositions verification passed; fixtures rolled back`

An independent production readback returned:

| Check | Result |
| --- | --- |
| Table | `public.view_compositions` |
| RLS enabled / forced | `true` / `true` |
| Policy count | `2` |
| Authenticated `SELECT` / `INSERT` | `true` / `true` |
| Authenticated `UPDATE` / `DELETE` | `false` / `false` |
| Anonymous `SELECT` | `false` |
| Persisted cache rows | `0` |

The zero-row result confirms the rollback-only verifier left no fixtures.
