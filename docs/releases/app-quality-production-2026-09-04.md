# App quality release evidence — 2026-09-04

User approved commit, push, migration, deployment, and main protection in the
current task. PR: https://github.com/GFooteGK1/Fitness-Tracker/pull/77.
Initial candidate: `109f17e` (base `7c656d0`).

## Verified before merge

- Exact initial-candidate CI run `33935408894`, job `101222250802`: success.
  Includes tests, type-check, lint, build, and mobile browser journeys.
- Preview deployment `dpl_E5UdWNkpf1oLjAaCpiWsJRvJ7drd`: Ready.
  URL: https://fitness-tracker-cf6pw9iej-gregs-projects-98860c8b.vercel.app.
- Supabase target `fitness-tracker`, project `auolnfwetmfcwhtvakzy`, confirmed
  ACTIVE_HEALTHY. Prior migration history ended at `20260904023000`.
- Dry run selected only `20260904120000_logging_receipts.sql`. Applied with
  `--skip-vault`, no seeds or roles. Post-application dry run returned upToDate
  true with empty migrations/seeds/roles. Database lint returned zero errors.
- Receipt RLS and FORCE RLS are true. All three logging RPCs use security-definer
  with empty search_path, deny anonymous EXECUTE, and allow authenticated EXECUTE.

## Authenticated preview canary

The preview application used the verified production Supabase project with two
new synthetic users, not a separate staging database. It changed no real athlete
records. Script: `scripts/release/verify-app-quality.mjs`.

Created user IDs `539e2c67-c241-4ffe-80e4-d9c153e5c32a` and
`df761576-2dee-4aeb-8698-fccb605b9492`.

The real deployed canary passed meal text, workout text, synthetic meal-photo
analysis, and agent workout logging. Each exact request replay returned the same
record/response; only two meals and two workouts existed, with two complete block
score rows. Explicit dates were preserved. Changed payloads returned 409 and
account mismatches returned 403. Both fresh users read no accepted plan from
Coach. Athlete B read zero Athlete A rows and could not finish A's processing
receipt; A could finish it.

Cleanup deleted only this run's exact created-user records, then deleted both
synthetic auth users. Independent readback verified zero remaining rows across
all covered tables/auth users and no orphan block rows. Final script result:
`canary_passed`, including `cleanup_passed` with remainingCount 0.

## Branch protection

Protection is applied and independently read back. Required check: `verify`
from GitHub Actions app 15368. Strict/up-to-date checks and admin enforcement are
true; PR conversations must resolve; force pushes and deletion are disabled.
Zero mandatory human approvals supports the single-owner workflow.

The first API request was rejected without changing settings because it included
both deprecated `contexts` and replacement `checks`. The corrected tracked JSON
uses `checks` only and preserves the approved policy.

## Remaining release gate

Merge only after CI passes the final PR head (including this reusable canary and
release evidence), verify the resulting production deployment/alias SHA, and
repeat the bounded authenticated canary. Final production proof will be recorded
in this PR and the local HANDOFF. The remaining four dependency findings are
tracked separately in `Fitness-Tracker-zhi`.
