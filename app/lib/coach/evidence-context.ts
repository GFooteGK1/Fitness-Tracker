import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ADAPTIVE_EVIDENCE_POLICY_VERSION,
  PERFORMANCE_METRIC_IDS,
  normalizeMetricValue,
  type EvidenceSemanticRole,
  type MetricUnit,
  type PerformanceMetricId
} from './adaptive-programming-contracts'

export const COACH_EVIDENCE_CONTEXT_SCHEMA_VERSION = 1 as const
export const COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION = 'coach-context-selection-0.1.0' as const

export const COACH_EVIDENCE_CONTEXT_PURPOSES = [
  'today_session',
  'weekly_review',
  'adaptation_review',
  'new_planning',
  'metric_history',
  'general_coaching'
] as const

export type CoachEvidenceContextPurpose = typeof COACH_EVIDENCE_CONTEXT_PURPOSES[number]

type CoachMemoryKind =
  | 'goal'
  | 'schedule'
  | 'equipment'
  | 'preference'
  | 'constraint'
  | 'limitation'
  | 'baseline'

interface PurposeConfig {
  defaultWindowDays: number
  maximumWindowDays: number
  maxMemories: number
  maxAssessments: number
  maxObservationSamples: number
  memoryKinds: readonly CoachMemoryKind[]
}

const PURPOSE_CONFIG: Record<CoachEvidenceContextPurpose, PurposeConfig> = {
  today_session: {
    defaultWindowDays: 7,
    maximumWindowDays: 14,
    maxMemories: 12,
    maxAssessments: 4,
    maxObservationSamples: 16,
    memoryKinds: ['goal', 'schedule', 'equipment', 'preference', 'constraint', 'limitation']
  },
  weekly_review: {
    defaultWindowDays: 14,
    maximumWindowDays: 35,
    maxMemories: 12,
    maxAssessments: 8,
    maxObservationSamples: 64,
    memoryKinds: ['goal', 'schedule', 'preference', 'constraint', 'limitation']
  },
  adaptation_review: {
    defaultWindowDays: 84,
    maximumWindowDays: 180,
    maxMemories: 16,
    maxAssessments: 12,
    maxObservationSamples: 160,
    memoryKinds: ['goal', 'preference', 'constraint', 'limitation', 'baseline']
  },
  new_planning: {
    defaultWindowDays: 365,
    maximumWindowDays: 730,
    maxMemories: 24,
    maxAssessments: 20,
    maxObservationSamples: 80,
    memoryKinds: ['goal', 'schedule', 'equipment', 'preference', 'constraint', 'limitation', 'baseline']
  },
  metric_history: {
    defaultWindowDays: 365,
    maximumWindowDays: 730,
    maxMemories: 4,
    maxAssessments: 12,
    maxObservationSamples: 120,
    memoryKinds: ['baseline']
  },
  general_coaching: {
    defaultWindowDays: 28,
    maximumWindowDays: 90,
    maxMemories: 16,
    maxAssessments: 10,
    maxObservationSamples: 24,
    memoryKinds: ['goal', 'schedule', 'equipment', 'preference', 'constraint', 'limitation']
  }
}

export interface CoachEvidenceContextRequest {
  purpose: CoachEvidenceContextPurpose
  asOf: string
  windowDays?: number
  goalId?: string
  prescribedSessionId?: string
  metricId?: PerformanceMetricId
  protocol?: { id: string; version: string }
  comparabilityKey?: string
}

export type CoachEvidenceContextRequestValidation =
  | { ok: true; value: CoachEvidenceContextRequest & { windowDays: number } }
  | { ok: false; errors: string[] }

export interface CoachEvidenceProgramRow {
  id: string
  user_id: string
  title: string
  goal_summary: string
  start_date: string
  end_date: string
  status: string
  active_plan_version_id: string | null
  created_at: string
}

export interface CoachEvidencePlanVersionRow {
  id: string
  user_id: string
  program_id: string
  version: number | string
  status: string
  reference_version: string
  policy_version: string
  intent: unknown
}

export interface CoachEvidenceSessionRow {
  id: string
  user_id: string
  program_id: string
  plan_version_id: string
  week_number: number | string
  session_index: number | string
  scheduled_date: string | null
  prescription: unknown
  status: string
  completed_workout_id: string | null
}

export interface CoachEvidenceMemoryRow {
  id: string
  user_id: string
  memory_key: string
  kind: string
  content: unknown
  provenance: unknown
  confidence: number | string
  confirmed_at: string
  version: number | string
  status: string
  effective_from: string | null
  effective_until: string | null
  review_after: string | null
  last_reviewed_at: string | null
}

export interface CoachEvidenceStrengthAssessmentRow {
  id: string
  user_id: string
  movement: string
  variation: string | null
  load: number | string
  unit: string
  reps: number | string
  assessed_on: string
  estimated_1rm: number | string
  estimate_kind: string
  athlete_confidence: number | string
  calculator_version: string
}

export interface CoachEvidenceImportRow {
  id: string
  user_id: string
  status: string
  verification_status: string
}

export interface CoachEvidenceObservationGroupRow {
  id: string
  user_id: string
  source_import_id: string | null
  workout_id: string | null
  prescribed_session_id: string | null
  observation_kind: string
  status: string
  observed_at: string
  captured_at: string
  source_kind: string
  source_system: string
  source_device: string
  source_record_id: string
  assessment_definition_id: string
  assessment_catalog_version: string
  protocol_version: string
  verification_status: string
  comparability_key: string | null
  comparison_modifiers: unknown
  metadata: unknown
}

