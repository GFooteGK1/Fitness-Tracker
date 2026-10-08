# Programming policy review — round 1

Reviewer: Greg Foote, designated by “I can do the reviewing” on 2026-09-21.
Status: C1/C1-F, both C4 branches, C5, C6 and C7/R3 recorded on 2026-09-26; C2-R's actual-set-RPE single-exposure variant reviewed on 2026-09-27. Remaining case judgments, numerical limits and policy freeze pending. No policy approval is inferred from volunteering.
Tracking: `Fitness-Tracker-qsp` for initial continuity; `Fitness-Tracker-i40.5` for later extended policies.

Current consolidation: [initial-dose policy 0.2 review draft](../../coach/initial-dose-policy-0.2-review.md).
It reconciles the actual decisions below with the historical 0.1 proposal.
Greg approved freezing the presented 0.2 scope for local implementation with
"Okay" on 2026-09-27; version `initial-dose-0.2.0` remains disabled in runtime.
The exact C2-R follow-up session of 170 lb,
3×6, target set RPE 7–8 and 180-second rest, including its newly proposed warm-up,
was accepted by Greg on 2026-09-27. See [the complete accepted session](bench-next-exposure-review-1.md).

Review-order correction: Greg correctly recalled the existing signal-analysis research. Start with the [research-to-implementation reconciliation](signal-analysis-reconciliation.md). This packet covers initial-dose continuity only; its two-exposure/28-day proposal is not the rule for deciding program adaptations. The request to choose those parameters as the first review decision is deferred until the existing methods and worked decisions have been presented.

## What this review decides

When may Socius use a previously performed prescription as the starting proposal, instead of substituting generic sets/reps? This round initially proposed retaining complete strength/hypertrophy prescriptions. Greg's C1 review below requires a goal-dependent progression option as well. Exact progression parameters, VBT thresholds, running/sprint doses and program activation remain undecided.

The source is the proposed [initial-dose policy](../../../../coaching-layer/docs/coach/initial-dose-policy-0.1.md), SHA256 `28B1F7D6CA40670EDCD9465BF5D2DF0B08866EDE52388B24989643636833E288`. That document is a review draft, not established physiological evidence. The current compiler's minimum three-rep strength range is a software restriction; it is not evidence that two-rep work is inappropriate.

Reply in ordinary language. For each item, accept the proposed behavior, change it, or identify what information would change your decision. A short reason lets us turn your judgment into testable rules. We will record your actual answers and separate review scope from broader product claims.

## Three policy decisions

| ID | Proposed behavior | Choice for Greg |
|---|---|---|
| R1 — Retain supported work | Offer the same complete prescription when the most recent comparable work supports it and current goals, restrictions, frequency and total-week demands still fit. Preserve load, sets, reps/range, rest, variation and declared effort target. No automatic increase and no silent change to the accepted plan. | Accept, change, or defer; explain any missing decision factor. |
| R2 — Amount and age of evidence | The historical draft used two independently confirmed matching exposures within28 days. Existing accepted playbook principles4/10/13 and CP-09 permit a supported single-exposure trial; the historical repeat-count rule must not become a universal coaching prerequisite. Older evidence still needs relevant context; missing logs do not establish detraining. | Reconcile the software's retrieval/eligibility parameters with the accepted distinction between a routine trial and strategic adaptation. Exact numerical bounds and freshness handling remain pending; do not ask Greg to reapprove the single-exposure principle. |
| R3 — Compiler cannot represent the prescription | If supported work uses doubles but the current strength template permits only 3–8 reps, report the capability gap and preserve the evidence. Do not turn doubles into triples or silently choose a generic load. To support doubles, review the appropriate prescription class and its limits before implementing that numerical option. | Reviewed 2026-09-26: heavy doubles are included in the first supported strength-programming scope. Concrete load, effort and applicability limits remain to be defined; see C7 record. |

## Calibration examples

These are synthetic interpretation cases, not workouts prescribed to Greg. Assume records are owned, dated, corrected as needed and independently linked to completed sessions. Do not assume additional training, missing fields, or medical clearance. Proposed outcomes are visible discussion aids, not blind-evaluation labels.

