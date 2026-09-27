# ADR-0030 - Explicit setup source bindings and clock freshness

- **Status:** Accepted for local implementation under programming-quality P2 / i40.3.7
- **Date:** 2026-09-26

## Context

The context revision protects drafts against source writes. Time alone can expire a confirmed schedule, equipment record, constraint or preference without changing that revision. ADR-0024 checked setup lifecycle during reconciliation but deferred transactional clock checks. Existing rolling snapshots did not identify those setup sources, so their provenance cannot be reconstructed from equal values.

## Decision

New rolling proposals and reviews store `setupMemoryBindings` with schema version 1. Each selected source records its memory ID, version, content, lifecycle and whether it was current when read. An explicit null records an owned query with no saved row. A missing envelope is unknown legacy provenance and cannot authorize a new proposal or first acceptance.

The four required canonical keys are `primary_goal`, `training_schedule`, `available_equipment` and `training_constraints`. Initial and conversion generation now explicitly read and validate these dependencies against the supplied profile. A conflicting saved setup requires confirmation and saving before proposal creation. Canonical `training_intent` continues to own outcomes and wording through its existing separate intent snapshot and SQL guard. Convenience goal memory still owns the chosen domain allocations.

`exercise_preferences` is bound when that planning capability is enabled or the profile already carries its canonical preference snapshot. Arbitrary legacy preference-memory keys are outside this bounded lifecycle addition; source writes still advance the general revision. An unused capability-off canonical preference is not inferred as a consumed source.

Reviews capture the setup dependencies used to assess current direction. Immediate proposals and proposals recovered from stored reviews carry those exact bindings. A fresh read never replaces the bindings of an old stored decision. A source that was future-dated or otherwise noncurrent when read cannot acquire authority merely because its clock boundary later passes; the athlete needs a fresh review.

The additive SQL migration checks bindings under the existing context-revision fence at proposal insertion and first acceptance. Latest owned identity, version, content, confirmed status and current lifecycle must agree. No new source row locks reverse the established source-to-revision lock order. Accepted response-loss replay returns before these checks and accepted prescriptions remain immutable.

Readback withdraws pending acceptance and marks current reviews stale when their setup bindings expire or are unknown. SQL permits a successor review and expires stale pending windows even when the revision has not changed. This includes a pending legacy conversion that has no review. A blocked review may record noncurrent dependencies, but it cannot produce an acceptable proposal until a fresh review uses current authority.

## Compatibility and release conditions

`20260921010000_coach_proposal_context_revision.sql` remains byte-for-byte unchanged. The fix is `20260926010000_coach_setup_memory_bindings.sql` and the compatible application writers/readback code in this change. No backfill invents bindings for pending legacy drafts or reviews; recreate them. Already accepted plans and eight-week legacy acceptance keep their existing contracts.

A future hosted rollout requires explicit authorization and coordinated application/migration readiness. Keep coaching writes paused across the migration and compatible application deployment, then verify new initial, conversion, review, stored-review recovery and acceptance flows before reopening writes. Old application writers omit the new envelope and are intentionally rejected after the migration. Rolling back only the application does not restore compatibility; keep writes paused and prepare a separately reviewed forward recovery. Existing historical cutover evidence does not certify this new migration.

No hosted state, credentials or flags change in this local work. `initialDosePolicy` remains disabled. The PostgreSQL fixture proves ordered transactions and rollback, not independent concurrent-session lock behavior or live hosted coverage.
