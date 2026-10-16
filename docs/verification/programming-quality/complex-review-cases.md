# Complex programming review cases

Prepared 2026-09-26. Synthetic development discussion cases, not facts about Greg,
blind evaluation labels or generated executable programs. Record actual replies
before treating any proposed response as reviewed. Keep the frozen baseline and
sealed holdout unchanged.

## X1 — Shift emphasis across competing outcomes

Status: reviewed qualitatively. Relevant tasks:
`Fitness-Tracker-i40.4` (whole-week strategy), `Fitness-Tracker-i40.5` (policy).

Scenario: an athlete training for a combined strength-and-running event has
improving bench and trap-bar performance, but mile performance has remained flat
across six weeks of comparable observations. Prescribed running was completed
consistently, no new limitation is reported, and the mile is the largest remaining
gap against the athlete's agreed event targets. Both strength and running still
matter. Weekly training availability is unchanged. Six weeks is a fact of this
synthetic scenario, not an approved universal plateau threshold. No single sensor
reading, inferred missed session or calendar tick establishes this comparison.

Proposed response for review: investigate what is limiting running progress, then
consider shifting some weekly training time toward the identified running need
while retaining enough strength work to protect its progress. Do not assume the
answer is automatically harder intervals or additional total training time.

Question: would you shift emphasis toward running while maintaining strength,
or keep the current allocation and first change the running sessions themselves?

Greg's response:

> Adjust the running training within the existing allocation

Expected decision: first adjust the running training within its existing weekly
allocation. Do not shift time away from strength or increase total training time
as the default response to this case. The earlier proposed shift of emphasis was
not selected. No specific running dose, interval change or diagnosis was supplied,
and this does not prohibit a later allocation change supported by new evidence.
A resulting week still needs a concrete prescription, full time accounting and
acceptance; runtime and numerical flags are unchanged.

## X2 — Choose the running adjustment

Status: reviewed qualitatively; exact interval dose pending. Relevant tasks:
`Fitness-Tracker-i40.5` (policy), `Fitness-Tracker-i40.6` (adaptation).

Synthetic extension of X1, not additional facts about Greg: current mile is 6:40
against a 6:00 goal. The current running allocation contains one interval session
and one 30-minute easy run each week. The interval session is 5 × 400 m in 100
seconds, with 2 minutes walking/easy jogging between repetitions. Across recent
comparable sessions all five splits are consistent and reported rep effort is
RPE 7–8. Mile performance remains unchanged. No new limitation is reported.
The unchanged allocation includes warm-up, cooldown and recovery time; do not
quietly exceed it or subtract necessary preparation to fit a proposed change.

Question: what would you change first in the running training, or what missing
evidence would determine the change? No preferred numerical answer is supplied.
The scenario establishes no causal diagnosis, equivalence between shorter-repeat
performance and mile readiness, or universal progression threshold. Record the
reviewer's actual decision before turning it into a policy candidate.

Greg's response:

> I think we look at decreasing volume but increase target pace to help get closer to the feeling of the goal pace. If needed extend the rest to 3 minutes so the focus can be on a faster pace across each interval

Expected decision: reduce interval volume and target faster running to develop
familiarity with a pace closer to the goal. Extend between-interval recovery from
the presented two minutes to three minutes if needed to sustain the faster pace
across repetitions. Preserve X1's existing running allocation and account for
longer recovery in the session budget.

This is an explicitly coordinated change of volume, pace and, conditionally,
rest for this case. Do not reject it by mechanically applying a one-variable
routine-progression heuristic, or generalize it to every progression decision.
Greg did not specify how much volume to remove, whether to change rep count or
distance, or an exact target split. Do not invent those numbers or assume immediate
full goal pace. The response does not shorten the separate easy run, diagnose the
cause of the plateau, or establish mile readiness from interval performance.
Record actual splits and effort under the changed rest/dose; do not pool the
old and new sessions as an unchanged comparison protocol. Runtime remains disabled
for this unimplemented numerical policy.

## X3 — Return after a confirmed training interruption

Status: reviewed qualitatively; load-reduction amount unspecified. Relevant tasks:
`Fitness-Tracker-i40.5` (policy), `Fitness-Tracker-i40.6` (adaptation).

