# Programming quality mobile verification

Date: 2026-09-22. Scope: release task i40.11, local programming-quality worktree.

## Result

Four Chromium browser tests passed against the real Next/React Program UI. No application changes were needed for the covered interactions. Full TypeScript checking passed with the new test file.

Command:

```powershell
node node_modules/@playwright/test/cli.js test e2e/programming-quality.pw.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

The browser runner finished with exit code 0 and `4 passed (1.4m)`. Windows managed dev-server cleanup stalled after all tests passed. Stopping only the three Node process IDs emitted by that run allowed the runner to finish normally. No other services were stopped.

## Executed coverage

- Current saved rationale opens by touch/click; accepted historical rationale opens by keyboard. Source-correction warning, original rationale, numeric evidence summary, limitations and exclusions remain visible.
- Light and dark themes at 390 × 844 and 320 × 844: no horizontal page overflow; both disclosure controls and the saved-review action meet the 44px minimum height.
- At both widths, an acceptance response of HTTP 409 triggers refreshed state. A deliberately retained stale pending proposal and history cannot expose acceptance or saved-review generation controls once the shared decision reports changed context.
- A subsequent fresh review hydrates current Tuesday/Thursday availability and 45-minute duration, clears the removed event deadline, and leaves setup confirmation unchecked. Replacement generation remains disabled. The goal input uses a 16px font.
- Only the expected simulated acceptance and new-review requests occur in the recovery flow. The new review uses a new key, 84-day window and Chicago raw timezone offset. No intake save or plan acceptance succeeds implicitly.
- Every unexpected browser API/external request is blocked and asserted absent. Browser page errors are asserted absent.

The fixture uses the real weekly-plan builder and saved-decision projector for initial data. Authentication, API responses, current-source reconciliation, and HTTP conflict responses are synthetic. Optional WHOOP initialization, intent, trust, preferences and recommendation endpoints are explicitly intercepted.

## Visual evidence

Six local screenshots are generated under the existing ignored directory:

`output/playwright/app-quality-results/programming-quality/`

- `saved-light-390.png`, `saved-light-320.png`
- `saved-dark-390.png`, `saved-dark-320.png`
- `replacement-390.png`, `replacement-320.png`

Direct image inspection covered saved light at 320px, saved dark at 390px, and replacement at 320px. Text and cards wrap inside the viewport, the source-history explanation remains distinct, and the replacement form shows the intended updated values and disabled action. Full-page screenshots contain the fixed bottom navigation at its viewport position; they are not screenshots of a physical phone. Generated browser artifacts are not intended for version control.

## Limits

This is local Chromium viewport validation, not Safari/WebKit, real-device touch or screen-reader certification. It does not verify live sign-in, hosted RLS, actual database transactions, production deployment, or the correctness of a coaching prescription. Conflict/reconciliation semantics on the server remain covered by the separate API/database suites. The tests stop before confirming and saving replacement setup; they establish the confirmation boundary and correct form hydration.

Initial runs exposed fixture omissions (WHOOP initialization and read-only preferences) and an incorrect simulated acceptance URL. Those fixtures were corrected before the successful run. No UI failure remained in the executed scenarios.
