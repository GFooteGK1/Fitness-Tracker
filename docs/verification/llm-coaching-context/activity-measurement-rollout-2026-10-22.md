# Activity measurement SQL rollout and source reconciliation

The owner-approved SQL was applied once through the existing connected Supabase `apply_migration` tool to project `auolnfwetmfcwhtvakzy`, named `activity_measurement_corrections`. The platform assigned **20261022164908**. The originally prepared version was **20261022131056**; preserving that original timestamp was an implementation constraint, superseded by explicit approval of this apply-and-reconcile sequence.

This candidate renames the active migration to `20261022164908_activity_measurement_corrections.sql`, with identical canonical SQL. It contains no second active copy and no migration-history repair, insert, update, delete or falsified applied status. Git records the actual platform identity. Dated PR111/112 review receipts and the prior 48-version manifest remain historical evidence; the [rollout manifest](activity-measurement-rollout-manifest.json) records the current 49-version inventory and zero pending SQL for this candidate.

## Observed production evidence

- Fresh preflight: 48 migrations, latest `20261019154246`, no target version/name. Published main was `22b7e31d08696b78b11d7b88dbb3bccb1c14d9de`.
- Authenticated owner dashboard: fitness-tracker / main Production / `GFooteGK1/Fitness-Tracker`, working directory `.`. `Toggle deploy to production` had `aria-checked=false`; Save changes was disabled. No settings action was taken. An initial tab opened the other Chrome profile, which was signed out; browser inventory located the existing authenticated owner dashboard in the second profile. No credentials, tokens, grants or new OAuth consent were used.
- Tool returned `success:true`. Subsequent read-only inspection found exactly 49 history rows and one target row at `20261022164908`, name `activity_measurement_corrections`. Its one stored statement matched the submitted SQL string exactly: 11,360 UTF-8 bytes, MD5 `09999bd92519592e5ab124d04eda7f97`, SHA256 `aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5`. There was no second apply attempt. A local response-wrapper parsing error was corrected by inspecting the already saved readback response; it did not cause a database retry.
- `public.mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)` retained OID **161206**, owner `postgres`, ACL `{postgres=X/postgres}`, SECURITY DEFINER and empty `search_path`. Its whitespace-normalized body MD5 changed from reviewed baseline `c39a0f39dd87c75402b79bb956b925b0` to expected `30bf6fd1aee1dc278df5497f4f58e552`; `preserved_unchanged_inputs` is present.
- No backfill, athlete-record read/write canary, credentials, grant/security/network change, CLI credential creation or ban clearing occurred. The exact applied payload only guards and replaces the existing function; future callers receive its approved correction behavior.

The task did not change `SOCIUS_MCP_WRITES_ENABLED` or `SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED`. Code defaults and qualified tests remain OFF unless explicitly enabled. Fresh hosted environment-value inspection is **not** claimed: the known Vercel team-scope 403 was respected. This is an unchanged-configuration statement, not a new runtime flag-value measurement. Activation still requires separate approval and verification.

## Ordering and duplicate prevention

The applied version sorts after the observed history tail. This was the only pending local migration, with no later migration depending on its old identity. Active references in fixtures/tests, the ADR and environment example now use the real applied version; the SQL path is pinned to LF. The inventory test requires one active correction file, the unchanged reviewed content hash, all 49 applied version/name pairs and zero pending entries. Its negative control proves that retaining the old filename would make the SQL pending again.

The connected branch inventory exposes only production main. Independently managed databases outside that inventory are not inspected. Before using this rename in another shared environment, check whether that environment applied the old identity; do not silently repair another database's history. Disposable developer databases can be rebuilt through their existing explicit test/reset workflow.

## Verification and next boundary

Focused tests, chronological isolated database replay, aggregate checks and independent review are recorded below before publication. The SQL content is unchanged from the independently reviewed PR111/112 candidate; this slice qualifies the actual migration identity, references and pending comparison. Prior native PostgreSQL 17 evidence proves the identical SQL chain, while current replay evidence is reported separately.

Keep automatic database deployment OFF throughout this PR. The repository's main branch still has the old active filename until this PR is separately approved and merged. Do not restore automation against that intermediate source/history mismatch. After merge, refresh the full inventory, confirm zero pending migrations and the unchanged integration target/resource scope, then request specific restoration approval. No PR merge, automation restoration, plugin write activation or live canary is authorized by this publication task.

Legacy untyped workout correction limitations and rejection of meals with missing numeric macros are unchanged. This database rollout is not a completed live plugin-write capability.

## Settled verification results

- Final focused command: `npx vitest run test/database/applied-migration-reconciliation.test.ts test/database/coaching-oauth-audience-proposal.test.ts test/database/whoop-owner-timing-proposal.test.ts test/coach/activity-measurement-patch.test.ts --maxWorkers=2 --reporter=dot` — **4 files / 57 tests passed**, 7.70 seconds, including the final reviewer-requested identity assertions. The first default-sandbox launch failed before collection with a Vite cache `EPERM`; host execution succeeded without changing application code or test timeouts.
- Aggregate: `npm test -- --maxWorkers=4 --reporter=dot` — **449 files passed / 21 skipped; 6,166 tests passed / 44 skipped**, 184.04 seconds. This preceded only the final extra inventory assertions and documentation; final focused tests cover that oracle tightening. Native opt-in suites remain skipped; no new native-cluster execution is claimed.
- TypeScript `npx tsc --noEmit --pretty false`, `npm run lint` and `git diff --check` passed. Lint retains the two existing warnings in `PhotoMealReview.tsx` and `app/v2/page.tsx`.
- [Independent review](activity-measurement-rollout-review.md): no Critical or Important findings; 23 tests independently reproduced, two native concurrency tests skipped, exact SQL/base hash comparison and in-memory material mutation rejection. The metadata-binding recommendation was resolved with explicit assertions and final focused rerun; limitations and fingerprints are preserved in the review packet.
- `npm run build` passed with the same synthetic public Supabase URL/key placeholders used by CI and no production credentials. Exact-HEAD CI starts after publication and is monitored to terminal separately; a local pass does not imply CI ran before publication or authorize merge.
