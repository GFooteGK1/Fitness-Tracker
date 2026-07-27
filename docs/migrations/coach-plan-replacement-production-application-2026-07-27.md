# Coach plan replacement production application — 2026-07-27

## Target

- Supabase project: `fitness-tracker`
- Project reference: `auolnfwetmfcwhtvakzy`
- PostgreSQL: 17.6
- Execution path: authenticated Supabase CLI `db query --linked`

## Preflight

Read-only production inspection confirmed five auth users, one training program,
one plan version, one adaptation proposal, and 48 prescribed sessions. The
existing acceptance RPC was present and the replacement-proposal RPC was absent.

## Application

`coach-plan-replacement-migration.sql` was applied to production twice. Both
transactional executions completed successfully with no result rows, proving the
migration is repeatable against the live schema.

## Verification

The final `verify-coach-plan-replacement-migration.sql` completed with:

`coach plan replacement verification passed; fixtures rolled back`

The rollback-only verifier exercised authenticated execution grants, denial of
anonymous/public execution and direct table mutation, initial-plan activation,
replacement proposal retry, mismatched-payload rejection, stale-base rejection,
atomic metadata activation, exactly one accepted version, and cross-user
isolation.

Independent readback after the verifier confirmed:

| Check | Result |
| --- | --- |
| Auth users | 5 |
| Training programs | 1 |
| Plan versions / accepted versions | 1 / 1 |
| Adaptation proposals | 1 |
| Prescribed sessions | 48 |
| Replacement RPC | `SECURITY DEFINER`, empty `search_path` |
| Acceptance RPC | `SECURITY DEFINER`, empty `search_path` |
| Replacement execution | authenticated allowed; anon/public denied |
| Direct plan/proposal update by authenticated | denied |

These counts match the preflight, so the verifier left no synthetic auth or
coach-state fixtures and did not alter the existing accepted program.

## Advisors

The Security Advisor reported the expected warning that authenticated users can
execute the intentional replacement `SECURITY DEFINER` RPC. The function checks
`auth.uid()`, fully qualifies relations, uses an empty `search_path`, denies
anonymous/public execution, and exposes only the bounded proposal transition.
The advisor also reported the existing coach RPC warnings and unrelated
production baseline: three RLS-disabled backup tables, mutable
`get_programming_readiness_context` search path, broad `set_user_id()` execution,
and leaked-password protection disabled.

The Performance Advisor reported no coach-schema finding. Its results were the
existing RLS initialization-plan, duplicate-policy, and duplicate-index warnings
on older application tables.

## Application release

- PR #42 passed exact-commit CI in 1m38s and its Vercel preview completed.
- PR #42 was squash-merged to `main` as `87c6d46`.
- Main CI run `30313385336` passed tests, strict TypeScript, lint, and build in
  1m51s.
- Vercel reported the exact merge commit deployed successfully to Production.
- The generated deployment URL is protected and returned a Vercel-auth 302
  before application routing. No signed-in browser canary was attempted because
  the browser's active work Vercel identity must not be connected to this
  personal project.
