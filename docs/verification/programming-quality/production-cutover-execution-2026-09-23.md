# Production cutover execution sheet

Preparation only. This sheet does not authorize production execution. Use it
with the pinned [approval packet](production-cutover-approval-2026-09-23.md),
[migration procedure](production-cutover-migrations.md), and
[synthetic smoke procedure](production-cutover-smoke.md). Stop if a required
identity, digest, approval or success readback differs.

Local preparation verification: 10 actual PostgreSQL checks, eight focused
compiler/PGlite tests, full TypeScript and independent review pass. SQL Editor
normalization preserves exact ledger source bytes. See the migration procedure
for the initial rehearsal and supplemental helper-verification distinction.

## Authority, timing and failure budget

The later approval covers one attended window starting immediately after approval
and fresh preflight. Greg remains available; the Codex operator records the start
and each stage in the private execution journal. If execution has not started
within 24 hours, refresh the frozen dates and preflight before requesting a new
window. This is an operational window, not a scheduled task.

Reserve 45 minutes for the maintenance attempt. That is a target, not an automatic
resume deadline. After revision installation, safety may require leaving coaching
writes paused beyond the window. Other domains are not frozen by this gate.
Do not issue a second installation, backup, restore, promotion or smoke attempt
automatically. One attempt per operation is proposed; an ambiguous result is
reconciled read-only before deciding whether an operation actually committed.
The existing historical failure counts remain in their investigations.

The temporary open interval is narrowly attended: each smoke HTTP request has a
15-second client deadline, no automatic retries, and re-pause begins immediately
after first acceptance or any failure, no later than 60 seconds after confirmed
open state. Target confirmed closed state by 90 seconds. These are operator
deadlines, not a guaranteed upper bound if database/network access fails. A
client abort does not prove the server transaction aborted. A separate operator
connection/tab must be ready before resume, with the observed generation and
the reviewed re-pause SQL. If that connection is unavailable, do not open the gate.

## Preflight and installation

Require current CI for the saved preparation checkpoint and passing CI for the
unchanged application source. Recompute the two migration hashes and artifact
hash from the approval packet. Refresh project/owner, deployment production target
and READY state, environment metadata, `www.sociusfit.com` and the project's
current production target. Before promotion the expected target is
`dpl_5kZSaXHLmqPPzsCy6odLJyy99utW`; after promotion both must be
`dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`.

Read-only project/alias inspection during preparation found exactly three
production-configured domains, all on the old deployment, with no next page:

| Domain | Existing redirect to preserve |
| --- | --- |
| `www.sociusfit.com` | none |
| `sociusfit.com` | `www.sociusfit.com`; platform default status (`null` in metadata) |
| `sociusai.vercel.app` | `www.sociusfit.com`, HTTP 307 |

Project `rollingRelease` is null. Recheck these facts immediately before
promotion. Approval covers promotion of all three aliases while preserving their
redirect settings; it does not cover adding a domain or configuring a rollout.
Require every alias on the pinned deployment after promotion, preserved redirect
metadata and observed redirects to the canonical host. If the domain list or
rollout configuration changes, stop and review the changed scope.

Use the migration procedure's exact rendered transactions and postchecks. Each
schema migration and its exact-source ledger record must commit atomically.
Install pause first, independently verify its initial state, then commit pause
and prove drain. Record accepted-prescription digests under the committed pause;
the pre-pause observation is informational because athletes could still write.
The post-pause baseline is the comparison boundary for schema installation.

## Fresh recovery gate

The proposed boundary is one fresh authenticated capture **and one isolated
restore of that fresh capture before revision installation**, using existing
reviewed tools. This avoids treating the older archive as proof of newer bytes.
Retain the prior verified archive. No restore into production is authorized.

From this worktree, only after approval and committed pause:

```text
node scripts/release/private-production-recovery.mjs backup
node scripts/release/private-production-recovery.mjs locale
node scripts/release/private-production-restore.mjs <new-backup-run-id> --locale <new-locale-run-id>
```

The run IDs are actual successful receipts from the two immediately preceding
commands, not guessed paths or the old archive. Source is fixed to
`auolnfwetmfcwhtvakzy`; destination remains the ACL-verified private directory
`C:/Users/foote/AppData/Local/SociusFit/Recovery`. The official CLI may refresh the
previously authorized temporary database login. No password reset, credential
printing or connection string in a transcript is permitted.

Independently read the committed pause state/generation immediately before and
after capture. Require both paused and the exact same generation; a changed
generation invalidates this cutover capture even if its archive is internally
consistent. The fresh locale receipt must pass the runner's recency check and
match the captured catalog. Require the restored pause control's table digest
to match the fresh source manifest, along with migration-ledger coverage.

