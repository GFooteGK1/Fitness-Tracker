# W7 storage integration contract

Version 1. This file defines the implemented parent/SQL integration boundary. Migration owner: database agent; server/rule/API owner: parent. Migration: `20260918050000_recommendations.sql`, mirrored as `docs/migrations/recommendations-migration.sql`.

## Trusted service RPCs

- `claim_recommendation_refresh(p_user_id UUID,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER)` returns null when no refresh is due or a current lease is occupied; otherwise `{leaseToken,leaseExpiresAt,sourceRevision,responseRevision,activePlanId,intentMemoryId,intentVersion,localDate,timezoneOffset,runtimeFingerprint,nutritionRevision}`. `activePlanId` is the active accepted **plan-version UUID**. Lease duration is an operational bound, not a coaching policy.
- `publish_recommendations(p_user_id UUID,p_lease_token UUID,p_source_revision BIGINT,p_response_revision BIGINT,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER,p_decisions JSONB,p_next_due_at TIMESTAMPTZ)` accepts exactly one decision, including an abstention. It returns `{recommendations:[rows]}`. It checks the current unexpired lease, claimed source/response revisions, current revisions and plan/intent authority, current runtime fingerprint, athlete-local date/timezone and decision deadline before acknowledgement. Publication replay under an acknowledged token returns the identical stored row only for identical payload.
- `fail_recommendation_refresh(p_user_id UUID,p_lease_token UUID,p_source_revision BIGINT,p_response_revision BIGINT,p_error_code TEXT)` records a bounded operational error only for the current unexpired lease and leaves unprocessed revisions pending. A stale worker cannot clear another worker's lease.
- `read_recommendations(p_user_id UUID,p_runtime_fingerprint TEXT,p_local_date DATE,p_timezone_offset INTEGER)` returns `{recommendations:[visibleRows],refreshState:{sourceRevision,responseRevision,nutritionRevision,processedSourceRevision,processedResponseRevision,pending,lastError},suppressions:[rows],dueOutcomes:[rows],coverage:null|rowWithCoverageValid,outcomes:[summaries]}`. Visibility rechecks current plan/intent/runtime/local scope, expiry and suppression on every read. Due superseded follow-ups remain hidden as current guidance.
- `get_recommendation_suppressions(p_user_id UUID,p_candidates JSONB)` returns exact candidate suppression for up to 128 `{scopeKey,evidenceFingerprint}` pairs, including active scope-wide defer. The initial read's bounded recent suppressions are advisory only.
- `record_recommendation_outcome(p_user_id UUID,p_recommendation_id UUID,p_request_id TEXT,p_outcome JSONB)` appends a payload-matched server-derived outcome; it never reactivates a decision or dirties its sources.

Only `service_role` receives execute on these RPCs. The API derives the owner from its authenticated session before constructing a service client. Ordinary authenticated clients cannot claim, publish, report computation success/failure, or invent derived outcomes.

## Athlete RPCs

- `respond_recommendation(p_recommendation_id UUID,p_request_id TEXT,p_response TEXT,p_defer_until TIMESTAMPTZ,p_runtime_fingerprint TEXT,p_timezone_offset INTEGER)` accepts done_reported, not_applicable, deferred or adjust_requested. It returns the immutable event, updates suppression and advances response revision in one transaction. Exact replay returns the event; changed payload conflicts.
- `acknowledge_recommendation_shown(p_recommendation_id UUID,p_request_id TEXT,p_runtime_fingerprint TEXT,p_timezone_offset INTEGER)` appends a display acknowledgement. It does not imply adherence or alter source/response revision.
- `confirm_logging_coverage(p_domain TEXT,p_local_date DATE,p_coverage_through TIMESTAMPTZ,p_status TEXT,p_request_id TEXT,p_expected_source_revision BIGINT,p_timezone_offset INTEGER)` records explicit nutrition coverage with owner, date, through-time and source revision. It is separate from recommendation Done. Any subsequent meaningful nutrition source write invalidates its coverage assumption.

Authenticated owners have read-only access to their decisions/events/state/coverage/suppressions. All mutations use RPCs. Authenticated operations derive owner from `auth.uid()`.

## Decision JSON

The parent supplies schemaVersion 1; kind action/collect_signal/abstain; ruleId accepted_plan.review, accepted_plan.session, accepted_plan.proposal, missing_signal.baseline, logged_nutrition.remaining, or no_eligible_action; ruleVersion `1`; policyVersion; runtimeFingerprint; scopeKey; evidenceFingerprint; sourceRevision; responseRevision; localDate; tzOffset (raw convention); validUntil; planVersionId; intentMemoryId; intentVersion; goalId; title; reason; reasonCodes; missing; conflicts; destination null or `{type,href}`; sources `[{table,id,at,revision,facts}]`; outcome null or `{kind,sourceId,metricId?,unit?,binding?,dueAt}`. Typed destination families are session/proposal/review/baseline/nutrition. No caller-supplied owner is authoritative.

Semantic scope and meaningful evidence fingerprints exclude incidental fetch times, lease tokens and unrelated source revision increments. Done/not-applicable/adjust suppression matches both scope and evidence fingerprint; defer suppresses the scope until its deadline. Only an explicitly named future safety policy may override it. There is no such override in these initial rules.

