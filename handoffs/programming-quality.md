# SociusFit programming quality — current handoff

Updated: 2026-09-25 UTC (September 24 Chicago). Project: Fitness-Tracker/SociusFit. Status: active, partial implementation.
Objective: execute the accepted evidence-conditioned programming QPlan.
Tracker: `Fitness-Tracker-i40`; Beads owns package status and dependencies.

## Current state and next action

**September 25, 03:09 UTC: attended packet APPROVED, attempt unused; browser
control unavailable.** Three control requests timed out: retained-tab lookup,
surface inventory, and a fresh tab on verified Chrome. Browser metadata still
lists Chrome ID2, but that is not proof that control works. Do not repeat this
exhausted connection cycle without restored access. No SQL query, gate mutation,
receiver launch or smoke HTTP occurred in this approval turn. The last database
read remains the historical paused5 qualification below. Fresh platform preflight
passed seven GETs; checkpoint 0b98ab0 CI36088244299 passed. The existing session
remains valid to September 25 11:58:50 UTC; attended markers are absent and all
12 reviewed artifact hashes match. Restore browser access, refresh the required
preflight, then execute the existing approved packet without asking again.
See [access-stop evidence](../docs/verification/programming-quality/production-attended-access-stop-2026-09-25.json).

## Previous attempt and prepared correction

**September 25, 02:47 UTC: coaching paused at generation 5; new attended method
awaits approval.** The user restored the signed-in Chrome SQL tab. The approved
pre-armed opening committed 3-to-4, but a premature UI assertion returned before
publishing the helper signal. Root contained 4-to-5; no create/accept HTTP was sent.
The native helper exited1 after its five-minute wait and must not be relaunched.
All 66 owner scope counts, revision 0 and both original fixed-plan hashes match.
Both exact migrations and pinned build remain installed; the release is incomplete.
The original 60/90-second containment timing was not demonstrated. See the
[current result](../docs/verification/programming-quality/production-prearmed-result-2026-09-25.md).

The one-opening authorization is used. The concrete
[attended approval packet](../docs/verification/programming-quality/production-cutover-attended-approval-2026-09-25.md)
encloses open/read/signal/helper observation/re-pause in one CUA invocation with
finally-based containment and a 55-second invocation budget. It uses prep5/open6/
pause7/final8, distinct markers and exact existing frozen inputs. Local tests and
independent review cover delayed/stale result rendering, late openings and bounded
clock catch-up. The reviewed shared read-only adapter qualified live whilepaused5;
its opening and containment paths remain unexecuted. All 28 focused tests passed
and independent review found no remaining blocker. No credential refresh/new
account/key read or new production attempt is authorized yet. Session expires
September 25 11:58:50 UTC; refresh its local lifetime check before any approved launch.

New ignored artifacts: `output/app-quality-release/cutover-20260924/attended-*`.
Do not use old `prearmed-*` SQL/markers. Preserve all earlier failures. The
[preparation receipt](../docs/verification/programming-quality/production-attended-preparation-2026-09-25.json)
records exact artifact hashes and qualification evidence. Fresh preflight required
before an approved launch. Last checkpoint before these evidence edits was
c4a8ed8 with CI36006358927 SUCCESS. Beads i40.11 remains in_progress; i40.12 remains open.
The 12-file operator code archive is byte-verified and saved in the existing
private recovery directory as `cutover-attended-operators-20260925-v2.zip`, SHA256
`0e51ad8dd1e74c8df6cba70535f6cb3c39768163994aec59411194ded7815789`.

## Previous continuation result

**September 24, 12:06 UTC: coaching is paused at generation 3.** Greg approved
the corrected continuation. Same-account sign-in/profile/empty weekly read and
the deliberate paused rejection passed. Temporary open generation 2 then closed
to 3 within the approved timing limits. Create/accept stopped at its second
freshness check before any HTTP: the attestation arrived at age 14.537 seconds,
and local setup pushed age to 19.165 seconds. No program, proposal, prescribed
session, acceptance or replay exists. All 54 public owned scopes were reconciled;
only profile and revision-zero rows exist. Original two plan hashes still match.

