/** Browser-safe exact first-review envelopes. Recovery does not grant write authority. */
import { parseFirstReviewedDraft, parseFirstReviewedReviewPacket, type FirstReviewedDraft } from './first-reviewed-contract'
import { isSupervisedJson } from './supervised-candidate-draft'
import { stableStringify } from './rolling-weekly-contracts'
import { parseFirstReviewedProfileRequest, parseFirstReviewedProfileConfirmation, parseFirstReviewedProfileSnapshot,
  parseFirstReviewedProfileReceipt, type FirstReviewedProfileRequest, type FirstReviewedProfileConfirmation } from './first-reviewed-profile-contract'

export type FirstReviewedPending = {schemaVersion:1;userId:string;programId:string} & (
  | {operation:'prepare_profile';body:{expectedUserId:string;request:FirstReviewedProfileRequest}}
  | {operation:'confirm_profile';body:FirstReviewedProfileConfirmation}
  | {operation:'submit';body:{expectedUserId:string;draft:FirstReviewedDraft}}
  | {operation:'decide';body:{expectedUserId:string;candidateId:string;designationId:string;requestId:string;
    decision:'approve'|'reject';contentHash:string;sourceHash:string}}
  | {operation:'issue';body:{expectedUserId:string;programId:string;candidateId:string;requestId:string}}
  | {operation:'accept';body:{expectedUserId:string;programId:string;candidateId:string;proposalId:string;planVersionId:string;
    requestId:string;contentHash:string;sourceHash:string}})
export type FirstReviewedRequestResolution = {schemaVersion:1;request:FirstReviewedPending} & (
  | {disposition:'saved';result:Record<string,unknown>}
  | {disposition:'no_write';resolutionId:string;resolvedAt:string}
  | {disposition:'not_found'})
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===keys.sort().join(',')
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export function parseFirstReviewedPending(v:unknown):FirstReviewedPending|null {
  try {
    if(!isSupervisedJson(v)||!record(v)||!exact(v,['schemaVersion','userId','programId','operation','body'])
      ||v.schemaVersion!==1||!uuid(v.userId)||!uuid(v.programId)||!record(v.body)
      ||v.body.expectedUserId!==v.userId||JSON.stringify(v).length>600000)return null
    if(v.operation==='prepare_profile') {
      const q=exact(v.body,['expectedUserId','request'])&&parseFirstReviewedProfileRequest(v.body.request)
      if(!q||q.programId!==v.programId)return null
    } else if(v.operation==='confirm_profile') {
      if(!parseFirstReviewedProfileConfirmation(v.body))return null
    } else if(v.operation==='submit') {
      const draft=exact(v.body,['expectedUserId','draft'])&&parseFirstReviewedDraft(v.body.draft)
      if(!draft||draft.programId!==v.programId)return null
    } else if(v.operation==='decide') {
      if(!exact(v.body,['expectedUserId','candidateId','designationId','requestId','decision','contentHash','sourceHash'])
        ||![v.body.candidateId,v.body.designationId,v.body.requestId].every(uuid)
        ||typeof v.body.decision!=='string'||!['approve','reject'].includes(v.body.decision)||!hash(v.body.contentHash)||!hash(v.body.sourceHash))return null
    } else if(v.operation==='issue') {
      if(!exact(v.body,['expectedUserId','programId','candidateId','requestId'])||v.body.programId!==v.programId
        ||!uuid(v.body.candidateId)||typeof v.body.requestId!=='string'||v.body.requestId.trim()!==v.body.requestId
        ||v.body.requestId.length<8||v.body.requestId.length>200)return null
    } else if(v.operation==='accept') {
      if(!exact(v.body,['expectedUserId','programId','candidateId','proposalId','planVersionId','requestId','contentHash','sourceHash'])
        ||v.body.programId!==v.programId||![v.body.candidateId,v.body.proposalId,v.body.planVersionId].every(uuid)
        ||!hash(v.body.contentHash)||!hash(v.body.sourceHash)||typeof v.body.requestId!=='string'||v.body.requestId.trim()!==v.body.requestId
        ||v.body.requestId.length<8||v.body.requestId.length>200)return null
    } else return null
    return structuredClone(v) as FirstReviewedPending
  } catch {return null}
}
export function parseFirstReviewedRequestResolution(v:unknown,request:FirstReviewedPending):FirstReviewedRequestResolution|null {
  try {
    if(!isSupervisedJson(v)||!record(v)||v.schemaVersion!==1||stableStringify(v.request)!==stableStringify(request))return null
    if(v.disposition==='not_found')return exact(v,['schemaVersion','request','disposition'])?structuredClone(v) as FirstReviewedRequestResolution:null
    if(v.disposition==='saved')return exact(v,['schemaVersion','request','disposition','result'])&&savedResultMatches(v.result,request)
      ?structuredClone(v) as FirstReviewedRequestResolution:null
    return v.disposition==='no_write'&&exact(v,['schemaVersion','request','disposition','resolutionId','resolvedAt'])
      &&uuid(v.resolutionId)&&typeof v.resolvedAt==='string'&&Number.isFinite(Date.parse(v.resolvedAt))
      ?structuredClone(v) as FirstReviewedRequestResolution:null
  } catch {return null}
}

