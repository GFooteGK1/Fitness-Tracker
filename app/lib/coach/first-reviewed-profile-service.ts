/** Server-only profile preparation and authenticated confirmation. No issuance. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset } from '../timezone-utils'
import { doseContentHash } from './initial-dose-policy'
import { fetchReviewedDoseContext } from './reviewed-dose-context-server'
import { captureSetupMemoryBindings } from './setup-memory-bindings'
import { reviewedSourceValidBefore } from './reviewed-proposal-registration'
import { projectFirstReviewedProfileFacts } from './first-reviewed-profile-facts'
import { parseFirstReviewDesignation } from './first-reviewed-contract'
import { firstProfileUuid, parseFirstReviewedProfileRequest,
  parseFirstReviewedProfileConfirmation, parseFirstReviewedProfileReceipt } from './first-reviewed-profile-contract'
import { validateFirstReviewedProfileSnapshot } from './first-reviewed-profile-validation'
import { resolveFirstReviewedRequest } from './first-reviewed-request-resolution-server'

export function createFirstReviewedProfileService(options: { enabled: () => boolean; createServiceClient: () => SupabaseClient }) {
  const owner = async (db: SupabaseClient) => {
    const a = await db.auth.getUser()
    return !a.error && firstProfileUuid(a.data.user?.id) ? a.data.user!.id : null
  }
  const read = async (db: SupabaseClient, snapshotId: string) => {
    if (!firstProfileUuid(snapshotId)) return { kind:'invalid_request' as const }
    try {
      const actor = await owner(db)
      if (!actor) return { kind:'unauthenticated' as const }
      const r = await db.rpc('get_first_review_profile_snapshot',{ p_id:snapshotId })
      if (r.error || await owner(db) !== actor) return { kind:'unavailable' as const }
      if (r.data === null) return { kind:'not_found' as const }
      const snapshot = validateFirstReviewedProfileSnapshot(r.data)
      if (!snapshot || snapshot.userId !== actor || snapshot.snapshotId !== snapshotId) return { kind:'unavailable' as const }
      return { kind:'snapshot' as const,snapshot }
    } catch { return { kind:'unavailable' as const } }
  }
  const prepare = async (db: SupabaseClient, expectedUserId: string, input: unknown) => {
    const q = parseFirstReviewedProfileRequest(input)
    if (!firstProfileUuid(expectedUserId) || !q) return { kind:'invalid_request' as const }
    const identity = { snapshotId:q.snapshotId,expectedUserId,requestHash:doseContentHash(q) }
    const retry = () => ({ kind:'retry_required' as const,identity })
    try {
      if (await owner(db) !== expectedUserId) return { kind:'account_changed' as const,identity }
      const saved = await read(db,q.snapshotId)
      if (await owner(db) !== expectedUserId) return retry()
      if (saved.kind === 'snapshot') return saved.snapshot.requestHash === identity.requestHash
        ? { kind:'saved' as const,snapshot:saved.snapshot,replayed:true,identity } : { kind:'request_conflict' as const,identity }
      if (saved.kind !== 'not_found') return retry()
      const pending=await resolveFirstReviewedRequest(db,{schemaVersion:1,userId:expectedUserId,programId:q.programId,
        operation:'prepare_profile',body:{expectedUserId,request:q}},false)
      if(pending.kind!=='resolved')return retry()
      if(pending.resolution.disposition==='no_write')return {kind:'no_write' as const,identity,resolution:pending.resolution}
      // A writer may have completed between the first read and exact resolution.
      if(pending.resolution.disposition==='saved') {
        const snapshot=validateFirstReviewedProfileSnapshot(pending.resolution.result)
        return snapshot?{kind:'saved' as const,snapshot,replayed:true,identity}:retry()
      }
      if (!options.enabled()) return { kind:'disabled' as const,identity }
      const r = await db.rpc('get_current_first_review_designation',{ p_id:q.designationId })
      const d = r.error ? null : parseFirstReviewDesignation(r.data)
      if (!d || d.userId !== expectedUserId || d.designationId !== q.designationId || d.programId !== q.programId
        || d.basePlanVersionId !== q.basePlanVersionId || d.targetWindowStart !== q.windowStart || !d.enabled
        || Date.parse(d.expiresAt) <= Date.now()) return { kind:'review_required' as const,identity }
      const scope = { programId:q.programId,basePlanVersionId:q.basePlanVersionId,historyDays:q.historyDays,tzOffset:q.tzOffset,
        historyThrough:formatUTCAsLocalDateWithOffset(new Date().toISOString(),q.tzOffset) }
      const source = await fetchReviewedDoseContext(db,scope,{ firstReviewSetup:true,firstReviewFacts:true })
      if (source.userId !== expectedUserId) return retry()
      const projection = projectFirstReviewedProfileFacts(source,q.targetSetup,source.asOf)
      const setup = await captureSetupMemoryBindings(db,expectedUserId,projection.profile,{ reviewedSetup:true })
      if (doseContentHash(setup) !== doseContentHash(source.binding.setup)) return { kind:'review_required' as const,identity }
      const after = await fetchReviewedDoseContext(db,scope,{ firstReviewSetup:true,firstReviewFacts:true })
      const afterProjection = projectFirstReviewedProfileFacts(after,q.targetSetup,projection.projectionAsOf)
      const afterD = await db.rpc('get_current_first_review_designation',{ p_id:q.designationId })
      if (after.userId !== expectedUserId || after.contextHash !== source.contextHash || doseContentHash(afterProjection) !== doseContentHash(projection)
        || afterD.error || doseContentHash(afterD.data) !== doseContentHash(d) || await owner(db) !== expectedUserId) return retry()
      if (!options.enabled()) return { kind:'disabled' as const,identity }
      const validBefore = reviewedSourceValidBefore(after)
      if (Date.now() >= Date.parse(validBefore) || Date.now() >= Date.parse(d.expiresAt)) return { kind:'review_required' as const,identity }
      const result = await options.createServiceClient().rpc('submit_first_review_profile_snapshot', {
        p_id:q.snapshotId,p_designation_id:d.designationId,p_user_id:expectedUserId,p_request_hash:identity.requestHash,
        p_source:{ contextHash:source.contextHash,binding:source.binding,validBefore },p_projection:projection,p_profile_hash:doseContentHash(projection.profile),p_request:q })
      if (result.error) return retry()
      const snapshot = validateFirstReviewedProfileSnapshot(result.data)
      if (!snapshot || snapshot.snapshotId !== q.snapshotId || snapshot.userId !== expectedUserId || snapshot.requestHash !== identity.requestHash
        || snapshot.designationId !== d.designationId || snapshot.programId !== q.programId || snapshot.basePlanVersionId !== q.basePlanVersionId
        || doseContentHash(snapshot.projection) !== doseContentHash(projection) || await owner(db) !== expectedUserId) return retry()
      return { kind:'saved' as const,snapshot,replayed:false,identity }
    } catch { return retry() }
  }
  const confirm = async (db: SupabaseClient,input: unknown) => {
    const q = parseFirstReviewedProfileConfirmation(input)
    if (!q) return { kind:'invalid_request' as const }
    const retry = () => ({ kind:'retry_required' as const,request:q })
    const matches = (r: NonNullable<ReturnType<typeof parseFirstReviewedProfileReceipt>>) => r.userId === q.expectedUserId
      && r.snapshotId === q.snapshotId && r.requestId === q.requestId && r.contentHash === q.contentHash && r.sourceHash === q.sourceHash && r.profileHash === q.profileHash
    try {
      if (await owner(db) !== q.expectedUserId) return { kind:'account_changed' as const,request:q }
      const saved = await db.rpc('get_first_review_profile_receipt',{ p_request_id:q.requestId })
      if (saved.error || await owner(db) !== q.expectedUserId) return retry()
      if (saved.data !== null) {
        const receipt = parseFirstReviewedProfileReceipt(saved.data)
        return receipt ? matches(receipt) ? { kind:'confirmed' as const,receipt } : { kind:'request_conflict' as const,request:q } : retry()
      }
      const snapshot=await read(db,q.snapshotId)
      if(snapshot.kind!=='snapshot')return retry()
      const pending=await resolveFirstReviewedRequest(db,{schemaVersion:1,userId:q.expectedUserId,programId:snapshot.snapshot.programId,
        operation:'confirm_profile',body:q},false)
      if(pending.kind!=='resolved')return retry()
      if(pending.resolution.disposition==='no_write')return {kind:'no_write' as const,request:q,resolution:pending.resolution}
      if(pending.resolution.disposition==='saved') {
        const receipt=parseFirstReviewedProfileReceipt(pending.resolution.result)
        return receipt&&matches(receipt)?{kind:'confirmed' as const,receipt}:retry()
      }
      if (!options.enabled()) return { kind:'disabled' as const,request:q }
      if (await owner(db) !== q.expectedUserId) return retry()
      if (!options.enabled()) return { kind:'disabled' as const,request:q }
      const result = await db.rpc('confirm_first_review_profile',{ p_id:q.snapshotId,p_request_id:q.requestId,
        p_content_hash:q.contentHash,p_source_hash:q.sourceHash,p_profile_hash:q.profileHash })
      if (result.error || await owner(db) !== q.expectedUserId) return retry()
      const receipt = parseFirstReviewedProfileReceipt(result.data)
      return receipt && matches(receipt) ? { kind:'confirmed' as const,receipt } : retry()
    } catch { return retry() }
  }
  /** Getter only: absence does not establish cancellation or permission to resend. */
  const recoverConfirmation = async (db: SupabaseClient,input: unknown) => {
    const q = parseFirstReviewedProfileConfirmation(input)
    if (!q) return { kind:'invalid_request' as const }
    try {
      if (await owner(db) !== q.expectedUserId) return { kind:'account_changed' as const,request:q }
      const r = await db.rpc('get_first_review_profile_receipt',{ p_request_id:q.requestId })
      if (r.error || await owner(db) !== q.expectedUserId) return { kind:'unresolved' as const,request:q }
      const receipt = parseFirstReviewedProfileReceipt(r.data)
      if (!receipt) return { kind:'unresolved' as const,request:q }
      if (receipt.userId !== q.expectedUserId || receipt.snapshotId !== q.snapshotId || receipt.requestId !== q.requestId
        || receipt.contentHash !== q.contentHash || receipt.sourceHash !== q.sourceHash || receipt.profileHash !== q.profileHash) return { kind:'request_conflict' as const,request:q }
      return { kind:'confirmed' as const,receipt }
    } catch { return { kind:'unresolved' as const,request:q } }
  }
  return { read,prepare,confirm,recoverConfirmation }
}