The [current continuation result](../docs/verification/programming-quality/production-continuation-result-2026-09-24.md)
supersedes the historical execution notes below. The next proposed method finishes
private setup before READY, then publishes fresh open evidence in the same CUA
call that captures it. It preserves all deadlines and needs approval for one new
create/accept attempt; never rerun the previous phase or delete its markers.
See the [new approval packet](../docs/verification/programming-quality/production-cutover-prearmed-approval-2026-09-24.md).
Both migrations and the pinned production build remain installed. No new account,
key retrieval, schema change, deploy, paid resource or numerical activation.
Checkpoint c28bf61 CI35995061386 passed. i40.11 remains open; i40.12 tracks the
rehearsal profile-trigger gap. Browser-control recovery and all failed local
preparation steps are preserved in the execution investigation.
The reviewed local operator sources/tests are also retained in the private
`C:/Users/foote/AppData/Local/SociusFit/Recovery/cutover-operators-20260924-continuation.zip`,
SHA256 `f57cb5ae928bdb5240d08eb6a9098be65d406979f283b1f394dd7f18abe57070`.
This bundle contains operator code, not account/session data; its tracked release
helper imports and ignored artifact inputs remain at their existing paths.

## Historical first cutover attempt

**September 24 production state: both approved migrations are installed and the
pinned deployment is promoted to all three production aliases. Coaching remains
paused at generation 1. Do not redeploy, reinstall migrations or resume blindly.**

Greg approved the exact cutover packet. Fresh recovery passed all 94 scopes,
selected catalog/security and ICU checks; exporter/restore cleanup is verified.
Both exact migration ledger hashes, 14 functions/16 triggers and the fixed two
accepted-plan hashes passed. Build/aliases/redirects/31bindings match. A page
comparison error (server HTML ten scripts versus earlier browser nine) was
reconciled read-only by exact pinned-tar HTML and asset hashes; original failure
is preserved. Preparation checkpoint e9555ce passed CI3499/19skipped/26mobile.

One synthetic Auth account and identity were created. The one profile upsert
failed400/23502 because the pre-existing BEFORE INSERT trigger unconditionally
sets NEW.user_id=auth.uid(); service-role has no athlete subject. Read-only
reconciliation found all54 owned public scopes empty and no session. No sign-in,
coaching request, proposal, acceptance, resume, deletion or retry occurred.

The [current execution result](../docs/verification/programming-quality/production-cutover-result-2026-09-24.md)
and [sanitized receipt](../docs/verification/programming-quality/production-cutover-result-2026-09-24.json)
are authoritative over the historical preparation notes below. The
[corrected continuation packet](../docs/verification/programming-quality/production-cutover-continuation-2026-09-24.md)
is ready for approval: reuse the existing encrypted account/password and frozen
public anon, sign in first, create profile as owner, then finish the original
smoke/re-pause/replay/digest/final-resume gates. Three focused tests and independent
review pass. **No second attempt is authorized yet.** The original packet allows
no automatic second smoke attempt. No new account/key retrieval/schema change.

Release issue i40.11 remains in progress. Fixture gap is tracked as i40.12.
Private backup: backup-20260924111117-678fe2da; locale: locale-20260924111249-92cb2a35;
restore: restore-e7e23977-df8. Raw IDs, credentials and responses are encrypted.
Operator scripts/evidence are retained under output/app-quality-release/cutover-20260924;
continuation helper SHA6d9b780644f6c5385934c2404469ee929da2af768d79b61798a79d4463364285.
The [execution investigation](investigations/programming-quality-cutover-execution.md)
preserves all failures and fixes. Local evidence persistence succeeded on the
third bounded method; do not restart the two failed CUA private-folder methods.
Fresh production preflight is required after the next approval. The old app is
incompatible after revision; keep verified pause on any unresolved failure.

## Historical September 23 preparation

