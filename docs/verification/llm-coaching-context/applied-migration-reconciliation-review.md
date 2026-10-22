# Independent source-reconciliation review packet

These are the frozen pre-candidate oracle, independent assessment, builder response and bounded resolution. They distinguish reviewer-reproduced checks from supplied production fingerprints and builder native evidence.

# Independent pre-candidate reconciliation oracles

Prepared before reading recovered migration files. Context: /root/reconciliation_review; base 8d870c0fb05d8ef232425e7ae33fd55e997edf74. Scope is source reconciliation and disposable synthetic replay; no production mutations, migration-history repair, grants, switches, publication, or merge.

## Sources and expected outcomes

1. **Exact historical source and inventory.** Parent-supplied recorded evidence identifies one statement each: version 20261018220557, 1375 UTF-8 bytes, MD5 c172ef1b57207ee69f131bf0e0e0f8c4; version 20261019154246, 1642 bytes, MD5 f70e6fd443873f332fbd053deaeee15d. Recovered files must match recorded bytes, retain exact version/name, preserve existing bound client, and contain no history repair or substituted new DDL. Proposal-normalization comparisons independently explain content. Against the supplied recorded version inventory, the exact pending set must be [20261022131056]; duplicate versions or unexplained older/newer pending entries fail. These supplied production fingerprints are evidence inputs, not independently reread production facts.

2. **Audience hook behavior and binding.** Source: docs/plans/socius-mcp-audience-hook.sql.template and test/database/coaching-oauth-audience-proposal.test.ts. Exact bound claims.client_id plus exact claims.scope=email adds https://www.sociusfit.com/api/mcp to a string or array audience, preserving existing audiences without duplication. Wrong/missing claim client, spoofed top-level/user_metadata client, wrong/multiple scope, null/object/boolean/number audience must pass through unchanged. Preserve subject, role, session, arbitrary claims and event data; test refreshed claims. Binding must not be generalized, replaced with a synthetic UUID in committed historical source, or taken from user_metadata. Tests may substitute a synthetic UUID only within disposable fixtures.

3. **Execution rights and function properties.** Same template: SQL immutable SECURITY INVOKER, search_path=pg_catalog; PUBLIC/anon/authenticated cannot execute; supabase_auth_admin can. Parent-supplied observed live ACL also includes postgres/service_role. Reproduce Supabase-like default function ACL granting service_role, then prove recovered DDL preserves it while removing PUBLIC/anon/authenticated. Existing proposal fixture omits service_role/default ACL and is insufficient alone. A public or authenticated execution mutation must be detected. This DDL does not itself register a live Auth hook or change OAuth grants.

4. **Nullable WHOOP schema and old data.** Source: docs/proposals/recovery-timing-owner/add-provider-timing.sql and test/database/whoop-owner-timing-proposal.test.ts. Exactly 29 added nullable/no-default columns: recovery10, sleep10, cycles9; five timestamptz(6) columns per table, three common text columns per table plus the two linked provider IDs, and one JSONB provenance column per table. Existing rows retain exact identifiers, owner, dates, scores and timestamp microseconds; new columns remain null. Preserve preexisting owners, RLS flags/policies, grants, indexes, triggers, functions and old defaults. No backfill, old-value update or access change is permitted.

5. **Owner isolation and failure atomicity.** Source: existing owner policies in fixtures and WHOOP timing proposal tests. As authenticated owner A, read own rows, update own timing, never read/update owner B; cross-owner insert fails. Transactional DDL must roll back earlier table additions when a later table has schema drift. Reexecuting historical ADD COLUMN directly is expected to fail: only version-aware replay skips already-recorded versions. Migration-source reconciliation is not permission to apply SQL or mark versions applied.

6. **Representative sensitivity.** Independent replay should show at least one relevant known-bad variant rejected: a no-op or wrong-count WHOOP source, changed bound client/audience, or leaked function execution privilege. Candidate-derived snapshots alone do not establish correctness.

## Verification plan and limits

