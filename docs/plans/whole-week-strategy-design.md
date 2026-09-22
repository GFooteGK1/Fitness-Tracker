# Whole-week strategy: P3 preparation

Date: 2026-09-21. Status: proposed interface design within the accepted programming-quality QPlan. Tracking: `Fitness-Tracker-i40.4.1`.

This package prepares P3 while Greg reviews the six signal cases. It does not implement a planner, approve numerical policy, change an athlete's program, or complete P2/P3. The contracts and examples below are development artifacts. `initialDosePolicy` remains false.

## Recommended approach

Represent every confirmed outcome, map justified work to explicit exposure obligations, compare bounded whole-week arrangements, then compile the selected arrangement through deterministic prescription and time validation. Strategy must influence candidate construction. An explanation added after today's greedy allocation would leave the central programming limitation intact.

| Approach | Behavior and cost | Failure, security and operation | Verification and reversibility |
|---|---|---|---|
| Fortress: annotate the current allocator | Smallest migration; retains allocation templates and greedy day selection | Still collapses same-domain outcomes and cannot compare meaningful arrangements. Existing authority boundaries remain simple. | Existing tests plus outcome coverage checks; easy to disable, but unlikely to meet P3 acceptance. |
| Synthesizer: outcome obligations and bounded alternatives — recommended | Moderate interface/compiler work. Retains exact outcome bindings and links shared physical work to multiple outcomes where justified. | Candidate vocabulary can still be insufficient. Expose unsupported obligations and search limits. Only owned source references and authorized prescription IDs reach compilation. | Contract and scenario checks, then reviewed executable weeks. Disable the new proposal path without rewriting accepted snapshots. |
| Avant-Garde: unrestricted whole-week authorship or a general optimizer | Broadest flexibility; greatest migration and maintenance burden. A solver still requires reviewed constraints and a useful objective. | Model-authored doses or invented optimization weights expand authority. More semantic validation and operational tracing required. | Much larger adjudicated evaluation needed; retain old generator for rollback. Revisit only if bounded alternatives demonstrably fail important supported cases. |

No universal fatigue score, new spacing rule, dose threshold, or optimizer weight is introduced here. Consolidation of stressors remains a qualitative comparison of overlapping demands, priority output, grouping/separation, and likely effects on later session quality. Distinguish a coaching hypothesis from an established hard constraint.

## Current integration evidence

Paths are relative to this worktree; symbols are the durable references.

| Source | Current behavior | P3 boundary |
|---|---|---|
| `app/lib/coach/planning-intent.ts`, `PlanningIntentV1` | Retains 1–8 outcome bindings and explicit priority order | Reuse its IDs, measurement/protocol bindings, status and confirmed version; do not recreate athlete memory. |
| `planning-intent-server.ts`, `applyConfirmedIntentToProfile` | Rejects more than three distinct domains and requires matching domain allocations | Add a versioned outcome strategy path. Removing the guard alone is insufficient. Preserve validation of historical profiles. |
| `programming-schema.ts`, `validateProgrammingProfile`; `complete-intake.ts`, `validateCompleteCoachPlanningInput` | Limits secondary allocations and requires unique allocation domains | Keep the legacy contract readable; new strategy must account separately for multiple goals within one domain. |
| `weekly-coverage.ts`, `buildWeeklyCoverageSchedule`, `chooseAssignmentDays`, `templateIncludedForGoal` | Allocates requirement by requirement using time and template rules; maintenance prunes templates | Separate physical obligations from outcome credit. Explicitly justify maintenance dose rather than treating template pruning as proof of adequacy. |
| `session-composer.ts`, `composeWeeklySessions` | Prepares the lead assignment and sums estimated block minutes | Produce disjoint time entries for all preparation, ramp sets, monitoring, work/rest and transitions; validate complete sessions. |
| `program-validator.ts`, `validateCompleteProgrammingWeekDose` | Checks assignments, prescriptions and ledger consistency | Reuse these checks where compatible. Shared outcome credit must not duplicate physical assignments or doses. |
| `planning-context.ts`, outside-training context | Carries reported/unknown outside training; scheduler does not consume a structured commitment | Add structured planned/performed/uncertain facts; never silently subtract unknown work or award coverage from a note. |
| `rolling-weekly-plan.ts`, `buildRollingWeeklyPlan` | Copies accepted sessions for ordinary continuation | Preserve continuation. Changes require explicit operations and a reviewed replacement proposal. |

## Proposed contracts

The companion [TypeScript contract and synthetic example](../verification/programming-quality/p3-strategy-contract.ts) makes the principal boundaries inspectable. It is not imported by application code and is not a runtime validation implementation. Production codecs, bounded payload limits and storage migration remain implementation work.

**Basis.** Bind a strategy to the owner, confirmed intent ID/version, source revision, accepted base, evidence packet and policy/catalog versions. The server supplies these values. Current source corrections invalidate an unaccepted draft through the existing revision fence; accepting a proposal compares the same basis transactionally. An accepted strategy remains an immutable historical record even when its sources are later corrected.

**Outcome ledger.** Exactly one disposition for every confirmed outcome: develop, maintain, observe, defer, or unsupported. Preserve achieved/paused/superseded statuses too; explain why each has or lacks work. Develop/maintain must identify justified exposure obligations or return an unresolved gap. Achievement alone cannot authorize a maintenance dose. Missing priority becomes a decision-changing question when allocation depends on it. Unsupported event capabilities cannot silently disappear or be counted as covered by a proxy.