Require zero exit status, authenticated archive, complete source manifest and
required recovery coverage. The old count of 93 physical scopes is not an
acceptance constant after adding the pause table. Require every included scope
in the new manifest to match, selected catalog/security checks to pass, and
verified matching runtime locale. Restore uses the already pinned 17.6.1.054
image and rejects a locale mismatch; do not fetch/replace its image in this window.

The capture receipt precedes its final cleanup, and its receipt does not name
the randomly named exporter. Immediately before **each** backup/locale command,
save the existing container IDs returned by the pinned Podman connection's
`ps --all --filter label=io.socius.recovery=auolnfwetmfcwhtvakzy --format json`.
After that command, repeat the same read and require exactly one new container
ID, with creation time inside the recorded command interval. This binds the run
without guessing which older exporter was used. Inspect that exact new ID and
require image `66089200353d90686fe9b252a47d17d078364bf47c50190852c33dc850a0191f`,
the fixed project label, running false and exited state. Zero/multiple new IDs,
identity mismatch or unknown stop state fails this gate. Do not start another
recovery operation concurrently. The restore must publish its completion receipt only
after its own verified cleanup, as implemented. No success is inferred from a
receipt file alone when the process or cleanup failed. Preserve private outputs;
only sanitized IDs, counts, hashes and outcomes go into Git.

If fresh recovery fails before revision is installed, stop this release attempt.
Verify the revision ledger/objects are still absent and the custom domain/current
target are still the old deployment. Only then may the approved conditional abort
resume the old application using the current generation. Keep the additive pause
control installed. If any condition is uncertain, do not resume blindly.

## Revision and exact promotion

While the verified gate remains closed, apply and verify the revision transaction
from the migration procedure. Compare the post-pause accepted-plan baseline.
Only after all postchecks pass, run the installed Vercel CLI 56.4.1 using its
existing official login:

```text
node C:/Users/foote/AppData/Roaming/npm/node_modules/vercel/dist/vc.js promote dpl_2tZqnshTDrFR5EDQpgi78dcBNns7 --scope gregs-projects-98860c8b --timeout=180s
```

Do not pass `--yes`, environment overrides, a token, `--debug`, a Preview ID or
`deploy`. The exact deployment is already production-configured. A linking,
rebuild, Preview conversion or other unexpected prompt is a stop condition.

CLI exit status alone is not promotion proof. Require the pinned deployment as
the current production target and custom-domain mapping, READY status, the
expected rendered build ID and asset sample, and unchanged 31 runtime bindings.
Require all three production aliases listed above to map to the new deployment;
the canonical host must serve the app and the other two must preserve redirects.
Use read-only CLI API calls through the existing login and browser/anonymous HTTP
checks. Do not create a protection-bypass credential for verification.

If the command times out, the remote promotion may continue. Keep the gate closed
and inspect once with `vercel promote status fitness-tracker --timeout=30s`
and exact target/alias readback. No repeat promotion is implied. An unresolved
promotion is an incomplete release, not permission to resume.

This behavior is documented by [Vercel promote](https://vercel.com/docs/cli/promote)
and was checked against installed CLI 56.4.1 help/source. The timeout limits CLI
waiting, not the remote operation.

## Controlled application verification and final resume

Provision and operate only the dedicated synthetic owner defined in the smoke
procedure. Require successful paused rejection and unchanged protected rows.
The context-revision read can initialize its revision row, so this does not
establish zero writes everywhere.

Use the frozen smoke inputs and generation-checked sequence: resume, create,
first acceptance, immediate re-pause, accepted replay while paused, digest
comparison, then final resume only after all checks pass. Real athletes can write
during the temporary global open interval. Compare the fixed set of pre-existing
accepted versions, not a global row count that legitimate concurrent writes can
increase. Retain the synthetic records and private evidence; no deletion is
included.

Verify final committed open generation and exact deployment/schema identities.
Record zero unexplained accepted-version changes, expected synthetic row counts,
same accepted identity on replay, post-replay equality, and all cleanup states.
No feature flags or numerical programming policies are enabled by this release.

## Failure containment and recovery

Before revision commit, the verified old-app abort above may restore ordinary
service. After revision commit, **never route back to old `f123aa8`**. Keep both
guards installed and the gate closed on failure; if the gate is open, attempt
the reviewed generation-checked re-pause immediately through the ready operator
connection and verify it independently. A failed/unknown close is reported as
such. Do not terminate sessions or bypass generation checks.

There is only one hosted compatible deployment identified here. Rebuilding the
same code is not a distinct code rollback, and no second target is invented.
For a routing error, the one approved promotion may restore the pinned target if
it has not already been attempted; otherwise stop for review. For an application
defect, retain containment and prepare a separately approved fix-forward artifact.
No unpinned rollback, database restoration, account deletion or automatic resume
is included.
