# Coach Evidence Context Contract 0.1.0

## Purpose

The coach reads the smallest authoritative packet needed for one decision. It
does not treat chat history, arbitrary recent memory, or vector similarity as
numeric authority.

Every packet records its purpose, as-of time, bounded window, active plan and
session scope, selected IDs, algorithm version, evidence policy version,
missingness, and truncation state. A caller can reproduce the selection from
the same canonical rows and request.

## Request types

| Purpose | Default window | Maximum observations | Required selector | Intended use |
| --- | ---: | ---: | --- | --- |
| `today_session` | 7 days | 16 | Active prescribed-session ID | Accepted prescription, current constraints, session-linked evidence, and recent readiness |
| `weekly_review` | 14 days | 64 | Current active plan | Completed active-plan sessions and their compatible evidence |
| `adaptation_review` | 84 days | 160 | Goal ID from the active adaptive trace | Only metrics and assessment definitions declared by that goal's hypothesis |
| `new_planning` | 365 days | 80 | None | Current confirmed facts, labeled strength baselines, and verified performance history |
| `metric_history` | 365 days | 120 | Metric ID | Exact metric history, optionally narrowed by protocol and comparability key |
| `general_coaching` | 28 days | 24 | None | Bounded cross-domain coaching context for Socius |

Each purpose also has a hard maximum window. A larger request fails validation.

## Selection rules

- Every database read is user-scoped. RLS remains the final tenant boundary.
- The active program's named accepted plan wins. Sessions from archived,
  replaced, or conflicting plan versions do not enter plan-scoped packets.
- Confirmed memory must be effective at the as-of time and not expired. A fact
  past `review_after` is excluded until an athlete review at or after that time.
  Withdrawn and superseded versions are excluded.
- Observations must be complete, captured by the as-of time, and athlete- or
  system-verified. Imported observations also require an active confirmed
  import manifest.
- Metric, assessment, protocol, semantic role, and full comparability key remain
  explicit. Different protocol versions or comparability keys always produce
  separate evidence series.
- Each series reports its observation IDs, sample count, source, verification
  confidence, and `coach-context-selection-0.1.0` algorithm version.
- Oversized memory content is omitted. Query or selection truncation sets
  `selectionComplete` to false. A later evaluator must hold instead of treating
  a partial packet as complete evidence.

## Current integration

`fetchCoachEvidenceContext` performs bounded Supabase reads and then calls the
pure `assembleCoachEvidenceContext` selector. Fixtures exercise all six request
types, active-plan conflict, lifecycle exclusion, protocol separation, import
supersession, empty and partial state, and query failure.

Programming-classified Socius requests receive the `general_coaching` packet.
The prompt labels athlete content as untrusted data, includes selection and
evidence provenance, and explicitly forbids combining incompatible series.
`projectEvidenceReasoningContext` checks the packet owner and includes complete
selected memories, strength baselines, and individual measurement samples. It
preserves original/normalized units, ordinals, source verification and comparison
modifiers. Whole records or whole series exceeding the record budget are omitted
with an explicit ID/reason and incomplete projection status; no JSON value is
clipped. Selected packets do not silently fall back to unselected legacy facts.
This projection does not widen retrieval or grant numerical policy authority.
The `get_coach_evidence` Socius tool can request the existing `general_coaching`,
`new_planning`, `metric_history`, `adaptation_review` and `weekly_review` purposes
with their validated selectors and window limits. The server supplies owner and
as-of time. Tool arguments cannot supply another owner, time or projection budget.
It returns this same owned projection with explicit incomplete coverage. It omits
`today_session` because this projection does not contain accepted prescriptions.

