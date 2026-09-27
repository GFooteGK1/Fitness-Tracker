# Setup-freshness hosted preflight transport

Task: `Fitness-Tracker-i40.15`. Production project: `auolnfwetmfcwhtvakzy`.
Status: revised method approved by Greg's "Revaluate and try again" and executed
once at15:10UTC. Transport and cleanup passed. The ledger mismatch was diagnosed
and corrected locally; see [ledger provenance](workout-ledger-provenance-2026-09-27.md).
The retained snapshot passes all12 checks retrospectively. No production changes.

## Revised method

From `.worktrees/setup-freshness-release`, run exactly:

```powershell
node scripts/release/private-production-recovery.mjs setup-preflight
```

The existing recovery transport uses the official Supabase CLI's existing login
and `db dump --dry-run --project-ref auolnfwetmfcwhtvakzy` to obtain its temporary
connection details in memory. It never evaluates or prints the generated script.
The dry run does not perform a dump. No credential store is scraped and no new
account, persistent credential, migration, application RPC or backup is created.

The new mode uses the already installed CLI 2.117.0 and pinned Podman tools from
the adjacent programming-quality checkout. It validates the exact endpoint/user,
database and port, verifies the pinned CA, and runs psql with TLS `verify-full` in
the existing hardened client-container pattern. It submits only the reviewed
`SETUP_PREFLIGHT_SQL` transaction with explicit read-only/repeatable-read settings
and rollback. Its query hash remains
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.

The result covers catalog/ACLs, migration ledger, three predecessor hashes,
pause generation and aggregate accepted/superseded history counts and digests.
No athlete content is returned. Raw metadata and diagnostics are encrypted in
the existing ACL-protected `C:/Users/foote/AppData/Local/SociusFit/Recovery` folder.
Only a sanitized qualification receipt is printed, after verified container stop.
There is no query retry, backup/inventory fallthrough, or mutation mode fallback.

## Verification and limits

- 14 offline transport-branch/cleanup tests passed, including malformed results,
  classifier rejection, query failure, failed stop and wrong container identity.
- 15 existing preflight-classifier tests passed; syntax and whitespace checks passed.
- Independent reviewer found no blocking code findings and independently reran
  all 14 operator tests successfully. Review covered credential/log isolation,
  target/TLS checks, query-only control flow, cleanup, and authorization boundary.
- Installed CLI version/help verified 2.117.0 and the required dry-run flags.
  The first help invocation hit sandbox EPERM on its local telemetry file;
  normal elevated help succeeded. This was not a database connection attempt.
- The application candidate remains committed at `80bef158d7e07f9ff6295b1029eeffa002a1821e`.
  Exact-head CI applies to that commit. These operator-only additions are local,
  uncommitted, and have their own focused validation; no CI claim extends to them.

## Execution boundary

Two release browser inventory attempts timed out without obtaining tab state or
submitting SQL. The same browser inventory failed again during board onboarding.
This revised method removes the browser dependency. Under the failed-work rule,
present this concrete method for approval before restarting hosted preflight.
That approval was subsequently supplied and the one-attempt budget consumed.
The proposed first attempt is one CLI-authenticated query, then stop on any
authentication, transport, target, classifier or cleanup failure and retain
evidence. Do not create a new login or alter credentials to recover automatically.
The existing CLI login can issue temporary connection credentials as part of
authentication; the read-only SQL guarantee does not claim zero platform effects.

Passing this query establishes only a current pre-install baseline. Coordinated
pause/migration/merge/deployment/reopen and synthetic writes still require the
separate target-specific production execution packet and approval. Numerical
policy remains disabled; the completed earlier cutover is not repeated.
