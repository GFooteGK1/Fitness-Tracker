# Setup-freshness live verification preparation

Status: local lifecycle and failure rehearsal verified; dedicated hosted runner
and execution packet prepared under `Fitness-Tracker-i40.15.1`. The user selected live synthetic
lifecycle checks before rollout. This is not deployment or credential authority.
Canonical preparation child closed after independent acceptance. Board handoff
delivered and read back at version51; parent release task remains in progress.

## Latest integrated checkpoint — September 27

All 44 steps passed with a guardian launched in a separate execution session:
`1b154f5f-5dbe-43c2-b03a-0abf8a6e8e39`. Worker termination, committed pause,
unchanged eight-table non-synthetic audit and both accepted-history digests passed.
Worker-failure run `7b521ab4-1edf-4bfc-a64e-66b398ab0b85` and coordinator-crash
run `5f01564f-98ce-4244-9f26-443e3ec66f85` both contained. Post-crash recovery
audited before restoring only the isolated fixture switch. A no-network idle
client additionally verified saved-identity orphan-container cleanup.

Shared provisioning run `91ea7bfb-6e79-4982-aa99-b6c9499e0a25` passed two
preassigned real local Auth identities, owner-authenticated profiles, encrypted
session readback and unchanged coaching gate. 73 focused tests, typecheck and
lint pass; the existing v2 hook warning remains. No application/migration source
changed, and existing CI does not cover the new harness files.

Integrated attempt1 exposed a real harness bug: acceptance preceded DB expiry by
47ms despite the host-clock wait. The corrected path proves expiry using database
time, conservatively beyond the same millisecond. API responses persist before
assertion. Cross-process named evidence is atomically published after flush.
The full investigation and original receipts are retained.

The dedicated hosted coordinator, owner worker, provisioning flow and independent
guardian are now prepared. Production SQL reuses one encrypted temporary login
issued through a fixed no-retry Management API request; it does not invoke the
CLI's login/password-rotation or automatic network-unban behavior. Recovery uses
a fresh exact-generation gate read and distinct audit. These hosted paths have
not contacted production. Execution credentials, role issuance, synthetic writes,
global reopen and rollout remain separately authorized steps.

See the [prepared execution packet](setup-live-execution-packet-2026-09-27.md)
and [ADR-0031](../../decisions/ADR-0031-attended-setup-lifecycle-verification.md).
Final independent preparation review passed with no blocking findings. Next
release gates are a committed harness checkpoint with CI, fresh preflight and
explicit coordinated rollout approval. Older sections
below preserve the previous checkpoints and are superseded where they describe
the hosted runner or integrated rehearsal as not yet implemented.

## September 27 transport-preparation checkpoint

The transaction-fenced fixture renderer, encrypted journal and Windows private
storage binding, fixed-target owner HTTP adapter, and aggregate audit are now
implemented. 55 focused tests, typecheck and lint pass. Independent review is
clear after fixing streaming response limits and encryption key references.

Real local lifecycle `ce770f96-fdc5-4089-941c-007339873285` passed all 44 steps in
52,246ms using the fenced SQL. Concurrency run
`f771102b-b249-4381-8340-5fd490a5bea3` proved both lock orderings, wrong-generation
rejection and late-write rejection. The operator-only fixture transaction takes
the coaching control row's `FOR SHARE` lock before any mutation and requires the
exact open generation. Its lock lasts through commit; a committed pause drains
earlier fixture writes and prevents later ones without changing production schema.

Windows storage probe `1214b9e5-ca3d-4280-9b2f-ac82e5487e44` verified a new local
DPAPI key, encrypted readback, the correct key reference and restart refusal to
reuse an intent. No network was used. The eight-table audit query also passed
against real isolated PostgreSQL in a read-only transaction; this validates the
query, not a final before/after production audit. Its result explicitly remains
`globalHistoryVerified:false` until integrated containment and readback exist.

