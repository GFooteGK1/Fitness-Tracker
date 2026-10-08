/** Browser-safe first-onboarding input/read contracts. These confer no authority. */
import { isValidTimezoneOffset } from '../timezone-utils'
import { isSupervisedJson } from './supervised-candidate-draft'
import { parseReviewedRollingWeek } from './reviewed-week-plan-contract'
import { hasOnlySupervisedReviewFields, type SupervisedReviewPacket } from './supervised-programming-contract'
import { validateProgrammingProfile, validateReviewedProgrammingProfile, type ProgrammingProfile } from './programming-schema'
import type { SupervisedCandidateDraft } from './supervised-candidate-draft'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'
import type { FirstReviewedProfileProjection } from './first-reviewed-profile-contract'

export interface FirstReviewedDraft {
  candidateId: string; designationId: string; programId: string; basePlanVersionId: string
  profileSnapshotId: string; profileConfirmationRequestId: string
  historyDays: number; tzOffset: number; windowStart: string; sequenceNumber: number
  confirmedTargetProfile: ProgrammingProfile; confirmedTargetProfileHash: string
  recipe: SupervisedCandidateDraft['recipe']; scheduleId: string; rationale: string
}
export interface FirstReviewDesignation {
  designationId: string; programId: string; userId: string; basePlanVersionId: string; reviewerId: string
  version: number; targetWindowStart: string; enabled: boolean; expiresAt: string
}
export interface LegacyReviewBase {
  format: 'legacy_review_base_v1'
  windowStart: string; windowEnd: string; sequenceNumber: number
  profileSnapshot: ProgrammingProfile; scheduledSessions: RollingWeeklyPlanDraft['scheduledSessions']
}
export interface FirstReviewedReviewPacket extends Omit<SupervisedReviewPacket, 'reviewMode' | 'baseWeek'> {
  reviewMode: 'manual_first_reviewed_week'; legacyBase: LegacyReviewBase
  profileFacts: { snapshotId: string; confirmationRequestId: string; projectionAsOf: string; factsHash: string
    assessments: FirstReviewedProfileProjection['assessments']; baselines: FirstReviewedProfileProjection['baselines'] }
}
export interface FirstReviewedCandidateReview {
  candidateId:string;designationId:string;designationVersion:number;programId:string;userId:string;
  reviewerId:string;basePlanVersionId:string;contentHash:string;sourceHash:string;
  reviewPacket:FirstReviewedReviewPacket;createdAt:string
}
export interface FirstReviewedDecisionReceipt {
  candidateId:string;decisionId:string;requestId:string;decision:'approve'|'reject';reviewerId:string;
  designationId:string;designationVersion:number;contentHash:string;sourceHash:string;decidedAt:string;replayed:boolean
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

export function parseFirstReviewedCandidateReview(value:unknown):FirstReviewedCandidateReview|null {
  try {
    if(!isSupervisedJson(value)||!record(value)||!exact(value,['candidateId','designationId','designationVersion','programId','userId',
      'reviewerId','basePlanVersionId','contentHash','sourceHash','reviewPacket','createdAt'])
      ||![value.candidateId,value.designationId,value.programId,value.userId,value.reviewerId,value.basePlanVersionId].every(uuid)
      ||!Number.isSafeInteger(value.designationVersion)||Number(value.designationVersion)<1||!hash(value.contentHash)||!hash(value.sourceHash)
      ||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||JSON.stringify(value).length>1100000)return null
    const packet=parseFirstReviewedReviewPacket(value.reviewPacket)
    if(!packet||packet.evidenceSource.sourceHash!==value.sourceHash)return null
    return structuredClone({...value,reviewPacket:packet}) as unknown as FirstReviewedCandidateReview
  } catch{return null}
}
export function parseFirstReviewedDecisionReceipt(value:unknown):FirstReviewedDecisionReceipt|null {
  try {
    if(!isSupervisedJson(value)||!record(value)||!exact(value,['candidateId','decisionId','requestId','decision','reviewerId','designationId',
      'designationVersion','contentHash','sourceHash','decidedAt','replayed'])
      ||![value.candidateId,value.decisionId,value.requestId,value.reviewerId,value.designationId].every(uuid)
      ||typeof value.decision!=='string'||!['approve','reject'].includes(value.decision)||!Number.isSafeInteger(value.designationVersion)
      ||Number(value.designationVersion)<1||!hash(value.contentHash)||!hash(value.sourceHash)||typeof value.replayed!=='boolean'
      ||typeof value.decidedAt!=='string'||!Number.isFinite(Date.parse(value.decidedAt)))return null
    return structuredClone(value) as unknown as FirstReviewedDecisionReceipt
  } catch{return null}
}

export function parseFirstReviewedDraft(value: unknown): FirstReviewedDraft | null {
  try {
    if (!isSupervisedJson(value) || !record(value) || !exact(value, ['candidateId', 'designationId', 'programId', 'basePlanVersionId',
      'profileSnapshotId', 'profileConfirmationRequestId', 'historyDays', 'tzOffset', 'windowStart', 'sequenceNumber', 'confirmedTargetProfile', 'confirmedTargetProfileHash', 'recipe', 'scheduleId', 'rationale'])
      || ![value.candidateId, value.designationId, value.programId, value.basePlanVersionId,value.profileSnapshotId,value.profileConfirmationRequestId].every(uuid)
      || !Number.isSafeInteger(value.historyDays) || Number(value.historyDays) < 1 || Number(value.historyDays) > 180
      || typeof value.tzOffset !== 'number' || !isValidTimezoneOffset(value.tzOffset) || !date(value.windowStart)
      || !Number.isSafeInteger(value.sequenceNumber) || Number(value.sequenceNumber) < 2 || Number(value.sequenceNumber) > 2147483647
      || !record(value.confirmedTargetProfile) || !hasOnlySupervisedReviewFields(value.confirmedTargetProfile, 'profile')
      || !validateReviewedProgrammingProfile(value.confirmedTargetProfile as unknown as ProgrammingProfile).ok || !hash(value.confirmedTargetProfileHash)
      || !record(value.recipe) || !exact(value.recipe, ['sessions', 'baseSchedule', 'schedules', 'protocols', 'instructions', 'limitations'])
      || !text(value.scheduleId, 200) || !text(value.rationale, 4000) || JSON.stringify(value).length > 500000) return null
    return structuredClone(value) as unknown as FirstReviewedDraft
  } catch { return null }
}
export function parseFirstReviewDesignation(value: unknown): FirstReviewDesignation | null {
  if (!record(value) || !exact(value, ['designationId', 'programId', 'userId', 'basePlanVersionId', 'reviewerId', 'version', 'targetWindowStart', 'enabled', 'expiresAt'])
    || ![value.designationId, value.programId, value.userId, value.basePlanVersionId, value.reviewerId].every(uuid)
    || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !date(value.targetWindowStart)
    || typeof value.enabled !== 'boolean' || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) return null
  return structuredClone(value) as unknown as FirstReviewDesignation
}

/** Exact complete legacy prescriptions, without unrelated accepted-plan metadata.
 * Unknown fields are rejected, never silently included in a reviewer projection. */
export const FIRST_LEGACY_REVIEW_SHAPES: Record<string, Record<string, string>> = {
  firstProfileFacts: { snapshotId: 'scalar', confirmationRequestId: 'scalar', projectionAsOf: 'scalar', factsHash: 'scalar', assessments: '[]assessment', baselines: '[]firstBaselineEvidence' },
  firstBaselineEvidence: { goalId: 'scalar', observationId: 'scalar', observedAt: 'scalar', source: 'scalar', measurement: 'measurement', binding: 'goalBinding', values: '[]firstBaselineValue' },
  firstBaselineValue: { id: 'scalar', ordinal: 'scalar', value: 'scalar', unit: 'scalar' },
  legacyBase: { format: 'scalar', windowStart: 'scalar', windowEnd: 'scalar', sequenceNumber: 'scalar', profileSnapshot: 'profile', scheduledSessions: '[]legacySlot' },
  legacySlot: { scheduledDate: 'scalar', prescription: 'legacySession' },
  legacySession: { schemaVersion: 'scalar', format: 'scalar', kernelVersion: 'scalar', policyVersion: 'scalar', evidenceReferenceVersion: 'scalar', movementCatalogVersion: 'scalar', weekNumber: 'scalar', day: 'scalar', sessionId: 'scalar', domain: 'scalar', title: 'scalar', intent: 'scalar', scheduledMinutes: 'scalar', blocks: '[]legacyBlock' },
  legacyBlock: { id: 'scalar', role: 'scalar', coverageRequirementIds: '[]scalar', intent: 'scalar', instructions: '[]scalar', exercises: '[]legacyExercise', estimatedMinutes: 'scalar' },
  legacyExercise: { movementId: 'scalar', movementName: 'scalar', role: 'scalar', coverageRequirementIds: '[]scalar', intent: 'scalar', dose: 'legacyDose', loadAnchor: 'legacyLoad', executionTarget: 'legacyEffort', restSeconds: 'range', successCondition: 'scalar', stopCondition: 'scalar', substitutionMovementIds: '[]scalar', substitutionGuidance: 'scalar', selectionReasons: '[]scalar', estimatedMinutes: 'scalar', fatigueCost: 'scalar', evidenceRuleIds: '[]scalar', policyVersion: 'scalar' },
  legacyDose: { kind: 'scalar', sets: 'range', repetitions: 'range', totalRepetitions: 'scalar', series: 'range', repetitionsPerSeries: 'range', workSeconds: 'range', durationMinutes: 'range', totalIntervals: 'scalar', recoverySeconds: 'range', seriesRecoverySeconds: 'range' },
  legacyLoad: { source: 'scalar', assessmentId: 'scalar', percentRange: 'range', loadRange: 'legacyLoadRange', priorSessionId: 'scalar' },
  legacyLoadRange: { min: 'scalar', max: 'scalar', unit: 'scalar' },
  legacyEffort: { kind: 'scalar', range: 'range', cue: 'scalar', baselineId: 'scalar' },
}
export function firstLegacyFieldsValid(value: unknown, shape = 'legacyBase', depth = 0): boolean {
  if (depth > 30) return false
  if (value === null) return true
  if (shape.startsWith('[]')) return Array.isArray(value) && value.every(v => firstLegacyFieldsValid(v, shape.slice(2), depth + 1))
  const fields = FIRST_LEGACY_REVIEW_SHAPES[shape]
  if (!fields) return hasOnlySupervisedReviewFields(value, shape, depth)
  return record(value) && Object.entries(value).every(([key, child]) => Object.hasOwn(fields, key)
    && firstLegacyFieldsValid(child, fields[key], depth + 1))
}
export function legacyReviewBase(plan: RollingWeeklyPlanDraft): LegacyReviewBase {
  return structuredClone({ format: 'legacy_review_base_v1', windowStart: plan.windowStart, windowEnd: plan.windowEnd,
    sequenceNumber: plan.sequenceNumber, profileSnapshot: plan.profileSnapshot, scheduledSessions: plan.scheduledSessions })
}
export function parseFirstReviewedReviewPacket(value: unknown): FirstReviewedReviewPacket | null {
  try {
    if (!isSupervisedJson(value) || !record(value) || !exact(value, ['schemaVersion', 'reviewMode', 'week', 'legacyBase', 'profileFacts', 'rationale', 'changes', 'evidence', 'evidenceSource', 'limitations'])
      || value.schemaVersion !== 1 || value.reviewMode !== 'manual_first_reviewed_week' || !text(value.rationale, 4000)) return null
    const week = parseReviewedRollingWeek(value.week), base = value.legacyBase
    if (!week || !hasOnlySupervisedReviewFields(week) || !record(base) || !firstLegacyFieldsValid(base)
      || !exact(base, ['format', 'windowStart', 'windowEnd', 'sequenceNumber', 'profileSnapshot', 'scheduledSessions'])
      || base.format !== 'legacy_review_base_v1' || !date(base.windowStart) || !date(base.windowEnd)
      || !Number.isSafeInteger(base.sequenceNumber) || Number(base.sequenceNumber) < 1
      || !record(base.profileSnapshot) || !validateProgrammingProfile(base.profileSnapshot as unknown as ProgrammingProfile).ok
      || !Array.isArray(base.scheduledSessions) || !base.scheduledSessions.length || base.scheduledSessions.length > 14
      || !base.scheduledSessions.every(s => record(s) && exact(s, ['scheduledDate', 'prescription']) && date(s.scheduledDate)
        && s.scheduledDate >= String(base.windowStart) && s.scheduledDate <= String(base.windowEnd)
        && record(s.prescription) && s.prescription.format === 'complete_programming_v0_3' && text(s.prescription.sessionId, 200))
      || !record(value.evidenceSource) || !exact(value.evidenceSource, ['sourceHash', 'revision', 'historyThrough', 'historyDays'])
      || !hash(value.evidenceSource.sourceHash) || !Number.isSafeInteger(value.evidenceSource.revision) || Number(value.evidenceSource.revision) < 0
      || !date(value.evidenceSource.historyThrough) || !Number.isSafeInteger(value.evidenceSource.historyDays)
      || Number(value.evidenceSource.historyDays) < 1 || Number(value.evidenceSource.historyDays) > 180) return null
    const facts = value.profileFacts
    if (!record(facts) || !exact(facts,['snapshotId','confirmationRequestId','projectionAsOf','factsHash','assessments','baselines'])
      || !uuid(facts.snapshotId) || !uuid(facts.confirmationRequestId) || !hash(facts.factsHash)
      || typeof facts.projectionAsOf !== 'string' || !Number.isFinite(Date.parse(facts.projectionAsOf))
      || !firstLegacyFieldsValid(facts,'firstProfileFacts') || !Array.isArray(facts.assessments) || facts.assessments.length>100
      || !Array.isArray(facts.baselines) || facts.baselines.length>8) return null
    const ids = new Set([...week.scheduledSessions.map(s => s.prescription.sessionId), ...base.scheduledSessions.map(s => (s as { prescription: { sessionId: string } }).prescription.sessionId)])
    if (!Array.isArray(value.changes) || !value.changes.length || value.changes.length > 64 || !value.changes.every(c => record(c)
      && exact(c, ['kind', 'summary', 'sessionIds']) && ['changed', 'preserved', 'removed'].includes(String(c.kind)) && text(c.summary, 1000)
      && Array.isArray(c.sessionIds) && c.sessionIds.length <= 14 && c.sessionIds.every(id => typeof id === 'string' && ids.has(id))
      && new Set(c.sessionIds).size === c.sessionIds.length)
      || !Array.isArray(value.evidence) || value.evidence.length > 64 || !value.evidence.every(e => record(e) && exact(e, ['sourceId', 'summary']) && text(e.sourceId, 200) && text(e.summary, 4000))
      || !Array.isArray(value.limitations) || !value.limitations.length || value.limitations.length > 32 || !value.limitations.every(t => text(t, 1000))
      || JSON.stringify(value).length > 1000000) return null
    return structuredClone({ ...value, week }) as unknown as FirstReviewedReviewPacket
  } catch { return null }
}
