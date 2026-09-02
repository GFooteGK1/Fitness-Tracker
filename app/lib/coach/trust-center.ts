import type { SupabaseClient } from '@supabase/supabase-js'

import {
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  buildObservationComparabilityKey,
  findAssessmentDefinition,
  type EvidenceSemanticRole,
  type PerformanceObservation
} from './adaptive-programming-contracts'
import { MOVEMENT_CATALOG } from './movement-catalog'

const MAX_MEMORIES = 40
const MAX_IMPORTS = 12
const MAX_PROPOSALS = 12
const MAX_PROGRESS_OBSERVATIONS = 80

export interface CoachTrustMemory {
  id: string
  memoryKey: string
  kind: string
  version: number
  summary: string
  content: Record<string, unknown>
  source: string
  confidence: number
  confirmedAt: string
  lastReviewedAt: string | null
  reviewAfter: string | null
  freshness: 'current' | 'review_due'
}

export interface CoachTrustObservationValue {
  metricId: string
  semanticRole: EvidenceSemanticRole
  value: number
  unit: string
  ordinal: number
}

export interface CoachTrustImportGroup {
  id: string
  status: 'complete' | 'incomplete'
  sourceRecordId: string
  sourceExercise: string
  observedAt: string
  mappingStatus: 'mapped' | 'ambiguous' | 'unmapped'
  canonicalMovementId: string | null
  canonicalMovementName: string | null
  candidates: Array<{ id: string; name: string }>
  protocol: string
  comparabilityKey: string | null
  comparison: Record<string, unknown>
  values: CoachTrustObservationValue[]
}

export interface CoachTrustImport {
  id: string
  sourceSystem: 'qwik_vbt'
  fileName: string
  fileHashPrefix: string
  parserVersion: string
  capturedAt: string
  sourceExportedAt: string | null
  warningCount: number
  rawStoragePolicy: 'user_retained_not_uploaded'
  groups: CoachTrustImportGroup[]
  canConfirm: boolean
  blockingReason: string | null
}

export interface CoachTrustGoal {
  id: string
  statement: string
  priority: 'primary' | 'secondary'
  target: string | null
  startsOn: string
  endsOn: string
}

export interface CoachTrustQuality {
  id: string
  goalId: string
  qualityId: string
  state: string
}

export interface CoachTrustSignalSummary {
  semanticRole: EvidenceSemanticRole
  count: number
  latestObservedAt: string | null
}

export interface CoachTrustProposal {
  id: string
  createdAt: string
  action: string
  trend: string
  evidenceStatus: string
  confidence: number | null
  includedCount: number
  excludedCount: number
  explanation: string[]
  excludedReasons: string[]
  automaticActivation: false
}

export interface CoachTrustCenter {
  generatedAt: string
  available: boolean
  unavailableReason: string | null
  memories: CoachTrustMemory[]
  imports: CoachTrustImport[]
  goals: CoachTrustGoal[]
  qualities: CoachTrustQuality[]
  signalSummary: CoachTrustSignalSummary[]
  proposals: CoachTrustProposal[]
}

interface MemoryRow {
  id: string
  memory_key: string
  kind: string
  version: number | string
  content: unknown
  provenance: unknown
  confidence: number | string
  confirmed_at: string
  review_after: string | null
  last_reviewed_at: string | null
}

interface ImportRow {
  id: string
  source_system: string
  source_file_name: string | null
  source_file_hash: string
  parser_version: string
  captured_at: string
  manifest: unknown
}

export interface TrustObservationGroupRow {
  id: string
  source_import_id: string | null
  status: string
  observed_at: string
  captured_at: string
  source_system: string
  source_device: string
  source_record_id: string
  assessment_definition_id: string
  assessment_catalog_version: string
  protocol_version: string
  parser_version: string
  comparability_key: string | null
  comparison_modifiers: unknown
  metadata: unknown
}

interface ObservationValueRow {
  id: string
  group_id: string
  metric_id: string
  semantic_role: string
  value_numeric: number | string | null
  unit: string | null
  ordinal: number | string
  status: string
}

interface ProposalRow {
  id: string
  rationale: unknown
  created_at: string
}

interface ProgramRow {
  active_plan_version_id: string | null
}

interface PlanRow {
  intent: unknown
}

