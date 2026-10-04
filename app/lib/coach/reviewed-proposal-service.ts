import { createServiceRoleClient } from '../auth/supabase-server'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { createReviewedWeekProposalIssuer } from './reviewed-proposal-issuer-server'
import type { TrustedReviewedWeekRegistration } from './reviewed-week-context-server'

// A reviewed production registry and separately approved numerical activation
// are still required. Request input cannot supply either authority.
export const reviewedProposalRegistry: readonly TrustedReviewedWeekRegistration[] = []
export const issueReviewedWeekProposal = createReviewedWeekProposalIssuer({
  registry: reviewedProposalRegistry,
  enabled: () => personalizedCoachingCapabilities().initialDosePolicy,
  createServiceClient: createServiceRoleClient,
})
