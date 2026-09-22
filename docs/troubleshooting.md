# Troubleshooting

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
