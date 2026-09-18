# W9 verification preparation

This inventory and development harness are preparation while W8 is active. They do not close W9, establish core readiness, authorize production changes, or validate numerical programming. The heldout scenario bodies have not been opened by this adapter author.

## Current development execution

`test/personalized-coaching/engineering-scenarios.test.ts` calls `engineering-adapter.ts`. It passes facts, rule family and synthetic owner to production `fetchRecommendationContext`, `evaluateRules`, and `rankCandidates`; expected decisions and prose never enter the adapter. The test then checks the frozen expected decision plus source identity, destination, provenance, ownership query scope, unchanged source records, quantity preservation and the permanent numerical/legacy-claim boundaries appropriate to each case.

The in-memory reader implements owner/date/status filters and bounded retrieval. It is a source adapter, **not an RLS or transaction proof**. Persisted coverage is supplied as a read projection; its durable validity belongs to the SQL suites. Required unrelated macro fields are explicit synthetic zero values; no nutrition target or training goal is defaulted. Unrecognized fixture keys are reported as unmapped rather than ignored. Physiology fields cannot authorize a rule; nutrition cases check only canonical logged totals.

Current result: **56 development variants pass; 4 decision variants remain explicitly unvalidated**. There are no decision mismatches among mapped variants. The initial two failures were invalid adapter materialization of the feedback-v2 check-in binding, corrected to the actual version/provenance contract. Frozen fixture files are unchanged. The latest development run passed 56 with 4 explicit skips. The preceding independent development/rules/service/coach-context run passed 4 suites/79 tests with 10 skips before the W6/SQL extensions. The parent backend delta independently passes. Earlier W8 author-in-progress type errors were sent to that owner; final broad evidence will supersede that transient state. `git diff --check` passes (line-ending warnings only).

Generated case-level evidence is `output/app-quality-release/personalized-coaching/development-engineering-report.json`. It records actual decision objects, source queries, predicates, unsupported reasons and original semantic assertions. Semantic UI/persistence assertions are mapped to their separate real SQL/browser suites below; copying the prose into this report does not constitute automated grading of every sentence.

| Unmapped development variants | Executed evidence | Missing decision proof / next action |
| --- | --- | --- |
| dev-signal-03 base/counterfactual | Real stored feedback decoder and explicit-field gate distinguish legacy RPE from v2; hardest-set effort remains unknown | Fixture asserts an effort solicitation without a complete existing review input. Do not derive a new request from `collectionChangesDecision`. Map to an existing declared W6 evidence requirement, or retain explicit policy/fixture limitation. |
| dev-signal-10 base/counterfactual | Actual offline normalizer preserves bounded 5–8 and exact 6; numerical eligibility remains false | No reviewed exact-repetition solicitation policy is provided. Preserve the factual predicate and report the decision expectation as unvalidated until an existing supported gate is identified. |

Ordinary development runs display these cases as explicit skips. `REQUIRE_ALL_ENGINEERING_CASES=1` converts every unmapped case into a failure, so an all-cases acceptance run cannot silently pass. Coordinator must explicitly classify each limitation before any core-ready statement; 56/60 is not complete frozen decision acceptance.

`dev-signal-08` and `dev-signal-09` are now mapped through `engineering-weekly-adapter.ts`. The invariant scaffold explicitly supplies an accepted strength/aerobic plan, a completed prior week, neutral explicit feedback and four source-bound observations per outcome. Actual `buildRollingWeeklyReview` determines the action; neither `sharedDemandConflict` nor `collectionChangesDecision` supplies it. The priority pair keeps first-outcome attainment distinct while both real reviews hold for missing priority. The assignment pair changes prescription exercise order while broad source movement binding stays absent; neither variant acquires an affected assignment. Both feed the real review into production recommendation readers and rank-2 `accepted_plan.review` navigation, with no accepted-plan mutation or numerical history policy.

The RPE and exact-quantity decision pairs remain **frozen-fixture underspecification**, not a qualified-policy pass: their factual predicates are tested, but the flat data does not identify a supported decision gate that should solicit those optional signals.