export interface CoachEvidenceObservationValueRow {
  id: string
  group_id: string
  user_id: string
  metric_id: string
  semantic_role: string
  value_numeric: number | string | null
  unit: string | null
  ordinal: number | string
  status: string
  provenance: unknown
}

export interface CoachEvidenceContextSource {
  programs: CoachEvidenceProgramRow[]
  planVersions: CoachEvidencePlanVersionRow[]
  sessions: CoachEvidenceSessionRow[]
  memories: CoachEvidenceMemoryRow[]
  strengthAssessments: CoachEvidenceStrengthAssessmentRow[]
  imports: CoachEvidenceImportRow[]
  observationGroups: CoachEvidenceObservationGroupRow[]
  observationValues: CoachEvidenceObservationValueRow[]
  sourceTruncated?: boolean
  errors?: string[]
}

export interface CoachEvidenceMemory {
  id: string
  memoryKey: string
  kind: CoachMemoryKind
  version: number
  content: Record<string, unknown>
  provenance: Record<string, unknown>
  confidence: number
  confirmedAt: string
  effectiveFrom: string
  effectiveUntil: string | null
  reviewAfter: string | null
  lastReviewedAt: string | null
}

export interface CoachEvidenceStrengthBaseline {
  id: string
  movement: string
  variation: string | null
  sourceSet: { load: number; unit: 'kg' | 'lb'; reps: 1 | 3 | 5 }
  estimatedOneRepMax: number
  estimateKind: 'reported_1rm' | 'estimated_1rm'
  confidence: number
  assessedOn: string
  calculatorVersion: string
}

export interface CoachEvidenceSample {
  observationId: string
  observationValueId: string
  metricId: PerformanceMetricId
  semanticRole: EvidenceSemanticRole
  value: number
  unit: MetricUnit
  originalMeasurement: { value: number; unit: MetricUnit }
  ordinal: number
  observedAt: string
  capturedAt: string
  workoutId: string | null
  prescribedSessionId: string | null
  assessmentDefinition: { id: string; catalogVersion: string }
  protocol: { id: string; version: string }
  comparabilityKey: string
  source: {
    kind: string
    system: string
    device: string | null
    recordId: string
    verificationStatus: 'athlete_confirmed' | 'system_verified'
  }
  confidence: number
  comparison: Record<string, unknown>
}

export interface CoachEvidenceSeries {
  id: string
  metricId: PerformanceMetricId
  semanticRole: EvidenceSemanticRole
  assessmentDefinitionId: string
  protocol: { id: string; version: string }
  comparabilityKey: string
  observationIds: string[]
  sampleCount: number
  confidence: number
  algorithmVersion: typeof COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION
  samples: CoachEvidenceSample[]
}

export interface CoachEvidenceContextPacket {
  schemaVersion: typeof COACH_EVIDENCE_CONTEXT_SCHEMA_VERSION
  purpose: CoachEvidenceContextPurpose
  asOf: string
  window: { startsAt: string; endsAt: string; days: number }
  algorithmVersion: typeof COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION
  evidencePolicyVersion: typeof ADAPTIVE_EVIDENCE_POLICY_VERSION
  storageAvailable: boolean
  selectionComplete: boolean
  scope: {
    userId: string
    activeProgramId: string | null
    activePlanVersionId: string | null
    goalId: string | null
    prescribedSessionId: string | null
    metricId: PerformanceMetricId | null
    protocol: { id: string; version: string } | null
    comparabilityKey: string | null
  }
  activePlan: {
    programId: string
    title: string
    goalSummary: string
    startDate: string
    endDate: string
    planVersionId: string
    planVersion: number
    referenceVersion: string
    policyVersion: string
    goalIds: string[]
    sessionIds: string[]
  } | null
  session: {
    id: string
    weekNumber: number
    sessionIndex: number
    scheduledDate: string | null
    status: 'planned' | 'completed' | 'skipped'
    completedWorkoutId: string | null
    prescription: Record<string, unknown>
  } | null
  memories: CoachEvidenceMemory[]
  strengthBaselines: CoachEvidenceStrengthBaseline[]
  evidenceSeries: CoachEvidenceSeries[]
  evidenceIds: string[]
  sampleCount: number
  limits: {
    maxMemories: number
    maxAssessments: number
    maxObservationSamples: number
    sourceTruncated: boolean
    selectionTruncated: boolean
  }
  missing: string[]
  reproduction: {
    request: CoachEvidenceContextRequest & { windowDays: number }
    activePlanVersionId: string | null
    memoryIds: string[]
    assessmentIds: string[]
    observationIds: string[]
  }
}

