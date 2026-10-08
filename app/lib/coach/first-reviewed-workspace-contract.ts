/** Browser-safe navigation metadata only. Discovery grants no write authority. */
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { formatUTCAsLocalDateWithOffset,localDateToUTCStart } from '../timezone-utils'

export interface FirstReviewProgramSummary {
  programId:string; title:string; role:'athlete'|'reviewer'; athleteId:string; activePlanVersionId:string|null
  legacyBase:{planVersionId:string;windowStart:string;windowEnd:string;sequenceNumber:number}
  latestDesignation:null|{designationId:string;programId:string;userId:string;basePlanVersionId:string;reviewerId:string;
    version:number;targetWindowStart:string;enabled:boolean;expiresAt:string}
  reviewAvailable:boolean
}
export interface FirstReviewCandidateSummary {
  candidateId:string;designationId:string;designationVersion:number;reviewerId:string;createdAt:string;decision:'pending'|'approve'|'reject'
  proposalId:string|null;proposalStatus:'proposed'|'accepted'|'rejected'|'expired'|null;planVersionId:string|null
  /** Original issuance identity, disclosed to the owner only. Not acceptance authority. */
  proposalRequestId:string|null
}
export interface FirstReviewSnapshotSummary {
  snapshotId:string;designationId:string;createdAt:string;validBefore:string;confirmationRequestId:string|null;confirmedAt:string|null
}
export interface FirstReviewProgramsPage {
  schemaVersion:1;actorId:string;programs:FirstReviewProgramSummary[];nextAfterProgramId:string|null
}
export interface FirstReviewProgramWorkspace {
  schemaVersion:1;actorId:string;program:FirstReviewProgramSummary;candidates:FirstReviewCandidateSummary[];nextAfterCandidateId:string|null
}
export interface FirstReviewSnapshotsPage {
  schemaVersion:1;actorId:string;programId:string;snapshots:FirstReviewSnapshotSummary[];nextAfterSnapshotId:string|null
}
export type FirstReviewDiscoveryKind='programs'|'workspace'|'snapshots'
export const firstReviewCursorKey=(kind:FirstReviewDiscoveryKind)=>kind==='programs'?'afterProgramId':kind==='workspace'?'afterCandidateId':'afterSnapshotId'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',')
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))
const integer=(v:unknown,min=1,max=2147483646)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
  &&formatUTCAsLocalDateWithOffset(localDateToUTCStart(v,0),0)===v
const plusDays=(v:string,n:number)=>formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(v,0))+n*86400000).toISOString(),0)
const monday=(v:unknown):v is string=>day(v)&&new Date(localDateToUTCStart(v,0)).getUTCDay()===1
const ordered=(ids:string[],after:string|null)=>ids.every((id,i)=>id>(i?ids[i-1]:after??''))
const cursor=(v:unknown,ids:string[],limit:number)=>v===null||(uuid(v)&&ids.length===limit&&v===ids.at(-1))
const bounded=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length<=200000

