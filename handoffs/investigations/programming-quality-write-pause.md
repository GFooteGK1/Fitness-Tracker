# Programming-quality coaching write pause investigation

- **Issue:** Fitness-Tracker-i40.11; owner: boundary_review, coordinated by root
- **Objective:** Prove a committed operator pause drains and blocks canonical coaching-output writes in real independent PostgreSQL sessions.
- **Workspace:** `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/programming-quality`
- **Status:** local rehearsal passed all 14 checks; independent final review clean
- **Cycle:** 2, attempt 1 passed; four cumulative attempts including cycle 1's three preserved failures
- **Next allowed action:** independently review the final source/receipt and finish release preparation. No further drain rerun is needed; no production/shared-database changes are authorized by this rehearsal.

## Current implementation and evidence

The selected runtime design remains the singleton row gate in `supabase/migrations/20260923010000_coaching_write_pause.sql`, with transaction-held FOR SHARE NOWAIT for writers and operator UPDATE plus generation CAS. The temporary control-table lock experiment was reverted at root's direction. `ADR-0028-database-enforced-coaching-write-pause.md` describes the selected boundary, the requirement to install before the revision migration, and its limitations.

Root's independent normal-CI `test/database/coaching-write-pause.test.ts` passed 13 tests against the actual pre-revision fixture and pause migration. These tests cover guarded statements, ACLs, first acceptance rollback/resume, replay, stale generation, reapplication and missing state. They do not prove independent-session contention or successful draining. All three local attempts passed busy-install atomicity and initial open-state/record preservation, then stopped before completing the drain schedule. No production or shared local database was modified; each attempt used a new synthetic database and preserved it.

At the cycle 1 stop, the proposed test corrections had been written but not executed: the authenticated writer's second write uses an existing SECURITY DEFINER initial-proposal RPC instead of a denied direct DELETE, and admission before operator commit may be either successful or conflicted. Read-before-pause READ COMMITTED/REPEATABLE READ cases were also unverified at that point. The separately approved cycle 2 result below supersedes that verification status; the failed-attempt evidence remains unchanged.

## Attempt 1 — 2026-09-23 20:39 UTC

- Hypothesis/action: run `node scripts/release/local-coaching-pause-rehearsal.mjs`; use synchronous observer subprocesses while the asynchronous operator waits.
- Expected: observe blocker PID, exercise admission, finish existing writer, commit pause.
- Actual: two setup checks passed, but the observer/cleanup path did not preserve the causal assertion before a pending promise rejected. Exact terminal error: `Error: Session operator exited (null)` at the psql child exit handler.
- Evidence: `output/app-quality-release/pause-20260923203913_086e047c/commands.private.log`, baseline/schema artifacts and preserved database `socius_pause_20260923203913_086e047c`. The script exited before writing its normal JSON receipt; `failure-reconstructed.json` explicitly records only the observed terminal result.
- Change/conclusion: replace blocking subprocess polling with a persistent asynchronous observer session; attach a rejection handler to the in-flight operator promise. No drain claim established.

## Attempt 2 — 2026-09-23 20:40 UTC

- Changed hypothesis/action: asynchronous observer should expose PostgreSQL locks and preserve failures; expect later FOR SHARE NOWAIT to fail while the operator UPDATE waits.
- Actual: blocker observation succeeded, but the later writer returned `00000`, not `55P03`. Exact assertion: `Expected values to be strictly equal: '00000' !== '55P03'` in phase `writer drain`.
- Evidence: `output/app-quality-release/pause-20260923204027_4addf176/receipt.json`; database `socius_pause_20260923204027_4addf176`; migration SHA256 `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041`.
- Reassessment before third attempt: PostgreSQL permits a new compatible SHARE holder to join existing holders while a conflicting operator waits. A successful committed pause still requires obtaining the exclusive row lock after admitted writers drain. Dispatch or a waiting pause is not proof; timeout means no pause. Root accepted this simpler contract and did not require precommit admission closure.

## Attempt 3 — 2026-09-23 20:41 UTC

- Changed hypothesis/action: a local-only experimental operator EXCLUSIVE table lock plus writer ROW SHARE NOWAIT would close precommit admission. This run had started before root directed retention of the simpler row design; it was never installed in the shared database.
- Actual: the admission assertion passed in that experiment, then the existing authenticated writer's follow-up direct DELETE failed. Exact error: `Session writer: SQLSTATE 42501 during writer drain`.
- Evidence: `output/app-quality-release/pause-20260923204159_6bd804e3/receipt.json`; database `socius_pause_20260923204159_6bd804e3`; experimental migration SHA256 `790d939544c3780f66b23720a59d984da55b649654903e340e924c0c0cd4ef55`.
- Conclusion: the harness used a direct DML permission the application role intentionally lacks. It must exercise a valid existing SECURITY DEFINER write path, not relax ACLs or treat permission denial as lock evidence. No complete drain/cutover result exists. The optional table locks were reverted; their receipt is experimental evidence only.

## Retrospective

The first attempt mixed synchronous orchestration with asynchronous transaction lifetimes and lost useful failure reporting. The second made an incorrect PostgreSQL admission assumption. The third corrected that assumption experimentally but reached an independent fixture actor error. These are different causal failures in the same unresolved acceptance check; changing sessions or implementation variants does not reset the three-attempt count.

