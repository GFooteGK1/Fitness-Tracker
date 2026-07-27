# Adaptive Coach Programming Policy 0.2.0

Policy 0.2.0 turns the eight-week intent into deterministic, actionable
sessions. The training doctrine remains version 0.1.0. This file records the
numeric and selection rules owned by application code.

## Session contract

Every generated session includes:

- a distinct session role and title;
- preparation, primary, and support blocks fitted to the athlete's available
  session time;
- selected movements, a working range, effort, rest, and stop condition;
- available substitutions and a one-variable progression rule;
- the athlete's limitation note; and
- doctrine and policy provenance.

The planner rotates domain-specific roles across the athlete's selected days.
It uses only movements supported by the declared equipment, with bodyweight
fallbacks. `commercial gym`, `full gym`, `gym access`, and `well-equipped`
activate the standard indoor catalog without assuming access to a track or
hill. `all equipment` activates the complete catalog.

## Explicit constraint handling

The deterministic selector recognizes explicit exclusions for running and
overhead work. It filters those movements and records the exclusion in every
session. All non-empty limitation text is also retained as an athlete note for
review.

The selector does not diagnose an injury or translate symptom language into a
medical restriction. A statement such as `knee pain` stays visible but does not
silently become a movement ban. The athlete, coach, or qualified clinician must
make that decision.

## Working ranges

| Domain | Normal working range | Deload weeks 4 and 8 | Primary stop rule |
|---|---|---|---|
| Strength | 3-4 sets of 3-6 reps; 65-82% e1RM when a matching saved assessment exists | 2 sets; 55-65% e1RM | Stop before technique loss or grinding |
| Hypertrophy | 3-4 sets of 6-15 reps; last useful set at 1-2 RIR | 1-2 sets; at least 4 RIR | Stop when stable target-muscle work is lost |
| Power | 3-5 sets of 2-5 crisp reps | 2-3 sets | Stop when rep speed or landing quality drops |
| Speed | 4-8 efforts of 5-10 seconds with full recovery | 4 high-quality efforts | Stop when speed, posture, or braking quality drops |
| Aerobic | 25-45 continuous minutes or 4-6 by 4-minute intervals | 20-30 conversational minutes | Stop on disproportionate effort or mechanics loss |
| Resilience | 2-3 sets of 6-12 smooth reps or 20-40 seconds | 1-2 sets | Stop when range, breathing, or control is not repeatable |

New or returning athletes start with one fewer working set or a shorter
conditioning dose. Weeks 3 and 7 carry the highest planned volume. The policy
still progresses only one variable at a time.

## Saved strength baselines

A strength exercise receives percentage and load guidance only when its
canonical movement or approved alias matches a saved 1RM, 3RM, or 5RM
assessment. The UI labels whether the source is a reported 1RM or an estimated
1RM derived from a saved rep max.

Loads are starting ranges, not commands. Pound values round to the nearest five
pounds and kilogram values to the nearest 2.5 kilograms. Unmatched movements do
not receive invented load guidance.

## Replacement authority

An athlete with an active plan may build a new immutable version against the
current active version. Proposal creation does not change the active plan.
Acceptance remains a separate, idempotent database transition; it rejects a
stale base, supersedes the old accepted version, activates the reviewed version,
and updates program metadata atomically.
