import { describe, expect, it } from 'vitest'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { reconcileReviewedExecution, type ReviewedExecutionSlot } from '@/app/lib/coach/reviewed-execution-continuity'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

function fixture() {
  const reviewed = reviewedRollingWeek(), input = structuredClone(reviewed.input)
  input.context.scheduleId = 'base'
  const base = buildReviewedRollingWeeklyPlan(input, reviewed.registry)
  if (base.kind !== 'reviewed_candidate') throw new Error('Expected base')
  const sourceSlots: ReviewedExecutionSlot[] = base.plan.scheduledSessions.map((slot, i) => ({
    userId: 'owner', programId: 'program', planVersionId: 'base', sessionIndex: i + 1,
    scheduledDate: slot.scheduledDate, prescription: slot.prescription, executionSessionId: `original-${slot.prescription.sessionId}`,
    executionPlanVersionId: 'original-version', status: 'planned', completedWorkoutId: null, completionContractVersion: null, hasReports: false,
  }))
  return { userId: 'owner', programId: 'program', basePlanVersionId: 'base',
    baseSessions: base.plan.scheduledSessions, sourceSlots, target: reviewed.plan }
}

describe('reviewed execution continuity', () => {
  it('carries completed Monday and started Friday without copying execution; moved unstarted slots are new', () => {
    const input = fixture()
    Object.assign(input.sourceSlots[0], { status: 'completed', completedWorkoutId: 'workout-1', completionContractVersion: 3 })
    input.sourceSlots[3].hasReports = true
    const before = structuredClone(input)
    const result = reconcileReviewedExecution(input)
    expect(result.kind).toBe('continuity')
    if (result.kind !== 'continuity') throw new Error('Expected continuity')
    expect(result.binding.slots.map(slot => slot.executionSessionId)).toEqual([
      'original-acceleration-squat', null, null, 'original-upright-trap-bar', 'original-bench-force',
    ])
    expect(result.binding.slots[0].executionPlanVersionId).toBe('original-version')
    expect(input).toEqual(before)
  })
  it.each(['completed', 'skipped', 'set_report', 'legacy_signal', 'checkin'])(
    'refuses to move bench after %s evidence', signal => {
      const input = fixture(), bench = input.sourceSlots.find(slot => slot.executionSessionId === 'original-bench-volume')!
      if (signal === 'completed') Object.assign(bench, { status: 'completed', completedWorkoutId: 'workout', completionContractVersion: 3 })
      else if (signal === 'skipped') Object.assign(bench, { status: 'skipped', completionContractVersion: 3 })
      else bench.hasReports = true
      expect(reconcileReviewedExecution(input).kind).toBe('review_required')
    })
  it.each(['preparation', 'provenance', 'date', 'drop'])(
    'rejects changed %s for a begun session', change => {
      const input = fixture(); input.sourceSlots[0].hasReports = true
      if (change === 'preparation') input.target.scheduledSessions[0].prescription.content.steps.pop()
      if (change === 'provenance') input.target.scheduledSessions[0].prescription.source.recipeHash = 'f'.repeat(64)
      if (change === 'date') input.target.scheduledSessions[0].scheduledDate = '2026-09-28'
      if (change === 'drop') input.target.scheduledSessions.shift()
      expect(reconcileReviewedExecution(input).kind).toBe('review_required')
    })
  it.each(['owner', 'program', 'plan', 'missing', 'duplicate_root', 'index', 'prescription'])(
    'rejects incomplete or inconsistent %s projection', change => {
      const input = fixture()
      if (change === 'owner') input.sourceSlots[0].userId = 'other'
      if (change === 'program') input.sourceSlots[0].programId = 'other'
      if (change === 'plan') input.sourceSlots[0].planVersionId = 'other'
      if (change === 'missing') input.sourceSlots.pop()
      if (change === 'duplicate_root') input.sourceSlots[1].executionSessionId = input.sourceSlots[0].executionSessionId
      if (change === 'index') input.sourceSlots[0].sessionIndex = 2
      if (change === 'prescription') input.sourceSlots[0].prescription = {}
      expect(reconcileReviewedExecution(input).kind).toBe('review_required')
    })
  it('retains the canonical root across repeated replacements', () => {
    const input = fixture(); input.target.scheduledSessions = structuredClone(input.baseSessions)
    input.sourceSlots.forEach(slot => { slot.hasReports = true })
    const result = reconcileReviewedExecution(input)
    expect(result.kind).toBe('continuity')
    if (result.kind === 'continuity') expect(result.binding.slots.map(slot => slot.executionSessionId)).toEqual(input.sourceSlots.map(slot => slot.executionSessionId))
  })
})