| Case | Facts available | Proposed interpretation to review |
|---|---|---|
| C1 — Exact repetition | Two separate sessions in the last two weeks confirm bench press 3 × 6 at 165 lb, same variation, 180-second rest and declared 2–3 RIR target; no contrary report; proposed frequency and surrounding commitments unchanged; full week fits. | Reviewed 2026-09-26: Greg favors progressing volume or load according to the end goal; for an APEX-style strength goal, increase load. Unchanged repetition is not the preferred next proposal for that goal. Exact increment and achieved effort were not established. See decision record below. |
| C2 — One exposure | Same facts as C1, but only one confirmed session. | Existing CP-09 supports a small next-exposure trial when intended versus actual effort, completion, technique, symptoms and recovery provide sufficient evidence. One session is not automatically insufficient. C1's declared target alone does not prove achieved effort; clarify material omissions. This is reconciliation to an accepted principle, not a new case-specific score or approved increment. |
| C3 — Later contrary evidence | The C1 pair exists, but a later session was stopped or materially modified and the reason is unresolved. | Review the later record before selecting a dose; do not pick only the favorable pair. |
| C4 — Changed week | Same per-session prescription, but the proposed frequency doubles or significant outside training is added. | Both branches reviewed 2026-09-26: more bench work is favored for the presented test-preparation case. For added demanding CrossFit classes, clarify movements, intensity and schedule, then adjust overlapping work while preserving goal-priority training. Exact amounts and distribution remain unresolved. |
| C5 — Unknown rest/effort | Load/reps/sets are recorded twice, but rest and the effort scale are not. | Reviewed 2026-09-26: ask RPE for each working set first. Prescribe rest to support maintaining intended intensity across working sets. Easier work supports considering more reps or load. Exact rest durations, numerical thresholds and unreported historical rest remain unresolved; do not invent effort. |
| C6 — Different variation | A saved squat assessment is for a box squat; the draft prescribes an ordinary back squat. | Reviewed 2026-09-26: use data that supports conversion; otherwise ask for assessment of the prescribed movement. If a limitation prevents assessment, adapt training to the athlete's capabilities and pain/injury constraints. No conversion formula, maximal test, or specific alternative was selected. |
| C7 — Heavy doubles | Two confirmed complete prescriptions are 4 × 2 with a known load, variation, rest and effort target. The template only permits 3–8 reps. | Reviewed 2026-09-26: Greg confirms heavy doubles are appropriate and included in the first supported strength scope. Preserve two-rep work; the current template limitation remains a compiler gap. Load/effort limits and implementation are not complete. |
| C8 — Monitoring changes | A fixed-load monitoring protocol changes from three reps to two; only two sensor readings are captured for a three-rep set in another session. | Already covered qualitatively by accepted signal cases4/5: keep protocol series separate and preserve the known performed count despite incomplete sensor data. Do not repeat that approval. Exact completeness/adaptation methods remain unresolved; no velocity threshold is inferred. |

For calibration, reuse the accepted C1/C7 decisions and the applicable existing
C2/C8 principles. Ask only about remaining material uncertainties or concrete
numerical options. These qualitative decisions do not manufacture scores against
the six-dimension [rubric](baseline-and-rubric.md).

### September27 reconciliation and withdrawn duplicate question

The assistant asked whether a single complete bench3×6 at165lb exposure with
actual set RPE7/7/7 could support a trial, then withdrew that question after
retrieving the already accepted CP-09 single-exposure principle. Greg subsequently
answered; his actual case-specific decision is recorded as C2-R below. The source
below had already warned against repeating
this gate. The added hypothetical also omitted the prior intended effort; an
actual RPE by itself does not show that the intended target was undershot.

Sources: sibling `rolling-weekly-coach/docs/coach/coaching-playbook.md`, core
principles4/10/13 and CP-09; this packet's existing C1 reconciliation; and
`signal-review-decisions.md`, Greg's accepted cases4/5. The latter stays frozen
because its hash binds the adjudication ledger. Exact load increments, parameter
applicability, contradictory later evidence and numerical policy freeze remain
unfinished. This correction removes duplicated questions, not verification gates.

## Decision record

R1: needs revision in light of C1; unchanged retention cannot be the only supported option. R2: supported single-exposure trial principle settled; exact freshness and numerical bounds pending. R3: first-scope inclusion of heavy doubles approved; numerical limits pending. C1/C1-F: qualitative progression and effort-priority judgments recorded; numerical implementation incomplete. C4: bench-frequency and outside-training branches reviewed qualitatively; exact amount/distribution remain pending. C5: ask working-set RPE first and prescribe rest to maintain intended intensity; exact durations and numerical decision limits pending. C6: supported conversion, movement-specific assessment, and limitation-aware alternatives reviewed qualitatively; concrete methods/limits pending. C7: heavy doubles appropriate for the presented goal-fitting prescription and included in scope. C2-R: small load increase selected for the actual-set-RPE variant below; the original declared-effort-only C2 is not silently relabeled. C3 remains unresolved. C8 qualitative handling is covered by accepted signal cases4/5; exact completeness methods remain pending.

