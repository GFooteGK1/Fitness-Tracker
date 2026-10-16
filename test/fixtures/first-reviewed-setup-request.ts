import type { FirstReviewSetupEditorSeed,FirstReviewSetupRequest,FirstReviewSetupResolution } from '@/app/lib/coach/first-reviewed-setup-request'
import { FIRST_REVIEW_SETUP_KEYS } from '@/app/lib/coach/first-reviewed-setup-request'
import { firstReviewedProgram } from './first-reviewed-program'
import { currentSetupContents } from './first-reviewed-setup'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
/** Synthetic declarations only; no athlete facts, authority or performed work. */
export function firstReviewSetupEditorSeed(declared=true):FirstReviewSetupEditorSeed{
  const p=firstReviewedProgram(),d=p.latestDesignation!,contents=currentSetupContents()
  return {schemaVersion:1,userId:p.athleteId,programId:p.programId,designationId:d.designationId,designationVersion:d.version,basePlanVersionId:d.basePlanVersionId,
    declarations:Object.fromEntries(FIRST_REVIEW_SETUP_KEYS.map((key,i)=>[key,declared?{memoryId:id(60+i),version:1,status:'confirmed',content:contents[key],
      effectiveFrom:null,effectiveUntil:null,reviewAfter:'2026-10-12T00:00:00Z'}:null])) as FirstReviewSetupEditorSeed['declarations']}
}
export function firstReviewSetupRequest(declared=true):FirstReviewSetupRequest{
  const s=firstReviewSetupEditorSeed(declared)
  return {schemaVersion:1,expectedUserId:s.userId,programId:s.programId,designationId:s.designationId,designationVersion:s.designationVersion,
    basePlanVersionId:s.basePlanVersionId,requestId:id(70),expectedDeclarations:s.declarations,contents:currentSetupContents() as FirstReviewSetupRequest['contents']}
}
export function firstReviewSetupSaved(q:FirstReviewSetupRequest):FirstReviewSetupResolution{
  return {schemaVersion:1,request:q,disposition:'saved',resolvedAt:'2026-10-05T19:00:00Z',receipt:{userId:q.expectedUserId,programId:q.programId,requestId:q.requestId,
    memories:Object.fromEntries(FIRST_REVIEW_SETUP_KEYS.map((key,i)=>[key,{memoryId:id(80+i),version:(q.expectedDeclarations[key]?.version??0)+1,content:q.contents[key]}])) as Extract<FirstReviewSetupResolution,{disposition:'saved'}>['receipt']['memories']}}
}
