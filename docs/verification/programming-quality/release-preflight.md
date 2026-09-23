# Programming-quality release preflight and cutover

Prepared 2026-09-22. This is an execution runbook, not a record of a hosted migration or deployment. Greg authorized regression repair, branch/PR publication, prerequisite verification, isolated cutover/rollback testing, and mobile validation. Production migration, deployment and configuration approval remains a later, target-specific decision. This document does not require another generic approval for the already authorized isolated work.

## Candidate and current evidence

### Current budget constraint and execution route

Greg declined Supabase spending on September 23. Keep production on Free; no
paid plan, branching, PITR or paid canary provisioning is authorized. This
supersedes the paid setup recommendation in the historical hosted receipt.

Local tooling and scoped database/Auth foundation are verified in the
[September 23 setup receipt](local-setup-2026-09-23.md). The subsequent
[real local rehearsal](local-rehearsal-2026-09-23.md) passes contention, tenant/API,
mobile acceptance, synthetic restore and old/new schema checks. It found and fixed
an earlier recommendation lock wait; the revised migration SHA256 is
`0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`.
The older migration hash below is historical. The one-second RPC setting limits
each lock wait, not total request duration; `55P03` returns a recoverable HTTP409.
Production recovery, operator traffic pause and compatible app rollback are still
unverified. Historical setup language below does not supersede these new receipts.

