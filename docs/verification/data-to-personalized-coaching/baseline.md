# W0 baseline evidence

Recorded 2026-09-17 against main `61d04df9dad3dfe88a9594fff28be06a72899741` in `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/data-to-personalized-coaching`. The added baseline test was the only patch exercised by this task. Runtime sources had not yet changed. Node `v24.13.1`; locked Vitest `4.1.11`. All data is synthetic. No model/provider, production, authenticated athlete, or live wearable calls occurred.

## Result

The focused command passed **12 files / 117 tests**, including **8 W0 defect reproductions**. Five W0 cases execute application functions with synthetic inputs. Three inspect source and are labeled separately. Passing these reproductions demonstrates the baseline defects, not release acceptance or coaching validity.

| Baseline | Evidence and source at baseline SHA | Required replacement behavior |
| --- | --- | --- |
| Fabricated optional feedback | Source-only reproduction: `app/program/today-session-card.tsx:55`, `:60`, `:61` initialize pain `none`, session RPE `7`, energy `okay`. Existing component tests also pass, but this W0 case does not render the UI. | Unknown defaults; explicit reports alone create observations; v1 replay preserved. W1 must add rendered interaction and executable RPC evidence. |
| Empty initial history | Executed `buildProgrammingProfile`: `recentTraining` has null date, zero count/lookback and empty movement/dose arrays (`app/lib/coach/complete-intake.ts:154`). | Factual history with missingness/outage distinction; shadow numerical evidence cannot select dose. |
| Different outcomes collapse into domain assessment | Executed complete-plan generation for “Bench press 225 pounds” and “Back squat 315 pounds”: differing statements, null targets, identical hypothesis requirements and scheduled assessments (`app/lib/coach/adaptive-plan.ts:340`, `:384`). | Confirmed goal-specific outcome/protocol identity; no proxy or different movement can establish attainment. |
| Unrelated-assignment adjustment risk | Source-only reproduction: `findDoseChange(plan, action)` sorts priority then assignment ID and returns the first eligible bounded change (`app/lib/coach/weekly-review.ts:513`). Its signature/body receives no evidence metric or target. Existing weekly-review tests exercise adjustment, but W0 does **not** claim an executable bench-to-squat counterfactual reproduction. | W6 needs an executable relevant-versus-unrelated assignment counterfactual and frozen accepted-plan checks. |
| Unsupported personal nutrition link | Executed detector on 12 workouts with 100% aggregate protein/calorie adherence and **no performance observations**: returns “Strong nutrition-performance link” (`app/lib/agents/socius-background.ts:124`). | No personal link without comparable supporting evidence; adherence alone cannot establish benefit. |
| Unsupported HRV trend | Executed detector with aggregate recovery 40 and **no HRV series**: returns possible declining HRV (`app/lib/agents/socius-background.ts:234`). | Stable low recovery cannot establish decline; actual HRV direction requires dated observations. |
| Wearable age discarded | Source-only reproduction: latest recovery query selects only `recovery_score`, sorts by date, then returns only score (`app/lib/agents/context-builder.ts:223`, `:230`). This proves date loss, not live stale-data behavior. | Dated measurement plus sync/connection freshness/completeness; executable stale/outage tests in W7. |
| Timeout then edit allocates another create identity | Executed client helper with a rejected first fetch and edited meal text: second call receives a different request ID while original pending storage entry survives; only the two create requests occur (`app/lib/client/logging-request.ts:30`, `:35`, `:54`). Fetch is mocked; W0 does not claim an actual duplicate database insert. | Reconcile original identity before edited create; committed first request must become amendment; W2 must prove transaction behavior. |

## Reproduce on the baseline revision

`test/personalized-coaching/baseline.test.ts` is intentionally **opt-in** using `RUN_BASELINE_DEFECTS=1`. It asserts old defects and is skipped in normal regression runs. As packages fix behavior, replace the applicable cases with positive package regressions; do not retain the old assertions as release requirements. This document freezes the historical observation.

Run in the implementation worktree with installed lockfile dependencies:

```powershell
$env:RUN_BASELINE_DEFECTS = '1'
node node_modules/vitest/vitest.mjs run --root . --exclude '**/.worktrees/**' test/personalized-coaching/baseline.test.ts test/program/today-session-card.test.tsx test/coach/today-session.test.ts test/coach/complete-intake.test.ts test/coach/adaptive-plan.test.ts test/coach/exercise-preferences.test.ts test/coach/weekly-review.test.ts test/coach/rolling-weekly-plan.test.ts test/agents/socius-background.test.ts test/agents/socius-background.property.test.ts test/database/logging.test.ts test/database/weekly.test.ts
```

Result: exit 0; 12 files, 117 tests passed; test runner duration 20.63 seconds. Vite emitted a forward-looking warning that native config loading does not support ESM syntax in the CommonJS-classified `vitest.config.ts`; it did not prevent this run. No runtime or configuration change was made for that warning.

These focused tests preserve baseline coverage for completion, intake, adaptive plans, confirmed preferences, weekly planning/review, background detectors, and logging/weekly database helpers. Their names do not establish real SQL/RLS execution; the new migration chain still needs the plan's executable local database, race, ownership and grant checks. No screenshots, full build, broad regression, or physiological effectiveness validation are claimed here.
