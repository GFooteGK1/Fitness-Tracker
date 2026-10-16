# Development baseline: human review observations

## domain-consistent-full-gym-hypertrophy-3x60 — September 27 review

Reviewer: Greg Foote. Source: direct response to the September 27 prescription
suitability question in this programming-quality conversation.
Input SHA256: `758f9cbce305fb9769a2d269dd412e43008ff5e9bb79ae48ce9bbefa9ddeeca0`.
Full output SHA256: `cfb41f6111086f48804511ad0c465d561aa80de999b839526e5dc64952c61ee1`.

Presented: consistent trainee seeking hypertrophy, full gym, 60 minutes each on
Monday through Wednesday, with no assessments or recent training data. Monday:
single-leg hip bridge and dumbbell goblet squat; Tuesday: goblet squat and barbell
floor press; Wednesday: single-leg hip bridge and band row. Each working exercise
has 2 x 6-15 repetitions, 1-3 RIR and 90-180 seconds rest. Six minutes of controlled
first-movement preparation precedes each session. Stop at degraded technique or
when the target muscle no longer limits the movement. Loads and per-side counts
are unspecified. This is a summary of the frozen output, not a new recommendation
or proof that all serialized fields were reviewed.

Greg's response:

> 0, why are we only programming single leg hip bridge when there is a full gym of equipment

**Prescription suitability: 0 — unacceptable.** The explicit failed rating and
objection apply to this dimension and original output. The other five dimensions
remain unreviewed; no specific replacement movement, dose, permission to increase
load or complete-week approval was supplied. Keep the full adjudication record
pending until it can contain all required sourced judgments; preserve this actual
partial rating here without inventing the rest.

The structured ledger now also retains this response with explicit status
`partial`: suitability0, other five scores null. The validator reports one partial
case and zero complete/usable cases; the offline review page displays the same
state. This changes review bookkeeping, not the original baseline or its rating.

Engineering trace: `session-composer.ts` ranks eligible movements using assessment,
preference and familiarity bonuses plus `lowerFatigue`. In this case the three
bonuses are absent. `programming-policy.ts:527` assigns low/moderate/high fatigue
3/2/1. `movement-catalog.ts` tags the bridge low, dumbbell RDL moderate and barbell
RDL high. Equipment gates eligibility; it does not add goal-specific suitability
to the score. Independent selection for each posterior-chain assignment repeats
the same winner. The baseline commit `f123aa8aa848716e894ea7bec340d693995e4b36`
contains the same ranking rule, so this explains the frozen output as well as the
current source. This is not a claim about live athlete prescriptions.

Canonical defect: **Fitness-Tracker-i40.6.3**. Correct goal-conditioned movement
selection and review a separate candidate week; preserve this failed baseline,
bodyweight options where justified, constraints and the numerical-policy gate.

## Earlier review observations

### Full-gym revised week accepted with RPE correction — September 27

Greg reviewed the separate candidate in `hypertrophy-week-revision-1.md` and said:

> let's make sure we have RPE targets with our sets as well otherwise this look good

Record qualitative acceptance of that complete revised example with explicit
RPE targets requested beside the sets. The correction adds a target column for
every working exercise: loaded hypertrophy sets7–8, Pallof core6–7 with control
priority, and preparation3–4 in the preparation instructions. These are the
assistant's implementation of the requested display, not numbers quoted from
Greg. Targets remain distinct from actual RPE reported for each working set.
Sets/reps/rest and checked timing are unchanged. The original frozen output's
suitability0 and five unreviewed dimensions remain unchanged; this response is
not a numeric rubric score or approval of compiler behavior. Canonical review
child `i40.1.5` is ready to close; selection/catalog defect `i40.6.3` remains open.

These observations supplement the frozen baseline and hash-bound adjudication
ledger. They record actual reviewer feedback without manufacturing six-dimension
scores or approval. A readable session summary is not proof that the reviewer has
examined every field of the complete serialized output. The original artifacts
and sealed holdout remain unchanged.

## domain-new-bodyweight-strength-2x30

Reviewer: Greg Foote. Recorded: 2026-09-26. Source: direct reply in the
programming-quality conversation to the first full-week baseline presentation.

Frozen identity from `development-adjudication.json`:

- Input SHA256: `12a7c8b70f9cb4fe0cfc669e5f36610df6cd38e9cc8b0b81c7ba42cf4a764b22`
- Full output SHA256: `dee9d057307d48dafdb891ada0c7a9f0c98ecb4eb308524e36040b6f3bf66ede`

### Material presented

Synthetic new/returning athlete seeking general strength, bodyweight equipment
only, Monday and Tuesday available for 30 minutes each. No assessments, training
history or restrictions were recorded; missing restrictions are not clearance.

Monday: five-minute hip-bridge preparation, single-leg hip bridge 2 × 3–8,
push-up 2 × 3–8. Tuesday: five-minute lunge preparation, reverse lunge 2 × 3–8.
Working sets target 2–4 RIR with 2–5 minutes rest and stop when position or
repeatable force breaks down. Estimated session times: 27 and 17 minutes.
Unilateral repetitions are not explicitly labeled per leg. This was presented as
historical compiler output for review, not a recommended or accepted program.

