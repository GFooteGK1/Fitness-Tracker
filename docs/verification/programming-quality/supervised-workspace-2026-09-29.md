# Supervised workspace implementation — September 29, 2026

Canonical task: `Fitness-Tracker-i40.17.3`. Local implementation verified October3.
The current slice connects authenticated workspace, preview, review and scoped
runtime. Durable stale-request resolution is now verified locally; real retained
browser/Auth/concurrency qualification remains a subsequent milestone gate. Earlier entries below describe the
initial discovery/editor checkpoint, not the latest connected state.

## October3 recovery qualification

Migration `20261003134727_supervised_request_resolution.sql` adds immutable,
FORCE-RLS submit/decision fences without table grants. Historical owned enrollment
authorizes submission resolution; the original designated reviewer can recover or
close their own decision after revocation. Writers and resolution share program,
request and candidate lock domains; renamed decision implementation is private.
Privileged alternate inserts cannot bypass closure. Issuance reuses the existing
reviewed registration/request fence after exact supervised scope authorization.
Closing issuance requires a new candidate/review for any later replacement.

`POST /api/coach/supervised/resolve` deliberately resolves a saved result or closes
the unsaved original. `POST /api/coach/supervised/resolution` carries the same
original payload to a pure getter. Exact actor/program/payload matching and original
saved-result validation precede archive/clear. Receipt absence never releases
pending. Lost closure responses, account changes and archive/removal failures are
covered. Existing pure recovery routes and explicit same-request retry remain.

Current focused verification:98 tests across7 suites, including12 disposable SQL
cases, saved SQL→server→browser issuance and component lost-closure recovery.
Full nonincremental typecheck, scoped source lint and production build2036 exit0
with CI placeholders (`https://example.supabase.co`, `ci-placeholder-key`).
Independent review passed71 aggregate tests and final12 SQL tests. Its JSONB
operator-precedence finding dropped issue result kind/request; fixed with explicit
parentheses and an unmocked complete-envelope browser regression. No remaining
material finding in this local slice. Existing unrelated hook/workspace warnings
remain. None of the supervised migrations has been applied to retained/hosted DB.

Real simultaneous PostgreSQL connections, retained Auth/PostgREST, two complete
browser cycles, named athlete/base, fresh supported/adversarial quality cases,
reviewed release/rollback and scoped hosted pilot remain parent acceptance gates.
Global numerical policy stays disabled; no commit/push/deployment occurred.

The connected workflow checkpoint below records September29 state.

## Connected workflow checkpoint

`/program/supervised` is linked from the training-plan page. The editor preserves
complete accepted work, copies/removes/reorders sessions and steps, remaps linked
monitoring identities and protects required logging/working structure. Copying
into a day freed by a move preserves every baseline session; real compiler
regression passes. Schema downgrade clears obsolete conditional timing. RPE/RIR
remain independent. Only expanded sessions mount their full editing controls.

An authenticated read-only preview recompiles current source before any pending
submission is stored. Browser checks its exact draft SHA-256, actor, enrollment
and bounded review packet. Preview rejection leaves the draft editable; subsequent
edits invalidate the preview. Saving still independently validates source and
authority. Review decisions remain exact immutable operations and athlete proposal
acceptance is separate.

Pending records and verified archives persist in owner/program-scoped localStorage.
Recovery never automatically resends. Exact receipt parsing checks identity before
archiving/clearing. Bounded local owner-key discovery exposes receipt recovery even
when a revoked reviewer has no discoverable assignments. This grants no new source
or athlete metadata access. Lost response and reopened-tab checks pass.

The dedicated supervised capability defaults false. Shared reviewed HTTP handlers
classify exact owned program/session/proposal lineage; errors never fall back to
nonpilot authority. Original receipts remain recoverable when writes/enrollment
are disabled. SQL remains final authority. Resource classifier migration
20260930040000 has not been applied to retained or hosted databases.

Independent current client checks:37/37 across draft-editor, week-editor, pending
and workspace. Full nonincremental tsc and scoped lint pass. Prior server/runtime
review:93 checks. Current preview/runtime/HTTP aggregate28/28 includes real compiler
execution in a read-only SQL transaction; independent preview audit is clear.
Build15948 did not yield success and its handle became missing; original PIDs were
confirmed absent and .next remained dated September27. Revised local build88310
with filesystem escalation reached compilation; completion has not yet been observed.

