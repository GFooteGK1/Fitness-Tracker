# Adaptive Plan Contract 0.1.0

## Purpose

Every newly generated complete-programming proposal carries an immutable,
versioned explanation of what the plan intends to adapt and how the app will
evaluate it. The contract is stored inside the plan-version intent. It does not
change the existing v0.3 session prescription format.

## Trace

Each accepted goal allocation produces this chain:

```text
athlete goal outcome and eight-week horizon
  -> trainable quality and emphasis state
  -> programming hypothesis
  -> scheduled assessments at weeks 1, 4, and 8
  -> expected repeated signal
  -> versioned evaluation policy
  -> continue, progress, maintain, redirect, recover, hold, or pause proposal
```

Every weekly coverage requirement also records its goal, quality-emphasis, and
hypothesis links. Session blocks already reference those coverage requirements,
so the trace continues from plan intent to composed work without duplicating
the exercise prescription.

## Deterministic domain mapping

| Programming domain | Primary quality | Scheduled assessment | Expected direction |
| --- | --- | --- | --- |
| Strength | Maximal strength | Repetition maximum | Increase |
| Hypertrophy | Strength endurance | Fixed-load repetition capacity | Increase |
| Power and explosiveness | Explosive strength | Jump height | Increase |
| Speed and agility | Acceleration | Sprint time | Decrease |
| Aerobic | Aerobic endurance | Run time trial | Decrease |
| Resilience | Recovery capacity | Readiness self-report plus repeated session outcome | Maintain or improve |

The map chooses an assessment and direction. It does not invent a numeric goal
target. The goal target remains `null` until the athlete explicitly provides a
typed target in a later input flow.

Assessment catalog 0.2.0 adds session RPE as a typed `training_signal` under
the `session-rpe-ten-point` protocol. The session check-in owns this value;
clients cannot submit it again as a separate observation. It can contribute to
a repeated recovery signal, but cannot by itself change training emphasis.

## Evaluation boundaries

- Every signal requires at least two comparable observations. One session or
  readiness score cannot change emphasis.
- `progress` requires supported, improving evidence.
- `maintain` requires supported evidence and an athlete-confirmed achieved goal.
- `redirect` requires repeated comparable evidence that contradicts the
  hypothesis.
- `recover` requires repeated compatible observations that support a recovery
  concern.
- Insufficient or incompatible evidence holds the plan and asks for the smallest
  useful measurement.
- Invalidated or excluded evidence pauses the decision for review.
- Evaluation can propose a replacement only. `automaticPlanActivation` is
  always `false`; the athlete must accept a replacement plan.

## Canonical completion evidence

Completion contract v2 requires explicit confirmation of either accepted work
performed as prescribed or modified actual work. As-prescribed completion copies
the immutable accepted prescription on the server. Modified completion stores
the actual blocks and concise summary supplied by the athlete. A skipped session
stores no workout or performance observation.

One database transaction creates the canonical workout, check-in, automatic
session-RPE observation, supplied protocol-typed observations, and
`completed_workout_id` link before it marks the session terminal. Identical
idempotent retries return the original IDs. A mismatched retry, stale plan,
terminal session, or cross-user request fails closed. Observation values retain
observed and captured times, definition and protocol versions, comparison
context, and source identity.

## Compatibility

Existing legacy v0.2 and complete v0.3 session prescriptions retain their
stored shape and renderer. A valid earlier complete v0.3 plan without the
adaptive trace remains valid and receives a compatibility warning. All newly
generated plans include and validate the trace before the proposal RPC stores
the immutable plan version.
