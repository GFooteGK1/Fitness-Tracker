# ADR-0007: Rolling weekly adaptive programming

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), ADR-0003 (coach state and authority), ADR-0006 (layered evidence and memory)
- **Supersedes:** The fixed eight-week prescription horizon and fixed week 4/week 8 review cadence in ADR-0003

## Context

The adaptive coach currently turns an athlete goal into eight stored weeks of
prescribed sessions. The Program page then exposes the full eight-week intent,
while a session-feedback preview and a separate evidence-derived evaluator make
partly overlapping review decisions.

That structure treats adaptation as a correction to a broad forecast. The
approved coaching model is different: prescribe a small dose, observe what it
does, and use repeated compatible evidence to decide whether the next dose
should stay on the same track or change emphasis. The goal can remain durable,
but future sessions should not be committed before the current week has been
observed.

## Decision

### Separate direction, weekly dose, and session autoregulation

The coach uses three clocks with separate authority:

1. **Training direction** contains the athlete-confirmed goal, required
   qualities, current emphasis, programming hypothesis, constraints, and
   assessment policy. It persists until the athlete accepts a changed direction
   or completes or archives the program. A goal may have a target date, but it
   does not inherit the plan-window date.
2. **Weekly dose** is one immutable Monday-through-Sunday prescription. A new
   rolling program stores and exposes only this seven-day plan. It does not
   create or hide later prescriptions.
3. **Session autoregulation** uses the accepted session ranges, scale options,
   stop conditions, and current advisory readiness. It can change how the
   athlete executes that session, but it cannot silently change the weekly
   emphasis or create future programming.

Every weekly plan requires explicit athlete acceptance, including a plan that
continues the same emphasis. Acceptance remains a separate, idempotent,
stale-base-checked transition. The LLM can explain the decision but cannot
compute numeric prescriptions or activate a plan.

### Review one week while learning across rolling evidence windows

A normal weekly review becomes ready when every prescribed session in the
current week is completed or skipped, or when the athlete-local Sunday window
ends. A past-due planned session is counted as not completed in the review; it
is not silently marked skipped or carried into the next week. An athlete can
request an early review, and a concerning safety signal can force an early
pause, but ordinary plan changes do not run after every session.

The review combines distinct evidence scopes:

- the current seven-day window for execution cost, completion, modifications,
  RPE, energy, pain, and prescribed-versus-performed dose;
- protocol-defined rolling windows for repeated compatible performance
  observations;
- direct goal outcomes separately from proxy and training signals;
- WHOOP and readiness data as advisory recovery context; and
- explicit missingness, freshness, protocol incompatibility, verification, and
  exclusion reasons.

One readiness score or one poor session cannot reallocate emphasis. A material
shift requires the minimum repeated compatible evidence defined by the
versioned assessment and evaluation policy. Proxy improvement without direct
goal-outcome transfer is a specificity review signal, not proof of success.

### Persist one authoritative weekly decision

The deterministic weekly evaluator owns the decision. The session-feedback
preview and adaptation evaluator will converge on one result contract. Every
completed review is immutable and reproducible, including `continue` and
`collect_signal` outcomes that do not justify a material change.

Each stored review includes:

- the program, base plan version, and weekly window;
- the action, presentation class, evidence status, and confidence;
- included and excluded observation identifiers;
- the evidence snapshot, evaluation window, policy and algorithm versions;
- execution summary, missing requirements, and safety override;
- concise deterministic rationale; and
- an optional proposed plan version when a next-week draft exists.

The review actions are:

| Action | Meaning | Next weekly dose |
| --- | --- | --- |
| `continue` | Evidence is stable or still emerging | Preserve the emphasis and repeat the validated dose |
| `adjust_dose` | Repeated improvement and tolerable cost support a small progression | Change one validated dose variable |
| `collect_signal` | Required evidence is missing, stale, or incompatible | Preserve the emphasis and schedule the smallest useful assessment |
| `recover` | Repeated execution-cost or recovery evidence argues against progression | Reduce one stressor while preserving useful practice |
| `shift_emphasis` | Repeated direct evidence contradicts the current hypothesis, or proxy change does not transfer | Propose a new hypothesis and quality allocation |
| `pause_review` | A concerning safety signal overrides programming | Omit provoking work and require review before normal progression |

Goal completion moves the achieved quality to maintenance and is presented as a
material allocation change rather than an automatic progression.

### Separate review outcome from presentation prominence

Coach always reports the weekly conclusion and the next-week status. It presents
a prominent change explanation only when the dose, recovery strategy, emphasis,
or safety state changes.

| Presentation class | Athlete-facing behavior |
| --- | --- |
| `same_track` | Calm continuation summary and one-tap next-week acceptance |
| `needs_signal` | Name the missing signal and show where it appears next week |
| `small_adjustment` | Show the single changed dose variable and supporting evidence |
| `material_change` | Compare old and proposed emphasis, evidence, confidence, and rationale |
| `safety` | Interrupt normal progression and show the required review boundary |

