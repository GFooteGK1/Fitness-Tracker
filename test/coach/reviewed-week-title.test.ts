import { describe, expect, it } from 'vitest'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

const actualGoal = 'Develop strength with reliable twice-weekly bench work and lower-body support. Choose working loads from set effort and crisp technique; older performed training is unknown.'

function compile(goal: string) {
  const { input, registry } = reviewedRollingWeek()
  input.context.profile.athleteGoalSummary = goal
  input.direction = buildRollingTrainingDirection(input.context.profile, {
    hypothesis: 'Use the explicitly reviewed complete week.', goalTargetDate: null,
  })
  registry[0].recipe.profileHash = doseContentHash(input.context.profile)
  registry[0].contentHash = doseContentHash(registry[0].recipe)
  const result = buildReviewedRollingWeeklyPlan(input, registry)
  expect(result.kind).toBe('reviewed_candidate')
  if (result.kind !== 'reviewed_candidate') throw Error(result.reasons.join('; '))
  return result.plan
}

describe('reviewed week display title database compatibility', () => {
  it.each([
    ['short goal', 'Strength development'],
    ['short Unicode goal', 'Develop 🏋 strength'],
    ['exact 160-character title', 'a'.repeat(148)],
  ])('preserves an already valid title: %s', (_, goal) => {
    const plan = compile(goal)
    expect(plan.title).toBe(`${goal}: 2026-08-03`)
    expect(Array.from(plan.title).length).toBeLessThanOrEqual(160)
  })

  it.each([
    ['first character beyond the database bound', 'a'.repeat(149)],
    ['real failed synthetic goal', actualGoal],
    ['Unicode codepoint boundary', 'a'.repeat(147) + '🏋' + 'x'],
  ])('bounds only the display title and retains the complete goal: %s', (_, goal) => {
    const plan = compile(goal)
    expect(Array.from(plan.title)).toHaveLength(160)
    expect(plan.title.endsWith(': 2026-08-03')).toBe(true)
    expect(plan.title).not.toContain('\uFFFD')
    if (goal.includes('🏋')) expect(plan.title).toBe('a'.repeat(147) + '🏋: 2026-08-03')
    expect(plan.profileSnapshot.athleteGoalSummary).toBe(goal)
    expect(plan.directionSnapshot.goalSummary).toBe(goal)
    expect(plan.scheduledSessions).toHaveLength(5)
    expect(plan.adaptiveEvaluation).toBe('unavailable')
  })
})