/** Do not let a valid envelope make an unrelated or incomplete receipt trustworthy. */
function savedResultMatches(v:unknown,request:FirstReviewedPending):boolean {
  if(!record(v))return false
  if(request.operation==='prepare_profile') {
    const s=parseFirstReviewedProfileSnapshot(v),q=request.body.request
    return !!s&&s.snapshotId===q.snapshotId&&s.designationId===q.designationId&&s.userId===request.userId
      &&s.programId===request.programId&&s.basePlanVersionId===q.basePlanVersionId&&s.historyDays===q.historyDays&&s.tzOffset===q.tzOffset
      &&s.projection.profile.startDate===q.windowStart
  }
  if(request.operation==='confirm_profile') {
    const r=parseFirstReviewedProfileReceipt(v),q=request.body
    return !!r&&r.userId===request.userId&&r.snapshotId===q.snapshotId&&r.requestId===q.requestId
      &&r.contentHash===q.contentHash&&r.sourceHash===q.sourceHash&&r.profileHash===q.profileHash
  }
  if(request.operation==='issue'||request.operation==='accept')return exact(v,['proposalId','planVersionId','activePlanVersionId'])
    &&[v.proposalId,v.planVersionId,v.activePlanVersionId].every(uuid)
    &&(request.operation!=='accept'||(v.proposalId===request.body.proposalId&&v.planVersionId===request.body.planVersionId))
  if(request.operation==='decide')return exact(v,['candidateId','decisionId','requestId','decision','reviewerId','designationId',
    'designationVersion','contentHash','sourceHash','decidedAt','replayed'])&&uuid(v.decisionId)
    &&v.candidateId===request.body.candidateId&&v.requestId===request.body.requestId&&v.decision===request.body.decision
    &&v.reviewerId===request.userId&&v.designationId===request.body.designationId
    &&v.contentHash===request.body.contentHash&&v.sourceHash===request.body.sourceHash
    &&Number.isSafeInteger(v.designationVersion)&&Number(v.designationVersion)>0&&v.replayed===true
    &&typeof v.decidedAt==='string'&&Number.isFinite(Date.parse(v.decidedAt))
  const d=request.body.draft
  return exact(v,['candidateId','designationId','designationVersion','programId','userId','reviewerId','basePlanVersionId',
    'contentHash','sourceHash','reviewPacket','createdAt'])&&v.candidateId===d.candidateId&&v.designationId===d.designationId
    &&v.programId===request.programId&&v.userId===request.userId&&v.basePlanVersionId===d.basePlanVersionId&&uuid(v.reviewerId)
    &&Number.isSafeInteger(v.designationVersion)&&Number(v.designationVersion)>0&&hash(v.contentHash)&&hash(v.sourceHash)
    &&!!parseFirstReviewedReviewPacket(v.reviewPacket)&&typeof v.createdAt==='string'&&Number.isFinite(Date.parse(v.createdAt))
}
