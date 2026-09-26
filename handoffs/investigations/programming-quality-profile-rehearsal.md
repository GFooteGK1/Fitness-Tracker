# i40.12 profile rehearsal continuation

2026-09-25. Workspace: `.worktrees/programming-quality`; branch
`codex/programming-quality`. Objective: reproduce the production profile trigger
and verify owner-authenticated local provisioning. Production cutover is complete.

## Current state

Status: recovered and i40.12 verified. The later persistent i40.13 fix also passed
a cold VM restart; see [durable execution](programming-quality-durable-podman.md).
The runtime-only limitation below describes the earlier recovery. Greg authorized RCA, replan and execution.
Two bounded repair attempts restored the rootless socket and existing stack.
The second real-Auth runner passed twelve checks; seven focused tests and final
independent review passed. Runtime-only recovery expires at VM stop; i40.13
tracks durable startup. No production work or destructive reset occurred.

## Evidence and attempts

1. `local-supabase.ps1 -Action Status`: `Local machine is stopped; use -Action Start`.
   No state change.
2. `local-supabase.ps1 -Action Start`: existing VM started; helper then reported
   `Dedicated local network missing; inspect setup before creating it`.
   No schema or account changes. The VM remains started.
3. Read-only `podman --connection sociusfit-local network ls` and `ps -a` showed
   `ssh: rejected: connect failed (open failed)` against the Podman socket.
   This disproves treating the helper's message as proof of a missing network.
   No network, volume, container or database recreation was attempted.

## Original revised method (subsequently authorized)

Inspect the existing named connection and WSL user/socket service, then restore
only that existing socket service if its identity and failure are confirmed.
Do not initialize a VM, switch root mode, reset Supabase, delete data, or recreate
networks/containers. At most three recovery attempts, beginning with connection
and socket inspection; require successful local-stack status before Auth/HTTP
verification. If the configuration differs materially, stop with the evidence.

Local fixture implementation, six embedded PostgreSQL/helper checks, syntax and
focused lint passed. Separate review found no actionable defect in the fixture,
callers, tests or prepared HTTP runner. That runner is not executed. No local
database mutation occurred. Existing generated bootstrap manifests remain intact.

## RCA and revised execution plan — September 26 UTC / September 25 Chicago

Read-only checks establish that the saved rootless connection still targets user
1000 and `/run/user/1000/podman/podman.sock`. The named VM is running and its
retained `sociusfit-local-net` exists. The user manager has MainPID=0 and Result=
resources; its log reports `Failed to spawn executor: Device or resource busy`.
The socket and user bus are absent. The helper suppresses the network-inspect
error and incorrectly labels all failures as a missing network.

This Podman VM uses a nested systemd namespace (outer PID16). Ordinary direct
WSL commands see WSL init, and WSLg supplies a different XDG_RUNTIME_DIR; these
are diagnostic complications, not evidence of a missing network. Entering the
actual systemd namespace confirms the service failure. The default user-manager
cgroup remains populated by processes invisible in this PID namespace (reported
as PID0), despite its own user manager being stopped. A shared WSL cgroup
collision is the leading cause. Installed WSL is 2.6.3.0, kernel 6.6.87.2.
Related upstream symptom report: https://github.com/microsoft/WSL/issues/13053.
No claim is made that this older report proves this host's exact cause.

Selected repair: a runtime-only drop-in for the existing `user@1000.service`
assigns its cgroup to the unused `sociusfitlocal.slice`; reset only its failed
state and start it. This isolates the affected manager without touching other
distributions or processes in the shared group. Check active user manager,
rootless socket, remote Podman and preserved network/container identity. The
runtime drop-in expires with the VM; do not silently make it persistent.

Rejected methods: restarting the failed service in the same occupied cgroup does
not change the cause; stopping all WSL distributions would interrupt unrelated
work; rootful mode or stack recreation would bypass the retained rootless data.
After service recovery, start only the existing synthetic stack, correct the
helper's misleading diagnostic, apply the missing local profile trigger only
after catalog checks, then run the prepared real Auth/HTTP regression.

### Recovery attempt 1

Added the runtime-only user@1000 drop-in and started the failed manager once.
It failed with the same resources error. Readback showed Slice=sociusfitlocal.slice
but ControlGroup still pointed at the old occupied user.slice path; no manager
subgroup was created under the new slice. No containers or unrelated processes
were touched. A simple slice override cannot evict systemd's retained unit path.

Attempt 2 changes that assumption: start a separately named transient user-manager
unit with the same UID, PAM session and delegated init.scope under the isolated
slice. It will run the existing systemd --user binary and use the normal user's
runtime directory. This avoids stopping/killing the foreign occupied cgroup or
restarting any other distribution. Both changes remain runtime-only.

### Recovery attempt 2 result and local verification

The transient `sociusfit-user-manager.service` started successfully in
`/sociusfitlocal.slice/sociusfit-user-manager.service`. Remote Podman returned
server version 5.8.7 and the retained network and nine stack containers. The
normal Supabase start then passed, with all four host ports loopback-only.
This supports the cgroup-collision diagnosis; no global WSL restart or foreign
process termination occurred. The workaround expires when the VM stops.

The local database was PostgreSQL17.6 with 14 synthetic Auth accounts and eight
profiles, no set_user_id function and no profile triggers. Applied only the
reviewed ownership function/trigger in a transaction with absence/RLS/target
guards. All eight pre-existing profile rows retained digest
`fbaa6ead252503588beec315059bfab2`. Historical bootstrap manifests were preserved.

Real-Auth runner attempt 1 stopped before account creation: pg_get_triggerdef
omitted `public.` from the function under the default search_path. This was a
deparser representation mismatch, not a different trigger identity. Corrected
the read-only catalog query to use search_path=pg_catalog and psql quiet mode;
added a PostgreSQL regression for explicit qualification. The second run must
pass this strict check before any account creation.

### Successful final acceptance

Runner attempt 2 passed twelve checks at `2026-09-26T04:02:41.852Z`, including
the exact trigger, both expected service-role23502 failures/zero inserted rows,
two real Auth logins, owner create/repeat readback and cross-owner isolation.
Sanitized receipt:
`docs/verification/programming-quality/profile-provisioning-local-result-2026-09-26.json`.
Two new synthetic accounts and profiles remain in the local fixture. Credentials
remain only in ignored local output. No production data was accessed or changed.

Final local-stack readback passed all nine existing container identities and four
loopback-only ports. Seven PostgreSQL/helper tests, focused lint, PowerShell
syntax and diff checks passed. Final independent review supported closing i40.12.
The earlier full TypeScript check remains applicable; later edits are JS tests,
catalog query formatting and the startup helper's diagnostic only.

Root cause conclusion: the standard user manager could not allocate its executor
in a populated shared cgroup containing out-of-namespace processes. Its missing
user bus/socket caused the SSH connect error. The helper hid that causal error
and reported a missing network even though the network existed. A separately
named isolated manager recovered functionality; neither data loss nor missing
network was observed. The precise foreign process owner was not investigated.
Do not claim a persistent host fix: the runtime unit and drop-in vanish at VM
shutdown. Beads i40.13 records this remaining reliability work.

## Session tooling

Initial sandbox reads could not execute `bd.cmd` or read GitHub CLI config
(`Access is denied`). Approved host-permission reads resolved both. Canonical
tracker remains the repository root, not the worktree's passive export.
