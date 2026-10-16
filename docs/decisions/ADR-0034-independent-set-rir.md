# ADR-0034 - Independently reported set RIR

- **Status:** Accepted for local implementation; hosted migration and activation are separate
- **Date:** 2026-09-28
- **Deciders:** Codex within Greg's accepted programming QPlan and per-set effort guidance

## Context

ADR-0033 preserves RIR targets, but the actual-set contract currently stores RPE only. RIR is an athlete estimate of further controlled repetitions, not a mathematical conversion from recorded RPE. Accepted reports and uncertain pending requests must retain their exact payloads for replay. Completion must preserve effort-led work as resistance training and distinguish skipped optional work from performed volume.

## Decision

We add strict report schema 2 with an independent nullable `rir` field and preserve it through form entry, storage, completion and factual coaching context without converting RPE or rewriting schema 1.

## Consequences

- Schema 1 accepts its existing exact keys. Schema 2 requires `rir` as null or a finite nonnegative number up to the existing 1,000-repetition storage bound; this bound is not a training recommendation. Fractional athlete estimates are retained. RPE remains separate and may disagree without silent correction.
- New forms start with unknown RIR. Editing legacy actuals preserves schema 1 unless the athlete edits the new field; old pending request bodies remain unchanged. Marking a set not performed clears actual RIR with other performance quantities.
- The new additive contract migration allows schema-3 prescription storage, replaces report validation in place and preserves current completion ownership/active-slot/replay guards. It classifies effort-led reps as STRENGTH and projects only recorded RIR. No table rows are rewritten.
- Completion keeps omitted sets at zero performed sets with unknown actual quantities. The complete prescription remains separate from actual work. Factual context retains the independent set estimate; no numerical policy is inferred.
- Disposable SQL verification is distinct from retained local Auth/PostgREST and hosted rollout. Default capability and registry remain disabled/empty until their separate requirements are fulfilled.

## Alternatives considered

Calculate RIR from RPE: rejected because it fabricates an unreported actual and loses disagreement or uncertainty.

Store RIR only in notes: rejected because structured completion and factual context could silently drop it or require reinterpretation.

Add an optional field to schema 1: rejected because it changes the meaning of the existing strict payload and blurs replay compatibility. A versioned schema makes old and new requests explicit.