### Greg's response

> The warm up should be more prescriptive focusing on helping prepare the body for the working sets. We should include some sort of core work. At bodyweight we should be looking at a higher starting rep point probably 8-15 reps unless assessments say they cant handle that volume yet

Required revisions for this case:

1. Replace vague preparation with explicit warm-up instructions that prepare the
   athlete for the actual working movements. Specific drills, doses and sequencing
   have not yet been reviewed.
2. Include core work. The movement, dose, placement and frequency were not selected.
3. Use approximately 8–15 reps as the proposed starting range for this bodyweight
   work, subject to assessment showing the athlete cannot handle that volume yet.
   Preserve "probably" as a provisional range, not a universal bodyweight minimum.
   Do not invent an assessment result or force eight reps when the applicable
   effort or limitation boundary requires stopping earlier.

Qualitative disposition: **requires revision; not approved as written**. The reply
does not approve unmentioned parts of the plan, the estimated timings, consecutive
day scheduling or unilateral rep semantics. Recalculate session feasibility after
changing warm-up, core work and rep ranges; do not silently shorten rest to fit.

No six-dimension scores were supplied, so the ledger's review remains null and
calibration remains incomplete. This observation is retained separately rather
than lost or counted as a fully scored case. Re-present the revised complete week
for review, preserving the original baseline. This is not a reviewed APEX base week
for P1, and it supplies no numerical runtime activation authority.

### Review of revision 1, 2026-09-26

The separately authored `bodyweight-week-revision-1.md` was presented with one
core set each day and no Tuesday upper-body pull. Greg replied:

> Core work can match the other work in total sets and day two should have an upper body pull

Revision 1 therefore also requires changes. Revision 2 interprets the core-set
request as two per day, matching each main exercise, and adds a Tuesday pulling
requirement. Equipment/anchor availability remains unknown.
Do not assume a safe row or pull-up setup from the frozen `bodyweight` equipment
entry. No overall week approval or rubric scores were supplied.

### Clarification behavior, 2026-09-26

When asked how to resolve the unknown pulling setup, Greg replied:

> We should clarify when not sure

Record the expected product behavior as asking the athlete a targeted question
when an unknown changes the prescription. For this case, clarify available pulling
equipment before selecting the movement. This approves the clarification behavior,
not an equipment assumption or the complete week. Continue independent known work;
do not interpret this as requiring clarification for every incidental uncertainty.
Actual equipment remains unreported, and runtime behavior is not changed here.

### Session time tradeoff, 2026-09-26

Presented hypothetical: pulling equipment has been confirmed, but Tuesday's
warm-up, lunges, pull and core take 35 minutes against a 30-minute limit. Asked
what to reduce first for this beginner's general-strength goal, Greg replied:

> Reduce the core work

Expected decision: reduce core work first in this time-constrained case, preserving
the rest needed for working-set intensity. Matching core sets to other work is
therefore conditional on session feasibility. Greg did not specify the amount to
remove or direct removal of all core work. Recalculate the full session after the
reduction; do not assume it saves the entire five minutes. The 35-minute scenario
and confirmed equipment were hypothetical, not new facts about revision 2.
This is not a universal priority rule for every athlete goal, a complete-week
approval, or a numerical runtime change.

### Revision 3 review and rest visibility, 2026-09-26

Greg reviewed the complete synthetic variant:

> This looks fine but is a very narrow use case are we building up to more complex?

He then added:

> One point for the last session is rest intervals being stated in the plan

Record qualitative acceptance within the explicitly stated narrow assumptions,
with the correction that rest intervals must appear in the session prescription.
Revision 3 now places its existing 2–3-minute strength-set/round intervals beside
each exercise and retains 1–2 minutes between Monday's core sets. It specifies
that a unilateral round includes both legs and that additional recovery may be
needed at side changes and between exercises, including before core. Tuesday has
one core set, so no between-core-set interval applies there.

This makes the existing draft parameters visible; Greg did not supply new numeric
intervals. Preserve rest sufficient for intensity and reduce core first when time
is tight. Timing estimates are unchanged and remain conditional on actual recovery.
No original equipment answer, complete rubric scores, complex-programming validation
or runtime activation follows from this review. Next walkthrough should increase
complexity toward APEX-style history, multiple demands and whole-week adaptation.

### Settled bodyweight-volume principle reaffirmed, 2026-09-27

When asked to numerically score the original beginner week's prescription,
Greg instead reaffirmed the already settled correction:

> We talked about this since the first pass but with bodyweight movements we should be looking at higher rep volume unless we have data showing the athlete cannot handle that volume to start.

Carry forward the higher starting bodyweight-repetition-volume principle, with
an athlete-evidence exception for lower tolerance. The original unqualified
3–8-repetition baseline requires correction; the previously reviewed revised
week remains a separate artifact. Do not ask Greg to repeat this principle or
reinterpret missing tolerance evidence as inability. No new exact range, universal
load progression, numeric rubric severity or complete six-dimension review was
provided in this response. Preserve the full review ledger's pending fields until
the remaining judgments can be faithfully recorded; do not convert repeated
qualitative agreement into fabricated complete scores or runtime authority.
