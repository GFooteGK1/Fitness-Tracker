import type { FirstReviewProgramSummary } from '@/app/lib/coach/first-reviewed-workspace-contract'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
/** Synthetic navigation metadata; not a named athlete or designation grant. */
export function firstReviewedProgram():FirstReviewProgramSummary {
  return {programId:id(1),title:'Synthetic legacy program',role:'athlete',athleteId:id(2),activePlanVersionId:id(3),
    legacyBase:{planVersionId:id(3),windowStart:'2026-09-14',windowEnd:'2026-09-20',sequenceNumber:1},
    latestDesignation:{designationId:id(4),programId:id(1),userId:id(2),basePlanVersionId:id(3),reviewerId:id(5),version:1,
      targetWindowStart:'2026-10-05',enabled:true,expiresAt:new Date(Date.now()+3600000).toISOString()},reviewAvailable:true}
}
