/** Editable work and owner-visible expiry only. Neither grants fresh authority. */
import type { FirstReviewedCandidateReview } from './first-reviewed-contract'
import type { FirstReviewedProfileSnapshot } from './first-reviewed-profile-contract'
import type { FirstReviewProgramSummary } from './first-reviewed-workspace-contract'
import { seedFirstReviewedWeek, type FirstReviewedWeekSeed } from './first-reviewed-draft-editor'
import { seedSupervisedWeek } from './supervised-draft-editor'

export function candidateSnapshotMatches(candidate:FirstReviewedCandidateReview,snapshot:FirstReviewedProfileSnapshot){
  return snapshot.snapshotId===candidate.reviewPacket.profileFacts.snapshotId&&snapshot.userId===candidate.userId
    &&snapshot.programId===candidate.programId&&snapshot.basePlanVersionId===candidate.basePlanVersionId
    &&snapshot.designationId===candidate.designationId&&snapshot.sourceHash===candidate.sourceHash
    &&snapshot.projection.factsHash===candidate.reviewPacket.profileFacts.factsHash
    &&snapshot.projection.projectionAsOf===candidate.reviewPacket.profileFacts.projectionAsOf
}

/** Preserve the saved prescription, original baseline allocation and selected
 * schedule. Unseen alternative schedules are not recoverable from this view.
 * Old source/confirmation/decision tokens are deliberately not copied.
 */
export function copyFirstReviewedCandidate(program:FirstReviewProgramSummary,actor:string,
  candidate:FirstReviewedCandidateReview):FirstReviewedWeekSeed|null {
  const blank=seedFirstReviewedWeek(program,actor),d=program.latestDesignation
  if(!blank||!d||candidate.userId!==actor||candidate.programId!==program.programId
    ||candidate.basePlanVersionId!==d.basePlanVersionId||candidate.designationId!==d.designationId
    ||candidate.designationVersion!==d.version||candidate.reviewPacket.week.windowStart!==blank.windowStart
    ||candidate.reviewPacket.week.sequenceNumber!==blank.sequenceNumber)return null
  const copied=seedSupervisedWeek(candidate.reviewPacket.week,'same_week')
  if(!copied)return null
  copied.recipe.baseSchedule=structuredClone(candidate.reviewPacket.week.baseSchedule)
  copied.recipe.schedules[0].id=candidate.reviewPacket.week.basis.scheduleId
  copied.recipe.schedules[0].reason=candidate.reviewPacket.week.basis.reason
  return {...copied,transition:'first_reviewed',scheduleId:candidate.reviewPacket.week.basis.scheduleId}
}
