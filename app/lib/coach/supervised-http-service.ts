import { createServerClient, createServiceRoleClient } from '../auth/supabase-server'
import { createSupervisedReviewService } from './supervised-review-service'
import { createSupervisedWeekIssuer } from './supervised-proposal-issuer'
import { createSupervisedDraftReader } from './supervised-draft-server'
import { createSupervisedReviewHttp } from './supervised-review-http'
import { isSupervisedProgrammingEnabled } from './supervised-programming-capability'
import { createSupervisedCandidatePreview } from './supervised-candidate-preview'

const options = { enabled: isSupervisedProgrammingEnabled, createServiceClient: createServiceRoleClient }
const review = createSupervisedReviewService(options)
export const supervisedHttp = createSupervisedReviewHttp({ createUserClient: createServerClient, review, enabled: options.enabled,
  draft: createSupervisedDraftReader(options), issue: createSupervisedWeekIssuer({ ...options, review }), preview: createSupervisedCandidatePreview(options) })
