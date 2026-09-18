# W11 local release packet — local preparation complete

Prepared locally on 2026-09-18 for `Fitness-Tracker-u5l.12`. This packet does not authorize or record a commit, push, hosted migration, deployment, production configuration change, provider call, or live canary write. W9 local acceptance is recorded with explicit engineering coverage limits; hosted activation remains a separate authorized step. W5/W10 numerical policy and qualified-coach review remain separate unresolved gates.

## Candidate identity and evidence

Worktree: `C:\Dev\Personal\repos\Fitness-Tracker\.worktrees\data-to-personalized-coaching`. Observed checkout base: `61d04df9dad3dfe88a9594fff28be06a72899741`. This base is **not** the release artifact: the implementation is uncommitted. The final 747-file manifest identity is `33aba965c5d3cca187459e04352a8548bd63bf79ceedac8bdd701bf1556fcfbe`; tracked patch SHA256 is `15b53b6cf00b089e939bab6de162289017ce7b1934341b781aa10dc65208dbc6`, frozen at `2026-09-18T06:16:32Z`. Manifest and patch are in `output/app-quality-release/personalized-coaching/source-2026-09-18T06-16-32-218Z/`; new files remain in this worktree and are included in the manifest, not the tracked patch. [Final acceptance](acceptance.md) records independent reviews, 3,018 passing regression tests, 22 passing browser cases, successful typecheck/lint/synthetic production build, screenshots and the first strict 24/24 replacement-heldout pass. Hosted CI has not run; no commit or release artifact has been published. A source change after freeze requires affected verification and a new artifact identity.

Current bounded evidence is indexed in [W9 storage inventory](w9-storage-inventory.md), [event recovery review](w9-event-recovery-review.md), and [frozen lifecycle materialization](w9-engineering-lifecycle.md). The prepared actual-SQL journey has seven passing cases; four additional development lifecycle cases exercise corrections and both unknown transport outcomes. W7 separate-connection PostgreSQL evidence is ten cases with eight observed lock waits; capture has four races. These local synthetic results do not establish hosted deployment health, physical-device behavior, coaching effectiveness, or numerical readiness. Final checks and exposure history are in the coordinator's W9 acceptance record. Eight original unvalidated decision labels retain their explicit predicate-only disposition in closed clarification `Fitness-Tracker-u5l.13`; passing replacement cases does not erase them.

## Ordered additive schema

Verify that the target has the existing repository chain through `20260915220000_exercise_preferences.sql`, including the September atomic-workout-link and logging-ledger migrations. Do not infer this from table names. Read the hosted migration ledger and compare the required function/constraint definitions before applying anything. Apply the following files in order; the documentation mirror is evidence, not a second migration to execute.

| Order | Migration | SHA256 | Exact documentation mirror |
| --- | --- | --- | --- |
| 1 | `20260918010000_optional_session_feedback.sql` | `36339DB6E81283427475D7AFD6B4D2DEC153FFC625D02916C389BEB47204BD5E` | `optional-session-feedback-migration.sql` |
| 2 | `20260918011000_session_capture_signals.sql` | `494A2E62035452860A97A30EFAB42013A230BDF5F49128610946081627674B17` | `session-capture-signals-migration.sql` |
| 3 | `20260918020000_capture_receipts.sql` | `B65E5516FA2323FF88E8182E28D92FF0ABE810AB5339E1937E3E4C55745AB724` | `capture-receipts-migration.sql` |
| 4 | `20260918030000_training_intent.sql` | `8CEE6E059F9775F35C055D234BBFCF8796D8908213CDAD8AC95479AC89EB5755` | `training-intent-migration.sql` |
| 5 | `20260918040000_targeted_review_sources.sql` | `D4A94E8EFDA49439F8D4B270B78DE864CEEFF8E114BB45A10DAFBD98C067BE84` | `targeted-review-sources-migration.sql` |
| 6 | `20260918050000_recommendations.sql` | `37E52B7AA19AD37DD92DAEDEE0D4A2454FE88E8311293300DE6B57152E543F58` | `recommendations-migration.sql` |

Paths are under `supabase/migrations/` and `docs/migrations/`. All six byte hashes matched their mirrors during this preparation. Recompute them against the frozen release artifact before promotion. Prior applied migrations must not be edited or replayed as a rollback.

