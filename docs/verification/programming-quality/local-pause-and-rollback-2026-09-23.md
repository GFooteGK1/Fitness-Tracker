# Local write-pause and rollback preparation — September 23, 2026

Application artifact switching passed 15 checks. The database pause passed 13
ordered regression checks and 14 real PostgreSQL checks after an approved
correction to the test method. Neither result authorizes production deployment.

## Application artifact switching

The [sanitized receipt](local-app-rollback-2026-09-23.json) records 15 passing checks
from `scripts/release/local-app-rollback-rehearsal.mjs rehearse`. The candidate
build `q5HS3By6DXeXjIPr42yVx` was replaced on the same loopback port 3012 by retained
build `N1fNUQnlscYENMsnBEVzj`, both from compatible application source
`923473a04583684d3f9b150c35ffa7e0173a8e25`. HTTP readback verified each served build
manifest at its build-specific URL against the retained bytes.

With the revision schema kept installed, the retained application preserved
accepted plan intent, denied cross-owner access, accepted a source correction,
rejected the resulting stale proposal with the specific context-conflict message,
removed stale controls, replayed the original acceptance unchanged, and created
and accepted a fresh stamped proposal. Retained file hashes remained unchanged.
The test-owned server stopped; port 3012 had no listener afterward.

Independent review led to checking the current dependency lock before launching
the retained artifact and restricting Git/tar child environments as well as the
application environment. Both fixes and the final receipt were reviewed. Script
syntax and whitespace checks passed. The retained artifact is under ignored local
output, with a source archive, build receipt and 1,730-file integrity manifest.

This proves local switching between two builds of the same compatible source.
It does not prove a downgrade between different application implementations,
hosted traffic switching, or a production-configured rollback artifact. The builds
are explicitly configured for the synthetic local Supabase API at port 55321.

## Database pause

[ADR-0028](../../decisions/ADR-0028-database-enforced-coaching-write-pause.md)
describes the new additive gate and alternatives. The selected implementation
guards all coaching-output table statements and drains their transactions only
upon a successful operator pause COMMIT. New compatible writers may still join
before that point. The five-second per-lock timeout means the pause can fail;
dispatch, waiting, or timeout must never be reported as a completed pause.

The normal-CI test `test/database/coaching-write-pause.test.ts` passed 13 checks:
legacy first-acceptance atomicity, resume and accepted replay; denied access for
anon/authenticated/service roles; direct statements on all six output tables;
stale resume rejection; migration reapplication preserving pause state; missing
control state failing closed; and invalid operator requests preserving state.
PGlite serializes these operations and supplies no independent-session proof.
The combined pause/revision suite passed 29 tests with retained output copies
excluded. Full TypeScript and focused ESLint passed. Independent review required an explicit
preflight that the existing postgres owner can bypass FORCE RLS; the migration
does not grant that permission.

Real PostgreSQL attempts found a harness observer problem, an incorrect assumption
about precommit row-lock admission, and a test statement that the authenticated
role legitimately cannot execute directly. The failed attempts and corrected
method are preserved in the [investigation](../../../handoffs/investigations/programming-quality-write-pause.md).
Greg explicitly approved the revised method. Its first retry passed all 14
checks; the [sanitized receipt](local-coaching-pause-2026-09-23.json) records backend
IDs 9994, 10000 and 9996, with writer 9994 observed blocking the operator. The
permission precheck used actual authenticated RPCs before contention. An operator
timeout returned `55P03` after 5,074 ms and left the gate open at generation zero.
The success schedule admitted a writer before commit, drained the held writer,
committed the pause, and then rejected later writes with `PT503`. A transaction
with an older repeatable-read snapshot failed with `40001`.

All four authenticated RPC paths and INSERT/UPDATE/DELETE/TRUNCATE probes across
the six protected tables failed while paused with unchanged output hashes.
Accepted replay, disconnect persistence, stale resume rejection and migration
reapplication preserved state. The revision migration then applied under the
pause in that isolated database; after resume, a new stamped proposal succeeded
and an old pending draft remained rejected. Operator rollback and missing-state
checks also passed. Direct DML/MVCC probes used postgres; the receipt names each
actor role. These are SQL-level checks, not authenticated PostgREST/HTTP traffic
or a production clone. The source/shared synthetic database was left unchanged.

The gate returns `PT503`, which direct PostgREST callers can receive as HTTP 503.
Existing application routes can reduce that error to their generic failure
response. No maintenance UI is claimed. The gate must be installed and verified
before the earlier-named revision migration; a chronological batch alone does
not establish that sequencing. No gate was installed on production or the shared
synthetic application database during this rehearsal.

## Remaining release evidence

Finish [private production export and restore verification](production-recovery-preparation-2026-09-23.md)
after database authentication is authorized. Prepare a production-configured
compatible application artifact and refresh the exact target/schema/flag checks
before presenting the final release approval. Keep PR #84 draft and numerical
personalization disabled.
