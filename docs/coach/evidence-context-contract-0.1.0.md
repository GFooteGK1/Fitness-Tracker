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
The deterministic adaptation evaluator consumes `adaptation_review` plus a
bounded `general_coaching` recovery packet. The Program page's Today logger uses
the accepted prescription and its immutable scheduled-assessment projection for
the atomic write path. The `today_session` evidence packet remains the bounded
historical-context contract for later execution guidance; it is not required to
reconstruct the accepted prescription. Weekly-review and metric-history
consumers use the same builder directly in later UI tasks.

This contract selects evidence only. It does not calculate an adaptation,
change a training emphasis, create a proposal, or activate a plan.