Replacement order matters. W1 replaces `record_coach_session_result_v2`, the v1 `record_coach_session_result`, and the legacy runner finalizer with version-safe validation. W2 installs audited capture wrappers, replaces `save_logged_activity` and `finish_logging_request`, and installs the seven-argument `record_coach_session_capture` and three-argument `commit_activity_draft`. W6 replaces `record_coach_weekly_review` and adds source guards on proposal authority. W7 finally replaces capture validation, child commit, and mutation helpers to preserve owned recommendation attribution, and adds eight-argument session-capture and four-argument draft-commit overloads. Original overloads and exact old replay remain available. Installing an older function body after W7 would silently remove required attribution/freshness behavior.

## Compatibility floor

The minimum rollback application is the coordinator-frozen **compatible reader/writer candidate for this change**, identified by the final source manifest above. Before external release, retain a deployable artifact with the same verified contents; no hosted artifact exists yet. The old base SHA above is not that floor. The retained floor must include all of these behaviors:

* Version-dispatched feedback readers retain unknown fields, explicit provenance, fractional RPE and old v1 replay; stored legacy defaults never become explicitly reported evidence.
* Capture clients retain parent and child request identity, receipt bundles, partial success, uncertainty and original-request reconciliation. The installed W2 schema requires audited amendment/deletion and read-only canonical PR lookup even when new-capture rollout is off. `auditedCaptureInstalled` probes `meals.capture_revision`; only exact absent-column errors allow the old-schema fallback. An unknown schema/read error fails closed.
* Training-intent snapshots, revisions, supported baseline bindings, accepted plans, historical reviews and their invalidations remain readable regardless of new-intake/presentation switches. New numerical selection stays disabled.
* Recommendation sources, response events, coverage and outcomes remain persisted and auditable; invalidated or withdrawn interpretations are never restored by presentation rollback. Service-role publication authority and owner-only responses remain intact.
* Permanently retired unsupported legacy assertions remain filtered, including `NUT_PERF`, `HRV_TREND`, `CAL_DEF`, `STRAIN_NUT`, `PRO_REC` and corresponding unsupported fitness-insight types. Turning recommendations off cannot reinstate those claims.

Avoid any cutover interval in which the W2 schema is installed but an incompatible old app still handles correction/deletion traffic. The authorized deployment plan must coordinate application/schema availability for that boundary. Preserve recovery/status reads and immutable receipts through the cutover; do not reinterpret a transport timeout as permission to create a new request.

## Rollout switches

All proposed production rollout values below are **off**. This is a release configuration prescription, not a claim that production environment variables were inspected or changed. The single authority is `app/lib/personalized-coaching-capabilities.ts`; clients receive server capabilities.

| Server variable | Initial release value | Behavior |
| --- | --- | --- |
| `CAPTURE_RECEIPTS_V2_ENABLED` | `false` | New receipt/optional-feedback/exercise-signal rollout; installed-schema correction/recovery compatibility remains required |
| `COACH_TRAINING_INTENT_ENABLED` | `false` | New confirmed training-intent/baseline entry rollout |
| `COACH_HISTORY_CONTEXT_ENABLED` | `false` | Factual history planning context rollout |
| `COACH_INITIAL_DOSE_POLICY_ENABLED` | `false` | Capability is hard-coded false regardless of environment; W5/W10 approval cannot be replaced by setting this variable |
| `COACH_TARGETED_REVIEW_ENABLED` | `false` | New targeted review behavior; historical source invalidation/reader compatibility remains |
| `RECOMMENDATIONS_ENABLED` | `false` | New shared recommendation presentation and refresh rollout |

Unspecified variables default off. Shadow performed-dose evidence and prescription basis explicitly remain numerically ineligible. No threshold, progression, deload, calorie target, or policy selection is activated by this packet.

## Authorized preflight, canary and readback procedure

