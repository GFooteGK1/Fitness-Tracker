import type { SupabaseClient } from '@supabase/supabase-js'
import { doseContentHash } from './initial-dose-policy'
import { parseReviewedSession } from './reviewed-session-contract'
import { bindReviewedSetReport } from './reviewed-set-report'
import { fetchReviewedExecutionSlots } from './reviewed-execution-context-server'
import { decodeCoachWeeklyIntent } from './rolling-weekly-api'
import { parseCoachContextRevision } from './proposal-context-revision'
import type { ReviewedSessionState } from './reviewed-session-state'

/** Strict bounded read: caps, malformed rows and concurrent changes are unavailable,
 * never a partial list that could omit actuals from a completion manifest.
 */
export async function fetchReviewedSessionState(db: SupabaseClient, owner: string, sessionId: string): Promise<ReviewedSessionState | null> {
  const revision = async () => {
    const result = await db.from('coach_context_revisions').select('user_id,revision').eq('user_id', owner).limit(2)
    const value = result.data?.length === 1 && result.data[0].user_id === owner ? parseCoachContextRevision(result.data[0].revision) : null
    if (result.error || value === null) throw new Error('Session revision unavailable')
    return value
  }
  const readRoot = () => db.from('prescribed_sessions').select('*').eq('id', sessionId).eq('user_id', owner).limit(2)
  const rootResult = await readRoot()
  if (rootResult.error || !Array.isArray(rootResult.data) || rootResult.data.length > 1) throw new Error('Session unavailable')
  if (!rootResult.data.length) return null
  const before = await revision()
  const root = rootResult.data[0], prescription = parseReviewedSession(root.prescription)
  if (root.id !== sessionId || root.user_id !== owner || !prescription
    || !['planned', 'completed', 'skipped'].includes(root.status)) throw new Error('Session contract unavailable')
  const readProgram = () => db.from('training_programs').select('id,user_id,status,active_plan_version_id,program_mode')
    .eq('id', root.program_id).eq('user_id', owner).limit(2)
  const programResult = await readProgram(), program = programResult.data?.[0]
  if (programResult.error || programResult.data?.length !== 1 || !program || program.user_id !== owner || program.id !== root.program_id) throw new Error('Session program unavailable')
  let active = false
  if (program.status === 'active' && program.program_mode === 'rolling_weekly' && program.active_plan_version_id) {
    const planResult = await db.from('training_plan_versions').select('id,user_id,program_id,status,intent')
      .eq('id', program.active_plan_version_id).eq('user_id', owner).eq('program_id', root.program_id).limit(2)
    const plan = planResult.data?.[0], decoded = decodeCoachWeeklyIntent(plan?.intent)
    if (planResult.error || planResult.data?.length !== 1 || !plan || plan.status !== 'accepted' || plan.user_id !== owner
      || plan.id !== program.active_plan_version_id || plan.program_id !== root.program_id || !decoded) throw new Error('Active session plan unavailable')
    if (decoded.kind === 'reviewed') {
      const slots = await fetchReviewedExecutionSlots(db, owner, root.program_id, plan.id, decoded.plan.scheduledSessions)
      active = slots.some(slot => slot.executionSessionId === sessionId && slot.executionPlanVersionId === root.plan_version_id
        && slot.scheduledDate === root.scheduled_date && doseContentHash(slot.prescription) === doseContentHash(root.prescription))
    }
  }
  const rows = await db.from('coach_reviewed_set_reports').select('*', { count: 'exact' })
    .eq('user_id', owner).eq('prescribed_session_id', sessionId).order('revision', { ascending: true }).order('id', { ascending: true }).limit(2000)
  if (rows.error || !Array.isArray(rows.data) || !Number.isSafeInteger(rows.count) || rows.count !== rows.data.length) throw new Error('Complete set history unavailable')
  const seen = new Set<string>(), groups = new Map<string, { revision: number; id: string }>()
  const reports = rows.data.map(row => {
    const bound = bindReviewedSetReport(root.prescription, row.report)
    if (!bound || row.user_id !== owner || row.prescribed_session_id !== sessionId || row.program_id !== root.program_id
      || row.plan_version_id !== root.plan_version_id || row.activity_id !== bound.report.activityId
      || row.set_number !== bound.report.setNumber || row.side !== bound.report.side || row.revision !== bound.report.revision
      || typeof row.id !== 'string' || seen.has(row.id) || typeof row.request_id !== 'string'
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
      || doseContentHash(row.prescription_snapshot) !== doseContentHash(root.prescription)
      || doseContentHash(row.activity_snapshot) !== doseContentHash(bound.activity)) throw new Error('Set history differs from saved prescription')
    const key = JSON.stringify([row.activity_id, row.set_number, row.side]), prior = groups.get(key)
    if (row.revision !== (prior?.revision ?? 0) + 1) throw new Error('Set revision history incomplete')
    seen.add(row.id); groups.set(key, { revision: row.revision, id: row.id })
    return { id: row.id, requestId: row.request_id, createdAt: row.created_at, report: bound.report }
  })
  if (groups.size > 1000) throw new Error('Completion manifest exceeds supported size')
  const [afterRoot, afterProgram, afterRevision, auth] = await Promise.all([readRoot(), readProgram(), revision(), db.auth.getUser()])
  if (afterRoot.error || afterProgram.error || afterRoot.data?.length !== 1 || afterProgram.data?.length !== 1
    || doseContentHash(afterRoot.data[0]) !== doseContentHash(root) || doseContentHash(afterProgram.data[0]) !== doseContentHash(program)
    || before !== afterRevision || auth.error || auth.data.user?.id !== owner) throw new Error('Session changed during readback')
  return { userId: owner, sessionId, programId: root.program_id, executionPlanVersionId: root.plan_version_id,
    activePlanVersionId: program.active_plan_version_id, scheduledDate: root.scheduled_date, status: root.status,
    writable: active && root.status === 'planned', prescription, reports,
    latestReportIds: [...groups.values()].map(row => row.id).sort() }
}