export function validateCoachEvidenceContextRequest(
  value: unknown
): CoachEvidenceContextRequestValidation {
  if (!isRecord(value)) return { ok: false, errors: ['Context request must be an object'] }

  const errors: string[] = []
  const purpose = COACH_EVIDENCE_CONTEXT_PURPOSES.includes(value.purpose as CoachEvidenceContextPurpose)
    ? value.purpose as CoachEvidenceContextPurpose
    : null
  if (!purpose) errors.push('Context purpose is unsupported')

  const asOf = typeof value.asOf === 'string' && isIsoTimestamp(value.asOf)
    ? new Date(value.asOf).toISOString()
    : null
  if (!asOf) errors.push('Context as-of time must be an ISO timestamp')

  const config = purpose ? PURPOSE_CONFIG[purpose] : null
  const windowDays = value.windowDays === undefined
    ? config?.defaultWindowDays ?? 1
    : typeof value.windowDays === 'number'
      ? value.windowDays
      : Number.NaN
  if (
    !Number.isInteger(windowDays)
    || windowDays < 1
    || (config !== null && windowDays > config.maximumWindowDays)
  ) {
    errors.push('Context window is outside the purpose limit')
  }

  const goalId = optionalStableId(value.goalId, 'Goal', errors)
  const prescribedSessionId = optionalUuid(value.prescribedSessionId, 'Prescribed session', errors)
  const metricId = value.metricId === undefined
    ? undefined
    : PERFORMANCE_METRIC_IDS.includes(value.metricId as PerformanceMetricId)
      ? value.metricId as PerformanceMetricId
      : (errors.push('Metric is unsupported'), undefined)
  const protocol = normalizeProtocol(value.protocol, errors)
  const comparabilityKey = value.comparabilityKey === undefined
    ? undefined
    : typeof value.comparabilityKey === 'string'
      && value.comparabilityKey.startsWith('comparison-v1|')
      && value.comparabilityKey.length <= 500
      ? value.comparabilityKey
      : (errors.push('Comparability key is invalid'), undefined)

  if (purpose === 'today_session' && !prescribedSessionId) {
    errors.push('Today-session context requires a prescribed session')
  }
  if (purpose === 'adaptation_review' && !goalId) {
    errors.push('Adaptation-review context requires a goal')
  }
  if (purpose === 'metric_history' && !metricId) {
    errors.push('Metric-history context requires a metric')
  }

  if (errors.length > 0 || !purpose || !asOf) {
    return { ok: false, errors: unique(errors) }
  }

  return {
    ok: true,
    value: {
      purpose,
      asOf,
      windowDays: windowDays as number,
      ...(goalId ? { goalId } : {}),
      ...(prescribedSessionId ? { prescribedSessionId } : {}),
      ...(metricId ? { metricId } : {}),
      ...(protocol ? { protocol } : {}),
      ...(comparabilityKey ? { comparabilityKey } : {})
    }
  }
}

