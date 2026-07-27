# Adaptive coach production migration application — 2026-07-27

## Target

- Supabase project: `fitness-tracker`
- Project reference: `auolnfwetmfcwhtvakzy`
- PostgreSQL: 17.6
- Auth users before and after verification: 5

## Applied

After explicit release approval, `coach-system-migration.sql` was applied to
production twice through the authenticated Supabase CLI. Both transactional
executions completed successfully. A preflight readback confirmed that the
coach tables and RPCs did not exist before the first application.

## Verification

`verify-coach-system-migration.sql` completed successfully against production.
The rollback-only verifier created two synthetic auth identities, exercised
own-row and cross-user RLS, assessment and memory idempotency, initial and
replacement plan activation, atomic proposal retry, mismatched-payload
rejection, and stale-proposal rejection, then rolled every fixture back.

Independent readback confirmed:

| Check | Result |
| --- | --- |
| Coach tables | 7 |
| RLS enabled / forced | `true` / `true` on all 7 |
| Anonymous table access | denied on all 7 |
| Service-role table access | present on all 7 |
| RPCs | 3 `SECURITY DEFINER` functions |
| RPC `search_path` | empty on all 3 |
| Anonymous RPC execution | denied on all 3 |
| Authenticated/service RPC execution | allowed on all 3 |
| Persisted coach rows | 0 |
| Persisted verifier users | 0 |
| Auth users after rollback | 5 |

The production Security Advisor reported the expected three warnings that the
authenticated role can execute the three intentional `SECURITY DEFINER` RPCs.
Each RPC verifies `auth.uid()`, uses an empty `search_path`, fully qualifies its
relations, and denies anonymous execution. No new coach-schema error or
anonymous-definer warning was reported. The Performance Advisor reported no
actionable coach-schema finding and no unindexed coach foreign key.

The existing production baseline remains separate: three RLS-disabled backup
table errors plus warnings for the older `get_programming_readiness_context`
and `set_user_id` functions and leaked-password protection.

## Application release

- PR #40 merged to `main` as `e4b133d`.
- Exact-commit PR CI passed in 1m29s, including tests, strict TypeScript, lint,
  and production build.
- Main-branch CI run `30305928290` passed the same gates in 1m51s.
- Vercel reported the production deployment for `e4b133d` successful.
- Greg confirmed that the existing production app login succeeds. The exact
  deployment URL was protected by Vercel SSO and attempted to use the browser's
  active work identity, so that verification path was stopped without
  intentionally connecting the work account.

No production plan was created or accepted during the canary. That preserves
Greg's athlete state; the rollback-only database verifier supplied the live
atomicity, idempotency, and cross-user isolation proof.
