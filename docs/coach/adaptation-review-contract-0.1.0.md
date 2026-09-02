# Adaptation Review Contract 0.1.0

## Purpose

The adaptation evaluator converts a bounded evidence packet into one inspectable
action: continue, progress, maintain, redirect, recover, hold and collect more,
or pause for review. It is deterministic. It does not diagnose, invent a dose,
edit the accepted plan, or activate a proposal.

`adaptive-review-0.1.0` is the first evaluator algorithm. The stored plan's
`adaptive-plan-evaluation-0.1.0` policy and hypothesis remain authoritative for
the required metrics, semantic roles, assessment definitions, observation
minimums, review window, and allowed actions.

## Evidence rules

- Values are converted to the metric's canonical unit before comparison. The
  packet retains the original value, original unit, and ordinal for audit.
- A comparable exposure is one workout, prescribed session, or date. Multiple
  attempts or sets in one exposure do not satisfy a repeated-exposure gate.
- The evaluator selects one protocol and full comparability series for each
  requirement. It never combines incompatible series to reach a threshold.
- Each series reports best and average values, early and recent averages,
  direction-adjusted change, provisional variability, interval consistency,
  set-to-set decay, and velocity loss when applicable.
- Variability remains provisional until six comparable exposures. Directional
  progression or redirection requires at least four exposures and agreement in
  at least two recent exposures. One outlier cannot create a new trend.
- Direct outcomes, estimates, proxies, and training signals remain distinct.
  Proxy improvement without direct transfer triggers a specificity review.
- A target moves to maintenance only when two recent compatible direct
  exposures meet the athlete-confirmed target.
- Readiness alone never changes the plan. Recovery is recommended when direct
  performance and repeated recovery or training-cost evidence decline together,
  or when repeated athlete check-ins independently require a recovery review.
- Concerning pain pauses the provoking work and proposal flow. The app does not
  infer a diagnosis.

Insufficient, stale, truncated, conflicting, or unavailable evidence returns a
hold and the smallest named measurement that can change the decision.

## Reproducible snapshot

Every complete review produces a content-addressed evidence snapshot with:

- active plan, goal, hypothesis, and evaluation-policy IDs;
- as-of time and evaluation window;
- included observation IDs and excluded observation IDs with reasons;
- protocol signatures and full comparability identities;
- sample and exposure counts;
- execution and safety source IDs;
- series summaries, confidence, and provisional-variability state;
- context-selection, evaluator, and plan-policy versions; and
- a stable SHA-256 content hash.

The snapshot is embedded in both the immutable replacement proposal rationale
and its input snapshot. This keeps the decision reproducible without creating a
second observation store. A source correction requires a new review and a new
snapshot hash.

## API and authority

`POST /api/coach/adaptation-reviews` authenticates the athlete, assembles an
`adaptation_review` packet plus bounded recovery context, reads the exact
accepted adaptive-plan contract, and returns the review without writing by
default.

The endpoint creates a replacement draft only when all conditions are true:

1. the deterministic action is progress, maintain, redirect, or recover;
2. the evidence snapshot is complete;
3. the athlete supplies a valid replacement planning setup and idempotency key;
4. the replacement starts on or after the review date; and
5. the current plan still matches the evaluated base version.

The existing atomic replacement-proposal function stores a new proposed plan
version and the exact evidence snapshot. It leaves the accepted plan unchanged.
`accept_adaptation_proposal` remains the only activation transition and must be
called through a separate explicit athlete action.

APEX scores, autonomous activation, unsupported causal claims, black-box
control, and model-generated numeric prescriptions remain out of scope.