export async function fetchCoachEvidenceContext(
  supabase: SupabaseClient,
  userId: string,
  request: CoachEvidenceContextRequest
): Promise<CoachEvidenceContextPacket> {
  const validation = validateCoachEvidenceContextRequest(request)
  if (!validation.ok) throw new Error(validation.errors.join('; '))

  const normalized = validation.value
  const config = PURPOSE_CONFIG[normalized.purpose]
  const startsAt = subtractDays(normalized.asOf, normalized.windowDays)
  const errors: string[] = []

  const programResult = await supabase
    .from('training_programs')
    .select('id, user_id, title, goal_summary, start_date, end_date, status, active_plan_version_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(2)

  if (programResult.error) errors.push('active_program_unavailable')
  const programs = (programResult.data ?? []) as CoachEvidenceProgramRow[]
  const selectedProgram = selectActiveProgram(programs, userId)
  const activePlanVersionId = selectedProgram?.active_plan_version_id ?? null

  const planPromise = activePlanVersionId
    ? supabase
      .from('training_plan_versions')
      .select('id, user_id, program_id, version, status, reference_version, policy_version, intent')
      .eq('user_id', userId)
      .eq('id', activePlanVersionId)
      .limit(1)
    : Promise.resolve({ data: [], error: null })
  const sessionsPromise = activePlanVersionId
    ? supabase
      .from('prescribed_sessions')
      .select('id, user_id, program_id, plan_version_id, week_number, session_index, scheduled_date, prescription, status, completed_workout_id')
      .eq('user_id', userId)
      .eq('plan_version_id', activePlanVersionId)
      .order('week_number', { ascending: true })
      .order('session_index', { ascending: true })
      .limit(64)
    : Promise.resolve({ data: [], error: null })
  const memoryPromise = supabase
    .from('coach_memories')
    .select('id, user_id, memory_key, kind, content, provenance, confidence, confirmed_at, version, status, effective_from, effective_until, review_after, last_reviewed_at')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .lte('confirmed_at', normalized.asOf)
    .order('confirmed_at', { ascending: false })
    .limit(config.maxMemories * 2 + 1)
  const assessmentPromise = supabase
    .from('coach_strength_assessments')
    .select('id, user_id, movement, variation, load, unit, reps, assessed_on, estimated_1rm, estimate_kind, athlete_confidence, calculator_version')
    .eq('user_id', userId)
    .lte('assessed_on', normalized.asOf.slice(0, 10))
    .order('assessed_on', { ascending: false })
    .limit(config.maxAssessments + 1)

  let groupQuery = supabase
    .from('performance_observation_groups')
    .select('id, user_id, source_import_id, workout_id, prescribed_session_id, observation_kind, status, observed_at, captured_at, source_kind, source_system, source_device, source_record_id, assessment_definition_id, assessment_catalog_version, protocol_version, verification_status, comparability_key, comparison_modifiers, metadata')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .gte('observed_at', startsAt)
    .lte('observed_at', normalized.asOf)
  if (normalized.comparabilityKey) {
    groupQuery = groupQuery.eq('comparability_key', normalized.comparabilityKey)
  }
  const groupPromise = groupQuery
    .order('observed_at', { ascending: false })
    .limit(config.maxObservationSamples * 2 + 1)

  const [planResult, sessionsResult, memoryResult, assessmentResult, groupResult] = await Promise.all([
    planPromise,
    sessionsPromise,
    memoryPromise,
    assessmentPromise,
    groupPromise
  ])

  if (planResult.error) errors.push('active_plan_version_unavailable')
  if (sessionsResult.error) errors.push('active_plan_sessions_unavailable')
  if (memoryResult.error) errors.push('coach_memories_unavailable')
  if (assessmentResult.error) errors.push('strength_assessments_unavailable')
  if (groupResult.error) errors.push('performance_observations_unavailable')

  const groups = (groupResult.data ?? []) as CoachEvidenceObservationGroupRow[]
  const groupIds = groups.map(group => group.id)
  const importIds = unique(groups.flatMap(group => group.source_import_id ? [group.source_import_id] : []))

  const valueLimit = config.maxObservationSamples * 4 + 4
  let valueResult: { data: unknown[] | null; error: unknown } = { data: [], error: null }
  if (groupIds.length > 0) {
    let valueQuery = supabase
      .from('performance_observation_values')
      .select('id, group_id, user_id, metric_id, semantic_role, value_numeric, unit, ordinal, status, provenance')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .in('group_id', groupIds)
    if (normalized.metricId) valueQuery = valueQuery.eq('metric_id', normalized.metricId)
    valueResult = await valueQuery.limit(valueLimit)
    if (valueResult.error) errors.push('performance_observation_values_unavailable')
  }

  let importResult: { data: unknown[] | null; error: unknown } = { data: [], error: null }
  if (importIds.length > 0) {
    importResult = await supabase
      .from('measurement_imports')
      .select('id, user_id, status, verification_status')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .in('id', importIds)
      .limit(importIds.length)
    if (importResult.error) errors.push('measurement_imports_unavailable')
  }

  return assembleCoachEvidenceContext(userId, normalized, {
    programs,
    planVersions: (planResult.data ?? []) as CoachEvidencePlanVersionRow[],
    sessions: (sessionsResult.data ?? []) as CoachEvidenceSessionRow[],
    memories: (memoryResult.data ?? []) as CoachEvidenceMemoryRow[],
    strengthAssessments: (assessmentResult.data ?? []) as CoachEvidenceStrengthAssessmentRow[],
    imports: (importResult.data ?? []) as CoachEvidenceImportRow[],
    observationGroups: groups,
    observationValues: (valueResult.data ?? []) as CoachEvidenceObservationValueRow[],
    sourceTruncated: groups.length > config.maxObservationSamples * 2
      || ((memoryResult.data ?? []).length > config.maxMemories * 2)
      || ((assessmentResult.data ?? []).length > config.maxAssessments)
      || ((valueResult.data ?? []).length >= valueLimit),
    errors
  })
}

export function assembleCoachEvidenceContext(
  userId: string,
  request: CoachEvidenceContextRequest,
  source: CoachEvidenceContextSource
): CoachEvidenceContextPacket {
  const validation = validateCoachEvidenceContextRequest(request)
  if (!validation.ok) throw new Error(validation.errors.join('; '))

  const normalized = validation.value
  const config = PURPOSE_CONFIG[normalized.purpose]
  const asOfMs = Date.parse(normalized.asOf)
  const startsAt = subtractDays(normalized.asOf, normalized.windowDays)
  const startsAtMs = Date.parse(startsAt)
  const missing = [...(source.errors ?? [])]

  const userPrograms = source.programs.filter(row => row.user_id === userId && row.status === 'active')
  const activeProgram = selectActiveProgram(userPrograms, userId)
  if (userPrograms.length > 1) missing.push('conflicting_active_programs')
  const activePlan = activeProgram?.active_plan_version_id
    ? source.planVersions.find(row => (
      row.id === activeProgram.active_plan_version_id
      && row.user_id === userId
      && row.program_id === activeProgram.id
      && row.status === 'accepted'
    )) ?? null
    : null
  const activeSessions = activePlan
    ? source.sessions.filter(row => (
      row.user_id === userId
      && row.program_id === activePlan.program_id
      && row.plan_version_id === activePlan.id
      && ['planned', 'completed', 'skipped'].includes(row.status)
    )).sort(compareSessions)
    : []
  const requestedSession = normalized.prescribedSessionId
    ? activeSessions.find(row => row.id === normalized.prescribedSessionId) ?? null
    : null

  if (needsActivePlan(normalized.purpose) && !activePlan) missing.push('active_plan_missing')
  if (normalized.prescribedSessionId && !requestedSession) {
    missing.push('session_not_in_active_plan')
  }

  const adaptiveScope = extractAdaptiveScope(activePlan?.intent, normalized.goalId)
  if (normalized.goalId && !adaptiveScope.goalFound) missing.push('goal_not_in_active_plan')

  const memoryCandidates = source.memories
    .filter(row => row.user_id === userId)
    .filter(row => isActiveMemory(row, config.memoryKinds, asOfMs))
    .sort((a, b) => compareDateDesc(a.confirmed_at, b.confirmed_at)
      || (finiteNumber(b.version) ?? 0) - (finiteNumber(a.version) ?? 0))
  const memories = memoryCandidates
    .flatMap(row => normalizeMemory(row, missing))
    .slice(0, config.maxMemories)

  const assessmentCandidates = source.strengthAssessments
    .filter(row => row.user_id === userId && dateAtOrBefore(row.assessed_on, normalized.asOf.slice(0, 10)))
    .filter(() => includeStrengthBaselines(normalized, adaptiveScope.metricIds))
    .sort((a, b) => b.assessed_on.localeCompare(a.assessed_on) || a.id.localeCompare(b.id))
  const strengthBaselines = assessmentCandidates
    .flatMap(normalizeStrengthBaseline)
    .slice(0, config.maxAssessments)

  const activeSessionIds = new Set(activeSessions.map(session => session.id))
  const confirmedImportIds = new Set(source.imports
    .filter(row => (
      row.user_id === userId
      && row.status === 'confirmed'
      && row.verification_status === 'athlete_confirmed'
    ))
    .map(row => row.id))
  const valuesByGroup = groupBy(source.observationValues.filter(row => (
    row.user_id === userId && row.status === 'complete'
  )), row => row.group_id)

  const samples = source.observationGroups
    .filter(group => isEligibleGroup({
      group,
      userId,
      normalized,
      asOfMs,
      startsAtMs,
      requestedSession,
      activeSessionIds,
      confirmedImportIds,
      adaptiveScope
    }))
    .flatMap(group => (valuesByGroup.get(group.id) ?? []).flatMap(value => (
      normalizeEvidenceSample(group, value, normalized, adaptiveScope)
    )))
    .sort(compareSamples)

  const selectionTruncated = samples.length > config.maxObservationSamples
  const selectedSamples = samples.slice(0, config.maxObservationSamples)
  const evidenceSeries = buildSeries(selectedSamples)
  const evidenceIds = unique(selectedSamples.map(sample => sample.observationId)).sort()

  if (memories.length === 0 && config.maxMemories > 0) missing.push('authoritative_memories_missing')
  if (selectedSamples.length === 0) missing.push('compatible_evidence_missing')
  if (source.sourceTruncated) missing.push('source_query_truncated')
  if (selectionTruncated) missing.push('context_selection_truncated')

  const activePlanPacket = activeProgram && activePlan
    ? {
      programId: activeProgram.id,
      title: activeProgram.title,
      goalSummary: activeProgram.goal_summary,
      startDate: activeProgram.start_date,
      endDate: activeProgram.end_date,
      planVersionId: activePlan.id,
      planVersion: finiteNumber(activePlan.version) ?? 0,
      referenceVersion: activePlan.reference_version,
      policyVersion: activePlan.policy_version,
      goalIds: adaptiveScope.allGoalIds,
      sessionIds: activeSessions.map(session => session.id)
    }
    : null
  const sessionPacket = requestedSession
    ? normalizeSession(requestedSession, missing)
    : null

  const uniqueMissing = unique(missing).sort()
  const sourceTruncated = Boolean(source.sourceTruncated)
  return {
    schemaVersion: COACH_EVIDENCE_CONTEXT_SCHEMA_VERSION,
    purpose: normalized.purpose,
    asOf: normalized.asOf,
    window: { startsAt, endsAt: normalized.asOf, days: normalized.windowDays },
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    evidencePolicyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION,
    storageAvailable: (source.errors ?? []).length === 0,
    selectionComplete: !sourceTruncated && !selectionTruncated && (source.errors ?? []).length === 0,
    scope: {
      userId,
      activeProgramId: activeProgram?.id ?? null,
      activePlanVersionId: activePlan?.id ?? null,
      goalId: normalized.goalId ?? null,
      prescribedSessionId: normalized.prescribedSessionId ?? null,
      metricId: normalized.metricId ?? null,
      protocol: normalized.protocol ?? null,
      comparabilityKey: normalized.comparabilityKey ?? null
    },
    activePlan: activePlanPacket,
    session: sessionPacket,
    memories,
    strengthBaselines,
    evidenceSeries,
    evidenceIds,
    sampleCount: selectedSamples.length,
    limits: {
      maxMemories: config.maxMemories,
      maxAssessments: config.maxAssessments,
      maxObservationSamples: config.maxObservationSamples,
      sourceTruncated,
      selectionTruncated
    },
    missing: uniqueMissing,
    reproduction: {
      request: normalized,
      activePlanVersionId: activePlan?.id ?? null,
      memoryIds: memories.map(memory => memory.id),
      assessmentIds: strengthBaselines.map(assessment => assessment.id),
      observationIds: evidenceIds
    }
  }
}

function isEligibleGroup(input: {
  group: CoachEvidenceObservationGroupRow
  userId: string
  normalized: CoachEvidenceContextRequest & { windowDays: number }
  asOfMs: number
  startsAtMs: number
  requestedSession: CoachEvidenceSessionRow | null
  activeSessionIds: Set<string>
  confirmedImportIds: Set<string>
  adaptiveScope: AdaptiveScope
}): boolean {
  const {
    group,
    userId,
    normalized,
    asOfMs,
    startsAtMs,
    requestedSession,
    activeSessionIds,
    confirmedImportIds,
    adaptiveScope
  } = input
  const observedAt = Date.parse(group.observed_at)
  const capturedAt = Date.parse(group.captured_at)
  if (
    group.user_id !== userId
    || group.status !== 'complete'
    || !Number.isFinite(observedAt)
    || !Number.isFinite(capturedAt)
    || observedAt < startsAtMs
    || observedAt > asOfMs
    || capturedAt < observedAt
    || capturedAt > asOfMs
    || !group.comparability_key
    || !['athlete_confirmed', 'system_verified'].includes(group.verification_status)
  ) return false

  if (group.source_kind === 'import' && (
    !group.source_import_id || !confirmedImportIds.has(group.source_import_id)
  )) return false

  const protocol = protocolFor(group)
  if (normalized.protocol && (
    protocol.id !== normalized.protocol.id || protocol.version !== normalized.protocol.version
  )) return false
  if (normalized.comparabilityKey && group.comparability_key !== normalized.comparabilityKey) {
    return false
  }
  if (
    adaptiveScope.assessmentDefinitionIds.size > 0
    && !adaptiveScope.assessmentDefinitionIds.has(group.assessment_definition_id)
  ) return false

  if (normalized.purpose === 'today_session') {
    if (!requestedSession) return false
    return group.prescribed_session_id === requestedSession.id
      || group.observation_kind === 'readiness_check'
  }
  if (normalized.purpose === 'weekly_review') {
    return Boolean(group.prescribed_session_id && activeSessionIds.has(group.prescribed_session_id))
  }
  return true
}

function normalizeEvidenceSample(
  group: CoachEvidenceObservationGroupRow,
  value: CoachEvidenceObservationValueRow,
  request: CoachEvidenceContextRequest & { windowDays: number },
  adaptiveScope: AdaptiveScope
): CoachEvidenceSample[] {
  if (
    !PERFORMANCE_METRIC_IDS.includes(value.metric_id as PerformanceMetricId)
    || !['estimate', 'proxy', 'training_signal', 'direct_outcome'].includes(value.semantic_role)
    || value.unit === null
    || !isMetricUnit(value.unit)
  ) return []
  const numericValue = finiteNumber(value.value_numeric)
  if (numericValue === null) return []
  const metricId = value.metric_id as PerformanceMetricId
  const ordinal = finiteNumber(value.ordinal)
  if (ordinal === null || !Number.isInteger(ordinal) || ordinal < 0) return []
  if (request.metricId && metricId !== request.metricId) return []
  if (adaptiveScope.metricIds.size > 0 && !adaptiveScope.metricIds.has(metricId)) return []
  const normalizedMetric = normalizeMetricValue({
    metricId,
    value: numericValue,
    unit: value.unit
  })
  if (!normalizedMetric) return []

  const protocol = protocolFor(group)
  return [{
    observationId: group.id,
    observationValueId: value.id,
    metricId,
    semanticRole: value.semantic_role as EvidenceSemanticRole,
    value: normalizedMetric.value,
    unit: normalizedMetric.unit,
    originalMeasurement: { value: numericValue, unit: value.unit },
    ordinal,
    observedAt: new Date(group.observed_at).toISOString(),
    capturedAt: new Date(group.captured_at).toISOString(),
    workoutId: group.workout_id,
    prescribedSessionId: group.prescribed_session_id,
    assessmentDefinition: {
      id: group.assessment_definition_id,
      catalogVersion: group.assessment_catalog_version
    },
    protocol,
    comparabilityKey: group.comparability_key as string,
    source: {
      kind: group.source_kind,
      system: group.source_system,
      device: group.source_device === 'none' ? null : group.source_device,
      recordId: group.source_record_id,
      verificationStatus: group.verification_status as 'athlete_confirmed' | 'system_verified'
    },
    confidence: group.verification_status === 'athlete_confirmed' ? 1 : 0.9,
    comparison: boundedObject(group.comparison_modifiers, 5_000)
  }]
}

function buildSeries(samples: CoachEvidenceSample[]): CoachEvidenceSeries[] {
  const grouped = groupBy(samples, sample => (
    `${sample.metricId}|${sample.semanticRole}|${sample.assessmentDefinition.id}`
      + `|${sample.protocol.id}@${sample.protocol.version}|${sample.comparabilityKey}`
  ))
  return [...grouped.entries()].map(([id, seriesSamples]) => {
    const ordered = [...seriesSamples].sort((a, b) => (
      a.observedAt.localeCompare(b.observedAt)
      || a.ordinal - b.ordinal
      || a.observationValueId.localeCompare(b.observationValueId)
    ))
    const first = ordered[0]
    return {
      id,
      metricId: first.metricId,
      semanticRole: first.semanticRole,
      assessmentDefinitionId: first.assessmentDefinition.id,
      protocol: first.protocol,
      comparabilityKey: first.comparabilityKey,
      observationIds: unique(ordered.map(sample => sample.observationId)),
      sampleCount: ordered.length,
      confidence: Math.min(...ordered.map(sample => sample.confidence)),
      algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
      samples: ordered
    }
  }).sort((a, b) => a.id.localeCompare(b.id))
}

interface AdaptiveScope {
  goalFound: boolean
  allGoalIds: string[]
  metricIds: Set<PerformanceMetricId>
  assessmentDefinitionIds: Set<string>
}

function extractAdaptiveScope(intent: unknown, goalId: string | undefined): AdaptiveScope {
  const adaptive = isRecord(intent) && isRecord(intent.adaptive_programming)
    ? intent.adaptive_programming
    : null
  if (!adaptive) {
    return { goalFound: !goalId, allGoalIds: [], metricIds: new Set(), assessmentDefinitionIds: new Set() }
  }

  const goals = Array.isArray(adaptive.goals) ? adaptive.goals.filter(isRecord) : []
  const allGoalIds = goals.flatMap(goal => typeof goal.id === 'string' ? [goal.id] : [])
  if (!goalId) {
    return { goalFound: true, allGoalIds, metricIds: new Set(), assessmentDefinitionIds: new Set() }
  }

  const hypotheses = Array.isArray(adaptive.hypotheses) ? adaptive.hypotheses.filter(isRecord) : []
  const hypothesisIds = new Set(hypotheses.flatMap(hypothesis => (
    hypothesis.goalId === goalId && typeof hypothesis.id === 'string' ? [hypothesis.id] : []
  )))
  const expectedSignals = Array.isArray(adaptive.expectedSignals)
    ? adaptive.expectedSignals.filter(isRecord)
    : []
  const scheduledAssessments = Array.isArray(adaptive.scheduledAssessments)
    ? adaptive.scheduledAssessments.filter(isRecord)
    : []
  const metricIds = new Set<PerformanceMetricId>()
  const assessmentDefinitionIds = new Set<string>()

  for (const signal of expectedSignals) {
    if (
      typeof signal.hypothesisId === 'string'
      && hypothesisIds.has(signal.hypothesisId)
      && PERFORMANCE_METRIC_IDS.includes(signal.metricId as PerformanceMetricId)
    ) {
      metricIds.add(signal.metricId as PerformanceMetricId)
      if (typeof signal.assessmentDefinitionId === 'string') {
        assessmentDefinitionIds.add(signal.assessmentDefinitionId)
      }
    }
  }
  for (const assessment of scheduledAssessments) {
    if (assessment.goalId !== goalId) continue
    if (PERFORMANCE_METRIC_IDS.includes(assessment.metricId as PerformanceMetricId)) {
      metricIds.add(assessment.metricId as PerformanceMetricId)
    }
    if (isRecord(assessment.assessmentDefinition) && typeof assessment.assessmentDefinition.id === 'string') {
      assessmentDefinitionIds.add(assessment.assessmentDefinition.id)
    }
  }

  return {
    goalFound: allGoalIds.includes(goalId) && hypothesisIds.size > 0,
    allGoalIds,
    metricIds,
    assessmentDefinitionIds
  }
}

function isActiveMemory(
  row: CoachEvidenceMemoryRow,
  allowedKinds: readonly CoachMemoryKind[],
  asOfMs: number
): boolean {
  if (row.status !== 'confirmed' || !allowedKinds.includes(row.kind as CoachMemoryKind)) return false
  const confirmedAt = Date.parse(row.confirmed_at)
  const effectiveFrom = Date.parse(row.effective_from ?? row.confirmed_at)
  const effectiveUntil = row.effective_until ? Date.parse(row.effective_until) : Number.POSITIVE_INFINITY
  const reviewAfter = row.review_after ? Date.parse(row.review_after) : null
  const lastReviewed = row.last_reviewed_at ? Date.parse(row.last_reviewed_at) : null
  if (
    !Number.isFinite(confirmedAt)
    || !Number.isFinite(effectiveFrom)
    || (row.effective_until !== null && !Number.isFinite(effectiveUntil))
    || (reviewAfter !== null && !Number.isFinite(reviewAfter))
    || (lastReviewed !== null && !Number.isFinite(lastReviewed))
    || confirmedAt > asOfMs
    || effectiveFrom > asOfMs
    || effectiveUntil <= asOfMs
  ) return false

  if (
    reviewAfter !== null
    && reviewAfter <= asOfMs
    && (
      lastReviewed === null
      || lastReviewed < reviewAfter
      || lastReviewed > asOfMs
    )
  ) {
    return false
  }
  return true
}

function normalizeMemory(row: CoachEvidenceMemoryRow, missing: string[]): CoachEvidenceMemory[] {
  const version = finiteNumber(row.version)
  const confidence = finiteNumber(row.confidence)
  if (
    version === null
    || confidence === null
    || !isRecord(row.content)
    || jsonSize(row.content) > 8_000
  ) {
    missing.push(`memory_invalid_or_oversized:${row.id}`)
    return []
  }
  return [{
    id: row.id,
    memoryKey: row.memory_key,
    kind: row.kind as CoachMemoryKind,
    version,
    content: row.content,
    provenance: boundedObject(row.provenance, 4_000),
    confidence,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    effectiveFrom: new Date(row.effective_from ?? row.confirmed_at).toISOString(),
    effectiveUntil: row.effective_until ? new Date(row.effective_until).toISOString() : null,
    reviewAfter: row.review_after ? new Date(row.review_after).toISOString() : null,
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).toISOString() : null
  }]
}

