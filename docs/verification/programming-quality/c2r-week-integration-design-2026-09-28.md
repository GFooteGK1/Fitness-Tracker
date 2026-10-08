# C2-R persisted-week integration boundary

Task `Fitness-Tracker-u5l.6.14`, in progress. This is implementation preparation,
not a trusted review registration. The new synthetic weekly reference is in
`c2r-week-context-review-1.md`; Greg's weekly-context judgment is pending.

## Verified gap

`compileAuthenticatedReviewedSession` fetches and binds owned source data, then
returns the accepted C2-R offline session. That session explicitly says
`persistable:false` and `wholeWeekFitVerified:false`. Its borrowed golden profile
and caller `wholeWeekFit` flag are test scaffolding, not reviewed weekly evidence.

`compileAuthenticatedReviewedWeek` separately compiles a trusted whole-week
recipe. Registration captures that result and immutable execution continuity.
It does not currently reconcile C2-R's before/after dose into that week. The
accepted developmental recipe has different loads and excludes progression;
its human approval cannot authorize a C2-R week by substitution.

The complete-week activity contract also requires numeric rests. The C2-R
preparation correctly retains null as “as needed.” Replacing null with zero or
a fixed number would alter the accepted prescription. Storing a prose cue alone
while the structured fields prescribe zero would be contradictory.

## Proposed implementation contract

Keep the accepted option, preparation recipe and newly reviewed week as separate
hash-bound authorities. A server-only reconciliation step must bind the exact
option to Monday's matching bench activity and the original complete base week.
Retain the full before/after dose, option/review/source hashes and exact session
recipe in the immutable proposal basis. Preserve the original historical
`targetRpe:null`; the newly proposed base-week effort must not rewrite history.
Accepting the week still requires the existing explicit athlete transaction.

Extend qualitative-rest representation losslessly, with separate estimation
allowances and a conditional-fit status. Existing fixed-rest records must retain
their meaning and remain readable. Unknown recovery is neither zero nor a cap.
The display, decoder, duration accounting, saved prescription validation and
database contract must agree before a positive persistence test is claimed.
Inspect SQL validators before choosing the smallest compatible format change;
no migration or historical rewrite is authorized by this preparation artifact.
Record an ADR when the final durable contract is selected.

The new review document proposes complete base/trial weeks that differ only in
Monday working load. Its other facts are explicitly synthetic assumptions.
Source actuals remain 165 lb at RPE7/7/7; 170-lb execution remains absent.
Do not create a trusted positive registration while the new weekly review is
pending. A changed or rejected review must revise the draft, not its source
acceptance history.

## Required verification evidence

| Condition | Required observable result |
|---|---|
| Exact reviewed source, reviewed full context and matching base | One complete candidate with Monday170lb3x6, original preparation, effort/rest, and unchanged surrounding work |
| Missing weekly review, wrong athlete/week, borrowed developmental approval or missing equipment | Explicit review required; no candidate registered |
| Insufficient/noncomparable evidence, missing set RPE or relevant correction | No automatic trial; stale prepared proposal cannot be accepted |
| Irrelevant new evidence | No new dose inference; existing conservative source revision fence may require refresh |
| Source correction after registration | Old immutable proposal retained for history; acceptance rejected against stale source |
| Changed quantity, warm-up, rest meaning or ambiguous target activity | Reconciliation rejects rather than clamping or partially inserting work |
| Successful explicit local acceptance | Saved before/after basis and complete week read back unchanged; actuals stay separate |
| Response loss or duplicate request | Original identities resolve; no duplicate plan, session or workout |

A no-qualification counterfactual must not invent a reviewed “hold” rule merely
to produce a second positive result. Requiring review is an honest outcome when
no alternative option is authorized. A reviewed whole-week candidate also does
not imply held-out W10 coaching quality.

Use existing synthetic local Auth/PostgreSQL and actual Next isolation method
for any new wiring, without resetting retained .12/.13 fixtures. If new actors
are needed, create separately identified local fixtures only within their scope.
No production registry, hosted writes, paid calls or numerical activation.

## Time arithmetic for the proposed review

| Day | Initial preparation | Bench ramp | Working and rehearsal blocks | Between exercises | Setup | Logging | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Monday |414s|447s|1020s|240s|300s|180s|2601s /43:21|
| Wednesday |492s|—|1743s|240s|300s|180s|2955s /49:15|
| Friday |414s|447s|1421s|360s|300s|180s|3122s /52:02|

These totals include proposed recovery estimates, not fixed recovery prescriptions
or measured session durations. The reviewed session's as-needed rest is retained.
