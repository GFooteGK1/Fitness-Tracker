# Troubleshooting

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
