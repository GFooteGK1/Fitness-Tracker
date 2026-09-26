# ADR-0022 — Evidence-conditioned coaching proposals

- Status: accepted for staged local implementation
- Date: 2026-09-21
- Authority: Greg accepted the programming-quality QPlan and requested next steps.
- Tracking: Fitness-Tracker-i40; execution status remains in Beads.

## Decision

Chat, initial planning and weekly review should share a provenance-bearing athlete evidence view and a traceable coaching decision. Strategy may interpret goals and competing constraints. Application-owned policies must supply eligible numerical prescription bundles and deterministic validation. The athlete accepts the immutable final proposal through the existing transition. This preserves ADR-0003, ADR-0007 and ADR-0021.

The eventual operation set must express retaining qualified prescriptions, changing placement, inserting fixed monitoring sets, and supported dose/adaptation choices. More context passed to a selector that cannot express those actions is insufficient. These operations are staged work, not capabilities introduced by this ADR alone.

## First implementation boundary

`evidence-context.ts` remains the user-scoped selector of canonical rows, effective confirmed memories, labeled strength baselines and compatible observation series. `evidence-reasoning-context.ts` projects that selected packet for reasoning without interpreting physiology or choosing a dose. It checks ownership again, preserves complete record content, sample values, original/normalized units, ordinals, dates, source verification, comparison modifiers and protocol boundaries.

The projection has a version and a 32,000-character record budget. A record or whole evidence series either fits intact or is listed as omitted with its ID and reason. The audit envelope is additional to this record budget. Coverage separately records source selection, projection, included counts, missingness and correction exclusions. Complete bounded retrieval is not complete training history or sufficient coaching evidence.

Socius uses this projection when the existing programming context path supplies an evidence packet. It does not restore unselected legacy memories/assessments beside that packet. Legacy context remains the compatibility path when no packet is supplied. No database schema, capture activation, new inference tool, numerical eligibility, plan creation or acceptance behavior changes in this slice. General coaching's existing 28-day selection window and sample cap remain unchanged; later purpose-based retrieval is still required for broader planning.

## Purpose retrieval and performed-work continuation

The read-only `get_coach_evidence` tool now exposes existing validated purposes:
general coaching, new planning, metric history, adaptation review and weekly
review. The executor supplies owner and as-of time; callers cannot override
ownership, dates or projection budget. Existing purpose-specific window limits
and selector rules apply. `today_session` is deliberately absent because this
projection does not include the accepted prescription; `get_coach_state` retains
that role. Retrieval failures remain explicit and partial evidence is not an
empty athlete history.

With the existing history-context capability and programming-context inclusion
enabled, Socius also receives a factual performed-work projection from the same
bounded, owned 28-day source reader used by planning. The existing normalizer
preserves exact/bounded/unknown quantities, effort scope, origins, corrections,
protocol and completion uncertainty. Legacy weight text is preserved literally,
without choosing between conflicting fields or estimating a maximum. Unconfirmed
prescriptions and unreviewed imports/templates are omitted explicitly. Whole
records share a 16,000-character budget; omissions mark the projection partial.

These additions share retrieval, not numerical interpretation. Planning's
familiarity behavior is unchanged. They do not connect performed doses to future
prescriptions, enable a flag, approve a policy or modify an accepted plan. The
first-slice limitations above describe its original boundary; this continuation
adds purpose-based retrieval while preserving the default 28-day packet.

## Alternatives and consequences

### Shared readback of the persisted weekly decision

The weekly evaluator already persists the authoritative decision in
`coach_weekly_reviews`, with proposal linkage in `adaptation_proposals`. Reuse
those records rather than introducing another decision table. The browser-safe
`coaching-decision-context.ts` projection validates action consistency, ownership,
accepted-base identity, snapshot references, evidence summaries, exclusions,
policy versions and exact bounded rationale. Oversized or malformed records are
explicitly unavailable for interpretation; records are not silently truncated.

`coaching-decision-context-server.ts` reads one latest owned review for the active
base, checks included-source invalidations, successors, linked proposal state and
the active-plan pointer. Both the weekly GET response and coach runtime use this
helper. Socius explains that record and the Program view exposes its rationale
on demand. Saved controls bind to its review/proposal IDs, so independently
ordered history cannot supply a different action. A refreshed page clears any
earlier live review response.

The status `current` means latest stored review for that active base with no
detected included-source invalidation. It is **not** a claim that all newer
athlete context has been reconciled. The projection declares
`sourceValidity: included_sources_only` and
`latestAthleteContextReconciled: false`. Fresh factual context stays separate from
the accepted prescription snapshot. General draft freshness and transactional
intent/history revision checks remain required future work, especially for
initial proposals with no weekly review ID. This describes the readback slice's
original boundary; [ADR-0023](ADR-0023-coach-proposal-context-revisions.md) now adds
the local mutation revision fence and expands `sourceValidity` to
`included_sources_and_context_revision`. Fresh strategy reconciliation remains
separate work.

A separate nonnumerical consistency guard rejects a direction target date that
conflicts with a dated confirmed event linked to active outcomes. Replacement
directions refresh confirmed intent before this check. Conflicts return an
actionable 409 and do not silently choose a different date or alter an accepted
week. No migration, numerical adapter, feature activation or new write path is
introduced by this continuation.

### Projection tradeoffs

Keep terse series counts: minimal token cost, but the model cannot inspect the values behind a claim. Clip arbitrary JSON strings: smaller output, but a omitted suffix may hold the decision-changing fact and no longer be valid structured data. Send all stored data: avoids local clipping but loses bounded retrieval and clear ownership of selection.

The selected-record projection uses more context than counts alone, and a large record can consume the budget. Explicit whole-record omission makes this inspectable. It does not prove the model will respect untrusted-data instructions; semantic model evaluation remains separate. Cross-user packets fail closed before serialization.

Numerical policy review, offline comparative evaluation and hosted activation remain independent requirements. Synthetic characterization cases must not be represented as qualified coaching labels or hidden holdout data.

## Verification

Exercise measurements and corrected values through the actual Socius prompt; preserve changed protocols and missing sensor repetitions; assert whole-series omission and source incompleteness; reject a mismatched owner; ensure selected packets do not reintroduce legacy facts. Run focused selector and prompt regressions, typecheck and independent code review. A later release must test complete persisted proposals and training decisions, not only this context projection.
