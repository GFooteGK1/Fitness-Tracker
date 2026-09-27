# Setup freshness release continuation

Task `Fitness-Tracker-i40.15`, part of the goal to complete remaining
programming-quality work. This is only the independently releasable setup repair.
Parent objective, P0/P2/P3 and JEV follow-up remain unfinished. On September27,
Greg authorized committing and pushing the ready work. Publish this reviewed
candidate on `codex/setup-freshness-release`. Revised-method hosted checks,
production rollout and broader human-review/evidence gates remain pending.
Local test runs are complete; do not repeat passed work without a new reason.

## Current candidate

Isolated checkout `.worktrees/setup-freshness-release`, based on main
`d3c07c59bae4c7b9782460823381e3e82cd793f2`. The original programming-quality
worktree is preserved with the broader uncommitted changes. Publication receipts
and exact commit identity belong in canonical Beads `i40.15`. No hosted writes
or numerical activation have been performed.

The exact source/test/release additions are reviewable with `git status`/diff.
ADR0030 avoids main's ADR0029 collision. Canonical new migration hash:
`3db1bfa44acfe078af7a0278c8b65b78f92489368b9d19a7a31bc7e8e32c6527`.
Original CRLF source-copy hash6e7cf is historical provenance, not publication bytes.
Existing installed revision/pause files are unchanged. PR85 remains intact.

## Verified and pending

Build, typecheck and lint passed (existing v2 hook warning). Initial full sweep:
3561 passed, one retained metadata test failed, 19 skipped. Failure was Windows
CRLF checkout drift in canonical fingerprint SQL. Pinning LF restores the exact
retained query hash and seven metadata tests pass; SQL Git blob is unchanged.
See the issue investigation for attempts and verified resolution.

New ordered PostgreSQL smoke applies the actual newer workout migration, preserves
an accepted compiled week, pauses, applies setup guard plus exact ledger bytes,
checks immutable replay, rejects old writers, accepts a bound fresh week and
re-pauses. Stale generation/catalog and duplicate installation are rejected.
PGlite PG18 is explicitly refused by the production PG17 identity guard; the local
test changes only that predicate to exercise SQL behavior. No PG17/hosted claim.

Independent reviewer cleared runtime scope and then renderer/smoke. Bootstrap
default includes bindings; `--revision-only` preserves historical rehearsal input.
Both generated manifests inspected. Generated evidence is git-ignored under
`output/setup-freshness-release` and `output/app-quality-release`. Dependencies
reuse the existing matching lockfile installation via a junction; no install.

Greg's September27 instruction, "Commit and push the work that is ready", supplies
authority for this scoped commit and branch push. It does not authorize the
pending revised hosted method or production rollout. A draft PR remains the next
review step; verify exact-head CI, including mobile journeys, before promotion.

Real PostgreSQL 17.6 rehearsal now passed on the separate fixed project
`sociusfit-setup-freshness-local` (API55421, DB55422, Studio55423, mail55424,
loopback-only). Original local project remains at18 Auth users with neither pause
nor setup guard installed. The new stack reuses existing rootless machine/network
and cached tools; no dependency install or shared-stack reset.

`setup-freshness-pg17.test.ts` passed with the unmodified production renderer:
real writer contention, pause/drain, exact migration+ledger, wrong-generation and
catalog rollback, duplicate refusal, old-writer rejection, bound-writer success,
clock-only expiry at unchanged revision, immutable accepted digests/replay.
The run resumed before installation after a test-only SQL NULL parsing failure;
bounded recovery verified the exact fixture and reran contention. Do not rerun
either bootstrap or upgrade on the now-installed stack. Its final gate is open at
generation6 for synthetic HTTP tests only. See the investigation for all attempts.

Production build with fixed local55421 destination passed; process19676 was
verified serving this candidate at127.0.0.1:3011 (exec session27184), then stopped
before the mobile suite reused `.next` for its local dev server. Rebuild with the
fixed local helper before starting another production HTTP run. Baseline
`local-app-flow.mjs --new-run --setup-rehearsal` passed14 real HTTP/Auth/RLS checks.
Dedicated clock-expiry HTTP harness passed all4 lifecycle groups: initial proposal,
current review, stored-review recovery, legacy conversion. Stale acceptance fails
with unchanged revision, expired saved review cannot gain new authority, confirmed
setup creates an accepted replacement, accepted snapshots/replay stay immutable.
Its receipt is `http-freshness-9f2d8434-bef2-4771-b389-1c90d978a5f8/result.json` under
`output/setup-freshness-release`. Sanitized combined evidence is tracked in
`docs/verification/programming-quality/setup-freshness-local-release-2026-09-26.json`.

Maintained local mobile journeys passed all26tests in4.7minutes, exit0, with
external services intercepted. Includes stale acceptance and replacement setup
at320/390 widths. See the [mobile/preflight receipt](../docs/verification/programming-quality/setup-freshness-mobile-preflight-2026-09-26.md).
Still required: exact committed-head CI (including mobile), fresh read-only hosted
preflight, final target-specific rollout approval.

The read-only preflight module and fixed-target Vercel metadata helper are now
prepared and independently reviewed. The SQL classifier passed 15 tests. Its
query ran on the isolated upgraded PostgreSQL17 database and correctly refused
that database as a hosted pre-install target. Query SHA256:
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.
Checks include the full reviewed pause catalog, exact prerequisite ledger,
normalized predecessor definitions and ACLs, plus accepted and superseded history
digests. Local execution is not hosted preflight success.

Hosted transport remains pending. Vercel connector validation failed three times;
stop that method. Approval for the reviewed GET-only CLI fallback is pending under
the failed-work guardrail. Browser inventory timed out twice without any SQL
submission; do not assume a browser session exists. See the investigation.
Final independent evidence review passed. One preflight detail: local bootstrap
normalizes historical CRLF to LF, so predecessor MD5s are local reference hashes.
Compare hosted definitions after only CRLF-to-LF normalization to that reference,
then retain fresh raw hosted hashes for the install renderer's transaction fence.
The runbook documents this distinction; do not require raw hosted/local equality.
Do not replay the old production cutover or run the historical revision-only
rehearsal against the default updated bootstrap. P0/P2/P3/JEV remain unfinished.

The [release contract](../docs/plans/setup-freshness-release-2026-09-26.md) specifies
targets, guarded migration ordering, exact approval scope, resume and forward
recovery. Production execution requires its own concrete approval after remaining
gates. The goal remains unfinished and blocked pending input. Board connection
remains deferred.
