import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineeringRule, FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { runningOutcome, intent } from '../fixtures/personalized-coaching/intent'
import { fetchRecommendationContext, recommendationScope } from '@/app/lib/recommendations/context'
import { evaluateRules } from '@/app/lib/recommendations/rules'
import { rankCandidates } from '@/app/lib/recommendations/rank'
import type { RecommendationDecision, RefreshClaim } from '@/app/lib/recommendations/contracts'
import { localDateToUTCStart } from '@/app/lib/timezone-utils'
import { validatePlanningIntent, type PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { validateCoachSessionCheckinInput, validateStoredCoachSessionCheckin, hasExplicitFeedback, reportedFeedbackProvenance } from '@/app/lib/coach/execution-feedback'
import { normalizePerformedDoseEvidence } from '@/app/lib/coach/performed-dose-evidence'
import { canSurfaceLegacyInsight } from '@/app/lib/agents/legacy-insight-guard'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { executeWeeklyFixture } from './engineering-weekly-adapter'
import { executeEngineeringLifecycleFacts } from '../database/engineering-lifecycle'
import { executeEffortScope, executeHistoricalSource, materializeBoundBaselines } from './engineering-source-adapter'
import { isWhoopSyncEligible } from '@/app/lib/agents/whoop-context-eligibility'
import { captureProvenance, type CaptureOrigin, type CaptureReviewState } from '@/app/lib/capture/contracts'
import { executeEngineeringBoundaryFacts } from '../database/engineering-boundaries'

export const ENGINEERING_ADAPTER_VERSION = 'engineering-runtime-adapter-2-consumed'
type Row = Record<string, any>
type Facts = Record<string, FixtureValue>
export interface EngineeringActual {
  decision: RecommendationDecision['kind'] | null
  recommendation: RecommendationDecision | null
  state: 'ready' | 'unavailable' | 'pending' | 'unsupported_adapter'
  unsupported: string[]
  predicates: Record<string, unknown>
  sourceQueries: Array<{ table: string; ownerScoped: boolean }>
  sourceRecordsUnchanged: boolean | null
  limitations: string[]
}

/** This adapter models query mechanics, not RLS. The real SQL journey owns grant,
 * transaction, invalidation, replay and race guarantees. No expected label enters it. */
function canonicalReader(tables: Record<string, Row[]>, unavailableTable?: string, truncatedTable?: string) {
  const queries: EngineeringActual['sourceQueries'] = []
  const db = { from(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let bound = Infinity, order: { field: string; ascending: boolean } | null = null
    const query = { table, ownerScoped: false }; queries.push(query)
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => { if (key === 'user_id') query.ownerScoped = true; filters.push(row => row[key] === value); return chain },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain },
      gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return chain },
      lte: (key: string, value: string) => { filters.push(row => row[key] <= value); return chain },
      order: (field: string, options?: { ascending?: boolean }) => { order = { field, ascending: options?.ascending !== false }; return chain },
      limit: (value: number) => { bound = value; return chain },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        let data = structuredClone((tables[table] ?? []).filter(row => filters.every(filter => filter(row))))
        if (order) { const sort = order; data.sort((a, b) => String(a[sort.field]).localeCompare(String(b[sort.field])) * (sort.ascending ? 1 : -1)) }
        data = data.slice(0, bound)
        if (table === truncatedTable) data = Array.from({ length: bound }, () => data[0] ?? {})
        return Promise.resolve({ data: table === unavailableTable ? null : data, error: table === unavailableTable ? { code: 'synthetic_outage' } : null }).then(resolve, reject)
      },
    }
    return chain
  } } as unknown as SupabaseClient
  return { db, queries }
}

