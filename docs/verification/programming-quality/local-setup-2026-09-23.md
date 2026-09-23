# No-cost local Supabase setup — September 23, 2026

Status: local test foundation prepared and verified. Production release is not
approved or complete. This implements Greg's no-Supabase-spending constraint.

## Installed local tools and target

Official release archives were downloaded and SHA256-verified before execution:

| Tool | Release | Archive SHA256 |
| --- | --- | --- |
| Podman portable Windows amd64 | 5.8.3 | dd8af942c6226f1e1aec0d1534bf5224ce00f7bdcdeb7c6ca9621343bb5130e5 |
| Supabase CLI Windows amd64 | 2.117.0 | ac8d9d23f5ce08ea521a4064e01b0018f8eb5d75cac664ea7b5ce246f8d559c5 |

Sources: [Podman release](https://github.com/podman-container-tools/podman/releases/tag/v5.8.3)
and [Supabase CLI release](https://github.com/supabase/cli/releases/tag/v2.117.0).
The binaries are under ignored `output/app-quality-release/tools`. They are not
application dependencies and no permanent PATH change was made. Podman uses its
normal per-user configuration plus a new WSL2 machine named `sociusfit-local`.
Existing WSL distributions were not changed. The local machine remains running.

| Target | Verified value |
| --- | --- |
| Supabase project ID | sociusfit-programming-local |
| Project directory | output/app-quality-release/local-supabase |
| Podman connection | sociusfit-local |
| Docker-compatible pipe | npipe:////./pipe/podman-sociusfit-local |
| Network | sociusfit-local-net |
| Database container | supabase_db_sociusfit-programming-local |
| Database engine | PostgreSQL 17.6 x86_64; same version as production, different architecture |
| API | http://127.0.0.1:55321 |
| PostgreSQL | 127.0.0.1:55322 |
| Studio | http://127.0.0.1:55323 |
| Local mail viewer | http://127.0.0.1:55324 |

All four host ports were verified listening only on `127.0.0.1` and `::1`.
Podman reports wildcard bindings *inside its WSL machine*; the Windows forwarded
listeners were checked separately. The stack is not exposed for phone access.
No hosted project is linked. Studio's OpenAI key is blank; analytics, edge runtime,
vector buckets and automatic seed loading are disabled. External OAuth and SMTP
providers remain disabled. No paid API calls were made.

## Schema and actual behavior checks

The maintained [bootstrap generator](../../../scripts/release/build-local-coaching-bootstrap.mjs)
combines source legacy tables/policies with the recommendation fixture's migration
order and the new revision migration. It preserves real Supabase Auth and omits
the PGlite fixture's fake Auth objects, permissive owner policy and unique fixture
constraint. Local base-table grants are explicit adaptations, not proof of
production ACL parity. This is a scoped coaching fixture, not a production clone.

The generated SQL SHA256 is
`465eafbc6eaa995ebeeebf09bffd8d23a1f3d9d481c87f7fcdf642181fb8bb15`.
Independent static review verified 29 source hashes, 60 section hashes/ranges
and 24 whole migration bodies. Actual execution through the named local
container's `psql -X -v ON_ERROR_STOP=1` succeeded. Its guard required an explicit
local marker, PostgreSQL 17, real Auth, and initially empty Auth/public tables.
No production rows or migration-ledger entries were imported.

The [sanitized result](local-foundation-2026-09-23.json) records checks at
13:41:43 UTC:

- Two synthetic confirmed users created through the local Auth admin API.
- Both signed in through real local Auth using the local anon client.
- Both read their own profile and could not read the other existing profile.
- Both called `get_coach_context_revision` successfully through PostgREST.
- Two simultaneous `psql` processes connected as distinct backend IDs 416/418.
- Local `pg_dump` and `pg_restore` both report version 17.6.

These prove environment capability and basic profile isolation, not revision
contention, full tenant isolation, app/browser flows, backup restoration, or
cutover/rollback. `pg_sleep(1)` kept the connection smoke checks overlapping; it
is not evidence of application-lock ordering. No SociusFit app server is running.
The revision migration is already installed in this local stack. A pre-revision
baseline must be prepared separately for the old/new writer cutover rehearsal;
do not infer that rehearsal from this successful full bootstrap.

## Repeatable operations

From the programming-quality worktree in PowerShell:

```powershell
./scripts/release/local-supabase.ps1 -Action Status
./scripts/release/local-supabase.ps1 -Action Start
./scripts/release/local-supabase.ps1 -Action Stop
node scripts/release/build-local-coaching-bootstrap.mjs
```

Status and idempotent Start were executed successfully. Stop is inspected only;
it targets this project and preserves volumes (no `--no-backup` or `--all`). It
leaves the Podman machine running. The bootstrap generator only produces files;
it never executes SQL. Its SQL is not intended to rerun on the initialized stack.
Generated connection keys, synthetic login credentials and runtime logs remain
under ignored output. Do not commit or print those private artifacts.

## Setup issues resolved and remaining release boundary

Winget had no applicable per-user installer; the official portable Podman archive
worked. PowerShell returned checksum files as bytes; decoding UTF-8 resolved the
parser failure and both archives matched the published hashes. Sandboxed tool
launches could not write normal user-profile runtime directories; approved
unsandboxed launches succeeded. Podman does not support Docker's network option
`com.docker.network.bridge.host_binding_ipv4`; actual Windows forwarding was
verified instead. The CLI needed portable Podman on its process PATH and existing
local `snippets`/`functions` bind-mount directories. A smoke-harness executable URL
was converted to a filesystem path before the connection checks passed.

Next authorized work is real contention/tenant and local app rehearsal, with a
separate pre-revision baseline for cutover. Manual production backup export,
approved private recovery destination, restore proof, compatible rollback and
production promotion remain outstanding. No production migration, hosted resource,
billing change, backup export or deployment occurred in this setup.
