# Workout measurement compatibility qualification

Prepared on 2026-10-22 from baseline `666ab8d`, on branch `codex/plugin-workout-nutrition-writes`, draft PR [111](https://github.com/GFooteGK1/Fitness-Tracker/pull/111). This adds to the original activity-write qualification; it does not claim a live capability.

## Scope and source evidence

A separately authorized owner read of the motivating existing UI-created workout established three typed segmented blocks, an eight-element ID-less `performed.sets` array, retained score/prescription/time metadata and a boolean `vbt` marker. The deployed old factual projection omitted the nested array. The normal owner capture getter returned it after checking the cookie user, expected owner and owner-filtered query. No service-role access, edge-denial bypass, credentials or production write was used. No real health quantities, notes or owner identifiers were copied to fixtures.

The committed `activity-measurement-fixture.ts` uses invented values and matching structure, repeated movement names, unknown metadata and explicit nulls. The selected LLM can use `get_activity_record` and `amend_workout` directly; normal operations require no UI visit.

## Candidate behavior

- A typed `setMeasurements` command addresses an existing performed set by exact block/segment/event/collection/index, bound to the stable workout ID and expected revision. It supports `sets` and `set_details`, preserves absent/present set IDs and every unmodified JSON subtree, and never searches by movement name or creates missing positions.
- The five supplied velocity leaves have closed types, units, timestamps, nullable unknowns and mandatory exact-leaf provenance. Existing estimated measurement origins cannot be upgraded by review. Estimated loads, occurrence provenance and unrelated overrides survive. Full-block replacement cannot accompany the patch. Multiple patches validate/apply together or save nothing.
- The factual reader retains boolean VBT markers as unverified recorded context, with no invented velocity, independent completion, PR claim or numeric-policy authority. Malformed marker types are omitted with a diagnostic.
- Prepared SQL replaces the existing internal correction function in place. Existing locking, revision conflicts, capture snapshots, recommendation identity, program-execution authority, fractional effort and immutable receipts remain. The database derives projection equivalence from locked stored and validated new facts, not caller projection placeholders. Notes/effort/readiness/velocity-only updates preserve complete score/PR rows; genuine supported load, score/date or eligibility changes still recompute conservatively.
- `SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED` defaults off in addition to the general write gate. A disabled correction gate rejects before starting request preparation. No new scope, grant, table, executable function, token, model dependency or photo capability is introduced. Migration application and flags were not changed remotely.

## Verification

Pre-candidate independent oracle: task-local `vbt-independent-oracles.md`, SHA256 `8CA35CC98FF8BD518020F1C64BD601160E832F1E993A8FC4F25A2680CECA1302`. It was derived from baseline without inspecting the candidate.

Focused tests use actual installed SQL in PGlite behind the production adapter. The first negative-control case proves baseline notes-only projection identity churn before applying the new migration. Applying it twice preserves function OID, owner, ACL, security-definer and search-path configuration. Synthetic nonempty PR histories and a same-exercise control workout are compared as complete rows including IDs/timestamps; fail-on-change triggers prove projection writes are not reached for notes/readiness/VBT. Positive controls verify actual weight/date/eligibility behavior, not only count or identity changes.

Other focused cases cover both array names, retained unknown velocity metadata/nulls/IDs, exact provenance, estimate retention, stale revisions, changed-key reuse, historical replay after later correction, owner isolation, malformed units/timestamps/paths, duplicate paths, multipath atomicity, snapshot-failure rollback, committed-response-loss recovery, default-off activation and existing legacy/nutrition boundaries.

Native PostgreSQL 17.11 ran on this task's disposable localhost-only cluster, port 55439. The opt-in independent-backend tests use a rendezvous before mutation and observe a real lock wait. Duplicate workout/meal creates return one canonical identity; competing corrections have exactly one winner and one revision conflict. Workout correction exercises a structured set measurement. The cluster was stopped afterward. No hosted database or real athlete operation was used.

Final builder results:

- Affected activity/reader/protocol/authorization run: 5 files, 147 tests passed.
- Final strengthened compatibility file: 10 tests passed.
- Native independent-backend retry/conflict run: 1 file, 2 tests passed, with observed lock waits.
- `npm test -- --maxWorkers=2`: 448 files passed, 20 skipped; 6,138 tests passed, 43 skipped (290.59 seconds). The native opt-in tests are separately qualified above; skipped tests are not claimed as passed.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed, with the two existing PhotoMealReview image and v2 effect-dependency warnings.
- `npm run build`: passed using synthetic public Supabase configuration and no production credential.
- `git diff --check`: passed.

Independent candidate review found no actionable defect. It separately ran 20 focused persistence tests, the final 10 compatibility tests, and an independently authored actual PR-value/history/date/eligibility control (one test). Its test-strength concern was resolved by explicit derived-value assertions. See `activity-measurement-independent-review-2026-10-22.md`; the pre-candidate oracle and final source hash manifest are adjacent. Independent native execution was not claimed; that evidence is the builder's forced-overlap run.

## Remaining boundaries and activation

Untyped/wrapped legacy program records remain explicit unsupported conflicts (`Fitness-Tracker-be8`), not silently converted. Existing meal storage still requires all numeric item macros; missing is rejected, never replaced by zero. No incomplete-macro storage, paid photo interpretation, media upload or inactive bridge activation is claimed.

Owner approved branch publication and a draft PR. Subsequent explicit owner approval authorizes normal merge after exact-HEAD CI eligibility. Remaining release approval must name application/verification of prepared migration `20261022131056_activity_measurement_corrections.sql`, deployment and the intended owner write/correction flags. No persistent grant expansion is proposed. Verify the exact deployed owner authorization and installed migration state before activation. A separate bounded canary must authorize one real workout/meal occurrence or exact correction, its facts/provenance, original request UUID and expected revision. Verify immutable receipt/readback, exact retry and current state; never fabricate production records or use new keys after uncertainty. Disable flags to stop writes without deleting history.

ADR-0044 inventories subsequent goals/requirements, accepted plans, assessments, equipment, recovery and correction/export slices. Those domains are not implemented here.

## Investigation notes

Initial new-fixture runs exposed test-only inspection and setup mistakes: the owner role could not inspect `benchmark_prs`, reported synthetic quantities were still unreviewed (therefore intentionally PR-ineligible), and an empty `p_blocks` array failed the preexisting structural count validator. The fixture now resets only its disposable inspection role, seeds explicitly confirmed facts for PR controls, and uses deliberately untrusted but structurally valid placeholders to test database-owned recomputation. Owner grants were not widened. Focused reruns passed after these corrections.
