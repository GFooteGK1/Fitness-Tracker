# W7 independent application review and focused tests

Status: **PASS for the reviewed pure-rule/context/outcome/API/service slice**, after backend-owner repairs. Reviewer/test owner: `w0_reuse_audit`. Runtime implementation remains owned by the parent. This review does not close W7's database, all-save-path, contention or real SQL requirements.

## Findings resolved with regressions

- Nutrition advice was emitted with no confirmed intent. The rule now requires confirmed intent for remaining-logged-target guidance; absent intent still permits existing accepted-session navigation and calm abstention.
- Session follow-up accepted a completion after its outcome deadline. The evaluator now enforces both recommendation creation and due-time bounds, with old, late and amended completions returning unknown rather than observed.
- Measurement follow-up converted null/empty values to numeric zero. Those values are now excluded; no observed measurement is invented.
- The evaluator never returned reported adherence. It now reads the owned recommendation's latest response and can return reported Done with its immutable event reference. Its text explicitly separates self-report from observed execution/benefit. No canonical write is performed by outcome evaluation.
- Dedupe included target update timestamps and meal audit revisions even when relevant facts stayed identical. Meaningful fingerprints now omit that noise while immutable sources retain their audit metadata. Equal-time source row order is canonicalized. Actual macro or baseline-binding changes remain meaningful and can resurface advice. SQL immutable-publication reuse was raised with the coordinator because the same identity may carry a newer audit source snapshot.
- Valid partial/unknown nutrition reports previously removed missingness and hid the stated time/completeness. Rules now expose the report's status and through-time; unknown remains missing. The service only supplies coverage marked valid by the fresh storage snapshot.

## Independent verification

`npx vitest run test/recommendations test/database/recommendation-journey.test.ts --reporter=dot`: **6 suites / 57 tests passed**, comprising 54 recommendation tests and three actual application-to-PGlite journeys. The final application delta run with the context, passive evidence and fitness insight suites passed **8 suites / 121 tests**. `npx tsc --noEmit`: **passed** after that delta. Reviewer-owned test files also passed ESLint after the final service regressions.

Reviewer-owned files:

```text
test/recommendations/fixtures.ts
test/recommendations/rules.test.ts
test/recommendations/context.test.ts
test/recommendations/outcomes.test.ts
test/recommendations/service.test.ts
test/recommendations/api.test.ts
```

Coverage includes omitted/default input versus a concerning legacy pain report; no invented targets; correct local date/UTC bounds and capability fingerprints; owner filters on every source query; cold-start versus failed/truncated reads; baseline ownership lookup failure; confirmed priority and separate same-metric distance bindings; stale sessions and accepted-plan navigation; unknown/partial/estimated nutrition; stable dismissal under clock/source noise; meaningful changes and defer deadlines; source/response races during refresh; one bounded deterministic evaluation; held lease; eight-outcome maximum; retryable source failure; full measurement comparability; superseded/withdrawn follow-up; unknown versus reported versus observed; causality limits; and authenticated expected-user fences for read/refresh/response/shown/coverage routes.

The service test uses the exact candidate suppression RPC rather than treating a bounded snapshot history as authoritative suppression. Responses and shown acknowledgements carry client timezone plus current server runtime scope. Done and coverage use separate explicit RPCs; neither test path creates phantom meals/workouts.

## Scope and integration boundaries

The recommendation implementation has no LLM dependency in its selection path and does not create numerical prescriptions. Wearable trend/correlation rule activation remains excluded. The recommendation unit tests use synthetic contexts and mocked database/API boundaries. The independently executed coordinator-owned PGlite journeys use the actual application service, SQL, roles, RLS and RPCs to exercise cold-start abstention, confirmed-intent measurement guidance, Done without canonical writes, origin-linked meal request replay, owner refusal, and amendment invalidation followed by refresh. Broader grants, lease takeover, suppression durability, immutable replay, outcome-source retraction and concurrent transactions remain the coordinator/database review's responsibility.

The read service returns bounded outcome summaries for W8. A successful derived outcome now causes one bounded final read so the same request can expose it. A regression preserves explicit invalidation state alongside the immutable historical payload. Empty timezone query values now reject rather than implicitly becoming UTC.

Further SQL/application contract review identified incomplete current measurement eligibility validation in the outcome RPC and missing consumed trigger fields (`coach_checkins.plan_version_id`, observation `verified_by` and `source_system`). The database owner added locked canonical group/value/provenance/binding checks and the consumed fields. Group protocol/content and value content are already immutable under the W1/W2 chain, including service-role writes; the actual mutation concern is eligibility/verification and retraction. A suspected changed-workout-link race was withdrawn after confirming the W2 trigger prohibits relinking and permits only audited deletion detachment into excluded/superseded state. It is not an unresolved finding.

The service now distinguishes a persisted evaluation error (`unavailable`, with pending revision retained) from an occupied lease (`pending`). The counterfactual regression prevents an outage from appearing to be indefinitely running work. GET responses explicitly disable caching.

## Independent legacy guard review

**PASS for the approved retired-family and passive-source boundaries**, after author repairs. Exact retired identifiers are normalized for whitespace/case and withheld independently of feature flags. Owned typed insight lookup protects historical model reads and visible typed messages. Existing unlinked Socius analyst prose remains visible to the athlete but is withheld from model conversation context because it has no evidence contract. User text and canonical history remain intact. This repairs the old unlinked response path that bypassed typed insight filtering.

Absent targets remain unknown in prompts; no default athlete weight or partial-log calorie deficit is introduced. Current WHOOP inputs require owned connection, a complete recent sync and current local observation dates. Passive cache hits revalidate sources. Before/after sync checks reject partial or changed generations. `buildSociusContext` performs a final generation check after all historical aggregate queries; otherwise both current readings and historical WHOOP averages are unavailable. The fitness insight endpoint uses the same current-source eligibility. The final regression verifies stable aggregate values survive while a sync begun during retrieval withholds them.

Independently executed the 16 legacy suites listed in `w7-legacy-insight-guard.md` after the final truthfulness delta: **325 tests passed**, including the two aggregate generation cases. Source anchors: `app/lib/agents/legacy-insight-guard.ts`, `app/lib/agents/legacy-insight-readers.ts`, `app/lib/agents/context-builder.ts` (passive source checks and final post-aggregate check), `app/lib/agents/whoop-context-eligibility.ts`, and `app/api/fitness-insights/route.ts`.

The coordinator included adjacent protein/recovery and timing truthfulness in the final scope. `PRO_REC` and `recovery_nutrition` are now permanently retired across producer, prompts, parser, persistence and reads. Meal timing reports only the distinct count of logged workouts with linked pre-workout meal records, explicitly states unknown coverage, and suggests record review. Stored low-energy summaries state cause unknown without a nutrition prescription. The final independent source read and 325-test run cover this delta. The author then added two stronger regressions: duplicate uppercase/lowercase linked meal records plus unrelated/unlinked meals still count one matching workout, and three low-energy records retain cause-unknown/record-review wording. Independently rerunning the updated API suite passed **8 tests**; there was no intervening source delta. Type checking also passed after the final runtime changes.

This is not a semantic guarantee for arbitrary untyped model output or approval of every retained legacy insight family. No unresolved source finding remains in the assigned application scope. Full W7 closure still requires the coordinator's database evidence. No browser, hosted-account, production, provider, qualified numerical-policy, or physical-device claim is made by this artifact.
