# i40.13 durable local rootless startup

2026-09-26. Authorized by Greg: "let's execute the fix". Branch
`codex/programming-quality`, canonical tracker at repository root.
Status: persistent fix installed; actual scoped restart and Auth verification
passed on the first repair attempt. Independent review found no actionable
defect; canonical Beads i40.13 was closed and read back at
2026-09-26T16:06:03Z. Prior i40.12 attempts remain historical.

## Plan and boundary

Persist the instance-specific `user@1000.service` Slice setting inside only
`podman-sociusfit-local`. The old runtime attempt changed Slice but could not
release the already cached, populated cgroup path. A clean VM startup should
allocate the normal manager directly under `sociusfitlocal.slice`, eliminating
the temporary second manager. This hypothesis requires an actual restart test.

The persistent target is
`/etc/systemd/system/user@1000.service.d/90-sociusfit-isolation.conf`.
It was absent at preflight. Install the tracked fixture with no-clobber semantics;
do not change the global user template, rootless mode, WSL configuration, data
volumes, credentials, or other distributions. No production work is included.

Preflight shows only the nine expected synthetic Supabase containers running.
Capture their IDs and a digest/count of every public table and auth.users, then
gracefully stop only those containers and stop/start the named Podman VM.
Require the normal user manager active in the isolated slice, no transient
manager, the retained rootless connection and network, the same container IDs,
identical data digests before any new Auth writes, loopback-only endpoints and
the real Auth/profile regression. Keep the reviewed fixture in Git; host install
and operational evidence remain separate from source verification.

Rollback boundary: the new file is the sole persistent configuration change.
If startup fails, inspect the fresh service error before another bounded repair.
Revert this task's own drop-in if needed; preserve all existing configuration and
data. A full WSL shutdown, killing foreign cgroup processes, rootful switch,
stack reset, recreation or software upgrade are outside the selected method.

Alternative permanent second-manager service is rejected because it could race
the normal manager. A global WSL upgrade/reconfiguration is unnecessarily broad.
Successful cold startup of the normal manager is the smaller durable repair.

## Execution result — September 26, 2026

Installed the reviewed instance drop-in with no-clobber semantics and verified
its normalized contents against the tracked fixture. The prior existing global
template/delegation settings were preserved. No permanent second manager was
created. Gracefully stopped the eight application containers, then their database,
then `podman machine stop sociusfit-local`; machine readback confirmed stopped.

After `podman machine start sociusfit-local`, the normal user@1000.service was
active with Result=success and actual
ControlGroup=/sociusfitlocal.slice/user@1000.service. Its DropInPaths included the
persistent /etc instance file. The temporary sociusfit-user-manager.service was
not-found/inactive with MainPID=0. Rootless remote Podman returned true. The
previous runtime-only workaround was no longer needed.

Started the same nine retained container IDs without recreation. The local
network remained present. The read-only snapshot helper verified identical row
counts and full-row MD5 digests across 48 scopes (all public ordinary tables plus
auth.users), in repeatable-read transactions, before new Auth writes. All four
host ports (55321-55324) were loopback-only. Every container with a configured
health check became healthy; PostgREST was running and then exercised by HTTP.
OpenClawGateway remained running throughout; no global WSL shutdown was issued.

The final real Auth/profile runner passed all twelve checks at
2026-09-26T16:03:25.927Z. It retained two
additional synthetic accounts/profiles. Existing local data was not deleted.
Read-only snapshot helper syntax and ESLint passed. The configuration's actual
successful cold start is its primary behavior check; a Windows reboot, WSL
upgrade or full Supabase-internal-schema digest comparison is not claimed.

Sanitized evidence:
`docs/verification/programming-quality/durable-rootless-startup-2026-09-26.json`.
Original snapshots remain under ignored output as
`durable-startup-before-20260926.json` and `durable-startup-after-20260926.json`.
The task changes only this named VM's instance drop-in, source fixture, read-only
verification helper and documentation. No production action, numerical-policy
activation, commit or push occurred. The local stack remains running.
