# Private recovery design — bounded execution proposal

Prepared 2026-09-23 from the current exporter and a synthetic local container probe. No production call or production data copy was performed for this design. This file contains proposed procedure and SQL, not completed backup/restore evidence.

## Exporter preflight review

`scripts/release/private-production-recovery.mjs` fixes the approved project and destination, rejects linked/redirection paths, validates destination ACLs, uses official CLI login without evaluating the generated shell, checks the connection host/user/database tuple, excludes inherited application secrets, requires TLS verify-full, encrypts diagnostics, and requests a read-only exporter filesystem with no published ports and no swap. These are useful boundaries.

Before a real export, make the inspection assertion cover the requested runtime properties: exact image, unique purpose label, network `podman` for the exporter only, `ReadonlyRootfs=true`, user `100:101`, log driver `none`, memory and memory+swap limits equal, no bind/anonymous volumes, and `/tmp` as tmpfs. Add and verify `--ulimit core=0:0`. Assert `memory.swap.max=0` before transmitting the passfile. Verify the passfile's parent is mode700 and the file mode600 on tmpfs. The restore container must instead have network `none`, no ports, no TCP sockets, and an empty cluster/target.

The existing synthetic probe verified guest cgroup zero swap and tmpfs. This does not establish that Windows will never page or dump the WSL VM or the Windows CLI/Node processes. Describe this residual host trust accurately; do not claim that the entire end-to-end runtime is encrypted. Durable archive and sensitive diagnostics must be encrypted before storage, restricted to `C:/Users/foote/AppData/Local/SociusFit/Recovery`, with the AES key protected by DPAPI CurrentUser. Losing that Windows key context is a recovery limitation, not a portable key escrow solution.

Do not reuse the synthetic helper's raw stderr exceptions for production. PostgreSQL COPY errors can contain row values. Encrypt all database stdout/stderr except deliberately allowlisted operational summaries. Do not log passwords, shell scripts returned by CLI, data rows, schema definitions, table-level hashes, or private role metadata to workspace output. This design file is safe because it contains no captured source data.

## One consistent snapshot

Use a dedicated, long-lived coordinator psql process connected to the fixed verified source. Keep its stdin open while the dump and reference manifests finish; do not rely on an exported snapshot after its transaction closes.

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE postgres;
SET LOCAL row_security = off;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'iso_8601';
SET LOCAL bytea_output = 'hex';
SET LOCAL extra_float_digits = 3;
SELECT pg_export_snapshot();
```

Capture source identity and the full inventory in this transaction. Set an explicit overall lifetime budget, and fail the whole backup if the coordinator exits or any included-source read fails. If concurrent DDL is a concern, acquire bounded ACCESS SHARE locks for the enumerated included tables before exporting the snapshot; fail on lock timeout rather than retrying against a different inventory. Do not introduce a write pause or source mutation as part of this procedure.

Invoke pinned `pg_dump 17.6` with `--format=custom --snapshot=<token> --role=postgres --no-password` and the exact documented scope filters. Stream stdout directly into AES-256-GCM, not through PowerShell text conversion or a plaintext file. Hash plaintext incrementally before encryption; hash ciphertext incrementally after encryption. Only mark the archive complete after the dump exits0, cipher final/tag succeeds, and private output is closed. A partial file or an inspect receipt is not a backup.

For each separate reference query process:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT '<validated coordinator token>';
SET LOCAL ROLE postgres;
SET LOCAL row_security = off;
-- Apply identical UTC/date/interval/bytea/float output settings.
-- Run one bounded manifest query, then COMMIT.
```

Import the snapshot before any SELECT in that transaction. Keep table/extension/role/catalog inventory and row manifests tied to the same snapshot token. Roles are shared catalog state, so avoid claiming this is a transactional cluster-global roles backup; preserve credential-free role metadata and record the limitation. Sequence values also advance outside ordinary MVCC: capture sequence state separately near the dump and label its concurrency limitation rather than claiming exact snapshot equality under ongoing nextval calls.