const text = (facts: Facts, field: string, fallback?: string) => typeof facts[field] === 'string' ? facts[field] as string : fallback
function uuid(value: string) { const h = createHash('sha256').update(value).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}` }
// An unseen schema fact must not silently disappear when the heldout is opened.
const SUPPORTED_FACT_KEYS = new Set(`requestOwner evidenceOwner agentOffsetMinutes localDate nowUtc localHour metric explicitFieldProvenance value verificationStatus quantity observationId sourceField exactQuantityRequired sharedDemandConflict signalScope photoPersistence currentCalculationRevision mealRevision planId planStatus sessionId sessionDate sessionStatus canonicalWorkoutId reviewState reviewId reviewBasisPlanId existingSafetyReview painOrigin snapshotMovement snapshotPreferenceVersion currentPreferenceVersion confirmedGoalId originRequestId response namedSafetyOverride retrieval pain energy sessionRpe knownConcerningPain protocol goalProtocol capability goalId athleteWording baselineStatus measurementId measurementProtocol goalConfirmed measurementOrigin collectionChangesDecision observationRole proxyTrend directOutcomeStatus existingMeasurementKnown goalIds goalsConfirmed priorityConfirmed firstGoalAttained signalMovement assignmentMovements transferMapping targetId targetConfirmed targetCalories canonicalCalories loggedCalories mealIds mealId origin proteinLogged coverage coverageRevision strain monthlyAdherencePercent performanceTrend workoutsCount recoverySamples hrvSamplesMs whoopMeasurementDate whoopSyncedAt whoopConnection queuedEstimatedCalories requestId`.split(' '))
for (const key of `requestedMode asOfRevision currentRevision snapshotAvailable firstGoalBaseline secondGoalBaseline goalPriority goalDistancesMeters requestedEquipment observedEquipment transferPolicy unit movementId repetitions effortScope requestedScope mealOrigin templateCompositionOrigin compositionReview occurrenceConfirmed whoopSyncStatus coherentCompletedSnapshot recoveryDate strainDate hrvDirection`.split(' ')) SUPPORTED_FACT_KEYS.add(key)

/** Ordinary orthogonal fixture defaults: a noon local read on 2026-09-17, UTC-5;
 * existing accepted plan when planStatus is omitted; scheduled today when omitted;
 * all unspecified retrievals complete. No target or training goal is defaulted. */
export async function executeEngineeringFacts(rule: EngineeringRule, athlete: string, facts: Facts): Promise<EngineeringActual> {
  const owner = uuid(text(facts, 'requestOwner', athlete)!)
  const rawOffset = -Number(facts.agentOffsetMinutes ?? -300)
  const localDate = text(facts, 'localDate', '2026-09-17')!
  const now = text(facts, 'nowUtc', new Date(Date.parse(localDateToUTCStart(localDate, rawOffset)) + Number(facts.localHour ?? 12) * 3_600_000).toISOString())!
  const scope = recommendationScope(rawOffset, now)
  const tables: Record<string, Row[]> = {}
  const add = (table: string, row: Row) => {
    // Saved nutrition targets belong to the requesting athlete; other materialized
    // evidence can explicitly belong to a different athlete and must be filtered.
    const sourceOwner = table === 'daily_targets' ? owner : uuid(text(facts, 'evidenceOwner', text(facts, 'requestOwner', athlete))!)
    const source = table === 'performance_observation_groups' ? { ...row, verification_status: text(facts, 'verificationStatus', row.verification_status),
      ...(row.metadata ? { metadata: { ...row.metadata, origin: text(facts, 'measurementOrigin', row.metadata.origin) } } : {}) } : row
    ;(tables[table] ??= []).push({ user_id: sourceOwner, ...source })
  }
  const actual: EngineeringActual = { decision: null, recommendation: null, state: 'ready', unsupported: [], predicates: {
    numericPolicyEligible: personalizedCoachingCapabilities().initialDosePolicy,
    retiredNutritionPerformance: !canSurfaceLegacyInsight({ pattern_id: 'NUT_PERF' }),
    retiredHrvTrend: !canSurfaceLegacyInsight({ pattern_id: 'HRV_TREND' }),
  }, sourceQueries: [], sourceRecordsUnchanged: true,
  limitations: ['Read/pure application execution does not replace real SQL/RLS, canonical replay, publication races, or browser verification.'] }
  const unsupported = (reason: string) => { actual.state = 'unsupported_adapter'; actual.unsupported.push(reason); return actual }
  if (['workerLeaseToken', 'currentResponseRevision', 'capturedCapabilitiesVersion', 'lifecycle', 'authorizedChildIds', 'decisionLocalDate'].some(key => key in facts)) {
    try {
      const boundary = await executeEngineeringBoundaryFacts(rule, athlete, facts)
      return { ...actual, decision: boundary.decision, recommendation: boundary.recommendation, state: boundary.state, sourceRecordsUnchanged: null,
        predicates: { ...actual.predicates, canonicalBoundary: boundary }, limitations: boundary.limitations }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unsupported boundary facts:')) return unsupported(error.message)
      throw error
    }
  }
  const unknownKeys = Object.keys(facts).filter(key => !SUPPORTED_FACT_KEYS.has(key))
  if (unknownKeys.length) return unsupported(`Unmapped material fixture facts: ${unknownKeys.join(', ')}`)

  if (facts.requestedMode === 'historical_replay') {
    actual.predicates.historicalSource = executeHistoricalSource(facts, owner)
    return unsupported('Historical snapshot selection executes and is read-only. This fixture has no persisted review or historical advice API identity; the source selector does not return a recommendation decision. No abstain action is fabricated.')
  }
  if (facts.effortScope) {
    actual.predicates.effortScope = executeEffortScope(facts, now)
    return unsupported('Hardest-set and session effort validators execute separately with fractional values. No complete existing protocol/series/decision gate is supplied to authorize the conditional session-effort solicitation.')
  }

  // Run the actual source predicates even when a solicitation policy is not exposed.
  if (facts.metric === 'session.rpe') {
    const explicit = facts.explicitFieldProvenance === 'feedback_v2_athlete_reported'
    const feedback = { schemaVersion: explicit ? 2 : 1, outcome: 'as_planned', sessionRpe: facts.value, energy: explicit ? null : 'okay', pain: explicit ? null : 'none', note: null,
      ...(explicit ? { feedbackVersion: 2, feedbackProvenance: { checkinId: uuid('checkin'), revision: 1 }, provenance: reportedFeedbackProvenance({ sessionRpe: Number(facts.value), energy: null, pain: null }) } : {}) }
    const parsed = validateStoredCoachSessionCheckin(feedback, now, uuid('checkin'))
    actual.predicates.feedbackAccepted = parsed.ok
    actual.predicates.sessionRpeExplicit = parsed.ok && hasExplicitFeedback(parsed.value, 'sessionRpe')
    actual.predicates.hardestSetEffort = null
    return unsupported('The explicit-effort predicate is executed, but this fixture supplies no complete supported weekly-review protocol/input that authorizes an RPE solicitation. No request is invented.')
  }
  if (facts.quantity && typeof facts.quantity === 'object' && !Array.isArray(facts.quantity)) {
    const q = facts.quantity as Row
    const reps = q.kind === 'exact' ? q.value : { min: q.minimum, max: q.maximum }
    const evidence = normalizePerformedDoseEvidence({ userId: owner, asOf: now, startsOn: scope.localDate, endsOn: scope.localDate, retrievalComplete: true, athleteCoverage: 'unknown', completions: [],
      workouts: [{ id: text(facts, 'observationId', 'quantity-source')!, user_id: owner, workout_date: scope.localDate, created_at: now, captured_at: now,
        blocks: [{ role: 'priority_adaptation', exercises: [{ movementId: 'pull_up', dose: { kind: 'sets_reps', sets: 1, repetitions: reps } }] }] }] })
    actual.predicates.performedQuantity = evidence.exposures[0]?.repetitions ?? null
    actual.predicates.numericPolicyEligible = evidence.numericPolicyEligible
    return unsupported('Range/exact preservation runs the offline production normalizer. No reviewed exact-repetition solicitation gate is supplied; shadow evidence cannot authorize one.')
  }
  const baselines = materializeBoundBaselines(facts, owner, now, uuid, add)
  if (baselines) actual.predicates.boundBaselines = baselines
  const weekly = !baselines && (Array.isArray(facts.goalIds) || facts.signalScope === 'broad_unmapped') ? executeWeeklyFixture(facts, owner) : null
  if (weekly) {
    if (weekly.review.status !== 'ready') return unsupported('The real weekly review did not become ready under the invariant scaffold')
    actual.predicates.weeklyReview = weekly.review
    actual.predicates.acceptedPlanUnchanged = weekly.planUnchanged
    actual.limitations.push('W6 review uses the documented invariant accepted-plan/series scaffold in engineering-weekly-adapter.ts; no review action or eligibility is supplied from expected labels.')
    add('training_programs', { id: weekly.programId, active_plan_version_id: weekly.planId, status: 'active' })
    add('training_plan_versions', { id: weekly.planId, status: 'accepted', policy_version: 'existing-accepted-policy' })
    add('coach_weekly_reviews', { id: `${athlete}:review`, base_plan_version_id: weekly.planId, action: weekly.review.action, created_at: now, supersedes_review_id: null })
  }
  if (typeof facts.currentCalculationRevision === 'number' || facts.photoPersistence) {
    try {
      const lifecycle = await executeEngineeringLifecycleFacts(rule, athlete, facts)
      return { ...actual, decision: lifecycle.decision, recommendation: lifecycle.recommendation, state: lifecycle.state,
        // Canonical lifecycle deliberately creates/amends synthetic records.
        sourceRecordsUnchanged: null, predicates: { ...actual.predicates, canonicalLifecycle: lifecycle }, limitations: lifecycle.limitations }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unsupported boundary facts:')) return unsupported(error.message)
      throw error
    }
  }

  if (facts.planId) {
    const planId = text(facts, 'planId')!
    add('training_programs', { id: uuid(`program:${planId}`), active_plan_version_id: planId, status: 'active' })
    add('training_plan_versions', { id: planId, status: text(facts, 'planStatus', 'accepted'), policy_version: 'existing-accepted-policy', prescription: { movement: facts.snapshotMovement ?? null, preferenceVersion: facts.snapshotPreferenceVersion ?? null } })
    if (facts.sessionId) add('prescribed_sessions', { id: facts.sessionId, plan_version_id: planId, scheduled_date: text(facts, 'sessionDate', scope.localDate), status: text(facts, 'sessionStatus', 'planned'), completed_workout_id: facts.canonicalWorkoutId ?? null, updated_at: now })
    if (facts.reviewState === 'proposal_ready') add('adaptation_proposals', { id: facts.reviewId, base_plan_version_id: facts.reviewBasisPlanId, status: 'proposed', created_at: now })
    if (facts.existingSafetyReview === 'pause_and_seek_support') {
      const explicit = facts.painOrigin === 'athlete_reported'
      add('coach_checkins', { id: uuid('concerning-checkin'), plan_version_id: planId, occurred_at: now,
        responses: { schemaVersion: explicit ? 2 : 1, outcome: 'as_planned', sessionRpe: explicit ? null : 7, energy: explicit ? null : 'okay', pain: 'concerning', note: null,
          ...(explicit ? { feedbackVersion: 2, feedbackProvenance: { checkinId: uuid('concerning-checkin'), revision: 1 }, provenance: reportedFeedbackProvenance({ sessionRpe: null, energy: null, pain: 'concerning' }) } : {}) } })
    }
  }

  if (rule === 'missing_signal' && !weekly && !baselines) {
    if ('pain' in facts) {
      const parsed = validateCoachSessionCheckinInput({ feedbackVersion: 2, outcome: 'as_planned', sessionRpe: facts.sessionRpe, energy: facts.energy, pain: facts.pain, note: null, occurredAt: now })
      actual.predicates.feedbackAccepted = parsed.ok
      if (parsed.ok) actual.predicates.feedback = { sessionRpe: parsed.value.sessionRpe, energy: parsed.value.energy, pain: parsed.value.pain, explicitPain: hasExplicitFeedback(parsed.value, 'pain') }
      // No plan/measurement was provided: there is no defined decision-changing gap.
    } else if (facts.retrieval !== 'failed' && facts.retrieval !== 'truncated') {
      const protocol = text(facts, 'protocol', text(facts, 'goalProtocol'))
      let outcome: PlanningOutcome
      if (facts.capability === 'unsupported') {
        outcome = runningOutcome(text(facts, 'goalId', 'goal:unsupported'))
        outcome.goal.statement = text(facts, 'athleteWording', 'Unsupported athlete outcome')!
        outcome.domain = null; outcome.measurement = null; outcome.binding = { movementId: null, distance: null, equipmentIds: [], variation: null }
        outcome.capability = { status: 'unsupported', reason: 'No installed assessment adapter for this outcome' }
      } else if (protocol === 'run_5000m_track_elapsed_seconds') outcome = runningOutcome(text(facts, 'goalId', 'goal:run'))
      else if (protocol === 'sprint_100m_electronic_seconds') {
        outcome = runningOutcome(text(facts, 'goalId', 'goal:sprint'), 100)
        const definition = findAssessmentDefinition('sprint.time')!
        outcome.domain = 'speed_agility'; outcome.goal.requiredQualityIds = ['max_velocity']
        outcome.goal.statement = 'Improve electronically timed 100 meter sprint'
        outcome.measurement = { metricId: definition.primaryMetricId, unit: 's', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
        outcome.binding.assessmentContext = { repetitions: null, externalLoad: null, duration: null, techniqueModifiers: ['electronic_timing'], environmentModifiers: [] }
        // A proxy source is present, but cannot become a referenced direct baseline.
        add('performance_observation_groups', { id: facts.observationId, status: 'complete', verification_status: 'athlete_confirmed', semantic_role: facts.observationRole, metadata: { proxyTrend: facts.proxyTrend } })
      }
      else return unsupported(`No explicit installed protocol mapping for ${protocol ?? 'unspecified measurement'}.`)
      const referenced = facts.baselineStatus === 'confirmed_comparable' || Boolean(facts.measurementId)
      if (referenced && outcome.measurement) {
        const id = uuid(text(facts, 'measurementId', `${athlete}:baseline`)!)
        outcome.baseline = { status: 'referenced', observationId: id }
        const distance = facts.measurementProtocol === 'run_1609m_track_elapsed_seconds' ? 1609 : outcome.binding.distance?.value
        add('performance_observation_groups', { id, status: 'complete', verification_status: 'athlete_confirmed', verified_by: owner, source_kind: 'manual', source_system: 'sociusfit_training_baseline', observed_at: now,
          assessment_definition_id: outcome.measurement.assessmentDefinition.id, protocol_version: outcome.measurement.protocol.version,
          metadata: { origin: 'athlete_reported', assessmentDefinitionVersion: outcome.measurement.assessmentDefinition.version, protocolId: outcome.measurement.protocol.id },
          comparison_modifiers: { movementId: null, variationId: null, distance: { value: distance, unit: 'm' }, equipmentIds: ['track'], repetitions: null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } })
        add('performance_observation_values', { id: uuid(`${id}:value`), group_id: id, status: 'complete', semantic_role: 'direct_outcome', metric_id: outcome.measurement.metricId, unit: outcome.measurement.unit, value_numeric: 1500 })
      }
      if (facts.goalConfirmed === true) {
        const content = intent(outcome); content.confirmedAt = now; content.outcomes.forEach(o => o.goal.source.confirmedAt = now)
        const parsed = validatePlanningIntent(content)
        if (!parsed.ok) return unsupported(`Canonical goal materialization rejected: ${parsed.errors.join('; ')}`)
        add('coach_memories', { id: uuid(`${athlete}:intent`), version: 1, memory_key: 'training_intent', status: 'confirmed', content: parsed.value })
      }
    }
  }
  if (rule === 'logged_nutrition') {
    if (facts.whoopSyncStatus) {
      actual.predicates.whoopEligible = isWhoopSyncEligible(true, { status: facts.whoopSyncStatus, last_sync_at: typeof facts.coherentCompletedSnapshot === 'string' ? facts.coherentCompletedSnapshot : null, error_message: null }, Date.parse(now))
      actual.limitations.push('WHOOP uses its actual sync eligibility predicate; the recommendation reader/rules have no wearable input or trend policy. Full passive-context synchronization races are separately tested.')
    }
    // Required unrelated stored macro fields are explicit zero fixture values;
    // no macro goal or logged protein is inferred from calories.
    if (facts.targetConfirmed === true && typeof facts.targetCalories === 'number') add('daily_targets', { target_protein: 0, target_carbs: 0, target_fat: 0, target_calories: facts.targetCalories, updated_at: now })
    const calorieTotal = facts.canonicalCalories ?? facts.loggedCalories
    if (typeof calorieTotal === 'number') {
      const ids = Array.isArray(facts.mealIds) ? facts.mealIds as string[] : [text(facts, 'mealId', `${athlete}:meal`)!]
      const provenance = captureProvenance('meal', text(facts, 'templateCompositionOrigin', text(facts, 'origin', 'athlete_reported')) as CaptureOrigin,
        text(facts, 'compositionReview', text(facts, 'reviewState', 'athlete_confirmed')) as CaptureReviewState, facts.mealOrigin === 'copied_template' ? [`meal:${athlete}:template:revision:1`] : [])
      if (facts.occurrenceConfirmed === false) provenance.occurrence.reviewState = 'unreviewed'
      if (facts.mealOrigin) actual.predicates.copyProvenance = provenance
      for (const id of ids) add('meals', { id, user_id: uuid(text(facts, 'evidenceOwner', text(facts, 'requestOwner', athlete))!), meal_timestamp: now,
        capture_revision: Number(facts.mealRevision ?? 1), capture_provenance: provenance,
        total_protein: Number(facts.proteinLogged ?? 0) / ids.length, total_carbs: 0, total_fat: 0, total_calories: calorieTotal / ids.length })
    }
  }
  const before = JSON.stringify(tables)
  const input = canonicalReader(tables, facts.retrieval === 'failed' ? 'training_programs' : undefined, facts.retrieval === 'truncated' ? 'training_programs' : undefined)
  actual.sourceQueries = input.queries
  const memory = tables.coach_memories?.[0]
  const claim: RefreshClaim = { leaseToken: 'adapter-read-only', leaseExpiresAt: scope.validUntil, sourceRevision: 1, responseRevision: 0,
    activePlanId: weekly?.planId ?? text(facts, 'planId') ?? null, intentMemoryId: memory?.id ?? null, intentVersion: memory?.version ?? null }
  try {
    const context = await fetchRecommendationContext(input.db, owner, claim, scope)
    if (typeof facts.coverage === 'string' && facts.coverage !== 'unknown') {
      const hour = facts.coverage.match(/(\d{2}):(\d{2})/)
      if (!hour) return unsupported(`Unsupported coverage encoding ${facts.coverage}`)
      context.nutrition.coverage = { id: `${athlete}:coverage`, through: new Date(Date.parse(localDateToUTCStart(scope.localDate, rawOffset)) + Number(hour[1]) * 3_600_000 + Number(hour[2]) * 60_000).toISOString(),
        status: facts.coverage.startsWith('complete') ? 'complete_through' : 'partial', sourceRevision: Number(facts.coverageRevision ?? 1), valid: true }
      actual.limitations.push('Coverage fixture is a persisted report projection; real SQL tests separately verify revision binding.')
    }
    const family = evaluateRules(context).filter(c => c.decision.ruleId.startsWith(`${rule}.`) || (weekly && c.decision.ruleId === 'accepted_plan.review'))
    const suppressions = facts.response ? family.map(c => ({ scope_key: c.decision.scopeKey, evidence_fingerprint: c.decision.evidenceFingerprint,
      response: facts.response as 'not_applicable' | 'done_reported', defer_until: null })) : []
    const selected = rankCandidates(family, suppressions, now)[0]?.decision ?? null
    actual.recommendation = selected
    actual.decision = selected?.kind ?? 'abstain'
    actual.predicates.targetPresent = context.nutrition.target !== null
    actual.predicates.loggedCalories = context.nutrition.meals.reduce((sum, meal) => sum + meal.calories, 0)
    actual.predicates.includedMealIds = context.nutrition.meals.map(meal => meal.id)
    actual.predicates.missingBaselineGoalIds = context.missingBaselines.map(outcome => outcome.goal.id)
    actual.predicates.coverage = context.nutrition.coverage
  } catch (error) {
    actual.state = 'unavailable'; actual.decision = 'abstain'; actual.predicates.unavailableReason = error instanceof Error ? error.message : String(error)
  }
  actual.sourceRecordsUnchanged = JSON.stringify(tables) === before
  return actual
}