1. Obtain explicit authority naming the deployment target, schema application, configuration changes, and whether synthetic canary writes are allowed. Identify the exact artifact and target migration ledger; verify backup/recovery availability and operator ownership without exposing credentials. Resolve W9 acceptance and known limitations before treating the candidate as releasable.
2. On an isolated local or authorized staging database, apply the actual repository chain and the six frozen migrations. Use the maintained executable tests for repeat-application behavior; do not assume every additive file is a freely repeatable script. Verify function overloads and final bodies, constraints, consumed-source inventory, owner indexes, FORCE RLS, fixed search paths, narrow grants, and no anonymous/authenticated direct recommendation publication. Do not grant broad table writes to make a canary pass.
3. Apply the approved target cutover with all rollout switches off and a compatible app. Read back migration versions/function identities and the deployed artifact identity. Verify legacy reads, current canonical saves, old receipt replay, installed-schema corrections and status recovery remain available. A read-only smoke must not submit a meal, workout, baseline, response, or coverage report.
4. Only when separately authorized, enable the needed core capabilities for a scoped synthetic canary in dependency order: capture compatibility, intent/baselines and factual history/targeted review, then recommendations. The current flags are deployment-wide booleans, not an implemented per-user allowlist; use an isolated authorized canary deployment/account scope and do not imply a hidden production cohort mechanism. Keep numerical policy off throughout.
5. With synthetic write permission, record one canonical activity, reconcile a deliberately lost acknowledgement against the same parent/child request, amend its revision, and verify the immutable prior receipt/revision plus current totals. Record an optional-feedback completion without invented pain/effort, a supported bound baseline, and a confirmed goal correction. Validate one current recommendation, explicit bounded coverage, Done with no canonical write, due observed/reported/unknown outcomes, and correction invalidation. Use a second synthetic owner to verify foreign IDs are denied. Do not use real athlete logs as smoke data.
6. Read back canonical counts/IDs/revisions and snapshot provenance, parent/child replay identity, current source/response/runtime/date authority, invalidated coverage, immutable accepted plan, and appended outcome invalidation. Inspect the browser at 320/390/desktop in light/dark plus keyboard and account-change/reload recovery. Save synthetic evidence with target/artifact/time/flags and explicit limitations. Only then consider the next capability under the authorized scope.

The local race scripts are restricted to the task's loopback PostgreSQL fixture; never repoint their database-creation/cleanup operations at a hosted project. Target canary cleanup needs explicit scope because retained audit history and legacy account-deletion limitations make blind account deletion unsafe.

## Failure thresholds and rollback

Any cross-owner read/write, unauthorized publication/acceptance, duplicate canonical activity on exact replay, lost confirmed receipt, source correction that leaves stale guidance visible, unknown feedback promoted to a known value, altered accepted plan, unreviewed numerical selection, or unsupported legacy claim is an immediate stop to capability expansion. A missing migration/function/grant, unresolved test failure, schema compatibility ambiguity, persistent pending state after successful bounded refresh, or canary readback mismatch also blocks promotion. No numerical production error-rate budget is invented from synthetic tests.

Rollback first disables affected new selection/presentation/writers through the server capabilities while preserving the compatible application floor. Recommendations can stop rendering/refreshing without dropping tables or events. Capture rollout can pause while the installed-schema audited correction/status/replay paths stay live. Keep canonical records, original receipts, snapshots, revisions, intent, accepted plans and source invalidations. Do not delete new rows, down-migrate columns, rewrite feedback as v1, remove trigger invalidation, roll back to unsupported legacy normalizers, or re-enable retired insights. Fix forward inside the compatible floor if a capability switch cannot preserve required recovery. Record the failing identity and reconcile affected original requests before permitting any edited new creation.

## Known release limitations

* **Fitness-Tracker-24x — pre-existing account cleanup constraints.** Deleting an auth owner with retained observation values fails `performance_observation_values_group_owner_fk`; the original meals owner FK also lacks auth-delete cascade. [W2 database evidence](w2-database.md) and [W7 storage contract](w7-storage-contract.md) distinguish those failures from new-table cascades. New recommendation-table tests remove the synthetic canonical meal first and verify their own cascades; they do not certify complete account erasure. Resolve or explicitly disposition this limitation before any release claim about account deletion or automated canary-account cleanup.
* **Fitness-Tracker-ykg — dormant legacy runner chain incompatibility.** The existing `prescribed_sessions_workout_terminal_check` prevents the old runner's in-progress workout link. [Independent W1 review](w1-database-review.md) records the failed boundary and absence of a current app caller. The new mixed-feedback downgrade rejection is verified; successful legacy runner finalization is not. Current atomic completion is separately tested. Do not enable or advertise the dormant runner as part of this release without its follow-up repair.
* Hosted migration/deployment, live account/OAuth, physical-device offline behavior, hosted CI and qualified-coach numerical validation remain outside this local packet's evidence. W11 preparation does not close W5/W10, authorize activation, or complete the full epic.

Final original-label clarification: [documented source disposition](original-label-disposition.md) completes Fitness-Tracker-u5l.13 as contract clarification. All eight original advice labels remain unvalidated and predicate-only; closure does not change acceptance counts. Existing gates require missing hypothesis/protocol/series/review authority; historical replay is a source operation. No new runtime behavior or policy was added.
