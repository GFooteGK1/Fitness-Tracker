# Coach execution feedback production migration application — 2026-07-29

## Target

- Supabase project: `fitness-tracker`
- Project reference: `auolnfwetmfcwhtvakzy`
- PostgreSQL: 17.6
- Execution path: authenticated Supabase CLI 2.110.0 `db query --linked`

The current Supabase breaking-change changelog was reviewed before application.
Its active notices do not change hosted PostgreSQL function, grant, RLS, or
transaction semantics used by this migration.

## Preflight

Independent read-only production inspection confirmed five auth users, one
active training program, two plan versions, 96 prescribed sessions, and zero
coach check-ins. Forced RLS was enabled on all four coach tables inspected. The
session-result function was not installed. Authenticated users retained the
legacy direct write grants that this migration intentionally replaces.

## Application

`coach-execution-feedback-migration.sql` was applied to production twice. Both
executions completed successfully. The migration installed
`record_coach_session_result`, revoked authenticated direct inserts/updates on
execution-feedback tables, and granted only authenticated function execution.

## Verification

`verify-coach-execution-feedback-migration.sql` completed successfully. The
rollback-only verifier exercised completed and skipped results, an exact
idempotent retry, mismatched retry rejection, cross-user rejection, and final
function/table privileges.

Independent readback after the verifier confirmed:

| Check | Result |
| --- | --- |
| Auth users | 5 |
| Training programs | 1 active / 1 total |
| Plan versions | 2 |
| Prescribed sessions | 96 |
| Coach check-ins | 0 |
| Session check-ins | 0 |
| Coach-table RLS | Enabled and forced |
| Authenticated direct session/check-in writes | Denied |
| Authenticated RPC execution | Allowed |
| Anonymous RPC execution | Denied |
| Service-role RPC execution | Denied |
| Function security | `SECURITY DEFINER`, empty `search_path` |
| Accepted-session content trigger | Installed and enabled |

Counts exactly match preflight, so the verifier rolled back all fixtures and
the migration did not change Greg's accepted plan or athlete data.

## Advisor result

The database security/performance advisors reported the expected warning that
authenticated users can execute this bounded security-definer RPC. That access
is intentional: the function checks `auth.uid()`, validates active accepted-plan
ownership, schema-validates every payload, serializes writes, and exposes no
anonymous or public grant. No coach-table performance finding or mutable search
path finding was reported for the new function.

Existing unrelated advisor findings remain, including legacy backup tables
without RLS, older mutable-search-path/public-definer functions, leaked-password
protection configuration, legacy RLS initialization-plan warnings, and duplicate
indexes. This release did not broaden or modify those objects.

## Application release

Database application and application release are complete. Source commit
`d6f3ece` passed exact-head CI and Vercel preview in PR #53. The PR was
squash-merged as `43211d4`; main CI run `30484942094`, the Supabase main-branch
check, Vercel commit status, and GitHub Production deployment `5663871929` all
succeeded for that exact commit. The signed-in athlete canary remains for Greg
to perform without connecting his work Vercel identity; its steps are tracked
in the project handoff.
