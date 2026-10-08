# W5 reviewed-option boundary — local verification

Canonical child: `Fitness-Tracker-u5l.6.1`; parent W5 remains in progress.
Policy: `initial-dose-0.2.0`, frozen by Greg's "Okay" to the presented scope.
Normalized policy source SHA256:
`b1ddbacefaa285dcce9e8c66980fc856ab7055b3e1807b4ca92a6b944fe9f7c6`.

`app/lib/coach/initial-dose-policy.ts` validates a selected option from a trusted
review registry. The option includes before/after working dose, operation, review
source, source revisions and a hash of the reviewed facts/context. No increment
is derived from raw history. Drift or ambiguity requires review; absent evidence
is provisional; an unregistered option/version is unsupported. Contrary evidence
and whole-week uncertainty take precedence over absent history.

The first operation set is retention and an exact reviewed load trial. Trials
preserve variation, implement, protocol, unit, per-side convention, sets, reps,
rest and any previously known effort target. The separately reviewed C2-R target
can fill its previously unknown prescribed effort without claiming it was
observed historically. Every proposed working prescription requires explicit RPE.
Retained doubles/ranges are preserved without template clamping or max inference.

## Verification

- 23 new focused behavior tests; combined command with performed-dose evidence
  regression matched four test files and passed **50 tests**.
- Full `tsc --noEmit --incremental false --pretty false` passed after the final
  change. Focused ESLint passed. Diff whitespace checks passed.
- Focused main-thread review found and fixed a missing guard: retention could
  initially emit an unknown working effort target. A regression now rejects it.
- Tests exercise altered numerical options, source corrections/additions/duplicate
  IDs, review-source drift, changed symptoms/effort/goal/protocol/unit, contradictory
  evidence, whole-week failure, range coercion, multi-variable changes and input
  immutability. The doubles-range fixture is mechanical test data, not a new
  human coaching label. C2-R uses the actual accepted review source.
- Source inspection finds no route/compiler import of this module.
  `app/lib/personalized-coaching-capabilities.ts` still sets `initialDosePolicy`
  to false. Every evaluator result sets `numericRuntimeEligible: false`.

Reproduce:

```powershell
node node_modules/vitest/vitest.mjs run test/coach/initial-dose-policy.test.ts test/coach/performed-dose-evidence.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js app/lib/coach/initial-dose-policy.ts test/coach/initial-dose-policy.test.ts
```

## Limits and next integration

This is an offline numerical-option boundary, not a live eligibility verdict or
complete executable week. It cannot authenticate a supplied user/reviewer, prove
that all relevant context was retrieved, establish temporal freshness, or inspect
whole-week fit independently of the caller. Registry digests detect drift, not
forged authority. A future authenticated server adapter must supply trusted
registry entries, complete scoped source bindings and the applicable context.
Clients/models must never submit replacement review registries or approval hashes.

Next W5 work is the real profile/schedule/composer/validator/basis/snapshot path:
derive source-scoped evidence, lower complete reviewed session work/preparation,
verify actual total-week constraints, invalidate stale drafts and prove saved
acceptance/readback. No selection from these caller-supplied offline facts is
wired into live prompts or APIs. P0/P1 and W10 retain their remaining requirements;
production activation and paid evaluation remain separately authorized actions.
