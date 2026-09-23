# Troubleshooting

## Private logical restore has matching data but catalog differences

Verified 2026-09-23 on PostgreSQL 17.6. All 93 table digests matched while
role search paths, two schema grants, column positions, owner ACL defaults,
three CHECK expressions and ICU versions differed. Inspect encrypted catalog
comparisons before changing acceptance checks. Preserve list-valued search_path
with transaction-local set_config and ALTER ROLE SET FROM CURRENT; replay schema
grantors/options exactly. Use verified logical order/default-ACL/AND-grouping
comparisons only for demonstrated representation differences. Never ignore
missing privileges or force collation metadata equality.

One approved catalog query proved source ICU 153.120 differed from local 153.121.
The official source-release image 17.6.1.054 passed exact-locale and extension
checks, then the corrected private restore passed all selected catalog checks
and 93 table digests. Record verified container cleanup before success. Earlier
failures included SQL LIKE underscore filtering out pgbouncer and per-table
pooler authentication timing out; use literal pg_ prefix filtering and a held
snapshot coordinator. Applicability is limited to the pinned runtime, captured
catalog/data scope and private operator workflow; this does not establish full
hosted-service recovery. See the [investigation](../handoffs/investigations/programming-quality-private-recovery.md).

## Engineering boundary fixture crosses the UTC/database date boundary

Verified 2026-09-22. `engineering-boundaries.test.ts` could fail eight accepted-plan
cases with `Materialized facts did not produce a rule candidate` and `sessions: []`.
The reader used the captured UTC scope date while SQL seeded `CURRENT_DATE` in
the database timezone. Stage seed dates from `scope.localDate` before inserting
immutable accepted prescriptions. Do not change application date semantics or
update accepted fixtures afterward. Two actual SQL checks with UTC-12/UTC+14
database zones now cover the mismatch. All 14 boundary tests and the full suite
(3,460 passed, 19 skipped) passed. Tracker: `Fitness-Tracker-i40.10`.

## Fresh worktree resolves an older root dependency tree

Verified 2026-09-21 for `.worktrees/programming-quality`. Symptoms: full TypeScript
checking reports missing `@playwright/test`/`@electric-sql/pglite` and rejects
the existing Vitest `oxc` configuration, while focused tests run. Without local
dependencies, package resolution reached the older root installation. A Vitest
run also created `node_modules/.vite`, preventing a later whole-directory
junction from being created.

Compare lockfile hashes before reusing a known complete installation. Preserve
any generated cache, verify resolved move paths remain inside the worktree,
then create a local dependency junction to the matching installation. Do not
delete or overwrite an existing dependency tree. Use worktree-local tool paths.
Full typechecking passed after this correction. See the
[investigation record](../handoffs/investigations/programming-quality-validation.md)
for exact scope, attempts and evidence.
