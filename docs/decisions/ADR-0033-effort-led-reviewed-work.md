# ADR-0033 - Effort-led reviewed work and optional session tails

- **Status:** Accepted for local implementation; storage and lifecycle verification pending
- **Date:** 2026-09-28
- **Deciders:** Codex within Greg's accepted local programming QPlan; coaching decisions by Greg

## Context

Greg's reviewed home-hypertrophy case uses about 2 RIR instead of a repetition cap and reduces secondary upper-body work when time is limited. Existing schema 1/2 repetition work requires a numerical range and treats all listed work as mandatory for time validation. Encoding the new guidance only as prose would leave contradictory structured prescriptions. Accepted historical snapshots and exact review/source bindings must remain unchanged.

## Decision

We add session schema 3 with effort-led repetition work and an explicit optional tail, retaining separate effort, accounting estimates, mandatory work and actual reports.

## Consequences

- `effort_repetitions` specifies target RIR, sides, estimated seconds per side per set and side-switch recovery; the estimate never specifies a repetition count, tempo or stopping time. Working RPE targets remain separately explicit. Preparation and fixed monitoring cannot use this work type.
- `optionalTail` identifies a contiguous suffix by its first step ID and a reviewed reason. It starts with a transition allowance, includes one or more preparation steps for the same movement and ends with one working activity; a final separate logging allowance remains mandatory. At least one working activity remains mandatory, and monitoring cannot become optional. This bounded form represents one trailing optional exercise, not arbitrary skipped steps.
- Schema 3 requires conditional timing guidance. The full estimate remains visible even when it exceeds available time. Only the mandatory estimate is used for basic arithmetic eligibility when a reviewed optional tail exists; actual duration/physiological sufficiency remain unproven. No automatic trimming or silent prescription mutation occurs.
- Existing schema 1/2 source content and serialized output remain unchanged. New fields cannot be smuggled into older schema versions. Source hashes continue to invalidate altered unaccepted candidates.
- Storage checks must explicitly support schema 3 before persistence; until then existing database checks reject it. No new registry entry or runtime activation is added by this representation work. This does not approve the complete new home week.
- Follow-through tracked in `Fitness-Tracker-u5l.11.1`: compatible database constraints and local lifecycle, independent actual RIR capture without RPE conversion, skipped optional-work accounting and user-visible verification. Core compiler/read/display evidence alone cannot close the issue.

## Alternatives considered

Keep fixed reps and add prose: rejected because the compiler would still cap reps and claim time fit using a different prescription.

General recursive conditional session graphs: credible for more complex workflows, but adds branch execution and persistence semantics unnecessary for the accepted trailing optional exercise. Revisit when reviewed cases require non-tail alternatives.

Separate effort-led compiler: rejected because two prescription and readback paths would duplicate source authority, timing and validation. Extend the versioned shared contract instead.
