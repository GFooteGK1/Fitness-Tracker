# W9 storage and concurrency evidence inventory

Preparation only. Beads gates W9 closure on W8. This document records database-author evidence and does not substitute for independent integrated review or the coordinator's acceptance packet.

## Actual migration chain

The reusable `test/database/recommendation-fixture.ts` applies the repository coach/evidence/runner/logging chain, then the six additive files `20260918010000_optional_session_feedback.sql`, `20260918011000_session_capture_signals.sql`, `20260918020000_capture_receipts.sql`, `20260918030000_training_intent.sql`, `20260918040000_targeted_review_sources.sql`, and `20260918050000_recommendations.sql`, in that order. SQL documentation mirrors each file. W7 applies twice. A separate replay test creates a former local-draft WHOOP trigger and proves the narrowed migration removes it. Required source columns are checked during migration. Prior applied migrations were not edited. The coordinator records the final source/patch identity and checksums after W8 stabilizes.

## Exact source and writer inventory

Every source uses OLD/NEW owner identity. Meaningful INSERT/UPDATE/DELETE writes dirty one coalesced owner state in the source transaction; an owner change dirties both owners. No recommendation invalidation uses a service worker's `auth.uid()` as source ownership.

| Source table | Consumed fields / eligibility | Write boundary and evidence |
| --- | --- | --- |
| training_programs | status, active_plan_version_id, start/end dates | Intake, conversion and accepted proposal; current accepted-plan authority fence |
| training_plan_versions | program/status/version/policy/intent/window | Proposal and accepted-plan transitions; immutable accepted snapshot and publication authority checks |
| prescribed_sessions | plan/date/status/completed workout/time/prescription | Atomic completion, accepted plan/session creation; later completion is follow-up, prescription correction withdraws basis |
| adaptation_proposals | base/proposed plan, status, weekly review | Create/accept/reject/expire existing proposal RPCs; recommendations cannot accept a proposal |
| coach_weekly_reviews | base plan/action/supersedes/review revision | Existing review RPC and successor; recommendation follows review authority |
| coach_review_source_invalidations | review/activity revision/observation group/reason | W6 source invalidation transaction; referenced review basis is withdrawn |
| coach_memories | training_intent only; status/version/content/effective/review times | Confirm/correct/withdraw intent; latest version and time validity are authoritative; unrelated memories stay quiet |
| coach_checkins | plan/session/type/responses/occurred time | Versioned completion/check-in RPCs; known concerning pain uses existing safety boundary |
| performance_observation_groups | workout/session/status/date/source/import/definition/catalog/protocol/verification/verifier/modifiers/metadata | Baseline and completion capture, verification/retraction, audited workout deletion; original values remain immutable |
| performance_observation_values | group/metric/role/value/unit/status/provenance | Baseline/completion/import writes and retractions; exact pair eligibility and unique matching value checked at outcome publication |
| measurement_imports | status and verification | Existing source eligibility/review retraction; imported values cannot become an athlete-confirmed manual baseline by assertion |
| workouts | date/execution status/capture revision/execution revision | Unified capture and dedicated execution amendment; actual correction invalidates outcome interpretation |
| meals | event time/capture revision/provenance and macro totals | All W2 logging adapters use frozen child commits or audited amendments/deletion; factual correction withdraws referenced nutrition basis |
| daily_targets | four target amounts | Existing saved-target writer; timestamp-only update is inert; saved nutrition target is sufficient goal authority without unrelated training intent |
| logging_coverage_confirmations | domain/day/timezone/through/status/nutrition revision | Explicit owner RPC with source CAS; Done does not imply logging coverage |

No recommendation trigger is installed on WHOOP, insight/PR projections, raw-media, token secret, logging ledger, draft or recommendation event tables. Metadata timestamps outside the consumed list do not cause a refresh. The database source inventory test verifies all 15 tables and all declared columns against the applied schema.

## Executable evidence

| Boundary | Evidence | Limit |
| --- | --- | --- |
| Feedback and exercise capture | Actual SQL in optional-feedback and session-capture-signals suites; ownership, unknown versus zero, no downgrade, replay and grants | No physiological inference or new numerical policy |
| Canonical child/draft/correction receipts | capture-receipts.test.ts, 35 tests; snapshots, stale edits, payload replay, foreign IDs, audited deletion and supported PR recomputation | Legacy account deletion prerequisites remain separate |
| Training intent | verify-training-intent.mjs, nine actual W1/W2/W3 chain cases | Qualified numerical policy stays disabled |
| Review source authority | targeted-review-sources.test.ts, nine cases; retraction, successor, historical replay and accepted-plan preservation | Not a substitute for qualified policy review |
| Recommendation state | recommendations.test.ts, 30 cases; lease/source/response/runtime/timezone fences, suppression, coverage, dedupe, terminal lifecycle, origin, outcomes and invalidation | Local synthetic SQL, no hosted-account claim |
| App to actual database | recommendation-journey.test.ts; real application modules and baseline API over a PostgREST-shaped actual-SQL adapter | The adapter models transport; no live network/PostgREST service |
| Capture concurrency | verify-capture-concurrency.mjs; four independent-backend races with lock waits | Isolated loopback PostgreSQL only |
| Recommendation concurrency | verify-recommendation-concurrency.mjs; ten cases, eight independent lock waits; 16 concurrent canonical writes | Latest narrowed-source burst745ms is not a production benchmark |

