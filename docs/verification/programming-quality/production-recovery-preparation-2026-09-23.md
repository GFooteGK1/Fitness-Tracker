# Production recovery preparation — September 23, 2026

Preparation is authorized; production backup and restore are not yet verified.
No production migration, deployment, write pause, password reset, paid service,
or credential creation has occurred in this stage.

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
Explicit authorization for that credential operation is pending. Alternatively,
the existing database password can be entered through a private local mechanism,
without placing it in chat, Git, shell history, or command-line arguments.
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
It is available for isolated recovery tooling; no private recovery container has
been created and hosted/local extension compatibility is not yet established.

## Parallel release preparation

The application at source `923473a04583684d3f9b150c35ffa7e0173a8e25` passed
[CI run 35873858574](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/35873858574):
3,471 tests passed, 19 skipped, 26 browser tests passed, with TypeScript, lint
and production build passing. Subsequent pause/rollback tooling requires its own
verification. The compatible local build has been retained for a same-port
rollback rehearsal; its local API configuration is not a production artifact.

The [application artifact-switch rehearsal](local-pause-and-rollback-2026-09-23.md)
passed 15 checks and independent review. The pause passed 13 ordered regressions
and, after Greg approved a corrected method, all 14 real PostgreSQL checks on
the first retry. The original three failed attempts remain recorded. These checks do not replace real production
recovery evidence. PR #84 remains draft; final production release approval remains
separate.