Use a local Supabase stack and local application with synthetic owners/data for
the already authorized isolated rehearsal. Supabase documents local development
as free and provides PostgreSQL, Auth and Storage through its CLI plus a
Docker-compatible runtime: [local setup](https://supabase.com/docs/guides/local-development).
Select a runtime with no applicable license charge, bind locally, and record its
actual PostgreSQL version before testing. CLI/container tools were not found on
PATH in the September 23 inspection; installing/preparing local tools is the
next setup step, not a completed prerequisite. Do not substitute PGlite for the
two-independent-connection checks or repoint the shared production Preview.

Replace the managed-backup requirement with a verified manual recovery process.
Supabase recommends off-site CLI exports for Free projects:
[backup guidance](https://supabase.com/docs/guides/platform/backups).
Prepare the export/restore manifest (schema, data, roles, migration ledger and
required Auth/configuration dependencies) using its
[backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Use an authorized secure database connection; dashboard sign-in alone does not
establish CLI access. Keep production exports encrypted outside Git, logs and
test fixtures. An off-device copy requires an existing approved destination;
no new storage purchase or upload is implied. Account separately for Storage
objects and secrets/configuration that database exports do not recover.

Validate the backup by restoring into a separate private recovery environment;
production backup contents must not become the synthetic canary's seed data.
Record restore success, recovery operator and recoverable timestamp. Take a
fresh consistent backup during the tested write pause before production cutover.
After reopening writes, preserving later writes requires fix-forward or a
separately planned reconciliation; restoring an older backup loses newer writes.
Free operation requires an explicit manual backup cadence and retention owner;
this plan does not create an automation or claim ongoing backups exist.

Then complete the existing isolation, tenant, concurrency, mobile, compatible
rollback and target checks below. A second Free hosted project is only an
optional fallback if eligibility is verified; the primary route does not depend
on a free hosted slot. Local rehearsal does not establish Vercel networking or
production configuration, so those readbacks and controlled smoke checks remain
part of the separately authorized production release. No paid resource is needed
to continue this preparation.

September 23 follow-up: [hosted preflight receipt](hosted-preflight-2026-09-23.md)
supersedes the sign-in blocker below. The prior six migrations are recorded;
the new revision migration is absent. Bounded catalog comparison passed, while
full drift reconciliation, recovery and isolated rehearsal remain incomplete.
The target Free plan has no managed scheduled backups and its organization has
no separate canary. No hosted writes or deployment occurred.

The inspected checkout was `codex/programming-quality` at `9cfc45814b0531baf69f59096620346ec0f557e6`. Record the final PR head, tree and migration hash after subsequent repairs and this packet are committed; the inspected SHA is not automatically the release candidate. Required CI, build and mobile evidence must identify that final candidate or document why later changes do not affect a check.

The new migration is `supabase/migrations/20260921010000_coach_proposal_context_revision.sql`. Its preparation-time SHA256 is `463C0C501BCC1A85762CEBF3916F0B4DA62995FF22E795AAC9C504203BB97891`. Recompute before execution. The [local revision receipt](proposal-context-revisions.md) records actual SQL/PGlite coverage; PGlite serializes statements and does not establish independent-connection contention. The [signal-fix receipt](signal-review-fixes.md) separates actual evaluator/compiler tests from mocked API persistence and excludes hosted verification. Neither receipt supplies production readiness on its own.

The earlier A0 investigation is available in the sibling `data-to-personalized-coaching` worktree at `docs/verification/data-to-personalized-coaching/a0-action-manifest.md`, `a0-schema-readback.sql`, and `handoffs/investigations/Fitness-Tracker-u5l.14.md`. Those September 18 observations are historical pointers, not refreshed evidence:

| Historical pointer | Verification required now |
| --- | --- |
| Supabase reference `auolnfwetmfcwhtvakzy` | Confirm selected production project, owner and connection destination before metadata access. |
| Vercel project `prj_RocmjxStsTrtmrDaqMddMnb29ENh`, scope `gregs-projects-98860c8b`, domain `www.sociusfit.com` | Confirm current project, deployment/SHA, public and server database destinations, and effective flag values. Do not retrieve secret values into artifacts. |
| Preview/Development pointed to production Supabase | Treat those deployments as non-isolated until fresh configuration proves otherwise. A Preview URL alone is not a canary. |
| Supabase dashboard required sign-in; ledger and backup information unread | Use an existing authorized session/connection. Do not create or rotate credentials, scan credential stores, or provision a project to bypass access. |

The old production deployment identified by A0 is not a valid rollback floor after this revision migration: it predates revision-stamped writers.

September 22 coordinator readback still found the retained Supabase browser tab on sign-in. The user was asked to sign in and identify an existing isolated database/application. The connected Vercel inventory exposed only an unrelated Edu Ops team; a separate successful existing-CLI read confirmed the production project/team above and deployment `dpl_5kZSaXHLmqPPzsCy6odLJyy99utW`, READY at `f123aa8aa848716e894ea7bec340d693995e4b36`. Environment metadata shows one encrypted `NEXT_PUBLIC_SUPABASE_URL` variable targeting Production, Preview and Development, with `gitBranch: null` and no branch-specific override. The value was not read. The six newer capability variables were absent; the pre-existing production `COACH_EXERCISE_PREFERENCES_ENABLED` value was not read. The scope inventory contained `fitness-tracker` and unrelated `forge`, with no designated canary. No configuration or secret values changed. This confirms the shared configuration shape, not credential validity or hosted schema.

`Get-Command` did not locate PostgreSQL, Docker or Supabase executables on PATH; this is not proof that no local fixture installation exists. The disposable PGlite check below does not supply an independent-connection server or a canary application. No current hosted ledger or recovery verification follows from these observations. Refresh this checkpoint from the coordinator's execution receipt before promotion.

## Read-only target evidence

Run [release-schema-readback.sql](release-schema-readback.sql) only through the verified existing connection. It uses a read-only transaction and catalog/ledger SELECTs. It does not read athlete rows or call application RPCs. In particular, `get_coach_context_revision()` inserts a revision row and is not a read-only probe. Recommendation page visits and nominally read-only recommendation RPCs may also write; exclude them from metadata preflight.

This query covers the new revision boundary and its rolling-review dependencies. Use the prior A0 full public-schema inventory as well when reconciling the six earlier migrations, including capture/recommendation overloads and source triggers outside this query's bounded list. A passing revision inventory does not certify those prerequisite packages. The conversion route uses `create_rolling_weekly_replacement_proposal`; there is no separate conversion RPC to inventory.

Capture these sanitized facts, with UTC time and operator, in the eventual execution receipt:

| Evidence | Required result |
| --- | --- |
| Destination and permissions | Project/application identities, database name/version and session role agree with the intended target. SQL host information alone does not prove the Supabase project identity; confirm it through the connection/session provider. |
| Migration ledger | Exact applied versions/names; classify each required file as applied-and-matching, absent, or drifted. A matching version alone does not establish matching definitions. |
| Schema bodies and privileges | Compare functions, overloads, columns, triggers, constraints, indexes, RLS/FORCE RLS and grants with the candidate installed into the isolated fixture. Preserve full relevant definitions and their catalog hashes. File SHA256 and catalog MD5 are different identities; do not compare them to one another. |
| Recovery | Target backup recency/retention, available restoration mechanism, recovery operator and preservation of post-cutover writes. Database catalog queries cannot establish this; obtain provider/operator evidence. |
| Release artifact | Final commit/tree, successful required checks/build, deployment artifact identity and proposed compatible rollback artifact. |
| Isolation | Separate empty synthetic database, connection destination, synthetic owners and app destination; no production data clone or production credentials. |

The prerequisite release chain through `20260915220000_exercise_preferences.sql` and the six files below must be reconciled against the target. The prior [W11 release packet](../data-to-personalized-coaching/w11-release-packet.md) describes their compatibility floor and final overloads. This is a required candidate sequence, **not a claim that all seven migrations are missing**:

1. `20260918010000_optional_session_feedback.sql`
2. `20260918011000_session_capture_signals.sql`
3. `20260918020000_capture_receipts.sql`
4. `20260918030000_training_intent.sql`
5. `20260918040000_targeted_review_sources.sql`
6. `20260918050000_recommendations.sql`
7. `20260921010000_coach_proposal_context_revision.sql`

Apply only the verified missing subset in order under the later target authority. Never repair a ledger entry, overwrite drift, replay a documentation mirror as a second migration, or use a broad database push to discover what happens. Installing an older RPC body after a newer prerequisite may remove required behavior.

Post-install revision-specific evidence must show the owned SELECT-only `coach_context_revisions` table with RLS and FORCE RLS, authenticated-only execution of the read/initialize RPC, no direct execution grants on internal guard helpers, eight `zz_advance_coach_context_revision` source triggers, the proposal guard, and a DEFERRABLE INITIALLY DEFERRED review guard. The assertion function must retain `FOR SHARE NOWAIT`. Compare the two replaced RPCs (`record_coach_weekly_review`, `create_rolling_weekly_replacement_proposal`) in full, not just their names. Existing initial/conversion/acceptance RPCs must still reach the proposal guard.

## Compatibility and cutover strategy

This branch cannot be deployed as a code-only update to a database missing the revision migration. Weekly creation, conversion and review call the new revision RPC regardless of feature flags. Conversely, installing the migration while old writers remain live makes their unstamped rolling writes fail. Turning all capabilities off does not solve either incompatibility. Accepted records and successful accepted replay remain immutable; old pending unstamped rolling drafts must be recreated, not backfilled with a current stamp.

Use a coordinated cutover with a tested, operator-controlled write pause. The pause must cover old rolling proposal/review/acceptance requests, stale clients, alternate callers and in-flight requests. If prerequisite capture migrations are also absent, extend the pause to affected capture/correction writers as required by W11. No such maintenance control is implemented by this runbook; identify and test the actual target mechanism before promotion. If it cannot reliably drain those paths, stop and design a compatible staged release rather than accepting a window of failed writes.

1. Freeze a passing candidate and build/deployable artifact. Verify prerequisites, recovery and target identity. Retain a revision-compatible rollback artifact; the pre-migration main application is not one.
2. Rehearse the exact missing subset and cutover against the isolated target below. Preserve logs and establish the applicable pause/recovery procedure.
3. For the later authorized production cutover, enable the tested pause and drain affected traffic. Apply only approved missing migrations. If a migration fails, keep affected writes paused and inspect the ledger/definitions; do not retry blindly or promote code against partial prerequisites.
4. Deploy the pinned compatible application, read back its SHA and effective capabilities, and run read-only schema/route checks. Retain existing flag values unless separately authorized; absent flags stay off. `initialDosePolicy` must remain false.
5. Under explicitly authorized synthetic-write scope, validate new stamped review/proposal, stale-context rejection, exact retry, accepted-plan immutability, corrected intent replacement and foreign-owner denial. Reopen affected writes only after the checks pass. The cutover receipt must distinguish read-only checks from synthetic writes.

New intent, history and targeted review remain capability-gated, but the revision fence, direction reconciliation, saved readback and progress-to-continuation change existing rolling-week behavior without those flags. This release does not activate a VBT dose policy or certify physiological programming quality. Flags are deployment-wide; no per-athlete rollout is implied.

## Authorized isolated rehearsal

Use a verified loopback PostgreSQL fixture or an already designated isolated environment with the authorized synthetic scope. Do not repoint existing fixture creation/cleanup scripts at hosted databases. Record the actual endpoint/port, PostgreSQL version, database name, two synthetic owner UUIDs and application artifact. Preparation names are not target identities. No target is selected or provisioned by this packet.

| Test | Required observation |
| --- | --- |
| Before/after schema | Catalog readback before and after the exact chain; candidate migration hash, expected final functions/grants, repeat-application behavior on the disposable fixture. |
| Old writer after new schema | An old unstamped rolling write/first acceptance fails closed without partial program/session/proposal writes. Confirm the operational pause prevents exposing that failure to real traffic. |
| New writer and replay | Revision read precedes source reads; fresh initial, conversion and reviewed replacement persist; repeated original accepted request returns the same result without changing accepted JSON. |
| Mutation between read and save | Insert, correction, deletion or intent change after the captured revision causes conflict and rollback. Fresh review/replacement recovers and releases the pending-window conflict. |
| Two independent connections | Hold a source mutation/revision lock in connection A; attempt proposal/review in B and record bounded conflict without deadlock. Also hold the validated revision fence before a source mutation and prove commit ordering. Repeat with rollback, then demonstrate fresh retry succeeds. PGlite is insufficient for this row. |
| Tenant and internal authority | Owner B cannot inspect or act on owner A's review/revision/proposal; authenticated direct guard-helper execution is denied. Test through real roles, not only owner-filtered mocks. |
| UI recovery | On mobile, show refreshed review after context conflict, clear stale proposal controls, confirm corrected setup then create a new review, preserve historical origin and unknown signal counts, and accept only the matching proposal. Retain screenshots and browser assertions with synthetic services/real isolated services labeled separately. |
| Application rollback rehearsal | Switch to the retained revision-compatible artifact with schema kept installed. Confirm owned reads, corrections/recovery, stamped writes and accepted replay still work. Demonstrate the pre-migration artifact is rejected as the rollback candidate. |

The final two-row concurrency schedule and its lock observations must identify real connection IDs, timeouts and transaction outcomes. Do not claim concurrency proof from sequential RPC calls. Preserve synthetic audit history until its fixture-specific cleanup is authorized; do not infer account-deletion safety from new-table cascades.

## Failure and rollback

Before the revision migration commits, a failed attempt can leave the old application serving the unchanged schema only after ledger/definition verification and restoration of any earlier missing prerequisites' compatibility. Once this migration commits, rollback means preserving the schema and using a verified revision-compatible application or fixing forward while affected writes remain paused. Disabling optional capability flags cannot repair an incompatible writer. Do not drop revision/source guards, remove audit rows, re-stamp historical decisions, or down-migrate accepted data to make the old application run.

If no independently built compatible rollback artifact exists, the only prepared application recovery is fix-forward with the write pause retained. State that limitation in the promotion decision. A database restore is a separately approved disaster-recovery operation with explicit handling of writes since the backup; it is not an ordinary application rollback.

Stop promotion for missing/drifted schema, unknown destination, cross-owner access, accepted-plan mutation, duplicate effects on retry, unresolved lock/deadlock behavior, stale acceptance, missing recovery evidence or a failed required CI/build/mobile check. Scope these stops to release correctness: incomplete broad coaching calibration or future P3/P4 features do not prevent saving and reviewing the protective implementation, but remain barriers to claims of complete programming quality or numerical-policy activation.

## Local query execution and remaining steps

At `2026-09-22T13:22:15.810Z`, the complete metadata SQL executed successfully on disposable **PostgreSQL 18.3 / PGlite 0.5.8**, using the repository recommendation fixture's actual prerequisite migrations plus the new revision migration. A deliberately absent ledger first produced `42P01` and left the schema absent. An explicitly synthetic ledger was then installed only in that in-memory fixture; the query ran under `transaction_read_only = on`, returned 14 function overloads and eight source triggers, and verified RLS/FORCE RLS, deferred review-trigger attributes and effective grants. Auth-owner and revision-row counts remained zero. This is executable syntax/catalog evidence, not a hosted-ledger or concurrency result.

The ignored local harness is `output/app-quality-release/release-schema-readback.test.ts`; `node node_modules/vitest/vitest.mjs run --root . output/app-quality-release/release-schema-readback.test.ts` passed **2 tests in 1 file**. The local result is `output/app-quality-release/release-schema-readback-result.json`. Query SHA256: `ed595f5206d8b83dfd4c1c5c38c5bd8a680cbcd98f7a38191a9fa239ad5e2f88`. The migration hash matches the candidate hash above. No runtime files, hosted connection, secrets or athlete records were used.

Current hosted prerequisites, backup/recovery, an independent-connection isolated server and app, multi-session contention, deployment health and mobile behavior remain unestablished by this packet. The lead agent owns the authorized isolated and mobile execution and will append evidence in its execution receipt. If no existing isolated target/access is available, identify that concrete missing resource; continue local review and PR work without requesting repeated approval for already authorized actions. Any provisioning/cost decision and later production writes require their exact target-specific authority.

Additional preparation checks: the metadata script's read-only transaction and absence of application-RPC calls were statically checked; all 14 requested function names were matched to repository migrations. File whitespace and local documentation-link checks passed. These checks and local SQL execution do not establish a completed cutover or rollback rehearsal.

Before final production approval, present the final candidate/PR, refreshed target IDs, exact missing migrations and hashes, effective flags, passing isolated and mobile evidence, tested pause/rollback artifacts, recovery evidence, and the explicit synthetic-write scope. Do not label this document itself as a completed rehearsal.
