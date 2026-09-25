# Production cutover: verified deployment, coaching paused

**Historical first-attempt result.** The corrected continuation was subsequently
approved and executed. Profile provisioning and paused rejection passed; the
create/accept operator stopped before HTTP. Current coaching state is paused at
generation 5 after the subsequent pre-armed attempt. See the
[current result](production-prearmed-result-2026-09-25.md).

Greg approved the exact September 23 cutover packet on September 24. Both pinned
migrations committed and passed exact catalog/ledger verification. The approved
build is now on all three production domains. **The release is incomplete and
coaching writes remain paused at generation 1.**

The single synthetic provisioning attempt created its Auth account and identity,
then profile insertion failed with SQLSTATE `23502`. No sign-in, weekly request,
proposal, acceptance or resume followed. A fresh read found no records for this
owner across all 54 public user-owned table scopes. The account is retained.

## Completed gates

- Preparation checkpoint `e9555ce` passed CI: 3,499 tests, 19 skipped, 26 mobile
  journeys, TypeScript, lint and production build.
- Fresh encrypted backup `backup-20260924111117-678fe2da`, locale receipt
  `locale-20260924111249-92cb2a35`, and isolated restore `restore-e7e23977-df8`
  passed all 94 table scopes, selected catalog checks and ICU comparison. Both
  exporter containers and the restore container are confirmed stopped.
- Exact pause migration and revision migration ledger source hashes match the
  approved files. All 14 functions and 16 triggers, RLS and effective grants match.
- Both pre-existing accepted/superseded plan versions retain identical immutable
  content hashes after revision installation. Raw identities/digests are encrypted.
- Production deployment `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`, source `93539b0`, build
  `u93phgwCcXfUdAb5YKaBh` is READY. All three aliases, redirects and 31 bindings
  match the approved scope; no new flag or numerical policy was enabled.

The first page check compared raw server HTML's ten scripts against an earlier
nine-script browser observation and stopped. Read-only reconciliation proved the
entire live HTML hash exactly equals the pinned tar's sign-in fallback HTML. The
extra chunk is also in that tar and its live bytes match. CSS, icon and both
redirect checks pass. The original failure is retained; why the earlier browser
observation omitted the chunk was not measured. This is an observation-method
correction, not a deployment retry or relaxed artifact identity check.

## Proven provisioning defect and next action

The existing production `set_user_profile_user_id` trigger calls `set_user_id()`,
which unconditionally sets `NEW.user_id = auth.uid()`. The service-role request
has no athlete subject, so it replaces the valid supplied UUID with NULL. The
local rehearsal omitted this base trigger. This is tracked as
`Fitness-Tracker-i40.12`; release tracking remains `Fitness-Tracker-i40.11`.

The corrected method reuses the one existing synthetic account, signs in with its
retained password, then writes its profile using its authenticated owner session.
No trigger change, second account, repeated admin-key read or deletion is needed.
The [continuation packet](production-cutover-continuation-2026-09-24.md) specifies
the additional one-shot attempt and remaining originally approved smoke gates.
It is not executed until Greg approves it.

After revision installation, the old unstamped application is incompatible.
Keep coaching paused until the remaining checks pass; do not roll back to it or
resume based only on successful deployment. No PR merge, paid service, production
restore or numerical programming-policy activation occurred.

Evidence: [sanitized execution receipt](production-cutover-result-2026-09-24.json)
and [investigation](../../../handoffs/investigations/programming-quality-cutover-execution.md).
Private account credentials, responses, IDs and row evidence remain encrypted in
the approved Windows recovery directory. The encrypted transport copies contain
no plaintext and remain ignored by Git. Local cryptographic and read-only
verification helpers have independent review; sensitive production data was not
printed or committed.
