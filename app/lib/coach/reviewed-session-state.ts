import type { ReviewedSessionPrescription } from './reviewed-session-contract'
import type { ReviewedSetReport } from './reviewed-set-report'

/** Owned factual readback. Writable is advisory; SQL rechecks membership on write. */
export interface ReviewedSessionState {
  userId: string
  sessionId: string
  programId: string
  executionPlanVersionId: string
  activePlanVersionId: string | null
  scheduledDate: string
  status: 'planned' | 'completed' | 'skipped'
  writable: boolean
  prescription: ReviewedSessionPrescription
  reports: Array<{ id: string; requestId: string; createdAt: string; report: ReviewedSetReport }>
  latestReportIds: string[]
}
