# Supervised workspace implementation checks

Canonical task Fitness-Tracker-i40.17.3; local work only.

Seed test attempt 1: three of four passed. The failing test manually swapped
baseSchedule without updating its required spacing metadata, so the complete-week
decoder correctly rejected the synthetic input. Replaced that mutation with the
existing compiled Tuesday-bench fixture, whose actual and historical schedules
already differ. Four seed tests then passed; no decoder weakening.

Editor typecheck attempt 1: missing closing JSX expression at the conditional
distance-target field (TS2657/TS1005). Corrected the syntax; full tsc then passed.

Component attempt 1: three of four passed. The instructions field's help text was
inside its label, causing its accessible name to include the extra sentence.
Moved help text outside the label; all eight seed/component tests passed. Added
an explicit work/effort type conversion case afterward, with blank required
targets rather than invented values. Current six-suite aggregate passes54 tests.

Independent design review: reviewers must not retain athlete metadata discovery
after revocation/expiry/replacement. Adopted current-assignment-only discovery.
Source reader remains owner-only. Same-week begun-work continuity is an explicit
existing limitation; do not relax it through copied review tokens. Runtime routes
must bind each request to exact supervised lineage, not a general user flag.

Follow-on independent review found archived/unanchored programs could receive a
draft seed that submission would reject. Narrowed acceptedBaseId readiness to an
active rolling-weekly program with explicit initial anchor and exact owned accepted
reviewed base, preserving owner historical navigation. Added SQL transition and
reader no-source-fetch checks. All six affected suites now pass56 tests.

Connected workflow review: extracted browser-safe candidate/review parsers to
avoid importing server crypto through the editor. Immutable pending receipt
checks were tightened and sessionStorage changed to localStorage after independent
review found tab-close loss. Reopen and revoked-reviewer recovery tests now pass.
Reviewer found copy-after-move could overwrite baseline placement; the fix assigns
the copy an empty baseline slot and preserves the proposed target. Actual compiler
regression passes. Initial regression fixture incorrectly mutated a hashed accepted
base profile and was correctly rejected; replaced with a direct real compiler
case that explicitly binds the expanded synthetic availability.

Invalid edit submission could freeze the browser behind an unsaved pending request.
Added read-only compile preview before persistence; restricted incompatible roles,
protected sole logging/working removal, and normalized conditional timing after
schema downgrade. Stale base/enrollment races still require durable fenced
cancellation; this is an open correctness gap, not evidence of an uncertain save.

One aggregate editor test timed out while every hidden session still mounted all
fields. Session bodies now mount only when expanded. Current independent client
aggregate passes37 checks. Revoked-reviewer test initially supplied malformed
page/decision fixtures; corrected exact contract fields without weakening parsers.

Build attempt1: npm run build/session15948 logged Next15.5.25 and then remained
live before compilation. PIDs41804/46616 CPU activity and installed Next cleanup
code suggest recursive cleanup retries; exact failing path/errno is unproven.
Non-elevated CIM process inspection denied once; independent elevated read-only
inspection succeeded. Handle later became missing; .next artifacts stayed dated
September27. Do not infer success, delete output, or blindly restart. Final orphan
readback confirmed PIDs41804/46616 absent. No permission/config modifications.
Revised build attempt2 uses ordinary local build with filesystem escalation after
confirmed termination; session88310 reached production compilation. This supports
a filesystem-bound precompile issue in attempt1 but does not identify its exact
path/error. Poll the existing handle; no deletion or dependency workaround used.

Attempt2 exited1 after successful compilation26.2s and type/lint: /offline
prerender required NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY, absent
from the local shell. Reassessed against .github/workflows/ci.yml24-25, which uses
https://example.supabase.co and ci-placeholder-key. Attempt3/session11674 uses
those exact nonproduction placeholders with filesystem escalation; no production
credentials loaded. Compilation passed7.8s; remaining build checks pending.

October3 correction: prior build11674 exited0 after full type/lint/static page
generation and traces. The pending-build text above is historical. Current
recovery change build2036 also exited0, compilation6.3s,87/87 static pages.

October3 recovery implementation: exact actor/program/original payload resolution
added in migration20261003134727, browser/server contracts and explicit closure
plus pure readback routes/UI. Installed CLI help initially failed once with
EPERM writing its local telemetry file; filesystem escalation for help succeeded,
then local migration creation succeeded. No install or DB apply occurred.
First new SQL suite8/8 passed. Expanded suite/HTTP/pending/lifecycle60/60 passed.
New test mock call tuples caused TS2493 twice; fixed casts without runtime changes.
One JSX apostrophe caused react/no-unescaped-entities; rewrote copy, lint passed.
Independent reviewer found a JSONB precedence bug dropping kind/request in saved
issue getter. Added parentheses plus real SQL→server→browser full receipt test.
Final98/98 focused checks across7 suites, nonincremental tsc, scoped lint, build
passed. Independent71 aggregate and final12 SQL checks passed. Closure while
paused, historical reviewer revocation, private RPC grants, privileged inserts,
changed payload, lost response, archive/removal retry and saved winners covered.
This is sequential disposable SQL proof, not real concurrent connections/Auth.
The retained local Auth health endpoint refused connection; read-only VM inventory
showed sociusfit-local stopped. Resumed that exact rootless VM successfully;
containers/readback and remaining retained qualification are next. No rootful
switch, configuration change, reset, deletion, credential change or hosted action.