September 23 follow-up: Greg approved staging, and the exact retained source
`93539b0` artifact is now hosted as `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`, READY.
See the [staging receipt](../docs/verification/programming-quality/production-staging-2026-09-23.md).
The custom live domain and current production target remain on `dpl_5kZSaXHLmqPPzsCy6odLJyy99utW`;
Vercel automatically assigned its generated project alias to the new deployment.
All 31 runtime bindings are unchanged. No migration, pause, promotion or merge
occurred. The upload container is stopped; the exact tar remains retained.
Greg signed into Vercel, and bounded hosted checks passed: sign-in rendering,
exact build ID, nine script paths, two downloaded asset hashes, and signed-out
rejection bodies for weekly/intake. Raw HTTP statuses are not exposed by the
browser interface; source auth branches return 401. No SociusFit login occurred.
Fresh metadata still shows the old custom domain/current production target and
31 unchanged runtime bindings. Do not create a bypass token or redeploy.
The migration and minimal write-verification procedures are now complete locally.
The [final cutover packet](../docs/verification/programming-quality/production-cutover-approval-2026-09-23.md)
defines exact atomic migration/ledger SQL, fresh encrypted capture and isolated
restore, all-three-alias promotion, one frozen synthetic owner and controlled
resume/re-pause/replay. Ten actual PostgreSQL checks, eight focused tests and
TypeScript pass; independent review found no remaining code blocker. Helpers
are preparation-only. The exact reviewed mixed-ending migration bytes are now
preserved in Git; its SQL is unchanged. See the [preparation investigation](investigations/programming-quality-cutover-preparation.md).
Next requires explicit target-specific production cutover approval, successful
final-checkpoint CI and fresh preflight. No production migration/pause, synthetic
account, service-key read or promotion has occurred. Prior5ca1ad4 CI35939161527
passed; current checkpoint/CI status is maintained in Beads i40.11 and PR84.
Full CI passed on `b4ef53d`: 3,491 tests, 19 skipped and 26 mobile journeys.
The [staging investigation](investigations/programming-quality-staged-deployment.md)
preserves startup/diagnostic attempt counts and the corrected metadata verifier.

Budget steering, September 23: Greg does not want Supabase spending. The selected
preparation route is a local Supabase/application rehearsal with synthetic data
and verified manual backup/restore of production in a separate private recovery
environment. See the [no-cost release route](../docs/verification/programming-quality/release-preflight.md).
No paid plan, managed backup add-on or paid canary is authorized. Local setup is
now verified: portable Podman 5.8.3, Supabase CLI 2.117.0, dedicated WSL2 machine,
PostgreSQL 17.6, coaching schema, two real local Auth accounts, owner-profile RLS
and distinct concurrent database backends. See [setup receipt](../docs/verification/programming-quality/local-setup-2026-09-23.md).
The [local rehearsal](../docs/verification/programming-quality/local-rehearsal-2026-09-23.md)
now passes 21 real PostgreSQL/HTTP concurrency checks, 14 fresh-account app-flow
checks in dev and production mode, 10 old/new schema checks, and a consistent
95-table synthetic backup/restore. Real mobile browser acceptance/recovery also
passed. It found and fixed earlier recommendation-lock contention (five RPCs now
use a one-second per-lock timeout and recoverable HTTP 409) and explanation text
overflow. Migration hash is now `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`.
Greg approved the private production backup/restore preparation and parallel
write-pause/application rollback work. The private recovery destination now
exists with verified restrictive Windows ACLs. Existing CLI project access is
verified; Greg approved its temporary CLI database login, which was created/refreshed.
The corrected production metadata check passed all twelve conditions. Encrypted
capture and separate private restore are implemented and independently reviewed.
The approved correction cycle resolved exact role search-path/schema-grant
failures and selected the verified source-version runtime for ICU 153.120.
All 51 focused helper/local-catalog checks passed. The single permitted private
restore passed 93 physical table digests, required release-record coverage and
selected catalog comparisons; cleanup readback confirmed its container stopped.
The [verified recovery receipt](../docs/verification/programming-quality/production-recovery-verified-2026-09-23.json)
records scope/qualifications. Raw catalog equality and full hosted-service
recovery are not claimed. Production data, encrypted catalogs and DPAPI keys stay
outside Git and synthetic fixtures. Prior failures and exhausted attempt budgets
remain in the [investigation](investigations/programming-quality-private-recovery.md).
The recovery gate is resolved for this archive. No more source/restore retries
are needed. The compatible artifact and target refresh subsequently passed;
reviewed cutover procedures are now complete; separate target-specific approval
and fresh execution preflight remain.
See [recovery preparation](../docs/verification/programming-quality/production-recovery-preparation-2026-09-23.md).
The compatible local build is retained and its same-port artifact-switch
rehearsal passed 15 checks, with the revision schema left installed. It uses two
builds of the same application source and is not a production rollback artifact.
The database pause passed 13 ordered CI regressions; the combined pause/revision
suite passed 29 tests (exclude `output/**` to avoid retained source copies).
After three failed attempts, Greg approved the corrected method; its first retry
passed all 14 real PostgreSQL pause/drain/cutover checks. Prior failures remain
in the investigation, with no count reset or unsupported evidence upgrade. See the
[pause/rollback receipt](../docs/verification/programming-quality/local-pause-and-rollback-2026-09-23.md)
and [attempt record](investigations/programming-quality-write-pause.md).
Local rehearsals alone did not satisfy production recovery or authorize deployment.
The subsequent private recovery and approved staging results above supersede
those historical gates. No further recovery-method retry is needed.