Rows keep the complete immutable decision JSON under `decision`; snake_case indexed columns mirror identity, versions, source/scope and lifecycle. Parent reads may consume `row.decision`. Normalized capture attribution accepts an owned persisted recommendation UUID only in the initial frozen operation, carries it in the receipt, and preserves it on replay. It never makes Done create a canonical activity.

Outcome JSON is server-only `{schemaVersion:1,adherence:'reported'|'observed'|'unknown',evidence:[{table,id,revision}],summary,attributionLimits:string[]}`. Comparable measurement evidence additionally carries metricId, unit and binding matching the immutable outcome specification. Unknown follow-up does not claim adherence or improvement; observed evidence must be canonical and owned.

## Freshness, lifecycle and interpretation

New response/shown requests require the server-computed current runtime fingerprint and raw athlete timezone, current source/response revisions, current authority, active lifecycle and valid local day/deadline. Exact existing event replay occurs before these checks, so a lost acknowledgement remains recoverable after expiry, travel or configuration change.

Semantic deduplication reuses only an unexpired active decision with identical meaningful fingerprint and authority. Its original decision/source snapshot stays unchanged; a new publication records the current evaluation revision. Superseded, expired and withdrawn decisions never reactivate. A meaningful correction/deletion to an explicitly referenced original source withdraws its interpretation; superseded decisions remain superseded with a withdrawal reason. Expected session completion is later evidence, not a correction to the prescription. Capture revision noise alone does not withdraw unchanged factual nutrition.

Outcomes lock owned canonical sources before the recommendation. Measurement evidence must still match the original definition, protocol, binding, verifier, source type/system, observation time, metric/unit/role, unique value and current linked execution. Session evidence must be the actual completed-workout link within the follow-up window. Done is a reported response only. Unknown remains unknown; no improvement or causal benefit is inferred.

Later meaningful source correction/retraction/deletion appends `outcome_invalidated`; the original outcome event is never overwritten. `read_recommendations.outcomes` returns the latest 20 `{id,recommendationId,title,lifecycle,payload,createdAt,invalidated,invalidations}` summaries. The caller displays invalidated interpretations as unknown. Coverage accepts `complete_through|partial|unknown`, stores the explicit through-time and raw timezone, and compares the separate nutrition revision so unrelated workout edits do not invalidate coverage.

## First-operation capture attribution

The initial frozen operation may carry an owned `recommendationId`. Child commit, receipt, canonical capture metadata and immutable initial revision retain it. Retry cannot add or replace it. `record_coach_session_capture` has an additive required eighth UUID argument for attributed new v2 completion, leaving the seven-argument contract in place. `commit_activity_draft` has an additive required fourth UUID argument for an attributed explicit draft save; existing three-argument receipts and first-origin replay remain compatible. Corrections preserve the canonical activity's original attribution.

## Executable evidence

- `test/database/recommendations.test.ts` applies the actual W1–W7 chain and W7 twice. It covers publication replay/fences, lease takeover, exact suppression, stale runtime/travel responses, source invalidation rollback, coverage revisions, grants/RLS, immutable/terminal identities, owned text/draft/session capture origin, measurement rechecks, original-basis withdrawal and owned account cleanup.
- `scripts/verify-recommendation-concurrency.mjs` runs against the isolated loopback PostgreSQL 17.11 cluster. Ten cases passed with eight independently observed lock waits: competing claim, source-before-publication, source-after-publication, response race, stale takeover, 16-source burst, typed retraction before outcome, retraction after outcome, competing outcome publications, and a new ambiguous measurement value queued behind outcome publication. The measured 16-source burst took 745 ms in the recorded run; this is local synthetic evidence, not a production benchmark.
- All source inventory columns are checked against actual tables at migration time. Service writes use source-row ownership, not `auth.uid()`. A source write whose required state invalidation fails rolls back atomically.

Account cleanup scope: all new recommendation tables cascade by auth owner; capture attribution detaches through the owned FK on canonical deletion. The original `meals.user_id` FK lacks auth deletion cascade, so the W7 regression explicitly deletes the owned canonical meal before deleting the synthetic owner. Existing observation-value cascade issue `Fitness-Tracker-24x` remains separate. No production data, provider calls or production migration were used.

Final inventory delta: the recommendation runtime does not consume WHOOP or unrelated coach memories. No recommendation trigger is installed on WHOOP tables, and coach memory invalidation accepts only `training_intent`. Fifteen source tables remain; migration-time column validation prevents silent null comparisons against missing columns. Typed group sources include `verified_by` and `source_system`; check-ins include `plan_version_id`.

Final independent-readable changes: active-only semantic deduplication; no terminal resurrection; latest-version intent authority; new runtime/timezone response fences after exact replay; exact candidate suppression lookup; canonical lock and typed measurement revalidation; original-basis withdrawal and append-only interpretation invalidation; first frozen text/draft/session attribution; migration inventory narrowing. The database author made no recommendation-rule, threshold, provider, accepted-plan or UI changes.

Final focused SQL result after replay cleanup: **27 tests passed**. The prior four-suite combined run passed **73 tests** before the final additional replay-cleanup case; its earlier tests remain unchanged. The narrowed-source PostgreSQL run passed **10 cases with 8 observed lock waits**.
