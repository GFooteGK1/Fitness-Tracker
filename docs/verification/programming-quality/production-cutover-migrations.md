# Exact migration and operator procedure

Preparation only. Production installation, pause/resume and application promotion
still require the target-specific approval in the
[cutover packet](production-cutover-approval-2026-09-23.md). This procedure does not
change either migration, activate a capability or authorize any hosted write.
Issue: `Fitness-Tracker-i40.11`.

## Files and atomic ledger contract

| Order | Original migration | SHA256 |
| --- | --- | --- |
| 1 | `20260923010000_coaching_write_pause.sql` | `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041` |
| 2, only after committed pause and fresh recovery capture | `20260921010000_coach_proposal_context_revision.sql` | `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f` |

`scripts/release/cutover-migrations.mjs` only reads local source and renders SQL or
compares saved catalog JSON. It has no database client, connection, credentials
or network capability. It rejects a changed migration hash or transaction
envelope. Both original files retain their own BEGIN/COMMIT. The renderer adds
preflight statements immediately after BEGIN and one ledger INSERT immediately
before COMMIT. All original SQL remains present, in order. It stores the complete
original file as one `text[]` element in `statements`, together with its exact
version and filename-derived name. A ledger error rolls back the migration; no
ledger record can commit ahead of its schema changes.

The reviewed revision file has mixed line endings. Its earlier normalized Git
blob SHA256 was `084ce3604b20809463c82f33a54434bd537a7f1a535ef7fe25f667a8088f544c`;
that is not the approved raw-file identity above. The narrow `-text` attribute
preserves the approved bytes across checkouts. The pause file is pinned as LF.
These attributes change no SQL semantics or deployed application artifact. The
renderer explicitly escapes CR/LF/tab in source-valued E-strings so SQL Editor
newline normalization cannot change the exact recorded original file.

Do not apply the original file and then insert its ledger record in a separate
transaction. Do not wrap a file that owns COMMIT in `psql --single-transaction`.
Do not use `ON CONFLICT`, migration repair, a broad database push or an automatic
retry. An existing ledger entry or an unrecorded boundary object requires review.

The existing ledger is locked with `SHARE ROW EXCLUSIVE NOWAIT` through COMMIT.
The pause migration separately obtains its existing six table locks NOWAIT. The
revision installer requires the exact recorded pause file, `paused=true` and an
explicit observed generation. It locks that singleton `FOR UPDATE NOWAIT` until
COMMIT to prevent a concurrent resume. New protected writers fail their own
NOWAIT gate read rather than wait while holding application locks. This adds no
new persistent function, trigger or role privilege beyond the two original files.

## Operator transport and target confirmation

Use Greg's already signed-in Supabase dashboard SQL Editor for project
`auolnfwetmfcwhtvakzy`, database `postgres`, after explicit approval. Confirm the
project in the browser URL and project header; SQL cannot attest the project ref.
Do not paste credentials or use a newly configured production client. The existing
private recovery helper remains read-only and must not be repurposed to execute
these files.

Before the approved write, run this metadata query in the same verified editor:

```sql
SELECT current_database(), current_user, session_user,
       current_setting('server_version_num');
SELECT rolname, rolsuper, rolbypassrls
FROM pg_catalog.pg_roles WHERE rolname='postgres';
SELECT column_name, data_type, udt_schema, udt_name
FROM information_schema.columns
WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
ORDER BY ordinal_position;
```

Require `postgres`, PostgreSQL 17, effective role `postgres` (or an existing
operator allowed to SET ROLE postgres), existing SUPERUSER or BYPASSRLS for
postgres, and ledger columns `version` text, `name` text and `statements` text[].
Additional nullable ledger columns do not need to be populated. Do not create
or alter the production ledger to satisfy this procedure. Earlier read-only
dashboard/source evidence establishes the intended database/operator; this does
not claim a production write through SQL Editor has already been tested.

Submit one entire rendered transaction as one editor execution. Require an
unambiguous successful execution through its final COMMIT, not merely a returned
pause RPC row. Then open a fresh editor query for independent readback. A timeout,
transport error or uncertain result is ambiguous: inspect committed state and
ledger before doing anything else; do not resubmit the installation. The explicit
transaction remains atomic even if the client does not provide psql's error-stop
option. A PostgreSQL error aborts it, and no INSERT after that error can commit.

## Prepare the exact SQL locally

Run from the reviewed worktree. Save generated SQL under ignored output and
review it before pasting. The examples use a new output folder; do not overwrite
an earlier execution's evidence.

```powershell
New-Item -ItemType Directory output/app-quality-release/cutover-operator-prepared
node scripts/release/cutover-migrations.mjs install pause |
  Set-Content output/app-quality-release/cutover-operator-prepared/install-pause.sql -Encoding utf8NoBOM
node scripts/release/cutover-migrations.mjs readback pause |
  Set-Content output/app-quality-release/cutover-operator-prepared/readback-pause.sql -Encoding utf8NoBOM
```

Apply only `install-pause.sql` at this stage. Its initial committed state must be
open, generation 0. In a fresh query execute `readback-pause.sql`. Require the
identity result, exactly one ledger row with `exact_original_file=true`, and the
one singleton. Export the `cutover_catalog` JSON result without changing it, then:

```powershell
node scripts/release/cutover-migrations.mjs verify pause output/app-quality-release/cutover-operator-prepared/pause-catalog.json
```

