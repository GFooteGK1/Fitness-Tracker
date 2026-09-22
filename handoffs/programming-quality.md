# SociusFit programming quality — current handoff

Updated: 2026-09-22. Project: Fitness-Tracker/SociusFit. Status: active, partial implementation.
Objective: execute the accepted evidence-conditioned programming QPlan.
Tracker: `Fitness-Tracker-i40`; Beads owns package status and dependencies.

## Current state and next action

The saved implementation is committed and pushed on `codex/programming-quality`;
[draft PR #84](https://github.com/GFooteGK1/Fitness-Tracker/pull/84) is open.
The inherited date-fixture defect is fixed in `4c649ef` and `i40.10` is closed.
Full regression now passes: **3,460 passed, 19 skipped**; the 14 focused boundary
tests include SQL timezones spanning the UTC date boundary. Full TypeScript and
focused lint passed; the preceding production build remains applicable because
this continuation changes only fixtures, browser tests and release documents.

Four new mobile Chromium tests passed at 320/390px, with light/dark screenshots
inspected. See [mobile evidence](../docs/verification/programming-quality/mobile-release-verification.md).
The [release runbook and schema readback](../docs/verification/programming-quality/release-preflight.md)
are prepared, including two executable local metadata-query checks. These do not
establish hosted database state, real multi-session contention, or a rehearsed
cutover/rollback. `Fitness-Tracker-i40.11` tracks the remaining release work.

Fresh Vercel readback confirms production still serves `f123aa8` and Preview shares
the production Supabase URL variable. No canary app was found in the verified
scope. Supabase remains on sign-in; Greg was asked to sign in and identify a
separate canary app/database. Complete target metadata/recovery verification and
isolated rehearsal before proposing production promotion. The draft PR does not
authorize merge, production migration, numerical activation or deployment.
See the original [save receipt](../docs/verification/programming-quality/save-and-release-readiness.md)
for the earlier checkpoint; its failed-test count is historical.

The two explicitly approved signal fixes are implemented locally:
`Fitness-Tracker-i40.6.1` and `Fitness-Tracker-i40.6.2`. See
[implementation receipt](../docs/verification/programming-quality/signal-review-fixes.md)
and [ADR-0027](../docs/decisions/ADR-0027-signal-facts-before-prescription-changes.md).
Weekly review `weekly-review-0.4.0` keeps accepted prescriptions when outcomes
improve, without overriding existing safety/recovery decisions. Source-linked
readings, explicit/unknown sensor counts and associated working records reach
saved rationale and shared readback as factual companion context. They do not
change numerical evaluator thresholds or supply physiological reconciliation.
The combined 338-test/19-file run passed; final edge fixes passed 54 focused
checks, full TypeScript and lint. Independent review findings were addressed.
No flags, hosted migrations, deployment or live athlete data changed in that slice.

The six agreed responses now have an executable development gap evaluation under
`Fitness-Tracker-i40.1.1`: [criteria, results and gap map](../docs/verification/programming-quality/reviewed-signals-evaluation.md).
Eighteen narrow checks yield 9 pass, 2 fail, 7 not observed; none is an overall
coaching pass. This pre-fix historical downstream evaluation observed direct improvement mapping to
collect-signal with two matching assignments, and confirmed schedule replacement
compiling the requested days with equal projected prescriptions for that fixture.
The old ordinary-continuation blocker is not the only current schedule path.
Its two bounded follow-ups are now implemented as described above. Remaining work
includes reviewed physiological interpretation/completeness rules, a justified
numerical-change producer and independently disclosed schedule/prescription
differences. Keep those in existing P4 and P1/P3 scope; baseline/holdout calibration
and package acceptance requirements remain outstanding. Full P4 is not complete.

P3 preparation is complete under `Fitness-Tracker-i40.4.1`: see
[whole-week strategy design](../docs/plans/whole-week-strategy-design.md) and its
[verification receipt](../docs/verification/programming-quality/p3-strategy-preparation.md).
This continuation added proposed contracts, 20 synthetic development scenario
specifications and 25 passing artifact-integrity checks; no application runtime
changed in this continuation. Independent review resolved outside-work interval/
coverage and candidate-scope gaps. P3 candidates currently specify rearrangements
of the same obligation set; mixed-bundle alternatives need a later contract extension.
Greg has now agreed to all six qualitative coaching responses in the phone-readable
review; see [recorded decisions](../docs/verification/programming-quality/signal-review-decisions.md).
Do not ask him to repeat those judgments. Remaining P0 baseline adjudication/
calibration and sealed holdout work, plus P2 acceptance, precede dependent
P3 runtime implementation. Do not treat design readiness or passing fixture tests
as coaching adjudication, numerical-policy approval, or P3 completion.

The local baseline, selected evidence projection, read-only purpose retrieval tool
and factual performed-work integration are implemented. The persisted rolling-week
decision now has shared readback in runtime/chat, weekly GET and Program details.
Saved controls bind to its review/proposal identities. Confirmed active event
dates reject conflicting direction dates, including after replacement intent
refresh. Greg volunteered as the
reviewer on 2026-09-21; reviewer assignment is resolved. His six-case qualitative
review is now recorded; statistical-method and numerical applicability questions
remain distinct. Use the existing research reconciliation for those questions.
The initial-dose review packet is a
separate, later decision. P2's local evidence gaps are now implemented; P0
adjudication and final package acceptance remain outstanding.
`Fitness-Tracker-i40.3.1` now implements the local transactional source/intent
mutation guard. `Fitness-Tracker-i40.3.2` now reconciles changed
intent/availability with an explicitly confirmed proposed direction without replacing the accepted
profile snapshot or refreshing an old review's revision. The remaining P2 audit
(`i40.3.3`) repaired accepted-origin readback, silent memory overflow, foreign
execution exclusion IDs and the targeted review request contract. P2 is still
open for its P0 dependency and final acceptance. `i40.3.4` now preserves field
provenance and explicit exclusions; `i40.3.5` adds deliberate older performed-history
retrieval/session effort; `i40.3.6` resolves confirmed-outcome evidence selectors.
See the latest completion receipt before claiming P2 complete or starting
dependent P3 implementation. P1 numerical continuity depends on `Fitness-Tracker-qsp`
and `u5l.6`. Volunteering is not policy approval. Do not repeat reviewer-assignment
or plan-acceptance questions.

Workspace: `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/programming-quality`.
Branch: `codex/programming-quality`, based on freshly fetched `origin/main` at `f123aa8aa848716e894ea7bec340d693995e4b36`.
The accumulated changes are committed and pushed in draft PR #84; inspect its
current head for the final candidate identity. Root and other dirty worktrees
were preserved. No hosted migration or production deployment is included.

## Read first

- [Accepted QPlan](../docs/plans/coaching-programming-quality.md)
- [ADR-0022](../docs/decisions/ADR-0022-evidence-conditioned-coaching-proposals.md)
- [Baseline and review rubric](../docs/verification/programming-quality/baseline-and-rubric.md)
- [Signal-analysis reconciliation](../docs/verification/programming-quality/signal-analysis-reconciliation.md): Greg recalled the existing research; review its evidence-to-action methods first. The initial-dose two-exposure/28-day proposal is separate and is not a general adaptation rule. Do not ask Greg to invent signal-analysis methods already researched.

## Delivered boundaries

`app/lib/coach/evidence-reasoning-context.ts` projects existing selected evidence into a versioned, owned, read-only packet. Whole memories/baselines/series survive intact or have an explicit budget omission. Samples retain actual values, units, ordinals, timestamps, protocol, source verification and comparison modifiers. Socius consumes this projection when its existing programming context path provides evidence. Unselected legacy facts are not restored alongside a packet.

The default general-coaching packet remains 28 days. `get_coach_evidence` now
offers five existing validated purposes with their bounded windows; accepted
sessions remain in `get_coach_state`. Behind the existing history capability,
Socius also receives factual work from the shared planning-history reader with
exact/bounded/unknown quantities, literal weight text, effort and provenance.
Neither addition chooses a future dose. The shared persisted decision projection
now reuses `coach_weekly_reviews` and linked proposals, preserving evidence summary,
snapshot reference, exclusions and bounded rationale. It checks included-source
validity and accepted-base identity; it does not reconcile all newer athlete
context. Fixed monitoring sets and broader whole-week strategy remain future work.
The revision continuation now fences source mutations during proposal creation
and first acceptance, with stale readback/control recovery. P2 remains in progress. See
[decision readback and freshness](../docs/verification/programming-quality/decision-readback-and-freshness.md).

Current-intent reconciliation is now implemented for supported goal, event,
schedule, equipment and constraint changes. Canonical intent controls outcomes;
the accepted profile remains the basis for reviewing performed work. Changed
direction requires setup acknowledgement and separate proposal acceptance.
Unsupported/free-text constraints remain explicit blockers. Saving setup starts
a fresh revision-bound review; blocked or mismatched live reviews cannot expose
an older pending proposal. Event removal clears its direction target while the
internal outcome retains a valid planning horizon. See
[direction reconciliation](../docs/verification/programming-quality/direction-reconciliation.md)
and [ADR-0024](../docs/decisions/ADR-0024-explicit-training-direction-reconciliation.md).

The shared context now follows the accepted proposal to its originating prior-base
review as historical `acceptedOrigin`. Chat and Program retain why the accepted
week was chosen without reusing it as a current recommendation or action. Later
source corrections remain labeled. The targeted review path now uses a validated
broad request and derives exact outcome scope without relaxing existing policy.
See the [P2 audit](../docs/verification/programming-quality/p2-acceptance-audit.md)
and [ADR-0025](../docs/decisions/ADR-0025-accepted-week-decision-origin.md).

Selector algorithm 0.4.0 now retains value provenance and a bounded owned exclusion
ledger with visible overflow and malformed-record omissions. Confirmed outcome
IDs use exact measurement/protocol/binding matches while retaining semantic roles;
the adaptation evaluator still requires direct evidence. A read-only performed-work
tool deliberately widens retrieval to at most 180 days, with passive defaults at
28 days and unchanged record/projection limits. Session RPE retains provenance
and is never assigned to sets. See
[P2 evidence completion](../docs/verification/programming-quality/p2-evidence-completion.md)
and [ADR-0026](../docs/decisions/ADR-0026-bounded-evidence-retrieval-fidelity.md).

Six synthetic signal cases now execute existing evaluators and compiler paths.
They expose missing sensor count sensitivity, unreconciled mixed VBT/work signals,
protocol filtering and schedule-only limitations. Harness-only VBT diagnostics
are explicitly distinct from product eligibility. Frozen trace labels remain
historical pending values; the subsequent six qualitative agreements and fresh
evaluation have separate records linked above.
Independent review found no material issue and ran the seven case tests. Preserve
the original 24-case baseline as a historical snapshot; its source hashes predate
the new shared-reader refactor and must not be silently refreshed.

The offline baseline runs pure compiler/history entrypoints with 24 visible synthetic cases across 19 families, complete inputs/outputs and source fingerprints. Twenty compile and four return explicit blockers. Its passing tests characterize behavior; all qualified coaching scores remain unassigned. The sixteen future holdout cases are reserved but not authored or sealed. No real athlete data, model calls, database calls or paid inference were used.

## Verification and environment

Final verification on 2026-09-21: 594 tests across 36 context, prompt, tool,
history, selector, planning, API, UI, database and review-harness files passed. Full TypeScript,
focused ESLint and whitespace validation passed. Latest evidence-gap work had
independent history/tool review (40 tests), provenance/exclusion review (82 tests)
and selector/evaluator review (52 tests), with no unresolved blocker. The final
legacy-baseline selector boundary has its own regression and review. Independent accepted-origin review
ran 148 tests across five files; another review ran 80 projection/readback tests.
The 66 focused evidence tests cover ownership and memory overflow. Independent review of current
direction reconciliation found no remaining production blocker and independently
ran 71 tests across 3 helper/evaluator/compiler files. Independent review of the revision
slice ran 84 tests; 15 executable PGlite tests cover transactional outcomes and
RLS/ACL, not real multi-session contention. See the
[revision receipt](../docs/verification/programming-quality/proposal-context-revisions.md).
The prior readback slice independently ran 96 tests and verified resolution of two
integration findings: mismatched review identities and event-date validation before
intent refresh. Separate trace review previously ran seven tests and found no
material discrepancy. These checks are synthetic/mocked and
do not establish live RLS or model/physiological quality. See the
[implementation receipt](../docs/verification/programming-quality/implementation-receipt.md).

The expanded baseline demonstrates an additional eligibility concern: changing a Back Squat assessment variation to Box squat to parallel preserves its anchors. It is captured in `i40.6`; do not infer variation equivalence or modify accepted historical plans while resolving it.

Use `node node_modules/vitest/vitest.mjs run --root . <test paths>` and `node node_modules/typescript/bin/tsc --noEmit --incremental false` here. `node_modules` is a junction to the existing release worktree's installed dependencies. Both lockfiles have SHA256 `B2419B0C94C73FD48FA9FD7EBB77FC99C0D19E77D590570147816DE28E8B3B0A`. No dependency install/change occurred. The older root dependency tree is incomplete for this checkout. Its initially generated Vitest cache was preserved under `.next/validation-node-cache`.

The environment issue was resolved on attempt 3; see [investigation](investigations/programming-quality-validation.md). There is no unresolved retry blocker.

## Authority and remaining evidence

New migration: `supabase/migrations/20260921010000_coach_proposal_context_revision.sql`.
Apply before deploying the new revision-dependent routes, only under separate
target-specific authority. It uses a dedicated per-athlete source counter and
NOWAIT shared assertion, preserves existing source guards, accepted JSON and
accepted replay, and permits stale-review successors/pending-window cleanup.
Old unstamped rolling drafts require recreation. The counter is intentionally
broader than one retrieval window. It catches mutations, not time-only expiry of
every memory; referenced training-intent expiry is checked separately.
Ordinary continuation rejects changed confirmed intent; a fresh review can now
produce a supported replacement or an explicit unsupported boundary. This is
not general multi-outcome strategy or evidence of physiological quality.
`initialDosePolicy: false` remains unchanged.

Greg's “Let’s take next steps” accepted local implementation of the QPlan. His
save request authorized the checkpoint; “Work the tasks” authorized the stated
fixture fix, push/PR, prerequisite verification, isolated rehearsal and mobile
validation. Do not request repeated permission for those scoped steps. New
provisioning/cost decisions need exact targets; production migration/deployment,
live athlete mutations, paid evaluations and external reviewer outreach remain
outside this authority. Existing qsp/activation gates remain independent.
Software review and synthetic cases do not supply physiological-policy approval.

Vercel production metadata and variable target inventory were refreshed on
September 22; secret/effective values, hosted schema/ledger and backups remain
unverified. Reuse `u5l.14`–`u5l.17` for hosted activation dependencies. Do not copy
experimental coaching-layer work wholesale or use production-linked Preview as
an isolated canary. Automatic branch Preview builds are not canary evidence.
