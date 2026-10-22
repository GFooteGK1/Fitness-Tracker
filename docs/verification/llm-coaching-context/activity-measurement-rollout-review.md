# Independent activity migration version review

Assessment: no Critical or Important defect found in the reviewed source reconciliation. One test-coverage recommendation remains. This is one independent read-only assessment cycle by `/root/applied_version_review`; the reviewer authored neither candidate code nor candidate tests and received no builder success narrative. The parent supplied requirements, recorded production facts and an infrastructure warning. No production API, browser, credentials, settings, migration application or real-record canary was used by this reviewer.

## Findings, severity ordered

**Recommendation — bind the manifest's descriptive identity fields to its active path.** `Fitness-Tracker/test/database/applied-migration-reconciliation.test.ts:49` verifies the authoritative `applied` inventory against the expected version/name, the active file set and exact SQL hash, but does not assert `rollout.migration.version` or `rollout.migration.name`. In-memory execution of the actual test body passed after changing either of these standalone fields alone to a wrong value. The present manifest fields are correct and this does not bypass the pinned inventory/file/hash checks; the impact is that a future contradictory receipt can pass CI. Assert the expected version/name and `${directory}/${version}_${name}.sql` relationship, plus the known previous path. No repository files were edited for these probes.

## Acceptance oracles fixed before candidate inspection

Source: the delegated owner requirement and expressly supplied production evidence, rather than candidate outputs.

1. One active correction SQL file must use actual server version `20261022164908` and name `activity_measurement_corrections`; old active version `20261022131056` must be absent. A second active copy, manual history repair or falsified applied status is prohibited.
2. SQL must preserve the approved canonical content: 11,360 UTF-8 bytes; MD5 `09999bd92519592e5ab124d04eda7f97`; SHA256 `aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5`. It must equal the old-path source at the base after canonical LF normalization.
3. Current fixtures/tests/docs and offline inventory must use the actual applied identity, preserve all 48 historical version/name rows and historical receipts, and compute zero pending migrations for the 49-row recorded inventory.
4. Local replay and correction checks must use synthetic disposable data, preserve the mutator identity/security configuration, and remain sensitive to duplicate old-file, missing/wrong version/name and SQL hash errors.
5. The slice must not change credentials, grants/permissions, network settings, write flags or deployment automation; it must not perform a real-record canary. Production state supplied in the packet is evidence input, not independently observed proof.

## Reproduced verification

- Direct canonical comparison: the active migration has **raw and canonical length 11,360 bytes**, matching MD5 and SHA256 above, and is canonically identical to `origin/main:supabase/migrations/20261022131056_activity_measurement_corrections.sql`. The old path is deleted, the new path is the only active correction file, and `.gitattributes` pins it to LF.
- Direct diff/reference inspection: fixture and measurement-test paths use the actual version; ADR-0044 and the environment-example comment reflect it. The old 48-row manifest and dated historical receipts are unchanged. The new 49-row manifest preserves the historical inventory exactly and appends the actual version/name. No history-repair or operational-control implementation changes are present. The environment-example change is a comment only; no flag value was changed.
- Independent focused command, **at most two Vitest workers**:

  `node node_modules/vitest/vitest.mjs run test/database/applied-migration-reconciliation.test.ts test/coach/activity-measurement-patch.test.ts test/coach/activity-record-tools.test.ts test/database/mcp-activity-concurrency.test.ts --maxWorkers=2`

  Host rerun completed successfully: **3 suites passed, 23 tests passed; 1 suite / 2 native concurrency tests skipped**, duration 7.76 seconds. This independently reproduced chronological replay of the maintained synthetic bootstrap and tracked migration tail, inventory/hash checks, synthetic correction behavior, default-off correction gate behavior, and in-place mutator OID/owner/ACL/security-definer/search-path preservation. PGlite is an in-process disposable PostgreSQL runtime, not the production database.
- The first sandbox launch failed before collection with `EPERM` renaming a Vite SSR cache under the sandbox temporary directory: **zero tests ran**. The same command succeeded using approved host execution. This is an environment failure, not a candidate assertion failure. No auto-review rejection remains.
- Adversarial sensitivity: transpiled the actual reconciliation test source into an isolated Node VM, substituted only in-memory file-list/manifest/SQL values, and executed its `matches the genuine applied version...` test body with Node assertions. The unchanged baseline passed. Each of these variants was rejected for the expected material reason: old active filename retained; actual active file missing; wrong active version; wrong active name; changed SQL content; wrong applied-inventory version; wrong applied-inventory name; wrong SHA256 metadata. Standalone descriptive `migration.version` and `migration.name` variants passed, supporting the recommendation above. An initial custom-harness run failed because Node strict equality compared cross-realm array prototypes; normalizing assertion operands fixed the harness and the valid baseline then passed. Those initial failures are not counted as mutation detections.
- `git diff --check origin/main` passed.

