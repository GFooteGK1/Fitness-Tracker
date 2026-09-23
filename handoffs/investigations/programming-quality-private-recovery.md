# Private production recovery investigation

Issue: `Fitness-Tracker-i40.11`. Owner: root. Workspace: programming-quality.
Objective: encrypted consistent production export and separate private restore.
Status: blocked: revised plan awaiting approval. Encrypted capture completed;
private restore matched all 93 physical table digests but failed catalog parity.
Connection cycle 1: three failed attempts. Approved cycle 2: one of one attempts
used. Approved cycle 3: one of one attempts used, passed all twelve checks.
End-to-end recovery cycle: three substantive failures, budget exhausted.
Next allowed action: retain evidence, save checkpoint and review the
[revised method](../../docs/verification/programming-quality/private-recovery-revised-plan-2026-09-23.md).
No further blocker probes, fixes, source access or restores until approval.

## September 23, 2026 — authority and isolation

Greg approved the official Supabase CLI temporary database login for project
`auolnfwetmfcwhtvakzy`. Export and separate private local restore are authorized.
No production migration, pause, deployment, password reset or paid service is
authorized. Recovery files belong under the private Windows recovery directory.

The empty-container preparation had two startup-option failures (`noswap` and
tmpfs `uid=100` unsupported by rootless Podman). The third, evidence-based method
passed: mode1777 mount, postgres-owned mode0700 child, verified cgroup swap zero.
Receipt: ignored `output/app-quality-release/socius-private-restore-probe-b43e4eab.json`.
This resolved that setup blocker; it did not restore production data.

## Connection attempt 1 — 21:11 UTC

Hypothesis: installed image CA roots verify the official session pooler.
Action: independently reviewed `private-production-recovery.mjs inspect`.
Expected: TLS verify-full, read-only metadata query, encrypted private inventory.
Actual: official CLI temporary login succeeded; PostgreSQL connection failed
before metadata access with `SSL error: certificate verify failed`.
Private run: `inspect-20260923211151-3bfed7ae`. Diagnostic remains AES-GCM encrypted;
key is protected by Windows DPAPI CurrentUser. Exporter stopped. No backup exists.

Official Supabase documentation requires its database CA from Database Settings:
https://supabase.com/docs/guides/platform/ssl-enforcement.
Next: establish official certificate provenance, retain verify-full, then retry.
Do not trust a certificate captured from the failing connection or weaken TLS.

## Connection attempt 2 — 21:15 UTC

Official Studio source identifies the public production CA download. Downloaded
over verified HTTPS; SHA256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
Node X509 inspection confirms a self-signed CA valid through April 26, 2031.
Source: https://raw.githubusercontent.com/supabase/supabase/master/apps/studio/hooks/custom-content/custom-content.json.

Retry stopped before connecting: `Exporter identity or isolation mismatch`.
Private run: `inspect-20260923211504-df16c9c5`. Exporter stopped.
Readback of the stopped container proves Podman reports `NetworkMode=bridge`
and `NetworkSettings.Networks.podman`, rather than `NetworkMode=podman`.
All checked image/user/root/log/memory/swap/mount/port fields match requests.

After-two reassessment: the failure is a representation mismatch in the new
runtime assertion. Next discriminating check requires both bridge mode and only
the named podman network, then verifies TLS against the pinned official CA.
This changes the failed field assumption without weakening network or TLS checks.
One attempt remains in this connection-preflight cycle.

## Connection attempt 3 — 21:16 UTC

The corrected runtime assertion and official CA passed. `psql` returned parseable
JSON after the explicit read-only transaction. The combined database/effective
role/read-only/row-security/expected-version gate then failed:
`Unexpected production database identity/read-only setting`.
Private run: `inspect-20260923211615-0effc325`. Exporter stopped normally.
No archive or restore was attempted. The login role was created/refreshed as
approved; this is the only intentional production credential change.

The tool validated before sealing the returned metadata. Consequently it did
not retain the rejected fields. Existing evidence cannot identify which field
failed. Do not assert a PostgreSQL version, identity, or permission cause.

## Retrospective and revised plan

The original method conflated several independent checks and discarded the
observation needed to diagnose a failure. TLS trust and container representation
were resolved, but source metadata acceptance remains unresolved. Repeating that
black-box validation would not provide a defensible recovery result.

The revised helper first encrypts successful raw metadata stdout, then parses
and records only named pass/fail checks. Exact observations remain private. It
uses numeric server version to distinguish expected minor release from supported
major; it does not silently relax compatibility. Backend `pg_stat_ssl` is recorded
separately because a pooler backend leg does not prove client TLS. Client
`verify-full` with the pinned official CA remains mandatory.