The prepared integrated journey performs capture, retries a lost acknowledgement without parsing or writing twice, publishes a defined signal, retries Done without canonical writes, records a protocol-bound baseline through the actual API/RPC, retries that baseline, derives an observed outcome, and corrects the original goal so the interpretation is invalidated while the original snapshot remains intact. Missing follow-up remains unknown; Done without canonical follow-up remains reported. A separate nutrition journey proves saved target authority without training intake and explicit coverage separate from Done.

Follow-up tests advance only the fixture deadline in a published decision to represent elapsed time without waiting until midnight. They do not change its protocol/binding or source values. No production RPC permits this test-only clock staging. All canonical observation times occur after actual publication and before the staged deadline.

The ten real-connection cases cover competing claims, source-before-publication rejection, source-after-publication immediate invalidation, response-revision rejection, same-revision lease takeover, a 16-source burst, typed measurement retraction before outcome, append-only invalidation after outcome, concurrent duplicate outcome rejection, and a second matching value queued behind outcome publication.

## Security and authority

All new owner tables enable and force RLS. Authenticated reads are owner-scoped. Composite keys bind canonical activity, drafts, revisions, observation sources, plans and attribution to the same owner. Anonymous/authenticated/service direct writes to recommendation state/decision/event/publication/coverage/suppression tables are revoked. Only the trusted server can claim, publish, fail and derive outcomes; athlete RPCs derive owner from auth and recheck freshness after exact-event replay. Fixed search paths and narrow execute grants protect internal helpers.

Canonical commits use frozen child identities and immutable receipts. Expected revisions reject stale amendments. Dedicated program execution amendment preserves the accepted prescription and original check-ins/observations. Attribution is frozen with the first owned text/draft/session request. Derived outcomes recheck locked ownership, definition/protocol/binding, verifier, source type, time window, linked execution and unique metric/unit/value. Corrections and retractions append outcome invalidation; benefit and causation remain unknown. Required invalidation failure rolls back its source write.

## Remaining integrated boundary

W9 still needs final full tests, typecheck, lint, build, independent integrated review and rendered W8 browser evidence after UI completion. The coordinator must record exact patch identity and clearly distinguish actual SQL from browser fixtures. The database author claims no physical device, hosted OAuth/account, production migration, deployment, qualified-coach review or held-out numerical quality.

Legacy cleanup remains limited: original meals user FK lacks auth cascade, and retained observation values block account deletion (Fitness-Tracker-24x). New-table tests explicitly delete the owned canonical meal before removing the synthetic auth owner and prove new recommendation storage cascades. They do not repair or conceal those existing constraints.

## Prepared journey result

`npm test -- --root . --exclude '**/.worktrees/**' test/database/recommendation-journey.test.ts` passed **7 tests** after the W8 nutrition-authority change. `npx tsc --noEmit --pretty false` passed, and `git diff --check` passed. The new cases add the observed/reported/unknown follow-up distinction, interrupted baseline save replay, original-goal correction and a saved nutrition target without training intent. The test adapter now preserves PostgREST array shape for the two table-returning baseline/intent RPCs. This adapter correction and an initially invalid empty workout block were fixture issues; no runtime change was required.

W7 SQL and documentation mirror SHA256: `37E52B7AA19AD37DD92DAEDEE0D4A2454FE88E8311293300DE6B57152E543F58`. No database behavior changed during this W9 preparation, so the coordinator's final ten-case separate-connection evidence remains applicable. The local PostgreSQL process remains running for final verification; only the coordinator stops it.

Independent event-recovery review added three actual SQL cases and seventeen helper/API cases. Exact successful response/shown retry survives stale source/runtime/local day; recognized uncommitted coverage/defer rejections remain distinct from payload collision and transport uncertainty. See `w9-event-recovery-review.md` for the 78-test focused run. SQL runtime and race coverage are unchanged.

Frozen development lifecycle materialization adds four passing base/counterfactual cases for nutrition correction and uncertain photo saves. It consumes the original development facts through actual capture/recommendation SQL and the client uncertainty gate. Both possible lost-response outcomes reconcile the original frozen child without duplicate activity. See `w9-engineering-lifecycle.md`; these cases fill the two lifecycle gaps the pure read adapter cannot establish.
