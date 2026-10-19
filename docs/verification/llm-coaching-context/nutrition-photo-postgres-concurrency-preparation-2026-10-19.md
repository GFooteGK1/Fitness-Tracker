# Isolated native PostgreSQL concurrency test preparation

Local Windows native PostgreSQL/container tools were unavailable and WSL inventory
was denied; no retry/bypass/install was attempted. An additional permitted path
was identified: the existing GitHub-hosted ubuntu-latest CI job. The official runner
image inventory lists preinstalled PostgreSQL16 (Ubuntu24) or18 (Ubuntu26). This
slice adds tests under the existing npm test command; it changes no workflow,
production schema, background job, credential, permission or installed software.

The tests run only on Linux with GITHUB_ACTIONS=true. They locate existing trusted
/usr/lib/postgresql/<version>/bin executables and fail rather than install anything
if unavailable. A nonprivileged user initializes an exclusive temporary synthetic
cluster, binds only a private Unix socket (TCP disabled), and uses explicit paths
and a minimal child environment with no inherited provider/DB credential variables.
HOME, PGPASSFILE, PGSERVICEFILE and PGSYSCONFDIR point into the exclusive fixture
root; controlled password/service files are empty. SSL/GSS encryption is disabled
for this private Unix-socket fixture. Default host credential/config files are
not consulted.
No system service or existing database is opened. Only synthetic owner/roles/data
are created in that new cluster. Owned psql children and server are stopped in
cleanup; there is no recursive deletion or application photo cleanup.

The unapplied reviewed pilot SQL is loaded only into this disposable cluster,
with literal gates/owner digest changed in the test string. Canonical meal-table
structure is a minimal fixture; these are financial transition/locking tests, not
another canonical food-logging or hosted Storage claim.

Three positive races use separate psql processes and assert distinct PostgreSQL
backend PIDs. One transaction remains open while another is observably waiting
on a database Lock. After commit, assertions cover:
- two different captures competing for the last250000microUSD: exactly one grant,
  other denied specifically by the spending ceiling, total1000000;
- same capture/stage: one reservation/grant, other denied specifically by duplicate-stage uniqueness, total250000;
- trusted settlement versus estimation admission: admission waits and sees the
  confirmed660 charge only after commit, final exposure850660.

A negative control replaces only the disposable owner function to remove both
financial locks. Under the same overlapping transaction condition, both last-slot
admissions commit and total1250000. The shared cap oracle must reject that actual
overspending. The original disposable function is restored. No candidate SQL is
modified by the test or negative control.

Local Windows execution skips these4tests by design; local typecheck/static review
is not concurrency proof. Only a passing CI run with emitted PostgreSQL version,
distinct PIDs and positive/negative receipts can establish that these races ran.
Independent review and actual CI execution remain required. Even successful native
PG tests do not qualify production Auth/PostgREST/Storage, hosted latency, food
accuracy, billing or key suitability. All runtime activation gates remain false.

Primary environment evidence checked2026-10-19:
https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md
https://github.com/actions/runner-images/issues/14226
The current repository job reports ubuntu-latest/GitHub Actions runner metadata.
No image pinning or OS/service changes are included.
