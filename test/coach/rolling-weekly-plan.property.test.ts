import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

describe('rolling weekly planning properties', () => {
  it('replays deterministically and never emits a hidden future week', () => {
    fc.assert(fc.property(
      fc.constantFrom(...GOLDEN_PROGRAMMING_PROFILES),
      fixture => {
        const profile = structuredClone({ ...fixture.profile, startDate: '2026-09-07' })
        const direction = buildRollingTrainingDirection(profile, {
          hypothesis: `Use repeatable ${profile.primaryGoal.domain} practice to test the current hypothesis.`,
          goalTargetDate: '2027-01-31'
        })
        const input = {
          source: 'initial' as const,
          windowStart: '2026-09-07',
          profile,
          direction
        }
        const first = buildRollingWeeklyPlan(input)
        const replay = buildRollingWeeklyPlan(input)
        expect(replay).toEqual(first)
        expect(first.kind).toBe('weekly_plan')
        if (first.kind !== 'weekly_plan') return false

        const knownMovements = new Set(MOVEMENT_CATALOG.map(movement => movement.id))
        const movementIds = first.sessions.flatMap(session => (
          session.blocks.flatMap(block => block.exercises.map(exercise => exercise.movementId))
        ))
        return first.windowEnd === '2026-09-13'
          && first.sequenceNumber === 1
          && first.schedule.weekNumber === 1
          && first.sessions.every(session => session.weekNumber === 1)
          && first.scheduledSessions.every(session => (
            session.scheduledDate >= first.windowStart
            && session.scheduledDate <= first.windowEnd
          ))
          && movementIds.every(id => knownMovements.has(id))
      }
    ))
  })
})
