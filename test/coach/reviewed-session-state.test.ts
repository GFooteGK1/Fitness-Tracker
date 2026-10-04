import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'
import { bindReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedSetReport } from '../fixtures/reviewed-set-report'

function fixture() {
  const week = reviewedRollingWeek()
  const slots = week.plan.scheduledSessions.map((slot, i) => ({ id: `session-${i}`, user_id: 'owner', program_id: 'program',
    plan_version_id: 'active', execution_plan_version_id: 'original', week_number: 1, session_index: i + 1,
    scheduled_date: slot.scheduledDate, prescription: slot.prescription, status: 'planned', completed_workout_id: null,
    completion_contract_version: null, has_reports: i === 0 }))
  const root = { ...slots[0], plan_version_id: 'original' }
  const activity = root.prescription.content.steps.find(step => step.kind === 'activity')!
  const report = reviewedSetReport(activity.id)
  const bound = bindReviewedSetReport(root.prescription, report)!
  const row = { id: 'report-1', user_id: 'owner', program_id: 'program', plan_version_id: 'original', prescribed_session_id: root.id,
    request_id: 'request-one', created_at: '2026-09-28T01:00:00Z', activity_id: report.activityId, set_number: 1, side: 'both', revision: 1,
    report, prescription_snapshot: root.prescription, activity_snapshot: bound.activity }
  const tables: Record<string, Record<string, any>[]> = {
    prescribed_sessions: [root], coach_context_revisions: [{ user_id: 'owner', revision: 2 }],
    training_programs: [{ id: 'program', user_id: 'owner', status: 'active', program_mode: 'rolling_weekly', active_plan_version_id: 'active' }],
    training_plan_versions: [{ id: 'active', user_id: 'owner', program_id: 'program', status: 'accepted', intent: week.intent }],
    coach_effective_prescribed_sessions: slots, coach_reviewed_set_reports: [row, { ...row, id: 'report-2', request_id: 'request-two', revision: 2,
      report: { ...report, revision: 2, repetitions: 3, load: null, rpe: null } }],
  }
  const state = { fail: '', truncate: false, change: '', owner: 'owner' }, counts: Record<string, number> = {}
  const db = { auth: { getUser: async () => ({ data: { user: { id: state.owner } }, error: null }) }, from(table: string) {
    const filters: Array<(row: Record<string, any>) => boolean> = []; counts[table] = (counts[table] ?? 0) + 1
    const call = counts[table]
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      limit: async (limit: number) => {
        const all = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)))
        const data = structuredClone(all.slice(0, state.truncate && table === 'coach_reviewed_set_reports' ? 1 : limit))
        if (state.change === table && call > 1 && data[0]) data[0] = { ...data[0], revision: 99, status: 'changed' }
        return { data, count: all.length, error: state.fail === table ? { message: 'unavailable' } : null }
      },
    }
    return query
  } } as unknown as SupabaseClient
  return { db, tables, state }
}
describe('complete owned reviewed session readback', () => {
  it('returns canonical carried execution, both immutable revisions and only the latest manifest ID', async () => {
    const { db } = fixture(), result = await fetchReviewedSessionState(db, 'owner', 'session-0')
    expect(result).toMatchObject({ executionPlanVersionId: 'original', activePlanVersionId: 'active', writable: true, latestReportIds: ['report-2'] })
    expect(result?.reports.map(row => row.report.repetitions)).toEqual([6, 3])
    expect(result?.reports[1].report).toMatchObject({ load: null, rpe: null })
  })
  it('returns null for foreign/missing roots without disclosing history or initializing a revision', async () => {
    const { db } = fixture()
    expect(await fetchReviewedSessionState(db, 'foreign', 'session-0')).toBeNull()
    expect(await fetchReviewedSessionState(db, 'owner', 'missing')).toBeNull()
  })
  it('keeps historical completed sessions readable but not writable', async () => {
    const { db, tables } = fixture(); tables.prescribed_sessions[0].status = 'completed'
    tables.training_programs[0].status = 'archived'
    expect(await fetchReviewedSessionState(db, 'owner', 'session-0')).toMatchObject({ status: 'completed', writable: false })
  })
  it.each(['coach_context_revisions', 'training_programs', 'training_plan_versions', 'coach_effective_prescribed_sessions', 'coach_reviewed_set_reports'])(
    'fails closed on unavailable %s', async fail => {
      const { db, state } = fixture(); state.fail = fail
      await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow()
    })
  it('rejects truncated report history and missing revision chains', async () => {
    const { db, state, tables } = fixture(); state.truncate = true
    await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow('Complete set history')
    state.truncate = false; tables.coach_reviewed_set_reports.shift()
    await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow('revision history incomplete')
  })
  it.each(['user_id', 'prescribed_session_id', 'plan_version_id', 'activity_id', 'prescription_snapshot', 'activity_snapshot'])(
    'rejects mismatched report %s', async field => {
      const { db, tables } = fixture(); tables.coach_reviewed_set_reports[0][field] = 'wrong'
      await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow()
    })
  it.each(['coach_context_revisions', 'prescribed_sessions', 'training_programs'])('rejects concurrent changes in %s', async change => {
    const { db, state } = fixture(); state.change = change
    await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow('changed during readback')
  })
  it('rejects changed authenticated owner before returning any history', async () => {
    const { db, state } = fixture(); state.owner = 'other'
    await expect(fetchReviewedSessionState(db, 'owner', 'session-0')).rejects.toThrow('changed during readback')
  })
})
