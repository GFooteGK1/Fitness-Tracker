/** Fixed synthetic browser fixture. Never imported by application routes. */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'

export async function seedBrowserProgram(admin: SupabaseClient, owner: SupabaseClient, userId: string) {
  const source = reviewedRollingWeek(), input = structuredClone(source.input)
  input.context.scheduleId = 'base'
  const candidate = buildReviewedRollingWeeklyPlan(input, source.registry)
  if (candidate.kind !== 'reviewed_candidate') throw new Error('Invalid fixed browser base')
  const plan = candidate.plan, programId = randomUUID(), baseId = randomUUID()
  const writes = [
    () => owner.from('user_profiles').upsert({ user_id: userId, fitness_goals: ['performance'], body_metrics: { age: 35, height_cm: 175, weight_kg: 75 },
      preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } }),
    () => owner.rpc('get_coach_context_revision'),
    () => admin.from('training_programs').insert({ id: programId, user_id: userId, title: 'Synthetic browser lifecycle', goal_summary: 'Fixed reviewed test week',
      start_date: plan.windowStart, end_date: plan.windowEnd, status: 'draft', program_mode: 'rolling_weekly' }),
    () => admin.from('training_plan_versions').insert({ id: baseId, user_id: userId, program_id: programId, version: 1, status: 'accepted',
      accepted_at: new Date().toISOString(), reference_version: 'local-browser-test', policy_version: 'initial-dose-0.2.0', plan_mode: 'rolling_weekly',
      window_start: plan.windowStart, window_end: plan.windowEnd, sequence_number: 1,
      intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: plan }, input_snapshot: {} }),
    () => admin.from('training_programs').update({ status: 'active', active_plan_version_id: baseId }).eq('id', programId),
    () => admin.from('prescribed_sessions').insert(plan.scheduledSessions.map((slot, i) => ({ id: randomUUID(), user_id: userId, program_id: programId,
      plan_version_id: baseId, week_number: 1, session_index: i + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription }))),
  ]
  for (const write of writes) { const result = await write(); if (result.error) throw new Error(`Synthetic seed failed: ${result.error.code}`) }
  return { programId, baseId }
}

export async function fixedBrowserReview(owner: SupabaseClient, userId: string, programId: string, transition: 'same_week' | 'next_week'): Promise<TrustedReviewedWeekRegistration> {
  const active = await owner.from('training_programs').select('active_plan_version_id').eq('id', programId).eq('user_id', userId).single()
  if (active.error) throw new Error('Owned active base unavailable')
  const scope = { programId, basePlanVersionId: active.data.active_plan_version_id as string,
    historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300), historyDays: 28, tzOffset: 300 }
  const source = await fetchReviewedDoseContext(owner, scope), fixture = reviewedRollingWeek()
  if (transition === 'next_week') {
    // Fixed transport variant, not a new human coaching acceptance.
    fixture.input.windowStart = fixture.input.context.profile.startDate = '2026-08-10'
    fixture.input.sequenceNumber = 2
    fixture.registry[0].recipe.profileHash = doseContentHash(fixture.input.context.profile)
    fixture.registry[0].contentHash = doseContentHash(fixture.registry[0].recipe)
  }
  const { profile: _profile, ...context } = fixture.input.context; void _profile
  return { id: `browser-${transition}-${randomUUID()}`, userId, scope, contextHash: source.contextHash, transition,
    compilation: { ...fixture.input, context }, reviewedWeeks: fixture.registry }
}