### C2-R — Single exposure with actual set effort, 2026-09-27

Source: direct response to question `call_YQhiinZR0l9cjCtpwloIIBrY`.
Synthetic strength-goal athlete; one complete session of the same bench variation,
**3 × 6 at 165 lb**, **3-minute rests**, actual set **RPE 7, 7, 7**, crisp reps,
normal recovery, no pain, unchanged availability and no added outside training.
Older training is unknown, not assumed absent. The prior intended effort was not
specified, so do not label this an observed target undershoot.

Greg answered:

> small load increase for next exposure

Record **propose a small load increase at the next exposure**. Apply the existing
one-variable principle: retain three sets, six reps, the bench variation and
three-minute rests while evaluating the response. The exact increment and next
target RPE were not supplied. Do not invent them, a new max, an automatic increase
after every session, or a universally sufficient RPE threshold. This settles the
presented variant's qualitative decision; it does not freeze numerical policy,
approve a runtime prescription or score other review dimensions.

**Subsequent exact-session review, 2026-09-27:** Greg asked to see the session,
then replied "Yes" to the complete proposal. The accepted working prescription
is **170 lb, 3×6, target RPE7–8 on each set, 3-minute rests**. The newly proposed
preparation and ramp are preserved verbatim in
[bench-next-exposure-review-1.md](bench-next-exposure-review-1.md). Stop early at
the effort/technique limit and record actual reps/RPE. This supplies the increment
and next effort target for this case; the original reply above did not. No
universal increment, achieved future effort or overall policy freeze follows.

### C1 — Greg's decision, 2026-09-26

Source: Greg's direct reply to the C1 bench example in this programming-quality conversation:

> This looks like the athlete is ready to either increase volume or load pending the end goal. If it’s something like my APEX goal it’s time to increase the load to keep progressing strength gains

Record this as the desired decision for the presented example: identify the end
goal, choose the relevant progression variable, and favor a load increase for the
APEX-style strength goal. The earlier unchanged-bundle proposal is not an approved
expected answer for that goal. The reply does not specify an increment, approve a
two-exposure/28-day threshold, or establish that the intended RIR was achieved.
The example contains a declared effort target, not measured or reported actual RIR.

This is consistent with the existing routine-progression guidance in the sibling
`rolling-weekly-coach/docs/coach/coaching-playbook.md`, principles 10/13 and CP-09:
change one variable in a supported trial, then use the response to retain, hold or
reverse it. That prior guidance permits a supported single-exposure trial; do not
ask Greg to approve a mandatory second exposure as though he had not answered the
broader principle. Its conditions and any fixed monitoring protocol remain separate
from working-set progression. This cross-reference is existing documentation, not
new runtime evidence or approval of exact numerical parameters.

Track progression policy under `i40.5` alongside `qsp`; do not force a progression
judgment into an unchanged-continuity-only policy. The failure contrast has now
been answered separately below; it does not add successful effort, technique or
recovery observations to the original C1 facts.

### C1-F — Failure instead of intended reserve, Greg's decision, 2026-09-26

Presented contrast: the final set reached failure rather than the intended 2–3
reps in reserve. Source: Greg's direct response in this conversation:

> I think this is where we look at the bigger picture and any other context that might explain the failure at the end of the set. my first thought is we instruct the athlete to keep the load in the next session use 6 as the min target and encourage them to push to the true 2-3 reps in reserve in the next session and if we see consistency in getting to higher rep ranges that is a good sign to increase load the next time around.

Desired response for this contrast:

- Investigate wider context that could explain the failed set; do not infer its
  cause or a lasting loss of capacity from this observation alone.
- Provisionally retain the load for the next session, with six as the minimum
  repetition target and actual 2–3 RIR guiding effort. Six is not an automatic
  repetition ceiling when the athlete has more reserve. The effort target takes
  priority if it is reached before six: stop and record the missed rep target.
- Look for consistent higher repetition performance at the intended reserve as
  support for a subsequent load increase. Do not treat extra reps achieved by
  going to failure as equivalent evidence of more reps at 2–3 RIR.

