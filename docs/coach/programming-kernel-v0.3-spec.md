# Complete Programming Kernel v0.3

## Outcome

Replace the current rotating one-primary-plus-one-support generator with a deterministic system that builds coherent eight-week plans, complete training weeks, and complete sessions for generally healthy adults.

The system must answer four questions in order:

1. What is the athlete trying to develop, and what can they currently do?
2. What exposures must occur across this week?
3. Which session owns each exposure, in what order, and within what fatigue and time budget?
4. What should change next only after the athlete's execution and feedback are reviewed?

The evidence boundary and product composition contract are versioned in `app/lib/coach/programming-reference.ts`. Numeric dose remains owned by deterministic policy. Supabase remains canonical for accepted plans and athlete state. The model may explain a plan but cannot add unsupported numbers, mutate an active plan, or infer medical safety.

## Current Baseline and Failure Mode

`app/lib/coach/programming.ts` currently selects one static session template from a three-session rotation, one primary movement, and one secondary movement. It then allocates the session to a generic preparation block, the primary exercise, and the support exercise. This creates valid-looking prescription fields but does not reason over weekly movement coverage, secondary goals, accumulated dose, movement variation, or the athlete's training history.

The next kernel must not solve this by hard-coding a larger exercise list. It must compose from weekly needs and validate why each movement is present.

## Scope

Initial population:

- Generally healthy adults
- Two to six planned training days per week
- Thirty- to ninety-minute sessions
- New or returning, consistent, and experienced training states
- Strength, hypertrophy, power/explosiveness, speed/agility, aerobic conditioning, resilience, or bounded mixed goals

Explicitly outside v0.3:

- Rehabilitation and return-to-play
- Disease-specific exercise prescription
- Elite sport peaking without sport-calendar and staff context
- LLM-generated movement or dose policy
- Autonomous activation of a revised plan

## Authority Model

| Concern | Owner |
|---------|-------|
| Evidence claims and uncertainty | `programming-reference.ts` |
| Numeric bounds, progression, and review rules | Versioned deterministic policy |
| Movement eligibility and substitution relationships | Versioned movement catalog |
| Athlete facts, accepted goals, assessments, constraints, and active plan | Supabase |
| Weekly schedule and session composition | Deterministic planning kernel |
| Explanation, questions, and concise coaching language | Provider-neutral LLM seam |
| Plan activation | Explicit athlete acceptance through the atomic RPC |

## Proposed Module Boundaries

