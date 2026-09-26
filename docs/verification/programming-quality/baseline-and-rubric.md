# Programming quality: offline development baseline

This is P0 engineering preparation, not P0 completion. Greg volunteered as reviewer on 2026-09-21 and subsequently [agreed to six qualitative coaching responses](signal-review-decisions.md). Numerical policy and physiological-method validation remain open, and no sealed holdout exists. The [first review packet](policy-review-round-1.md) records separate pending numerical decisions. The baseline report retains its historical unassigned status at generation; assignment is not retrospective approval. No model, paid inference, database, or live athlete data is used. Twenty-four implementation-visible synthetic cases across nineteen failure/domain families characterize the current compiler; successful characterization does not establish good programming.

## Decision and domain boundaries

The future decision is whether a replacement planner materially improves executable training weeks over current Socius while preserving evidence and athlete authority. The present harness freezes inspectable current behavior and exposes where the compiler cannot act on useful information. It does not judge a model, evaluate weekly-review decision selection, or prescribe training for Greg.

Relevant domain distinctions are actual versus prescribed work; sets versus aggregate repetitions; direct outcomes versus proxies; fixed monitoring work versus normal work; changed schedule versus physiological adaptation; and repeated comparable observations versus a single noisy reading. Missing logging coverage is not inactivity. A software reviewer can establish these data/contract properties; a qualified coaching reviewer must establish prescription suitability, relevant signal interpretation, and acceptable tradeoffs across a week.

The failure costs are wasted training, inappropriate workload or timing, misleading progress claims, and silently discarded goals. The compiler returning a valid week cannot by itself resolve those risks.

## Running and artifacts

From the worktree, using the existing repository dependency installation:

```powershell
node node_modules/vitest/vitest.mjs run test/coach/programming-quality-baseline.test.ts --root .

# Explicitly regenerate the visible local characterization report:
$env:PROGRAMMING_QUALITY_REPORT = '1'
node node_modules/vitest/vitest.mjs run test/coach/programming-quality-baseline.test.ts --root .
Remove-Item Env:PROGRAMMING_QUALITY_REPORT
```

The implementation worktree uses the existing release dependency installation through a local junction with an identical lockfile. No installation is required or authorized by this harness. The ordinary test command writes no report. The explicit report option overwrites only `docs/verification/programming-quality/baseline-report.json`; archive a report under a new name before intentionally replacing evidence needed for a comparison.

`scripts/programming-quality-baseline.ts` exports pure case construction and execution functions. It calls the real factual-history and rolling-week compiler entrypoints, retains full input/context/compiled output or the exact blocker, and records a narrow executable projection hash for controlled comparisons. The projection includes movement, role, dose, execution target and load anchor; it excludes prose and other session fields. The complete outputs remain available for inspection. Therefore projection equality is not proof that all full-output fields are identical.

The report includes selected source-file SHA256 values, input hashes, cases, complete outputs, and null domain-review labels. The selected source inventory is an aid to review, not a self-contained archived runtime or complete dependency-closure hash. Reproduce against the recorded checkout and preserve its dependency lockfile when freezing a later experiment. The generated report itself is not a test-run receipt; use the Vitest result to establish which assertions passed.

Verified baseline checkout: `f123aa8aa848716e894ea7bec340d693995e4b36` (fresh tracked main for this worktree). The local prompt-projection work is uncommitted and does not participate in this pure compiler harness. `package-lock.json` SHA256: `B2419B0C94C73FD48FA9FD7EBB77FC99C0D19E77D590570147816DE28E8B3B0A`. After resolving the existing dependency location, full `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` passes. No application numerical policy was changed.

## Visible development roster and observed behavior

