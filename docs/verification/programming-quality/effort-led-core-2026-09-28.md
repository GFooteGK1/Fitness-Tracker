# Effort-led work and optional-exercise core verification

September 28, 2026. Branch `codex/programming-quality`. Canonical task
`Fitness-Tracker-u5l.11.1` remains in progress under W10. This advances the full
programming QPlan; it is not completion of the child, W10 or numerical activation.

## Verified implementation

The old repetition variant requires a min/max rep range and the old compiler
requires the full session estimate to fit. Both conflict with Greg's accepted
effort-first and optional-upper-body guidance. ADR-0033 records the versioned
shared-contract solution.

- Schema 3 preserves working `targetRir`, explicit working RPE and an independent
  per-side set-duration estimate. No repetition cap is generated. Easy preparation
  and fixed monitoring cannot use effort-led repetitions.
- A reviewed optional tail contains one complete exercise: transition, matching
  preparation, then working activity. Final logging remains required. Optional
  content is preserved, never silently removed from the proposed/saved read view.
- Compiler and historical reader check required time against availability and
  retain the complete full estimate. Display identifies optional preparation and
  work, required time, full time and conditional fit. Estimates are not stopping
  thresholds or proof of physiological feasibility.
- W10's deterministic inspector now uses the same required-work eligibility while
  independently checking the full sum and requested availability. This is a
  mechanical compatibility correction, not a new quality score or holdout result.
- Schema 1/2 serialized references remain unchanged. Source changes still require
  a fresh trusted binding. New effort fields on incompatible old variants are
  rejected instead of ignored.

The new test fixture is explicitly mechanical. Its oversized optional estimate
exercises the overrun boundary; it is not a proposed workout, approved reference,
new home-week registration, physiological claim or hidden evaluation case.

## Verification and review

Final focused command:

```powershell
node node_modules/vitest/vitest.mjs run test/coach/reviewed-effort-work.test.ts test/coach/reviewed-conditional-recovery.test.ts test/coach/offline-reviewed-week.test.ts test/program/reviewed-week-view.test.tsx test/coach/programming-w10-evaluation.test.ts test/coach/reviewed-set-report.test.ts test/coach/reviewed-rolling-week.test.ts
```

Result: **161 tests passed in 7 files**. Full `tsc --noEmit --incremental false`
and ESLint on the eight changed source/test files passed. Display verification
uses rendered component assertions; no live browser or hosted lifecycle is claimed.

Independent reviewer reproduced three P2 findings: old W10 full-time rejection,
optional preparation left mandatory, and ignored reserved effort fields in old
schemas. All three were repaired with focused regression coverage. The reviewer
independently ran 75 tests before the repairs. Final independent re-review is **clear within core scope**:
100 tests across five suites passed, and all three original in-memory reproductions
now behave correctly. Storage/actual-RIR/lifecycle work remains unverified and open.

One initial UI assertion expected uppercase `Logging` where existing display
renders lowercase `logging`; corrected and rerun. The Next lint wrapper could
not write its cache (`EPERM`); direct ESLint with `--no-cache` passed. No cache
deletion, dependency change or failed-operation retry loop was used.

## Required follow-through

Existing database contract migration `20260928090000` permits schema 1/2 only;
schema 3 insertion currently fails closed. Do not register or issue a schema 3
option under the assumption that local compilation makes storage ready.

The next implementation must extend storage compatibly, then verify exact parent
plan binding, owner isolation, stable replay and uncertain-request recovery.
Add independently reported RIR to the versioned set-report contract and form;
preserve null/unknown and old pending requests, and never infer RIR from RPE.
Carry it through completion/readback and verify optional omissions do not become
performed volume. Follow the existing append-only correction and acceptance paths.

No old accepted rows, frozen W10 runs/ledgers, P5 sealed files or policy capability
were changed. The complete home week still needs its unresolved initial-history
decision; existing 2 RIR and time-allocation judgments remain accepted. Numerical
runtime policy stays disabled and no commit, push, hosted write or model call ran.

Canonical child notes updated. Private board delivery/readback confirmed at version
100, event `d88a4889-646b-4bdb-99cd-bc75c0742b25`.