**Exposure obligations.** Each physical exposure has a stable ID, linked outcomes, semantic role, and an eligible prescription reference. Multiple outcomes may share one exposure only with an explicit, reviewable credit rationale; time and dose count once. Credit may be direct, proxy or proposed, and does not establish demonstrated attainment. An eligible reference identifies an accepted unchanged prescription, an independently reviewed base, or a validated policy bundle; a maximum effort alone does not authorize a future prescription. P4 owns broader prescription construction and explicit monitoring serialization. P3 must report a missing capability until that producer exists.

**Monitoring.** Monitoring and working exposures remain separate. Fixed monitoring references preserve protocol version, load/repetition definition and conditions. A relocation may change the day but cannot silently change the protocol; a changed protocol starts a different comparison series. Missing sensor repetitions do not reduce reported performed repetitions. Monitoring time is included in session feasibility.

**Outside work and adjacent days.** Record whether a source describes a confirmed planned commitment, performed history, or uncertain work; keep ownership, date/time boundaries, duration certainty and qualitative demands. Only confirmed overlap consumes the same availability window. Performed work informs evidence; it is not deducted again from future time. Outside work earns outcome credit only through a separate verified match. Include dated sessions immediately before/after the proposed week when available; unknown adjacent work remains explicit. Do not assume circular weekday spacing represents the athlete's actual schedule.

**Time ledger.** Partition each training window into preparation, ramp, monitoring, work including rest, transition/setup, overlapping outside commitment and unused reserve. Entries cannot overlap or double-count shared preparation/rest. Durations are known, bounded estimates, or unknown with a source. Sum upper bounds to determine fit; report it as estimated feasibility when estimates are used. Unknown required duration prevents certification of fit. Five 60-minute windows do not imply all 300 minutes must be filled or that a 55-minute work block fits after warmup.

**Alternatives and selection.** Construct at least a retain/relocate comparison when applicable; compare grouped and separated arrangements when overlap matters and both are admissible. Alternatives preserve prescription identities for schedule-only edits. Record hard constraints separately from qualitative preferences, priority session output, tradeoffs and evidence that could change the selection. The model selects validated candidate identifiers; it cannot create numeric doses, constraints or evidence. Revalidate compiled output because composition can change time requirements. If only one candidate is admissible, explain why; never manufacture a token alternative.

This proposed P3 contract deliberately compares arrangements of the same declared exposure set; every candidate selects every obligation exactly once. Alternative numerical bundles require separate strategy drafts with their own outcome ledgers and explicit prescription-change review. P4 must extend this contract before mixed-bundle alternatives are supported. Outside-context coverage distinguishes confirmed-none from unknown even when the work list is empty. Dated intervals carry local bounds, offset and source; unknown intervals prevent a claim of verified overlap. Adjacent-session coverage is separately visible. Production validation must use `timezone-utils`, check intervals against availability and split cross-midnight commitments without double counting.

**Results.** Return ready, needs confirmation, capability gap, or no feasible candidate found. Search exhaustion must not claim mathematical infeasibility: report whether enumeration was complete and identify the limiting constraints. No partial week may be labeled complete. A useful result names unmet outcomes and the smallest possible relaxation or missing fact, without silently applying it.

**Proposal operations.** Separate schedule relocation, protocol insertion, prescription change and outcome-emphasis change. Adherence or availability can justify a relocation without a physiological adaptation signal. A dose/emphasis/recovery change requires its own qualified evidence and policy authority. Produce a before/after diff and acceptance record. Proposed priorities are not confirmed athlete intent. Preserve existing coach authority and the canonical Supabase ownership boundary; source notes are untrusted data, never executable planner instructions.

## Implementation sequence and acceptance

| Package | Dependency and reviewable result | Verification |
|---|---|---|
| P3 preparation — this package | Proposed contracts, 20 synthetic scenario specifications, example arrangement and structural checks | Review boundaries and fixture integrity. Greg's coaching judgments remain pending. |
| P3 outcome adapter | P2 accepted; consume confirmed outcomes without changing legacy snapshots | Exact once outcome accounting, same-domain distinctions, ownership and correction cases; no silent truncation. |
| P3 obligations and candidates | Outcome adapter plus eligible prescription producer; coordinate with P1/P4 instead of inventing missing bundles | Shared-work accounting, maintenance rationale, outside work, schedule-only identity preservation, explicit capability gaps. |
| P3 compiler integration | Validated candidates and applicable reviewed numerical policy | Full time ledger, adjacent-day constraints, real bench relocation, unchanged monitoring protocol; impossible or unknown fit surfaced. |
| P3 proposal/acceptance integration | Compiler plus existing P2 revision fence | Immutable accepted base, atomic stale-basis rejection, explicit change reasons and typed operations. |
| P5 evaluation / later activation | Executable weeks and human-reviewed labels; separate numerical-policy and release authority | Compare current planner and candidate planner blindly, including complete weeks and adaptation sequences. Deployment/pilot authorization remains separate. |

Contract validation is necessary but cannot establish good coaching. The 20 new cases are synthetic **development** cases. They neither replace the frozen 24-case baseline nor consume the 16-case holdout. Six quality dimensions remain evidence fidelity, goal fit, dose fit, whole-week feasibility, appropriate adaptation and clarity. Structural tests check fixture integrity and arithmetic only; expected scenario assertions become planner acceptance tests when a planner exists. Human labels and model comparison have not run.

For acceptance, Greg's actual five-day case must retain all confirmed outcomes, fit complete sessions, relocate bench work in the saved proposed schedule when justified, preserve monitoring definitions, and explain competing demands. April 2027 is the confirmed target context, not permission to invent APEX event requirements or auto-progress by calendar. The six signal-case review is the next user contribution; this design requires no invented thresholds from Greg.