Independently inspect candidate diff against the frozen sources above; hash files and dirty diff. Run disposable PGlite replay with independently assembled synthetic roles, defaults, two-owner rows and security snapshots, plus focused repository tests. Native PostgreSQL if coordinated and available can strengthen engine evidence, but no production access is required or allowed. Passing local tests proves the recovered-source behavior on the fixture, not hosted history identity beyond supplied fingerprints, live Auth issuance, pending migration rollout, switch restoration or write activation.

Instruction sources: repository AGENTS.md; cos check SKILL.md and review-lenses.md; C:/Users/foote/.codex/docs/SOFTWARE_DELIVERY.md and GUARDRAILS.md. One independent assessment, one builder response, one evidence-based resolution.


---

# Independent reconciliation assessment — 2026-10-22

Verdict: no actionable correctness/security findings in the nine-file source-reconciliation candidate. Suitable for the authorized publication step after aggregate/CI gates settle. This is not merge or production-rollout authorization.

Scope: /root/reconciliation_review, one independent assessment. Base and current HEAD: 8d870c0fb05d8ef232425e7ae33fd55e997edf74; branch codex/reconcile-applied-migration-sources; candidate is the dirty nine-file snapshot in reconciliation-independent-candidate-fingerprints.json (SHA256 b5e8bfc684e5831358ecfe6265aee8dd138f6a90807369b100ab3f755efd63a3). Build artifacts under output were observed and excluded from the reviewed publication set. No candidate files edited by this reviewer.

## Evidence and reproduced checks

- Frozen oracle predates candidate inspection: reconciliation-independent-oracles.md SHA256 68e59338aa047fe05864bd7fd0060e4f050aef1c3a901364ea060fb432327452. Expected behavior came from existing proposals/fixtures and supplied recorded-history fingerprints, not recovered-source outputs. Builder pass summaries were supplied after oracle freeze; this is independent execution/code review, not a blind outcome assessment.
- Independently hashed both recovered files. Audience: 1375 bytes, MD5 c172ef1b57207ee69f131bf0e0e0f8c4, SHA256 48831734be7a2c59527801b7e203396eca8f2f0924d999ba441d70827c4325e3. WHOOP: 1642 bytes, MD5 f70e6fd443873f332fbd053deaeee15d, SHA256 7f366fd3edccd8e0e57e161433600c7fffd02e84d8fb35506f61b29306b1ae12. These match the pre-supplied recorded evidence; committed audience binding is present and unchanged. Only the disposable in-memory fixture substitutes a synthetic client UUID.
- Independently compared all local version/name pairs to the manifest's 48-version dated inventory, rejecting duplicates/missing names: exact remaining pending file is 20261022131056_activity_measurement_corrections.sql. Its canonical LF SHA256 is aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5, and git diff against base for that file is empty. No history-repair SQL was found.
- Reproduced `node ..\reconciliation-independent-replay.mjs candidate` on disposable PGlite. Seven check groups passed: hook immutable/invoker/search_path and default-ACL behavior; exact client/scope binding with malformed/spoof/refresh claim preservation and audience idempotence; rejection detector for a deliberately introduced authenticated EXECUTE leak; exact 29 nullable typed/no-default columns and unchanged rows/security; owner reads/updates and rejected cross-owner inserts on all three tables; no-op schema variant detected; and later-table schema-drift rollback. Evidence JSON SHA256 e4caffcf59f9744fa9099489db614a4ede0ad66c54e1a6fa764cb445ebe3b918. Independent script SHA256 64a2124726d98d80d4254b31ab585df7a7774d86b57ee21c72e0633407053020.
- Reproduced `npm exec -- vitest run test/database/applied-migration-reconciliation.test.ts test/database/coaching-oauth-audience-proposal.test.ts test/database/whoop-owner-timing-proposal.test.ts`: 3 files, 47 tests passed, exit0. Includes full maintained legacy bootstrap plus every later SQL migration chronologically, recovered contracts, source normalization, inventory negatives, ACL and owner tests. First sandbox run executed zero tests due Vitest temp rename EPERM; an explicitly approved local unsandboxed rerun passed. This was an environment limitation, not a candidate failure.
- Reproduced `git diff --check`: exit0. Verified .gitattributes pins recovered SQL to LF. Historical misleading comments and missing WHOOP trailing newline remain intentionally preserved and explained rather than rewritten.
- Inspected (did not independently reproduce) output/reconciliation-native.log: native opt-in test1 passed. Read native test implementation: explicit task-owned loopback PostgreSQL, generated disposable database, full chronological tail, no hosted connection/repair or credentials. PGlite and native claims are distinguished accordingly.

