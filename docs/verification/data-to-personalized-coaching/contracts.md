# Frozen implementation contracts

Revision 1, 2026-09-17; base `61d04df9dad3dfe88a9594fff28be06a72899741`. The [plan](../../plans/data-to-personalized-coaching.md) controls scope, Beads controls status. Update consumers together for evidence-backed amendments.

## Versions and flags

Existing atomic completion envelope remains `contractVersion: 2`; feedback independently adds `feedbackVersion: 2`. Absent discriminator uses original v1 validation/replay. New nullable sessionRpe/energy/pain record per-field reported/unknown provenance, derived by the server from validated supplied values. Fractional RPE remains fractional in typed observations; a legacy integer projection is null if unrepresentable. Only explicit valid session RPE generates a session-RPE observation. Hardest-set effort remains separately scoped. Legacy values of unprovable explicitness are legacy_unknown; known concerning pain remains a safety signal.

API `feedback.feedbackVersion: 2` maps to persisted `p_feedback.schemaVersion: 2` and retains `feedbackVersion: 2`. Stored readers dispatch from schemaVersion; unknown/conflicting discriminators fail. V1 uses its original schemaVersion 1 payload with no added provenance keys, preserving the JSON used by completionRequest replay equality. V2 RPC provenance records source check-in ID and revision plus explicit field origin/review metadata; consumers verify these bindings rather than trusting verification_status alone. V2 from the non-atomic endpoint must route through a compatible versioned transition or be rejected explicitly, never downgraded to v1.

Capture receipt schema 2 extends old responses. Confirmed `training_intent` starts at version 1, embedded as an optional versioned plan snapshot with legacy decoders preserved. Weekly multi-goal review adds versioned `goalReviews`, retaining old inputs/readers. Recommendation schema/rule/policy versions start at 1; legacy insights are never promoted.

Exact server flags, all default false: `CAPTURE_RECEIPTS_V2_ENABLED`, `COACH_TRAINING_INTENT_ENABLED`, `COACH_HISTORY_CONTEXT_ENABLED`, `COACH_INITIAL_DOSE_POLICY_ENABLED`, `COACH_TARGETED_REVIEW_ENABLED`, `RECOMMENDATIONS_ENABLED`. Client capabilities derive from the server. Initial-dose eligibility additionally needs frozen qualified policy and W10; experimental numerical signal policies remain excluded. Compatible readers stay available when writers are disabled.

## Capture

`app/lib/capture/contracts.ts` owns origin/review/quantity/receipt types; `service.ts` adapts existing `app/lib/logging/server.ts`; `corrections.ts` owns revision-aware amendments. Origins: athlete_reported, model_estimated, copied_template, imported_unverified, legacy_unknown. Reviews: unreviewed, athlete_confirmed, corrected. Quantities remain exact, bounded or unknown with source field references. Confirmation never converts estimates to measurements.

Existing logging requests own parent identity. Before any multi-activity mutation, server-authorized normalized occurrences freeze into owned `logging_request_items` with child ID, source-item identity, kind, fingerprint and status. Models resolve an existing child and cannot append activities. Distinct intended identical occurrences have distinct source-item IDs. Per-child atomic commits produce a receipt bundle and legacy entities projection; partial successes remain visible and committed children are never regenerated.

Owner-scoped `GET /api/logging/requests/[id]` reconciles uncertain writes. The client retains original owner/payload/time/request/child/recommendation origin across timeout/reload. Edited uncertain input reconciles before new identity: amend a saved entity/revision or retry a confirmed no-write operation. Account switches pause pending work. A separately intended occurrence requires a new logging action.

`activity_drafts` holds bounded normalized proposals/status/expiry; expiry excludes without deleting work. `activity_revisions` holds append-only amendment snapshots/provenance. Canonical meals/workouts remain authoritative. RPCs enforce owner, expected revision, payload replay, deterministic totals, block scores and PR recalculation. Dedicated execution amendments preserve prescribed-session links and original feedback/observations; ordinary agent UPDATE cannot bypass runner protection. No cloud/raw media persistence.

## Intent and history

`planning-intent.ts` validates confirmed outcome IDs, priority, metric/unit/protocol/context, baseline source/status and explicit unsupported capability. `planning-context.ts` composes bounded owned evidence separately from agent programming context. Saved goals/schedule/equipment/preferences prefill confirmation; generic defaults are unconfirmed. Full movement/distance/equipment/variation bindings define comparability. Direction edits create proposals; acceptance remains separate.

Concrete `PlanningIntentV1` content uses the existing TrainingGoal object without bumping its shared schema constant:

```typescript
interface PlanningIntentV1 {
  schemaVersion: 1
  outcomes: Array<{
    goal: TrainingGoal
    domain: CoachProgramDomainId | null
    measurement: {
      metricId: PerformanceMetricId
      unit: MetricUnit
      assessmentDefinition: { id: string; version: string }
      protocol: { id: string; version: string }
    } | null
    binding: {
      movementId: string | null
      distance: { value: number; unit: 'm' | 'km' | 'mi' } | null
      equipmentIds: MovementEquipmentId[]
      variation: string | null
    }
    baseline: { status: 'unknown' } | { status: 'referenced'; observationId: string }
    capability: { status: 'supported' } | { status: 'unsupported'; reason: string }
  }>
  priorityOrder: string[] | null
  event: { name: string; goalIds: string[]; date: string | null } | null
  confirmedAt: string
}
```

