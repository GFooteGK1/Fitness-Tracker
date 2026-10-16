import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { fetchCoachEvidenceContext } from '@/app/lib/coach/evidence-context'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedCompletion } from '../fixtures/reviewed-completion'
const root = (i: number) => `11111111-1111-4111-8111-11111111111${i}`

function fixture() {
  const reviewed = reviewedRollingWeek()
  const sessions = reviewed.plan.scheduledSessions.map((slot, i) => ({
    id: root(i), user_id: 'owner', program_id: 'program', plan_version_id: 'active', execution_plan_version_id: 'original',
    week_number: 1, session_index: i + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription,
    status: i ? 'planned' : 'completed', completed_workout_id: i ? null : 'workout', completion_contract_version: i ? null : 3, has_reports: i === 0,
  }))
  const tables: Record<string, Record<string, any>[]> = {
    training_programs: [{ id: 'program', user_id: 'owner', title: 'Synthetic week', goal_summary: 'Strength',
      start_date: reviewed.plan.windowStart, end_date: reviewed.plan.windowEnd, status: 'active', active_plan_version_id: 'active', program_mode: 'rolling_weekly' }],
    training_plan_versions: [{ id: 'active', user_id: 'owner', program_id: 'program', version: 2, status: 'accepted',
      reference_version: 'local', policy_version: 'local', intent: reviewed.intent, input_snapshot: { reviewedExecutionStorage: 'reviewed_execution_slots_v1' } }],
    prescribed_sessions: [sessions[1], sessions[2]],
    coach_effective_prescribed_sessions: sessions,
    coach_checkins: [{ id: 'checkin', user_id: 'owner', prescribed_session_id: root(0), plan_version_id: 'original', checkin_type: 'session',
      responses: { ...reviewedCompletion().feedback, completionContractVersion: 3, resultStatus: 'completed',
        feedbackProvenance: { checkinId: 'checkin', revision: 1 } }, occurred_at: '2026-09-21T18:00:00Z' }],
  }
  const state = { fail: '', truncate: false }
  const db = { from(table: string) {
    const filters: Array<(row: Record<string, any>) => boolean> = []
    const query = {
      select: () => query, order: () => query, lte: () => query, gte: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query },
      limit: async (limit: number) => {
        const all = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)))
        return { data: structuredClone(all.slice(0, state.truncate && table === 'coach_effective_prescribed_sessions' ? 2 : limit)),
          count: all.length, error: state.fail === table ? { message: 'Unavailable' } : null }
      },
    }
    return query
  } } as unknown as SupabaseClient
  return { db, tables, state }
}

describe('mapped execution readers', () => {
  it('runtime shows every canonical session and finds carried checkins under their original plan', async () => {
    const { db } = fixture()
    const result = await fetchCoachRuntimeContext(db, 'owner', new Date('2026-09-25T18:00:00Z'))
    expect(result.activeProgram?.upcomingSessions.map(row => row.id)).toEqual([0, 1, 2, 3, 4].map(root))
    expect(result.activeProgram?.upcomingSessions[0]).toMatchObject({ status: 'completed', completedWorkoutId: 'workout' })
    expect(result.activeProgram?.sessionCheckins).toEqual([expect.objectContaining({ id: 'checkin', prescribedSessionId: root(0) })])
  })
  it('evidence selection recognizes a canonical session carried from the previous plan', async () => {
    const { db } = fixture()
    const result = await fetchCoachEvidenceContext(db, 'owner', { purpose: 'today_session', prescribedSessionId: root(0), asOf: '2026-09-25T18:00:00Z', windowDays: 7 })
    expect(result.missing).not.toContain('session_not_in_active_plan')
    expect(result.missing).not.toContain('active_execution_manifest_unavailable')
  })
  it.each(['missing', 'truncated', 'unavailable', 'foreign', 'prescription'])(
    'both consumers fail closed for %s mapped execution instead of using partial raw sessions', async failure => {
      const { db, tables, state } = fixture()
      if (failure === 'missing') tables.coach_effective_prescribed_sessions.pop()
      if (failure === 'truncated') state.truncate = true
      if (failure === 'unavailable') state.fail = 'coach_effective_prescribed_sessions'
      if (failure === 'foreign') tables.coach_effective_prescribed_sessions[0].user_id = 'foreign'
      if (failure === 'prescription') tables.coach_effective_prescribed_sessions[0].prescription = {}
      const runtime = await fetchCoachRuntimeContext(db, 'owner')
      expect(runtime.activeProgram).toBeNull()
      expect(runtime.storageAvailable).toBe(false)
      const evidence = await fetchCoachEvidenceContext(db, 'owner', { purpose: 'today_session', prescribedSessionId: root(0), asOf: '2026-09-25T18:00:00Z', windowDays: 7 })
      expect(evidence.missing).toContain('active_execution_manifest_unavailable')
      expect(evidence.missing).toContain('session_not_in_active_plan')
    })
})