function normalizeStrengthBaseline(
  row: CoachEvidenceStrengthAssessmentRow
): CoachEvidenceStrengthBaseline[] {
  const load = finiteNumber(row.load)
  const reps = finiteNumber(row.reps)
  const estimatedOneRepMax = finiteNumber(row.estimated_1rm)
  const confidence = finiteNumber(row.athlete_confidence)
  if (
    load === null
    || ![1, 3, 5].includes(reps ?? 0)
    || estimatedOneRepMax === null
    || confidence === null
    || (row.unit !== 'kg' && row.unit !== 'lb')
  ) return []
  return [{
    id: row.id,
    movement: row.movement,
    variation: row.variation,
    sourceSet: { load, unit: row.unit, reps: reps as 1 | 3 | 5 },
    estimatedOneRepMax,
    estimateKind: row.estimate_kind === 'reported_1rm' ? 'reported_1rm' : 'estimated_1rm',
    confidence,
    assessedOn: row.assessed_on,
    calculatorVersion: row.calculator_version
  }]
}

function normalizeSession(
  row: CoachEvidenceSessionRow,
  missing: string[]
): CoachEvidenceContextPacket['session'] {
  const weekNumber = finiteNumber(row.week_number)
  const sessionIndex = finiteNumber(row.session_index)
  if (weekNumber === null || sessionIndex === null) {
    missing.push('active_session_invalid')
    return null
  }
  return {
    id: row.id,
    weekNumber,
    sessionIndex,
    scheduledDate: row.scheduled_date,
    status: row.status as 'planned' | 'completed' | 'skipped',
    completedWorkoutId: row.completed_workout_id,
    prescription: boundedObject(row.prescription, 20_000)
  }
}

