# Production recovery preparation — September 23, 2026

Preparation is authorized; production backup and restore are not yet verified.
No production migration, deployment, write pause, password reset or paid service
has occurred. Greg approved the official temporary CLI database login, which was
created/refreshed during metadata preflight. No production backup exists yet.

## Destination and access

Greg approved a private local backup and separate private restore rehearsal.
The destination is `C:\Users\foote\AppData\Local\SociusFit\Recovery`.
The existing user/AppData/Local parent directories were checked for reparse
points before the new folder was created. The destination is outside this
repository and the user's Documents/cloud-sync location.

Windows ACL readback confirmed inheritance disabled, the current Windows user
as owner, and exactly three explicit inheritable FullControl entries: the
current user, SYSTEM (`S-1-5-18`), and Administrators (`S-1-5-32-544`).
This is access-control evidence, not a claim of disk encryption or an off-device
backup. The folder currently contains no production backup.

The existing Supabase CLI login successfully listed `fitness-tracker`, project
`auolnfwetmfcwhtvakzy`, organization `xwwgbkrcafrdaguwayns`, region `us-east-1`,
status `ACTIVE_HEALTHY`, database release `17.6.1.054`. The project is not linked
to the local synthetic workspace. Its dashboard connection panel confirms the
session pooler `aws-1-us-east-1.pooler.supabase.com:5432`, database `postgres`,
user `postgres.auolnfwetmfcwhtvakzy`. No database password was displayed or reset.
The expected database-password/connection environment variables were absent;
credential stores were not searched.

Supabase documents that passwordless CLI database access creates or refreshes a
temporary administrative login role. Its password expires; the role record can
remain. This is distinct from the read-only project listing already performed.
Greg explicitly authorized that credential operation on September 23. Credentials
were parsed from official CLI output, passed through stdin to a private container
tmpfs passfile, and never printed or stored in the repository.
See [Supabase's login-role documentation](https://supabase.com/docs/guides/troubleshooting/permission-denied-when-deleting-the-cli_login_postgres-role-808bae).

## Recovery evidence still required

The export must preserve a consistent logical database snapshot and record its
exact source identity, tool version, completion status, scope and archive digest.
Data and private logs belong only in the approved private recovery location.
The release runbook requires encrypted production exports. Folder ACLs do not
satisfy that requirement alone; establish encrypted archive/key handling before
writing a durable production backup, and prove decryption during restoration.
The source must be read-only; the synthetic local stack must never receive real
production data. Multiple independent roles/schema/data dumps alone do not prove
one shared data snapshot.

Restore into a separate private database environment with no public listeners or
application integrations. Compare table counts and content digests, accepted-plan
records, schema, policies, grants, functions, extensions and migration history.
Record exclusions explicitly. Database logical backup does not by itself preserve
Storage object bytes, platform configuration, external credentials, or writes made
after its snapshot. A successful restore rehearsal does not authorize restoring
over production.

The existing installed PostgreSQL image is
`public.ecr.aws/supabase/postgres:17.6.1.167`, local image ID
`66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f`.
An empty private restore container passed synthetic roundtrip and isolation
checks: network none, no ports/TCP listeners, read-only root, RAM-backed PGDATA,
zero cgroup swap, disabled core dumps and inactive background workers. No real
production bytes entered it. Hosted/local extension compatibility remains unknown.

## Current blocker and saved helpers

The first three metadata-preflight attempts failed: missing Supabase CA trust,
a Podman network-field assertion mismatch, then a combined metadata-validation
failure. After Greg approved one diagnostic retry, it retained encrypted evidence
and identified the exact failed field: `row_security=on` despite the client
startup request for off. Identity, PostgreSQL 17.6, read-only mode and repeatable
read passed. All exporter containers stopped. No backup or restore was attempted.

The fix applies row-security and timeout controls explicitly inside the read-only
SQL transaction and checks their effective values. Six real PostgreSQL 17.6
synthetic checks passed, including rollback restoration and rejection of filtered
reads without changing permissions or table policies. Eighteen crypto/classifier
checks also pass. The approved one-attempt budget is exhausted; the corrected
production check awaits approval. See the [attempt record](../../../handoffs/investigations/programming-quality-private-recovery.md).

The revised inspector seals raw metadata before validation and emits separate
check booleans. It retains verify-full with the official Supabase CA, SHA256
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
The CA source is [Supabase Studio's configuration](https://raw.githubusercontent.com/supabase/supabase/master/apps/studio/hooks/custom-content/custom-content.json);
the [SSL guide](https://supabase.com/docs/guides/platform/ssl-enforcement) specifies
the client trust requirement. The public certificate is an ignored local tool
prerequisite, not a private key or production setting change.

Private diagnostics use AES-256-GCM with Windows DPAPI CurrentUser key wrapping.
Separate archive-byte helpers require successful producer completion and full
authentication before private RAM staging; executing a restore must wait for
successful staging. Eighteen synthetic helper tests passed and independent review
found no remaining issue in these bounded contracts. Actual archive orchestration
is unimplemented; `backup` refuses before any source access. DPAPI recovery depends
on the same Windows key context; this is not an off-device backup. Container swap
controls do not establish that Windows never pages or dumps VM/process memory.

## Parallel release preparation

The application checkpoint `7abca86e183f547925ff69d858f453460872133e` passed
[CI run 35920252754](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/35920252754):
3,484 tests passed, 19 skipped, 26 browser tests passed, with TypeScript, lint
and production build passing. Later recovery-helper/doc changes have separate
local evidence and do not modify application behavior. The compatible local build has been retained for a same-port
rollback rehearsal; its local API configuration is not a production artifact.
The subsequent recovery-helper checkpoint `8eebe74` also passed
[CI run 35922154764](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/35922154764).

The [application artifact-switch rehearsal](local-pause-and-rollback-2026-09-23.md)
passed 15 checks and independent review. The pause passed 13 ordered regressions
and, after Greg approved a corrected method, all 14 real PostgreSQL checks on
the first retry. The original three failed attempts remain recorded. These checks do not replace real production
recovery evidence. PR #84 remains draft; final production release approval remains
separate.