Proposed restart budget: **one metadata-only attempt**, after Greg approves.
No user-table rows, archive export, restore, migrations or deployment in that
attempt. Acceptance: encrypted metadata plus per-check evidence identifies every
source/transaction/version condition; any failed condition stops execution and
is diagnosed from retained evidence without another live probe. `backup` now
refuses before any credential operation, even if inspect succeeds.

Independent review endorsed this change and the standalone crypto helper. Local
synthetic validation passed 18 checks, covering failed producer/tampered archive
refusal and separately classified metadata failures. This is helper evidence,
not a verified production backup. The reviewed archive/restore design remains a
proposal until real inventory and compatibility are established.

## Approved cycle 2 — September 23, 21:31 UTC

Greg approved the single metadata-only retry. Run
`inspect-20260923213116-bb6811c1` retained encrypted raw metadata and failed only
`rowSecurityDisabled`. Exporter stopped. No archive, restore or user-table read
was attempted. Inspection of retained evidence required no new source connection.

Verified source fields: database/effective role `postgres`, temporary login
`cli_login_postgres`, PostgreSQL `17.6` / `170006`, read-only `on`, isolation
`repeatable read`. The exact failed field was `rowSecurity: on` despite the
client's `PGOPTIONS` request. This establishes an ineffective startup setting,
not why the transport omitted it. Do not assert a pooler defect without proof.
Backend `pg_stat_ssl=false` describes the pooler-to-database leg; client
`verify-full` with the pinned CA succeeded and remains required.

## Corrective method and local evidence — 21:34 UTC

The shared transaction preamble now explicitly runs `SET LOCAL row_security=off`
after the role switch. It also sets the two-minute statement and five-second lock
timeouts explicitly; metadata validation requires their effective millisecond
values. These are transaction-local controls, not ALTER ROLE, table policy edits,
or permission grants. `row_security=off` rejects a query that would be filtered;
it does not confer bypass privilege. Official references:
https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-ROW-SECURITY
and https://www.postgresql.org/docs/17/sql-set.html.

The actual shared preamble passed six checks on the existing synthetic-only,
network-isolated PostgreSQL 17.6 probe:

- Settings become off/read-only/repeatable-read with both exact timeouts.
- Rollback restores the prior row-security setting.
- A restricted role sees one of two synthetic rows with row security on.
- The same role receives 42501 with row security off, instead of filtered data.
- The already privileged local operator reads both synthetic rows.
- Table RLS/FORCE RLS and policy remain unchanged.

Receipt: ignored `output/app-quality-release/synthetic_recovery_settings_d55520fdc893.json`.
Harness: `scripts/release/local-recovery-session-check.mjs`. All 18 crypto and
metadata classifier checks also passed. No production retry of this fix ran.

Next proposed action: one metadata-only production check of the explicit SQL
controls, retaining encrypted evidence. Requires fresh approval because the
previous approval explicitly allowed one attempt and that attempt is exhausted.
Backup execution remains blocked and unimplemented. Existing export/private
restore authority does not override the exhausted diagnostic attempt budget.

## Approved cycle 3 — September 23, 21:38 UTC — passed

Greg approved one production metadata check of the tested explicit-SQL fix.
Run `inspect-20260923213848-6fbdb3c4` passed all twelve checks, retained encrypted
metadata and exited zero after stopping its exporter. Database/role/login,
read-only/repeatable-read, row-security-off, both effective timeouts, PostgreSQL
17.6, inventory shape and size all passed. This resolves the diagnosed blocker;
no diagnostic retries remain necessary. No user-table data or archive was exported.

The inventory includes 94 tables and five installed extensions. This is metadata
coverage, not a claim that all table contents are readable or recoverable. The
already authorized encrypted export and separate private restore remain the
next work; implementation and independent review precede actual backup execution.

## Production capture 1 — 21:54–21:56 UTC — completed

Run `backup-20260923215430-741eea0a` completed and authenticated a 1,511,966-byte
custom PostgreSQL archive plus encrypted catalog and table manifests. Ninety-three
physical table scopes used the same held exported snapshot; no scope exclusions.
Ciphertext SHA256 `84d4a8afa4f448814c05692af37679ef006d1701b0d38985a0dba5c7a9217ed1`.
Capture exited zero and stopped its exporter. This is a completed encrypted
archive, not yet a verified recoverable package. Original data remains unchanged.

## Private restore attempt 1 — 21:57 UTC — failed; two remain

Run `restore-c889a11c-9a0` authenticated and staged the archive in a new network-
disabled RAM container, then `pg_restore` stopped: `ERROR: role "pgbouncer" does
not exist`. Encrypted diagnostics retained; container stopped. No production
restore or synthetic-canary contamination occurred.

Diagnosis from retained metadata and source: the role query used
`rolname NOT LIKE 'pg_%'`. SQL treats the underscore as a wildcard, incorrectly
excluding `pgbouncer` along with true `pg_` system roles. The schema prefix helper
has the same defect for names such as `pgsodium`. The archive itself retains the
affected owners; the companion role inventory is incomplete.

