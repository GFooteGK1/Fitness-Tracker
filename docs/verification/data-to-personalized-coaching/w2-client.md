# W2 client capture implementation

2026-09-17. Local implementation in `.worktrees/data-to-personalized-coaching`; no production, model, commit, or push action. Parent owns Beads and server/SQL gates.

## Delivered behavior

- `app/lib/client/logging-request.ts` freezes owner, request identity, event time, complete JSON/form scalar payload and photo fingerprint across response loss/reload. It permits one in-flight save per owner/surface. Changed input reconciles the original create before amendment; a stale failed amendment retains its target and original saved receipt. It cannot become a fresh create through `retryAllowed`. Older signature-key envelopes remain blocked until explicit reconciliation. A separately intended occurrence requires the recovery action or another explicit Log after confirmed success.
- The same module provides immutable correction requests and verifies the signed-in owner before mutation and before exposing results. Definite stale-revision no-write failures can release a direct correction; uncertain failures retain exact values for recovery.
- `app/lib/offline-queue.ts` now stores account-owned photo Blob records in IndexedDB. Original UUID/time/bytes survive reload; auth and owner are checked for each upload. Successful saved results retain receipt metadata and drop bytes. The persistent `attempted` bit prevents retry counters or reload from making an uncertain upload discardable. Attempted dequeue first reads the original server request: unknown/pending keeps bytes+identity; saved recovery preserves its receipt; confirmed no-write is the only unsaved discard path. Legacy localStorage records remain preserved and become explicit reselection warnings, never automatic empty-File uploads. No new workout offline queue or cloud photo storage was enabled.
- `CaptureReceiptPanel.tsx` labels estimate/review independently, separates partial results, filters owner receipts, reads the latest entity/revision for correction, and uses the dedicated execution amendment for program-linked workouts. Workout blank quantities remain unknown (`null`); note-only edits do not claim quantity review. Meal totals remain derived from item edits.
- `CaptureRecovery.tsx` exposes original save/status retry, per-item cancellation for partially saved requests, explicit new occurrence after proven reconciliation, frozen correction recovery after reload, and owned normalized draft preview with explicit **Save estimate** / discard actions. Loaded-owner guards hide stale account data before effects run. A partial retry retains cancellation controls from its unresolved bundle.
- FastMealLogger uses the shared freeze/reconciliation helper for copied and manually reviewed foods, including selected date identity. It forwards full receipt responses. Copied meals remain one action.
- MealEditModal and DailyProgressView use current revision and frozen correction/delete requests. Failed corrections remain visible instead of closing the editor. Photo refinement and deterministic multiplier amendments carry revisions and retain a completed refinement stage across retry.
- Shared receipts are presented in `/log`, `/food-log`, `/food-progress`, `/v2` (`/coach` alias), and rolling Program completion. Queued photos do not return fabricated meal IDs and do not claim canonical totals. Program completion retains the existing atomic request and tolerates a successful save with unavailable refreshed context.

## Client paths

`app/lib/client/logging-request.ts`, `app/lib/offline-queue.ts`, `app/lib/types/food-tracking.ts`; `app/components/capture/{CaptureReceiptPanel,CaptureRecovery}.tsx`; `FastMealLogger.tsx`, `MealInputEnhanced.tsx`, `MealCameraCapture.tsx`, `MealEditModal.tsx`, `MealEntryCard.tsx`, `DailyProgressView.tsx`; `app/{log,food-log,food-progress,v2}/page.tsx`; receipt-only changes to `app/program/rolling-program-page.tsx`.

Existing template workout action routes into `/log`, which uses the shared adapter. Existing URL and atomic Program boundaries are retained. No server API was edited by this client owner.

## Verification

- `npx vitest run test/client/logging-request.test.ts test/components/CaptureRecovery.test.tsx test/components/FastMealLogger.test.tsx test/components/MealInputEnhanced.test.tsx test/components/DailyProgressView.test.tsx --root .`: 30 tests across 5 files pass (latest helper adds lost create -> stale amendment -> changed retry regression).
- `npx tsc --noEmit --pretty false`: pass after the latest client changes.
- Focused Next lint on 15 client/UI files: pass; only tool deprecation/workspace-root notices. Latest helper/recovery edits included in the final 15-file lint pass.
- `npx playwright test e2e/capture-receipts.pw.ts --reporter=list`: 2 tests pass, exit 0. The real mobile React flow copies a meal, presents its receipt, fetches a newer revision, then corrects it; 320/390px overflow checks pass. Native Chromium IndexedDB independently preserves actual photo bytes, timestamp and UUID through reload, fences account replay, removes bytes only after save, and refuses attempted uncertain discard.
- `npx playwright test e2e/coach-logging.pw.ts --grep 'text response loss|midnight|duplicate|photo response|retry' --reporter=list`: 2 selected regression tests pass, exit 0 (Coach text and photo response loss/reload).
- Stable screenshot: `output/playwright/capture-receipts/w2-receipt-mobile.png`. Viewed locally; receipt/source label/correction affordance fit 320px. Authentication, server saves and model results in browser fixtures are synthetic; native storage is real. These tests do not establish live OAuth or production persistence.

## Independent review repairs

Parent identified attempted queue discard, invented zero on blank workout input, stale account recovery rendering, partial-retry cancellation loss, and stale reparse correction identity risks. All were repaired with focused regressions. Final parent readback/closure remains with the coordinator. Server observation/provenance/RLS/SQL tests are documented in the separate W2 server/database artifacts.

## Remaining boundaries

- Missing legacy photo bytes cannot be reconstructed; the UI requires reselection and history review. It does not enable silent replay or discard user records.
- An unresolved queued upload with server-pending children cannot be discarded by the queue API without explicit server reconciliation/cancellation proof; original retry remains available. The separate general recovery UI supports child cancellation for request envelopes.
- New durable photo storage, numerical coaching rules and production rollout are outside this slice. The original qualified-policy gates remain open.

