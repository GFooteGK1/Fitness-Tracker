# Local MCP workout/nutrition write verification — 2026-10-22

Candidate base: `e67e2dd99c55aeeb7c411646b62512f94ec789f5` (freshly fetched origin/main).
Branch: `codex/plugin-workout-nutrition-writes`. Isolated worktree under the October 22 task workspace; original checkout and other worktrees were preserved. Beads implementation: `Fitness-Tracker-8pr`; retained-format follow-up: `Fitness-Tracker-be8`.

## Outcome and boundary

Four default-off create/amend tools and two owner record/recovery getters are implemented over installed capture RPCs. Typed facts, stable set IDs, immutable revisions/readback, exact request identity, optimistic conflicts and provenance are covered. The external reader retains eight nested deadlift sets, normalized VBT and readiness without numeric-policy authority. The chosen LLM remains the operating interface; no normal supported operation requires Socius UI. ADR-0044 inventories subsequent domain slices.

No production read/mutation, test record, credential, grant, permission, migration, paid model, bridge activation, push, merge or deployment occurred. The specific athlete workout mentioned in the request was not accessed. No environment secrets were copied into the worktree. Build used synthetic CI public values only.

Known unmet capability: metadata-only amendments of retained untyped/wrapped workout blocks fail explicitly without canonical/revision changes. Installed audited SQL cannot project those original representations. Supported typed program-linked corrections preserve accepted session, plan and check-in. Incomplete meal macros are rejected explicitly; canonical storage requires numeric macros and does not accept fabricated zeros. No missing-macro draft storage is claimed.

## Checks actually run

Environment: Windows GregPC executor; Node 24.13.1, npm 11.8.0, locked dependencies, Vitest 4.1.11, Next 15.5.25. All SQL data was synthetic and disposable.

| Check | Observed result |
| --- | --- |
| `npm test -- --maxWorkers=2` | 447 files passed, 20 skipped; **6,128 tests passed, 43 skipped**, 295.22 s. Includes the corrected authenticated OAuth tool-list assertion. Native concurrency is opt-in and skipped in this aggregate invocation. |
| `npx vitest run test/coach/activity-record-tools.test.ts test/coach/external-performed-work-context.test.ts test/coach/coaching-context-mcp.test.ts test/auth/coaching-oauth.test.ts` | Independently reproduced: **137 passed / 4 files**. |
| `npx vitest run test/database/mcp-activity-concurrency.test.ts` with explicit local test PSQL/port | **2 passed** against PostgreSQL 17.11 at disposable loopback 55439. Final stronger fixture places both commands at the mutation boundary, holds the successful transaction and requires an observed lock waiter for duplicate creates and conflicting corrections, for meal and workout. No hosted database. |
| `npx vitest run test/coach/external-performed-work-context.test.ts test/coach/coaching-context-history.test.ts` | **26 passed** after final unreviewed-template/import guard. |
| `npx tsc --noEmit --pretty false` | Passed, including the final native fixture and getter metadata. |
| `npm run lint` | Passed; two pre-existing warnings: PhotoMealReview image optimization and v2 useEffect dependency. |
| `npm run build` | Passed with synthetic CI public values; final rerun recorded before commit. No service credential or deployment. |
| `git diff --check` | Passed. |

The aggregate predates only the final four-line template/import exclusion and its regression assertion; the affected reader/history tests and typecheck were rerun successfully. Final native overlap instrumentation is also separately verified. Unaffected aggregate evidence is reused; no production qualification is inferred from it. Browser UI behavior was not changed; official SDK protocol and authenticated HTTP tests exercised the tool surface locally.

Behavioral evidence includes real PGlite/PostgreSQL RPC execution, ownership isolation, malformed/nonfinite/missing input, fractional effort, explicit units and nulls, eight sets, velocity/readiness, deterministic meal totals, unchanged metadata, estimated-origin protection including descendant overrides, same-key changed-payload/action rejection, original receipts after later amendments, simulated lost commit response, atomic rollback on audit failure, saved timestamp precision and supported program-execution correction/replay with unchanged accepted state. Positive/negative assertions are derived from the independent requirements packet, not output snapshots alone.

## Independent work and evidence limits

`/root/write_oracles` designed acceptance oracles from baseline before candidate inspection. Its report is saved beside this file as `activity-write-independent-oracles-2026-10-22.md`.

`/root/write_review` independently inspected code/tests and reproduced decisive checks. It found unrelated metadata loss, descendant estimate-origin loss, and missing event precision in current lookup. The builder corrected all three; reviewer outside-repository SQL probes confirmed metadata preservation and rejected estimate laundering. Final resolution reproduced 137 focused tests and two native-backend tests and reported no outstanding actionable finding within its scope. The subsequent explicit template/import guard and enforced-overlap instrumentation were verified by the builder; they were not independently reproduced. No claim of blind review applies after the reviewer saw builder responses.

Reviewer-bound core SHA256 values:

```text
activity-record-contract.ts 29FEE7BBEFDEEDCB3324CC61984ECE8FC7A038D64EB93903F850ABBA1A14F0E8
activity-record-tools.ts 83942EC7089E1618D36FA73D85387B7A28D2D7768B4D8071D549D94DDE3F5DB1
activity-record-tools.test.ts CC854DC4EE7095FDB8FE530B3F5C016679DB1B3B250658D0289AEB6F2B1EA3D1
mcp-activity-fixture.ts 5089069E16E17ECB19E30731B16077203587A9B2294243155B8D0C983B16F0B9
```

The final tools annotation/cast changed TypeScript inference only; reviewer explicitly accepted unchanged-runtime evidence reuse. Final code/config/test/instruction hashes are in `activity-write-candidate-hashes-2026-10-22.json`. The Git commit containing this report binds the deliverable. Documentation/evidence files are excluded from that manifest to avoid self-referential hashes.

No live hosted OAuth/PostgREST, production migration state, runtime flag, plugin refresh or real athlete operation was verified. The prior edge denial was not retried or bypassed. The test fault injection demonstrates rollback behavior; no comprehensive mutation-testing claim is made.

## Investigation notes

Local test enablement initially encountered sandbox filesystem boundaries: native Git could not enter the external checkout; npm's sandbox install exited with an internal handler error; Vitest temporary-file rename failed EPERM before tests executed. Approved scoped escalation resolved those execution restrictions. These were not application/production failures or approval denials.

Early focused checks exposed stale two-tool listing expectations, a native NUMERIC-text/PostgREST-JSON mismatch in the fixture, and changed omission/budget handling; these were corrected and rerun. One native fixture bootstrap failed because JavaScript replacement treated `$$` as a replacement token; a callback preserved SQL delimiters and the rerun passed. Supabase dynamic-select inference required an explicit validated return type. No unresolved retry loop remains.

## Publication/activation handoff

The repository's conservative profile does not authorize publication. This task explicitly authorizes the tested local commit. Smallest next publication approval: push this branch to `GFooteGK1/Fitness-Tracker` and open a draft PR. Do not merge or deploy under that approval.

After code review/CI and separate release approval, verify installed capture/revision/fractional-effort prerequisites and the exact deployed authorization path. Separately authorize `SOCIUS_MCP_WRITES_ENABLED=true` for the owner pilot and refresh the plugin listing if needed. No OAuth scopes/grants or DB permissions need broadening for this slice. Canary authorization must name actual workout/meal facts, request IDs and exact corrections; ADR-0044 defines the bounded sequence. Preserve original receipts on retries. Disable the write flag to stop writes; never delete retained records as rollback. Legacy-format persistence extension remains a separate tracked capability gap.