This is a contextual load-hold/repetition-progression response, not an unchanged
fixed-rep repeat and not an immediate load increase following failure. Greg's
"first thought" is provisional on the broader context. No cause of failure,
upper rep limit, required count of consistent exposures, or load increment was
specified. Do not convert "consistency" into a fixed two-session rule.

Execution priority clarified on 2026-09-26. Asked, "if the athlete reaches 2–3 RIR
before six reps, should they stop there and record the missed rep target?", Greg
answered **"yes"**. The reserve target takes priority over the six-rep minimum
target. Preserve the actual completed reps and the missed target separately; do
not force six, report six as completed, or infer an automatic load reduction from
this answer. This judgment does not
authorize changes to fixed monitoring protocols, accepted plans or production
flags. It is a separate development review record, not a baseline score or sealed
holdout label.

### C7 / R3 — Heavy doubles included, Greg's decision, 2026-09-26

Presented case: successful 4 × 2 with confirmed load, rest, variation and effort,
appropriate to the athlete's strength goal, but outside the current template's
3–8-rep range. Asked whether heavy doubles should be in the first supported
strength-programming scope or deferred, Greg replied:

> Yes heavy doubles are appropriate

Record the scope decision as **include heavy doubles**. Preserve the two-rep
prescription and expose a capability gap until the compiler can represent it;
never substitute three reps and call it the same work. Reuse the existing
`u5l.6` compiler-reconciliation task, with `qsp` and `i40.5` policy review.

This response approves the prescription class in the stated context. It does not
select a new load, effort limit, progression increment, weekly frequency or
population-wide eligibility rule. It does not make doubles mandatory, establish
a two-exposure threshold, or convert working sets into fixed monitoring sets.
Concrete numerical limits and applicability must still be reviewed before policy
freeze. Do not ask Greg again whether the class belongs in scope.

### C4 — Added bench day, Greg's decision, 2026-09-26

Presented branch: an athlete with an APEX-style strength goal currently benches
once weekly, 3 × 6 at 165 lb at the intended 2–3 RIR. They now have time for a
second bench day; other training is unchanged. Asked whether to distribute the
existing work, add work, or decide from other context, Greg replied:

> It’s context dependent relative to the athletes goal. In this case the athlete likely needs more bench work to get prepared to meet the demands of the test they are training for.

Record a goal-dependent preference for **more bench work in this presented
test-preparation case**. Merely distributing the original three sets is not the
preferred expected answer here. Preserve the word "likely": the test's concrete
demands, current performance gap and appropriate amount/distribution of work have
not been established by this example. Do not invent the test protocol or assume
the extra day authorizes a second full 3 × 6 session, double weekly volume, or a
simultaneous load increase. A new available day alone is not a universal reason
to add work; the rationale must connect to the goal and surrounding training.

This judgment covers the additional-bench-day branch only, not the separate
scenario with significant added outside training. It supplies desired qualitative
behavior for whole-week planning, not an approved numerical week or a score for
the frozen baseline. Record implementation relevance under `i40.4` and policy
review under `i40.5`; preserve all package dependencies and numerical gates.

### C4 — Added outside training, Greg's decision, 2026-09-26

Presented synthetic contrast: an athlete pursuing a bench-strength goal adds two
demanding CrossFit classes. Their existing strength plan already fills their
available training time. Proposed response: clarify the classes' movements,
intensity and schedule, then adjust overlapping work while preserving the training
most important to the athlete's goal. Greg replied:

> Yes this is what I would do too

Record that response as acceptance of this sequence for the presented case.
Evaluate the combined week using the clarified class demands and available time;
do not simply stack the classes onto an already full plan. The specific class
content, overlap and resulting adjustments remain unknown. No fixed volume cut,
automatic bench reduction, or assumption that the classes replace strength work
was approved. Propose any plan changes for acceptance and preserve accepted history.

This separately settles the outside-training branch left open by the earlier
bench-frequency review. Track whole-week behavior under `i40.4` and policy review
under `i40.5`. It is a qualitative development judgment, not a scored complete
week, implemented runtime behavior or numerical activation authority.

### C5 — Ask RPE first, Greg's decision, 2026-09-26

Presented case: the athlete logs 3 × 6 at 165 lb but neither rest periods nor
proximity to failure. Asked what to ask first before repeating or progressing the
prescription, Greg replied:

