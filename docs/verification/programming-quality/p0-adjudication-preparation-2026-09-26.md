# P0 adjudication preparation

September 27 update: explicit partial reviews are now supported under
`Fitness-Tracker-i40.1.4`. Greg's actual prescription-suitability0 for the original
full-gym hypertrophy week is stored in `development-adjudication.json`, with the
other five scores null and status `partial`. Null means unreviewed in a partial
record; it does not mean usable or not applicable. Partial records never count
as reviewed/usable cases or qualify a calibration reference, even if every score
has been filled. Complete compiled reviews still require all six numeric scores;
the existing blocked-case NA behavior is unchanged. Invalid scores, missing
sources and stale hashes still reject. The frozen baseline/rubric/signal files
are unchanged.12 focused tests pass; the whole P0 package remains open.

Task: `Fitness-Tracker-i40.1.2`. This is engineering preparation for the remaining
P0 review. It does not approve prescriptions or close P0.

The historical 24-case baseline and Greg's six accepted qualitative signal
judgments remain unchanged. `development-adjudication.json` binds a separate
review ledger to the baseline, rubric and accepted-signal record. Each case is
bound to its input and full output, including explanations; the narrower dose
projection cannot conceal a changed output. Text hashes normalize checkout
CRLF to LF so Windows and Linux agree. Escaped newlines inside JSON values remain
part of the original values. All 24 human review fields are initially null.

`scripts/programming-quality-adjudication.ts` validates the roster and hashes,
requires all six score dimensions with sourced rationales, and records calibration
only against reviewed cases. Missing, duplicated, stale or invalid records cannot
count as completed reviews. Completed negative reviews do not become usable
programming. Blocked cases may have not-applicable dimensions but never count as
usable compiled weeks. This validator cannot authenticate a reviewer or establish
professional qualification; decision sources must be actual user reviews, never
fabricated by the generator or copied from the synthetic validator tests.

## Review material

Run `node scripts/programming-quality-review-packet.mjs` to create
`output/programming-quality-review/development-review.html`. This offline page
shows all 24 frozen inputs, contexts and complete outputs in expandable cards.
It has no JavaScript, network calls, answer storage or holdout access. Record
Greg's actual responses in the ledger with the source of each decision.

The separate numerical-policy C1 question was answered on September 26: two recent complete bench
3 x 6 at 165 lb exposures, same variation, 180-second rests, 2-3 RIR, unchanged
week and no contrary report. Greg favors goal-dependent progression and a load
increase for an APEX-style strength goal. Exact increments and achieved effort
remain unresolved; no universal two-exposure/28-day rule was approved. See the
source quote and scope in `policy-review-round-1.md`. This separate judgment does
not fill the 24-case baseline ledger or repeat the six accepted signal judgments.

Greg also reviewed C1-F (failure instead of the intended reserve): investigate
wider context, provisionally keep the load, use six as a minimum target while
working to actual 2–3 RIR, and use consistent higher reps at that effort to support
a later load increase. Greg confirmed that reaching 2–3 RIR before six reps means
stop and record the missed rep target; effort takes priority. No increment, upper
rep limit or fixed consistency count was supplied.

C7/R3 scope review is also complete: Greg confirms heavy doubles are appropriate
and included in the first supported strength-programming scope. Preserve 4 × 2
rather than clamping to triples. Concrete load, effort and applicability limits
remain pending; no baseline score or runtime activation is inferred.

C4's added-bench-day branch was reviewed: the decision depends on the goal, and
Greg favors more bench work for this test-preparation case. The amount and weekly
distribution are unresolved; neither a full duplicate session nor double volume
was approved. The outside-training branch was subsequently reviewed: clarify the
added classes' movements, intensity and schedule, then adjust overlapping work
while preserving goal-priority training. Exact adjustments remain unspecified.

C5 was reviewed: ask RPE for each working set first when effort and rest were not
logged. Set rest periods to support maintaining intended intensity across working
sets. Greg favors considering more reps or load when work is easy. Exact rest
durations and numerical limits remain unspecified; retain the prior 2–3 RIR stop
rule and do not substitute whole-session effort or invent missing historical rest.

C6 was reviewed: use supporting variation-conversion data where applicable;
otherwise request assessment of the prescribed movement. If a limitation prevents
assessment, adapt to the athlete's capabilities and pain/injury constraints. No
specific conversion, assessment protocol or alternative prescription was approved.

## Remaining completion gates

The first full-week presentation, `domain-new-bodyweight-strength-2x30`, now has
[qualitative reviewer feedback](development-review-decisions.md): more specific
working-movement preparation, core work, and a provisional 8–15-rep bodyweight
starting range unless assessment indicates lower tolerance. It requires revision.
No complete rubric scores or revised-week approval were supplied; the ledger
remains pending. Preserve this feedback separately from fully scored reviews.