The HTTP adapter is tested with a fake transport and has never contacted
production. The remaining implementation is the privileged fixed-target SQL
transport and attended coordinator: secure fixture dispatch, independent guardian
process/session, encrypted operator records, paused baseline, complete lifecycle,
verified worker exit and committed pause, then global and synthetic history
readback. Rehearse that combined path and failure paths before rollout approval.

Board run `programming-live-transport-a7fc9623-ca40-4c56-bd25-b72ac9a92933`
owns I40-15 and remains active across continuation turns. The preceding run had
ended but retained its claim; its claim was explicitly released, then the current
claim was delivered/read back at version48. Reuse this active run; a new assistant
turn is not itself a new reporting run.

## Verified local evidence

- Candidate application build passed at `f8718aa` with build ID
  `p8KIBbh3R2vCLvqNfgt6i`. The application and migration are unchanged.
- Shared lifecycle run `683540c5-1a64-4a29-8a61-5866a98321ed` passed 44 ordered
  steps in 56,938 ms against loopback Auth/PostgreSQL: initial setup expiry and
  recovery, stored-review expiry, fresh-review recovery, legacy conversion expiry
  and recovery. The new accepted current week is read back. Original accepted
  intent, input snapshot, scheduled sessions and prescriptions remain unchanged.
- Local guardian checks passed with a real separate guardian and idle worker:
  `7111a036-433c-41e9-8207-fbc4d235aafd` normal completion,
  `f07ec72d-4245-4f82-b079-0767a5f186fb` worker termination,
  `ce88b200-fb67-47da-ad4b-5c7f30d003c4` shared-lock/drain simulation.
  Each verifies worker exit and the committed closed database generation. The
  local fixture switch was restored only after independent closed-state readback.
- 37 focused tests pass. Typecheck passes with `--incremental false`. Lint passes
  with the existing `app/v2/page.tsx` hook warning. Independent review found no
  blocking findings for this local/shared foundation.
- Two failed guardian attempts and the successful third attempt are retained in
  `handoffs/investigations/i40-15-1-local-guardian.md`.

The shared worker records exact requests before dispatch, fixes all confirmation
and proposal request IDs in the manifest, refuses uncertain mutation retries,
and checks deadline/abort after completion persistence. The guardian attempts
containment even if worker termination fails, but cannot call that full
containment. It can fence the still-paused baseline generation to invalidate a
late opening; if opening wins the race, a fresh read permits one distinct CAS
against the open generation. Neither CAS may be repeated at its generation.

## Remaining preparation and acceptance boundary

The local scripts have no hosted mode. Do not point them at production or weaken
their fixed-loopback checks. The shared worker and guardian accept reviewed
adapters; that abstraction is not proof of a production connection.

The storage and owner HTTP building blocks exist; the attended executable still
needs the dedicated two-owner provisioning manifest and privileged SQL transport.
Keep privileged credentials outside the worker; use authenticated owner profile creation, exact owner/memory identities,
the correct production cookie prefix, and no account deletion. Bind the manifest
to the actual candidate deployment, independently verified source, current
paused generation and frozen migration hash. New production credentials or
accounts require explicit execution authority.

The production containment implementation must survive a worker or coordinator
failure in an independent execution session. It must positively verify worker
termination **and drain in-flight privileged fixture requests**. The transaction
fence above now proves fixture drainage in local PostgreSQL. All hosted fixture
dispatch must use that exact fence; `coach_memories` itself remains outside the
six-table global pause. The combined independent-process lifecycle and audit
rehearsal remains necessary before hosted execution.

Collect encrypted baseline hashes for non-synthetic coaching state and accepted
history while paused. After verified containment, compare the same state and
repeat synthetic history reads. The global switch briefly permits real athlete
writes: any non-synthetic changes make clean-isolation evidence inconclusive and
must be investigated, never restored or silently ignored. Keep numerical policy
disabled throughout.

Only after these adapters, integrated failure rehearsal, independent review and
the coordinated release packet are ready should rollout approval be requested.
The existing CI 36330119709 belongs to committed `f8718aa`; it does not cover these
new uncommitted harness files. No merge, deployment, hosted mutation or numerical
activation occurred during this preparation.
