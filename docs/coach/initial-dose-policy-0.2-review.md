# Initial-dose and next-exposure policy 0.2 — frozen local implementation scope

Prepared 2026-09-27 for `Fitness-Tracker-qsp` and `Fitness-Tracker-u5l.6`.
Status: **scope frozen by Greg on 2026-09-27 for local implementation; not enabled**.
Policy version: `initial-dose-0.2.0`.
Review source: Greg replied "Okay" after the presented policy-freeze scope and
request for sign-off. This approves the supported operations and evidence contract
below. The separately accepted exact C2-R session supplies its numerical option;
unreviewed numerical operations remain unavailable.
This consolidates Greg's actual decisions rather than requesting them again.
The older 0.1 document in the sibling `coaching-layer` worktree is retained as
historical evidence; it is not silently edited or declared approved.

## Problem corrected

The 0.1 draft only offered unchanged prescriptions after two matching exposures
inside a 28-day window. That does not match the accepted distinction between a
routine next-exposure trial and a strategic program change. It also cannot express
the reviewed heavy doubles without treating the compiler's three-rep minimum as
a coaching rule. The newer reviewed cases require a goal-dependent decision,
working-set effort and actual context, not a mandatory repeat count.

The existing architecture remains: evidence and reviewed policy establish eligible
options; the planner selects and explains an option; deterministic code validates
and compiles it; the athlete explicitly accepts a new version. Accepted history
does not change. An articulate rationale cannot create numerical authority.

## Sources and status

The source records are in `docs/verification/programming-quality/`:

| Source | What is actually reviewed | What it does not establish |
|---|---|---|
| `policy-review-round-1.md`, C1 and C2-R | Strength-goal context can favor a small next-exposure load trial, including the one complete 165-lb exposure with actual set RPE 7/7/7 | A universal increment, RPE cutoff or auto-progression after every session |
| Same, C1-F | Investigate failed-set context; provisionally retain load, aim for at least six reps while prioritizing true 2–3 RIR; stop earlier and record the shortfall when necessary | A fixed number of repeats or automatic load reduction |
| Same, C5 | Capture RPE on each working set; prescribe rest to maintain intended intensity | Imputed historical effort, automatic RPE/RIR conversion or one mandatory rest duration |
| Same, C6 | Use applicable conversion evidence; otherwise assess the actual movement; adapt to limitations | A conversion formula or a required maximal test |
| Same, C7/R3 | Heavy doubles belong in supported strength scope when appropriate | New universal load, frequency or effort limits |
| Same, C4 | Reconcile added training and goal-specific bench demand with the whole week | Doubling volume automatically when another day is available |
| `signal-review-decisions.md`, cases 3–6 | Investigate conflicting signals; separate changed protocols; preserve performed reps when sensor data is incomplete; propose actual schedule changes | New velocity thresholds, completeness formulas or automatic mutation of accepted plans |
| `developmental-bench-week-1.md` | Complete synthetic base and Tue/Wed swap accepted as a usable test reference | Five 60-minute sessions, all-event APEX coverage, live personal prescription or production permission |

The accepted hypertrophy and bodyweight corrections remain separate reviewed
prescription examples. No six-dimension scores are inferred from qualitative
acceptance. Fixed baseline and signal-review files remain unchanged.

## Frozen decision contract

1. **Establish the task and goal.** Distinguish retained accepted work, a routine
   next-exposure trial, an initial prescription with sparse evidence, and a
   strategic adaptation. A single well-documented exposure can support a routine
   trial. Plateau, maintenance and major emphasis changes still require the
   relevant comparable pattern and goal-transfer evidence.
2. **Resolve actual evidence.** Retain owned source/session IDs, athlete-local
   dates, corrections and the value available at the decision time. Deduplicate
   repeated exports or acknowledgements by identity. Preserve multiple real
   same-day sessions as separate evidence; do not turn set counts into sessions.
3. **Keep target and response separate.** Preserve the full prescribed bundle
   and actual load, reps, set effort, completion, changes/reasons and symptoms.
   Unknown effort or load stays unknown. An overall session rating does not
   supply each set's RPE; as-prescribed acknowledgement cannot erase a pain report.
4. **Check comparability.** Match movement, implement/variation, protocol, role,
   units, per-side convention, effort scale and rest. Missing fields are not equal
   merely because both are absent. A supported conversion needs explicit source,
   applicability and uncertainty; otherwise ask or use a separate series.
5. **Inspect conflicting and newer context before selecting.** A stopped or
   modified later session cannot be skipped to select an older favorable pair.
   Where the reason changes the decision, retrieve it or ask one specific
   question. This is an engineering application of the reviewed context/clarify
   principles; it is not a newly supplied C3 case response.