At the cycle 1 stop, table coverage and ordered fail-closed behavior had normal-CI evidence, while real-session drain completion, postcommit exclusion, stale snapshot behavior and compatibility cutover remained unverified. The approved cycle 2 result below resolves that local verification gap. A timeout or failed pause is explicitly not success. No maintenance UX was implemented or verified. Final source review corrected an earlier status assumption: current coaching RPC error branches return generic HTTP 503 for `PT503`, while outer exception handlers use 500.

## Revised method proposed for approval

Keep the selected row gate and current ACLs. Use persistent asynchronous writer/operator/observer sessions, plus explicit authenticated application RPC calls. First confirm each actor's proposed statement is permitted while the gate is open in a disposable synthetic transaction. This permission precheck is the smallest discriminating check and must precede the contention schedule; it does not require granting additional privileges.

Then hold an authenticated initial-proposal transaction open, observe the operator waiting via `pg_blocking_pids`, and record rather than misclassify any new SHARE admission before pause commit. Finish a second valid RPC within the existing transaction and commit it. Require the operator call and COMMIT to succeed, then independently read `paused=true` at the returned generation. Require subsequent output DML/RPC writes to fail and prove unchanged output hashes. Test old prepared statements, reads begun before pause at both isolation levels, operator disconnect persistence, stale resume CAS, timeout/rollback preserving the old state, and accepted replay immutability. Apply revision migration only in the new paused database, resume with exact generation, and check the compatible stamped writer and rejected old draft.

Acceptance is a complete sanitized receipt with actual backend IDs/blocker observations, exact current migration/harness hashes, all assertions passing and no changes to the source database. Maximum new cycle: **three substantive attempts after Greg approves**, with cumulative history retained. Stop earlier if an actor/API prerequisite cannot be established or if evidence contradicts the postcommit guarantee. No hosted writes, shared local migration, reset, account permission change or deployment is included.

Required approval source: `C:/Users/foote/.codex/docs/GUARDRAILS.md`, section 8: “Report the blocker and ask Greg to approve the revised method before restarting it.” Root confirmed that requirement. This handoff is not approval to resume.

## Cycle 2 approval — 2026-09-23

Greg explicitly approved the revised local rehearsal method through the pending asynchronous question; root relayed that approval to boundary_review. Scope is the corrected row-only gate, valid RPC actors, disposable open-gate permission prechecks, independently observed PostgreSQL locks and post-COMMIT proof in a new synthetic database. The budget is at most three new substantive attempts, preserving the prior three. The receipt now distinguishes authenticated RPC writers, postgres direct DML/MVCC probes and concurrent operator, and supabase_admin synchronous fixture/operator commands.

### Cycle 2 attempt 1 — passed, 2026-09-23 20:49:44 UTC

The open-gate precheck executes initial (twice), first acceptance, weekly review and replacement through the actual authenticated SECURITY DEFINER RPCs, rolling back each transaction and checking exact output hashes. Postgres direct-DML probes verify their role/privileges and reversible zero-row DELETEs. An explicit five-second operator lock-timeout scenario must leave the gate open at the original generation and output hashes unchanged. Only then does the corrected success schedule attempt drain and postcommit exclusion. Migration and harness source copies are preserved in the new run folder as well as hashes. No new runtime migration change was made.

Command: `node scripts/release/local-coaching-pause-rehearsal.mjs`. Result: exit 0, all **14 checks passed**, `failure: null`. Evidence: `output/app-quality-release/pause-20260923204901_1a15ce45/receipt.json`, with a sanitized durable copy at `docs/verification/programming-quality/local-coaching-pause-2026-09-23.json`. The new database `socius_pause_20260923204901_1a15ce45` and source snapshots are preserved; original `postgres` was read only.

Real PostgreSQL backend IDs 9994 (writer), 10000 (operator), and 9996 (later probe) were distinct. `pg_blocking_pids` observed writer 9994 blocking the operator. The timeout returned `55P03` after an observed 5074 ms, with original open state/generation and output hashes preserved after rollback. This is an observed duration, not a whole-request SLA. A later compatible writer was admitted with `00000` before pause COMMIT, exactly the documented limitation. After successful COMMIT, later writes returned `PT503`; a transaction with an older REPEATABLE READ snapshot returned `40001`, and READ COMMITTED observed the paused state. The paused state survived operator disconnect.

All six tables rejected INSERT/UPDATE/DELETE/TRUNCATE; initial/accept/review/replacement authenticated RPCs rejected writes without changing aggregate output hashes. Accepted replay returned the same result and unchanged hashes. ACL denial covered anon/authenticated/service_role; stale CAS and migration reapplication preserved pause. Revision migration applied while paused without rewriting output rows; after generation-checked resume a fresh stamped proposal accepted and the old unstamped pending draft remained rejected. Aborted transition and missing control tests failed closed/restored by rollback.

Verified migration SHA256: `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041`; harness SHA256: `ef6f0c210cd4e3de351dc9399018468eef0d98dc9f5c7045f1ade992ac6c4443`. SQL-only actors, scoped bootstrap and direct database calls are the evidence boundary; this does not prove HTTP maintenance UX, hosted schema/ACLs, live traffic drain, deployment or a production backup freeze.

## Source-review correction — 2026-09-23

The earlier generic HTTP 500 characterization was incorrect for current coaching RPC error branches. Inspection of the acceptance route confirms an RPC error returns generic 503; its outer exception handler returns 500. Current initial/review branches likewise use generic 503. No maintenance-specific message or HTTP-under-pause verification is claimed. Independent final review found no remaining runtime/harness blocker; current migration and harness hashes match the passing receipt.