function includeStrengthBaselines(
  request: CoachEvidenceContextRequest,
  goalMetricIds: Set<PerformanceMetricId>
): boolean {
  if (!['new_planning', 'adaptation_review', 'general_coaching', 'metric_history'].includes(request.purpose)) {
    return false
  }
  if (request.metricId && !['strength.load', 'strength.estimated_1rm'].includes(request.metricId)) {
    return false
  }
  return goalMetricIds.size === 0
    || goalMetricIds.has('strength.load')
    || goalMetricIds.has('strength.estimated_1rm')
    || goalMetricIds.has('strength.repetitions')
}

function selectActiveProgram(
  rows: CoachEvidenceProgramRow[],
  userId: string
): CoachEvidenceProgramRow | null {
  return [...rows]
    .filter(row => row.user_id === userId && row.status === 'active')
    .sort((a, b) => (
      b.start_date.localeCompare(a.start_date)
      || b.created_at.localeCompare(a.created_at)
      || a.id.localeCompare(b.id)
    ))[0] ?? null
}

function compareSessions(a: CoachEvidenceSessionRow, b: CoachEvidenceSessionRow): number {
  return (finiteNumber(a.week_number) ?? 0) - (finiteNumber(b.week_number) ?? 0)
    || (finiteNumber(a.session_index) ?? 0) - (finiteNumber(b.session_index) ?? 0)
    || a.id.localeCompare(b.id)
}

