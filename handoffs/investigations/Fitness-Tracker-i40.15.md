# Setup freshness release preparation

Workspace: `.worktrees/setup-freshness-release`. Owner: programming-quality thread.
Status: investigating fresh-checkout verification; no hosted actions authorized.

## Windows checkout fingerprint mismatch

2026-09-26: full current-main regression passed 3561 tests and failed one retained
release metadata qualification at `release-target-metadata.test.ts:80`.
An isolated run reproduced the same failure (attempts 1 and 2).

Inspection after the second failure found the canonical SQL checked out as CRLF.
The query hash was `e878d0c0fb76213bd3091e240892afc14c37f2674160fc612385d96f816487e3`;
the retained proof binds `37b2eb148c248fcb128951db763827b6c9e81699588099f301d83e5c5ab5f2da`.
No metadata or proof was changed. The discriminating repair pins the canonical
SQL to LF in `.gitattributes` and restores LF in the working copy, preserving
the existing Git blob. The next check must match that exact original query hash
and pass the retained qualification; otherwise stop this blocker after attempt 3.

Attempt 3 succeeded: exact retained query hash restored and all seven metadata
tests passed. The SQL Git blob is unchanged; only checkout attributes change.

The first new upgrade-smoke execution used an already-active owner for an initial
proposal and correctly received 55000 before the pause trigger. This was a fixture
scope error, not a runtime failure. A separate fresh synthetic owner makes the
intended write reach the pause boundary. The corrected smoke passes, including
post-upgrade old-writer rejection, accepted replay and preserved numeric workout RPE.

## Local rehearsal startup, 2026-09-27
Attempt 1: Windows PowerShell 5.1 treated ordinary Supabase stderr (`Starting database...`) as a terminating NativeCommandError under ErrorActionPreference Stop. Fresh process and project-filtered container inspection found no surviving Supabase process or rehearsal containers. No database/bootstrap writes occurred. Repair: capture native stderr with Continue only around start/status, then enforce the actual exit code. Existing shared stack remains untouched. Retry authorized within local rehearsal scope.
Attempt 2: Supabase initialized the new database, then stopped its containers because the Studio bind mount did not exist: `LegacyContainerCreateError: statfs .../supabase/snippets: no such file or directory`. Project-filtered inspection found no remaining new containers or live launcher. Existing original stack unaffected. Reassessment before attempt 3: tool/config/endpoints are viable; startup requires an empty host snippets directory that the installed CLI does not create. Add only that directory, then run the same local startup and inspect identity/listeners. This is the third and final startup attempt in this cycle; stop on another failure. No schema bootstrap or user fixture has run.

## Real PostgreSQL 17 rehearsal
Startup attempt3 passed: PG170006, distinct project sociusfit-setup-freshness-local, verified loopback API55421/DB55422/Studio55423/mail55424. Bootstrap applied only to its empty Auth/public schema. Original shared stack preserved.
PG17 attempt1 passed actual predecessor installation, real Auth creation, compiled accepted-week creation, concurrent active-writer lock timeout, committed pause, paused write rejection and accepted replay. Then failed in a test assertion: `JSON.parse` received empty psql output for SQL NULL from `to_json(to_regprocedure(...))`. Migration install had not run; first wrong-generation negative case correctly rolled back. Fix: query a JSON object containing the nullable field. Add explicit resume-install mode that requires PG17, no setup helper, exactly4 synthetic users, exact three ledger sources, one accepted and one proposed unbound fixture, and paused generation1. It reuses accepted history, creates a distinct contention owner, re-exercises pause contention, then continues exact installation. No schema reset or fixture deletion. This is attempt2 for the rehearsal, independent of the resolved startup cycle.

