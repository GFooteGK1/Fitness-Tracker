# Setup freshness: mobile and preflight preparation

Candidate: `.worktrees/setup-freshness-release`, uncommitted changes on
`d3c07c59bae4c7b9782460823381e3e82cd793f2`. Task: `Fitness-Tracker-i40.15`.
This extends the separate [PG17 and HTTP receipt](setup-freshness-local-release-2026-09-26.json).
It is local verification, not committed-head CI or production qualification.

## Mobile browser verification

Command: `node node_modules/@playwright/test/cli.js test` using the maintained
`playwright.config.ts`. Result: **26 passed**, exit0, no retries, 4.7minutes.
Started2026-09-27T02:44:08.428Z; completed2026-09-27T02:48:50.051Z.

All five maintained suites ran: capture receipts, coach logging, optional
feedback, personalized coaching and programming quality. Coverage includes light
and dark themes, 320/390/desktop layouts, interrupted saves and reload recovery,
accepted/historical decision display, and stale acceptance followed by current
replacement setup at320/390. The fixtures intercept external services; these
tests do not prove hosted Auth/database transport or physiological quality.

Execution used existing Chromium, one worker, America/Chicago timezone, a fresh
local dev server at127.0.0.1:3010 and a clean environment with placeholder
Supabase configuration. No dependency install or hosted writes occurred.
The previous local production server was stopped before `.next` was reused.

Raw local records remain under `output/setup-freshness-release/`:
`mobile-journeys.log` and `mobile-journeys-result.json`. Browser report:
`output/playwright/app-quality-report/`.

## Read-only preflight preparation

The transport-free `setup-freshness-preflight.mjs` classifier passed15tests and
independent review. Query SHA256:
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.
It checks verified target, observation freshness, transaction settings, exact
ledger, full pause catalog, predecessor definitions/ACLs and accepted/superseded
history digests. Only CRLF-to-LF normalization is permitted for reference
comparison; actual raw hashes remain the installation fence.

The query ran read-only on the already-upgraded local PG170006 database at
2026-09-27T02:41:44.650Z. Execution succeeded, and qualification correctly failed
the target, absent-guard, catalog, ledger and predecessor checks. Counts were
7accepted/superseded plans and32sessions. This is a negative qualification check
on the synthetic database, not a passing production preflight.

The reviewed GET-only Vercel CLI fallback remains unexecuted pending approval
after three connector schema failures. Two browser inventory timeouts returned
no hosted SQL transport. No current production metadata or database proof is
claimed. See the [investigation](../../../handoffs/investigations/Fitness-Tracker-i40.15.md).

## Remaining release gates

Greg authorized scoped commit/push on September27. A draft PR, exact final-commit
CI, fresh hosted preflight and target-specific rollout approval remain open.
Numerical load policy remains disabled. Broader P0/P2/P3/JEV work remains open.
