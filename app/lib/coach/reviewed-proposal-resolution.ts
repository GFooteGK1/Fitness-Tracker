import { stableStringify } from './rolling-weekly-contracts'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
export type ProposalResolutionIdentity = { reviewId: string; registrationId: string } | { proposalId: string; planVersionId: string }
export function parseProposalResolutionIdentity(operation: unknown, value: unknown): ProposalResolutionIdentity | null {
  if (!object(value)) return null
  if (operation === 'issue' && Object.keys(value).sort().join(',') === 'registrationId,reviewId' && uuid(value.registrationId)
    && typeof value.reviewId === 'string' && value.reviewId.length > 0 && value.reviewId.length <= 200) return { reviewId: value.reviewId, registrationId: value.registrationId }
  if (operation === 'accept' && Object.keys(value).sort().join(',') === 'planVersionId,proposalId' && uuid(value.proposalId) && uuid(value.planVersionId)) {
    return { proposalId: value.proposalId, planVersionId: value.planVersionId }
  }
  return null
}
export interface ProposalResolutionRequest {
  userId: string; programId: string; operation: 'issue' | 'accept'; requestId: string; identity: ProposalResolutionIdentity
}
export type ReviewedProposalResolution = ProposalResolutionRequest & { schemaVersion: 1 } & (
  { disposition: 'saved'; proposalId: string; planVersionId: string; activePlanVersionId: string | null }
  | { disposition: 'closed'; proposalId: string | null; planVersionId: string | null; resolutionId: string; resolvedAt: string }
)
export function parseReviewedProposalResolution(value: unknown, expected: ProposalResolutionRequest): ReviewedProposalResolution | null {
  if (!object(value) || value.schemaVersion !== 1 || value.userId !== expected.userId || value.programId !== expected.programId
    || value.operation !== expected.operation || value.requestId !== expected.requestId
    || stableStringify(value.identity) !== stableStringify(expected.identity)) return null
  if (expected.operation === 'accept' && (!('proposalId' in expected.identity) || value.proposalId !== expected.identity.proposalId
    || value.planVersionId !== expected.identity.planVersionId)) return null
  if (value.disposition === 'saved' && uuid(value.proposalId) && uuid(value.planVersionId)
    && (value.activePlanVersionId === null || uuid(value.activePlanVersionId))) {
    return { ...expected, schemaVersion: 1, disposition: 'saved', proposalId: value.proposalId, planVersionId: value.planVersionId, activePlanVersionId: value.activePlanVersionId }
  }
  if (value.disposition !== 'closed' || !uuid(value.resolutionId) || typeof value.resolvedAt !== 'string' || !Number.isFinite(Date.parse(value.resolvedAt))) return null
  if (expected.operation === 'issue' && (value.proposalId !== null || value.planVersionId !== null)) return null
  if (!(value.proposalId === null || uuid(value.proposalId)) || !(value.planVersionId === null || uuid(value.planVersionId))) return null
  return { ...expected, schemaVersion: 1, disposition: 'closed', proposalId: value.proposalId, planVersionId: value.planVersionId,
    resolutionId: value.resolutionId, resolvedAt: value.resolvedAt }
}
