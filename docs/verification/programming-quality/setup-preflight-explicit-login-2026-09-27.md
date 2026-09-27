# Setup preflight with explicit temporary-login issuance

Task: Fitness-Tracker-i40.15.2. Prepared locally; not executed against production.
This supersedes the CLI method in `setup-preflight-transport-2026-09-27.md`.

## Execution scope requiring approval

Target only Supabase project `auolnfwetmfcwhtvakzy`. Receive an existing Management
API token through secure stdin and send one request to
`POST https://api.supabase.com/v1/projects/auolnfwetmfcwhtvakzy/cli/login-role`
with `{"read_only":false}`. This issues or changes a temporary privileged login;
it is a credential mutation even though the database query is read-only. Do not
run alongside another operator using that temporary role. No token discovery
from credential stores, clipboard, environment or browser is included.

Use the fixed session-pooler connection for exactly the existing read-only,
repeatable-read setup preflight transaction, followed by rollback. Query SHA256:
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.
It checks ledger, functions/ACLs, coaching generation and aggregate history digests.
No athlete content is returned. Retain TLS verify-full, pinned CA/client image,
encrypted private evidence and container isolation. Verify client identity before
stop and stopped state before publishing a successful receipt.

There is no automatic retry, CLI fallback, network unblock, migration, coaching
pause/reopen, account creation, deployment, paid model call or numerical activation.
On failure preserve evidence and review before another login. The temporary role
can remain valid until service-provided expiry; client shutdown is not credential
revocation. No second login or role change is permitted as cleanup. This scope
does not authorize the later rollout or live synthetic lifecycle.

## Prepared command

From the release checkout, use masked local token entry and a pipe; never place
the token in chat, a shell argument or repository file:

```powershell
$setupSecret = Read-Host 'Approved Supabase Management API token' -AsSecureString
$setupCredential = [System.Net.NetworkCredential]::new('', $setupSecret)
try {
  @{managementAccessToken=$setupCredential.Password} | ConvertTo-Json -Compress |
    node scripts/release/private-production-recovery.mjs setup-preflight --issue-temporary-login
} finally {
  $setupCredential = $null
  $setupSecret.Dispose()
}
```

Stdin is limited to 16KiB/15 seconds and one `managementAccessToken` field. Tokens
remain in process memory during use; no host-memory erasure claim is made. Raw
responses and diagnostics are encrypted under the existing private Recovery folder.

## Evidence

30 focused Vitest checks and 15 Node transport checks pass, including actual branch
execution with fake capabilities, CLI exclusion, exact SQL, uncertain responses,
cleanup failures and refusal to stop a foreign container. Typecheck and lint pass
with the existing v2 hook warning. No new connection has contacted production.

Independent review found a cleanup gap after uncertain container creation. The
finalizer now verifies identity before stop, with a regression asserting zero stop
calls for foreign identity. Independent re-review accepted preparation with no
remaining blocking findings and independently reran all 15 transport tests.