export async function fetchCoachTrustCenter(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<CoachTrustCenter> {
  const [memoryResult, importResult, proposalResult, programResult, progressGroupResult] = await Promise.all([
    supabase
      .from('coach_memories')
      .select('id, memory_key, kind, version, content, provenance, confidence, confirmed_at, review_after, last_reviewed_at')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(MAX_MEMORIES),
    supabase
      .from('measurement_imports')
      .select('id, source_system, source_file_name, source_file_hash, parser_version, captured_at, manifest')
      .eq('user_id', userId)
      .eq('source_system', 'qwik_vbt')
      .eq('status', 'pending_review')
      .order('captured_at', { ascending: false })
      .limit(MAX_IMPORTS),
    supabase
      .from('adaptation_proposals')
      .select('id, rationale, created_at')
      .eq('user_id', userId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(MAX_PROPOSALS),
    supabase
      .from('training_programs')
      .select('active_plan_version_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1),
    supabase
      .from('performance_observation_groups')
      .select('id, source_import_id, status, observed_at, captured_at, source_system, source_device, source_record_id, assessment_definition_id, assessment_catalog_version, protocol_version, parser_version, comparability_key, comparison_modifiers, metadata')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .eq('verification_status', 'athlete_confirmed')
      .order('observed_at', { ascending: false })
      .limit(MAX_PROGRESS_OBSERVATIONS)
  ])

  const firstError = [memoryResult, importResult, proposalResult, programResult, progressGroupResult]
    .find(result => result.error)?.error
  if (firstError) return unavailableCenter('Coach trust storage is not available yet')

  const imports = (importResult.data ?? []) as ImportRow[]
  const importIds = imports.map(item => item.id)
  const pendingGroupResult = importIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from('performance_observation_groups')
      .select('id, source_import_id, status, observed_at, captured_at, source_system, source_device, source_record_id, assessment_definition_id, assessment_catalog_version, protocol_version, parser_version, comparability_key, comparison_modifiers, metadata')
      .eq('user_id', userId)
      .in('source_import_id', importIds)
      .in('status', ['complete', 'incomplete'])
      .order('observed_at', { ascending: true })
      .limit(1000)

  if (pendingGroupResult.error) return unavailableCenter('Coach import review storage is not available yet')

  const pendingGroups = (pendingGroupResult.data ?? []) as TrustObservationGroupRow[]
  const progressGroups = (progressGroupResult.data ?? []) as TrustObservationGroupRow[]
  const allGroupIds = [...new Set([...pendingGroups, ...progressGroups].map(group => group.id))]
  const valueResult = allGroupIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from('performance_observation_values')
      .select('id, group_id, metric_id, semantic_role, value_numeric, unit, ordinal, status')
      .eq('user_id', userId)
      .in('group_id', allGroupIds)
      .eq('status', 'complete')
      .order('ordinal', { ascending: true })
      .limit(100000)
  if (valueResult.error) return unavailableCenter('Coach measurement review storage is not available yet')

  const activePlanVersionId = ((programResult.data ?? [])[0] as ProgramRow | undefined)
    ?.active_plan_version_id ?? null
  const planResult = activePlanVersionId
    ? await supabase
      .from('training_plan_versions')
      .select('intent')
      .eq('user_id', userId)
      .eq('id', activePlanVersionId)
      .eq('status', 'accepted')
      .limit(1)
    : { data: [], error: null }
  if (planResult.error) return unavailableCenter('Coach plan progress storage is not available yet')

  const values = (valueResult.data ?? []) as ObservationValueRow[]
  const valuesByGroup = groupValues(values)
  const planIntent = ((planResult.data ?? [])[0] as PlanRow | undefined)?.intent
  const progress = normalizeProgress(planIntent, progressGroups, valuesByGroup)

  return {
    generatedAt: now.toISOString(),
    available: true,
    unavailableReason: null,
    memories: ((memoryResult.data ?? []) as MemoryRow[])
      .map(row => normalizeMemory(row, now))
      .filter((item): item is CoachTrustMemory => item !== null),
    imports: imports.map(item => normalizeImport(item, pendingGroups, valuesByGroup)),
    goals: progress.goals,
    qualities: progress.qualities,
    signalSummary: progress.signalSummary,
    proposals: ((proposalResult.data ?? []) as ProposalRow[])
      .map(normalizeProposal)
      .filter((item): item is CoachTrustProposal => item !== null)
  }
}

export function buildConfirmedQwikMapping(
  group: TrustObservationGroupRow,
  importRow: Pick<ImportRow, 'source_file_hash'>,
  movementId: string,
  firstVelocity: number
): { comparison: Record<string, unknown>; comparabilityKey: string; movementName: string } | null {
  const metadata = asRecord(group.metadata)
  const candidates = stringArray(metadata.candidateMovementIds)
  const movement = MOVEMENT_CATALOG.find(item => item.id === movementId)
  const comparison = asRecord(group.comparison_modifiers)
  if (
    !movement
    || metadata.mappingStatus !== 'ambiguous'
    || !candidates.includes(movementId)
    || !Number.isFinite(firstVelocity)
    || firstVelocity <= 0
  ) return null

  const resolvedComparison: PerformanceObservation['comparison'] = {
    movementId: movement.id,
    variationId: movement.progressionFamily,
    repetitions: positiveInteger(comparison.repetitions),
    externalLoad: measurementQuantity(comparison.externalLoad),
    distance: null,
    duration: null,
    equipmentIds: [...movement.equipment],
    techniqueModifiers: stringArray(comparison.techniqueModifiers),
    environmentModifiers: stringArray(comparison.environmentModifiers)
  }
  const definition = findAssessmentDefinition('strength.fixed_load_velocity')
  if (!definition) return null
  const observation: PerformanceObservation = {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id: `qwik:${group.source_record_id}:athlete-map`,
    kind: 'strength_set',
    semanticRole: 'direct_outcome',
    status: 'complete',
    metric: { metricId: 'bar.mean_velocity', value: firstVelocity, unit: 'm_per_s' },
    observedAt: group.observed_at,
    capturedAt: group.captured_at,
    assessmentDefinition: { id: definition.id, version: definition.version },
    protocol: { id: definition.protocol.id, version: definition.protocol.version },
    source: {
      kind: 'import',
      system: 'qwik_vbt',
      recordId: group.source_record_id,
      fingerprint: importRow.source_file_hash,
      deviceId: group.source_device
    },
    comparison: resolvedComparison,
    completion: { missingFields: [] },
    exclusion: null,
    supersededByObservationId: null,
    derivedFromObservationIds: []
  }
  const key = buildObservationComparabilityKey(observation)
  return key.ok
    ? { comparison: resolvedComparison, comparabilityKey: key.key, movementName: movement.name }
    : null
}

function normalizeMemory(row: MemoryRow, now: Date): CoachTrustMemory | null {
  const content = asRecord(row.content)
  const provenance = asRecord(row.provenance)
  const confidence = finiteNumber(row.confidence)
  const version = positiveInteger(row.version)
  if (!row.id || !row.memory_key || confidence === null || version === null) return null
  return {
    id: row.id,
    memoryKey: row.memory_key,
    kind: row.kind,
    version,
    summary: memorySummary(row.memory_key, content),
    content,
    source: sourceLabel(provenance.source),
    confidence,
    confirmedAt: row.confirmed_at,
    lastReviewedAt: row.last_reviewed_at,
    reviewAfter: row.review_after,
    freshness:
      row.review_after && Number.isFinite(Date.parse(row.review_after)) && Date.parse(row.review_after) <= now.getTime()
        ? 'review_due'
        : 'current'
  }
}

function normalizeImport(
  row: ImportRow,
  groups: TrustObservationGroupRow[],
  valuesByGroup: Map<string, CoachTrustObservationValue[]>
): CoachTrustImport {
  const manifest = asRecord(row.manifest)
  const normalizedGroups = groups
    .filter(group => group.source_import_id === row.id)
    .map(group => normalizeImportGroup(group, valuesByGroup.get(group.id) ?? []))
  const hasUnmapped = normalizedGroups.some(group => group.mappingStatus === 'unmapped')
  const hasEmptyCandidates = normalizedGroups.some(group => (
    group.mappingStatus === 'ambiguous' && group.candidates.length === 0
  ))
  return {
    id: row.id,
    sourceSystem: 'qwik_vbt',
    fileName: row.source_file_name ?? 'Qwik export',
    fileHashPrefix: row.source_file_hash.slice(0, 12),
    parserVersion: row.parser_version,
    capturedAt: row.captured_at,
    sourceExportedAt: stringOrNull(manifest.sourceExportedAt),
    warningCount: nonNegativeInteger(manifest.warningCount) ?? 0,
    rawStoragePolicy: 'user_retained_not_uploaded',
    groups: normalizedGroups,
    canConfirm: normalizedGroups.length > 0 && !hasUnmapped && !hasEmptyCandidates,
    blockingReason: hasUnmapped
      ? 'At least one exercise has no supported movement match. Reject this import and try again after the catalog supports it.'
      : hasEmptyCandidates ? 'At least one exercise has no selectable movement.' : null
  }
}

function normalizeImportGroup(
  row: TrustObservationGroupRow,
  values: CoachTrustObservationValue[]
): CoachTrustImportGroup {
  const metadata = asRecord(row.metadata)
  const mappingStatus = ['mapped', 'ambiguous', 'unmapped'].includes(String(metadata.mappingStatus))
    ? metadata.mappingStatus as CoachTrustImportGroup['mappingStatus']
    : 'unmapped'
  const candidateIds = stringArray(metadata.candidateMovementIds)
  return {
    id: row.id,
    status: row.status === 'complete' ? 'complete' : 'incomplete',
    sourceRecordId: row.source_record_id,
    sourceExercise: stringOrNull(metadata.sourceExercise) ?? 'Unknown exercise',
    observedAt: row.observed_at,
    mappingStatus,
    canonicalMovementId: stringOrNull(metadata.canonicalMovementId),
    canonicalMovementName: stringOrNull(metadata.canonicalMovementName),
    candidates: candidateIds.map(id => {
      const movement = MOVEMENT_CATALOG.find(item => item.id === id)
      return { id, name: movement?.name ?? id }
    }),
    protocol: stringOrNull(metadata.protocolId) ?? 'qwik-video-vbt-fixed-load',
    comparabilityKey: row.comparability_key,
    comparison: asRecord(row.comparison_modifiers),
    values
  }
}

function normalizeProgress(
  intentValue: unknown,
  groups: TrustObservationGroupRow[],
  valuesByGroup: Map<string, CoachTrustObservationValue[]>
): Pick<CoachTrustCenter, 'goals' | 'qualities' | 'signalSummary'> {
  const intent = asRecord(intentValue)
  const adaptive = asRecord(intent.adaptive_programming)
  const goals = arrayRecords(adaptive.goals).flatMap(item => {
    const horizon = asRecord(item.horizon)
    const id = stringOrNull(item.goalId)
    const statement = stringOrNull(item.statement)
    const startsOn = stringOrNull(horizon.startsOn)
    const endsOn = stringOrNull(horizon.endsOn)
    if (!id || !statement || !startsOn || !endsOn) return []
    return [{
      id,
      statement,
      priority: item.priority === 'secondary' ? 'secondary' as const : 'primary' as const,
      target: goalTargetLabel(item.target),
      startsOn,
      endsOn
    }]
  })
  const qualities = arrayRecords(adaptive.qualityEmphases).flatMap(item => {
    const id = stringOrNull(item.id)
    const goalId = stringOrNull(item.goalId)
    const qualityId = stringOrNull(item.qualityId)
    const state = stringOrNull(item.state)
    return id && goalId && qualityId && state ? [{ id, goalId, qualityId, state }] : []
  })
  const summary = new Map<EvidenceSemanticRole, { count: number; latest: string | null }>()
  for (const group of groups) {
    for (const value of valuesByGroup.get(group.id) ?? []) {
      const current = summary.get(value.semanticRole) ?? { count: 0, latest: null }
      current.count += 1
      if (!current.latest || group.observed_at > current.latest) current.latest = group.observed_at
      summary.set(value.semanticRole, current)
    }
  }
  return {
    goals,
    qualities,
    signalSummary: [...summary.entries()].map(([semanticRole, value]) => ({
      semanticRole,
      count: value.count,
      latestObservedAt: value.latest
    }))
  }
}

function normalizeProposal(row: ProposalRow): CoachTrustProposal | null {
  const rationale = asRecord(row.rationale)
  const snapshot = asRecord(rationale.evidenceSnapshot)
  const exclusions = Array.isArray(snapshot.excludedObservations)
    ? snapshot.excludedObservations
      .map(asRecord)
      .map(item => stringOrNull(item.reason))
      .filter((reason): reason is string => reason !== null)
    : []
  const explanation = stringArray(rationale.explanation).slice(0, 4)
  const id = stringOrNull(row.id)
  if (!id || rationale.automaticPlanActivation !== false) return null
  return {
    id,
    createdAt: row.created_at,
    action: stringOrNull(rationale.action) ?? 'hold_collect_more',
    trend: stringOrNull(rationale.trend) ?? 'unknown',
    evidenceStatus: stringOrNull(rationale.evidenceStatus) ?? 'insufficient',
    confidence: finiteNumber(rationale.confidence),
    includedCount: stringArray(snapshot.includedObservationIds).length,
    excludedCount: exclusions.length,
    explanation: explanation.length > 0
      ? explanation
      : [`Coach proposed ${titleCase(stringOrNull(rationale.action) ?? 'hold_collect_more')} after reviewing repeated compatible evidence.`],
    excludedReasons: [...new Set(exclusions)].slice(0, 4),
    automaticActivation: false
  }
}

function groupValues(rows: ObservationValueRow[]): Map<string, CoachTrustObservationValue[]> {
  const result = new Map<string, CoachTrustObservationValue[]>()
  for (const row of rows) {
    const value = finiteNumber(row.value_numeric)
    const ordinal = nonNegativeInteger(row.ordinal)
    if (
      value === null
      || ordinal === null
      || !row.unit
      || !isSemanticRole(row.semantic_role)
    ) continue
    const current = result.get(row.group_id) ?? []
    current.push({
      metricId: row.metric_id,
      semanticRole: row.semantic_role,
      value,
      unit: row.unit,
      ordinal
    })
    result.set(row.group_id, current)
  }
  return result
}

function memorySummary(key: string, content: Record<string, unknown>): string {
  if (key === 'primary_goal') return stringOrNull(content.goal) ?? 'Goal needs review'
  if (key === 'training_schedule') {
    const days = stringArray(content.trainingDays).map(titleCase).join(', ')
    const minutes = finiteNumber(content.sessionMinutes)
    return [days, minutes === null ? null : `${minutes} minutes per session`]
      .filter(Boolean).join(' · ') || 'Schedule needs review'
  }
  if (key === 'available_equipment') return stringOrNull(content.equipment) ?? 'Equipment needs review'
  if (key === 'training_constraints') return stringOrNull(content.constraints) || 'No stated training constraints'
  return Object.entries(content)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .slice(0, 3)
    .map(([label, value]) => `${titleCase(label)}: ${String(value)}`)
    .join(' · ') || 'Confirmed coach memory'
}

function sourceLabel(value: unknown): string {
  const source = stringOrNull(value)
  if (source === 'program_setup') return 'Confirmed in Program setup'
  if (source === 'athlete_correction') return 'Corrected by you'
  return source ? titleCase(source) : 'Confirmed by you'
}

function goalTargetLabel(value: unknown): string | null {
  const target = asRecord(value)
  const metric = asRecord(target.metric)
  const amount = finiteNumber(metric.value)
  const unit = stringOrNull(metric.unit)
  return amount === null || !unit ? null : `${amount} ${unit.replaceAll('_', ' ')}`
}

function unavailableCenter(reason: string): CoachTrustCenter {
  return {
    generatedAt: new Date().toISOString(),
    available: false,
    unavailableReason: reason,
    memories: [],
    imports: [],
    goals: [],
    qualities: [],
    signalSummary: [],
    proposals: []
  }
}

function measurementQuantity(value: unknown): PerformanceObservation['comparison']['externalLoad'] {
  const object = asRecord(value)
  const amount = finiteNumber(object.value)
  const unit = stringOrNull(object.unit)
  return amount !== null && (unit === 'kg' || unit === 'lb') ? { value: amount, unit } : null
}

function isSemanticRole(value: string): value is EvidenceSemanticRole {
  return ['target', 'estimate', 'proxy', 'training_signal', 'direct_outcome'].includes(value)
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter(item => Object.keys(item).length > 0) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function positiveInteger(value: unknown): number | null {
  const parsed = finiteNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
