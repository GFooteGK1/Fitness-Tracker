# Reliable capture and personalized coaching: implementation plan

Date: 2026-09-17. Plan version: 1.0.

Project: SociusFit / `GFooteGK1/Fitness-Tracker`.

Planning task: `Fitness-Tracker-m7o`. Implementation epic: `Fitness-Tracker-u5l`.

This is the implementation specification. Beads owns task status and dependencies. The matching [handoff](../../handoffs/data-to-personalized-coaching.md) owns the current execution location and next action. No application implementation is claimed by this document.

## 1. Start here in a new session

When Greg says to implement this plan, execute the local engineering scope below. Make routine choices within these contracts, verify each package, and continue to the next ready package. Do not stop after producing another plan or completing the first package.

1. Read the closest `AGENTS.md`, this document, and the matching handoff. Apply the installed COS delivery workflow. Read other documents only when the active package references them.
2. Read the Beads epic and its children. Reconcile status with actual files and verification before claiming work. A completed planning task does not mean implementation is complete.
3. Inspect `git status --short`, `git worktree list`, and the live main revision. The repository root is an old, dirty checkout; do not implement there. Do not reset, clean, stash, delete, or overwrite unrelated work.
4. Resume this epic's implementation worktree if the handoff identifies one. Otherwise fetch current main and create `.worktrees/data-to-personalized-coaching` on a new local `codex/data-to-personalized-coaching` branch. If a name exists for another objective, choose a distinct suffix; never repurpose it.
5. Copy this plan and its matching handoff into the new checkout if absent from main. Verify the copies. Update the copied handoff with the absolute path and source SHA, and leave a short pointer in the original task handoff. Preserve the unrelated root `HANDOFF.md`.
6. Start W0 and continue ready packages. Use agents for non-overlapping modules and independent integrated review. One owner coordinates migrations and shared contracts.

Useful PowerShell commands, run separately after inspecting state:

```powershell
git status --short
git worktree list
git fetch origin main
git log -1 --format='%H %s' origin/main
git worktree add -b codex/data-to-personalized-coaching .worktrees/data-to-personalized-coaching origin/main
bd prime
bd show Fitness-Tracker-u5l
bd ready
bd show Fitness-Tracker-u5l.1
bd update Fitness-Tracker-u5l.1 --claim
```

If sandbox PATH cannot resolve `bd`, this host's verified launcher is `C:/Users/foote/AppData/Roaming/npm/bd.cmd`. Use the normal approval mechanism if required. Use the existing repository Beads database/redirect; do not initialize another tracker. If worktree discovery is ambiguous, run Beads with `-C C:/Dev/Personal/repos/Fitness-Tracker`.

### Authority and completion boundaries

The request that produced this file authorized planning. A subsequent instruction to implement authorizes local code, additive migration files, synthetic local database verification, local browser checks, and documentation within this scope. It does not authorize commits, pushes, production migrations/configuration/deployment, paid services/model evaluations, outreach, or changes to real athlete records. Prepare concrete release artifacts before requesting remaining release authority.

There is an existing domain-policy dependency: `Fitness-Tracker-qsp` requires qualified coaching review before history-based numerical initial-dose selection. Its draft is `.worktrees/coaching-layer/docs/coach/initial-dose-policy-0.1.md`. W5 and W10 depend on that review. Keep numerical selection disabled while completing independent work. An engineer's threshold, LLM opinion, or passing synthetic tests cannot replace this review. Do not contact a reviewer without authorization.

Two completion claims are distinct:

- **Core engineering ready:** W0-W4 and W6-W9 pass. Truthful capture, confirmed goals, factual history, supported evidence-directed review, and next-action feedback work locally. History-derived numerical selection remains disabled if W5/W10 are blocked.
- **Full numerical personalization ready:** W5/W10 also pass the frozen policy and qualified-review gates. Production completion additionally requires W11's authorized release and live evidence.

Never close the epic as fully delivered while a required capability or release gate remains open. Continue other ready work when a dependency branch is blocked.

## 2. Outcome, constraints, and non-goals

The user supplies a small amount of data, sees an accurate interpretation, corrects it easily, and receives a useful next action with an inspectable basis. Confirmed goals and relevant performed history influence supported planning decisions. Later observations inform the next decision without silently changing an accepted plan.

Preserve these boundaries:

- Supabase canonical meals, workouts, observations, check-ins, WHOOP records, confirmed memories, and accepted plans remain authoritative. No second workout store, copied wearable store, vector-memory authority, or second training planner.
- Deterministic application policy owns numerical prescriptions, eligibility, evidence gates, and changes. Models interpret bounded input or explain validated decisions; they cannot confirm facts, calibrate their own confidence, or activate plans.
- Accepted plans and recorded reviews are immutable. Goals, corrections, preferences, and new evidence affect a new proposal. Athlete acceptance remains a separate idempotent transition.
- Changes follow relevant athlete signals, not elapsed weeks. An unchanged next week is valid. One readiness score cannot establish adaptation.
- Goal, assessment, prescription, observed work, and adaptation form one traceable chain. Proxy improvement does not establish direct goal attainment.
- Scheduling considers overlapping demands, priority output, outside training, and neighboring-session quality. Do not invent a universal fatigue score or fixed spacing rule.
- Preserve charcoal/mint styling, persistent Log access, details on demand, 44px controls and 16px inputs. Optional feedback remains optional except at a specific supported safety/decision boundary.
- Use `app/lib/timezone-utils.ts`; distinguish raw and agent timezone-offset conventions. Keep event, capture, and sync times separate.
- All new user-owned tables require RLS, FORCE RLS, tenant-consistent references, restricted grants, and executable isolation tests.

Excluded: native automatic-photo ingestion, Apple/TestFlight work, new wearable providers, hydration tracking, arbitrary sports-programming expansion, provider replacement, TypeSafe/Jev rollout, a general weekly optimizer, full catalog rewrite, automatic background-photo canonical logging, automatic plan acceptance, unsolicited notifications, and new production dependencies. Existing native-photo issues remain separate.