```text
app/lib/coach/
|- programming-reference.ts   evidence registry and composition contract
|- programming-policy.ts      versioned dose, progression, and time-budget policy
|- movement-catalog.ts        tagged movements and valid substitutions
|- weekly-coverage.ts         goal -> required weekly exposures
|- session-composer.ts        exposures -> ordered session blocks
|- program-validator.ts       whole-plan and per-session invariants
|- planner.ts                 orchestration and proposal serialization
`- types.ts                   persisted and runtime contracts
```

The existing `programming.ts` can remain as an adapter during migration, then be retired after the new composer has parity tests and stored-plan compatibility coverage.

## Planning Inputs

The current intake remains useful but needs a richer normalized planning profile:

```typescript
interface ProgrammingProfile {
  primaryGoal: GoalAllocation
  secondaryGoals: GoalAllocation[]
  trainingExperience: TrainingExperience
  availableDays: TrainingWeekday[]
  sessionMinutesByDay: Record<TrainingWeekday, number>
  equipment: EquipmentId[]
  explicitConstraints: Constraint[]
  preferences: MovementPreference[]
  assessments: CoachStrengthAssessmentSummary[]
  recentTraining: RecentTrainingSummary
}
```

Primary and secondary goals are explicit. A general goal string is retained for athlete language, but deterministic goal allocations drive the program. Recent training is bounded and factual: completed sessions, performed movement patterns, estimated dose, session RPE, and recency. It does not include an LLM summary as an authority input.

## Weekly Coverage Model

Before creating a session, the kernel creates a weekly coverage ledger. Each requirement has:

- Stable requirement ID
- Goal and adaptation domain
- Movement pattern, muscle/region, skill, or energy-system quality
- Priority
- Minimum and target exposure range from policy
- Eligible days and sequencing constraints
- Fatigue and impact cost
- Completed planned dose as sessions are composed
- Source evidence-rule IDs and policy version

Coverage examples differ by goal:

- Strength emphasizes specific trained movement patterns plus balanced supporting work.
- Hypertrophy emphasizes target muscle or regional weekly sets across useful movement angles.
- Power emphasizes high-quality ballistic or weightlifting-derived exposures plus sufficient strength support.
- Speed separates acceleration, maximum velocity, deceleration, and change-of-direction needs.
- Aerobic conditioning separates easy durability, threshold or tempo, and high-intensity interval needs.
- Resilience emphasizes the capacities required to tolerate the accepted plan, not a generic corrective circuit.

The ledger makes omissions visible. It also prevents the composer from adding work merely because time remains.

## Movement Catalog

Each movement is data, not an inline string. Required fields:

```typescript
interface MovementDefinition {
  id: string
  name: string
  domains: CoachProgramDomainId[]
  patterns: MovementPattern[]
  regions: BodyRegion[]
  equipment: EquipmentId[]
  skillLevel: 'low' | 'moderate' | 'high'
  fatigueCost: 'low' | 'moderate' | 'high'
  impactCost: 'low' | 'moderate' | 'high'
  unilateral: boolean
  overhead: boolean
  running: boolean
  assessmentAliases: string[]
  substitutionGroup: string
  progressionFamily: string
}
```

Eligibility is deterministic: equipment, explicit constraints, training experience, available assessment, and policy safety flags. Constraint parsing remains intentionally narrow; free-text limitations stay visible for athlete review and do not become inferred diagnoses.

Substitutions must preserve the block's adaptation and coverage role. A substitute is not valid merely because it uses the same body part.

## Session Composition Contract

Each session contains these roles:

| Role | Requirement | Purpose |
|------|-------------|---------|
| Specific preparation | Required | Rehearse the positions, range, rhythm, or output used in priority work without fatigue |
| Priority adaptation | Required | Deliver the session's main adaptation while fresh |
| Secondary adaptation | Conditional | Supply another high-value weekly exposure |
| Assistance and capacity | Conditional | Fill an explicit muscle, position, unilateral, trunk, resilience, or capacity gap |
| Conditioning | Conditional | Develop a named energy-system or repeat-output quality without compromising the lead goal |
| Downshift | Optional | Transition, capture feedback, or add low-cost recovery work |

Every block and movement must expose:

- Role and coverage requirement IDs
- Intent
- Movement or modality
- Sets, repetitions, time, distance, or interval structure from policy
- Load anchor when an appropriate assessment exists
- RIR, RPE, velocity, pace, talk-test, or quality target appropriate to the domain
- Rest intent
- Success and stop conditions
- Valid substitutions
- Estimated minutes and fatigue cost
- Evidence reference and policy version

## Deterministic Composition Order

The composer operates in this order:

1. Reserve the smallest useful task-specific preparation.
2. Select the highest-priority unmet weekly requirement that belongs on this day.
3. Choose the best eligible movement using specificity, assessment match, athlete preference, novelty control, and fatigue cost.
4. Allocate policy-owned dose and recovery.
5. Add a secondary requirement when it materially improves weekly coverage.
6. Add assistance or capacity work only for a remaining named gap.
7. Add conditioning only when assigned by the weekly plan and compatible with the lead adaptation.
8. Validate total time, weekly dose, movement balance, interference, and duplicate stress.
9. Remove lowest-priority optional work until the session fits.

The selection score is inspectable. The proposal should be able to explain, in deterministic terms, why a movement was chosen and which weekly need it fills.

## Time-Budget Behavior

Time pressure changes scope before it changes intent:

1. Preserve compressed specific preparation.
2. Preserve priority work and its required rest.
3. Preserve the highest-priority missing weekly exposure.
4. Reduce assistance sets or select a lower-setup alternative.
5. Use compatible non-priority supersets when technique and output remain valid.
6. Remove optional assistance and downshift work.

The kernel must never make a power session "fit" by shortening recovery until it becomes conditioning. It must never make a strength session "complete" by adding arbitrary circuits.

## Mixed-Goal Scheduling

Every plan has one lead goal for the eight-week version and at most two bounded secondary goals. Secondary work receives maintenance or development exposure only after the lead goal's requirements fit the week.

Same-session rules:

- Speed and power precede strength when speed or power leads.
- Strength precedes hypertrophy assistance when strength leads.
- Conditioning follows resistance only when the conditioning dose does not compromise the lead exposure.
- High-cost aerobic intervals are separated from priority speed or power when schedule permits.
- Easy aerobic work may coexist more freely when the time and recovery budget supports it.

## Progression and Review

Progression is attached to coverage requirements, not just exercise strings. The next exposure can progress one principal variable: load, repetitions, sets, duration, distance, density, complexity, or execution quality. The policy chooses eligible changes from performance and feedback; it does not progress every variable together.

Weeks 4 and 8 remain review checkpoints. The review evaluates:

- Completion and substitution patterns
- Performance trend and execution quality
- Session RPE, RIR, soreness, and athlete feedback
- Schedule and equipment changes
- Evidence that the planned dose was too low, appropriate, or poorly tolerated

The resulting adaptation is an inspectable proposal. It may reduce volume, intensity, impact, complexity, or density, preserve the existing plan, or change exercise selection. No single wearable score controls the decision.

## Completeness Validation

A plan proposal fails validation when any of these are true:

- A session lacks specific preparation or a priority adaptation without an explicit recovery/assessment classification.
- A movement has no role or weekly coverage requirement.
- A required weekly exposure remains unassigned without an explicit time, equipment, or constraint explanation.
- Session minutes exceed the accepted budget.
- Rest, effort, success, stop, or substitution guidance is absent.
- Speed or power is scheduled after avoidable high-fatigue work.
- A generic conditioning finisher lacks work, recovery, modality, repetition, and stop details.
- A prescribed load has no deterministic policy or assessment basis.
- Explicit equipment or constraint eligibility fails.
- Week 4 or 8 claims to be a deload without stating which stressor is reduced or reviewed.

## Verification Contract

The implementation tranche should prove:

- Unit tests for source resolution, catalog validity, coverage accounting, selection, sequencing, time trimming, and completeness validation
- Property tests across domains, two-to-six-day schedules, thirty-to-ninety-minute budgets, equipment combinations, and explicit no-overhead/no-running constraints
- Golden plans for representative new, consistent, and experienced athletes
- Regression tests showing the old one-primary-plus-one-support output no longer passes completeness validation
- Stored-plan compatibility and immutable proposal/acceptance tests
- Mobile visual checks for complete sessions at 320 px and 390 px
- Full Vitest, strict TypeScript, lint, build, and diff checks

## Delivery Stages

The dependency order is evidence reference, schema and policy, movement catalog, weekly coverage scheduler, session composer, validation and golden plans, then athlete-facing rendering and release verification. Each stage is tracked under Beads epic `Fitness-Tracker-jmi`; this document defines the design and acceptance boundary rather than serving as the task tracker.

Implementation status on 2026-07-28: the evidence reference, v0.3 schema and
policy, movement catalog, weekly scheduler, session composer, eight-week draft
assembler, and whole-plan validator are implemented locally. Six deterministic
golden profiles cover every supported programming domain, all training states,
varied schedules, and bodyweight through mixed equipment. The legacy v0.2
proposal is proven not to satisfy the complete v0.3 gate.

The unreleased Program integration now collects resolved equipment and explicit
constraint facts, creates and validates v0.3 proposals before the existing
atomic RPC, stores complete session prescriptions, and renders weekly coverage
plus every block's intent on mobile. The accepted-plan renderer branches by
stored format so legacy v0.2 prescriptions remain readable and are never
recomputed. The dual-format check-constraint migration is staged locally and
must be applied before the matching application deployment. Local focused
integration, compatibility, and 320/390 px browser checks pass; full repository
gates, live apply-twice/rollback verification, commit/CI, deployment, and
production readback remain release evidence rather than assumed state.
