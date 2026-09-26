# Private recovery tooling verification — September 23, 2026

The local encryption, snapshot, permission and restore tooling passed the checks
below using synthetic data. These results establish bounded tooling behavior.
They do not establish a completed production backup or production recovery.
Production capture and restore evidence belongs in the separate operator record.

## Verification results

| Check | Observed result | Evidence |
| --- | --- | --- |
| Archive, manifest, preflight, role and extension unit/local-catalog tests | 51 passed, 0 failed after approved corrections | Eight Node test files listed below |
| PostgreSQL session controls | 6 checks passed on PostgreSQL 17.6 | [Session receipt](private-recovery-synthetic-session.json) |
| Private files, ACLs and DPAPI | 11 checks passed, including malformed envelope and broadened-ACL rejection | [Private-file receipt](private-recovery-synthetic-files.json) |
| Exported snapshot | Source advanced from 1 to 2 rows after snapshot export; archive restore and reference digest both retained 1 row | [Snapshot receipt](private-recovery-synthetic-snapshot.json) |
| Extension restore | Five extension versions matched; one synthetic Vault configuration row and its hash survived logical restore | [Extension receipt](private-recovery-synthetic-extensions.json) |
| Held-coordinator table digests | Snapshot held at 2 rows while source advanced to 3; restored 2; no new reference connections | [Coordinator receipt](private-recovery-synthetic-coordinator.json) |
| Owner-aware extension preparation | 49 function owners/ACLs and exact role flags matched; every archive entry retained | [Ownership receipt](private-recovery-synthetic-extension-ownership.json) |
| Delegated database grants | Grantor identities and grant options survived dependency-ordered restoration | [Role/ACL receipt](private-recovery-synthetic-roles.json) |
| Final private restore runner | Authenticated archive restored; selected catalog matched; 1 included physical-table scope matched | [Final synthetic restore receipt](private-recovery-synthetic-restore.json) |

The final runner used synthetic backup `backup-20260923215232-611c0548` and
restore `restore-6e4a8444-905`. Its intentional substitutions were the database
name and NOLOGIN for roles other than the local bootstrap socket operator.
Membership grantors, membership options, RLS and ACL differences were not
normalized away.

The snapshot test and final runner test are separate fixtures. The former
demonstrates exclusion of a later committed row from one held exported snapshot.
The latter exercises the encrypted bundle contract through the final restore
runner. Its one-table result is not a production-size or full-platform test.

## Behavior covered

The archive module waits for both a successful producer exit and flushed
ciphertext before returning completion metadata. Tests reject modified
ciphertext, wrong keys or tags, truncation, appended bytes, digest mismatch,
failed or late-failing producers, overwrite attempts and byte-limit violations.
A full GCM authentication pass finishes before a plaintext staging destination
is created. The second pass must finish successfully before the caller starts
`pg_restore`; a partial staging result is not usable restore input.

The session checks exercise the actual recovery transaction preamble. It sets
repeatable-read, read-only mode, `row_security=off`, a 120-second statement
timeout and a 5-second lock timeout. A restricted role first demonstrated a
filtered read with RLS enabled, then received a permission failure with
`row_security=off`. This setting does not grant RLS bypass. Existing policies
and FORCE RLS remained intact.

The source manifest distinguishes ordinary physical tables, partition parents,
extension configuration rows and excluded data. Per-table checks hash sorted
canonical row digests, including duplicate rows and empty tables. The selected
catalog includes role and membership attributes, schema ownership and ACLs,
columns, constraints, indexes, RLS policies, triggers, function security/config,
default privileges, extension configuration and database locale information.

The private-file review verifies inherited private ACLs, DPAPI CurrentUser key
recovery and AES-GCM metadata roundtrips. It rejects shortened tags, invalid IVs,
invalid counts, wrong keys, overwrite, traversal and an explicit Everyone read
grant on synthetic ciphertext. The broadened test ACL was restored afterward.
The copied receipt omits the machine-specific private directory path.

