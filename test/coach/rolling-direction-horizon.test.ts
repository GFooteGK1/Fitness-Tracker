import { describe, expect, it } from 'vitest'
import { ConfirmedEventDateConflictError, profileForDirectionHorizon } from '@/app/lib/coach/rolling-weekly-api'
import type { ProgrammingProfile } from '@/app/lib/coach/programming-schema'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'

const eventDate = '2027-04-10'
const startDate = '2026-09-21'

function profileWithEvent(): ProgrammingProfile {
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[4].profile)
  const content = intent(runningOutcome())
  content.event = { name: 'Synthetic spring event', date: eventDate, goalIds: [content.outcomes[0].goal.id] }
  profile.trainingIntent = { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content }
  return profile
}

describe('rolling direction confirmed event horizon', () => {
  it.each(['2026-12-13', null])('rejects conflicting or absent goal date %s without changing confirmed input', targetDate => {
    const profile = profileWithEvent()
    const original = structuredClone(profile)
    expect(() => profileForDirectionHorizon(profile, startDate, targetDate)).toThrow(`confirmed event date (${eventDate})`)
    expect(() => profileForDirectionHorizon(profile, startDate, targetDate)).toThrow(ConfirmedEventDateConflictError)
    expect(profile).toEqual(original)
  })

  it('retains a matching date and ordinary adjacent-week horizon without changing the prior profile', () => {
    const original = profileWithEvent()
    const originalSnapshot = structuredClone(original)
    const first = profileForDirectionHorizon(original, startDate, eventDate)
    const firstSnapshot = structuredClone(first)
    const next = profileForDirectionHorizon(first, '2026-09-28', eventDate)
    expect(first.primaryGoal.outcome?.horizon).toEqual({ startsOn: startDate, endsOn: eventDate })
    expect(next.primaryGoal.outcome?.horizon).toEqual(first.primaryGoal.outcome?.horizon)
    expect(next.startDate).toBe('2026-09-28')
    expect(next.trainingIntent).toEqual(original.trainingIntent)
    expect(first).toEqual(firstSnapshot)
    expect(original).toEqual(originalSnapshot)
  })

  it.each(['absent_intent', 'no_event', 'undated_event'] as const)('preserves %s compatibility for supplied and null horizon dates', variant => {
    const profile = profileWithEvent()
    if (variant === 'absent_intent') delete profile.trainingIntent
    else if (variant === 'no_event') profile.trainingIntent!.content.event = null
    else profile.trainingIntent!.content.event!.date = null
    expect(profileForDirectionHorizon(profile, startDate, '2026-12-13').primaryGoal.outcome?.horizon.endsOn).toBe('2026-12-13')
    expect(profileForDirectionHorizon(profile, startDate, null).primaryGoal.outcome).toBeUndefined()
  })

  it('does not let an event tied only to a paused outcome override a separate active outcome', () => {
    const profile = profileWithEvent()
    profile.trainingIntent!.content.outcomes[0].goal.status = 'paused'
    profile.trainingIntent!.content.outcomes.push(runningOutcome('goal:other-race', 10000))
    expect(profileForDirectionHorizon(profile, startDate, '2026-12-13').primaryGoal.outcome?.horizon.endsOn).toBe('2026-12-13')
    expect(profileForDirectionHorizon(profile, startDate, null).primaryGoal.outcome).toBeUndefined()
  })
})
