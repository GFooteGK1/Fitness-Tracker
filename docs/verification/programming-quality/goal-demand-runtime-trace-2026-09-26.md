# Goal demands to generated program — executable verification

Date: September 26, 2026 (Chicago). Task: `Fitness-Tracker-i40.4.2`.
Workspace: `.worktrees/programming-quality`, branch `codex/programming-quality`.

## Verdict

The confirmed general principle is **not yet implemented end to end**. Current
code preserves required qualities and outcome priorities, but uses broad domain
allocations and template ranks to choose weekly requirements. The adaptive
explanation also defaults to one quality per domain. Preserving a goal in a saved
snapshot does not prove that its demands control the executable program.

This verification is complete. P3 implementation remains open. No application
code, numerical policy, production data or accepted athlete plan was changed.

## Reproduced findings

All fixtures are synthetic development cases. None contain the private APEX/Qwik
records or sealed holdout material. The four-domain case isolates the structural
condition applicable to multi-category events; it is not a complete APEX protocol
or a verified real athlete profile.

| Probe | Observed result | Meaning and limitation |
|---|---|---|
| Same speed goal, change required quality from acceleration to maximum velocity | Different stored intent; identical complete serialized session payloads. Adaptive quality remains acceleration. | Declared quality does not direct this path. Equality alone would not prove a coaching error; source inspection confirms requirement construction never reads these qualities. |
| Non-event, targetless practice goal: maximal strength versus strength endurance | Different stored intent; identical complete serialized session payloads. Adaptive quality remains maximal strength. | The gap is not an event-specific problem. These are valid skill goals, not fabricated numerical targets or prescriptions. |
| Maximum velocity explicitly required within secondary speed development | Selected speed requirements are acceleration and deceleration. Maximum velocity is absent from requirements, assignments and missing-coverage gaps. | A concrete silent omission before allocation, despite the quality being present in the primary-speed template. No time-budget change can restore a requirement discarded before scheduling. |
| Reverse priority between two distinct running outcomes in one domain | Both outcomes and changed priority survive storage. Sessions are unchanged and the generated adaptive contract has one allocation-level goal. | Outcome identity is preserved in the snapshot but does not independently govern this allocation. This does not assert that every priority change must always alter a week. |
| Valid confirmed event with strength, power, speed and aerobic outcomes | Projection refuses it with the three-domain compiler limitation. | Safe refusal rather than a falsely complete event plan. Removing the guard alone would not implement outcome-based planning. |
| Change the primary training domain | Complete serialized sessions and movement selections differ. | Positive control: the harness detects executable changes; it is not comparing only explanations or empty plans. |

Seven compiled traces round-trip through the actual stored-format parser with
unchanged session payloads and confirmed intent. Source inputs remain unchanged.
This is an in-memory JSON serialization/readback check, not a hosted database
write, authenticated API exercise, browser rendering or athlete-outcome test.

## Source of the gap

1. `planning-intent.ts` retains `goal.requiredQualityIds`, exact outcome bindings
   and priority order. It is an input contract, not a demand-analysis engine.
2. `planning-intent-server.ts:29` projects confirmed outcomes onto existing domain
   allocations. Line 38 enforces the three-domain boundary. Same-domain outcomes
   are combined into allocation text while their original objects remain stored.
3. `weekly-coverage.ts:276` constructs requirements from the allocation domain.
   `templateIncludedForGoal` at line 538 includes all primary templates, only ranks
   1–2 for secondary development, and rank 1 for maintenance. It does not consult
   the confirmed outcome's required qualities. `programming-policy.ts:388` gives
   maximum velocity rank 3, so it disappears from secondary development before
   a coverage ledger can report it as unmet.
4. `rolling-weekly-plan.ts:169` sends those requirements through the real session
   composer and week validator. The validator checks consistency against the
   constructed requirements, not completeness against every original demand.
5. `adaptive-plan.ts:259` generates one quality emphasis per allocation using
   `DOMAIN_EVALUATION_SPECS`; the confirmed outcomes are attached separately.
6. `rolling-weekly-api.ts` serializes these sessions and intent faithfully. The
   production route uses the same projection/compiler/serialization functions
   (`app/api/coach/weekly/route.ts:177`, `:189`, `:219`). This report exercises those
   pure functions, not the route's authentication, retrieval or persistence RPC.

These are verified local source behaviors. They do not establish which path or
inputs generated a particular historical athlete session in production.

## Bounded repair to carry into P3

Use the accepted [whole-week strategy design](../../plans/whole-week-strategy-design.md)
and [general planning principle](goal-to-training-themes.md). Put explicit demand
and theme resolution **before** requirement construction:

- Preserve each confirmed outcome and its supported demands, including multiple
  outcomes in one domain and one outcome requiring multiple qualities.
- Link each demand to a justified theme: develop, maintain, introduce progressively,
  observe, defer or unsupported. Keep proposed interpretation separate from
  confirmed athlete intent and retain evidence/rationale for each choice.
- Resolve themes to existing eligible prescription capabilities. Return explicit
  gaps when those capabilities cannot express the justified work; do not invent
  a load, session dose or general event adapter.
- Validate the resulting week against the original demand ledger as well as the
  scheduled requirements. A discarded requirement must not make its demand vanish.
- Build the explanation from the same selected themes and executable obligations.
  Preserve immutable legacy/accepted snapshots and the existing revision fence.
- Replace these limitation assertions with reviewed behavior checks as each path
  is repaired. Retain the positive control, serialization and provenance checks.

Do not merely remove the domain limit, promote maximum velocity for every athlete,
or add another explanation after the unchanged allocator. Those changes would
not implement goal-derived themes and could silently alter numerical authority.

P3 runtime work retains its existing P2 package-acceptance dependency. The current
P2 acceptance receipt still requires P0 adjudication and generated-response quality
evidence; no new approval requirement was invented for this trace. Numerical
policy review, qualified executable-week evaluation and hosted activation remain
their existing separate gates. Diagnostic verification can proceed independently.

## Verification and reproduction

- New harness: `scripts/programming-goal-demand-trace.ts`.
- New seven-check characterization suite: `test/coach/programming-goal-demand-trace.test.ts`.
- Focused run including intent/server and P3 preparation: **172 tests passed in 10 files**.
- `npx tsc --noEmit` passed; focused ESLint and `git diff --check` passed.
- Network is trapped in the new suite; numerical `initialDosePolicy` remains false.
- Optional local report includes full session-payload hashes, selections, gaps and
  source-file hashes at ignored `output/programming-quality-review/goal-demand-trace.json`.
- Frozen P0 baseline artifacts and sealed holdout were not changed or accessed.

PowerShell reproduction:

```powershell
$env:WRITE_GOAL_DEMAND_TRACE_REPORT='1'
npx vitest run test/coach/programming-goal-demand-trace.test.ts
```

The report is regenerated only when explicitly requested. Passing characterization
checks verify the diagnosis; they are not approval of the observed programming.
