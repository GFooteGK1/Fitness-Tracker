# ADR-0014: Confirmed exercise preferences

Status: accepted for local implementation; migration and rollout pending.
Date: 2026-09-16. Related: ADR-0003, ADR-0006, ADR-0007.

## Decision

Use a versioned `exercise_preferences` snapshot in `coach_memories`. Keep the
athlete's wording and explicit canonical movement, curated interest, or unresolved
target. Do not create another preference store. `none` is an explicit confirmed
answer; omitted intake is no mutation. Preferences are enjoyment, not skill or goals.

The typed validator owns catalog recognition; the database enforces bounded shape
on all writes. Existing authenticated RPCs own tenant identity, replacement,
history, and replay. An additive migration extends correction and rejects changed
payloads under a reused correction key. The original row may be superseded during
an API retry; the RPC decides whether that is a valid replay or a stale correction.

A separate owner-filtered, dated, bounded latest-snapshot read includes withdrawn
and expired versions. Its presence suppresses older positive preferences even
when no current snapshot is eligible. Legacy avoidance remains authoritative.
Read failure blocks generation instead of silently restoring old preferences.

The existing candidate score chooses among suitable movements. Avoidance is part
of eligibility for scheduling, composition, substitution, and validation. Family
mappings are versioned and deduplicated. Olympic lifting, gymnastics, and handstand
interests currently have no executable family expansion; the UI and draft state
that support gap. No skill or dose is inferred from an interest.

New-program and explicitly changed-direction drafts read current confirmed
preferences. Ordinary weekly continuation retains accepted anchors. Preference
edits never mutate accepted history. Existing plan acceptance remains authoritative.
The shared evidence context preserves source memory IDs. Model-strategy evaluation
work remains separate from this release. `exercise-preferences-context.ts` applies
the current confirmed snapshot at initial, conversion, and changed-direction
composition boundaries. Ordinary continuation does not silently rotate anchors.

## Alternatives and consequences

Catalog-only selection is simpler but loses broad interests. LLM-only free text
interpretation is flexible but cannot serve as deterministic eligibility authority.
The mixed typed contract preserves both, at the cost of explicit mappings and
honest unsupported states. There is no new production dependency.

`COACH_EXERCISE_PREFERENCES_ENABLED=true` enables collection and fresh interpretation.
Default is off. Deploy the additive migration before enabling it. Disable the flag
for rollback; retain memory and accepted plan history. Do not reverse the migration
by deleting user records. Production migration, credentials, paid evaluations, and
deployment were not performed as part of this local change.

## Evidence

Release verification uses the complete current-main suite, TypeScript, lint, build,
and browser journeys. The executable `scripts/verify-exercise-preferences.mjs`
checks the actual migration/RPCs against synthetic PostgreSQL prerequisites,
including owner isolation, correction, changed-content replay rejection and shape
validation. Mobile editor tests include final-item removal as explicit none.
See `docs/coach/exercise-preferences-release.md` for current release evidence.