The absence of a material-change card does not mean the review was skipped. The
stored decision proves why Coach continued the current track.

### Extend the existing canonical plan model

Supabase remains the only athlete and programming store. New rolling-weekly
state extends the existing `training_programs`, `training_plan_versions`,
`prescribed_sessions`, `adaptation_proposals`, canonical workouts, check-ins,
and layered observations rather than creating a second execution or plan store.

- Programs gain an explicit `legacy_eight_week` or `rolling_weekly` mode.
- A rolling plan version records its one-week window and sequence number.
- Mode-aware constraints accept the existing eight-week payload or exactly one
  rolling week.
- An immutable `coach_weekly_reviews` record owns no-change, missing-evidence,
  change, and safety decisions.
- A next-week proposal references the review that produced it.
- Only one plan version remains accepted for a program. After its date window,
  it is derived as awaiting the next week until another proposal is accepted.

All user-owned records use RLS and forced RLS. Cross-table references include
tenant-consistent keys. Security-definer transitions use an empty
`search_path`, least-privilege grants, transaction locks, and payload-matched
idempotency.

### Preserve legacy eight-week plans without reinterpretation

Existing plans are tagged `legacy_eight_week` and retain their accepted JSON,
dates, sessions, check-ins, observations, and completed-workout links. They stay
readable and executable under their recorded policy. The migration does not
split, backfill, or recompute them.

Moving a legacy program to rolling weekly planning creates one proposed weekly
version starting at the next safe Monday. The legacy version remains active
until the athlete explicitly accepts that proposal. Acceptance supersedes the
legacy version atomically; unstarted legacy sessions remain historical records
and are not copied forward.

### Organize Program around the current job

The Program page order becomes:

1. **This Week** for Today and the remaining accepted sessions.
2. **Coach Review / Next Week** for review readiness, conclusion, evidence, and
   the next acceptance action.
3. **Training Direction** for the goal, qualities, hypothesis, constraints, and
   assessments.
4. **History** for prior weeks and decisions.
5. **Data and Trust** for confirmed facts, import review, exclusions, and full
   provenance.

The UI must cover setup, active week, incomplete review, same-track review,
small dose adjustment, emphasis shift, missing evidence, safety pause, pending
acceptance, expired week, and legacy conversion states. It remains mobile-first
with 44 px touch targets and 16 px form controls.

## Consequences

- The app learns across an open-ended evidence history without pretending to
  know future weekly prescriptions.
- Stable evidence produces a documented decision to continue rather than an
  artificial change.
- Every next week remains reviewable and athlete-owned.
- Goal dates, evidence windows, and prescription windows become separate
  concepts and require versioned contract changes.
- The database migration must replace fixed eight-week checks with mode-aware
  checks, but it does not rewrite existing rows.
- The Program read model and tests must support legacy and rolling modes during
  the compatibility period.
- A user can reach a new week without an accepted proposal. The safe state is
  no future session, a visible awaiting-next-week status, and an explicit review
  or acceptance action.

## Alternatives considered

### Keep eight weeks internally and reveal one week at a time

This would minimize migration work, but future prescriptions and assumptions
would still exist. The visible weekly model would be cosmetic and later reviews
would edit a forecast instead of producing the next dose.

### Generate one session at a time

This would react quickly to new data, but it would expose programming to daily
noise, weaken weekly coverage and progression continuity, and make accepted-plan
boundaries harder to understand. Session execution remains autoregulated, while
prescription changes stay on the weekly clock.

### Create a second weekly-plan subsystem

Separate weekly tables could avoid changing existing constraints, but they would
create competing plan owners and duplicate acceptance, history, and execution
links. Mode-aware extensions keep one canonical programming model.

## Rollout and rollback

1. Ship the compatibility schema before the application that writes rolling
   plans.
2. Keep the legacy reader and planner available while existing accepted plans
   remain.
3. Enable rolling mode for new programs and explicit conversions only after the
   migration readback passes.
4. Roll back application behavior by disabling new rolling writes. Do not drop
   weekly records or reinterpret them under legacy policy.
5. Production migration, application deployment, and authenticated canary each
   remain separate approval boundaries.

## Implementation boundaries

- Contracts and policy: `app/lib/coach/programming-schema.ts`,
  `adaptive-plan.ts`, `adaptive-programming-contracts.ts`, and
  `programming-policy.ts`.
- Planning: `weekly-coverage.ts`, `session-composer.ts`, a rolling-weekly plan
  assembler, and `program-validator.ts`.
- Review: `execution-feedback.ts`, `adaptation-evaluator.ts`, and
  `evidence-context.ts`.
- Persistence: a new mirrored Supabase migration and rollback-only verifier.
- APIs and read model: `app/api/coach/`, `athlete-context.ts`, and `types.ts`.
- Experience: `app/program/`.
- Verification: focused contract, evaluator, API, migration, browser, and
  compatibility tests plus the repository quality gates.
