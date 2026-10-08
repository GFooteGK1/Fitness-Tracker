# Reviewed completion from actual sets

September 27 Chicago / September 28 UTC. Canonical task: `Fitness-Tracker-u5l.6.8`.
Local implementation verified; no hosted migration, route or numerical activation.

`complete_reviewed_session` requires the exact latest report-ID manifest. Owner
capture and session locks serialize completion with other capture mutations and
set corrections. One transaction saves the canonical workout, immutable capture
snapshot, protected operation/receipt, check-in and terminal session link. Exact
request replay returns the original result; changed payloads, stale manifests,
foreign owners and new terminal writes fail. Skips create no invented workout.

Only reported sets become actual work. Reps, load/unit/convention, set RPE scale,
rest, symptoms, stop state and raw rep velocity/device/method survive. Nulls stay
unknown; no target fills a missing actual. Actual setup stays unknown rather than
equating a prescribed protocol with confirmed execution. Half-point session RPE
is retained in the completion and snapshot, separately from integer legacy RPE.
No assessment observation or personal record is fabricated.

Workout date/start use the first performed set, excluding explicit nonperformance.
Next-local-day completion is permitted for overnight work; older work cannot be
relabelled as today's workout. RPC and reader share a five-minute client clock
allowance anchored to transaction/check-in creation time. Reader still requires
occurrence and capture at or before its as-of cutoff. Amended workouts remain
visible as current reported evidence, with partial/review-required coverage when
the immutable original completion no longer matches. Accepted targets stay intact.

## Verification

- 220 focused regression tests across seven suites passed. Added final sensor/
  half-point test: database 42 tests and performed-context 27 tests passed.
- Full TypeScript check and focused ESLint without cache passed. Independent
  review passed 77 tests and found no remaining blocker after date/skew repairs.
- Real loopback Auth/PostgreSQL week run
  `209140c8-3001-43b0-b838-6691454f6ec4`: 48 checks passed. Includes identical
  concurrent completion, completion versus new-set race, stale manifest rejection,
  three latest actual sets, factual context readback and unchanged accepted plan.
- Companion session run `a7f18f88-834a-4fc5-886e-ea3080a674f9`: 24 checks passed.
- Receipts are under `output/app-quality-release/reviewed-dose-<runId>/receipt.json`.

Migration `20260928020000_reviewed_session_completion.sql` applied once to verified
`supabase_db_sociusfit-programming-local`, API127.0.0.1:55321/DB55322. Initial hash
`B4376B540318C5E9833A0679E068FFDCC2DA61C614022AA7D4D82C0096DB41FE`.
Review then aligned the clock bound to transaction time. Only that inspected,
single-occurrence function expression was updated locally; no bootstrap/reset or
table replay. Final source hash:
`888E4930DEE6EE50E0B9DA4BECD9FCA15B61248036A7083A6AA1263FC306CA2F`.
Logs: `reviewed-set-migration-5f890e0d-2d86-447b-bd65-5b1c89c1152a.log` and
`reviewed-completion-clock-repair.log` in `output/app-quality-release`.

## Remaining boundaries

W5 stays open. The factual-context 16k character budget can omit reports from a
full session and safely require review. Three-set transport proof does not prove
full-session or full-week evidence coverage. Finish that readback/budget contract,
canonical movement/equipment eligibility, server-registered numerical proposals,
source-current atomic acceptance and actual route/UI lifecycle. Old reviewed
proposal paths stay fenced; old completion cannot forge the protected new
operation. P0/P1/W10, broader holdout and release gates remain separate.
Changes are local/uncommitted; numerical policy remains disabled.

Canonical child `.8` is closed; `.9` tracks full-session evidence readback.
Private board checkpoint delivered/read back at version72, event
`267d54fd-e59c-420a-ba7a-5962f73a935f` on I40-1.
