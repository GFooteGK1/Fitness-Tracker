# App quality release candidate — 2026-09-04

## Scope and decision

Plan: [ADR-0008](../decisions/ADR-0008-app-quality-and-canonical-logging.md).
Worktree: `.worktrees/app-quality`; branch `codex/app-quality`.
Base/current remote main verified as `7c656d0c679ad2fce256b29f3fa306ff8a26d35d`.
Release approved in the current task. See
[application evidence](app-quality-production-2026-09-04.md) for current migration,
canary, CI, and protection state; the sections below preserve the candidate plan.

1. Shared PostgreSQL saves cover `/api/agent/process`, `/api/parse-workout`,
   `/api/meals/parse-text`, and `/api/meals/upload`. Workout and block scores
   commit together. Photo analysis response and meal commit together. All four
   endpoints claim a user-owned request receipt before processing. Reuse with
   changed input fails. Repeated completed requests replay the original response.
2. Coach and trainer use the accepted Supabase plan. Coach shows title, intent,
   status, and Open Program. Trainer additionally receives the stored prescription.
   No accepted plan, unscheduled day, and unavailable storage have distinct messages.
3. CI now executes PostgreSQL transaction/migration tests and three mobile browser
   journeys alongside unit/property tests, typecheck, lint, and build.

Client retry identity survives response loss and reload in the same browser tab.
Photo bytes are not saved to session storage; users reselect the same photo.
The first timestamp/body is retained, athlete IDs isolate requests, explicit date
changes get a new identity, and expected-user guards reject account switches.
Old queued photos without an owner are refused pending user review.

## Failure and compatibility boundaries

A failed or lost database response stops the AI tool loop. The app cannot claim a
successful save unless the persistence boundary returned a record ID. Confirmed
analysis failures before any save attempt can start a fresh request. Uncertain
writes keep their receipt and require replay or history reconciliation; they are
never automatically restarted. A crash after a text/tool write but before final
response storage can leave a processing receipt with saved entity IDs. This is a
safe reconciliation state, not a background worker or guaranteed automatic recovery.

Clients must send stable request IDs. Deploy schema first and refresh cached/old
clients that receive the explicit request-ID error. The iOS diagnostic uses its own
endpoint and is unchanged. Deterministic manual-label logging and the existing
Program runner retain their existing persistence contracts. The dormant, unwired
`workout-offline-queue.ts` has an older incompatible payload contract and is not
being activated as part of this release. This change does not replace offline
storage, introduce autonomous queue workers, or define receipt deletion/retention.

## Verification and its limits

- Full Vitest suite: 2,452 passed, zero failed, including real PostgreSQL tests.
- PostgreSQL engine: PGlite. Supabase auth roles/identity are simulated locally;
  activity table prerequisites are extracted from repository SQL. Tests execute
  the logging migration twice and validate ownership, replay, rollback, and atomic
  photo receipts. They execute the coach/weekly/runner migration chain and both
  completion and rolling-week SQL verifiers.
- The older completion verifier incorrectly seeded two accepted versions for one
  program. Its stale version is now `superseded`, retaining the one-accepted-plan
  constraint while testing the same stale-session rejection.
- Browser: real Chromium + Next/React at 390px. Supabase/auth/API responses are
  intercepted fixtures. Tests verify accepted-plan display, text response loss
  with reload, and photo response loss with reload and timestamp preservation.
  Database semantics are verified separately; this is not a live Supabase canary.
- Lint passed without warnings; type-check and production build passed. Final
  browser run passed 3/3 and its mobile screenshot was visually inspected. Remote CI has not run for these uncommitted changes.

## Dependency triage

`npm audit fix --ignore-scripts` applied compatible updates. The initial audit
reported 21 dependency findings, including three critical. The current audit
reports four affected-package findings (three high, one moderate), zero critical.
These are dependency counts, not four independently demonstrated exploits.

| Dependency path | Current finding | Decision |
| --- | --- | --- |
| `@serwist/next@9.5.12` → `browserslist@4.28.6` | High: unbounded query cache and unsafe custom statistics handling | Review upstream-compatible resolution separately. npm proposes Serwist 9.4.1, a downgrade outside the declared range. |
| `next@15.5.25` → `postcss@8.4.31` | Transitive high findings; Next itself marked moderate | Root PostCSS is patched to 8.5.28, but Next pins its own copy. npm proposes Next 16.3.4. Plan/test the framework migration separately. |

Primary advisory evidence: [Browserslist cache](https://github.com/advisories/GHSA-c83g-rgw3-j3cx),
[Browserslist custom statistics](https://github.com/advisories/GHSA-73wf-gq98-2v4g),
[PostCSS CSS serialization](https://github.com/advisories/GHSA-qx2v-qp2m-jg93),
[PostCSS source maps](https://github.com/advisories/GHSA-6g55-p6wh-862q),
[PostCSS incomplete fix](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp),
[PostCSS traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849).
The repository compiles local CSS/browser targets; runtime exploitability of
these remaining paths has not been established or ruled out. Do not report this
candidate as vulnerability-free. New development dependencies are PGlite and
Playwright; no production dependency was added.

## Approved release sequence

1. Review/commit the isolated candidate, push the branch, and create the PR.
   Require the updated `verify` CI job to pass on the exact candidate SHA.
2. Confirm target database identity and applied prerequisites. Apply
   `supabase/migrations/20260904120000_logging_receipts.sql` additively before
   application rollout. The matching readable copy is
   `docs/migrations/logging-receipts-migration.sql`.
3. Verify schema, grants, and authenticated two-user isolation in staging. Perform
   an owned disposable text/photo/workout canary, deliberately replay its request,
   verify one canonical row and complete block set, and clean only canary records.
   Verify Coach and Program show the same accepted session. Then merge/deploy and
   repeat a bounded production canary under the approved release scope.
4. Apply `docs/releases/github-main-protection.json` after remote CI proves the
   check identity. Re-read protection and confirm the required check and admin
   enforcement are enabled. The payload requires PRs and resolved conversations,
   disallows force pushes/deletion, and requires current-branch `verify` from
   GitHub Actions (app ID 15368). Zero mandatory human approvals supports this
   single-owner repository; independent code review remains part of delivery.

GitHub readback on 2026-09-04: `main.protected=false`; check `verify` at the base
SHA succeeded and originated from app 15368. Protection is prepared, not applied.
API contract: [GitHub update branch protection](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).
After explicit approval, from this worktree the exact settings command is:

```powershell
gh api --method PUT repos/GFooteGK1/Fitness-Tracker/branches/main/protection --input docs/releases/github-main-protection.json
gh api repos/GFooteGK1/Fitness-Tracker/branches/main/protection
```

Rollback application code first. Leave additive receipts/RPCs in place; do not
remove user data, truncate receipts, or rewrite accepted plans. Do not drop
receipts while clients can still retry their IDs. A retention/reconciliation
policy is a separate operational decision.

Follow-up tracking: release `Fitness-Tracker-22h`, advisories `Fitness-Tracker-zhi`,
dormant offline queue/reconciliation `Fitness-Tracker-ebu`.