Separately, when programming context and `COACH_HISTORY_CONTEXT_ENABLED` are
enabled, `performed-work-context.ts` supplies factual work from planning's shared
28-day history reader. It preserves quantity uncertainty, literal weight text,
field provenance and effort scope under a 16,000-character whole-record budget.
Unconfirmed prescriptions and unreviewed imports/templates are explicitly
omitted. This is not the initial-dose policy adapter; that capability remains off.
The deterministic adaptation evaluator consumes `adaptation_review` plus a
bounded `general_coaching` recovery packet. The Program page's Today logger uses
the accepted prescription and its immutable scheduled-assessment projection for
the atomic write path. The `today_session` evidence packet remains the bounded
historical-context contract for later execution guidance; it is not required to
reconstruct the accepted prescription. Weekly-review and metric-history
consumers use the same builder directly in later UI tasks.

This contract selects evidence only. It does not calculate an adaptation,
change a training emphasis, create a proposal, or activate a plan.

## Persisted decision readback

`coaching-decision-context.ts` is a separate versioned projection of the weekly
decision already stored in `coach_weekly_reviews` and its linked proposal. It
preserves selected computed values, snapshot IDs/hashes/windows, exclusions,
rationale and missingness. Raw newly retrieved observations are not represented
as having been consumed by that saved evaluator. The owned server helper checks
included-source validity, successor reviews and the active accepted base.

The same record reaches coach runtime, Socius and the weekly API. The Program
page exposes its rationale and binds actions to matching review/proposal IDs.
Missing, malformed, superseded or invalidated records cannot drive saved-review
controls. `current` identifies the current stored review only; new intent,
availability or feedback may still need reconciliation. This read model does not
replace atomic acceptance checks or claim a general draft freshness guarantee.

The context revision continuation additionally compares the saved review's
`rationale.contextRevision` with the owned database revision. Mismatch or a legacy
missing stamp yields `context_changed`; an unavailable revision read fails closed.
`sourceValidity` is now `included_sources_and_context_revision`. This detects
mutations, not strategy reconciliation or time-only expiry of every memory.
Proposal creation and first acceptance have a separate transactional check; see
[ADR-0023](../decisions/ADR-0023-coach-proposal-context-revisions.md).

Fresh weekly review additionally reconciles canonical intent, goal, schedule,
equipment and constraints against the accepted snapshot. It records bounded
`directionReconciliation` metadata in the saved rationale and shared decision
projection. This targeted setup/intent comparison does not claim reconciliation
of all athlete evidence; `latestAthleteContextReconciled` remains false. Full
current intent is excluded from the readback projection. Changed direction
requires explicit confirmation and a new proposal; it supplies no numerical
adaptation authority. See [ADR-0024](../decisions/ADR-0024-explicit-training-direction-reconciliation.md).

The shared decision context now has an optional `acceptedOrigin` for the active
accepted replacement. It follows the owned accepted proposal to the prior-base
review. Stored evidence, exclusions and rationale remain historical with explicit
source correction status; they cannot supply new proposal controls. The current
`decision` remains the review of the active base. See
[ADR-0025](../decisions/ADR-0025-accepted-week-decision-origin.md).

Memory selection overflow now marks selection incomplete even below the source
query cap. Execution exclusion IDs are owner-filtered before projection. Remaining
field provenance and general exclusion-accounting limits are listed in the
[P2 acceptance audit](../verification/programming-quality/p2-acceptance-audit.md).

The audit's three remaining evidence gaps are implemented locally in selector
algorithm `coach-context-selection-0.4.0`: per-value provenance; a bounded
`selectionExclusions` ledger scoped to queried owned rows; and accepted confirmed
outcome selectors with exact measurement/binding matches. Original semantic roles
remain factual labels. Invalid or oversized meaningful fields omit the whole
affected record and mark selection incomplete. Counts and overflow remain visible
when the ledger reaches 128 entries.

`get_coach_performed_work` adds deliberate 1–180 day history retrieval through the
existing reader, with trusted owner/time/timezone and the existing history flag.
The default remains 28 days and existing record/projection limits remain in force.
Workout RPE is session-scoped with provenance; it never substitutes for set effort.
See the [completion receipt](../verification/programming-quality/p2-evidence-completion.md)
and [ADR-0026](../decisions/ADR-0026-bounded-evidence-retrieval-fidelity.md).
