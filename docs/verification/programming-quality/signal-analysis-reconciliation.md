# Existing signal analysis — review starting point

Date: 2026-09-21. Reviewer: Greg Foote. Review status: [six qualitative responses agreed](signal-review-decisions.md); statistical-method validation and numerical applicability remain open.

## Correction to the review sequence

Signal-analysis research and an adaptation evaluator already exist. Asking Greg first to choose “two matching exposures in 28 days” conflated a proposed **initial-dose continuity** rule with the existing **program-adaptation** work. Those are different decisions. Greg's review should start from the researched methods, their implemented behavior and their remaining applicability gaps. The initial-dose proposal remains a separate pending review, not a universal adaptation threshold.

This reconciliation checks existing repository records and code. It does not revalidate the cited literature or infer deployment from local files.

## What already exists

| Layer | Existing work | Status and boundary |
|---|---|---|
| Research synthesis | [Autoregulation appendix](../../../../coaching-layer/docs/coach/autoregulation-research-appendix.md), especially sections 1–3 and 8 | Narrative synthesis covering RIR, fixed-load velocity, within-session velocity/output loss, subjective monitoring, HRV, measurement error and response interpretation. Separates immediate adjustment, recurring-dose revision and changed training emphasis. Protocol-specific numerical thresholds remain uncalibrated. |
| Decision examples | [Signal cards](../../../../coaching-layer/docs/coach/coaching-signal-cards.md) | Four cards: set-effort mismatch, exercise-specific progression, aerobic execution fit, repeated cost without intended response. Worked cases and draft example settings already exist. Scope explicitly excludes power/velocity prescriptions, hard intervals and maximal testing. |
| Implemented analysis | [Adaptation evaluator](../../../app/lib/coach/adaptation-evaluator.ts) and [contract](../../coach/adaptation-review-contract-0.1.0.md) | Groups comparable samples into separate exposures, retains protocol identity, summarizes early versus recent output and variability, and returns a traceable action. It does not itself supply or activate a new numerical prescription. |
| Connection to programming | [Targeted review](../../../app/lib/coach/targeted-review.ts), [weekly-review tests](../../../test/coach/weekly-review.test.ts) | A velocity measurement cannot inherit repetition-max numerical eligibility. The tested result is collect-signal with no dose change and `outcome_policy_adapter_unavailable`. Measurement support is not a completed VBT-to-prescription policy. |

## Implemented methods versus reviewed evidence

The evaluator uses the best direction-adjusted value within each exposure, divides chronological exposure values into earlier and recent halves, compares their averages, and requires agreement across recent exposures. It calculates sample coefficient of variation across those exposure values. Its change threshold is currently `max(2%, min(10%, 0.5 × CV))`. Directional evidence uses a four-exposure minimum, with variability labeled provisional below six exposures. Within-exposure decay and velocity-loss summaries are also available.

These are verified code settings, **not claims that research validates those exact counts or thresholds**. In particular, CV across changing performance is not automatically an isolated estimate of device error or stable personal baseline noise. The research explicitly distinguishes minimum detectable change, practically worthwhile change and the athlete's target. Review must preserve those distinctions instead of treating a single percentage as all three.

The existing decision hierarchy also says that an athlete can use an already permitted session adjustment without waiting for a long-term trend. A feasible accepted prescription can continue when no justified change is indicated. Recurring-dose or emphasis changes need the relevant comparable evidence and decision-specific response rule. Confirmed availability changes are a separate basis for scheduling review.

## Review sequence and current status

Greg completed the six qualitative case reviews below. Preserve those decisions;
do not repeat this review as an unanswered request. The original sequence remains
here to explain its relationship to the research. Engineering now translates the
agreed responses into explicit checks and identifies method-specific gaps before
requesting any further concrete decision.

Present worked observations and the resulting decision, with the source-method link and limitations alongside it:

1. Same fixed protocol with variation that may be noise: does the method appropriately retain the program and state uncertainty?
2. Repeated comparable improvement plus matching effort/execution context: does the interpretation support a specific proposed change, and to which variable?
3. Lower VBT output with stable working performance, or conflicting effort reports: does it avoid an unjustified global conclusion?
4. Changed load, reps, device, variation or missing sensor readings: does it reject an invalid comparison while preserving known performed work?
5. Changed availability or repeated session-time conflict: does it repair feasibility without pretending there is physiological regression?

Those [six evidence-to-action traces are now prepared](signal-review-cases.md),
with actual synthetic measurements, evaluator outputs and pending interpretation
questions. Separate independent review verified their claims against the code.
They distinguish harness-only VBT analysis from product eligibility and expose
unconsumed effort/working-performance context. They do not extend the original
signal cards beyond their scope. No default threshold is approved by this
document. Reviewer assignment remains resolved; policy decisions and validation
remain pending.
