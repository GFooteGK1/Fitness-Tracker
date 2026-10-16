/** Owner-visible first-profile contracts. These do not approve or accept a week. */
import { isValidTimezoneOffset } from '../timezone-utils'
import { isSupervisedJson } from './supervised-candidate-draft'
import { hasOnlySupervisedReviewFields } from './supervised-programming-contract'
import { validateReviewedProgrammingProfile, type ProgrammingProfile } from './programming-schema'
import type { projectFirstReviewedProfileFacts } from './first-reviewed-profile-facts'
import { firstLegacyFieldsValid } from './first-reviewed-contract'

export type FirstReviewedProfileProjection = ReturnType<typeof projectFirstReviewedProfileFacts>
export interface FirstReviewedProfileRequest {
  snapshotId: string; designationId: string; programId: string; basePlanVersionId: string
  historyDays: number; tzOffset: number; windowStart: string; targetSetup: ProgrammingProfile
}
export interface FirstReviewedProfileSnapshot {
  snapshotId: string; designationId: string; userId: string; programId: string; basePlanVersionId: string
  requestHash: string; profileHash: string; contentHash: string; sourceHash: string
  historyDays: number; historyThrough: string; tzOffset: number; revision: number
  validBefore: string; projection: FirstReviewedProfileProjection
}
export interface FirstReviewedProfileConfirmation {
  snapshotId: string; requestId: string; expectedUserId: string; contentHash: string; sourceHash: string; profileHash: string
}
export interface FirstReviewedProfileReceipt extends Omit<FirstReviewedProfileConfirmation, 'expectedUserId'> {
  userId: string; confirmedAt: string
}
export const firstProfileUuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',')
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

export function parseFirstReviewedProfileRequest(v: unknown): FirstReviewedProfileRequest | null {
  try {
    if (!isSupervisedJson(v) || !record(v) || !exact(v, ['snapshotId','designationId','programId','basePlanVersionId','historyDays','tzOffset','windowStart','targetSetup'])
      || ![v.snapshotId,v.designationId,v.programId,v.basePlanVersionId].every(firstProfileUuid)
      || !Number.isSafeInteger(v.historyDays) || Number(v.historyDays) < 1 || Number(v.historyDays) > 180
      || typeof v.tzOffset !== 'number' || !Number.isSafeInteger(v.tzOffset) || !isValidTimezoneOffset(v.tzOffset) || !day(v.windowStart)
      || !record(v.targetSetup) || !hasOnlySupervisedReviewFields(v.targetSetup,'profile')
      || !['schemaVersion','kernelVersion','athleteGoalSummary','primaryGoal','secondaryGoals','trainingExperience','startDate',
        'sessionAvailability','equipment','explicitConstraints','unresolvedConstraintNote','preferences','assessments','recentTraining','inputSource']
        .every(key=>Object.hasOwn(v.targetSetup as Record<string,unknown>,key))
      || typeof v.targetSetup.trainingExperience!=='string'||!['new_or_returning','consistent','experienced'].includes(v.targetSetup.trainingExperience)
      || !validateReviewedProgrammingProfile(v.targetSetup as unknown as ProgrammingProfile).ok
      || v.targetSetup.startDate !== v.windowStart || JSON.stringify(v).length > 500000) return null
    return structuredClone(v) as unknown as FirstReviewedProfileRequest
  } catch { return null }
}
export function parseFirstReviewedProfileSnapshot(v: unknown): FirstReviewedProfileSnapshot | null {
  try {
    if (!isSupervisedJson(v) || !record(v) || !exact(v, ['snapshotId','designationId','userId','programId','basePlanVersionId','requestHash','profileHash','contentHash','sourceHash',
      'historyDays','historyThrough','tzOffset','revision','validBefore','projection'])
      || ![v.snapshotId,v.designationId,v.userId,v.programId,v.basePlanVersionId].every(firstProfileUuid)
      || ![v.requestHash,v.profileHash,v.contentHash,v.sourceHash].every(hash)
      || !Number.isSafeInteger(v.historyDays) || Number(v.historyDays) < 1 || Number(v.historyDays) > 180
      || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || !day(v.historyThrough)
      || typeof v.tzOffset !== 'number' || !Number.isSafeInteger(v.tzOffset) || !isValidTimezoneOffset(v.tzOffset) || !timestamp(v.validBefore)
      || !record(v.projection) || !exact(v.projection, ['schemaVersion','projectionAsOf','sourceHash','profile','baselines','assessments','factsHash','numericRuntimeEligible'])
      || v.projection.schemaVersion !== 'first-reviewed-profile-facts-1' || v.projection.sourceHash !== v.sourceHash
      || !timestamp(v.projection.projectionAsOf) || Date.parse(v.projection.projectionAsOf) >= Date.parse(v.validBefore)
      || v.projection.numericRuntimeEligible !== false || !hash(v.projection.factsHash)
      || !record(v.projection.profile) || !hasOnlySupervisedReviewFields(v.projection.profile,'profile')
      || !validateReviewedProgrammingProfile(v.projection.profile as unknown as ProgrammingProfile).ok
      || !Array.isArray(v.projection.baselines) || v.projection.baselines.length > 8
      || !firstLegacyFieldsValid(v.projection.baselines,'[]firstBaselineEvidence')
      || !Array.isArray(v.projection.assessments) || v.projection.assessments.length > 100
      || JSON.stringify(v).length > 1000000) return null
    return structuredClone(v) as unknown as FirstReviewedProfileSnapshot
  } catch { return null }
}
export function parseFirstReviewedProfileConfirmation(v: unknown): FirstReviewedProfileConfirmation | null {
  if (!record(v) || !exact(v,['snapshotId','requestId','expectedUserId','contentHash','sourceHash','profileHash'])
    || ![v.snapshotId,v.requestId,v.expectedUserId].every(firstProfileUuid) || ![v.contentHash,v.sourceHash,v.profileHash].every(hash)) return null
  return structuredClone(v) as unknown as FirstReviewedProfileConfirmation
}
export function parseFirstReviewedProfileReceipt(v: unknown): FirstReviewedProfileReceipt | null {
  if (!record(v) || !exact(v,['snapshotId','requestId','userId','contentHash','sourceHash','profileHash','confirmedAt'])
    || ![v.snapshotId,v.requestId,v.userId].every(firstProfileUuid) || ![v.contentHash,v.sourceHash,v.profileHash].every(hash) || !timestamp(v.confirmedAt)) return null
  return structuredClone(v) as unknown as FirstReviewedProfileReceipt
}
