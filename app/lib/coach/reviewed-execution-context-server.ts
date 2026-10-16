import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import type { ReviewedExecutionSlot } from './reviewed-execution-continuity'

/** Full active planning slots with canonical execution identity; never raw partial fallback. */
export async function fetchReviewedExecutionSlots(db: SupabaseClient, userId: string, programId: string,
  planVersionId: string, expected: Array<{ scheduledDate: string; prescription: unknown }>): Promise<ReviewedExecutionSlot[]> {
  const result = await db.from('coach_effective_prescribed_sessions').select('*', { count: 'exact' })
    .eq('user_id', userId).eq('program_id', programId).eq('plan_version_id', planVersionId)
    .order('session_index', { ascending: true }).limit(15)
  if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count)
    || result.count !== result.data.length || result.data.length !== expected.length || !expected.length || expected.length > 14) {
    throw new Error('Accepted execution manifest unavailable or incomplete')
  }
  const seen = new Set<string>()
  return result.data.map((row, index) => {
    const session = expected[index]
    if (row.user_id !== userId || row.program_id !== programId || row.plan_version_id !== planVersionId
      || row.week_number !== 1 || row.session_index !== index + 1 || row.scheduled_date !== session.scheduledDate
      || doseContentHash(row.prescription) !== doseContentHash(session.prescription)
      || typeof row.id !== 'string' || !row.id || seen.has(row.id)
      || typeof row.execution_plan_version_id !== 'string' || !row.execution_plan_version_id
      || !['planned', 'completed', 'skipped'].includes(row.status) || typeof row.has_reports !== 'boolean'
      || !(row.completed_workout_id === null || typeof row.completed_workout_id === 'string')
      || !(row.completion_contract_version === null || Number.isInteger(row.completion_contract_version))
      || (row.status === 'planned' && (row.completed_workout_id !== null || row.completion_contract_version !== null))) {
      throw new Error('Accepted execution projection does not match the full saved week')
    }
    seen.add(row.id)
    return { userId, programId, planVersionId, sessionIndex: row.session_index, scheduledDate: row.scheduled_date,
      prescription: structuredClone(row.prescription), executionSessionId: row.id, executionPlanVersionId: row.execution_plan_version_id,
      status: row.status, completedWorkoutId: row.completed_workout_id, completionContractVersion: row.completion_contract_version,
      hasReports: row.has_reports }
  })
}