The SQL agent's `test/database/engineering-lifecycle.ts` is now integrated for both base/counterfactual nutrition lifecycle pairs. It executes production capture/reconciliation/recommendation service against the actual migration chain and authenticated roles. Correction removes the prior visible decision and invalidates coverage until refresh. Unconfirmed-photo execution covers both transport loss before commit (server still ready) and lost acknowledgement after commit (server pending); the actual client uncertainty gate withholds advice in both, then original identity/child/receipt replay resolves to exactly one occurrence. These cases intentionally write synthetic rows, so the report explicitly uses `sourceRecordsUnchanged:null` and a `canonicalLifecycle` evidence object. Frozen fixture facts remain unchanged. The fixture date is mapped to the real local database day while preserving its stated coverage wall time; see `w9-engineering-lifecycle.md` for the exact scope. No query mock is represented as transaction proof.

Specific policy search supporting that boundary:

- `adaptive-plan.ts` defines resilience's `session.rpe` as a **training_signal**, alongside a readiness proxy, with at least two comparable observations. `adaptation-evaluator.ts` uses the declared hypothesis requirements and repeated compatible recovery signals. The frozen RPE scenario supplies one value, a goal ID, verification and origin, but no resilience allocation, assessment/protocol, compatible series or declared support requirement. One newly explicit value cannot truthfully be declared sufficient for that existing two-observation gate. The v2 predicate resolves provenance, which is the separately verified claim.
- `targeted-review.ts` requires the exact existing direct measurement/assessment/protocol adapter and compatible outcome binding. A raw `blocks[0].exercises[0].reps` range does not become a typed `strength.repetition_capacity` observation. The frozen quantity scenario supplies no assessment, protocol, movement/context binding, evidence-series window or canonical correction transition. `exactQuantityRequired:true` and `collectionChangesDecision:true` are fixture assertions, not production authority. `performed-dose-evidence.ts` intentionally preserves exact/bounded/unknown quantities without selecting policy, and its numerical eligibility remains false. Existing W4 range preservation is proved; a new exact-value solicitation is not licensed.

These are not implementation failures repaired by inventing a gate. The full decision labels stay unvalidated; the successful source predicates must be reported separately from the 60 frozen decision variants.

Independent parent backend review found no important issue in the narrow additions: saved nutrition targets provide explicit authority without unrelated training intent; logged calorie remainder stays bounded to canonical meals and does not establish intake/deficit; coverage retains its validity separately; authoritative collect-signal review navigation uses the immutable review source; fresh Coach context reads the current persisted ID outside passive caching and preserves raw/agent offset conversion. Rules/service/coach-context tests passed independently. The complete browser/render and source-race claims remain with W8/W9 evidence.

## Frozen fixture protocol

Integrity-only validation: `node test/fixtures/personalized-coaching/validate.mjs` passed. Version is `engineering-scenarios-v1`; development has 30 scenarios plus 30 one-field counterfactuals; heldout has 12 plus 12. Development SHA-256 is `32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278`; heldout checksum metadata is `ea26eb6d3c6fc288330826ec906c288c61566f82f3a7eb2aa7e3a18afc10bc24`. Integrity proves neither runtime behavior nor qualified coaching labels; all labels remain `not_reviewed`.

Before opening heldout: finish W8 and claim W9; resolve development adapter mappings; independently review/freeze adapter; freeze candidate SHA plus complete uncommitted patch/new-file manifest and hash. Then set `RUN_PERSONALIZED_HELDOUT=1` for the same harness. That is its only heldout read path. Unknown keys must produce a visible unsupported result. A heldout-driven fix consumes the affected holdout and follows the documented replacement protocol; preserve original failure evidence. Do not tune then report it as unseen.

## Acceptance execution map