## Scope ledger and extension decisions

First inspect the actual installed extension inventory, versions, schemas, `extconfig` relation OIDs mapped to names, and `extcondition` filters. Do not assume that every table visible in pg_class is fully dumped. pg_dump generally recreates extension-owned definitions through CREATE EXTENSION and exports only extension configuration tables/rows registered for data export. An extension's schema name alone is not a safe exclusion rule.

Create an encrypted ledger with every non-system relation assigned one scope: full included data, included extension configuration data with exact predicate, structural/parent object only, or excluded with a concrete reason. Include auth/storage/platform schemas only if the chosen export can actually read and restore them. A public-only export must be labeled application-schema recovery, not full project recovery. Auth identities, storage metadata, storage object bytes, Vault root keys, replication slots/subscriptions, hosted role credentials, platform services, and extension workers are separate boundaries. Do not fetch Vault keys or storage object bytes without the relevant authority.

After the root's inventory, resolve each installed extension explicitly:

- Available exact version and no active-worker requirement: recreate from the archive and verify version/schema.
- Requires shared preload: prove an inert configuration first, with job execution off and no worker slots; do not enable schedulers to make restoration succeed.
- Unavailable version or platform-managed dependency: fail the full-parity claim, or obtain agreement on a specifically excluded logical recovery scope and ledger. Do not silently use a different extension version.
- Extension configuration table predicate: compare the rows selected by the recorded predicate, and separately disclose omitted rows. Do not compare full source contents against an intentionally filtered archive.

No network in the restore container is mandatory even when a restored function, trigger, job row, or extension attempts external access. `shared_preload_libraries=''`, `session_preload_libraries=''`, `local_preload_libraries=''`, `max_worker_processes=0`, `max_logical_replication_workers=0`, `max_parallel_workers=0`, `cron.launch_active_jobs=off`, and autovacuum off were proven in the empty fixture. Installed extension availability alone does not prove restore compatibility. Keep cron/net queue rows inert and do not execute restored user functions as a validation shortcut.

## Bounded data manifest

For each included ordinary physical table (`relkind='r'`, including partition leaves), compare all intended columns and all intended rows. Do not hash both a partition parent and its leaves. Record foreign tables and materialized views separately. Quote identifiers with server-side `%I`, never concatenate untrusted names into shell or SQL.

Use a streaming digest of sorted per-row digests, preserving duplicates. PostgreSQL17 built-in `sha256(bytea)` avoids assuming pgcrypto schema placement. Example template, with table identifiers generated safely:

```sql
COPY (
  SELECT row_hash FROM (
    SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_hash
    FROM ONLY <quoted_schema>.<quoted_table> AS t
    -- Exact recorded extension extcondition predicate when applicable.
  ) AS canonical_rows
  ORDER BY row_hash COLLATE "C"
) TO STDOUT;
```

Hash the canonical COPY byte stream in the private parent process and count its lines. Fixed-width lowercase row hashes plus newline delimiters prevent concatenation ambiguity. Record schema/table, row count, data digest, canonical format version, selected columns/predicate, and scope. Avoid string_agg/json_agg over all data rows; those scale with table size and the current command helper's32MiB output cap. Process tables sequentially or with tightly bounded concurrency and explicit timeouts. Fail on RLS/permission errors rather than accepting filtered data. Empty tables must have an explicit zero count and empty-stream digest.

All row digests and per-table manifests are sensitive derived production data: encrypt them in the approved private folder. Workspace/public receipts should expose only aggregate counts, successful comparisons, algorithm versions, and ciphertext/archive identity—not per-table contents or schema text.

## Structural/permission manifest

Build sorted, encrypted semantic records rather than comparing raw pg_dump text alone. Normalize OIDs to qualified object names and role names so independent clusters can compare. Preserve NULL/default ACL distinctions alongside expanded effective grant entries. Include:

