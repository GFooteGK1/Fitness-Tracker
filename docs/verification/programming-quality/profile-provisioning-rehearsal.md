# Profile provisioning rehearsal fidelity — i40.12

Verified September 26, 2026 UTC / September 25 Chicago. Local implementation and
real Auth/PostgREST verification passed. i40.12 was closed and read back at
`2026-09-26T04:05:53Z`; durable
Podman startup recovery is a separate follow-up, i40.13.

## Checkpoint and scope

GitHub run [36138184715](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36138184715)
completed successfully for `0b012bae7ab2d75e5ddb67e19c1ca18136191c2f`.
Tests, TypeScript, lint, build and mobile journeys passed. This is checkpoint
evidence, not CI for the uncommitted changes described below. PR #84 is open and
draft at that same commit. Canonical Beads confirms i40.11 closed, i40.12 claimed.

No production action was taken. `initialDosePolicy: false` remains at
`app/lib/personalized-coaching-capabilities.ts:8`. No commit or push was made.

## Change

The local bootstrap now includes the retained production ownership function and
profile BEFORE INSERT trigger. The source is the September 24 read-only schema
receipt `output/app-quality-release/cutover-20260924/profile-trigger-metadata.json`.
The tracked SQL contains only schema definitions. Its unconditional
`NEW.user_id = auth.uid()` differs from the conditional historical migration.
The existing bootstrap output and historical manifests were not regenerated.

Both local app rehearsal callers now sign in before provisioning through the
owner's anon-key client. The shared helper verifies the authenticated identity,
performs one upsert and requires owner-row readback. Service-role access remains
limited to local Auth account creation in those callers.

The dedicated `scripts/release/local-profile-provisioning-rehearsal.mjs` runner
checks fixed local endpoints, the named database container/project, and the exact
enabled trigger before creating synthetic accounts. It records credentials only
in ignored local output, tests service-role 23502 and zero inserted rows, signs in
as each owner, repeats the owner upsert and checks cross-owner read/update
isolation. It never applies SQL, retries failures or deletes users.

## Evidence and limits

- Seven Vitest checks passed in `test/database/profile-owner-provisioning.test.mjs`.
  Five execute PostgreSQL behavior in PGlite; two check helper rejection/readback.
  They cover 23502, repeated upsert, caller-derived insert ownership, isolated
  reads/updates, rejected owner reassignment and fail-closed helper behavior.
- JavaScript syntax checks, focused ESLint, full TypeScript
  (`tsc --noEmit --incremental false`) and whitespace validation passed.
- Independent review of the fixture, helper, callers, tests and HTTP runner found
  no actionable defect. Function/trigger matched the retained schema receipt after
  normalization. Final independent review read the successful HTTP receipt and
  found the i40.12 acceptance boundary satisfied.
- PGlite simulates auth claims; separate real Auth/PostgREST evidence is below.
  The separate profile `updated_at` trigger remains outside this focused fixture.
- Real Auth/PostgREST verification passed all twelve checks at
  `2026-09-26T04:02:41.852Z`. See the [sanitized receipt](profile-provisioning-local-result-2026-09-26.json).
  Two synthetic accounts/profiles were created and retained. Both service-role
  upserts failed23502 with no profile inserted; owner sign-in, create/repeat
  readback, cross-owner read/update isolation and unchanged owner goals passed.
- Before this run, only the missing reviewed function/trigger was added to the
  isolated PostgreSQL17.6 database under absence/RLS/target guards. All eight
  existing profiles retained digest `fbaa6ead252503588beec315059bfab2` across
  installation. The first runner attempt stopped before Auth writes because
  PostgreSQL omitted schema qualification; fixed search_path and its regression
  resolved it without weakening the comparison.
- The rootless user manager's shared cgroup conflict was bypassed with a separate
  transient manager in `sociusfitlocal.slice`. Remote Podman, the retained network,
  all nine stack containers and all four loopback-only host listeners passed
  readback. The helper now distinguishes connection failure from network failure.
  See the [RCA, attempts and recovery result](../../../handoffs/investigations/programming-quality-profile-rehearsal.md).

## Subsequent durable startup verification

The first user-manager workaround was runtime-only. Greg subsequently authorized
i40.13: the same slice setting is now a persistent instance-specific drop-in,
and the normal manager passed an actual scoped VM stop/start without the temporary
manager. All nine container IDs and 48 data-scope digests/counts matched before
new Auth writes; twelve real Auth checks passed again. See the
[durable startup receipt](durable-rootless-startup-2026-09-26.json).
No global WSL configuration, upgrade, global restart, rootful switch or foreign-process
termination was performed. Do not rerun the bootstrap on the populated schema,
recreate the stack, or overwrite the historical bootstrap manifests. The current
stack remains running with its existing data and two retained new synthetic users.

The next unfinished core package is P0 (`i40.1`): broader source-grounded baseline
adjudication and the sealed grouped holdout. Greg's six qualitative signal
judgments are already accepted; do not repeat them. P2 parent acceptance still
depends on P0; P1 and P3 remain dependent work. This fixture fix does not close
those programming-quality gates or authorize numerical activation.