Task `i40.1.3` first produced a separate
[revised complete-week draft](bodyweight-week-revision-1.md), subsequently reviewed
by Greg as described below. Its upper-budget arithmetic was 26:20 Monday and 19:50 Tuesday, including
warm-up, rest, side changes and transitions; these are estimates, not observed
completion times. The draft is assistant-authored, not a new compiler run.

Subsequent review requires matching core sets to other work and a Tuesday upper
pull. [Revision 2](bodyweight-week-revision-2.md) records two core sets as the draft
interpretation. Greg subsequently specified "We should clarify when not sure":
ask the athlete about missing equipment before selecting the pull. The desired
clarification behavior is reviewed; actual equipment remains unknown. Revision 1
is historical; neither complete week is approved. Recalculate Tuesday once the
pull and its specific preparation are selected. Runtime clarification has not
been implemented by these review records.

[Revision 3](bodyweight-week-revision-3.md) now presents a complete separate
synthetic variant, explicitly assuming a confirmed suspension trainer. It does
not resolve the original input's unknown equipment. Tuesday gains rows and their
specific preparation, with core reduced to one set. Estimated totals are 29:40
Monday and 27:20 Tuesday; Monday can reduce core to one set for 26:20. These are
checked arithmetic assumptions, not measured durations or reviewer approval.
Greg subsequently said the narrow example looks fine and requested rest intervals
in the plan. Those existing draft intervals now appear beside each exercise;
no rubric scores are filled. The next complex review is a private historical
APEX-derived week at ignored `output/programming-quality-review/apex-week-review-1.md`.
It starts with an explicit session-time tradeoff and is not yet an executable,
approved base week. Personal source material stays outside tracked fixtures.

The nine synthetic cases in [complex review cases](complex-review-cases.md) now
have qualitative responses, including final-event-week sequencing. This closes
that discussion round only. Consolidate the applicable decisions into a complete
candidate week with explicit rest, timing and proposed numeric choices; do not
mix development, maintenance failure and event-ready phases in one case. Whole-week
review and six-dimension scoring remain pending. Keep the sealed holdout untouched.

Subsequent integrated review: Greg replied "Looks good" to the complete
[event-week candidate](event-week-candidate-1.md), accepting the presented week
within its synthetic assumptions. This resolves that example's qualitative
coaching review; no six-dimension scores were provided. Retain it as a reviewed
development example without changing the frozen baseline ledger. Generated/saved
program verification, calibration and P1's suitable continuity base remain open.

P0 still requires actual baseline labels, calibration and a suitable reviewed
base week for P1. Separately prepared sealed scenario inputs do not become
executable P5 evaluations until their product-entrypoint adapters, qualified
labels and declared support scope are ready. The full P5 gate also needs blind
comparative output review; neither engineering tests nor schema validity supplies
that evidence. Keep P0/P2 parent status and numerical policy gates truthful.

Continuation audit: child `i40.1.3` is complete within its stated revision/review
scope. Revision3 supplies the requested preparation, pull, core, per-side counts,
effort/rest and conditional timing; Greg's response and rest-visibility correction
are recorded. Arithmetic remains29:40 Monday,27:20 Tuesday and26:20 with reduced
Monday core. No actual six-dimension scores were supplied, so none are recorded.
Closing this child does not resolve the original scenario's equipment question,
make the assistant-authored variant compiler output, or close P0/P1 acceptance.

Board onboarding is explicitly deferred until the broader work is finished.

## Completed engineering preparation

The independent preparer sealed 16 synthetic scenario inputs in eight two-step
trajectories. The public [manifest](holdout-v1-manifest.json) and
[receipt](holdout-preparer-receipt.md) record schema, grouping and authenticated
integrity checks. The implementing agent and independent code reviewer inspected
only these public artifacts, not the payload or key. This is procedural separation
within the same local account, not an access-isolated vault.

The historical baseline/rubric remains frozen. Its statement that holdout inputs
had not yet been authored describes that earlier checkpoint; this dated receipt
supersedes that preparation status without altering the rubric or baseline hashes.

Nine focused validator tests passed, along with TypeScript and focused ESLint.
Independent review found no material defects, reran all nine tests, and recomputed
the public schema and five source hashes successfully. The renderer passed syntax
checking and generated the complete 24-case offline packet. All complete numerical
rubric records and calibration remain pending; the first qualitative full-week
review is now recorded above. Engineering child `i40.1.2` is complete; P0 is not.
