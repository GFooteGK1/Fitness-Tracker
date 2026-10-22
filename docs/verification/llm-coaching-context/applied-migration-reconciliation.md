# Historical migration source reconciliation

Scope: source recovery and disposable verification after PR [111](https://github.com/GFooteGK1/Fitness-Tracker/pull/111), based on main `8d870c0fb05d8ef232425e7ae33fd55e997edf74`. This PR does not apply SQL, repair migration history, restore automatic deployment, activate writes or change production records, credentials, OAuth grants or permissions. Publication is approved; merging this PR requires separate approval.

## Verified source

Read-only inspection of `supabase_migrations.schema_migrations` in project `auolnfwetmfcwhtvakzy` returned one recorded statement for each missing version. The two recovered migration files contain those exact UTF-8 bytes under their original versions and names. No new timestamps, placeholders, `IF NOT EXISTS` changes or invented historical content were used. LF attributes preserve their bytes across checkouts. The WHOOP file intentionally retains its original lack of a trailing newline.

| Recovered file | Bytes | Recorded SQL MD5 | Recovered SHA256 |
| --- | ---: | --- | --- |
| `20261018220557_socius_pilot_context_audience.sql` | 1375 | `c172ef1b57207ee69f131bf0e0e0f8c4` | `48831734be7a2c59527801b7e203396eca8f2f0924d999ba441d70827c4325e3` |
| `20261019154246_owner_whoop_provider_timing_nullable.sql` | 1642 | `f70e6fd443873f332fbd053deaeee15d` | `7f366fd3edccd8e0e57e161433600c7fffd02e84d8fb35506f61b29306b1ae12` |

The historical comments still say “PROPOSAL ONLY” / “UNAPPLIED PROPOSAL.” They are retained as source evidence; the observed hosted migration history and catalog establish that these versions are already applied. The earlier proposal documents remain historical drafts. The audience source matches its template after replacing only the existing public registered client UUID with the template marker. The WHOOP source matches its proposal after whitespace normalization. This does not grant authority to replay either version against production.

The hook remains bound to the original `claims.client_id` and exact `email` scope. It preserves other audiences and claims, including refresh issuance, with malformed audiences or wrong/missing binding passed through. It remains immutable SQL, security invoker, `search_path=pg_catalog`. The observed hosted execution ACL includes `postgres`, `service_role`, `supabase_auth_admin`; `PUBLIC`, `anon` and `authenticated` have no execution. Tests model Supabase default function grants and prove that the historical DDL retains `service_role` execution. This PR changes none of those permissions or the live hook registration.

The WHOOP source adds exactly 29 nullable/no-default columns across recovery (10), sleep (10), cycles (9): five `timestamptz(6)` fields per table, provider text metadata, linked provider IDs and JSONB timing provenance. It has transaction/timeout guards and no backfill, old-value updates or access changes. Synthetic before/after checks cover old identifiers, owners, values and microseconds, grants, RLS, indexes, functions, defaults and triggers; two-owner reads/updates and rejected cross-owner inserts; and rollback when a later table has schema drift.

## Exact remaining SQL and replay limits

The adjacent manifest records the read-only October 22 inventory of 48 applied versions. An offline comparison rejects duplicate versions, missing applied sources and changed version/name pairs. Against that snapshot, the **only pending SQL** is:

`supabase/migrations/20261022131056_activity_measurement_corrections.sql`

Canonical Git/LF bytes: 11,360; SHA256 `aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5`. Older task notes used a Windows working-file hash with CRLF; the canonical hash here binds the committed SQL. The pending migration is unchanged by this PR. It replaces the existing `mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)` implementation so future amendments preserve derived projection identities when underlying facts are unchanged. It affects all existing callers, retains owner/revision/idempotency protections, security-definer/empty-search-path and existing owner/ACL, and introduces no grants, policy, table, credential, flag or backfill. Applying it remains a separate production action.

Replay uses the repository's maintained legacy bootstrap through `20260918050000`, then **every later tracked SQL file chronologically**, including both recovered sources and the pending correction. Both disposable PGlite and native PostgreSQL 17 replay pass. This is not a claim that `supabase db reset` from an empty platform can recreate pre-migration history: the repository lacks a complete genesis migration and `supabase/config.toml`. Proposal/historical DDL contracts also execute against separate two-owner synthetic data fixtures. No real health records or live Auth tokens are used.

The inventory is a dated observation, not a live dry-run or proof that later production drift cannot occur. Before any hosted rollout, refresh history, installed correction-function fingerprints, relevant ACL/catalog state, exact pending versions and candidate hashes through an approved existing connection. Stop on divergence; do not repair history or mint credentials to proceed.

## Verification and rollout boundary

Focused tests cover recovered byte hashes, template correspondence, pending-version comparison, full maintained tail replay, hook boundaries/default ACL, owner isolation, nullable semantics and atomic schema-drift failure. The native replay also verifies the app cannot directly execute the audience hook or internal mutator. Independent acceptance criteria were frozen before candidate inspection and replayed separately. Final command results and review resolution are recorded with this packet before publication.

The last saved/reloaded Supabase GitHub **Deploy to production** setting for `main` was confirmed off before PR111 merged. No switch changed in this PR. Browser control subsequently reported `Transport closed`; a new settings read-back is required before a settings action. The known Vercel team-scope 403 remains respected; PR111's GitHub-reported Production deployment and main CI succeeded.

Restoration sequence:

1. Review this source-reconciliation PR and its terminal CI; obtain separate merge approval. Merge with database automation still off.
2. Refresh hosted history/catalog and exact candidate hashes; verify only `20261022131056` is pending and the installed function matches the reviewed baseline. Confirm the integration's migration-only resource scope and target/branch through working owner access. There is no config or Edge Functions addition here.
3. Obtain specific approval to apply the exact pending SQL through a version-preserving path, **or** to restore the switch as the mechanism that may apply it. Turning automation on must not be treated as inert. Keep both MCP write gates off.
4. Verify installed body/history and unchanged owner/ACL/security/search-path, plus integration outcome. Restore automation only when source/history align and the approved rollout path is ready. Read back the saved switch state and observe the normal deployment; inspect uncertain outcomes before retries.
5. Close tracked restoration task `Fitness-Tracker-kun` only after restoration is actually verified. Write activation and a narrowly specified owner-approved live canary remain separate.

The first next approval after this PR passes is **merge of this reconciliation PR**. Database application, switch restoration and write activation are still pending. Legacy untyped correction limits and rejection of meals with missing numeric macros remain as documented in PR111; this work does not widen those capabilities.

## Settled local results

- Focused contracts/inventory/replay: 47 passed across three files. Independent reviewer separately reproduced the same 47 tests and a seven-group synthetic security/data replay, including known-bad privilege/schema variants. One assessment, builder response and bounded resolution found no actionable issue; see [review packet](applied-migration-reconciliation-review.md).
- Native PostgreSQL 17 chronological replay: 1 passed using explicit loopback/task-cluster opt-in; cluster stopped afterwards. This test is skipped in normal aggregate/CI runs without that opt-in.
- Aggregate: `npm test -- --maxWorkers=4` passed, 449 files passed / 21 skipped; 6,166 tests passed / 44 skipped. The initial unrestricted concurrent run failed five unrelated existing tests at their 5-second limits (6,161 passed); reducing worker contention passed without changing any timeout or test. That initial failure remains recorded as a failed attempt.
- TypeScript `tsc --noEmit --pretty false`, `npm run lint`, synthetic-configuration `npm run build`, and `git diff --check` passed. Lint retained two existing warnings in `PhotoMealReview.tsx` and `app/v2/page.tsx`.
- Read-only hosted inventory and raw historical statement fingerprints refreshed before publication: unchanged 48 versions, both recorded byte/MD5 pairs match, pending `20261022131056` still absent. This is an offline inventory proof, not a connected CLI migration dry-run.

All local gates passed before publication. Exact-HEAD GitHub CI starts after PR publication and must be monitored to terminal; its result will be reported with the PR. Review references to CI as an execution gate do not imply CI ran before the PR existed. No merge or production action follows automatically from a passing result in this task.
