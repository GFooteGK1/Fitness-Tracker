# W5 reviewed compiler and shared reader integration

Task: `Fitness-Tracker-u5l.6.5`; branch `codex/programming-quality`.
Local implementation only. Parent W5 and programming-quality gates remain open.

## What changed

The rolling-week module has an explicit trusted reviewed build entry producing
five dated, lossless sessions. Default generation is unchanged. The new result
remains non-persistable and numerically ineligible. It invents no coverage ledger,
fatigue score, adaptive assessments or assessment-derived load anchor.

The browser-safe decoder checks doses, effort/load variants, sides, distance
stages, time arithmetic, preparation windows, unique steps, protocol references,
source correspondence, dates, budgets and exposure spacing. Compiler/readback
share timing code. Malformed reviewed data cannot fall back to legacy format.
Historical decoding does not require current sources and grants no generation
authority. It cannot prove that saved doses match a trusted recipe digest;
atomic acceptance must independently recompute trusted content.

Weekly GET validates the new snapshot against its row window/sequence. The
authenticated base reader does the same with owner-scoped reads. Old mutation
paths reject this format. The standard serializer guards both its session list
and the scheduled prescriptions it actually serializes, including mixed payloads.

The real weekly and active-program displays render preparation, ramps,
monitoring, doses/ranges, each prescribed RPE/rest, per-side core, running stages,
week limitations and protocol guidance. Unknown loads and sensor values stay
unknown. The view offers the ordinary workout log; it does not invoke old
hardest-set signals or completion. Automatic legacy assessment assignment skips
reviewed sessions rather than treating monitoring as a formal assessment.

## Verification

- Current-source regression:10 files /157 tests pass, using `--exclude 'output/**'`.
- Full TypeScript check, focused ESLint and `git diff --check` pass.
- Independent review:112 tests pass across five source suites; no remaining
  blocking findings after serializer, row-window and decoder/guidance fixes.
- Actual Chromium `/program`:3 cases pass at320/light,390/dark and1280/light.
  Synthetic auth/API responses intercepted; unknown requests aborted. No hosted
  writes. Verified critical prescriptions, no legacy accept/log controls,
  keyboard disclosure,44px log link, no horizontal overflow or page exceptions.
  Mobile top screenshots visually inspected.
- Screenshots:
  `output/playwright/app-quality-results/reviewed-week.pw.ts-lossless-reviewed-week-at-{320-light,390-dark,1280-light}/`.

An initial Vitest filename filter also selected two retained release copies under
output. Their stale mocks caused10 failures; the four current files passed.
Excluding output resolved discovery without editing those artifacts. An initial
TypeScript object-narrowing error was fixed before the passing full check.
Details: `handoffs/investigations/Fitness-Tracker-u5l.6.5.md`.

## Still required

This proves generation and structural JSON read/display, not database save or
acceptance. The current session constraint only permits legacy or complete-v0.3.
Extend it explicitly with owned storage, stable activity/set capture, lossless
completion, atomic source-fresh acceptance, correction invalidation and real
Auth/PostgreSQL readback. Do not bypass the constraint by spoofing another format.
Complete canonical movement/equipment mapping and authenticated whole-week
registration before exposing generation. P0/P1 and W10/holdout remain open.
`initialDosePolicy` stays false. No migration, deployment or production write.