## Review conclusions and limits

The change restores exact existing SQL, documents dated evidence and boundaries, and broadens tests without touching runtime application logic or pending correction SQL. Hook ACL tests model the relevant Supabase default service_role grant; app roles remain denied. WHOOP source changes no data/defaults/security policy. The version-aware inventory comparison complements intentionally non-idempotent historical DDL; it does not claim raw second execution succeeds.

The rollout document correctly preserves the approval boundaries: new PR merge, exact pending SQL application, automatic deployment restoration, write activation and real-data canary are separate. It calls for refreshing hosted state and candidate fingerprints before rollout, stops on divergence, and distinguishes the maintained bootstrap from a complete platform reset. It retains legacy untyped-record and missing numeric macro limitations.

Production history/catalog, saved deployment setting and live credentials were not queried by this reviewer. Exact source identity relies on the supplied prior read-only fingerprints; inventory is a dated snapshot. Native engine replay was inspected as builder evidence, while decisive recovered-source/security and complete-tail PGlite behavior were independently reproduced. No hosted SQL, grants, settings, credentials, records, publication, commit or merge changed in this review.

## Instruction fingerprints

AGENTS.md 172424f085aea130c3f17ed247ee1b0848e17adb6cc8ac7430b2c86ce12dd57b
cos check SKILL.md a4992cda379da6ecbcad6118ce4dfc24683daa19a321d643d84429498e2113f2
SOFTWARE_DELIVERY.md 88a4505b67e4fa610a07c30f7d8740f10ba59738808bf98bff94e0028577f515
GUARDRAILS.md 428e98fa054d4781fe7629a9027b05d24b362aaac311eb88163bf9f3d43bea30

Next: builder response, then one evidence-based resolution against any changed files/results. No unresolved material finding currently blocks publication.


---

# Independent bounded resolution — 2026-10-22

Resolution: no actionable findings remain in the assessed source-reconciliation code, exact historical SQL, manifest, attributes or tests. Builder accepted the assessment and reports no code changes. Reviewer independently rechecked the eight non-document candidate fingerprints against reconciliation-independent-candidate-fingerprints.json; all unchanged. The verification document may append factual final results and review references only; any material code, SQL, manifest or operating-claim change invalidates affected evidence and requires explicit assessment.

Assessment: reconciliation-independent-assessment.md, SHA256 8e3d389e2a3d0b24a79686402ade62f01eaf59e178c41f8705426a1953030cad. Frozen oracle SHA256 68e59338aa047fe05864bd7fd0060e4f050aef1c3a901364ea060fb432327452. One independent assessment, one builder response and one evidence-based resolution completed. No additional tests were repeated because the assessed candidate did not change and no new defect evidence was presented.

Independently reproduced decisive checks remain: recovered raw bytes/hashes and exact sole pending inventory, separate synthetic PGlite security/data replay, and 47 focused tests including complete maintained chronological tail. Native PostgreSQL17 pass1 is builder evidence inspected by reviewer; typecheck/lint pass and focused47 final rerun are builder reports. Builder reports the first concurrent aggregate attempt hit five unrelated five-second timeouts; reduced-worker rerun retains original limits and is pending. This resolution does not convert that failed aggregate attempt to a pass or certify its causal explanation beyond the supplied evidence.

Aggregate tests, production build and exact-final-HEAD required CI remain execution gates and are not waived. Publication under existing authorization follows their successful completion and accurate evidence update; merge remains separately unapproved for this reconciliation PR. Hosted SQL application, switch restoration, write activation and real-data canary retain their separate approval boundaries. No production state, permissions, credentials, grants, records, publication, commit or merge changed by reviewer.