| Family | Cases | Mechanical observation / quality question |
| --- | --- | --- |
| Supported domain variety | Six existing golden profiles: strength, hypertrophy, power, speed, aerobic, resilience | Complete weeks are retained for review; existing golden inputs are reused and are not new independent athlete examples. |
| Performed-dose contrast | Reported floor press 3 x 8 at 135 lb versus 4 x 2 at 205 lb | Actual differing source quantities reach familiarity but not numerical dose context; executable projections are identical. These synthetic numbers are test facts, not recommendations or approved continuity labels. |
| Logging coverage | Empty history versus partial retrieval | Empty history retains unknown coverage; partial retrieval produces a blocker. Domain review must judge whether a future useful limited prescription is possible. |
| Outside training | Unknown versus reported Tuesday/Thursday 75-minute practices | The note is retained but compiled work is unchanged. This demonstrates no numerical/schedule response, not proof that every such note requires a change. |
| Monitoring request | `collect_signal` for the compiled barbell floor press | Guidance names the velocity protocol, but the executable prescription is unchanged and no dedicated monitoring work is created. This compiler-request case does not evaluate the upstream review's physiological/protocol eligibility. |
| Availability correction | Ordinary continuation moves availability to Thursday/Friday/Saturday | Current continuity rejects the schedule change. No alternative schedule is fabricated by the harness. |
| Outcome breadth | Four distinct training areas, five 60-minute opportunities | Current profile validation rejects the fourth area. This is a representational boundary case, not a fully modeled APEX athlete. |
| Time boundary | Two 20-minute opportunities | Current compiler rejects the budget; the input is not enlarged to obtain a pass. |
| Corrected revision | Same reported heavy-work source, revision 2 and corrected provenance | The new revision is retained; numerical history remains absent and compiled work matches the earlier heavy-work case. This tests current-state provenance, not historical replay or draft invalidation. |
| Quantity provenance | Athlete-confirmed model estimate versus unreviewed import | Confirmation preserves estimated origin and does not make that record familiarity-eligible; unreviewed import movements are excluded. |
| Session identity | Two distinct reported same-day sessions | Both source identities survive and completed-session count is two; no aggregated dose or maximum is inferred. |
| Missing quantity | Known sets/reps with no recorded load | Source load remains absent and no load anchor is invented. |
| Assessment variation | Saved Back Squat assessment with null variation versus Box squat to parallel | Existing assessment-based anchors are generated; changing the variation leaves the executable prescription unchanged. This is an observed eligibility limitation requiring review, not an endorsement of equivalence. |
| Scheduling opportunities | Five 60-minute hypertrophy opportunities versus the original three | Confirmed days are retained; composed and unused days are both reported. Availability is not treated as a demand to fabricate five training sessions. |

Current run: **24 cases, 20 compiled outputs, four explicit blockers; 12 characterization tests pass. Zero prescriptions have qualified coaching scores.** The blockers are incomplete history, unsupported ordinary-continuation schedule change, a fourth training area, and a 20-minute budget.

Expected characterization assertions deliberately describe existing limitations. When implementation fixes a limitation, retain this baseline artifact, build a separately named candidate run, and update the regression criterion to the new intended behavior. Do not retain a characterization assertion that forces the product to remain deficient.

## Review rubric (not yet calibrated)

Score each dimension 0 = unacceptable, 1 = requires a material correction, 2 = usable within declared scope. A compiled output has no automatic score. Null is unreviewed; NA applies when no program exists and never counts as successful programming. The examples below explain rubric interpretation and are not physiological gold labels.