> First ask RPE this is most important for determining if they should increase intensity. In general move the weight until it gets hard to move and when it’s easy either do more reps or add weight

Record **ask RPE first** as the desired next question. Perceived effort is Greg's
first missing input for this progression decision. Record the answer with its
actual scale and scope; do not infer effort from load/repetition counts alone.
His general progression heuristic is to work at a challenging effort and consider
more repetitions or load when the work is easy, in the context of the goal.

"Hard to move" is qualitative wording, not a measured velocity threshold or a
new instruction to reach failure. The explicit C1-F rule still prioritizes 2–3
RIR over the repetition minimum. This answer does not authorize changing load and
reps simultaneously, supply an increment, or make RPE the only relevant context.
Asking RPE first does not establish the unreported rest periods or other facts.

Granularity and rest clarified on 2026-09-26. Asked whether the RPE should describe
each working set, the final working set, or the whole session, Greg replied:

> Each working set. The rest time should be set such that intensity can be maintained across each working set

Record **RPE for each working set**, retaining its association with that set's
performed load and reps. A session rating or final-set rating alone does not
supply all of these observations. Prescribe rest periods to support maintaining
the intended intensity across the working sets. This adds a rest-design criterion;
it does not supply the historical rest periods missing from the example.

Exact rest duration and numerical intensity/RPE limits were not specified. Do not
require every set to report identical RPE, infer automatic RPE-to-RIR conversion,
or equate subjective difficulty with a measured velocity. Preserve the earlier
2–3 RIR stop rule. Account for prescribed rest in whole-session time feasibility;
this working-set judgment does not authorize silently changing a fixed monitoring
protocol's rest interval. No universal progression cutoff follows from "hard" or
"easy". Do not ask Greg again which RPE granularity to capture.

### C6 — Variation conversion and athlete limitations, Greg's decision, 2026-09-26

Presented case: a recorded box-squat assessment, a proposed regular back squat,
and no comparable back-squat history. Asked how to establish the starting load,
Greg replied:

> If there is data to help convert then let’s use that. Otherwise we ask the athlete to assess the prescribe movement. If they are unable to due to some limitation then we need to meet the athlete where they are at so they can continue to train without pain or risk of further injury

Desired decision paths:

- Use supporting conversion data when it applies to the source and prescribed
  variations. Preserve the source and conversion basis; a shared movement name
  alone is not supporting data. This is not a blanket prohibition on transfer.
- Without a supported conversion, ask the athlete to assess the prescribed
  movement. No assessment protocol or requirement for a maximal test was selected.
- If a limitation prevents that assessment, adapt the training to the athlete's
  current capabilities and constraints, with the aim of avoiding pain or further
  injury. Do not force the prescribed movement or assessment to fill a data gap.

The specific conversion method, its applicability and uncertainty, the assessment
protocol, and any alternative exercise/dose remain unresolved. Do not fabricate a
conversion percentage, infer exercise-specific clearance, or promise risk-free
training. Preserve reported pain and restrictions when selecting alternatives.
An alternative is a proposed change for acceptance, not an edit to accepted
history. This is qualitative policy review, not approval of a particular conversion
or clinical assessment. Track the variation-transfer implementation under `i40.6`
and its numerical policy under `i40.5`; current runtime and flags stay unchanged.

### Session duration and athlete choice, Greg's decision, 2026-09-26

During the private complex-week review, a full session exceeded an approximate
time budget under stated planning assumptions. Asked whether to shorten or relocate
its easy aerobic component, Greg replied:

> The full session looks good athletes can adjust to fit their time demands

Accept the presented session within that review scope. Keep the full prescription
visible, state its estimated duration and rest intervals, and let the athlete
choose an adjustment to fit actual availability. Do not automatically impose the
assistant's proposed cut. Distinguish an approximate time preference from a
confirmed hard stop; do not claim an over-budget session fits a strict limit.
Keep prescribed and actually performed work distinct and retain fixed monitoring
protocols and recovery requirements. No particular reduction or relocation was
selected, and no other sessions, rubric scores or runtime activation were approved.
Private source details remain in the ignored review artifact.

Reviewer assignment and heavy-doubles inclusion are complete. Overall policy freeze, remaining scope details, case adjudication and calibration are not complete. The historical baseline report correctly retains the review status at its generation time; it is not rewritten to imply retrospective review. No professional credential, independent clinical validation or blanket approval is claimed by this assignment. This review update changes no runtime code or numerical activation flag.