function compareSamples(a: CoachEvidenceSample, b: CoachEvidenceSample): number {
  return b.observedAt.localeCompare(a.observedAt)
    || a.observationValueId.localeCompare(b.observationValueId)
}

function compareDateDesc(a: string, b: string): number {
  return b.localeCompare(a)
}

function protocolFor(group: CoachEvidenceObservationGroupRow): { id: string; version: string } {
  const metadata = isRecord(group.metadata) ? group.metadata : {}
  const metadataId = typeof metadata.protocolId === 'string' ? metadata.protocolId : null
  const keyMatch = group.comparability_key?.match(/\|protocol=([^|%]+)%40([^|]+)/)
  return {
    id: metadataId ?? decodeURIComponent(keyMatch?.[1] ?? 'unknown'),
    version: group.protocol_version
  }
}

function normalizeProtocol(
  value: unknown,
  errors: string[]
): { id: string; version: string } | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !isStableId(value.id)
    || typeof value.version !== 'string'
    || !/^\d+\.\d+\.\d+$/.test(value.version)
  ) {
    errors.push('Protocol selector is invalid')
    return undefined
  }
  return { id: value.id, version: value.version }
}

function optionalStableId(value: unknown, label: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !isStableId(value) || value.length > 160) {
    errors.push(`${label} identifier is invalid`)
    return undefined
  }
  return value
}

function optionalUuid(value: unknown, label: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    errors.push(`${label} identifier is invalid`)
    return undefined
  }
  return value
}

function needsActivePlan(purpose: CoachEvidenceContextPurpose): boolean {
  return ['today_session', 'weekly_review', 'adaptation_review'].includes(purpose)
}

function dateAtOrBefore(value: string, asOfDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= asOfDate
}

function subtractDays(asOf: string, days: number): string {
  return new Date(Date.parse(asOf) - days * 86_400_000).toISOString()
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function boundedObject(value: unknown, maxBytes: number): Record<string, unknown> {
  return isRecord(value) && jsonSize(value) <= maxBytes ? value : {}
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const value of values) {
    const key = keyFor(value)
    const group = grouped.get(key) ?? []
    group.push(value)
    grouped.set(key, group)
  }
  return grouped
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStableId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(value)
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function isMetricUnit(value: string): value is MetricUnit {
  return [
    'kg', 'lb', 'm', 'cm', 'in', 'km', 'mi', 's', 'ms', 'min', 'm_per_s',
    'km_per_h', 's_per_m', 'min_per_km', 'min_per_mile', 'repetitions',
    'score', 'percent', 'watts', 'bpm'
  ].includes(value)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
