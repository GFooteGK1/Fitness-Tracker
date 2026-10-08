import { createServerClient,createServiceRoleClient } from '../auth/supabase-server'
import { isSupervisedProgrammingEnabled } from './supervised-programming-capability'
import { createFirstReviewedProfileService } from './first-reviewed-profile-service'
import { createFirstReviewedReviewService } from './first-reviewed-review-service'
import { createFirstReviewedLifecycleService } from './first-reviewed-lifecycle-service'
import { createFirstReviewedHttp } from './first-reviewed-http'
import { createFirstReviewWorkspaceHttp } from './first-reviewed-workspace-http'
import { createFirstReviewedSetupHttp } from './first-reviewed-setup-http'
import { createFirstReviewedPreviewHttp } from './first-reviewed-preview-http'
import { createFirstReviewSetupActionsHttp } from './first-reviewed-setup-actions-http'

// The existing server kill switch grants no designation, review, enrollment or
// numerical authority. The first-review SQL scope remains independently bounded.
const options={enabled:isSupervisedProgrammingEnabled,createServiceClient:createServiceRoleClient}
const review=createFirstReviewedReviewService(options)
export const firstReviewedHttp=createFirstReviewedHttp({createUserClient:createServerClient,
  profiles:createFirstReviewedProfileService(options),review,life:createFirstReviewedLifecycleService({...options,review})})
export const firstReviewWorkspaceHttp=createFirstReviewWorkspaceHttp({createUserClient:createServerClient,enabled:isSupervisedProgrammingEnabled})
export const firstReviewedSetupHttp=createFirstReviewedSetupHttp({createUserClient:createServerClient,enabled:isSupervisedProgrammingEnabled})
export const firstReviewedPreviewHttp=createFirstReviewedPreviewHttp({createUserClient:createServerClient,enabled:isSupervisedProgrammingEnabled})
export const firstReviewSetupActionsHttp=createFirstReviewSetupActionsHttp({createUserClient:createServerClient,enabled:isSupervisedProgrammingEnabled})