Next: correct literal-prefix filtering, verify it against synthetic SQL catalogs,
then capture a fresh complete package. Preserve the first archive and diagnostics.
Separately, retained source catalog confirms three extensions owned by `postgres`
with all captured members owned by that role. An owner-aware precreation method
passed an analogous synthetic regression; it must replay every archive entry and
preserve all ACLs, with no production permission changes or catalog rewrites.

## End-to-end recovery attempt 2 — capture 2 — incomplete

Run `backup-20260923220229-ea1492ac` used the corrected literal-prefix inventory.
It wrote encrypted archive bytes but stopped at reference-table reader 85:
`FATAL: (EAUTHQUERY) auth_query secret check timed out`. No source-manifest or
archive completion marker was written. Existing encrypted diagnostics identify
an authentication failure opening a new pooler connection, not a failed table
read or missing role. Exporter cleanup completed. The earlier complete archive
and this incomplete attempt remain preserved separately.

For conservative retry accounting, the incomplete capture and the first private
restore failure consume two attempts against the end-to-end recovery gate.
One combined capture/restore attempt remains before a new guardrail approval.

After-two reassessment: the method unnecessarily creates a new authenticated
pooler connection for every table, despite holding an existing read-only snapshot
coordinator. Change the table digest phase to run sequential COPY queries on that
same coordinator, using bounded static sentinels and canonical hash validation.
The dump still imports its exported snapshot on its separate connection. This
preserves consistency while removing repeated per-table authentications. Verify
the changed coordinator against synthetic concurrent writes, then independently
review before the third end-to-end attempt. Do not automatically retry source
connections or treat a partial encrypted file as a completed backup.

## Final bounded attempt — capture 3 — 22:08–22:09 UTC — completed

The held-coordinator digest rewrite passed the synthetic concurrent-write check
and independent review. Run `backup-20260923220856-d35a0ccf` completed with all
93 physical table scopes, zero exclusions and a fully authenticated 1,511,966-byte
archive. Ciphertext SHA256
`6b3d551769515845083a9e93f8415e3f28bdd617921f0ea603938dae94f3795d`.
It retained the corrected role/schema inventory and exited zero with exporter
stopped. This is the final bounded combined attempt; private restoration and
strict catalog/table parity must pass before closing the recovery gate.

## Final bounded attempt — private restore 3 — September 23 — failed; stopped

Run `restore-abb072d3-e2a` authenticated the final archive, replayed every archive
entry with reviewed extension-owner preparation, and matched **all 93 physical
table digests**. It then failed strict catalog comparison:
`Private restore parity failed: 6 catalog sections, 0 table digests; encrypted details retained`.
The restore process exited one and stopped its private RAM container. Its
encrypted catalog, comparison reports and diagnostics remain under the completed
capture directory. No production restore, migration, pause or deployment occurred.

This is the third substantive failure against the shared end-to-end acceptance
gate (missing role, capture authentication timeout, catalog parity). No more
probes or corrections ran after this stop. Counting by the overall gate preserves
the preceding two failures even though the symptoms differ.

## Retrospective from retained evidence

The archive and source manifest are complete and authenticated. The final
restore proves the included physical table data survived. It does not prove
equivalent schema/security behavior or a completed recovery package.

Independent read-only inspection of encrypted source and restored catalogs found:

| Section | Evidence | Conclusion |
| --- | --- | --- |
| Roles | Two search-path values equal the original list wrapped as one quoted identifier | Real serializer defect; restore exact role settings, do not normalize away |
| Schemas | Two schemas lost explicit USAGE grants, including grant-option authority | Real access-control defect; reconstruct and verify source grants |
| Columns | 35 physical position differences across five tables; visible order and all other fields match | Dropped-column slots are a representation difference; compare logical order without ignoring order |
| Relations | Two same-owner tables differ only between explicit owner-all ACL and default NULL ACL | Candidate effective-ACL equivalence, limited to documented owner defaults |
| Constraints | Three definitions differ only by one parenthesis pair around nested AND expressions | Candidate deparser difference; bounded semantic proof still required |
| Database | Stored collation versions 153.120 and 153.121 differ | Unresolved; actual source runtime version was not captured |

The strict comparator correctly prevented a false success. Earlier synthetic
fixtures did not cover the full production catalog's settings and platform
initial grants. Matching PostgreSQL and extension versions did not establish
locale-runtime parity. Refreshing collation metadata would conceal the missing
evidence and is not a correction.

Existing implementation and synthetic checks remain saved, with the above known
defects unresolved. The next method separates local serializer/access-control
regressions from the missing locale evidence, then reuses the complete archive.
See the linked revised plan for alternatives, exact bounds, acceptance and
approval. Production deployment remains a separate gate.
