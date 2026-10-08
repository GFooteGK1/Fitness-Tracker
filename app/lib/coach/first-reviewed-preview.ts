/** Browser-safe exact preview binding. Preview is not approval or acceptance. */
import { parseFirstReviewedDraft,parseFirstReviewedReviewPacket,type FirstReviewedDraft } from './first-reviewed-contract'
import { firstReviewedBrowserHash } from './first-reviewed-pending'

export async function parseFirstReviewedPreview(value:unknown,draft:FirstReviewedDraft){
  try{
    if(!value||typeof value!=='object'||Array.isArray(value)||!parseFirstReviewedDraft(draft))return null
    const v=value as Record<string,unknown>
    if(Object.keys(v).sort().join(',')!=='candidateId,draftHash,kind,programId,reviewPacket'||v.kind!=='preview'
      ||v.candidateId!==draft.candidateId||v.programId!==draft.programId||v.draftHash!==await firstReviewedBrowserHash(draft))return null
    const packet=parseFirstReviewedReviewPacket(v.reviewPacket)
    if(!packet||packet.profileFacts.snapshotId!==draft.profileSnapshotId||packet.profileFacts.confirmationRequestId!==draft.profileConfirmationRequestId
      ||packet.week.windowStart!==draft.windowStart||packet.week.sequenceNumber!==draft.sequenceNumber
      ||await firstReviewedBrowserHash(packet.week.profileSnapshot)!==draft.confirmedTargetProfileHash
      ||packet.week.scheduledSessions.some(s=>s.prescription.source.review.id!==`first-reviewed-candidate:${draft.candidateId}`
        ||s.prescription.source.review.contentHash!==v.draftHash))return null
    return {draft:structuredClone(draft),packet}
  }catch{return null}
}
