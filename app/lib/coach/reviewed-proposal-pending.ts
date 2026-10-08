import { stableStringify } from './rolling-weekly-contracts'
import { parseReviewedProposalResolution, type ProposalResolutionRequest, type ReviewedProposalResolution } from './reviewed-proposal-resolution'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Issue = { operation: 'issue'; body: { expectedUserId: string; requestId: string; reviewId: string; registrationId: string } }
type Accept = { operation: 'accept'; proposalId: string; planVersionId: string; body: { expectedUserId: string; requestId: string } }
export type ReviewedProposalPending = { schemaVersion: 1; userId: string; programId: string } & (Issue | Accept)
const key = (owner: string, program: string) => `reviewed-proposal-pending:${owner}:${program}`
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function valid(value: unknown, owner: string, program: string): value is ReviewedProposalPending {
  if (!object(value) || value.schemaVersion !== 1 || value.userId !== owner || value.programId !== program || !uuid(owner) || !uuid(program)
    || !object(value.body) || value.body.expectedUserId !== owner || typeof value.body.requestId !== 'string'
    || value.body.requestId.length < 8 || value.body.requestId.length > 200 || value.body.requestId.trim() !== value.body.requestId) return false
  return value.operation === 'issue' ? Object.keys(value.body).sort().join(',') === 'expectedUserId,registrationId,requestId,reviewId'
    && uuid(value.body.registrationId) && typeof value.body.reviewId === 'string' && value.body.reviewId.length > 0 && value.body.reviewId.length <= 200
    : value.operation === 'accept' && uuid(value.proposalId) && uuid(value.planVersionId) && Object.keys(value.body).sort().join(',') === 'expectedUserId,requestId'
}
export function readReviewedProposalPending(store: Store, owner: string, program: string): ReviewedProposalPending | null {
  const raw = store.getItem(key(owner, program))
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!valid(value, owner, program)) throw new Error('The preserved proposal request needs review. It has not been discarded.')
  return value
}
export function saveReviewedProposalPending(store: Store, value: ReviewedProposalPending): ReviewedProposalPending {
  if (!valid(value, value.userId, value.programId)) throw new Error('Invalid proposal request')
  const existing = readReviewedProposalPending(store, value.userId, value.programId)
  if (existing && stableStringify(existing) !== stableStringify(value)) throw new Error('Recover the previous proposal request first.')
  const raw = JSON.stringify(value)
  store.setItem(key(value.userId, value.programId), raw)
  if (store.getItem(key(value.userId, value.programId)) !== raw) throw new Error('Could not preserve the proposal request before sending.')
  return JSON.parse(raw)
}
export async function sendReviewedProposalPending(store: Store, value: ReviewedProposalPending, currentOwner: () => string | null,
  fetcher: typeof fetch = fetch): Promise<{ proposalId: string; planVersionId: string; operation: 'issue' | 'accept' }> {
  value = structuredClone(value)
  const unchanged = () => {
    if (currentOwner() !== value.userId) throw new Error('Restore the original account to recover this proposal request.')
    if (stableStringify(readReviewedProposalPending(store, value.userId, value.programId)) !== stableStringify(value)) throw new Error('The pending proposal request changed. Refresh before retrying.')
  }
  unchanged()
  const response = await fetcher(value.operation === 'issue' ? '/api/coach/reviewed/proposals'
    : `/api/coach/reviewed/proposals/${value.proposalId}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value.body) })
  const result: unknown = await response.json()
  if (!response.ok || !object(result)) throw new Error(object(result) && typeof result.error === 'string' ? result.error : 'Proposal result is unconfirmed. Recover the original request.')
  let proposalId: string, planVersionId: string
  if (value.operation === 'issue') {
    const { expectedUserId: _owner, ...request } = value.body; void _owner
    if (result.kind !== 'issued' || result.programId !== value.programId || !uuid(result.proposalId) || !uuid(result.planVersionId)
      || stableStringify(result.request) !== stableStringify(request) || typeof result.replayed !== 'boolean') throw new Error('Response does not confirm this proposal request.')
    proposalId = result.proposalId; planVersionId = result.planVersionId
  } else {
    if (result.kind !== 'accepted' || result.requestId !== value.body.requestId || result.proposalId !== value.proposalId || !object(result.accepted)
      || result.accepted.proposal_status !== 'accepted' || result.accepted.accepted_program_id !== value.programId
      || result.accepted.active_plan_version_id !== value.planVersionId) throw new Error('Response does not confirm this acceptance.')
    proposalId = value.proposalId; planVersionId = value.planVersionId
  }
  unchanged()
  const archiveKey = `reviewed-proposal-receipt:${value.userId}:${value.operation}:${value.body.requestId}`
  const archived = JSON.stringify({ request: value, proposalId, planVersionId }), prior = store.getItem(archiveKey)
  if (prior !== null && stableStringify(JSON.parse(prior)) !== stableStringify(JSON.parse(archived))) throw new Error('Conflicting proposal recovery record. Pending work is preserved.')
  store.setItem(archiveKey, archived)
  if (store.getItem(archiveKey) !== archived) throw new Error('Could not preserve the confirmed proposal result.')
  unchanged()
  store.removeItem(key(value.userId, value.programId))
  if (store.getItem(key(value.userId, value.programId)) !== null) throw new Error('Proposal confirmed; local pending state remains. Retry safely.')
  return { proposalId, planVersionId, operation: value.operation }
}

export async function resolveReviewedProposalPending(store: Store, value: ReviewedProposalPending, currentOwner: () => string | null,
  fetcher: typeof fetch = fetch): Promise<ReviewedProposalResolution> {
  value = structuredClone(value)
  const unchanged = () => {
    if (currentOwner() !== value.userId) throw new Error('Restore the original account before resolving this proposal.')
    if (stableStringify(readReviewedProposalPending(store, value.userId, value.programId)) !== stableStringify(value)) throw new Error('The pending proposal changed. It has been preserved.')
  }
  unchanged()
  const request: ProposalResolutionRequest = { userId: value.userId, programId: value.programId, operation: value.operation, requestId: value.body.requestId,
    identity: value.operation === 'issue' ? { reviewId: value.body.reviewId, registrationId: value.body.registrationId }
      : { proposalId: value.proposalId, planVersionId: value.planVersionId } }
  const response = await fetcher(`/api/coach/reviewed/programs/${value.programId}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId: value.userId, operation: request.operation, requestId: request.requestId, identity: request.identity }) })
  const result: unknown = await response.json()
  const resolution = response.ok && object(result) && result.kind === 'resolved' ? parseReviewedProposalResolution(result.resolution, request) : null
  if (!resolution) throw new Error('Proposal resolution is unconfirmed. The original request is preserved; resolve it again.')
  unchanged()
  const archiveKey = `reviewed-proposal-resolution:${value.userId}:${value.operation}:${value.body.requestId}`
  // A recovered saved proposal may cease to be active between attempts. Archive
  // its immutable saved identity, not a mutable active-pointer observation.
  const { activePlanVersionId: _active, ...stableResolution } = resolution.disposition === 'saved' ? resolution : { ...resolution, activePlanVersionId: null }
  void _active
  const archive = JSON.stringify({ request: value, resolution: stableResolution }), prior = store.getItem(archiveKey)
  if (prior !== null && stableStringify(JSON.parse(prior)) !== stableStringify(JSON.parse(archive))) throw new Error('Conflicting resolution archive. Pending request preserved.')
  store.setItem(archiveKey, archive)
  if (store.getItem(archiveKey) !== archive) throw new Error('Could not preserve the resolution. Pending request retained.')
  unchanged()
  store.removeItem(key(value.userId, value.programId))
  if (store.getItem(key(value.userId, value.programId)) !== null) throw new Error('Resolution confirmed; local pending state remains. Resolve again safely.')
  return resolution
}
