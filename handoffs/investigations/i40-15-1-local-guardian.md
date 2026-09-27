# Local guardian rehearsal investigation

Owner: programming-quality thread. Scope: isolated local PostgreSQL only.
Current cycle: standalone guardian resolved on attempt3; integrated lifecycle
resolved on attempt2 with database-clock expiry proof. All local failure drills pass.
Hosted execution has never been attempted.

## Integrated attempt2 and failure drills — passed September27

Run `1b154f5f-5dbe-43c2-b03a-0abf8a6e8e39` passed all44 lifecycle steps,
independent-session containment, unchanged eight-table audit and both accepted
history digests. Database time is now observed after expiry, including a strict
millisecond comparison to avoid truncating PostgreSQL microsecond ordering.
Worker-failure `7b521ab4-1edf-4bfc-a64e-66b398ab0b85` and coordinator-crash
`5f01564f-98ce-4244-9f26-443e3ec66f85` contained successfully. The crash run's
post-pause recovery audit passed; only the isolated switch was restored. That
saved crash identity later verified stopping a credential-free/no-network local
orphan client. No failed lifecycle operation was replayed.

Shared provisioning run `91ea7bfb-6e79-4982-aa99-b6c9499e0a25` verified two
predefined Auth UUIDs, owner-scoped profiles and sealed sessions without changing
the gate.73 focused tests cover immutable intents, atomic signal publication,
expiry ordering, SQL boundaries and a single shared temporary login. Production
transport initialization is deliberately unexecuted. Source review found the
CLI login path can rotate credentials and remove network bans; the prepared
runner now uses one explicitly approved, fixed-endpoint login request with no
retry or unban path. The execution packet records that additional authority.

## 2026-09-27 attempt 1

The worker-success and parent-disconnect cases produced committed-pause receipts.
The writer-delay case failed: `trigger functions can only be called as triggers`.
The fixture incorrectly called `assert_coaching_writes_open()` directly. Source
confirms it returns TRIGGER. Replace that call with an explicit control-row
`FOR SHARE` lock and label the scenario a lock/drain simulation. Parent exited
without a third receipt; local readback was open generation16. Existing receipts
remain under `output/setup-freshness-release/guardian-local-*`.

## 2026-09-27 attempt 2

Revised asynchronous SQL and worker-exit checks reached startup, but failed
`guardian_start`. The child acknowledged `started` before validating the parent
timestamp, allowing opening before the guardian entered its loop. Local readback
was open generation22. No hosted state changed. The cross-process timestamp
comparison was not instrumented, so the precise clock delta is unknown.

After two attempts, inspection established that readiness ordering is incorrect
independent of the clock delta. Revised hypothesis: the guardian must own its
deadline clock and emit the start acknowledgement only from the validated state
machine. The parent cannot open until that acknowledgement. Add a focused test
that invalid startup never emits readiness, then run one integrated local check.
Also retain real worker-exit verification, asynchronous SQL bounds, and the
baseline-generation fence added through independent review. If attempt3 fails,
stop this blocker and prepare the required revised-method approval.

## 2026-09-27 attempt 3 — passed

The guardian now starts its own clock and acknowledges from inside the validated
state machine. All three real local scenarios passed: worker-success
`7111a036-433c-41e9-8207-fbc4d235aafd`, worker-crash
`f07ec72d-4245-4f82-b079-0767a5f186fb`, and control-row lock/drain simulation
`ce88b200-fb67-47da-ad4b-5c7f30d003c4`. Each receipt confirms worker process exit,
committed pause, containment and time bounds. The fixture switch was restored
open only after the closed generation was independently read. Independent review
found no blockers for this local/shared foundation. This proves termination of
an idle worker, not drainage of hosted in-flight fixture requests.

## Integrated attended lifecycle — attempt1, September27

Run `1b40f175-4fd1-4454-a230-74fbdf916282` launched coordinator and guardian
in separate execution sessions. Guardian verified worker termination, committed
pause and time bounds. Eight-table post-pause audit was unchanged. Lifecycle
failed at `stored-review-stale-accept_status` after20 completed steps. The
response was not preserved before assertion; future API steps now journal the
whole synthetic response before checking its status. Read-only PostgreSQL
evidence showed the proposal was accepted at17:14:31.738869Z and setup expiry
was17:14:31.786238Z: acceptance occurred47ms too early. The host-clock wait is
not a reliable database-expiry proof. Replace it with a read-only database-clock
observation before acceptance. No uncertain operation is retried; use fresh
synthetic owners and keys on the next attempt. Local fixture stays paused until
verified recovery audit and exact-generation restoration.

Independent review also identified cross-process partial evidence publication.
Named records now flush an encrypted staging file then publish it using an
atomic exclusive hard link. Cleanup failure cannot invalidate published
readiness; ordinary operation-intent partial files remain reserved/uncertain.

## Fixture transaction fencing — separate integration check

Attempt1 (`c8c4be0a-62d3-4c7f-a22e-3dbd6518b231`) successfully confirmed and
expired the synthetic memory through the new guarded transaction. The next
read-only revision check failed: `cannot execute INSERT in a read-only transaction`.
PostgreSQL diagnostics show `get_coach_context_revision()` initializes a revision
row via INSERT ON CONFLICT. Do not invoke that mutating helper for audit reads.
Read the existing owner-scoped revision row directly; the successful confirmation
already creates it through the revision trigger. Existing intents are retained;
the next rehearsal uses new synthetic identities rather than replaying them.

Fixture-fencing attempt2 passed: `ce770f96-fdc5-4089-941c-007339873285`,44steps,
52,246ms. Independent concurrency run `f771102b-b249-4381-8340-5fd490a5bea3`
also passed wrong-generation/no-write, writer-before-pause drainage, late-write
rejection, and pause-before-writer rejection. This resolves the fixture SQL and
mutating-revision-read issue. The end-to-end attended coordinator is still pending.