## Revision and evidence binding

Workspace: `C:\Users\foote\Documents\Codex\2026-10-22\task\Fitness-Tracker`.
Branch: `codex/reconcile-activity-correction-version`.
Base and HEAD: `22b7e31d08696b78b11d7b88dbb3bccb1c14d9de`; candidate changes are dirty/untracked, so HEAD alone does not identify them.

Final inspected tracked binary diff SHA256: `427686bcad89fc117f8d83f7e9574725425f279eb461649746021ac75813efc3`.
During review the ADR activation paragraph was clarified by the parent; that final diff was inspected. It is documentation only, so focused test evidence remains applicable. No test/source content changed during verification.

Untracked deliverable SHA256 values at review completion:

| Path | SHA256 |
|---|---|
| docs/verification/llm-coaching-context/activity-measurement-rollout-2026-10-22.md | 3f5cbc00f29f397fb70e0d5a0343bcaa1495ba0e23d273da6f4cae480239325c |
| docs/verification/llm-coaching-context/activity-measurement-rollout-manifest.json | 14f8e3f297f8cf020fb6f3c5b7d829df8d21b400956e394cfca943acd7df52c6 |
| supabase/migrations/20261022164908_activity_measurement_corrections.sql | aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5 |

Reviewed test oracle source `test/database/applied-migration-reconciliation.test.ts` SHA256: `24af25483a28980281ccad0c401ffa9b042cd50cbac4edcf4a96ed6d4f25645e`.

Loaded instruction/context SHA256 values:

| Source | SHA256 |
|---|---|
| AGENTS.md | 172424f085aea130c3f17ed247ee1b0848e17adb6cc8ac7430b2c86ce12dd57b |
| docs/architecture/ARCHITECTURE-MAP.md | 53fd389d6323f3d9c87a110392dd1ba98f7cc76b7ca57221d5556db38b8016ff |
| C:/Users/foote/.codex/docs/SOFTWARE_DELIVERY.md | 88a4505b67e4fa610a07c30f7d8740f10ba59738808bf98bff94e0028577f515 |
| C:/Users/foote/.codex/docs/GUARDRAILS.md | 428e98fa054d4781fe7629a9027b05d24b362aaac311eb88163bf9f3d43bea30 |
| COS check SKILL.md, version 1.7.0 | a4992cda379da6ecbcad6118ce4dfc24683daa19a321d643d84429498e2113f2 |
| COS delivery-flow SKILL.md, version 1.7.0 | d327ab0dddb6599316a0ab7ca9bee0a81d037e3ebdc84dbfeadd19dc63b5d769 |

Also read COS review lenses and the Supabase skill. No nested AGENTS.md or project-local SOFTWARE_DELIVERY.md was found. `rg` was unavailable, so native PowerShell enumeration/search was used. No Beads/Git mutations or source edits were performed; this report is the sole intentional reviewer write.

## Limits and remaining boundary

The recorded production 49-row inventory, stored-statement count, OID 161206, postgres ownership, ACL `{postgres=X/postgres}`, SECURITY DEFINER, empty search_path, normalized new body MD5 `30bf6fd1aee1dc278df5497f4f58e552`, unchanged automation/flags and owner authorization were supplied to the reviewer. Their receipt representation is consistent with the packet, but this reviewer did not independently re-read production or inspect live runtime flags. Local OIDs are unrelated to production OIDs.

Native backend contention was **not** independently reproduced: its opt-in suite skipped because no explicit synthetic native-cluster environment was supplied. The identity-only source change does not alter concurrency logic, and no native production-equivalence claim is made. No full application build, complete repository test suite, lint or typecheck was reproduced by this reviewer. These focused results qualify the reviewed identity reconciliation and unchanged SQL behavior locally; they do not authorize merge, deployment, automation restoration, write activation or a canary.

No blocked action remains within this review assignment. Subsequent candidate changes invalidate affected fingerprints/evidence and require an explicitly recorded builder response and affected check rerun; this report does not claim a second review cycle.

## Builder response and bounded resolution

The recommendation was accepted. The reconciliation test now explicitly binds the previous filename to the historical manifest, requires `migration.version=20261022164908` and `migration.name=activity_measurement_corrections`, and binds the active basename to those values. No SQL, runtime behavior or operational setting changed in this response. The final oracle source SHA256 is `ca27777535b3c7c9028fa6fdd0d860662a75e7623c94ddafb260a2c2abcb0113`.

Builder reproduced the four affected suites after this assertion-only change: **57 tests passed**, duration 7.70 seconds. The preceding four-worker aggregate passed **6,166 tests / 44 skipped** before these additional assertions; it remains evidence for the unchanged implementation and renamed fixtures, while the final focused run covers the tightened oracle. This response and evidence/documentation additions are not a second independent review. The independent SQL/hash/replay and material-negative-control results above remain applicable because their inputs and implementation are unchanged.