| Dimension | Score 2 example | Score 1 / borderline example | Score 0 example | Grader |
| --- | --- | --- | --- | --- |
| Evidence fidelity | Explicit sets, units, corrections and unknowns preserved with source links | Relevant source retained but its uncertainty needs clarification | Aggregate reps treated as one maximum set or wrong athlete data used | Mechanical/source review; human interpretation |
| Outcome and athlete fit | Every confirmed outcome has an explicit justified role | A maintenance choice is plausible but insufficiently explained | A required event outcome disappears silently | Qualified coaching review |
| Prescription suitability | Reviewer finds executable dose supported by individual evidence and reviewed policy | Dose requires a substantive adjustment | Invented or unsupported numerical prescription | Qualified coaching review plus authority checks |
| Whole-week feasibility | Actual work, rest, monitoring and transitions fit constraints; demands reconciled | One session needs material shortening or relocation | Program violates confirmed availability or restriction | Code checks plus qualified coaching review |
| Monitoring/adaptation judgment | Comparable measurements answer a specific decision without protocol drift | Observation is relevant but cannot distinguish proposed alternatives | Incompatible VBT series pooled or single proxy reading forces durable change | Protocol checks plus qualified coaching review |
| Executable clarity and consistency | Saved session implements the reviewed explanation | Explanation leaves a material execution choice unresolved | Prose promises a different load/order than the executable week | Mechanical readback plus human review |

Critical errors include fabricated facts or clearance, wrong ownership, unsupported numerical authority, silent accepted-plan mutation, incompatible protocol pooling, and contradictory persisted prescriptions. They block launch regardless of average score. Record issue, source evidence, affected output path, reviewer, rationale and proposed correction. Domain judgments must not be manufactured from the compiler output to make existing behavior pass.

Before judging a future holdout, the assigned reviewer must independently label a calibration batch, resolve disagreements and document concrete domain-specific anchors. Code assertions can detect existing gaps and violations but cannot approve training effectiveness. No LLM judge is configured; adding one requires calibration and separate paid-call authority if applicable.

## Holdout reservation and comparison protocol

Reserve sixteen future independently authored cases, grouped into athlete trajectories and failure families. No reserved inputs, expected outputs, or labels are generated here. Keep every related trajectory and near-duplicate in one split. Suggested reservation coverage: four evidence/protocol trajectories, four scheduling/multiple-outcome trajectories, four sparse/conflicting-history trajectories, and four numerical/adaptation-boundary trajectories. An independent preparer should decide exact allocation before freezing the launch scope; these are coverage reservations, not hidden fixtures.

For a later comparison, freeze scope, source/runtime identity, common information budget, roster, rubric, and permitted numerical policies before inference. Present executable candidate and baseline weeks under randomized labels to a reviewer who did not author their prescriptions, then reveal rationale for traceability review. Record possible arm recognition. Keep the arm key separate. Provider failures, correct/incorrect abstention and unsupported capability remain separate outcomes; none can inflate successful-week counts.

Report raw supported and unsupported counts over the whole roster, all six dimensions, and critical failures. The QPlan's launch gate applies to the future qualified run: all required launch cases and all supported sealed-holdout cases must receive usable scores in every dimension, with no critical errors and demonstrated resolution of named baseline failures. Freeze support scope before the run. Do not retroactively call failed cases unsupported. Exposed holdout cases move to development and require new untouched cases for a later release claim.

## Remaining work and acceptance boundary

- Reviewer assignment is resolved: Greg Foote. Confirm the review scope, adjudicate disputed personal evidence privately, and calibrate the rubric. P0 cannot close before the remaining requirements are met.
- The visible roster now contains the QPlan's 24 development cases. Cardinality does not establish complete launch-case coverage: add or replace cases as genuine fixed-protocol inputs, device changes, comparable/noisy trajectories, restrictions and direct-versus-proxy policy entrypoints become available. Do not fake integration by attaching unused metrics to current inputs.
- Add candidate planner and persisted acceptance/readback integration only when those capabilities exist. This harness currently calls pure kernels with synthetic review decisions; it does not test model selection, physiological eligibility, persistence, RLS, hosted behavior, or training outcomes.
- Retain `qsp`, `u5l.6`, and `u5l.11` gates. Passing this suite does not authorize numerical policies, production activation, or completion of P1/P5.
- Revisit failure taxonomy when real reviewed failures arrive. Preserve superseded baseline reports and document source drift rather than silently rewriting expected outcomes.