## 3. Verified starting point and reuse strategy

Live GitHub latest main was `61d04df9dad3dfe88a9594fff28be06a72899741` on 2026-09-17 (PR #82). Its reviewed head is `86187c7dd2e062881500c6ec5943fc761dbd4739` in `.worktrees/exercise-preferences-release`, based on `688dfcf`. Recheck at execution; local `origin/main` was stale during planning.

Earlier in this conversation, authenticated Today, Plan, and Log were inspected. The completion form visibly started with RPE 7 and energy Okay. Nothing was saved. Seven focused test files passed 104 tests against the release worktree. These are dated baseline observations, not verification of this implementation or proof of athlete benefit.

Paths below are relative to the implementation checkout unless marked as experimental. Inspect current definitions before editing.

| Concern | Existing source | Finding / reuse |
| --- | --- | --- |
| Initial inputs | `app/lib/coach/complete-intake.ts`, `weekly-coverage.ts` | Recent sessions/movements/dose start empty; missing dose selects policy minimum. Do not fill this with summed sparse history. |
| Preferences | `app/lib/coach/exercise-preferences-context.ts`, `exercise-preferences.ts` | PR #82 already applies versioned confirmed preferences, including explicit-none/removal semantics. |
| Goals/measurements | `adaptive-programming-contracts.ts`, `adaptive-plan.ts`, `programming-schema.ts` in the coach directory | Rich contracts exist; creation still derives target-less goals/default assessments primarily from domain. |
| Evidence/memory | `app/lib/coach/evidence-context.ts`, `trust-center.ts`, `app/api/coach/trust/route.ts` | Reuse purpose-scoped packets, IDs, missingness, correction and confirmation. Memory whitelists need migration for new keys. |
| Weekly review | `app/lib/coach/weekly-review.ts`, `rolling-weekly-plan.ts`, `adaptation-evaluator.ts` | Existing review owns decisions; generic dose changes select the first eligible sorted assignment. |
| Completion | `app/program/today-session-card.tsx`, `app/lib/coach/today-session.ts`, `app/api/coach/sessions/[id]/complete/route.ts` | Defaults feed feedback v1. Latest RPC requires RPE/energy/pain and creates an RPE observation. UI-only nulls are insufficient. |
| Logging | `app/lib/logging/server.ts`, `app/lib/client/logging-request.ts` | Existing atomic saves and payload-matched receipts. Some quick/reviewed-food routes bypass the helper. |
| Insights | `app/lib/agents/socius-background.ts`, `context-builder.ts`, `app/api/agent/process/route.ts` | Unawaited chat-only trigger; unsupported personal-link/trend assertions; passive WHOOP context loses measurement date. |
| Today | `app/dashboard/page.tsx`, `app/components/DashboardNarrative.tsx`, `app/lib/dashboard-narrative-service.ts` | Reuse fingerprint/validation patterns. Narrative must not become another prescription engine. |

W0 required architecture reading: `docs/architecture/ARCHITECTURE-MAP.md` and ADR-0003, ADR-0006, ADR-0007, ADR-0008, ADR-0010, ADR-0014 in `docs/decisions/`. Resolve exact filenames through its index. Write a contract ADR using the next available number; account for experimental ADR-number collisions.

### Existing unmerged work

`.worktrees/coaching-layer` is actively dirty; `.worktrees/rolling-weekly-coach` has separate playbook edits. Neither is this epic's implementation base.

| Candidate in coaching-layer | Decision |
| --- | --- |
| `performed-dose-evidence.ts`, `performed-dose-review.ts`, tests, ADR-0020 | Audit dependencies and port normalization/comparison as shadow-only first; preserve `numericPolicyEligible: false`. |
| `prescription-basis.ts` and presentation | Reuse honest provisional-dose disclosure, adapted to current main. |
| `execution-priority.ts`, composer/tests, `docs/coach/execution-priority-implementation.md` | Port supported order/priority realization after audit. Respect sequencing; no general optimizer claim. Coordinate `Fitness-Tracker-f4k`. |
| Commit `422fd3a` session signals/completion | Review bounded pieces and tests; do not cherry-pick wholesale. Adapt preferences, current UI, feedback v2, and RPCs together. |
| `docs/coach/initial-dose-qplan-2026-09-17.md`, `initial-dose-policy-0.1.md` | Preserve shadow/review boundaries. Proposed thresholds are not executable policy. Check `Fitness-Tracker-qsp`. |
| TypeSafe, compact prompts, paid archives, specialist experiments | Exclude. Provider budgets/approvals do not transfer to this epic. |

The older committed history reader recognizes `block.movements`; canonical as-prescribed completion can store `block.exercises` with ranges. Cover both with actual serialized fixtures. Preserve all source worktrees and evidence. Reuse is verified only after tests pass on the new base.

## 4. Approach decision

Complexity: level 4 overall, delivered as bounded level 2-3 packages. Confidence is high in the architecture; numerical history-to-dose policy and athlete effectiveness require separate evidence.

| Approach | Benefits | Costs / failure modes | Decision |
| --- | --- | --- | --- |
| Fortress: patch each route; manual personalization review | Small changes, simple rollback | Semantics continue to diverge; history stays underused; repeated manual work | Conservative fallback, not end state |
| Avant-Garde: autonomous model planner plus new event service | Broad expressive capability | New services/authority before evidence quality; bounds cannot establish prescription quality; harder replay | Excluded |
| Synthesizer: typed capture/evidence, existing deterministic coach, Postgres refresh, one action surface | Fits persistence and acceptance; reproducible; no new provider/service | Coordinated schema/versioning and compatibility work | Selected |

Consider a separate worker only if measured demand requires unattended refresh or bounded interaction-triggered work cannot meet latency requirements. That would be a later architecture decision.

## 5. Contracts to implement

Names marked **proposed** do not exist in current main. Adapt an existing equivalent found in W0 rather than duplicating it; record equivalent-path substitutions here.

### 5.1 Capture, receipt, and correction

Proposed modules: `app/lib/capture/contracts.ts`, `service.ts`, `corrections.ts`; shared UI: `app/components/capture/CaptureReceipt.tsx`; owner-scoped receipt reconciliation: `GET /api/logging/requests/[id]`.

Each receipt identifies user, request, entity kind/ID, revision, event/capture times, input method and persistence state. Field provenance separates **origin** (`athlete_reported`, `model_estimated`, `copied_template`, `imported_unverified`, `legacy_unknown`) from **review state** (`unreviewed`, `athlete_confirmed`, `corrected`) and records source references. Reviewing a photo estimate does not make its composition measured. Confirmed occurrence does not confirm every quantity. Exact values, ranges and unknowns stay distinct; model scores are not verification.

States: draft, saving, queued where supported, saved, save_unconfirmed, correction_pending. Reuse the request ledger rather than another save-status system. Return persisted IDs only. Identical replay preserves payload, user, event date and recommendation origin. After an uncertain create/lost response, reconcile the original request before editing or assigning a new create identity. If it committed, amend that entity/revision; if a confirmed no-write failure occurred, an edited retry may use a new identity. A separately intended occurrence needs an explicit new logging action. Changed-payload reuse of an unresolved key must conflict, never create a second activity.

Support multi-activity Coach requests explicitly. Extend the existing request ledger with stable child-operation records (proposed `logging_request_items`) and return a receipt bundle, retaining `logging_requests.entities` compatibility. Before its first mutation, freeze a normalized list of authorized occurrences with server-assigned child IDs, kind, source-item identity, payload fingerprint and status. A repeated model tool call must resolve to the same child rather than allocate another ID. Two explicitly distinct identical meals remain two occurrences; matching payload text alone cannot collapse them. A model may not append an unrequested activity to the frozen list.

Choose per-child atomic commit with explicit partial success, matching existing multi-entity behavior. If the workout saves and a meal fails, show the saved workout and unresolved meal separately. Do not roll back the workout, claim whole-request success or regenerate/replay committed children. Recovery reads each child receipt, retries only confirmed-uncommitted children with original identity, and reconciles uncertain children before any edited create. Amendments target the returned entity/revision. Acceptance includes timeout then edit, mixed meal/workout with the second save failing, first-child response loss, repeated identical tool calls and two intended same-item occurrences.

**Chosen behavior:** explicit Log/Save or an unambiguous request to log can save once and show a compact editable receipt. No compulsory second review for known meals or explicit logs. Analysis-only questions/previews cannot create canonical activity. Ambiguous intent or missing essential facts produces a draft. Save this estimate can commit a valid uncertain result while retaining its origin. Unreviewed inferred quantities cannot become exact performance observations or qualify a history-derived numerical dose.

Server application code owns operation intent. A model tool call cannot turn an analysis-only request into permission to log. Reuse recent/template meals without another model call; copying confirms the new occurrence, not measured composition or a fabricated fresh review.

Add `activity_drafts` for owned normalized proposals, revision/status/expiry and eventual canonical ID; add `activity_revisions` for append-only normalized amendment snapshots, origin/review metadata and same-user canonical references. These are staging/audit records, not competing workout/meal stores. No raw photo/audio persistence. Expired drafts are excluded from use without a new scheduler; do not silently purge user work. Existing account deletion policy must cover these tables.

Use commit/amend RPCs with request identity, expected revision and deterministic totals/block scores. Dedicated Log routes can normalize and commit in one request without visiting a draft screen. Preserve old receipt responses. Corrections update block scores and PR projections, invalidate dependent context/evidence/recommendations, and preserve prior snapshots. A stale edit conflicts rather than overwriting another correction.

Program-runner workouts prohibit ordinary UPDATE/DELETE. Use a dedicated execution-amendment RPC that preserves the prescribed-session link, accepted prescription and original check-in/observation history, then supersedes the execution projection explicitly. Do not bypass this protection through agent `update_workout`. That tool currently cannot correct blocks; PR upsert with `ignoreDuplicates` is not sufficient recalculation after a load correction. Immutable reviews retain original inputs and gain a correction/invalidation reference for subsequent decisions.

### 5.2 Feedback v2

RPE, energy and pain start unknown. Explicit no pain differs from no answer. Keep hardest-set effort, session RPE, readiness and actual work separate. Reuse saved exercise details in editable completion without inventing missing sets or overwriting later edits. Completion can save without optional feedback unless an existing specific safety rule blocks it.

Introduce version-dispatched feedback/RPC support. For new v2 entries, store nullable fields and provenance; create an RPE observation only if explicitly supplied and valid. Preserve fractional RPE where supported without inventing an integer projection. Preserve exact old v1 receipt replay and plan execution.

Do not rewrite historic defaults or delete them. New evidence readers treat legacy fields with unprovable explicitness as `legacy_unknown` and exclude them from rules requiring explicit confirmation. Historical concerning-pain reports still trigger applicable safety handling; missingness must not erase a known concern. Unknown is neither reassurance nor a new safety event. Stored reviews remain reproducible under their original version.

Apply this classification to typed observations as well as check-ins. The old completion RPC writes `performance_observation_groups.verification_status = 'athlete_confirmed'` and `session.rpe` even for an untouched default. New completion-generated observations must carry feedback version, source check-in/revision and explicit field-confirmation provenance. A legacy completion-generated RPE observation lacking that provenance is `legacy_unknown` for new explicit-report gates despite its stored verification flag. Preserve the original row and historical review snapshot. Test the direct evidence-reader path so it cannot bypass this rule through the observation table.

Update types, validation, extraction, summaries, UI, API and SQL together. Report observation coverage separately from averages. UI-only nulls would break the existing RPC.

### 5.3 Confirmed planning intent

Proposed `app/lib/coach/planning-intent.ts`: `PlanningIntentV1`, stored under a new versioned `coach_memories` key `training_intent`, kind `goal`, snapshotted into proposal/plan input.

Reuse `TrainingGoal`: stable outcome ID, statement, priority, optional explicit target/comparator/unit, assessment/protocol, baseline observation reference or unknown, applicable date, required qualities and confirmation provenance. Allow up to eight outcomes in v1 as an engineering UI bound. An optional event groups goal IDs/date without event-specific scoring. Process/exploratory goals may lack numerical targets.

Separate outcomes from domain allocations. Two outcomes in one domain retain distinct measurements; shared training demands must not be counted twice. Keep current supported domains/capabilities. Save unsupported outcomes visibly and identify the missing capability. Never present a supported subset as a complete event program.

Prefill from existing confirmed profile/context and goal prose, then ask the athlete to confirm/correct. Never infer numerical targets silently or promote model interpretation into confirmed memory. A changed goal creates a new memory version and proposal; accepted direction and existing-coach authority remain intact.

Add strict API/SQL validation and `correct_coach_memory` whitelist support for the new key. Preserve `primary_goal` readers. Introduce version-dispatched plan/intent decoders before new writers; changing a shared version constant must not invalidate old accepted JSON.

Use scheduled session observations for baselines when possible. `/api/coach/assessments` is strength-specific. If a supported standalone baseline needs capture, add proposed `POST /api/coach/observations` with a restricted adapter/RPC to existing observation tables. Use catalog protocols/units, ownership and idempotency; reject arbitrary client-derived evidence.

### 5.4 Planning context and performed history

Proposed `app/lib/coach/planning-context.ts` composes confirmed intent, schedule, equipment, constraints, current preferences, compatible observations, canonical completion links, outside commitments and missingness. Keep it distinct from `app/lib/agents/programming-context.ts`.

Port the audited pure performed-dose normalizer with exact/bounded/unknown quantities and source-field references. Apply these rules:

- Actual reported work differs from a copied prescription. An as-prescribed range is not its midpoint or maximum.
- Deduplicate canonical IDs/links, not names/dates. Keep genuine same-day sessions separate and flag ambiguous duplicates.
- Complete retrieval does not prove complete logging. Missing history is not zero training. Do not divide sparse four-week logs into invented weekly dose.
- Preserve units, unilateral conventions, work/preparation roles, protocol/equipment, and effort scale. RPE does not imply RIR; hardest set does not describe all sets.
- Current restrictions/equipment/outside demands outrank history. Familiarity does not establish proficiency, tolerance or dose transfer to a substitute.
- Historical replay requires a revision/snapshot when a current row was edited after the requested as-of time. Keep replay and current-state modes explicit.

Factual familiarity and compatible assessment baselines can influence supported existing policies after tests. Keep shadow dose comparison out of live prompts and numerical selection until its gate passes; changed prompt context can change a plan even if numerical code is unchanged.

Cold start means missing athlete evidence, not database outage. Offer eligible provisional policy work with an honest basis. Failed/truncated retrieval must not silently reset an established athlete to novice assumptions. Ask only for facts that change an available decision.

### 5.5 Evidence-directed prescription changes

Existing weekly review stays authoritative. A proposed change carries goal, metric/series, protocol, movement/coverage requirement, exact assignment, source exposure IDs, policy version and eligibility/exclusion reasons. Server-selected evidence establishes the links.

For new multi-outcome intent, replace the route's current `adaptive_programming.goals[0]` selection with a bounded per-goal evaluation. Each result retains goal ID, full protocol/comparability binding (including movement, distance, equipment and variation where relevant), included/excluded sources, independent attainment, action candidate and missingness. A shared metric name does not make two event outcomes interchangeable. Persist these `goalReviews` in the versioned immutable weekly review and keep the legacy single-goal decoder.

Aggregate into one authoritative weekly decision: existing safety handling takes precedence across all goals; then consider supported candidates in athlete-confirmed priority order, using stable goal ID only as a presentation tie-break. Validate any selected candidate against every affected goal and shared demand. Compatible candidates may yield at most the existing policy's one bounded change. Incompatible candidates, missing evidence needed to resolve a shared-demand conflict, or an unspecified priority produce hold/collect-signal or explicit review, never an inferred priority or two conflicting changes. Missing evidence for an unrelated goal does not automatically veto a safe independent continuation. Record all per-goal results and why one candidate was chosen or deferred; achieving one goal must not mark the event or other goals achieved. New physiological tradeoff rules remain outside this aggregation contract.

Replace generic first-sorted assignment selection. Movement-specific improvement cannot change another movement because it sorts first. Broad evidence with no supported transfer mapping produces hold/collect-signal. Unchanged weeks remain valid.

Audit local execution-priority work; verify final order, preparation, role, dose and time budget. Mandatory sequencing wins. A blocked focus cannot be described as achieved.

Core W6 may narrow the evidence-to-assignment mapping for existing versioned numerical rules and deliver capture, hold and collect-signal behavior. It must not import new numerical load-trial, progression or recovery eligibility from `422fd3a` as already validated. Its `docs/coach/signal-implementation-2026-09-10.md` retains qualified protocol review and athlete-walkthrough gates. Preserve those gates for any reused gated capability; leave new numerical rule classes disabled/excluded until their specific review is recorded. Existing action labels and compiler bounds do not establish policy approval. This gate is distinct from qsp's initial-dose review.

Initial numerical selection is separate and versioned. After `Fitness-Tracker-qsp`, build movement-specific candidates, compare complete sets/reps/load/effort/rest/frequency bundles, and validate the whole week. Do not copy sets alone or silently clamp incompatible history and call it continuity. Supported classes, sufficiency and recency come from reviewed policy. Unsupported cases remain provisional/review-required.

### 5.6 Recommendation, response, and outcome

Proposed `app/lib/recommendations/{contracts,context,rules,rank,outcomes,service,store}.ts`.

A decision is action, collect_signal or abstain. It includes rule/schema/policy versions; accepted goal/plan or confirmed goal-memory reference; typed action/destination; dated source IDs and minimal immutable factual snapshot; source revision/fingerprint; local-date scope; validity deadline; reason codes; missing/conflicting data; and optional outcome specification. Use evidence states, not newly invented confidence percentages.

Start with four bounded action families:

1. Open/execute an accepted session or handle an explicit plan/review state under existing policy.
2. Collect a defined missing measurement that can change a supported decision.
3. Review an authoritative coach proposal; acceptance stays in the existing transition.
4. Explain remaining **logged** nutrition against an explicitly confirmed target, with time/completeness limits. No new calorie prescription or claim that low logged intake proves under-fueling.

Rank eligible actions: existing safety/review boundary; time-sensitive accepted-plan action; decision-changing missing signal; optional nutrition guidance. Tie-break by explicit goal priority then stable rule ID. Suppress dismissed/deferred duplicates; only a named safety rule may override suppression. No eligible action yields a calm truthful state, not invented advice. Without a confirmed goal, allow only neutral data collection or existing accepted-plan navigation.

Each rule declares source-date, comparability, completeness and baseline/sample gates. WHOOP sync time is not measurement time. Current readings must match the athlete-local interval or declared device-cycle policy; trend rules use reviewed protocols. A low average is not a decline. Unsupported trend claims abstain.

Nutrition coverage defaults unknown. If needed, store explicit reports in `logging_coverage_confirmations`: owner, domain, local date, coverage-through time, status, source revision and confirmation event. This is a bounded report, not proof of later intake. Later activity/correction invalidates dependent assumptions. Done cannot assert complete meal logging.

Storage: `recommendations` has immutable decision/evidence plus controlled lifecycle metadata; `recommendation_events` has append-only shown/response/outcome events; `recommendation_refresh_state` has one coalesced pending revision per user. Do not overload legacy `insights` and its uncalibrated confidence field.

Lifecycle: active to superseded, expired or withdrawn. Responses: done_reported, not_applicable, deferred, adjust_requested. Shown requires display acknowledgement. Deduplicate publication by user/rule/policy/scope/meaningful-evidence fingerprint; reopening a page a second later must not create a new decision.

The response RPC atomically records the event, updates visibility/suppression and increments a separate `response_revision`. Publication compares that revision as well as source revision. Display acknowledgements and derived outcome events do not recursively trigger analysis. Defer-until, decision expiry and outcome-follow-up deadlines participate in refresh eligibility even without new source writes. Superseded decisions can still receive a bounded follow-up outcome record while staying hidden as current advice; correction/withdrawal reasons constrain how that outcome is interpreted.

Done is self-report, not a meal/workout/measurement. Carry optional owned recommendation origin in the first logging request and preserve it on retry. Outcomes link later comparable canonical evidence and report adherence as reported/observed/unknown. Missing follow-up is unknown; improvement after advice is not proof of causation. Expose overlapping actions as attribution limits. Durable preference learning still requires confirmation; clicks do not change numerical policy.

### 5.7 Durable refresh without a new service

Database triggers increment/coalesce source revision in the source-write transaction for meaningful changes to fields consumed by enabled rules. Cover insert/update/delete and authenticated/service-role ownership. Recommendation/event writes cannot recursively dirty their own inputs; explicit athlete responses use the separate response-revision transition above.

The trigger inventory covers consumed meals/workouts and child evidence, check-ins/completions, observation status/corrections, goals/targets/preferences/constraints, accepted plans/reviews, logging coverage, and WHOOP measurements/sync state. Do not trigger on unrelated tables. Hooks only in `saveActivity` would miss direct meal and coach RPC writes.

Proposed `POST /api/recommendations/refresh` and `GET /api/recommendations`: await bounded refresh separately after confirmed saves and on Today entry. Canonical logging succeeds independently of computation. Persist lease token/expiry, source revision, response revision, processed revisions and error state. Publication/acknowledgement requires the current unexpired lease token, unchanged source/response revisions, current active-plan and intent versions, current rule/policy/capability version fingerprint, and a still-valid local-date/time window. Lease takeover fences out the old worker even at an unchanged source revision. Lost processes/concurrent writes leave pending work for the next interaction; a slow worker cannot clear a newer revision or resurrect a dismissed card.

Expiry, defer/follow-up deadlines, local-date/timezone changes, changed intent and policy/feature-capability changes invalidate output without a new workout. Check these against current server state on read/publish, not only an old cached fingerprint. During partial WHOOP sync use a coherent completed snapshot or mark evidence unavailable. One bounded evaluation per request, then pending/unavailable; no uncontrolled retry loop.

This scope promises interaction-triggered refresh, not unattended notifications. No new queue provider or cross-user cron worker. Deterministic actions remain available without an LLM. Optional paraphrase must validate against the selected facts/action and fall back to deterministic text.

Stop future surfacing of unsupported legacy nutrition-performance/HRV assertions. Preserve historical rows but exclude unvalidated assertions from all model contexts as evidence. Rollback must not re-enable unsafe claims automatically.

## 6. Work packages and dependencies

This is a specification map, not a second status tracker. `bd show` owns live state. Do not recreate IDs silently if lookup fails.

| Package / Beads ID | Depends on | Deliverable |
| --- | --- | --- |
| W0 / `Fitness-Tracker-u5l.1` | none | Isolated base, reuse audit, contract ADR and evaluation fixtures |
| W1 / `Fitness-Tracker-u5l.2` | W0 | Feedback v2 through UI/API/SQL/evidence |
| W2 / `Fitness-Tracker-u5l.3` | W0, W1 | Receipts, provenance, corrections and all route adapters |
| W3 / `Fitness-Tracker-u5l.4` | W0 | Confirmed intent, setup reuse, baseline capture |
| W4 / `Fitness-Tracker-u5l.5` | W0, W1 | History/context and shadow dose comparison |
| W5 / `Fitness-Tracker-u5l.6` | W3, W4, `Fitness-Tracker-qsp` | Reviewed initial-dose policy and compiler integration |
| W6 / `Fitness-Tracker-u5l.7` | W1, W3, W4 | Targeted weekly changes and supported goal priority |
| W7 / `Fitness-Tracker-u5l.8` | W0, W2, W3 | Recommendation contracts, freshness, storage and durable refresh |
| W8 / `Fitness-Tracker-u5l.9` | W2, W3, W6, W7 | Today action, responses and outcome flow |
| W9 / `Fitness-Tracker-u5l.10` | W2, W3, W4, W6, W7, W8 | Core integration/security/regression/product evidence |
| W10 / `Fitness-Tracker-u5l.11` | W5, W9, `Fitness-Tracker-f4k` | Held-out numerical quality and qualified review |
| W11 / `Fitness-Tracker-u5l.12` | W9 | Release packet; activation only when authorized |

W11 can prepare/release core with numerical selection disabled. Including numerical selection requires W10. A core release does not close W5/W10 or the full epic. W1/W3 can run in parallel after W0 with one migration coordinator; W2/W4 can then proceed independently. Recommendation contract design/pure rule fixtures can be delegated within W0, but W7's executable backend and closure wait for W2/W3 source shapes and all-save-path integration.

### W0 — Baseline, contracts and fixtures

Read the source/ADR map and relevant experiments. Record port/adapt/shadow/exclude choices in proposed `docs/verification/data-to-personalized-coaching/reuse-audit.md`. Do not copy entire dirty branches or experimental archives.

Write the contract ADR. Reproduce default feedback, empty initial history, same-domain/different-outcome goals, unrelated-assignment adjustment, unsupported personal-link/trend claims, stale wearable data and ambiguous-save replay. Freeze expected behavior before changes; use synthetic people/data.

Create at least 30 distinct development scenarios and 12 separate held-out scenarios across the three recommendations. These are engineering coverage targets, not physiological thresholds. Repeated prompts are not distinct athletes. Counterfactual pairs change one factor. Inspected pilot archives cannot become unseen holdouts; cases used to fix behavior move to development and need replacement before a fresh holdout claim. Separate qualified-coach labels from engineering assertions.

Acceptance: baseline source/test evidence recorded, defects reproduced, main features preserved, no provider calls, and contracts/versioning concrete enough for parallel W1/W3 and later W7 integration.

### W1 — Honest optional feedback

Change `app/program/today-session-card.tsx`, coach `today-session.ts`, `execution-feedback.ts`, `session-completion.ts`, `athlete-context.ts`, types/schema, completion route, review readers and a new compatible v1/v2 RPC migration. Inspect `20260904023000_fix_atomic_session_workout_link.sql` and prior runner/completion definitions; update every reachable entrypoint.

Test completion with absent optional fields; explicit no pain versus unknown; exactly one observation for reported RPE only; fractional effort; hardest-set/session distinction; skipped/modified/stopped work; retries/mismatch/stale base/account change; legacy replay; cross-user denial; legacy typed RPE cannot bypass explicit-report gates; legacy provenance and known concerning pain. Port optional exercise-feedback reuse only after dependency/migration inspection.

Acceptance: compact explicit choices, no fabricated observations, no duplicated actual-work entry, canonical linkage preserved.

### W2 — Shared capture and correction semantics

Keep public URLs; migrate all adapters, not just visual cards:

| Surface | Existing path |
| --- | --- |
| Workout text/speech/OCR; templates | `/log`, `/templates/[id]` to `/api/parse-workout` |
| Meal text/voice | `MealInputEnhanced` to `/api/meals/parse-text` |
| Meal photo | `MealCameraCapture` to `/api/meals/upload` |
| Recent/favorite/reviewed food | `FastMealLogger` to `/api/meals/quick-log`, `/api/foods/log` |
| Legacy food | `/food-log`, `/api/meals/analyze`, existing supported offline adapters |
| Coach text/voice/workout OCR | `/coach` alias `/v2`, `/api/workouts/from-photo`, `/api/agent/process`, `log_workout`/`log_meal` tools |
| Coach meal photo | Direct `/api/meals/upload`, bypassing text tools |
| Planned completion | Coach completion API/RPC, shared presentation but preserved atomic boundary |
| Corrections | `/api/meals/[id]`, `/api/meals/refine`, agent `update_meal`/`update_workout`, dedicated completed-program amendment |

Extract parser-to-draft helpers and centralize authorization/provenance/receipt semantics at persistence. Inspect SQL storage of every field. Remove fixed .85/.9 confidence as authority. Retain label/catalog origin and estimate review semantics.

Implement drafts/revisions and commit/amend/status RPC/API paths from 5.1. Preserve frozen operation identity, owner, payload, event time and expected revision across reload/lost response. Account switches pause pending work. Correcting a workout must reconcile block scores and PRs, not leave stale records behind.

Inspect the existing meal offline queue: JSON-serialized `File` data is not recoverable bytes. For already-supported photo queuing, use account-scoped IndexedDB with explicit local transient-blob handling until upload/cancel, stable identity and truthful queued state. Legacy unusable entries require reselection, not blind replay. Do not enable the dormant workout queue (`Fitness-Tracker-ebu`) or add new offline workout capability in this scope. Do not claim unsynced entries are in canonical totals. No cloud image storage.

Acceptance: every route returns the shared receipt; explicit Log/recent meal stays quick; analysis-only writes no canonical data; estimates stay labeled after review; copying preserves origin; retries/corrections cannot duplicate; correction invalidates downstream data; photos remain transient; unsupported offline behavior is explicit.

### W3 — Goals, setup reuse and baseline confirmation

Implement 5.3 through intake/trust/UI/memory/readers. Change `complete-intake.ts`, `adaptive-plan.ts`, `programming-schema.ts`, `rolling-weekly-contracts.ts`, `rolling-weekly-api.ts`, Program components and profile/onboarding adapters. Use saved schedule/equipment/preferences; ask only missing/conflicting questions. Generic Mon/Wed/Fri and 60-minute defaults are not confirmed availability.

Test different outcomes within one domain versus equivalent wording; multiple outcomes/shared demands; process goals; unsupported capability; baseline ownership and protocol; correction/supersession; legacy read/execute; explicit direction acceptance. Confirm that different distances/protocols sharing a metric cannot share attainment evidence. No extra compulsory body-measurement form.

Acceptance: supported outcomes explain success, baseline status and comparable follow-up; no unrelated proxy can satisfy a goal; accepted plans remain unchanged.

### W4 — Factual history and shadow dose evidence

Implement 5.4 with audited pure modules and current preference semantics. Preserve source ownership and historical snapshots where required. Do not populate numerical coverage from raw sums.

Test canonical `exercises` with ranges, legacy `movements`, modified/stopped work, preparation/work, linked duplicates versus distinct sessions, revisions/deletion/supersession, units/unilateral conventions, partial/truncated retrieval, missing logging, database failure, changed restrictions/substitution and outside training.

Acceptance: each value resolves to source/time/basis; shadow context cannot affect compiled plans or prompts; factual familiarity affects only declared supported choices; numeric basis remains provisional where appropriate. Frozen-strategy replay proves compiler invariance, not live-model invariance.

### W5 — Reviewed initial numerical personalization

Read resolved `Fitness-Tracker-qsp` and frozen policy before selectable candidates. If unresolved, leave blocked and continue independent packages; do not repeatedly ask the same gate question.

Build pure versioned candidates with provisional/review-required/unsupported outcomes. Reconcile complete bundle, selected movement/equipment, preparation/work/rest time, exposures, competing goals and outside commitments. Update profile, schedule, composer, validator, basis disclosure and snapshot coherently. Activation stays off until W10 and authorized rollout.

Acceptance: qualifying counterfactual histories produce the reviewed differences; irrelevant/insufficient evidence does not; no range-to-exact conversion, unsupported load inference, arbitrary progression, silent clamp or accepted-plan mutation.

### W6 — Relevant weekly adjustments and truthful priority

Replace the generic selector and first-goal-only route behavior with 5.5. Audit bounded signal targeting/priority code. Changes still pass the existing action gate and full-plan validator. Record all per-goal results and rejected alternatives for audit, behind concise UI disclosure. Keep unreviewed numerical signal rules disabled; a safe targeting port does not include their activation.

Acceptance: bench evidence cannot change an unrelated first-sorted squat; the second same-domain goal can affect review while the first stays stable; one achieved goal cannot complete the whole event; shared-demand conflicts hold for review; broad ambiguous evidence requests a signal; single readiness does not change emphasis; proxy improvement without transfer follows specificity review; unchanged week remains valid; actual modifications override plan assumptions; mandatory order beats preference; current memory edits do not rewrite the active plan; disabled unreviewed signal policies cannot affect a proposed dose.

### W7 — Reliable next-action backend

Implement 5.6-5.7 and additive schema. Bind triggers to exact consumed tables/fields. Deterministic reasons/actions require no model calls. Filter unsupported legacy assertions from passive and Socius-specific context while preserving historical rows.

Acceptance: high adherence plus worse performance cannot create a positive link; stable low recovery or rising HRV cannot imply decline; partial-day/unreviewed logs cannot prove under-fueling; stale/disconnected/partially synced WHOOP cannot satisfy freshness; absent targets remain absent. Test every canonical write/correction/delete path, process death, lease takeover at the same revision, racing workers, dismissal during refresh, changed plan, policy/flag change without a source write, due follow-up on a superseded decision, date/timezone rollover, owner derivation and recursive trigger prevention. Do not close W7 against pre-W2/W3 schema or mocked-only route coverage.

Computation failures cannot fail a successful log. Required invalidation persistence failure must roll back its source transaction rather than silently permit stale guidance. Keep triggers to bounded updates and measure synthetic burst contention.

### W8 — One action and outcome loop

Proposed `app/components/NextActionCard.tsx` on Today; Coach reads the same decision ID/reasons. Keep plan/log access during failures. One action, short rationale, optional evidence and appropriate Done/Adjust/Not applicable/Defer controls; no mandatory daily questionnaire.

Persist shown/responses idempotently. Canonical corrections/coverage confirmations use their explicit endpoint; Done stays self-report. Carry origins through logs and evaluate eligible comparable outcomes, including unknown/noncomparable/overlap states. No causal claim or numeric adaptation from clicks.

Acceptance: 320px/390px/desktop, light/dark and keyboard; no repeated dismissed prompts; stale actions expire; account separation; deterministic fallback on LLM failure; truthful database unavailability; Done creates no phantom activity; log replay produces one record/link; corrections invalidate basis.

### W9 — Core integration and engineering verification

Run section 8 and quality gates after focused checks. Independent review covers ownership, acceptance authority, provenance, API/RPC compatibility and races. Resolve important findings and retest affected behavior. Inspect actual screenshots; DOM assertions alone are not visual QA.

Record exact source SHA/uncommitted patch identity, migration chain, fixture versions, results, screenshots and limits in proposed `docs/verification/data-to-personalized-coaching/acceptance.md`. Demonstrate a synthetic-user journey from capture to action to later observation, including correction and interrupted retry. State core-ready separately from numerical-ready.

### W10 — Numerical quality verification

Depends on W5/W9 and relevant diversified preparation in `Fitness-Tracker-f4k`. Reuse valid preparation, not exhausted paid allowances or previously inspected holdouts.

Judge actual compiled programs. Require zero authority/provenance/constraint violations and no unresolved important engineering findings. Qualified review approves supported prescription fit and counterfactual expectations. Record disagreements and unsupported classes. Missing review means unvalidated, not an internally chosen score that substitutes for review.

### W11 — Release preparation and authorized activation

Prepare exact migration order/checksums, compatibility floor, feature flags, preflight/readback, CI/browser evidence, scoped canary, rollback and failure thresholds. This packet can be completed without commit/push/deploy.

After explicit target authority, apply additive schema, deploy compatible readers/writers with numerical selection off, verify authorized canary, then enable capabilities incrementally. Numerical selection also requires W10. Read-only smoke checks must not submit real logs. Core release does not imply numerical completion.

## 7. Database, compatibility and rollback

One migration owner creates new timestamped files after current main. Never edit applied migrations. Mirror SQL documentation where maintained. Inspect actual RPC replacement order; the last migration wins.

Ordered slices:

1. Feedback v2 and conditional observations, compatible v1 replay/readers.
2. Canonical provenance, normalized drafts/revisions, revision/idempotency commit/amend transitions; existing request ledger remains authoritative.
3. Strict training-intent memory/correction, supported baseline adapter and versioned plan snapshots/readers.
4. Recommendation decisions/events/refresh and explicit coverage reports; triggers after source shapes stabilize.

W7's pure contracts can be designed in W0; its implementation/closure depends on stabilized W2/W3 and testing the W1-W3 migration chain. Auth determines owner; clients cannot publish authoritative evidence, recommendation decisions, observed outcomes or arbitrary cross-tenant refs. RPCs use narrow execute grants, fixed empty search paths, locks and payload-matched replay.

Execute real SQL with repository PGlite/local PostgreSQL harnesses. Test anonymous/authenticated grant boundaries, FORCE RLS, composite ownership, stale revisions, lease races and replay. SQL text matching is supplementary only.

No heuristic historical backfill of confirmation. Preserve old rows/receipts/plans. Version-dispatched readers ship before new writers. Once v2 feedback/new intent exists, rollback cannot go below the compatible-reader release; old normalizers could discard new records. Disable selection/presentation/new writers while preserving readable data, canonical saves, audits and accepted plans.

Proposed independent server flags: `CAPTURE_RECEIPTS_V2_ENABLED`, `COACH_TRAINING_INTENT_ENABLED`, `COACH_HISTORY_CONTEXT_ENABLED`, `COACH_INITIAL_DOSE_POLICY_ENABLED`, `COACH_TARGETED_REVIEW_ENABLED`, `RECOMMENDATIONS_ENABLED`. Default new capabilities off until schema/tests/readback pass. Clients consume server capabilities, not independent authority flags. Shadow evidence stays offline. Freeze final names in W0. Production configuration edits are outside current authorization.

## 8. Acceptance matrix and commands

| Area | Required evidence |
| --- | --- |
| Capture | All W2 routes; log versus analysis; origins and review preserved; optional unknown feedback; misread/correction; photo error; account change |
| Persistence | Lost response, changed-payload collision, stale correction, block failure, PR recompute, canonical link, source invalidation, local dates, supported offline behavior |
| Personalization | Relevant goal/history counterfactuals; irrelevant changes inert; multiple outcomes/shared demands; cold start versus outage; legacy execution; unchanged week valid |
| Evidence | Exact/range/unknown; legacy defaults; actual versus plan; preparation/work; missing versus zero; units/protocols; truncation; stale/corrected sources; goal versus proxy |
| Recommendations | All write paths; no unsupported links/trends; freshness/completeness; one action; abstention; deterministic fallback; suppression; response versus observed outcome |
| Races | Two tabs, concurrent logs/sync, worker death, expired lease, stale publish, plan change, midnight/timezone shift, delete invalidation |
| Security | Unauthenticated and cross-user IDs; RLS/FORCE RLS/RPC grants; untrusted inputs; no model-authored evidence or acceptance |
| UX | 320px/390px/desktop light/dark, keyboard, 44px/16px, truthful states, rendered screenshots, no duplicate mandatory entry |
| Quality | Separate development/holdout; no capability overclaim; independent engineering review; qualified numerical-policy review; synthetic/live labeling |

Verified baseline paths below exist in the release worktree. Extend them with new feature tests. Run from the isolated worktree and exclude nested worktrees.

```powershell
npm test -- --root . --exclude '**/.worktrees/**' test/program/today-session-card.test.tsx test/coach/today-session.test.ts
npm test -- --root . --exclude '**/.worktrees/**' test/coach/complete-intake.test.ts test/coach/adaptive-plan.test.ts test/coach/exercise-preferences.test.ts test/coach/weekly-review.test.ts test/coach/rolling-weekly-plan.test.ts
npm test -- --root . --exclude '**/.worktrees/**' test/agents/socius-background.test.ts test/agents/socius-background.property.test.ts
npm test -- --root . --exclude '**/.worktrees/**' test/database/logging.test.ts test/database/weekly.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
npm run lint
npm run build
npm run test:browser
git diff --check
```

At W9, also run `npm test -- --root . --exclude '**/.worktrees/**'` and new executable migration/RLS/race tests. Read verification scripts before execution; names do not prove local targeting. No production credentials in local tests.

Use Node 24 and the lockfile. Current source uses Next 15, React 19 and Vitest 4; old overview docs list older testing versions. Install existing locked dependencies if absent; do not upgrade them. Browser config uses port 3010 with synthetic Supabase settings/intercepted services. Verify any reused server belongs to this worktree.

Proposed tests: `test/capture/`, `test/recommendations/`, coach `planning-intent.test.ts`, `planning-context.test.ts`, `performed-dose-evidence.test.ts`, `initial-dose-policy.test.ts`, `targeted-review.test.ts`, API/migration tests and `e2e/personalized-coaching.pw.ts`. Test behavior rather than copying constants. Retain existing `e2e/coach-logging.pw.ts` coverage.

Product measurements with denominators: correct-log completion time; correction rate by input/origin; explicit feedback per eligible completion; supported goals with confirmed outcome/baseline status; proposals using relevant evidence; shown recommendations per eligible visit alongside abstentions; useful/not-applicable responses; matched follow-up coverage; comparable direct outcome trends. Clicks do not prove recommendation quality or causal benefit. No raw athlete text in analytics; no new analytics vendor.

## 9. Session completion and failure handling

Update Beads with actual evidence; close each package only after its acceptance passes. Update the matching handoff with worktree, changed files, migrations, checks, flags and next ready package. Record outstanding policy/release dependencies. Keep this plan stable except for evidence-backed amendments; Beads owns live status.

Track failed attempts by blocker/acceptance check. Follow project `docs/GUARDRAILS.md`, otherwise installed COS guidance: reassess after two substantive failures; stop that blocker after three, preserve cumulative counts, prepare a revised method and continue independent work. Changing agents/sessions does not reset counts.

Final engineering handoff: reviewable diff, executable tests/migration evidence, visible product flows, exact unresolved dependencies and release packet. Never claim production rollout or qualified validation that did not occur.
