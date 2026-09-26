# ADR-0023 - Transactional coaching context revisions

- **Status:** Accepted for local implementation under the programming-quality QPlan
- **Date:** 2026-09-21
- **Deciders:** Codex implementation team within Greg's approved scope

## Context

Rolling proposal acceptance checks the active plan and included weekly-review sources. Initial proposals have no weekly review and lack a general history or intent freshness check. Checking only existing source IDs also misses new records and changes to previously empty history. Accepted prescriptions and accepted replay must remain immutable. Application preflight alone leaves a concurrent-write race.

## Decision

We bind rolling reviews and unaccepted proposals to an athlete-specific database revision captured before planning reads and checked under a transaction lock at persistence and first acceptance.

## Consequences

- Positive: Source changes increment the same revision transactionally, including inserts, corrections and removals. The database rejects stale writes even when the application already passed a preflight.
- Positive: Stored reviews retain their original revision; a new read cannot make an old decision current. Accepted JSON and successful accepted replay retain their existing authority.
- Negative: The revision covers supported training source tables for the athlete rather than only the selected window, so unrelated training changes can require a fresh review. It is a concurrency token, not evidence sufficiency or physiological confidence.
- Neutral: New routes require the additive migration. Legacy unstamped rolling drafts require recreation. Legacy eight-week proposals keep their existing behavior. Migration application and deployment remain separately authorized work.
- Neutral: Ordinary continuation keeps its accepted profile snapshot; this guard does not refresh the strategy or activate numerical policies.

## Alternatives considered

An application-only read before acceptance is simpler but cannot prevent a source mutation between that read and commit.

Per-source revision bindings are more precise but require complete dependencies and absence/query-range protection across mutable history, intent and feedback. Existing weekly source bindings remain useful and are retained; they do not cover the general draft gap alone.

The recommendation refresh counter includes nutrition and generated-plan activity. Reusing it would invalidate drafts for unrelated writes and can invalidate them during their own creation. A dedicated training-context revision has an explicit source contract.
