/** Review authority contracts only. Neither enrollment nor approval enables issuance. */
import { parseReviewedRollingWeek } from './reviewed-week-plan-contract'

export type SupervisedOperation = 'same_week' | 'next_week'
export interface SupervisedReviewPacket {
  schemaVersion: 1
  reviewMode: 'manual_complete_week'
  week: NonNullable<ReturnType<typeof parseReviewedRollingWeek>>
  baseWeek: NonNullable<ReturnType<typeof parseReviewedRollingWeek>>
  rationale: string
  changes: Array<{ kind: 'changed' | 'preserved' | 'removed'; summary: string; sessionIds: string[] }>
  evidence: Array<{ sourceId: string; summary: string }>
  evidenceSource: { sourceHash: string; revision: number; historyThrough: string; historyDays: number }
  limitations: string[]
}
export interface SupervisedEnrollment {
  enrollmentId: string; programId: string; userId: string; reviewerId: string
  version: number; enabled: boolean; expiresAt: string; operations: SupervisedOperation[]
}
export interface SupervisedCandidateReview {
  candidateId: string; enrollmentId: string; enrollmentVersion: number
  programId: string; userId: string; reviewerId: string; basePlanVersionId: string
  transition: SupervisedOperation
  /** Opaque database-computed SHA256 of the complete reviewer-visible JSONB packet. */
  contentHash: string
  /** Existing authenticated source-context digest, supplied by the trusted server adapter. */
  sourceHash: string
  reviewPacket: SupervisedReviewPacket
  createdAt: string
}
export interface SupervisedDecisionReceipt {
  candidateId: string; decisionId: string; requestId: string; decision: 'approve' | 'reject'
  reviewerId: string; enrollmentId: string; enrollmentVersion: number
  contentHash: string; sourceHash: string; decidedAt: string; replayed: boolean
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(',') === [...expected].sort().join(',')
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const list = (value: unknown, max: number, validate: (item: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.length <= max && value.every(validate)

/** Exact nested field whitelist supplements legacy tolerant semantic decoders.
 * `scalar` rejects objects/arrays; `[]name` descends into every array element.
 * Existing optional profile structures retain their meaning and full content.
 */
export const SUPERVISED_REVIEW_SHAPES: Record<string, Record<string, string>> = {
  week: { kind: 'scalar', format: 'scalar', schemaVersion: 'scalar', title: 'scalar', sequenceNumber: 'scalar', windowStart: 'scalar', windowEnd: 'scalar', profileSnapshot: 'profile', directionSnapshot: 'direction', basis: 'basis', baseSchedule: 'schedule', scheduledSessions: '[]slot', spacing: '[]spacing', instructions: '[]scalar', limitations: '[]scalar', adaptiveEvaluation: 'scalar' },
  profile: { schemaVersion: 'scalar', kernelVersion: 'scalar', athleteGoalSummary: 'scalar', primaryGoal: 'allocation', secondaryGoals: '[]allocation', trainingExperience: 'scalar', startDate: 'scalar', sessionAvailability: '[]availability', equipment: 'equipment', explicitConstraints: '[]constraint', unresolvedConstraintNote: 'scalar', preferences: '[]preference', assessments: '[]assessment', recentTraining: 'recent', inputSource: 'inputSource', exercisePreferences: 'exercisePreferences', preferenceNotes: '[]scalar', executionPriority: 'executionPriority', trainingIntent: 'intentSnapshot', planningContext: 'planningContext', prescriptionBasis: 'prescriptionBasis' },
  allocation: { id: 'scalar', domain: 'scalar', role: 'scalar', allocation: 'scalar', athleteIntent: 'scalar', outcome: 'outcome' },
  outcome: { statement: 'scalar', kind: 'scalar', horizon: 'horizon', target: 'goalTarget' },
  horizon: { startsOn: 'scalar', endsOn: 'scalar' },
  availability: { day: 'scalar', minutes: 'scalar' },
  equipment: { resolvedIds: '[]scalar', unresolvedAthleteDescription: 'scalar' },
  constraint: { id: 'scalar', kind: 'scalar', description: 'scalar', source: 'scalar' },
  preference: { movementId: 'scalar', preference: 'scalar', source: 'scalar' },
  assessment: { id: 'scalar', movement: 'scalar', variation: 'scalar', load: 'scalar', unit: 'scalar', reps: 'scalar', assessedOn: 'scalar', isTrueRepMax: 'scalar', rir: 'scalar', rpe: 'scalar', athleteConfidence: 'scalar', estimatedOneRepMax: 'scalar', estimateKind: 'scalar', calculatorVersion: 'scalar' },
  recent: { asOfDate: 'scalar', lookbackDays: 'scalar', completedSessionCount: 'scalar', performedMovementIds: '[]scalar', doseByCoverageTarget: '[]coverageDose' },
  coverageDose: { kind: 'scalar', targetId: 'scalar', unit: 'scalar', amount: 'scalar' },
  inputSource: { kind: 'scalar', snapshot: 'legacyInput' },
  legacyInput: { primaryDomain: 'scalar', goal: 'scalar', experience: 'scalar', trainingDays: '[]scalar', sessionMinutes: 'scalar', equipment: 'scalar', constraints: 'scalar', startDate: 'scalar' },
  exercisePreferences: { schemaVersion: 'scalar', state: 'scalar', entries: '[]exercisePreferenceEntry' },
  exercisePreferenceEntry: { athleteWording: 'scalar', target: 'exercisePreferenceTarget' },
  exercisePreferenceTarget: { kind: 'scalar', id: 'scalar' },
  executionPriority: { goalId: 'scalar', movementId: 'scalar' },
  intentSnapshot: { schemaVersion: 'scalar', memoryId: 'scalar', memoryVersion: 'scalar', content: 'intentContent' },
  intentContent: { schemaVersion: 'scalar', outcomes: '[]planningOutcome', priorityOrder: '[]scalar', event: 'event', confirmedAt: 'scalar' },
  planningOutcome: { goal: 'goal', domain: 'scalar', measurement: 'measurement', binding: 'goalBinding', baseline: 'baseline', capability: 'capability' },
  goal: { schemaVersion: 'scalar', id: 'scalar', kind: 'scalar', statement: 'scalar', priority: 'scalar', status: 'scalar', target: 'goalTarget', targetDate: 'scalar', requiredQualityIds: '[]scalar', source: 'goalSource' },
  goalTarget: { role: 'scalar', comparison: 'scalar', metric: 'metric', upperMetric: 'metric', assessmentDefinition: 'pair', protocol: 'pair' },
  metric: { metricId: 'scalar', value: 'scalar', unit: 'scalar' },
  pair: { id: 'scalar', version: 'scalar' },
  goalSource: { kind: 'scalar', confirmedAt: 'scalar' },
  measurement: { metricId: 'scalar', unit: 'scalar', assessmentDefinition: 'pair', protocol: 'pair' },
  goalBinding: { movementId: 'scalar', distance: 'quantity', equipmentIds: '[]scalar', variation: 'scalar', assessmentContext: 'assessmentContext' },
  quantity: { value: 'scalar', unit: 'scalar' },
  assessmentContext: { repetitions: 'scalar', externalLoad: 'quantity', duration: 'quantity', techniqueModifiers: '[]scalar', environmentModifiers: '[]scalar' },
  baseline: { status: 'scalar', observationId: 'scalar' },
  capability: { status: 'scalar', reason: 'scalar' },
  event: { name: 'scalar', goalIds: '[]scalar', date: 'scalar' },
  planningContext: { version: 'scalar', mode: 'scalar', userId: 'scalar', asOf: 'scalar', startsOn: 'scalar', endsOn: 'scalar', status: 'scalar', retrievalComplete: 'scalar', loggingCoverage: 'scalar', sourceIds: '[]scalar', movements: '[]contextMovement', missing: '[]scalar', outsideTraining: 'outsideTraining' },
  contextMovement: { movementId: 'scalar', workoutId: 'scalar', sourcePath: 'scalar', eventDate: 'scalar', capturedAt: 'scalar', revision: 'scalar', snapshotId: 'scalar', origin: 'scalar', reviewState: 'scalar', completionId: 'scalar', familiarityEligible: 'scalar' },
  outsideTraining: { status: 'scalar', sourceIds: '[]scalar', notes: '[]scalar' },
  prescriptionBasis: { version: 'scalar', numericalBasis: 'scalar', numericPolicyEligible: 'scalar', historyAsOf: 'scalar', sourceIds: '[]scalar', familiarityMovementIds: '[]scalar', restrictions: '[]scalar', equipmentIds: '[]scalar', missing: '[]scalar', statement: 'scalar' },
  direction: { schemaVersion: 'scalar', goalSummary: 'scalar', goalTargetDate: 'scalar', currentEmphasis: '[]emphasis', hypothesis: 'scalar', constraintIds: '[]scalar', trainingIntent: 'intentSnapshot' },
  emphasis: { goalAllocationId: 'scalar', domain: 'scalar', allocation: 'scalar' },
  basis: { recipeId: 'scalar', recipeHash: 'scalar', contextHash: 'scalar', scheduleId: 'scalar', reason: 'scalar' },
  schedule: { monday: 'scalar', tuesday: 'scalar', wednesday: 'scalar', thursday: 'scalar', friday: 'scalar', saturday: 'scalar', sunday: 'scalar' },
  slot: { scheduledDate: 'scalar', prescription: 'prescription' },
  spacing: { from: 'scalar', to: 'scalar', baseDays: 'scalar', selectedDays: 'scalar' },
  prescription: { format: 'scalar', schemaVersion: 'scalar', policyVersion: 'scalar', sessionId: 'scalar', day: 'scalar', title: 'scalar', intent: 'scalar', scheduledMinutes: 'scalar', estimatedSeconds: 'scalar', content: 'session', protocols: '[]protocol', source: 'source' },
  session: { id: 'scalar', steps: '[]step', themes: '[]scalar', instructions: '[]scalar', conditionalTiming: 'conditionalTiming', optionalTail: 'optionalTail' },
  conditionalTiming: { kind: 'scalar', whenOverBudget: 'scalar' },
  optionalTail: { fromStepId: 'scalar', reason: 'scalar' },
  step: { kind: 'scalar', id: 'scalar', movementId: 'scalar', role: 'scalar', requiredEquipment: '[]scalar', sets: 'scalar', work: 'work', load: 'load', effort: 'effort', restBetweenSeconds: 'rest', restAfterSeconds: 'rest', protocolId: 'scalar', instructions: '[]scalar', seconds: 'scalar', activities: '[]step', purpose: 'scalar' },
  work: { kind: 'scalar', repetitions: 'range', sides: 'scalar', secondsPerRep: 'scalar', targetRir: 'scalar', estimatedSecondsPerSet: 'scalar', sideSwitchSeconds: 'scalar', seconds: 'scalar', stages: '[]stage', targetSeconds: 'scalar', allowanceSeconds: 'scalar', finish: 'scalar' },
  range: { min: 'scalar', max: 'scalar' },
  stage: { label: 'scalar', metres: 'scalar' },
  load: { kind: 'scalar', value: 'scalar', unit: 'scalar', convention: 'scalar', instruction: 'scalar' },
  effort: { kind: 'scalar', min: 'scalar', max: 'scalar', cue: 'scalar' },
  rest: { kind: 'scalar', estimatedSeconds: 'scalar' },
  protocol: { id: 'scalar', sessionId: 'scalar', activityId: 'scalar', instructions: '[]scalar', sensorMetadata: 'scalar', actualObservations: '[]scalar' },
  source: { recipeId: 'scalar', recipeHash: 'scalar', review: 'review', sources: '[]sourceBinding' },
  review: { id: 'scalar', contentHash: 'scalar' },
  sourceBinding: { id: 'scalar', revision: 'scalar', contentHash: 'scalar' },
}

export function hasOnlySupervisedReviewFields(value: unknown, shape = 'week', depth = 0): boolean {
  if (depth > 30) return false
  if (value === null) return true // Semantic decoders decide where null is valid.
  if (shape === 'scalar') return ['string', 'number', 'boolean'].includes(typeof value)
  if (shape === 'rest' && typeof value === 'number') return true
  if (shape.startsWith('[]')) return Array.isArray(value) && value.every(item => hasOnlySupervisedReviewFields(item, shape.slice(2), depth + 1))
  const fields = SUPERVISED_REVIEW_SHAPES[shape]
  return record(value) && !!fields && Object.entries(value).every(([key, child]) => Object.hasOwn(fields, key)
    && hasOnlySupervisedReviewFields(child, fields[key], depth + 1))
}

/** No raw source tables or private registration packet can hide in this projection.
 * Evidence summaries still require a trusted server-selected provenance boundary.
 */
export function parseSupervisedReviewPacket(value: unknown): SupervisedReviewPacket | null {
  try {
  if (!record(value) || !keys(value, ['schemaVersion', 'reviewMode', 'week', 'baseWeek', 'rationale', 'changes', 'evidence', 'evidenceSource', 'limitations'])
    || value.schemaVersion !== 1 || value.reviewMode !== 'manual_complete_week' || !text(value.rationale, 4000)) return null
  const week = parseReviewedRollingWeek(value.week)
  const baseWeek = parseReviewedRollingWeek(value.baseWeek)
  if (!week || !baseWeek || !hasOnlySupervisedReviewFields(week) || !hasOnlySupervisedReviewFields(baseWeek)
    || !record(value.evidenceSource) || !keys(value.evidenceSource, ['sourceHash', 'revision', 'historyThrough', 'historyDays'])
    || typeof value.evidenceSource.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.evidenceSource.sourceHash)
    || !Number.isSafeInteger(value.evidenceSource.revision) || Number(value.evidenceSource.revision) < 0
    || typeof value.evidenceSource.historyThrough !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.evidenceSource.historyThrough)
    || !Number.isSafeInteger(value.evidenceSource.historyDays) || Number(value.evidenceSource.historyDays) < 1 || Number(value.evidenceSource.historyDays) > 366) return null
  const ids = new Set([...week.scheduledSessions, ...baseWeek.scheduledSessions].map(slot => slot.prescription.content.id))
  if (!list(value.changes, 64, item => record(item) && keys(item, ['kind', 'summary', 'sessionIds'])
    && ['changed', 'preserved', 'removed'].includes(item.kind as string) && text(item.summary, 1000)
    && list(item.sessionIds, 7, id => typeof id === 'string' && ids.has(id))
    && new Set(item.sessionIds as string[]).size === (item.sessionIds as string[]).length)
    || !list(value.evidence, 64, item => record(item) && keys(item, ['sourceId', 'summary']) && text(item.sourceId, 200) && text(item.summary, 4000))
    || !list(value.limitations, 32, item => text(item, 1000)) || !value.limitations.length || !value.changes.length
    || JSON.stringify(value).length > 1000000) return null
  return structuredClone({ ...value, week, baseWeek }) as unknown as SupervisedReviewPacket
  } catch { return null }
}

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const validTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
export function parseSupervisedCandidateReview(value: unknown): SupervisedCandidateReview | null {
  if (!record(value) || !keys(value, ['candidateId', 'enrollmentId', 'enrollmentVersion', 'programId', 'userId',
    'reviewerId', 'basePlanVersionId', 'transition', 'contentHash', 'sourceHash', 'reviewPacket', 'createdAt'])
    || ![value.candidateId, value.enrollmentId, value.programId, value.userId, value.reviewerId, value.basePlanVersionId].every(uuid)
    || !Number.isSafeInteger(value.enrollmentVersion) || Number(value.enrollmentVersion) < 1
    || !['same_week', 'next_week'].includes(String(value.transition)) || !hash(value.contentHash) || !hash(value.sourceHash)
    || !validTime(value.createdAt)) return null
  const reviewPacket = parseSupervisedReviewPacket(value.reviewPacket)
  if (!reviewPacket || reviewPacket.evidenceSource.sourceHash !== value.sourceHash) return null
  return { ...structuredClone(value), reviewPacket } as unknown as SupervisedCandidateReview
}

export function parseSupervisedDecisionReceipt(value: unknown): SupervisedDecisionReceipt | null {
  if (!record(value) || !keys(value, ['candidateId', 'decisionId', 'requestId', 'decision', 'reviewerId', 'enrollmentId',
    'enrollmentVersion', 'contentHash', 'sourceHash', 'decidedAt', 'replayed'])
    || ![value.candidateId, value.decisionId, value.requestId, value.reviewerId, value.enrollmentId].every(uuid)
    || !Number.isSafeInteger(value.enrollmentVersion) || Number(value.enrollmentVersion) < 1
    || !['approve', 'reject'].includes(String(value.decision)) || !hash(value.contentHash) || !hash(value.sourceHash)
    || !validTime(value.decidedAt) || typeof value.replayed !== 'boolean') return null
  return structuredClone(value) as unknown as SupervisedDecisionReceipt
}

export interface SupervisedReviewDecision {
  expectedUserId: string; candidateId: string; requestId: string; decision: 'approve' | 'reject'
  enrollmentId: string; contentHash: string; sourceHash: string
}
export function parseSupervisedReviewDecision(value: unknown): SupervisedReviewDecision | null {
  if (!record(value) || !keys(value, ['expectedUserId', 'candidateId', 'requestId', 'decision', 'enrollmentId', 'contentHash', 'sourceHash'])
    || ![value.expectedUserId, value.candidateId, value.requestId, value.enrollmentId].every(uuid)
    || !['approve', 'reject'].includes(String(value.decision)) || !hash(value.contentHash) || !hash(value.sourceHash)) return null
  return structuredClone(value) as unknown as SupervisedReviewDecision
}
