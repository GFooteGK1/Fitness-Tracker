/** Server-only canonical hashing, separate from browser-safe profile contracts. */
import { doseContentHash } from './initial-dose-policy'
import { parseFirstReviewedProfileSnapshot } from './first-reviewed-profile-contract'

export function validateFirstReviewedProfileSnapshot(value: unknown) {
  const snapshot = parseFirstReviewedProfileSnapshot(value)
  if (!snapshot) return null
  const p = snapshot.projection
  return doseContentHash(p.profile) === snapshot.profileHash && doseContentHash(p.assessments) === doseContentHash(p.profile.assessments)
    && doseContentHash({ projectionAsOf:p.projectionAsOf,sourceHash:snapshot.sourceHash,profile:p.profile,baselines:p.baselines }) === p.factsHash ? snapshot : null
}