PG17 attempt2 passed in57.57s. The explicit resume guard matched paused generation1,4 users,no setup helper and exact prerequisite ledger. Repeated real lock contention, installed the unmodified PG17 production wrapper, verified ledger bytes and duplicate refusal, rejected old writers, accepted bound writers, rejected clock-only expiry with unchanged revision, and preserved accepted digests/replay. Final isolated control generation6,open for local HTTP only. Production and original stack unchanged.
Candidate production build now targets local55421 and passed; process19676 commandline verified candidate checkout and loopback3011. Baseline HTTP flow passed14checks, including real Auth/RLS, first acceptance, review, source revision conflict, recovery and immutable accepted history. Dedicated clock-only four-route HTTP coverage is prepared for independent review.
HTTP clock/lifecycle attempt1 passed: initial first-acceptance expiry/reconfirmation; actual saved-review recovery then expiry denial without revision change; fresh current-review recovery; legacy conversion expiry/reconfirmation. Four lifecycle groups use real candidate production HTTP, Auth and PostgreSQL17.6. All accepted historical content and accepted same-key replay remained unchanged. No application defect was found. Final source typecheck and whitespace checks pass. Windows PowerShell5.1 Status now passes with explicit UTF8 status output. Combined sanitized receipt is tracked under docs/verification/programming-quality/setup-freshness-local-release-2026-09-26.json. Original local database readback remains18users, no pause table, no setup guard. No hosted writes, publication or numerical activation.

## Read-only hosted preflight, 2026-09-27
Vercel connector attempt1 used documented projectId/teamId: runtime required idOrName. Attempt2 used idOrName: connector policy required projectId. Reassessment: two validation layers disagree; providing both same-target fields was the final discriminating test. Attempt3 supplied both: runtime again received undefined idOrName, indicating the connector strips the alternate field. No Vercel read or mutation reached execution. Stop this method after3; revised method is the existing authenticated Vercel CLI using fixed project/team GETs, filtered metadata and no decryption. Prepare that exact script before requesting approval under the failed-work guardrail. This is a tool schema mismatch, not an automatic safety rejection.
Database browser inventory attempt1 timed out after36s and reset its kernel; no SQL submitted. Prepare/test the read-only SQL independently while investigating browser availability. No mutation or credential creation is authorized by this read-only preflight.

Browser inventory attempt2 timed out after48s and reset its kernel. No tab state,
SQL submission or hosted readback was obtained. Pause this path rather than
inventing a third probe without evidence of restored availability.

Independent preflight review found and resolved three issues: accepted-history
digests must include superseded versions; Vercel JSON parse errors must not persist
response snippets; and ledger matching must also verify the actual pause catalog.
The revised classifier passed15tests and typecheck. Read-only SQL executed on the
already-upgraded synthetic PG170006 stack at2026-09-27T02:41:44.650Z. It correctly
refused production qualification (target, installed guard, catalog, ledger and
predecessor mismatch), while verifying read-only transaction settings and digest
shape across7plans/32sessions. Receipt:
`output/setup-freshness-release/setup-preflight-local-test.json`. Query SHA256:
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.
Reviewed CLI fallback remains unexecuted pending approval. No hosted claims.

Before mobile verification, PowerShell Stop-Process for verified candidate PID19676
failed with `Object reference not set to an instance of an object`. A following
status string was not proof of termination. Fresh command-line/process inspection
confirmed it remained live. Native `taskkill.exe /PID 19676 /F` then succeeded;
ports3010/3011 were verified free. Only the exact local candidate process was
stopped; the original stack was untouched. The mobile suite now uses `.next`, so
rebuild before any further production-mode local HTTP checks.

Mobile suite completed2026-09-27T02:48:50.051Z:26passed,4.7minutes,exit0,no retries.
All five maintained suites ran with intercepted external services. The new
mobile/preflight receipt records this local scope; committed-head CI remains open.

September27 publication check: an ad hoc pre-commit assertion compared the raw
canonical SQL file to the rendered metadata query hash and stopped before commit.
Inspection confirmed disk, index and HEAD share raw hash
`dcb9a7cf4b414a40d4ed4ca5c46f9a79c2640adb36fbdf801549c0ba17aab759`.
`RELEASE_TARGET_QUERY_SHA256` instead hashes the query assembled from that file's
CTEs. Correct the check to verify the two distinct identities; no SQL or retained
proof is changed. This is a verification-script mistake, not renewed CRLF drift.