| Plan acceptance | Executable evidence | Required W9 readback |
| --- | --- | --- |
| Optional unknown feedback, legacy safety, fractional effort, source provenance | feedback/execution tests; `test/database/optional-feedback.test.ts`; signal database/panel/API tests; `e2e/optional-feedback.pw.ts` | Rollback-compatible readers, no untouched observation, account/version change and identical retry; inspect screenshots |
| Canonical text/photo/workout/meal capture and corrections | capture API/client tests; `test/database/capture-receipts.test.ts`; `e2e/capture-receipts.pw.ts`; `e2e/coach-logging.pw.ts` | All W2 routes, analysis versus log, no new create identity on uncertain save, source revision/PR recompute and immutable original receipts |
| Confirmed goal/intent/baseline binding | planning-intent tests and `node --test scripts/verify-training-intent.mjs` (actual W1–W3 chain) | Same-domain outcomes, source/protocol/owner binding, correction versus accepted snapshot, optional setup |
| Factual history/shadow | planning-history and performed-dose suites | Empty versus partial/unavailable; as-of snapshots; legacy unknown; ranges and units; no compiler/prompt import; frozen-strategy invariance |
| Targeted review and execution relevance | weekly-review/targeted-review/API tests; `test/database/targeted-review-sources.test.ts` | Independent attainment, global safety, priority/shared-demand hold, exact affected assignments, amended/retracted/deleted source invalidation, immutable successor chain |
| Recommendations and coverage | `test/recommendations/*`, recommendations API, `test/database/recommendations.test.ts`, recommendation journey | Stable persisted IDs; dismissal/deferral/Done boundaries; source/response revision fences; explicit coverage; pure family isolation |
| Full capture → action → later observation | `test/database/recommendation-journey.test.ts` executes application functions/RPCs against PGlite | Parent added later-baseline followup and correction journey; independently run final source, then connect browser evidence to UI view of same contracts |
| Real overlapping PostgreSQL sessions | `node scripts/verify-capture-concurrency.mjs`; `node scripts/verify-recommendation-concurrency.mjs` | Confirm private local instance before execution; preserve measured lock-wait/contention and race results, not mocked interleavings |
| W8 frontend | W8 author component tests and browser suite when stable | Today/Progress/Coach same persisted recommendation; reachable destinations; explicit response vs logging; 320/390/desktop, light/dark, keyboard, long evidence, account switch/local date/source invalidation and cold/unavailable states |
| Legacy claim retirement | legacy-insight guard, source clocks, fitness-insights API, model-context suites | Correct real flag is `RECOMMENDATIONS_ENABLED`; rollback must not restore unsupported claims, defaults, stale WHOOP or unverified analyst history |

The historical auth-account observation-value cascade problem is separately tracked as `Fitness-Tracker-24x`; preserve that scope/risk distinction. Do not expand account deletion behavior silently.

## Broad commands after W8 and focused repairs

Run in this implementation worktree, not the root checkout. Record exact commands, timestamps, counts, failures and source identity in `acceptance.md`.

```powershell
node test/fixtures/personalized-coaching/validate.mjs
npx vitest run test/personalized-coaching/engineering-scenarios.test.ts --reporter=dot
npm test -- --root . --exclude '**/.worktrees/**' --maxWorkers 4
node --test scripts/verify-training-intent.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
npm run lint
npm run build
git diff --check
```

The real concurrency scripts default to the task's private PostgreSQL port 55437 and `output/app-quality-release/postgres-runtime/pgsql/bin/psql.exe`; `CAPTURE_TEST_PORT`/`CAPTURE_TEST_PSQL` override them. Confirm process/data-directory provenance before starting or reusing it. Scripts create isolated synthetic test databases. Never aim them at hosted/project production databases.

Broad-run resource finding: the coordinator's first unrestricted-worker suite exhausted local memory. Use the bounded four-worker command above and retain the incomplete first log; an OOM-aborted run is not a complete verification result. Assigned legacy regression triage then passed 6 suites/91 tests: BottomNav, ChatArea, agent preservation, agent error-handling preservation, agent integration, and athlete-context. Supported insight fixtures now exercise factual supported families; dedicated tests retain retired-family suppression and original user text/history. Legacy RPE normalization asserts zero explicit reports, null average and hold instead of assuming RPE7 was reported. No runtime behavior was weakened to satisfy old fixtures.

Playwright uses port 3010, synthetic Supabase placeholders, blocked service workers and one worker. Set `CI=1` to prevent silent unrelated server reuse, or prove an existing server belongs to this worktree. Run `npm run test:browser` after checking W8's final test inventory. Capture and inspect actual screenshots at 320/390/desktop in both themes; DOM assertions alone do not establish visual QA. Do not kill an unrelated server to obtain the port.

## W11 local release packet inputs

Prepare without deployment: ordered migration filenames and SHA-256 with mirror parity; compatible reader floor; all six exact frozen flags/defaults; release SHA and uncommitted tracked/untracked manifest; RPC replacement order; preflight checks; readback; CI/browser evidence; scoped synthetic canary; rollback and failure thresholds. Ordered additive migrations are `20260918010000`, `20260918011000`, `20260918020000`, `20260918030000`, `20260918040000`, and `20260918050000` in the implementation tree. Run the actual chain, not SQL text searches alone.