Synthetic scenario, not Greg's training history: an athlete previously completed
bench press 3 × 6 at 165 lb, reporting 2–3 reps in reserve on each working set.
They explicitly confirm three weeks without strength training because of travel.
They report no illness, injury or current pain, and the strength goal is unchanged.
No return-session warm-up or working-set response is available yet. This is a
confirmed interruption, not an inference from absent logs; three weeks is not
being proposed as a universal detraining threshold.

Question: how would you set the first session back, and what would determine
whether the prior load and volume are appropriate? No automatic percentage
reduction, lost-capacity claim or max test is implied. Preserve prior evidence
while collecting the current response, and record the actual reviewer answer.

Greg's response:

> They should be good to pick up where they left off but if it feels like they can’t keep smooth movement then they should decrease the load

Expected decision: resume the previous load and volume for the presented
travel-only interruption, using current movement quality to guide execution.
If the athlete cannot maintain smooth movement, decrease the load. Do not impose
an automatic reduction solely because three weeks elapsed. Preserve the stated
effort target and earlier stop rules; this response does not require forcing reps
through deteriorating control or reaching failure to justify a change.

No reduction amount, velocity threshold or permanent loss of capacity was supplied.
Smooth movement is an athlete-reported execution criterion, not a fabricated
sensor metric. Do not generalize this case to illness, injury, new pain or every
break duration. Record actual load, reps, set effort and the reason for any
adjustment. Runtime and numerical activation remain unchanged.

## X4 — Change emphasis after strength targets are achieved

Status: maintenance role reviewed; concrete prescription pending. Relevant tasks:
`Fitness-Tracker-i40.4` (whole-week strategy), `Fitness-Tracker-i40.5` (policy).

Synthetic contrast with X1: the athlete has now met both agreed bench and trap-bar
event targets on comparable assessments. The mile remains below its target. Weekly
availability is unchanged, and the athlete still wants to preserve strength while
improving running. No event date, maintenance dose or new recovery capacity is
assumed. Goal attainment is established in this scenario, rather than inferred
from improvement alone or a single proxy signal.

Question: how should the role of strength work change now that its targets are
met, while running remains the unresolved goal? In particular, should the planner
move strength toward maintenance and make more room for running, or retain the
current allocation? This is a distinct decision from X1's unmet strength goals.

Greg's response:

> Yes strength moves into maintenance

Expected decision: transition strength from further development to maintenance
in this scenario where its agreed targets are achieved and running remains an
unmet goal. Preserve the achieved strength outcome as an explicit objective;
maintenance does not mean deleting strength work or monitoring. This differs
from X1, where improvement alone did not justify reallocating strength time.
The response does not specify sets, frequency, load, monitoring cadence or an
amount of time to transfer to running. It does not establish a universal maintenance
dose or approve runtime activation. Record the role decision without inventing
those details.

## X5 — Make strength maintenance concrete

Status: reviewed qualitatively; exact set reductions and intensity pending. Relevant tasks:
`Fitness-Tracker-i40.5` (policy), `Fitness-Tracker-i40.6` (adaptation).

Continue X4's synthetic scenario: strength targets are met, the athlete wants to
retain them, and the running target remains unmet. The maintenance role is settled.
Question: what would you reduce first in the strength prescription—working sets,
weekly frequency or load—and what evidence would determine that choice?

No specific numerical change or preferred answer is supplied. The resulting
prescription must retain explicit effort/rest and identify how preservation of
the achieved strength outcome will be checked. Do not assume maintenance changes
a fixed monitoring protocol, guarantees retained performance or frees a particular
amount of time until the actual revised week is calculated and reviewed.

Greg's response:

> Reduce working sets but keep intensity high and we should only have to adjust deadlift and other leg exercises to make room for running. Combing the upper body lift with running should be okay overall

Expected decision: reduce working-set count while keeping intensity high for the
strength maintenance work. Focus the reductions needed to accommodate running on
deadlift and other leg exercises; do not apply a blanket cut to upper-body work.
Upper-body lifting can be combined with running in this scenario. Retain explicit
strength-maintenance objectives and check the combined session's time and demands.