The saved implementation is committed and pushed on `codex/programming-quality`;
[draft PR #84](https://github.com/GFooteGK1/Fitness-Tracker/pull/84) is open.
The inherited date-fixture defect is fixed in `4c649ef` and `i40.10` is closed.
The earlier checkpoint's full regression passed: **3,460 passed, 19 skipped**; the 14 focused boundary
tests include SQL timezones spanning the UTC date boundary. Full TypeScript and
focused lint passed for that checkpoint. The September 23 contention and mobile
fixes now pass 107 focused tests, full TypeScript, focused ESLint and a fresh
production build. Independent runtime review ran 83 overlapping tests. Final
CI passed on `923473a04583684d3f9b150c35ffa7e0173a8e25`: 3,471 tests passed,
19 skipped, 26 browser tests passed, TypeScript/lint/build passed in run
`35873858574`. The newer application checkpoint `7abca86e183f547925ff69d858f453460872133e`
passed CI `35920252754`: 3,484 tests, 19 skipped, 26 browser journeys, TypeScript,
lint and build. It fixes a visibility-observer test timing race without changing
application behavior. Later recovery helper/doc changes have separate local checks.
Recovery-helper checkpoint `8eebe74` also passed full CI `35922154764`; e469c10
passed `35923540505`. CI `35927882780` on e7d1506 found an independent cache
property-fixture leak. The test-only repair passes the recorded seed, exact
counterexample and full ten-test file. Correction checkpoint `93539b0` passed full
CI `35930249161`: 3,484 tests, 19 skipped, 26 browser journeys, TypeScript/lint/build.
Later release-preparation scripts/docs retain the same app and build sources;
their current commit/CI status is maintained in Beads i40.11.
See [fixture receipt](../docs/verification/programming-quality/ci-cache-isolation-2026-09-23.md).

Four new mobile Chromium tests passed at 320/390px, with light/dark screenshots
inspected. See [mobile evidence](../docs/verification/programming-quality/mobile-release-verification.md).
The [release runbook and schema readback](../docs/verification/programming-quality/release-preflight.md)
are prepared, including two executable local metadata-query checks. These do not
establish hosted readiness or an operational cutover/rollback. New local real
contention/schema evidence is in the September 23 receipt above.
`Fitness-Tracker-i40.11` tracks the remaining release work. Dev/production app
processes used for this rehearsal are stopped; local Supabase and retained
synthetic databases remain available. Run the fixed local scripts in the receipt.

Fresh Vercel readback confirms production still serves `f123aa8` and Preview shares
the production Supabase URL variable. No canary app was found in the verified
scope. Greg signed into Supabase on September 23. Read-only inspection confirmed
the six September 18 migration entries, six matching baseline release functions,
and RLS/FORCE RLS on all 14 existing scoped tables. The new revision migration is
absent. The Free-plan project has no managed scheduled backups; no canary appears
in its organization. See [hosted preflight](../docs/verification/programming-quality/hosted-preflight-2026-09-23.md)
for the earlier bounded evidence. Subsequent private recovery and isolated
rehearsals and bounded hosted staging checks passed as recorded above. Finish
the final CI/approval gates before production promotion. The draft PR itself does not authorize merge,
production migration, numerical activation or deployment; Greg separately
authorized only the completed staging action.
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
