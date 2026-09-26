# Coaching write-pause operator procedure

**Preparation only. Production installation/pause/resume is unexecuted and needs target-specific approval. The approved revised local rehearsal passed all 14 multi-session checks on cycle 2 attempt 1; see [the receipt](./local-coaching-pause-2026-09-23.json) and [the investigation](../../../handoffs/investigations/programming-quality-write-pause.md). This is local synthetic evidence, not a completed production release gate.**

The selected migration is `supabase/migrations/20260923010000_coaching_write_pause.sql`. It guards six coaching-output tables; it does not freeze all database writes or replace a consistent backup snapshot. Current coaching RPC branches return their existing generic HTTP 503 response for `PT503`, without a maintenance-specific message. This follows source inspection; HTTP behavior under pause was not exercised here. Direct PostgREST custom-status behavior is not an authenticated HTTP result from this rehearsal. Reads and genuinely read-only accepted replay may continue. Source mutations that touch protected rows through cascades are blocked too.

## Prerequisites and installation order

Before any production action, verify the exact project/database, backup/recovery receipt, six existing table definitions, operator identity and current compatible application artifact. Read the existing `postgres` role privileges; the new migration requires SUPERUSER or BYPASSRLS for its FORCE-RLS trigger owner and grants no new role privilege:

```sql
SELECT current_database(), current_user, session_user, version();
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='postgres';
```

Explicitly install this additive pause migration **before** the revision migration `20260921010000_coach_proposal_context_revision.sql`, despite filename order. Do not run a chronological batch and claim the pause protected a migration that already ran. Use a client configured to stop on errors (`psql -v ON_ERROR_STOP=1 -f <verified-file>`), no connection strings/secrets in transcripts. The migration has its own BEGIN/COMMIT and acquires all six target-table installation locks NOWAIT. A busy installation rolls back completely; inspect contention before an approved retry. No connection termination or automatic repeat loop is included.

After successful installation, verify the singleton, six triggers, actual function definitions and ACL/RLS against the reviewed migration. Initial state is open (`paused=false`, generation 0). Reapplying preserves existing state and fails closed if its singleton is missing. Application roles, including service_role, must not have SELECT/UPDATE on control or EXECUTE on either helper.

## Pause and prove drain

Read current state through the approved operator connection:

```sql
SELECT singleton, paused, generation, reason, changed_at, changed_by
FROM public.coaching_write_control;
```

Record that generation. In the following example `42` is a placeholder for the exact generation just observed, not a default or auto-discovered value:

```sql
BEGIN;
SELECT * FROM public.set_coaching_write_pause(
  TRUE, 42, 'Approved coaching cutover; operator change reference here'
);
COMMIT;
SELECT paused, generation, reason, changed_at
FROM public.coaching_write_control;
```

Require successful function execution, a real successful **COMMIT**, and independent readback `paused=true`, generation `43`. A sent request, an open transaction, a returned row before COMMIT or an error followed by ROLLBACK is not drain proof. New compatible SHARE holders can enter while pause waits; the five-second per-lock cap can time out. Such a failure means no new pause was established; preserve error/current-state evidence and investigate before controlled retry. Once committed, existing guarded writers have finished and new writes fail until a later committed resume.

Record unchanged accepted-plan hashes and a synthetic/approved maintenance rejection check in the actual authorized environment. Operator disconnect after commit must not reopen writes. If state readback is ambiguous, remain paused/unknown and investigate rather than blindly toggling it.

## Cutover and compatible rollback

While verified paused, apply the separately approved revision schema and route traffic to the compatible candidate. Confirm target schema, migration hashes, application artifact identity and readiness before resume. If reverting the application, use the retained revision-compatible artifact; reverting to the old unstamped production writer is incompatible. Keep the gate and revision guards installed; do not drop guards, rewrite accepted data or restamp old drafts. Application rollback and database restoration are different operations with separate approval.

## Resume with generation compare-and-set

After the concrete cutover/rollback checks pass, read state again and use its exact generation (example `43`):

```sql
BEGIN;
SELECT * FROM public.set_coaching_write_pause(
  FALSE, 43, 'Verified compatible artifact; approved resume reference here'
);
COMMIT;
SELECT paused, generation, reason, changed_at
FROM public.coaching_write_control;
```

Require `paused=false`, generation `44` after successful COMMIT. `40001` means the state changed or singleton is missing; do not reuse stale expected generation or override state directly. Verify an authorized fresh stamped write plus immutable accepted replay. Keep the control installed and record observed generations, artifact identities and checks. No lease/expiry or automatic recovery resumes writes.