No exact set count, percentage load, RPE threshold, session order or recovery
interval between the two activities was selected. High intensity does not itself
mean failure, grinding repetitions or overriding movement-control limits. The
reply does not require frequency reductions or changes to fixed monitoring sets.
The expected compatibility of upper-body lifting and running is contextual, not
a guarantee that every pairing fits every athlete. Record actual response before
claiming maintained strength or adequate recovery. Runtime is unchanged.

## X6 — Order a combined upper-body and running session

Status: reviewed qualitatively. Relevant tasks:
`Fitness-Tracker-i40.4` (whole-week strategy), `Fitness-Tracker-i40.5` (policy).

Continue the synthetic maintenance scenario. Bench strength is at its target,
running is the development priority, and the athlete has one shared training
window for bench maintenance and the week's key faster running intervals.
Combining upper-body work and running is already accepted; the order is not.
Each activity still requires its own preparation and recovery. This case is
about a quality interval session, not an easy recovery run.

Question: would you put the running intervals before bench maintenance to
prioritize their quality, or use a different order? Record the actual response;
do not infer the same order for easy runs, strength-priority phases, or fixed
monitoring protocols whose comparability depends on exercise order.

Greg's response:

> Yes running first

Expected decision: put the key faster running intervals before bench maintenance
in the presented shared training window, where running is the development
priority. Preserve preparation and required recovery for each activity and count
the transition in the session budget. This sets order, not a numerical recovery
interval or a universal rule for all combined sessions. If monitoring follows a
changed preceding activity, retain that context and do not silently pool it with
fresh-state measurements. Runtime and numerical activation remain unchanged.

## X7 — Strength target no longer maintained

Status: reviewed qualitatively; session dose and limiting factor pending. Relevant tasks:
`Fitness-Tracker-i40.4` (whole-week strategy), `Fitness-Tracker-i40.6` (adaptation).

Synthetic continuation: after reducing lower-body working sets and emphasizing
running, mile performance improves, but the athlete now falls short of the
previously achieved deadlift target on repeated comparable assessments. They
have completed the planned maintenance work. Assessment variation, preparation,
rest and placement relative to running are comparable. No new pain or illness
is reported. This is a repeated direct performance finding, not one low velocity
reading; it does not by itself prove that reduced set count caused the decline.
Both event targets still matter and weekly availability is unchanged.

Question: how would you adjust the week to recover the strength target while
preserving running progress? Greg may identify additional deciding evidence;
no automatic restoration of all prior sets, running reduction, numerical decline
threshold or causal diagnosis is supplied as the expected answer.

Greg's response:

> Let’s start by subbing a bench session for another deadlift session. If it’s a strength issue then we need to keep the weight heavy and reps low. If it’s a stamina issue then we can use this second session to build endurance

Expected decision: replace one bench session with an additional deadlift session
as the first proposed weekly adjustment. Determine the limiting factor before
choosing the session's prescription: heavy weight and low reps for a strength
shortfall, or endurance-oriented work for a stamina shortfall. The target miss
alone does not establish which branch applies. This is a session substitution,
not an automatic extra training day or removal of all bench work.

Keep the remaining bench maintenance outcome visible and reassess the revised
week's lower-body demands alongside running. X5's earlier preference for leg-only
reductions does not prohibit this newly chosen bench/deadlift tradeoff after
maintenance fails. Greg's "start" identifies a first adjustment, not a proven
solution. Exact loading, reps, sets, rest, session placement and evidence for the
strength/stamina distinction remain unspecified. Preserve the distinction between
fixed monitoring and working sets; no change to a measurement protocol, whole-week
score, causal diagnosis or runtime activation is inferred.

## X8 — Prescribe the stamina-focused second deadlift session

Status: reviewed qualitatively; numerical volume and rest pending. Relevant tasks:
`Fitness-Tracker-i40.5` (policy), `Fitness-Tracker-i40.6` (adaptation).

Synthetic branch of X7: for this review, suppose comparable set-level evidence
supports a stamina limitation at the event's required load rather than inability
to move that load. Early repetitions are controlled, but the athlete cannot yet
sustain the required repetition count. That description alone is not offered as
a universal diagnostic rule. The first deadlift session retains its strength
role; the substituted second session is intended to develop endurance.

