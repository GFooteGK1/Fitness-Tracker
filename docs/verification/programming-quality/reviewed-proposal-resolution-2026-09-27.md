# Reviewed proposal resolution verification

Date: September 27 Chicago / September 28 UTC. Tracker: Fitness-Tracker-u5l.6.12.
Scope: local implementation and synthetic loopback verification. Task remains
in progress for actual browser/network lifecycle evidence and subsequent gates.

## Verified behavior

- Exact owner/program/operation/key/identity resolution recovers saved issuance
  or acceptance, including acceptance of a week later superseded.
- Unissued requests acquire immutable closure under registration/request/program
  locks. Late registration and issuance cannot apply them. Alternate registration
  IDs cannot bypass a closed key; alternate keys cannot bypass a closed registration.
- Unaccepted proposed and expired proposals close without changing the active
  week or discarding target prescriptions, slots or original rationale. A delayed
  acceptance cannot apply the closed proposal.
- Existing registration metadata may replay after closure. That preserves exact
  receipts but does not permit issuance. Tests explicitly distinguish the two.
- UI resolution is deliberate. Original requests survive errors and reload;
  validated results archive before pending state is cleared. Historical accepted
  weeks are distinguished from current activation. Archives omit mutable active
  pointers so a failed local removal can recover after a subsequent plan change.
- Resolution storage remains private, FORCE RLS, with no API table grants;
  foreign, anonymous and service-role resolution requests fail. Deployed route
  composition remains hard-disabled and the trusted registry remains empty.

## Evidence

- 168 tests in 11 focused suites passed. Dedicated UI cases cover expired close,
  lost close response/reload, fresh preparation after verified closure, historical
  accepted recovery, account mismatch, invalid identities and storage failures.
- Full `npx tsc --noEmit --incremental false` and scoped ESLint passed.
- Independent review ran 79 tests and found a test-fidelity issue: registration
  metadata replay after closure is valid. The corrected harness preserves that
  contract and asserts issuance denial/no target creation. No implementation
  safety blocker was identified.
- Final real local Auth/PostgREST/PostgreSQL harness passed **408 checks**:
  `output/app-quality-release/reviewed-proposal-bc8e62fb-3703-46f8-9592-651467ebaf9f/receipt.json`.
  It exercises deterministic writer-before/resolver-before orders and concurrent
  registration/issuance/acceptance, exact replay, immutable evidence, late writers,
  uppercase-path HTTP closure, historical acceptance and legacy regressions.
- HTTP proof uses actual Request/Response handlers backed by local Auth and DB.
  UI tests use mocked transport. This is **not actual browser/network E2E proof**.

## Installed migration and failures

Applied `20260928080000_reviewed_proposal_resolution.sql` once to the existing
synthetic container. SHA256:
`E26D28120B3EBC5D69936E6988200A117718E80DAB769A3A5196A649657912F2`.
Apply log: `output/app-quality-release/reviewed-set-migration-3cfe7612-70c8-49cb-8794-aa40160aff64.log`.
No reset, bootstrap replay, fixture deletion or hosted migration occurred.

First expanded harness run failed because the synthetic expired proposal lacked
decided_at. Live read-only constraint inspection confirmed the fixture error;
matching the actual expiry transition resolved it. See
`handoffs/investigations/Fitness-Tracker-u5l.6.12.md`. No unresolved failure cycle.
Installed SQL was not edited or replayed.

Next: actual local browser -> HTTP server -> Auth/PostgREST lifecycle using a
test-only trusted composition without a production enable switch. Then assess
all .12 acceptance checks and W10/broader QPlan gates. Numerical policy remains
false; no hosted changes, activation, commit or push in this batch.