## Local runtime and extension limits

The tests used the existing pinned image
`66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f`,
whose database and dump/restore tools report PostgreSQL 17.6. The private
restore design uses a new container with network `none`, no published ports or
PostgreSQL TCP listener, a read-only root filesystem, disabled container logs
and core dumps, and a RAM-backed data directory. The container memory limit and
memory-plus-swap limit are both 1 GiB; the observed cgroup swap maximum and usage
were zero. The PostgreSQL data directory belongs to the runtime user with mode
0700. Plaintext staging stays in this private RAM filesystem.

The final restore runner disables event triggers and background execution.
Shared/session/local preload libraries are empty, worker slots are zero, and
cron job launch is off. The earlier extension fixture had no event triggers;
its receipt reports `eventTriggersSetting=on`. That fixture does not independently
prove the final runner's event-trigger guard.

The extension fixture covered `pg_stat_statements` 1.11, `pgcrypto` 1.3,
`plpgsql` 1.0, `supabase_vault` 0.3.1 and `uuid-ossp` 1.1. It verified the
registered `vault.secrets` configuration table was present in the dump and that
one synthetic row survived restoration. Vault decryption and production Vault
key recovery were not tested.

Capture and restore both cap archive bytes at 256 MiB. The exporter additionally
bounds coordinator lifetime, dump lifetime, metadata output and diagnostics.
`pg_dump` controls its own read-only snapshot transaction and resets some session
timeouts; its lock-wait timeout and external process deadline provide the stated
bounds. Do not claim that it inherits the psql statement timeout.

Guest cgroup zero swap does not prove that Windows never pages or dumps VM or
host-process memory. Runtime confidentiality still depends on the local host.
Durable archives and sensitive manifests remain encrypted in the approved
private recovery directory. DPAPI CurrentUser ties key recovery to that Windows
user context; it is not portable key escrow.

## Scope of the receipts

Only safe synthetic receipts are copied here. No production inventory, database
records, private schema definitions, credentials, encryption keys or archive
payloads are included.

These checks do not prove hosted Supabase service recovery, storage-object
recovery, Auth session portability, production Vault decryption, PITR, an RPO,
production traffic pause, or deployment rollback. Sequence values and shared
role catalogs have consistency limits under concurrent activity. Large-object
contents and catalog object kinds outside the recorded sections are not
independently digest-compared, even when a logical archive includes them.

Independent reviews covered archive authentication/staging, capture scope and
snapshot ordering, role/ACL restoration, private file guards and the restore
boundary. Passing synthetic checks does not remove the need to inspect a real
capture's completion marker and verify that exact archive separately.

## Focused test command

```powershell
node --test scripts/release/private-recovery-archive.node-test.mjs scripts/release/private-recovery-manifest.node-test.mjs scripts/release/private-recovery-preflight.node-test.mjs scripts/release/private-recovery-roles.node-test.mjs scripts/release/private-recovery-extensions.node-test.mjs scripts/release/private-recovery-settings-acl.node-test.mjs scripts/release/private-recovery-comparison.node-test.mjs scripts/release/private-recovery-locale.node-test.mjs
```

This command uses generated bytes, pure contracts and a synthetic in-memory
PGlite catalog. It does not connect to production. The local PostgreSQL and Windows ACL/DPAPI checks depend on their
explicit synthetic fixtures and are represented by the linked receipts; they
are not silently rerun by the pure test command.

## Subsequent production-sized evidence

The real private restore matched all 93 table digests but failed six catalog
sections. These synthetic fixtures did not detect the role search-path and
platform schema-grant defects. That historical result triggered the approved [correction plan](private-recovery-revised-plan-2026-09-23.md).
The subsequent 51 focused checks passed; the single approved private restore now
passed 93 table digests, required release coverage and qualified catalog/security
comparisons on the verified source-version runtime. Cleanup readback passed.
See [current recovery receipt](production-recovery-verified-2026-09-23.json).
The earlier38-test synthetic runtime/receipts remain historical evidence.