Question: would you build longer sets with a lighter load, accumulate more quality
repetitions at the event load in shorter sets, or choose another approach?
Record the reviewer's choice and context before assigning a numerical dose.
Effort, rest, total work and interaction with running still need explicit handling;
do not assume endurance work requires failure or assign rest before review.

Greg's response:

> More quality reps at test load and shrink the rest periods between sets to help build the volume capacity

Expected decision: accumulate more quality working repetitions at the test load
and shorten between-set rest to develop volume capacity in the second,
stamina-focused deadlift session. A lighter-load endurance session was not chosen
for this case. Preserve the first session's strength focus and the distinction
between these training sets and fixed monitoring sets.

The shorter recovery is an intentional training variable here, not permission to
force deteriorating repetitions. Reconcile it with the previously reviewed effort
and movement-quality limits. Exact set/repetition totals, rest duration, reduction
steps and progression criteria were not supplied. Do not automatically reduce
rest every week or change a fixed test/monitoring protocol. Record the actual
load, reps, rest and set effort so work performed under different rest conditions
is not treated as an unchanged comparison. This records intended coaching behavior,
not proof of effectiveness, a universal endurance rule or runtime activation.

## X9 — Final week before the event

Status: final-week sequence reviewed; exact doses/durations pending. Relevant tasks:
`Fitness-Tracker-i40.4` (whole-week strategy), `Fitness-Tracker-i40.5` (policy).

Synthetic scenario: a combined strength-and-running event is seven days away.
The athlete has demonstrated all agreed targets in recent comparable assessments,
reports normal recovery and no new pain or illness, and has an established training
week. The event date is confirmed for this example; it is not Greg's actual date.
Individual test readiness does not prove performance across the full event order.

Question: what should the final week's training retain, reduce or omit so the
athlete arrives ready to perform? No numerical taper, automatic full rest week,
extra maximal rehearsal or last-minute training increase is proposed as an
approved answer. Record the actual decision and any information needed to tailor it.

Greg's response:

> The day prior should be a shake out prehab, technique, and dynamic stretching. 2 days out is a rest day. 3 days out RPE 3 or 4 steady state. Days 4-7 prior normal training with reduced volume

Expected sequence, relative to confirmed event day D0:

| Offset | Reviewed intent |
| --- | --- |
| D-7 through D-4 | Normal scheduled training with reduced volume. |
| D-3 | Steady-state work at RPE 3–4. |
| D-2 | Rest day. |
| D-1 | Shakeout with prehab, technique and dynamic stretching. |
| D0 | Event; no event-day warm-up prescription was selected in this reply. |

Days D-7 through D-4 retain the established schedule; this does not require four
consecutive training days or replacing existing rest days with workouts. Exact
volume reduction, exercise selection, steady-state mode/duration and shakeout
duration/drills remain unspecified. The RPE 3–4 target applies to D-3 steady-state
work, not every session or strength set that week. Do not infer an intensity cut
for D-7 through D-4, maximal last-minute testing, or an injury treatment protocol
from the word prehab. Preserve confirmed constraints and actual symptom context.
This is the reviewed sequence for the presented event-ready scenario, not a
universal taper or proof that the athlete will perform all targets at the event.

## Round checkpoint and next integration review

X1–X9 now have actual qualitative reviewer responses. This completes this round
of complex-case judgments, not numerical policy freeze, P0 calibration or the
broader programming plan. No additional scenario is automatically appended here.

Next: consolidate these decisions into a complete executable candidate week with
explicit source/assumption labels, exercises, working and monitoring sets, effort,
rest, session order and time accounting. Select the relevant phase and conditions;
do not stack the target-unmet, target-met, maintenance-failed and event-ready
branches into the same athlete week. Mark proposed numerical choices for review
without attributing them to Greg, and reconcile them with existing policy research.
Then obtain whole-week adjudication before populating any six-dimension score
record. The frozen baseline and sealed holdout remain unchanged; runtime and
numerical activation are not modified by this document.
