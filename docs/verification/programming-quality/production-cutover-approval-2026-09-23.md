# Production cutover approval packet

**Local preparation is complete and independently reviewed. Production execution
still requires Greg's explicit approval and successful final-checkpoint CI.**
The staged deployment is READY and bounded hosted checks passed. No production
migration, coaching pause, synthetic account creation or promotion has occurred.

## Exact target

| Item | Pinned identity |
| --- | --- |
| Vercel deployment | `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7` |
| Application source | `93539b00bef9109f4221d10c9554cd99a3f5d5fe` |
| Deployment URL | `https://fitness-tracker-je2rwxwh4-gregs-projects-98860c8b.vercel.app` |
| Build ID | `u93phgwCcXfUdAb5YKaBh` |
| Vercel project / team | `prj_RocmjxStsTrtmrDaqMddMnb29ENh` / `team_zjdKVgrSBNAYC9gql0Raiocm` |
| Supabase project / database | `auolnfwetmfcwhtvakzy` / `postgres` |
| Production aliases | `www.sociusfit.com`, `sociusfit.com`, `sociusai.vercel.app`; existing redirects preserved |
| Artifact tar SHA256 | `461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814` |
| Pause migration SHA256 | `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041` |
| Revision migration SHA256 | `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f` |

## Approval requested

Approve one attended production cutover on those exact targets, starting after
fresh preflight and final CI success. Reserve 45 minutes; this is a soft
maintenance window, not an automatic resume deadline. The approved actions are:

1. Install the exact pause migration with its ledger record in one transaction.
   Commit the generation-checked coaching pause and independently prove drain.
2. Capture a fresh encrypted production snapshot, refresh source locale metadata,
   and restore that new archive once into the existing private isolated local
   recovery environment. Require complete comparison and stopped-container proof.
3. Install the exact revision migration while paused, atomically with its ledger
   record. Verify definitions, grants, RLS, triggers and accepted-plan invariants.
4. Promote only the pinned production-configured deployment, preserving all 31
   runtime bindings, all three aliases and their redirect settings. Existing
   WHOOP cron behavior remains as previously disclosed; no new capability flag
   or numerical programming policy is enabled.
5. Read the existing project API keys once through the official Supabase CLI;
   use only the verified existing service-role value for the one frozen synthetic
   account/profile and the matching anon value for sign-in. Permit the existing
   temporary database CLI login refresh needed for recovery. No key creation,
   rotation, password reset, public bypass token or credential logging is included.
6. Create the one dedicated synthetic owner, verify paused rejection, briefly
   resume to create/accept one three-session plan, immediately re-pause, replay
   the same acceptance and compare immutable records, then resume finally only
   after all required checks pass. Retain the synthetic records; do not delete.

Before revision installation, a failed fresh-recovery gate may conditionally
resume the old application only after independent proof that revision objects
and ledger entry are absent and the old production mappings remain unchanged.
After revision installation, failure means preserve/re-establish the verified
pause and stop. Never return to the old unstamped application. An uncertain
operation is reconciled read-only; no automatic retry or unpinned rollback.

## Material effects and limits

The gate stops writes to six coaching-output tables, not the whole database.
Coaching writes can be unavailable during the maintenance window. During the
brief global resume, real athletes can also write. Each smoke request has a
15-second client deadline; start re-pause immediately after acceptance/error and
no later than 60 seconds, targeting confirmed closed state by 90 seconds. Those
are attended operator bounds, not guaranteed containment if the connection fails.
A timeout does not prove that a database transaction or remote promotion stopped.

The new archive remains encrypted on this Windows host; it is not off-device
recovery or a full restore of hosted services. The retained compatible artifact
has the same application code as the candidate, so it does not undo a code defect.
A failure after revision installation can require remaining paused for a fix.
No PR merge, production restore, broad database push, account deletion, session
termination, paid plan/resource or numeric VBT-policy activation is authorized.

## Concrete procedures and evidence

- [Execution sheet](production-cutover-execution-2026-09-23.md): exact promotion,
  fresh backup/restore commands, all-alias readback, deadlines, failure paths and
  unique exporter identification/cleanup.
- [Migration procedure](production-cutover-migrations.md): pinned SQL rendering,
  atomic ledger insertion, exact postchecks and generation-bound operator SQL.
- [Smoke procedure](production-cutover-smoke.md) and [frozen input](production-cutover-smoke-input-2026-09-23.json):
  one run identity, credentials boundary, API requests, three expected sessions,
  full synthetic-row replay digests and fixed-ID existing-plan invariants.
- [Real PostgreSQL evidence](../../../scripts/release/cutover-migrations.local-evidence.json):
  10 checks passed, including injected schema/ledger rollback failures, catalog
  parity and stale-generation rejection; later read-only editor normalization
  checks preserve both exact original ledger files. Eight focused tests and full
  TypeScript pass. Independent review reran the focused tests.
- [Hosted checks](production-hosted-checks-2026-09-23.json) and
  [platform readback](production-cutover-platform-2026-09-23.json): rendered build,
  sampled asset hashes, signed-out rejection bodies, unchanged bindings, three
  aliases and no configured rolling release. HTTP status was not exposed by the
  browser; authenticated production behavior remains part of the future smoke.

The revision migration already had mixed line endings. Its reviewed local bytes
are now preserved in Git with a path-specific attribute; no SQL content changed.
The staged blob and checkout filtering with autocrlf disabled both match the
approved hash. Ledger literals escape CR/LF so SQL Editor normalization cannot
change the stored original. [Preparation investigation](../../../handoffs/investigations/programming-quality-cutover-preparation.md)
preserves the two failed Git preservation checks and successful third correction.

Full CI passed for prior checkpoint `5ca1ad4`, run `35939161527`. The final saved
checkpoint's CI must also pass before production execution; Beads i40.11 and PR84
carry its exact commit/run status. The application source and deployed artifact
remain unchanged by these operator helpers and documentation.
