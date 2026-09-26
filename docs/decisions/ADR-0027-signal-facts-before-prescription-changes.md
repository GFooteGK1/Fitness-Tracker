# ADR-0027 - Signal facts before prescription changes

- Status: Accepted for local implementation following Greg's six case agreements and approval of the two fixes
- Date: 2026-09-21
- Tasks: `Fitness-Tracker-i40.6.1`, `Fitness-Tracker-i40.6.2`

## Decision

Keep detected improvement separate from authorization to increase a prescription. The adaptation evaluator may still report `progress`; weekly review algorithm `weekly-review-0.4.0` maps that finding to continuation of the accepted dose with an explicit explanation. A unique matching assignment and room within a policy bound are insufficient reasons to increase work. Safety and recovery decisions retain their existing precedence. This change supplies no new dose-selection policy; a later reviewed operation must justify a specific change.

Add a bounded factual `signal-evidence-context-1` beside the stored weekly decision. It preserves selected measurements, protocol and comparison identity, explicit recorded sensor-coverage metadata, and working records associated by the same workout and movement. These records support interpretation without becoming direct outcome assessments or changing the evaluator's thresholds, selected series or adaptation policy. Session RPE remains session effort. A same-workout/movement association is not a declaration of equivalent load, variation, equipment, technique or protocol.

The review endpoint reads performed work through the existing owned history capability, binds it to the same as-of timestamp and user, and stores the factual context in the existing rationale JSON. The current context-revision fence includes workout mutations and therefore covers the additional source read before review/proposal creation. Shared stored-decision readback decodes the optional context with strict ownership, time, structure and size checks. Old saved decisions without this field remain readable; accepted history is not recomputed.

## Measurement counts and uncertainty

Selected reading count, expected sensor count and performed repetitions are separate facts. A recorded `valueProvenance.measurementCoverage` object may provide `version: 1`, `expectedSensorReadings` and `performedRepetitions`, each an explicit nonnegative integer or null. This is reported metadata, not sensor validation or a new capture UI. Conflicting, invalid or missing metadata preserves unknowns. Neither prescribed repetitions nor ordinal gaps supply a missing count. Under incomplete retrieval, selected readings cannot establish sensor completeness.

The context retains measurement value provenance, working-record completion uncertainty, source limitations, quantities, protocol, effort and provenance. It makes no calculation of capacity loss, prescribed volume, maximal effort or physiological fatigue. Entire oversized or structurally unsupported observations are omitted with a count and incomplete-projection status, never clipped into apparently complete observations. Zero-reading observations absent from selected evidence remain outside the projection and are declared as a limitation. Valid optional context may be omitted from shared readback with an explicit marker to preserve a valid core decision within its existing budget. Added historical factual sources have unknown current freshness unless a tracked correction already establishes corrected status; the projection does not pretend they were consumed by the numerical evaluator.

## Alternatives and consequences

Retaining the previous progression mapper would continue to treat an improved outcome and an available increment as sufficient justification. Adding a new readiness threshold now would create a numerical policy that Greg has not reviewed. Continuing the accepted dose makes the agreed behavior executable while leaving a later justified-change producer explicit.

Feeding arbitrary working-set records into direct-outcome strength series would manufacture assessment equivalence. The separate factual context preserves the original meaning and can reveal missing integration without that promotion. It also avoids inventing a universal incomplete-sensor rule. Its tradeoff is that mixed-signal physiological interpretation and exact completeness policy remain a later reviewed capability.

The added context increases stored rationale size within explicit limits. Existing history flags remain unchanged; when history is disabled or unavailable, the review exposes that state rather than claiming no work occurred. No hosted migration, paid inference, accepted-plan mutation or numerical-policy activation is included. `initialDosePolicy` remains false.

## Verification boundary

Exercise real evaluator-to-weekly-mapper-to-compiler continuation with one and two matching assignments, including a case with room for the former increment. Verify safety precedence, unchanged accepted input and identical continued prescriptions. Check explicit versus unknown counts, missing readings versus retrieval loss, exact workout/movement association, ownership, timestamp consistency, provenance, bounded omissions and malformed persisted readback. Route tests must verify the factual context reaches persisted rationale and the API result under the same revision fence. Local synthetic tests do not establish deployed behavior or coaching effectiveness.
