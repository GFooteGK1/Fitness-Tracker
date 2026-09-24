# One corrected production smoke continuation

**Proposed only. Coaching is paused at generation 1; the new build and both
migrations are already installed. Greg's approval is required for one additional
provisioning attempt after the first failed profile insert.**

The [execution result](production-cutover-result-2026-09-24.md) records completed
gates, the exact error and its read-only reconciliation. This packet extends the
[approved cutover packet](production-cutover-approval-2026-09-23.md) only as below.
All existing target, timing, failure, privacy and no-spending boundaries remain.

## Concrete corrected method

1. Refresh the exact deployment/domain/binding identities, migration identities,
   closed gate generation and the existing synthetic account's baseline. Require
   one Auth user/identity, no session and zero owned public application rows.
2. Reuse the encrypted account/password from the failed attempt and the verified
   frozen public anon binding. Sign in once. Create the frozen profile once as
   that authenticated owner, so the existing trigger resolves `auth.uid()` to
   the correct account. Verify an empty weekly program.
3. Preserve the original failed attempt and create a distinct continuation marker.
   Require the known `23502` response and absent prior success/session; do not
   erase evidence or bypass the one-shot guards. No new account or API-key read.
4. Complete the remaining original smoke sequence: verify paused rejection;
   temporarily resume, create and accept the one frozen three-session proposal;
   immediately re-pause; replay the same acceptance; compare owned row digests
   and the fixed two pre-existing accepted-plan hashes; finally resume only if
   every required check passes.

The concrete helper is output/app-quality-release/cutover-20260924/continue-provision.mjs, SHA256
6d9b780644f6c5385934c2404469ee929da2af768d79b61798a79d4463364285.
Three focused tests passed and were independently rerun: the exact unconditional
trigger rejects the admin insert with 23502 and no row; authenticated ownership
works without permitting a foreign owner; the installed SDK sends the correct
owner authorization and frozen profile. Independent review found no blocker.
The trigger fixture is synthetic and does not establish full hosted schema parity.
The helper has not been invoked against production.

## Bounds and failure behavior

One additional provisioning attempt only. No automatic retry. An uncertain or
failed sign-in/profile/application result stops dependent operations and leaves
or re-establishes the independently verified pause. The existing timing bounds
apply during the brief global resume: 15-second request deadline, start re-pause
immediately after acceptance/error and within 60 seconds, target confirmed closed
by 90 seconds. Real athletes can also write while the global gate is open.

Reserve another attended 20-minute continuation window after fresh preflight.
This is a soft target, not permission to resume automatically. No new backup or
restore attempt is included; the earlier fresh verified archive remains retained.
Any changed target, unexpected owned records, missing baseline or incompatible
schema requires review before continuing.

This does not authorize a trigger/schema change, another account, another
service-role read, deployment retry, deletion, PR merge, paid resource or numerical
policy activation. Do not return to the old incompatible application.

## Why approval is required

The previously approved execution sheet says: **"Do not issue a second
installation, backup, restore, promotion or smoke attempt automatically."**
This is one additional, corrected provisioning attempt using the existing account.
The revised method is concrete and verified before requesting that approval.