Bound outcomes to 1–8, unique stable goal IDs, statement 5–500 characters and existing enum/unit/protocol catalogs. Unknown keys fail recursively. PriorityOrder is null when unspecified or contains every outcome ID exactly once in explicitly confirmed order; it does not derive from array order. Event goal IDs are a unique subset; event name is 1–160 characters. Equipment arrays are unique catalog IDs; variation is null or 1–160 characters. Target-less process/exploratory goals remain representable with goal.kind process/skill; unsupported domain/measurement remains visible without executable prescription claims. API/RPC verifies referenced baseline ownership/status/protocol/binding; a reference is not an assertion of comparability. Unsupported capability is recomputed/checked by server catalog policy, never trusted from client. Use authenticated owner and server confirmation time; do not accept client owner, verification or arbitrary evidence. Exact JSON and memory version are snapshotted in proposals, never read retroactively into accepted plans. Equivalent wording with identical binding/target is semantically unchanged; changing distance/movement/equipment/variation cannot share attainment. W3 may make a documented type-equivalent substitution when current catalog requires it, updating TS and SQL together.

History normalizes canonical blocks.exercises and legacy blocks.movements, preserves ranges/source paths, deduplicates links only and reports truncation/outage separately from no history. As-of replay needs snapshots for edited rows. Familiarity does not prove proficiency or tolerance. Shadow dose comparison is offline, excluded from prompts and numerical compiler inputs pending qualified gates.

Weekly review evaluates all confirmed goals with included/excluded evidence and aggregates under safety then explicit priority/shared-demand compatibility. Stable IDs break presentation ties only. Ambiguous transfer, priority or conflicts request a signal/review; bench evidence cannot change an unrelated sorted squat. At most one existing-policy bounded change passes full-plan validation. No experimental numerical eligibility thresholds are imported.

## Recommendation decisions and concurrency

Outcome measurement is independent of numerical target: supported measurable outcomes require metric/unit/catalog protocol even with target null. Process or unsupported outcomes may omit measurement; if a numerical target exists, it must match measurement metric/unit/definition/protocol. Domain defaults cannot fill this binding.

Three engineering rules cover four plan action families: accepted_plan covers execution and authoritative proposal/review navigation; missing_signal collects a defined measurement; logged_nutrition describes remaining logged intake against explicit targets. Rank safety/review, time-sensitive plan, decision-changing signal, then optional nutrition; use explicit goal priority then stable rule ID.

Decisions carry action/collect_signal/abstain, typed destination, goal/accepted-plan refs, dated source IDs/minimal snapshots, reasons/missingness, source fingerprint/revision, response revision, local date/timezone, validity deadline, policy/capability fingerprint and optional comparable outcome specification. No confidence percentages, unsupported nutrition-performance links or trend claims. Sync time never replaces measurement date. Partial sync is unavailable unless a coherent completed snapshot exists.

`recommendations` stores immutable decisions plus controlled active/superseded/expired/withdrawn lifecycle. `recommendation_events` stores shown/response/outcome events. Done is self-report only, never activity/coverage/preference. Response RPCs atomically suppress/defer and increment response revision. Shown needs display acknowledgement. Superseded decisions may receive bounded follow-up while hidden; corrections/withdrawals constrain outcome interpretation.

`recommendation_refresh_state` coalesces per-owner source revision. Transactional triggers cover meaningful consumed fields on meals/workouts/children, check-ins, observations/status, intent/preferences/constraints/targets, accepted plans/reviews, coverage and WHOOP measurements/sync. Required invalidation failure rolls back the source write. Derived events never recursively dirty inputs.

Claim returns expiring random lease token and source/response revisions. Publish compares current unexpired token, both revisions, active plan/intent, current server policy/capability and local-time validity. Lease takeover fences old workers at unchanged revision. Reads check expiry/defer/follow-up deadlines, midnight/timezone and version changes without source writes. One bounded refresh per interaction; computation failure cannot reverse successful logging. No-LLM deterministic fallback is supported; database unavailability stays explicit.

## Migration and acceptance

Lead coordinates new timestamped files after the actual maximum migration: feedback; capture/revisions/children; intent/baselines; recommendations/coverage/triggers. Never edit applied SQL. Mirror under docs/migrations where maintained. New user tables have RLS/FORCE RLS, same-owner composite references, restricted grants and account-deletion coverage. Definer RPCs use empty search_path, locks and payload-matched replay.

Execute repository PGlite/PostgreSQL tests for legacy/new replay, fractional RPE, anonymous/cross-owner denial, revisions, all-source invalidation and lease races. W7 closes only after integrated W1–W3 shapes. Inspect UI screenshots at 320px/390px/desktop in both themes and keyboard behavior. Synthetic evidence is not live athlete or qualified coaching validation. W9/W11 retain full-suite/release requirements.