The remaining stale-submit case is material: source/base/enrollment can change
after preview but before save. The original pending request stays preserved and
may become permanently invalid. Implement a durable cancellation/fence or equally
strong no-write resolution before allowing a new candidate. Do not clear on404,
guess a failed write, or call this workspace complete. Real retained Auth,
concurrency, two browser cycles, named target, qualification and rollout remain.

## Earlier discovery/editor checkpoint

Migration `20260930030000` provides bounded authenticated program and candidate
navigation. Owners can read their supervised history even after disablement;
reviewers see only current enabled, unexpired assignments and matching candidate
versions. Replaced/revoked reviewers do not retain athlete metadata discovery.
Their original decision receipt recovery remains separate. Explicit keyset
pagination has a maximum of 50 entries and exposes a continuation cursor rather
than silently dropping remaining records. Projections exclude private packets,
profile tables and source bindings. The accepted base identity is owner-only.
Discovery is a navigation hint, not permission to issue or execute numerical work.

`supervised-draft-editor.ts` derives proposed editable work from a validated
accepted reviewed week. It uses actual day assignments rather than historical
comparison schedules, preserves complete sessions and protocols, and does not
copy old review/source tokens as approval. The next window is the adjacent week,
even when the original base is dated; it is not silently moved to today's week.
An actual candidate compilation test preserves the complete seeded content.

`supervised-draft-server.ts` restricts that starting point to the authenticated
athlete's exact accepted base under a current enrollment. It repeats source
identity/account checks after reads. Assigned reviewers cannot use it to access
private source. No candidate, approval or other record is written by this reader.

`supervised-week-editor.tsx` edits existing complete sessions, nested preparation,
movement/equipment, sets, work type, load, effort type, independent RPE/RIR targets,
rests, optional-work explanations, timing estimates and monitoring instructions.
Changing to a new numeric work/effort type requires explicit values; it does not
invent an RPE, RIR, repetition or duration target. Blank numeric fields remain
invalid local editing state and must not become persisted requests. Occupied day
selection swaps complete sessions. Original accepted objects remain unchanged.

Current implementation checks: six suites, 56 passing tests. Discovery SQL and
reader checks total 24; draft seed and component checks total nine; owned draft
reader has nine; candidate-server suite has 14. Independent review passed the
initial 45 checks and the follow-on 13 reader/editor checks. It found a readiness
gap for archived/unanchored programs: discovery now supplies an editable base only
for an active rolling-weekly program with an explicit initial anchor and exact
owned accepted reviewed base. Historical navigation stays available. SQL and
reader refusal tests pass. Independent final SQL/draft-reader run passed16 tests
and closed the readiness finding. Full nonincremental TypeScript and scoped
ESLint pass on the final slice. No material review blocker remains for the
implemented subset; full workspace acceptance remains unproven.

## Remaining work and boundaries

Complete session/step insertion, removal and ordering controls with explicit
protocol and optional-tail handling. Add candidate preview, complete review view,
reviewer approval/rejection and athlete proposal flow. Self-review must check the
designated reviewer ID because a self-reviewer is returned with the athlete role.

Persist exact candidate/decision/issuance requests before sending. Lost responses
must preserve payload/identity; reads and receipt recovery must precede new writes.
Do not create a replacement candidate just because a read is unavailable.

Connect authenticated routes and scoped runtime only after checking each exact
owned program/session/proposal against durable supervised lineage. Replacing a
global gate with a broad user-level supervision flag would expose preserved
nonpilot RPC paths and is not acceptable. SQL remains final write authority.
Global `initialDosePolicy` remains false; the production registry remains empty.

Fresh review provenance currently prevents same-week replacement of begun work
under exact continuity rules. Disclose that limitation; do not reuse old review
tokens or weaken continuity. Adjacent next-week advancement still requires begun,
unfinished work to be resolved. New authenticated browser and concurrency proof,
named athlete/base selection, qualification and approved hosted pilot remain.

No new migration has been applied to retained or hosted Supabase. No new HTTP
route, runtime activation, deployment, commit or push occurred in this slice.
