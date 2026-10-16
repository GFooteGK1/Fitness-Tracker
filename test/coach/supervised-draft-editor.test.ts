import { describe, expect, it } from 'vitest'
import { copySupervisedSession, editSupervisedStep, removeSupervisedSession, moveSupervisedSession, seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
import { effortWorkPlan } from '../fixtures/reviewed-effort-work'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { compileOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

describe('untrusted supervised draft seed', () => {
  const ids = () => { let n = 0; return () => `new-identity-${++n}` }

  it('preserves baseline sessions when copying into a day freed by a move', () => {
    const fixture = reviewedRollingWeek(), seed = seedSupervisedWeek(fixture.plan, 'next_week')!
    const days = seed.recipe.schedules[0].days
    const from = Object.keys(days).find(d => days[d as keyof typeof days]) as keyof typeof days
    const empty = Object.keys(days).find(d => days[d as keyof typeof days] === null) as keyof typeof days
    const moved = moveSupervisedSession(seed, days[from]!, empty)
    const copied = copySupervisedSession(moved, days[from]!, from, ids())
    expect(copied.recipe.baseSchedule[from]).toBe(days[from])
    expect(copied.recipe.schedules[0].days[empty]).toBe(days[from])
    for (const schedule of [copied.recipe.baseSchedule, copied.recipe.schedules[0].days]) {
      expect(Object.values(schedule).filter(Boolean).sort()).toEqual(copied.recipe.sessions.map(s => s.id).sort())
    }
    expect(seed.recipe.sessions).toHaveLength(copied.recipe.sessions.length - 1)
    const context = structuredClone(fixture.input.context)
    context.profile.sessionAvailability.push({ day: empty, minutes: 120 })
    context.scheduleId = copied.scheduleId
    const recipe = { ...fixture.registry[0].recipe, ...copied.recipe, profileHash: doseContentHash(context.profile) }
    const compiled = compileOfflineReviewedWeek(context, [{ recipe, contentHash: doseContentHash(recipe) }])
    expect(compiled.kind, JSON.stringify(compiled)).toBe('compiled')
  })

  it('copies optional boundaries and linked monitoring identities without changing original work', () => {
    const seed = seedSupervisedWeek(effortWorkPlan(), 'next_week')!
    const source = seed.recipe.sessions.find(s => s.optionalTail)!
    const day = Object.keys(seed.recipe.baseSchedule).find(d => seed.recipe.baseSchedule[d as keyof typeof seed.recipe.baseSchedule] === null) as keyof typeof seed.recipe.baseSchedule
    const copied = copySupervisedSession(seed, source.id, day, ids())
    const clone = copied.recipe.sessions.at(-1)!
    expect(clone.optionalTail!.fromStepId).toBe(clone.steps[source.steps.findIndex(s => s.id === source.optionalTail!.fromStepId)].id)
    expect(clone.steps.map(s => s.id).some(id => source.steps.some(s => s.id === id))).toBe(false)
    const protocol = seed.recipe.protocols[0]
    const monitored = seed.recipe.sessions.find(s => s.id === protocol.sessionId)!
    const step = monitored.steps.find(s => s.id === protocol.activityId || s.kind === 'preparation_window' && s.activities.some(a => a.id === protocol.activityId))!
    const edited = editSupervisedStep(seed, monitored.id, step.id, 'copy', ids())
    const newProtocol = edited.recipe.protocols.at(-1)!
    expect(newProtocol).toMatchObject({ sessionId: protocol.sessionId, instructions: protocol.instructions })
    expect(newProtocol.id).not.toBe(protocol.id); expect(newProtocol.activityId).not.toBe(protocol.activityId)
    expect(reviewedSessionActivities(edited.recipe.sessions.find(s => s.id === monitored.id)!).find(a => a.id === newProtocol.activityId)?.protocolId).toBe(newProtocol.id)
  })

  it('removes only the selected session and its protocols, and protects optional boundary removal', () => {
    const seed = seedSupervisedWeek(effortWorkPlan(), 'next_week')!
    const source = seed.recipe.sessions.find(s => s.optionalTail)!
    expect(() => editSupervisedStep(seed, source.id, source.optionalTail!.fromStepId, 'remove', ids())).toThrow(/optional-work boundary/)
    expect(() => editSupervisedStep(seed, source.id, 'logging', 'remove', ids())).toThrow(/logging allowance/)
    const removed = removeSupervisedSession(seed, source.id)
    expect(removed.recipe.sessions.map(s => s.id)).not.toContain(source.id)
    expect(removed.recipe.protocols).toEqual(seed.recipe.protocols.filter(p => p.sessionId !== source.id))
    expect(Object.values(removed.recipe.baseSchedule)).not.toContain(source.id)
    const moved = editSupervisedStep(seed, source.id, source.steps[0].id, 'later', ids())
    expect(moved.recipe.sessions.find(s => s.id === source.id)!.steps[1]).toEqual(source.steps[0])
    expect(moved.recipe.sessions.find(s => s.id === source.id)!.optionalTail).toEqual(source.optionalTail)
  })
  it('preserves exact complete effort-led work and optional tail without copying review authority', () => {
    const week = effortWorkPlan(), seed = seedSupervisedWeek(week, 'next_week')!
    expect(seed.recipe.sessions).toEqual(week.scheduledSessions.map(s => s.prescription.content))
    expect(seed.recipe.protocols).toEqual(week.scheduledSessions.flatMap(s => s.prescription.protocols))
    expect(seed.recipe.sessions[0].optionalTail).toEqual(week.scheduledSessions[0].prescription.content.optionalTail)
    expect(reviewedSessionActivities(seed.recipe.sessions[0]).find(a => a.id === 'required-work')?.work).toMatchObject({ kind: 'effort_repetitions', targetRir: 2 })
    expect(seed.windowStart).toBe('2026-08-10'); expect(seed.sequenceNumber).toBe(2)
    expect(seed.recipe).not.toHaveProperty('review'); expect(seed.recipe).not.toHaveProperty('sources')
    seed.recipe.sessions[0].instructions.push('Proposed edit')
    expect(week.scheduledSessions[0].prescription.content.instructions).not.toContain('Proposed edit')
  })

  it('starts from the actual accepted schedule instead of the historical base schedule', () => {
    const week = reviewedRollingWeek().plan
    // The real compiled fixture moves bench to Tuesday from its original day;
    // preserve its validated spacing rather than modifying one metadata field.
    const seed = seedSupervisedWeek(week, 'same_week')!
    for (const slot of week.scheduledSessions) expect(seed.recipe.baseSchedule[slot.prescription.day]).toBe(slot.prescription.sessionId)
    expect(seed.recipe.baseSchedule).not.toEqual(week.baseSchedule)
    expect(seed.recipe.schedules).toHaveLength(1)
    expect(seed.windowStart).toBe(week.windowStart)
  })

  it('swaps occupied days without dropping or duplicating work or mutating the base', () => {
    const seed = seedSupervisedWeek(reviewedRollingWeek().plan, 'same_week')!
    const days = seed.recipe.schedules[0].days, occupied = Object.entries(days).filter(([, id]) => id !== null)
    const [from, to] = occupied
    const moved = moveSupervisedSession(seed, from[1]!, to[0] as keyof typeof days)
    expect(moved.recipe.schedules[0].days[to[0] as keyof typeof days]).toBe(from[1])
    expect(moved.recipe.schedules[0].days[from[0] as keyof typeof days]).toBe(to[1])
    expect(moved.recipe.sessions).toEqual(seed.recipe.sessions)
    expect(moved.recipe.baseSchedule).toEqual(seed.recipe.baseSchedule)
    expect(seed.recipe.schedules[0].days).toEqual(days)
  })

  it('refuses an invalid week or missing effort instead of inventing a prescription', () => {
    expect(seedSupervisedWeek({}, 'next_week')).toBeNull()
    const week = effortWorkPlan(), activity = reviewedSessionActivities(week.scheduledSessions[0].prescription.content)[0]
    delete (activity as Partial<typeof activity>).effort
    expect(seedSupervisedWeek(week, 'next_week')).toBeNull()
  })
})