Once new captures/intent exist, do not roll readers below compatibility. Rollback disables new selection/presentation/writers while keeping receipts, histories, audits and accepted plans readable. `COACH_INITIAL_DOSE_POLICY_ENABLED` remains hard false pending W5/W10 qualified review regardless of environment configuration. W9 core engineering evidence is separate from numerical readiness and full epic completion. Production migration, configuration, deployment and canary writes require explicit target authorization; no such action is performed by this preparation.
# Original holdout exposure and adapter extension

The coordinator froze candidate `67a411eba9e6ccf25fd116a971453a5562c2e04886729a80380e31838e6df4a4` at 2026-09-18T05:58:22Z and executed the original 12-case/24-variant heldout at approximately 00:58:48 local. All 24 returned `unsupported_adapter` because their material fact keys had no runtime mapping; this was an unsuccessful acceptance run, not 24 passing decisions. The preserved first artifacts are `heldout-first-report.json` and `heldout-first.log` under the verification output directory.

The original heldout is now consumed implementation-visible adapter-development evidence. Its bytes remain frozen; rerun reports explicitly identify exposure. The adapter is being extended through actual production readers and actual SQL boundaries. Real historical-source and effort-scope predicates are tested separately from advice decisions when a complete decision boundary is absent. No fixture assertion prose or expected decision enters materialization. A replacement set must be authored independently under the generalized input contract, sealed before the next candidate/adapter freeze, and opened only by the coordinator. `RUN_PERSONALIZED_REPLACEMENT=1` selects its separate file without loading it in ordinary tests.

## Exact unsupported-label disposition

Eight original decision labels remain unvalidated; they are not eight product defects or eight passing advice cases. Do not report all 84 original development/heldout decisions passing.

| Frozen family | Variants | Implemented evidence | Follow-up disposition |
| --- | --- | --- | --- |
| Development session-RPE solicitation | 2 | Real stored feedback decoding distinguishes legacy-unknown from explicit v2 effort | Clarify the fixture's existing hypothesis, protocol, complete comparable series and actual decision gate. A generic `collectionChangesDecision` assertion is not that gate. If the desired solicitation requires a new numerical class, it belongs to W5/W10 qualified policy, not an adapter shortcut. |
| Development exact-repetition solicitation | 2 | Real shadow normalizer retains range/exact quantities with numerical eligibility false | Clarify which installed typed assessment/series requires the exact measurement. Raw exercise reps plus `exactQuantityRequired` cannot establish that contract. A new dose/solicitation threshold is W5/W10 work. |
| Consumed original historical replay advice label | 2 | Real historical source resolver withholds an edited current record without an immutable snapshot; with a snapshot it returns exactly the archived revision and leaves inputs unchanged | Fixture contract clarification only: express source replay as a source-predicate operation, or supply a real persisted review/read identity. Do not create a historical advice API merely to manufacture an `abstain` label. This is not a missing numerical policy. |
| Consumed original hardest-set/session-effort solicitation | 2 | Real exercise and session validators preserve fractional effort independently; hardest-set evidence cannot fill session effort | Clarify the complete existing session-effort decision gate, as for the development effort family. If none exists, retain predicate coverage and classify the new solicitation policy under W5/W10. |

These cases are retained, their predicate assertions execute, and decision gaps remain explicit in reports. Supported core-engineering readiness may be stated only with this limited fixture coverage and the independent replacement result disclosed; it cannot be renamed full original-fixture acceptance or qualified coaching validation. No production behavior is broadened to fit an underspecified label.

Adapter extension verification: the combined development harness, actual SQL boundary suite and lifecycle suite pass 72 tests across three files, with four development decision skips. The consumed-original main harness passes 20 decisions with four predicate-tested decision limitations. The original source files and first-exposure report remain intact. The complete adapter fact contract is `engineering-adapter-contract.md`; the replacement suite remains unopened by the implementation agent. Parent and SQL-agent source review covered actual baseline bindings/provenance, independent goal statuses, source ownership, historical and effort predicates, and strict SQL operation premises. No application or SQL runtime policy changed during adapter repair.
