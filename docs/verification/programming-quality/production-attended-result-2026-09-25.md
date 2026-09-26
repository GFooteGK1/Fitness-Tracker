# Approved programming cutover completed

Coaching writes resumed on September 25 at **12:55:48 UTC (7:55 a.m. Central)**.
An independent database read at **12:56:06 UTC** confirmed `paused=false`,
generation **8**, on Supabase `auolnfwetmfcwhtvakzy`.

The [sanitized result receipt](production-attended-result-2026-09-25.json) includes
the authenticated verification summaries, timestamps and evidence hashes.
The user approved the [session-renewal amendment](production-session-renewal-approval-2026-09-25.md)
and continuation of the [attended packet](production-cutover-attended-approval-2026-09-25.md).

## What passed

- One same-account session renewal while paused. The original encrypted session
  and all earlier failed-attempt records remain preserved.
- One attended opening from generation 5 to 6, HTTP 201 proposal creation,
  HTTP 200 acceptance, and immediate re-pause to generation 7. Containment began
  6.690 seconds after controller entry; closed state was independently observed
  after 10.462 seconds. No model round trip occurred inside that interval.
- Independent authentication of saved request outcomes and the SQL identity
  join: exact program, plan, proposal, frozen idempotency key, fingerprint,
  context revision zero and three scheduled dates.
- One HTTP 200 acceptance replay while paused. Accepted identity and all seven
  table count/full-row digest pairs remained identical. The two original fixed
  plans still match the original pre-revision baseline.
- Exact schema catalog: 14 functions, 16 triggers and two relations. Both
  migration ledger entries matched their approved names and source hashes.
- Fresh production checks: the pinned deployment, all three aliases, preserved
  redirects, 31 unchanged runtime bindings, exact app build/HTML and sampled
  assets. Application and preparation-checkpoint CI passed.
- Retained fresh recovery evidence: authenticated backup and isolated restore,
  all 94 physical scopes, selected catalog/security and verified container cleanup.
- One final resume from generation 7 to 8, with a separate committed-state read.

## Release boundary

Production remains deployment `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`, application source
`93539b00bef9109f4221d10c9554cd99a3f5d5fe`, build `u93phgwCcXfUdAb5YKaBh`.
This continuation made no new deployment, migration, account, paid-resource or
numeric-policy change. The old unstamped application remains an incompatible
rollback target. PR #84 remains a draft; it was not merged.

The broader programming-quality QPlan is still partially implemented.
`initialDosePolicy` remains disabled. This synthetic release check proves
creation, explicit acceptance and replay invariants; it does not prove athlete
outcomes or complete APEX programming parity. The profile-provisioning fixture
gap remains tracked as `Fitness-Tracker-i40.12`.

Private identifiers, credentials and raw owner records remain encrypted outside
Git. The exact operator sources are retained in the previously verified private
archives. Historical failures are preserved in the cutover investigation.
Project board reporting is not connected because the mapping has no SociusFit
entry; Beads and repository handoffs remain authoritative.
