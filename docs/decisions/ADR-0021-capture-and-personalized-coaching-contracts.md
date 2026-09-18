# ADR-0021 - Capture and personalized coaching contracts

- **Status:** Accepted for local implementation
- **Date:** 2026-09-17
- **Deciders:** Greg Foote (implementation plan), Codex (contract realization)

## Context

Logging has atomic saves but divergent receipts and ambiguous edited retries. Default completion feedback can look explicitly reported, while planning omits relevant goals and history. Recommendations need freshness and missingness without acquiring prescription or acceptance authority. Existing accepted JSON and receipts must remain reproducible through additive migrations. Experimental branches contain overlapping ADR numbers and unreviewed numerical policies.

## Decision

We extend canonical Supabase records and existing acceptance transitions with versioned capture provenance, confirmed intent, factual history and deterministic recommendations under the [frozen contracts](../verification/data-to-personalized-coaching/contracts.md).

## Consequences

- Positive: occurrence, field origin and review remain distinct; revision-aware corrections invalidate current advice while retaining history.
- Positive: optional feedback creates only explicitly reported observations; exact v1 receipt replay and legacy plan decoding remain available.
- Positive: transaction-owned invalidation, response revisions and expiring lease tokens fence stale publication.
- Negative: coordinated SQL/API/read-model versions and tenant/race verification increase complexity and establish a compatible-reader rollback floor.
- Negative: interaction-triggered refresh cannot promise unattended updates.
- Neutral: server flags default off. Qualified numerical review and production release remain separate gates. Experimental ADR numbers through 0020 are not reused.

## Alternatives considered

**Route-specific patches.** Smaller diffs would preserve divergent retry, correction and provenance semantics.

**Autonomous model planner and new event service.** Additional model authority and infrastructure would not resolve evidence quality or qualified-review requirements.

**Full event sourcing.** Replacing canonical meals/workouts adds migration and query risk. Append-only amendment snapshots and immutable decisions provide the required audit trail.

## W7 implementation boundary

Recommendation publication and derived outcomes use narrow service-role RPCs reached only after session authentication; source queries retain the user's RLS client. Athlete response, shown acknowledgement and coverage confirmation use separate owned RPCs. A client cannot submit its own decision or observed outcome. Server runtime fingerprints and athlete-local scope are checked again at publication and response time.

Semantic evidence identity excludes incidental source revision/time noise, while each immutable decision retains its original dated audit snapshot. A current matching decision may be reused with a new publication acknowledgement; terminal decisions are not reactivated. Exact candidate suppression lookup avoids losing old dismissals to bounded history pagination. Response revision and expiring lease identity remain independent from canonical source revision.

Outcome events remain immutable. A later correction or retraction appends an outcome invalidation so readers can label the current interpretation unknown without erasing the historical observation. Done is a reported response and creates no canonical record. Owned recommendation origin freezes in the first logging operation and survives retries and amendments.

The permanent legacy assertion guard is independent of rollout flags. Disabling recommendations cannot restore unsupported nutrition-performance or HRV assertions. Neither implementation nor rollback grants numerical policy or plan acceptance authority.

## W8 integration clarifications

An explicitly saved nutrition target supplies the authority for factual logged remainder; an unrelated training-intent memory is not required. The rule reports protein and calories against that existing target, preserves estimated composition and unknown/partial coverage, and creates no new target or intake claim. Existing weekly reviews with action collect_signal now have a navigation candidate to their authoritative evidence/priority request. No new numerical eligibility or prescription rule was added.

Response recovery exposes no-write proof only for exact owned RPC rejection messages reached after exact-request replay and before insertion. Generic serialization, transport, unknown storage and payload-conflict errors retain the original request identity. This lets an expired defer or stale coverage report return to current records without silently discarding an uncertain successful response.

Recommendation source invalidation follows the implemented reader inventory: fifteen source tables, training_intent memories only, and no WHOOP trigger. Wearable freshness remains enforced in legacy/current contextual readers; this recommendation ruleset does not consume wearable values or preferences outside accepted-plan snapshots.