- Schemas: owner and ACL; database encoding/collation/provider as explicit environment metadata.
- Relations: kind/persistence/partition identity, owner, columns/order/types/collation/default/generated/identity/nullability, primary/unique/check/foreign constraints, indexes, RLS and FORCE RLS.
- Policies: command, permissiveness, role names, USING and WITH CHECK expressions from pg_get_expr.
- Functions/procedures: qualified signature/identity arguments, owner, language, security-definer, volatility/parallel flags, config/search_path, ACL, and definition hash (encrypted only).
- Triggers and event triggers: definition, enabled state, owner context where applicable. Do not fire application triggers during verification.
- ACLs: object identity, grantor/grantee names, privilege and grant-option from aclexplode; default privileges keyed by owning role and schema. Capture membership grants separately from rolcanlogin/rolbypassrls/etc.
- Extensions: installed name/version/schema, dependencies, extconfig and extcondition. Compare available versions before restore.
- Publications and other database objects: inventory and explicitly included/excluded status. External subscriptions and replication slots are not a standard logical archive recovery guarantee.

Semantic pg_get_expr formatting can differ across restore even on the same PostgreSQL release. Prefer catalog fields that express the actual structure; any formatting normalization must be narrow and documented. Never strip security-relevant expressions or owners just to obtain equality.

## Restore and verification order

1. Verify private-folder ACLs and archive ciphertext hash; unwrap the DPAPI key; authenticate the entire GCM ciphertext before using its plaintext. A custom pg_restore archive generally needs seekable input for inspection/parallel restore, so an authenticated RAM tmpfs file is appropriate. Do not let a streaming decryptor release unauthenticated content to an executing restore before GCM final succeeds.
2. Create a fresh, unique container with the pinned image and previously asserted network/RAM/no-swap/core/log controls. Do not reuse the active canary cluster. Create a fresh template0 target. Do not run the image's migrate.sh bootstrap, which creates conflicting auth/storage/platform objects.
3. Reconcile ownership/grantee role names from credential-free metadata. Roles should default NOLOGIN with no passwords; restore original permission attributes/memberships only where needed for faithful RLS/ownership verification and safe in the isolated container. Record intentional NOLOGIN substitutions. Restoring RLS definitions is distinct from testing behavior under substituted roles.
4. Restore without `--no-owner` or `--no-acl` if claiming ownership/grant recovery. Use `--exit-on-error --single-transaction`; no parallel jobs. Fail and preserve encrypted diagnostics on any restore error. Do not hide managed-object errors and call the remainder complete.
5. Recompute the same per-table and semantic manifests. Require exact row counts/digests for all full included data and exact scoped comparison for extension config rows. Verify ownership, RLS/FORCE RLS, policies, grants, function search paths/security-definer flags, extension versions, and representative accepted-plan/proposal/session linkage through read-only SQL.
6. Keep numerical assertions about source accepted plans tied to the source snapshot; compare accepted JSON and linked record hashes, not just row totals. Do not run the application or mutations against restored private data merely to demonstrate availability.
7. Emit a sanitized receipt with archive complete/authenticated, included/excluded scope counts, source snapshot lifetime, all comparison results, image/tool versions, isolation guards, role substitutions, and unresolved limits. Keep sensitive manifests encrypted. Stop the private RAM container only under the agreed retention/cleanup step; stopping loses ephemeral restore evidence, while durable encrypted manifests remain.

## Claim boundary

Passing this procedure can establish recoverability of the captured, explicitly scoped PostgreSQL logical archive in an isolated local PostgreSQL17.6 environment. It does not establish hosted Supabase service restoration, Auth sessions/password portability, stored-file recovery, PITR/RPO guarantees, platform role credential recovery, Vault decryption, production traffic pause, or deployment rollback. No production migration or deployment is included in this design.