Require `matched:true`. The comparator checks actual function definition hashes,
owners, SECURITY DEFINER/configuration, effective grants for anon/authenticated/
service_role, forced RLS, control-table columns/constraints/indexes/policies, and
the exact six enabled statement triggers. Do not accept counts alone. The saved
expected catalog comes from independent execution of the two pinned files in
the existing migration fixture; local PostgreSQL17 verification is recorded below.

## Commit pause, then install revision

Read the current generation in a fresh operator query:

```sql
BEGIN READ ONLY;
SET LOCAL ROLE postgres;
SELECT paused,generation FROM public.coaching_write_control WHERE singleton;
ROLLBACK;
```

The following `42` is an example only. Replace it with the exact observed decimal
generation; the tool deliberately has no automatic generation discovery.

```powershell
node scripts/release/cutover-migrations.mjs gate pause 42 "Approved cutover reference" |
  Set-Content output/app-quality-release/cutover-operator-prepared/pause.sql -Encoding utf8NoBOM
```

Submit the whole transaction, require successful COMMIT, then independently read
`paused=true`, generation 43. Only that commit/readback establishes drain. Five
seconds is a per-lock operational cap; the operator statement timeout is 15
seconds. Neither is a guaranteed browser/request deadline. Failure means no new
pause has been established. Missing/ambiguous state is never successful
containment. No connection termination or retry loop is authorized here.

Take the separately specified fresh encrypted recovery capture while committed
paused. Keep the previously verified archive. Record its required acceptance
boundary from the overall cutover sheet; this migration helper does not capture
or certify it. The gate protects six output tables, not unrelated database traffic.

Use the generation just independently observed for revision rendering:

```powershell
node scripts/release/cutover-migrations.mjs install revision 43 |
  Set-Content output/app-quality-release/cutover-operator-prepared/install-revision.sql -Encoding utf8NoBOM
node scripts/release/cutover-migrations.mjs readback revision |
  Set-Content output/app-quality-release/cutover-operator-prepared/readback-revision.sql -Encoding utf8NoBOM
```

Submit the revision transaction once. After successful COMMIT, run fresh
`readback-revision.sql`: require the exact ledger entry, the same paused generation
and all catalog comparisons. Export its catalog JSON and require:

```powershell
node scripts/release/cutover-migrations.mjs verify revision output/app-quality-release/cutover-operator-prepared/revision-catalog.json
```

This verifies all 14 affected functions, 16 gate/revision triggers and both guarded
tables, including grants and policies. It does not replace the packet's separate
accepted-prescription digests, compatible deployment checks or synthetic API flow.
The pre-install release classifier must not be reused as a post-install verifier.

## Resume, re-pause and uncertainty

Render `gate resume OBSERVED_GENERATION "Reviewed reason"` only after the overall
cutover sheet permits that resume. Require its COMMIT and independent
`paused=false`, generation `OBSERVED_GENERATION+1`. Re-pause uses the same `gate
pause` renderer with the newly observed generation. A separate ready operator
query must be available during the temporary open interval; the root execution
sheet fixes its timing and failure budget. The gate is global, so real athletes
can also write while open.

On `40001`, missing state, timeout or uncertain commit: retain the evidence, inspect
current state, and stop the dependent step. Never silently reuse a generation,
overwrite the control row, drop either guard or return to the old unstamped app.
Leaving the database paused is containment only when commit/readback prove it.

## Local verification record

Pure renderer/catalog tests: `npx vitest run scripts/release/cutover-migrations.test.ts`.
Five tests pass. The first test run had one overbroad assertion that rejected
`ON CONFLICT` inside the unchanged migration body; it was narrowed to the ledger
INSERT suffix and passed before any database attempt. This was a test defect,
not a failed migration. A later TypeScript check caught an inferred JavaScript
options type that omitted `expectedGeneration`; a JSDoc annotation corrected it,
and full TypeScript validation passed. These two preparation-check failures are
preserved separately from the successful migration run and its intentional
negative cases.

The local-only `scripts/release/cutover-migrations-local.mjs` uses the fixed retained
synthetic Supabase PostgreSQL17 instance, creates one fresh `socius_ledger_*`
database and retains it. Its first real-PostgreSQL run passed all ten checks in
`socius_ledger_d04a92a43308`: failed ledger insertion rolled back both migrations
and their schema/function effects; ordering, duplicate-install, stale-generation
and open-gate guards rejected their expected negative cases; fresh connections
verified committed pause/resume/re-pause and exact catalog equality. The database
is retained paused at generation 3. Original receipt:
`output/app-quality-release/cutover-ledger-d04a92a43308/receipt.json`.

The original rehearsal helper hash is
`3ea5501381cdbe9011d0f72ad4ef6181b172a17daf3ccd59f3bf1438ffe75434`.
After that run, a type annotation and the explicit control-character literal
escaping were added. A separate read-only PostgreSQL17 check using the corrected
renderer confirmed exact original bytes for both simulated editor-normalized
literals, exact stored ledger names/content, and unchanged full revision catalog.
No migration was reinstalled for this check. Supplemental receipt:
`output/app-quality-release/cutover-ledger-d04a92a43308/editor-roundtrip.json`.
The [durable sanitized evidence](../../../scripts/release/cutover-migrations.local-evidence.json)
preserves both helper identities and distinguishes these checks; it does not
claim the newer helper bytes ran the earlier full rehearsal.

The harness never changes global roles, copies athlete rows, writes the source
database or makes production calls. The source Auth/extensions schema and verified
pre-revision bootstrap are reused; the new ledger is explicitly synthetic. No
local result is a hosted SQL Editor execution or production authorization.
