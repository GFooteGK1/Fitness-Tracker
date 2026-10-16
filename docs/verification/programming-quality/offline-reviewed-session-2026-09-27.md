# W5 offline reviewed-session integration

Canonical task: `Fitness-Tracker-u5l.6.2`, child of unfinished W5 `u5l.6`.
Workspace: `.worktrees/programming-quality`, branch `codex/programming-quality`.

## Delivered locally

`offline-reviewed-session.ts` consumes a trusted local option/recipe registry,
reevaluates candidate bindings, and lowers the reviewed working prescription
through `session-composer.ts`. `program-validator.ts` validates the offline
result against the current registry and source assertions. The distinct
`offline_reviewed_session_v1` format is explicitly non-persistable, requires
athlete acceptance and retains `numericRuntimeEligible: false`.

The C2-R fixture preserves barbell bench 170 lb, 3x6, target RPE7-8 each set,
180-second rests, all seven ordered preparation steps, their loads/reps/effort
and rests, and the reviewed stop/logging instructions. It does not invent prior
effort, actual 170-lb performance, accessory work or total session duration.
As-needed preparation rest remains null; estimated minutes remain null and
wholeWeekFitVerified remains false. The earlier candidate gate's verified input
is only a synthetic caller assertion in this test, not real timing evidence.

Review prose hash (LF-normalized, JSON string hashing):
`efa25b8a63dcfb9104e04a62f53a24d711fcdfe1ff94eacb873d0776d9187a3d`.
Pinned complete recipe digest:
`cab357a7165ca102c0ff299fbd46eba67005bb050cce74cd7ffb0d479069adc9`.
The source and translation are pinned separately so fixture changes cannot
silently redefine accepted preparation. Hashes are not reviewer authentication.

## Verification

- 93 tests pass across offline-reviewed-session, initial-dose-policy,
  rolling-weekly-plan, program-validator and session-composer suites.
- Full `tsc --noEmit --incremental false` and focused ESLint pass.
- `git diff --check` passes (existing CRLF conversion warnings only).
- Independent reviewer found no blocking implementation defect in this scope;
  independently reran 48 focused tests. Requested recipe pinning is resolved.
- Tests cover post-compilation working/preparation mutations, omitted/reordered
  steps, changed units/protocol/convention/RPE/rest, conflicting source/context,
  catalog equipment/experience/avoidance restrictions and default live rejection
  in both preparation and working blocks. Mechanical retention tests preserve
  doubles/ranges without adding a human coaching label.
- Existing live capability remains `initialDosePolicy: false`. No API/route
  calls the offline compiler. Catalog bench status remains evidence-only.

## Limits and next action

This is working-prescription and recipe lowering, not a complete generated week.
The catalog check covers the working movement; preparation eligibility is not
proven. Authenticated scoped evidence/registry retrieval, context completeness
and correction invalidation, profile/schedule/basis/snapshot reconciliation,
real whole-week timing and immutable acceptance/readback remain W5 work.
P0/P1, holdout/W10 and production activation remain separate gates. No production
calls, migration, deployment, activation or paid model calls were made.
Changes are local and uncommitted.
