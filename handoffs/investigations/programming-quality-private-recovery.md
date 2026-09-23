# Private production recovery investigation

Issue: `Fitness-Tracker-i40.11`. Owner: root. Workspace: programming-quality.
Objective: encrypted consistent production export and separate private restore.
Status: diagnosed; local fix verified; corrected production check awaits approval.
Connection cycle 1: three failed attempts. Approved cycle 2: one of one attempts
used. No further production probes are permitted under either exhausted cycle.

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