function programValid(v:unknown,actor:string):v is FirstReviewProgramSummary {
  if(!record(v)||!exact(v,['programId','title','role','athleteId','activePlanVersionId','legacyBase','latestDesignation','reviewAvailable'])
    ||!uuid(v.programId)||!uuid(v.athleteId)||typeof v.title!=='string'||v.title.length>1000
    ||(v.activePlanVersionId!==null&&!uuid(v.activePlanVersionId))||typeof v.reviewAvailable!=='boolean'||!record(v.legacyBase))return false
  const b=v.legacyBase
  if(!exact(b,['planVersionId','windowStart','windowEnd','sequenceNumber'])||!uuid(b.planVersionId)||!monday(b.windowStart)
    ||!day(b.windowEnd)||b.windowEnd!==plusDays(b.windowStart,6)||!integer(b.sequenceNumber))return false
  const d=v.latestDesignation
  if(d===null){if(v.reviewAvailable||v.role!=='athlete'||v.athleteId!==actor||v.activePlanVersionId!==b.planVersionId)return false}
  else if(!record(d)||!exact(d,['designationId','programId','userId','basePlanVersionId','reviewerId','version','targetWindowStart','enabled','expiresAt'])
    ||![d.designationId,d.reviewerId].every(uuid)||d.programId!==v.programId||d.userId!==v.athleteId||d.basePlanVersionId!==b.planVersionId
    ||!integer(d.version,1,2147483647)||!monday(d.targetWindowStart)||d.targetWindowStart<=plusDays(b.windowEnd,1)
    ||typeof d.enabled!=='boolean'||!time(d.expiresAt)||(v.reviewAvailable&&!d.enabled))return false
  if(v.role==='athlete')return v.athleteId===actor&&(!v.reviewAvailable||v.activePlanVersionId===b.planVersionId)
  return v.role==='reviewer'&&v.athleteId!==actor&&v.activePlanVersionId===null&&v.reviewAvailable
    &&record(d)&&d.reviewerId===actor&&d.enabled===true
}
function candidateValid(v:unknown,p:FirstReviewProgramSummary):v is FirstReviewCandidateSummary {
  if(!record(v)||!exact(v,['candidateId','designationId','designationVersion','reviewerId','createdAt','decision','proposalId','proposalStatus','planVersionId','proposalRequestId'])
    ||![v.candidateId,v.designationId,v.reviewerId].every(uuid)||!integer(v.designationVersion,1,2147483647)||!p.latestDesignation
    ||Number(v.designationVersion)>p.latestDesignation.version||!time(v.createdAt)||typeof v.decision!=='string'||!['pending','approve','reject'].includes(v.decision))return false
  if(v.proposalId===null?v.planVersionId!==null||v.proposalStatus!==null
    :!uuid(v.proposalId)||!uuid(v.planVersionId)||typeof v.proposalStatus!=='string'||!['proposed','accepted','rejected','expired'].includes(v.proposalStatus)||v.decision!=='approve')return false
  if(p.role==='reviewer'||v.proposalId===null){if(v.proposalRequestId!==null)return false}
  else if(typeof v.proposalRequestId!=='string'||v.proposalRequestId!==v.proposalRequestId.trim()
    ||v.proposalRequestId.length<8||v.proposalRequestId.length>200)return false
  return p.role==='athlete'||(v.designationId===p.latestDesignation.designationId&&v.designationVersion===p.latestDesignation.version
    &&v.reviewerId===p.latestDesignation.reviewerId)
}
function snapshotValid(v:unknown):v is FirstReviewSnapshotSummary {
  return record(v)&&exact(v,['snapshotId','designationId','createdAt','validBefore','confirmationRequestId','confirmedAt'])
    &&uuid(v.snapshotId)&&uuid(v.designationId)&&time(v.createdAt)&&time(v.validBefore)
    &&(v.confirmationRequestId===null?v.confirmedAt===null:uuid(v.confirmationRequestId)&&time(v.confirmedAt))
}
function scope(actor:string,after:string|null,limit:number){return uuid(actor)&&(after===null||uuid(after))&&integer(limit,1,50)}
export function parseFirstReviewProgramsPage(v:unknown,actor:string,after:string|null=null,limit=20):FirstReviewProgramsPage|null {
  try{
    if(!scope(actor,after,limit)||!bounded(v)||!record(v)||!exact(v,['schemaVersion','actorId','programs','nextAfterProgramId'])
      ||v.schemaVersion!==1||v.actorId!==actor||!Array.isArray(v.programs)||v.programs.length>limit||!v.programs.every(p=>programValid(p,actor)))return null
    const ids=v.programs.map(p=>p.programId)
    return ordered(ids,after)&&cursor(v.nextAfterProgramId,ids,limit)?structuredClone(v) as unknown as FirstReviewProgramsPage:null
  }catch{return null}
}
export function parseFirstReviewProgramWorkspace(v:unknown,actor:string,programId:string,after:string|null=null,limit=20):FirstReviewProgramWorkspace|null {
  try{
    if(!scope(actor,after,limit)||!uuid(programId)||!bounded(v)||!record(v)||!exact(v,['schemaVersion','actorId','program','candidates','nextAfterCandidateId'])
      ||v.schemaVersion!==1||v.actorId!==actor||!programValid(v.program,actor)||v.program.programId!==programId
      ||!Array.isArray(v.candidates)||v.candidates.length>limit||!v.candidates.every(c=>candidateValid(c,v.program as FirstReviewProgramSummary)))return null
    const ids=v.candidates.map(c=>c.candidateId)
    return ordered(ids,after)&&cursor(v.nextAfterCandidateId,ids,limit)?structuredClone(v) as unknown as FirstReviewProgramWorkspace:null
  }catch{return null}
}
export function parseFirstReviewSnapshotsPage(v:unknown,actor:string,programId:string,after:string|null=null,limit=20):FirstReviewSnapshotsPage|null {
  try{
    if(!scope(actor,after,limit)||!uuid(programId)||!bounded(v)||!record(v)||!exact(v,['schemaVersion','actorId','programId','snapshots','nextAfterSnapshotId'])
      ||v.schemaVersion!==1||v.actorId!==actor||v.programId!==programId||!Array.isArray(v.snapshots)
      ||v.snapshots.length>limit||!v.snapshots.every(snapshotValid))return null
    const ids=v.snapshots.map(s=>s.snapshotId)
    return ordered(ids,after)&&cursor(v.nextAfterSnapshotId,ids,limit)?structuredClone(v) as unknown as FirstReviewSnapshotsPage:null
  }catch{return null}
}
export function parseFirstReviewDiscoveryRequest(v:unknown,kind:FirstReviewDiscoveryKind){
  if(!record(v)||!uuid(v.expectedUserId)||(kind!=='programs'&&!uuid(v.programId)))return null
  const key=firstReviewCursorKey(kind),allowed=['expectedUserId',key,'limit',...(kind==='programs'?[]:['programId'])]
  if(Object.keys(v).some(k=>!allowed.includes(k)))return null
  const after=Object.hasOwn(v,key)?v[key]:null,limit=Object.hasOwn(v,'limit')?v.limit:20
  if((after!==null&&!uuid(after))||!integer(limit,1,50))return null
  return {actor:v.expectedUserId,programId:kind==='programs'?null:v.programId as string,after:after as string|null,limit:limit as number}
}