6. **Choose a goal-fitting option.** Retaining a reviewed accepted bundle is an
   available option when it remains appropriate. If a routine trial is supported,
   propose one meaningful variable change with a stated rationale and a response
   to observe. The exact numerical option requires a reviewed rule and parameters
   or an explicitly reviewed case. If those are absent, report the missing
   numerical option; do not silently replace the desired progression with a hold
   and label that an equivalent successful decision.
7. **Reconcile the entire week.** Confirm the applicable availability, frequency,
   outside work and restrictions from current source context. Missing workout
   logs do not establish zero training or detraining. Calculate preparation,
   work, rest, transitions and logging for the actual proposed schedule. A
   relocation preserves its dose unless a separate change is explained and
   accepted. Do not shorten required recovery to force a duration estimate.
8. **Compile only supported quantities.** Preserve ranges and exact doubles;
   do not clamp two reps to three, choose a range midpoint as observed performance,
   infer a max, transfer a load by name alone or treat bodyweight as zero load.
   A representation gap is explicit. Existing permissions and restrictions still
   apply even when a source prescription is accepted.
9. **Propose, then accept a new version.** Show the complete new week, source
   basis, changed variable/day, monitoring protocol and limits. Bind the draft to
   source revisions and policy version. A material source correction invalidates
   the affected unaccepted draft. Persist acceptance with ownership/idempotency
   and verify the saved readback; preserve the original accepted plan.

This contract does not derive clinical clearance from history. Current symptoms
or restrictions retain precedence. A routine one-variable heuristic does not
override the separately reviewed coordinated running adjustment in complex case X2.

## Evidence age and sufficiency

The existing 28-day query window is an implementation retrieval boundary, not a
biological expiry or a qualified two-exposure minimum. Record the actual window,
coverage and unavailable older evidence. Do not assert that a record outside the
window proves reduced capacity, or that a complete query means no outside work.
An accepted base and a newly copied performed dose have different source authority.

Proposed behavior when older history matters: retain it as dated reference when
available, check current applicable context and ask only if an unresolved change
affects the choice. No universal age cutoff, mandatory second session or new
automatic progression threshold is introduced by this revision. Current-context
confirmation must have a source, date and applicable planning window, with no
newer conflicting update. A stale or undated confirmation does not satisfy that
engineering evidence requirement.

## Concrete numerical review register

| Option | Status | Boundary |
|---|---|---|
| Retain the accepted synthetic developmental base and its reviewed Tue/Wed swap | Reviewed as the limited test reference | Source-bound unchanged values; weekday 60-minute slots and Saturday 75; no live athlete inference |
| One-exposure bench 165 lb, 3×6, actual RPE 7/7/7, 180-second rests → small next-exposure increase | Qualitative decision reviewed | Same variation, crisp completion, recovery and unchanged commitments; older history unknown |
| Same case → 170 lb, 3×6, target RPE 7–8 each set, 180-second rests; 2.5-lb plates available | **Exact session accepted by Greg, 2026-09-27** | Includes the newly proposed warm-up; see `docs/verification/programming-quality/bench-next-exposure-review-1.md`. Stop earlier at effort/technique limit and retain actual reps/RPE. This is not a universal 5-lb rule |
| Automatic load conversion, percentage progression, generalized velocity/completeness thresholds or numerical initial selection for other cases | Not supplied by these reviews | Separate reviewed operation and parameters required before eligibility |

## Compiler reconciliation that follows policy freeze

Current source confirms strength's template minimum of three reps and RIR-first
anchors in `app/lib/coach/programming-policy.ts`. The schema can represent an
explicit RPE target, but the current generated week does not reliably emit it.
The existing load-anchor contract must be reconciled with reviewed source-bound
loads; recording a valid JSON snapshot does not implement that path.

`u5l.6` must provide an inspectable option contract with source references,
operation, before/after complete dose, protocol identity, policy version,
eligibility reasons, context checks and source-correction behavior. P1 then
requires actual executable monitoring/working sets, complete time accounting,
rescheduling and persisted acceptance/readback. The accepted Markdown/JSON test
reference is input to those checks, not proof they pass.

## Freeze and activation status

Greg approved freezing the presented scope for local implementation: retain and
reschedule appropriate reviewed complete work; permit supported single-exposure
trials using reviewed numerical options; preserve working-set effort, rest,
preparation, source history and monitoring; include appropriate doubles; investigate
conflicts and clarify material unknowns; never infer detraining from missing logs
or a retrieval boundary; preserve accepted plans and require explicit acceptance.

This resolves `qsp` for that scope. The exact C2-R session is accepted within its
stated case; unknown numerical operations remain unavailable rather than acquiring
hidden defaults or a universal five-pound increment. This does not supply missing
case scores or close P0/P1, W5 implementation or held-out W10 verification.
Implementation, qualified holdout evidence and target-specific live activation
remain separate. Numerical `initialDosePolicy` stays disabled. A future material
policy change requires a new reviewed version rather than editing this freeze.
