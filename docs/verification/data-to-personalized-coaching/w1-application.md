# W1 application implementation and checks

Worktree: `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/data-to-personalized-coaching`; base `61d04df9dad3dfe88a9594fff28be06a72899741`, uncommitted W1 patch, 2026-09-17. SQL evidence is recorded separately in `w1-signals.md` and `w1-database-review.md`. Parent owns browser evidence and Beads closure.

## Implemented behavior

- The completion envelope remains version 2; feedback v2 independently permits unknown RPE, energy and pain. Explicit no pain is distinct. Half-point session RPE remains exact. New-request provenance derives from supplied valid values; stored readers require persisted provenance and matching check-in ID/revision. V1 input normalization and RPC JSON remain unchanged for exact replay.
- `CAPTURE_RECEIPTS_V2_ENABLED` supplies the server `feedbackV2` capability through coach runtime and weekly state. Compatible readers always run; new writers fail closed when disabled. A form freezes its starting feedback version so a capability refresh cannot turn untouched old defaults into explicit reports. All six planned flags have one server function; numerical initial-dose selection is hard-disabled pending qualified policy/W10.
- Optional exercise capture uses only the rolling-plan signal RPC. Legacy eight-week completion can use feedback v2 without presenting an unsupported exercise-capture UI. The signal module preserves hardest-set/effort scope and actual reported quantities; it performs no RIR conversion or numerical guidance. Saved actual work prefills an editable modified completion. Subsequent saved details merge as additions without replacing athlete edits or duplicating old reports.
- Interrupted signal saves freeze request ID, report and owner. Failed saved-feedback reads have an explicit retry. Interrupted v2 completion hides the edit/new-key path until a confirmed conflict/no-write response or refreshed state. Program display pauses under an account change; original mounted draft remains hidden until its owner returns. Requests preserve expected owner, APIs reject changed owner, and state refreshes fence stale owner/generation responses.
- Legacy feedback retains values for labeled historical display, with `legacy_unknown` provenance. New weekly/adaptation readers exclude unproved RPE/low-energy/mild-pain fields from explicit-report rules; known concerning pain remains a safety signal even when another check-in is absent. Weekly summaries disclose reported-effort count and completed-session denominator.
- Typed `session.rpe` groups from completion require a real same-owner/session/check-in binding, revision 1, explicit field provenance, matching numeric value/event time and workout ID. Old completion-generated rows do not become eligible merely because their stored verification flag says confirmed. New evidence selection uses `coach-context-selection-0.2.0`; new weekly review uses `weekly-review-0.2.0`. Existing recorded snapshots and legacy stored-review read/replay paths remain preserved.

## Local checks

Executed on Node 24.13.1 / locked Vitest 4.1.11:

```powershell
node node_modules/vitest/vitest.mjs run --root . --exclude '**/.worktrees/**' test/coach/execution-feedback.test.ts test/coach/session-completion.test.ts test/coach/today-session.test.ts test/program/today-session-card.test.tsx test/program/session-signal-panel.test.tsx test/coach/weekly-review.test.ts test/coach/evidence-context.test.ts test/coach/evidence-context-fetch.test.ts test/api/coach-adaptation-reviews.test.ts test/api/coach-workflow.test.ts test/api/coach-feedback-v2.test.ts test/coach/session-signals.test.ts test/api/coach-weekly-review.test.ts test/api/coach-weekly-stored-review-proposal.test.ts
```

Final runner result at 19:22:51: **14 files / 99 tests passed**. `tsc --noEmit --pretty false` passed after the owner/version fixes and final focused run. `git diff --check` passed (line-ending normalization warnings only). Lint exited 0; its sole code warning was the concurrent W3 `training-intent-editor.tsx` goal dependency, reported to that owner. The W1 TSX review checklist was applied. Independent final readback is recorded in `w1-app-review.md`.

Parent separately reported the dedicated `e2e/optional-feedback.pw.ts` browser run: **3 tests passed**, exit 0 in 26 seconds. The fixture measures 320/390/1280 widths in both color schemes, keyboard controls, nullable/fractional feedback and identical retry. Parent inspected actual light-320, dark-390 and light-1280 screenshots. Browser auth/data/save responses are synthetic; these checks do not claim live account or transaction behavior.

New regression coverage includes nullable feedback, explicit no pain, fractional RPE, v1 payload preservation, stored-provenance tampering, typed legacy RPE exclusion, cross-owner evidence/request rejection, disabled writers/non-atomic v2 rejection, capability transition, frozen completion retry, optional legacy completion, signal validation/unknown quantities, GET retry, POST response-loss replay, hardest-set separation and edited-summary delta merge. Existing week/review/API tests remain included.

During development the first focused run exposed four expected legacy-eligibility fixture changes; tests now deliberately distinguish explicit v2 fixtures from legacy rows. Two new UI cases initially lacked the new saved-signal fetch fixture; that test setup was corrected. A new merge test initially used a wrong label and unsupported DOM matcher; those test-only mistakes were corrected. No unresolved application failure was hidden by those adjustments.

## Limits and remaining integrated checks

All API and React tests here use synthetic data and mocked service boundaries. They do not replace the separate executable SQL/RLS tests, parent-owned browser/screenshots, W9 broad regression, or release readback. The W2 universal receipt/reload/correction system remains a separate package; W1 adds no new offline workout capability. No provider calls, production changes, real athlete writes, numerical-policy approval or clinical benefit claim occurred.
