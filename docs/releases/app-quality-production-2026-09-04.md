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

## Production release

Final PR head `f6bff03558b17e7fe5d8e058f55ea715e7b8853d` passed CI run
`33935909491`, job `101223692208`, before protected merge.
PR #77 merged at `2026-09-05T01:26:02Z` as
`183bd2cd26cb613801f01567dcde9886420e5289`.

Production deployment `dpl_CMKRaFPbHhgcmnfWARn85Tsr3U7r` is Ready and has
that exact Git SHA. Deployment URL:
https://fitness-tracker-ae9dso1ei-gregs-projects-98860c8b.vercel.app.
Verified aliases include https://www.sociusfit.com, https://sociusfit.com, and
https://sociusai.vercel.app. Live health at `2026-09-05T01:28:27.572Z` returned
HTTP 200, healthy, database connected, auth configured.

The production canary against https://www.sociusfit.com passed the same real
text-meal, workout, synthetic meal-photo, and agent logging/replay checks,
explicit date checks, account guards, and two-user isolation. It created exactly
two meals, two workouts, and two block-score rows before cleanup.
Synthetic users: `431f8b1d-2257-4888-9f42-55e654861c8f` and
`80655b9c-1192-4cef-b944-c48282ea7e69`. Both users and all related canary records
were removed. Independent cleanup readback returned zero rows/auth users and
zero orphan blocks. Final result: `canary_passed` and `cleanup_passed`.

Merged-main CI run `33936146879` passed. Both the exact final PR head and the
merged production source passed the full required verify job.

Rollback target retained: `dpl_8BQ1DSzBP5cBjcykKbKFGg33J7Nj`, source
`7c656d0c679ad2fce256b29f3fa306ff8a26d35d`. Use application-first rollback;
leave additive schema/receipts and real athlete data intact.

The remaining four dependency findings are tracked in `Fitness-Tracker-zhi`;
they do not include critical advisories. No real athlete data was changed by
either canary.
