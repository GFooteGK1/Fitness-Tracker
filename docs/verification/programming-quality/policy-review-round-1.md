# Programming policy review — round 1

Reviewer: Greg Foote, designated by “I can do the reviewing” on 2026-09-21.
Status: reviewer assigned; all decisions below await review. No policy approval is inferred from volunteering.
Tracking: `Fitness-Tracker-qsp` for initial continuity; `Fitness-Tracker-i40.5` for later extended policies.

Review-order correction: Greg correctly recalled the existing signal-analysis research. Start with the [research-to-implementation reconciliation](signal-analysis-reconciliation.md). This packet covers initial-dose continuity only; its two-exposure/28-day proposal is not the rule for deciding program adaptations. The request to choose those parameters as the first review decision is deferred until the existing methods and worked decisions have been presented.

## What this review decides

When may Socius use a previously performed prescription as the starting proposal, instead of substituting generic sets/reps? This round covers retaining a complete strength/hypertrophy prescription. It does not yet decide progression, VBT thresholds, running/sprint doses or program activation.

The source is the proposed [initial-dose policy](../../../../coaching-layer/docs/coach/initial-dose-policy-0.1.md), SHA256 `28B1F7D6CA40670EDCD9465BF5D2DF0B08866EDE52388B24989643636833E288`. That document is a review draft, not established physiological evidence. The current compiler's minimum three-rep strength range is a software restriction; it is not evidence that two-rep work is inappropriate.

Reply in ordinary language. For each item, accept the proposed behavior, change it, or identify what information would change your decision. A short reason lets us turn your judgment into testable rules. We will record your actual answers and separate review scope from broader product claims.

## Three policy decisions

| ID | Proposed behavior | Choice for Greg |
|---|---|---|
| R1 — Retain supported work | Offer the same complete prescription when the most recent comparable work supports it and current goals, restrictions, frequency and total-week demands still fit. Preserve load, sets, reps/range, rest, variation and declared effort target. No automatic increase and no silent change to the accepted plan. | Accept, change, or defer; explain any missing decision factor. |
| R2 — Amount and age of evidence | The existing draft uses two independently confirmed matching exposures on separate dates within 28 days. These are proposed engineering parameters, not validated tolerance or detraining thresholds. One exposure or older evidence cannot cause an automatic reduction; it needs a clearly limited basis or further review. | Keep these conservative parameters for the initial rule, or specify how sufficiency/recency should work instead. Identify a counterexample. |
| R3 — Compiler cannot represent the prescription | If supported work uses doubles but the current strength template permits only 3–8 reps, report the capability gap and preserve the evidence. Do not turn doubles into triples or silently choose a generic load. To support doubles, review the appropriate prescription class and its limits before implementing that numerical option. | Confirm this behavior and whether heavy-double support belongs in the first reviewed scope. Supporting a class still requires its concrete policy review. |

## Calibration examples

These are synthetic interpretation cases, not workouts prescribed to Greg. Assume records are owned, dated, corrected as needed and independently linked to completed sessions. Do not assume additional training, missing fields, or medical clearance. Proposed outcomes are visible discussion aids, not blind-evaluation labels.

| Case | Facts available | Proposed interpretation to review |
|---|---|---|
| C1 — Exact repetition | Two separate sessions in the last two weeks confirm bench press 3 × 6 at 165 lb, same variation, 180-second rest and declared 2–3 RIR target; no contrary report; proposed frequency and surrounding commitments unchanged; full week fits. | Candidate for the unchanged complete bundle if R1/R2 are approved; this does not claim optimality or prove tolerance. |
| C2 — One exposure | Same facts as C1, but only one confirmed session. | Under the existing two-exposure draft, insufficient for automatic history-based selection. Determine whether another observation or a targeted review is warranted; do not reduce the dose merely because logging is sparse. |
| C3 — Later contrary evidence | The C1 pair exists, but a later session was stopped or materially modified and the reason is unresolved. | Review the later record before selecting a dose; do not pick only the favorable pair. |
| C4 — Changed week | Same per-session prescription, but the proposed frequency doubles or significant outside training is added. | Reassess the combined week; repeating a per-session dose does not mean total demand is unchanged. |
| C5 — Unknown rest/effort | Load/reps/sets are recorded twice, but rest and the effort scale are not. | Preserve known quantities; do not fill the gaps or declare the whole bundle equivalent. Identify the question that would change the proposal. |
| C6 — Different variation | A saved squat assessment is for a box squat; the draft prescribes an ordinary back squat. | No inferred load transfer merely because the stored movement name matches. Keep an explicit variation/protocol eligibility check. |
| C7 — Heavy doubles | Two confirmed complete prescriptions are 4 × 2 with a known load, variation, rest and effort target. The template only permits 3–8 reps. | Unsupported by that template, not evidence of a training problem. Review and implement the needed prescription class; never clamp repetitions to three and call it continuity. |
| C8 — Monitoring changes | A fixed-load monitoring protocol changes from three reps to two; only two sensor readings are captured for a three-rep set in another session. | Keep protocol versions separate. Missing sensor readings do not change the known performed rep count. This does not define a velocity threshold for adaptation. |

For calibration, start with C1, C2 and C7. Record the action you would take, why, and what would change your answer. We can then resolve disagreements before you score complete weeks against the six-dimension [rubric](baseline-and-rubric.md).

## Decision record

R1: pending. R2: pending. R3: pending. C1–C8: pending.

Reviewer assignment is complete. Policy freeze, scope confirmation, case adjudication and calibration are not complete. The historical baseline report correctly retains the review status at its generation time; it is not rewritten to imply retrospective review. No professional credential, independent clinical validation or blanket approval is claimed by this assignment.
