# ADR-0024 - Explicit training direction reconciliation

- **Status:** Accepted for local implementation under the programming-quality QPlan
- **Date:** 2026-09-21
- **Deciders:** Codex implementation team within Greg's approved scope

## Context

The source revision fence prevents a changed training record from silently changing an unaccepted proposal. Ordinary continuation preserves the accepted profile, so simply refreshing after a changed goal cannot produce a replacement. The compiler also previously required changed domain allocations for every emphasis change, excluding a changed event, schedule or constraint within the same domains.

## Decision

Reconcile the latest owned canonical goal, intent, schedule, equipment and constraint records against the accepted week before a fresh weekly review. The accepted snapshot remains the basis for evaluating its performed work. Current intent supplies a separate replacement direction, never retroactive evidence that the old prescription worked.

A supported change requests explicit setup confirmation and creates a separate, acceptance-required proposal. The existing `shift_emphasis` action also represents material event, intent and setup changes within the same domains. A renewed canonical intent confirmation can require rebinding even when the goal wording is unchanged; this is authority renewal, not evidence of physiological adaptation. Unsupported domains, unresolved constraints, withdrawn/expired authority and unavailable reads block generation with an actionable reason. Safety decisions take precedence.

Saving replacement setup changes the source revision. The UI therefore performs a fresh review after saving, rather than attempting to reuse the old saved review. Saved-review recovery retains its original revision and reconciles current intent before building. Both routes require a fresh setup acknowledgement. Live acceptance controls require an eligible review and its exact linked proposal; a newer review never falls back to an older pending proposal.

## Consequences

- Canonical intent defines outcomes and priorities. Matching goal-memory allocation choices are preserved; unrelated convenience fields cannot replace confirmed outcomes.
- Removal of an event clears the nullable direction target and confirmed event. The internal goal outcome retains its required independent planning horizon; this does not restore an event deadline.
- Typed constraints use existing compiler support. New free-text constraints are not represented as enforced scheduling rules and remain blocked for clarification.
- All proposal writes retain ADR-0023's transactional revision fence. Setup-memory lifecycle expiry is checked at read time; this step does not add a general transactional clock-expiry guard.
- Numerical adaptation policies remain disabled. This is supported direction reconciliation, not the P3 multi-outcome strategy engine or proof of coaching quality.

## Alternatives considered

Refreshing the accepted profile in place would erase the basis for reviewing performed work. Repeatedly retrying a continuation with changed intent would preserve history but trap the athlete in conflicts. A new strategy engine could cover more outcomes and scheduling alternatives, but belongs to P3; this slice uses explicit existing support boundaries.
