import { createServerClient } from '../auth/supabase-server'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { createReviewedHttpHandlers } from './reviewed-http-server'
import { issueReviewedWeekProposal, reviewedProposalRegistry } from './reviewed-proposal-service'
import { resolveSupervisedResource } from './supervised-resource-access'
import { isSupervisedProgrammingEnabled } from './supervised-programming-capability'

export const reviewedHttp = createReviewedHttpHandlers({
  createUserClient: createServerClient,
  enabled: () => personalizedCoachingCapabilities().initialDosePolicy,
  issue: issueReviewedWeekProposal,
  registry: reviewedProposalRegistry,
  supervised: { enabled: isSupervisedProgrammingEnabled, resolve: resolveSupervisedResource },
})
