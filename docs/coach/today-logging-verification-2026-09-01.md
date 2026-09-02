# Today Logging Verification - 2026-09-01

## Scope

This is local browser and application evidence for the mobile-first Today
logging flow. The layered evidence and atomic completion migrations were later
applied to production after explicit approval; this record does not claim that
the application was deployed or that a live athlete flow was exercised.

## Behavior verified

- The active accepted-plan session appears before the eight-week plan.
- Readiness is one tap and advisory. Low readiness exposes the stop and modify
  guidance but does not rewrite the accepted plan.
- A measurement appears only when the immutable accepted-plan schedule assigns
  it to that session. The measurement is optional when the protocol would
  compromise training.
- As-prescribed completion requires explicit confirmation and sends no
  replacement workout text or blocks.
- Modified and stopped-early completion require an athlete-reported actual-work
  summary. A skipped result sends no performed work or observations.
- Readiness and scheduled measurements become typed observations with protocol,
  metric, semantic role, assessment version, and comparability identity.
- An interrupted response freezes the complete request. Retry reuses the exact
  request body and idempotency key. Editing explicitly abandons that pending key.
- A completed terminal state shows the linked canonical workout. A skipped
  terminal state states that no workout or performed-session evidence exists.

## Browser proof

The repository Playwright wrapper exercised `/program` with an isolated local
session and mocked private APIs. It did not contact or mutate live services.

- Viewports: 390 x 844 and 320 x 844.
- Horizontal overflow: none at either viewport.
- Today-card interactive controls below 44 px: none.
- Submitted contract version: 2.
- Labels resolved to their intended controls, and Tab moved focus from
  `Readiness 1` to `Readiness 2`; Space activated the focused button.
- Performed-work mode: `as_prescribed`.
- Submitted typed observations: `readiness.score` and `strength.load`.
- Interrupted-save requests: 2.
- Exact retry request body and idempotency key reused: yes.
- Terminal state displayed the mocked canonical workout ID.
- The only console error was the deliberately injected
  `ERR_CONNECTION_FAILED` used to test interrupted-save recovery.

Screenshots and the executable browser harness are under
`output/playwright/today-logging/`. The output directory is verification
evidence, not application source.

## Automated gates

- Focused Today, atomic completion, runtime projection, page, and API regression:
  6 files and 32 tests passed.
- Full Vitest: 210 files passed and 5 skipped; 2,346 tests passed and 7 skipped.
- TypeScript `--noEmit --incremental false`: passed.
- Next.js lint: passed with no warnings or errors.
- Production build with non-secret build-only public Supabase placeholders:
  compiled and generated all 76 routes.
- `git diff --check`: passed after the final documentation update.

## Remaining release boundary

The required database migrations were applied to production on September 1,
2026, with the readback recorded in
`../migrations/adaptive-coach-production-application-2026-09-01.md`. The
application remains undeployed. A separately approved synthetic two-athlete
canary is still required after deployment.
