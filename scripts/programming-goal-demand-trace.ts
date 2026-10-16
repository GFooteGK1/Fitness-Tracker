/** Offline development trace. No athlete records, network calls, policy changes or writes. */
import { createHash } from 'node:crypto'
import { findAssessmentDefinition, type TrainableQualityId } from '../app/lib/coach/adaptive-programming-contracts'
import { buildAdaptivePlanContract } from '../app/lib/coach/adaptive-plan'
import { MOVEMENT_EQUIPMENT_IDS } from '../app/lib/coach/movement-catalog'
import { validatePlanningIntent, type PlanningIntentSnapshot, type PlanningOutcome } from '../app/lib/coach/planning-intent'
import { applyConfirmedIntentToProfile } from '../app/lib/coach/planning-intent-server'
import { personalizedCoachingCapabilities } from '../app/lib/personalized-coaching-capabilities'
import { buildRollingTrainingDirection } from '../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '../app/lib/coach/rolling-weekly-plan'
import { buildStoredRollingWeeklyIntent, parseStoredRollingWeeklyIntent, serializeRollingSessions } from '../app/lib/coach/rolling-weekly-api'
import type { ProgrammingProfile } from '../app/lib/coach/programming-schema'
import type { CoachProgramDomainId } from '../app/lib/coach/types'
import { GOLDEN_PROGRAMMING_PROFILES } from '../test/coach/golden-programming-profiles'
import { intent, runningOutcome } from '../test/fixtures/personalized-coaching/intent'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function demandTraceProfile(domain: CoachProgramDomainId): ProgrammingProfile {
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES.find(item => item.profile.primaryGoal.domain === domain)!.profile)
  profile.trainingExperience = 'consistent'
  profile.equipment = { resolvedIds: [...MOVEMENT_EQUIPMENT_IDS], unresolvedAthleteDescription: null }
  profile.sessionAvailability = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(day => ({
    day: day as ProgrammingProfile['sessionAvailability'][number]['day'], minutes: 90
  }))
  return profile
}

export function speedOutcome(quality: 'acceleration' | 'max_velocity'): PlanningOutcome {
  const outcome = runningOutcome('goal:speed', 20)
  const definition = findAssessmentDefinition('sprint.time')!
  outcome.domain = 'speed_agility'
  outcome.goal.statement = 'Improve short-distance running speed'
  outcome.goal.requiredQualityIds = [quality]
  outcome.measurement = { metricId: 'sprint.time', unit: 's', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
  return outcome
}

/** Deliberately targetless, non-event skill goals: do not invent a numerical assessment. */
export function skillOutcome(id: string, domain: CoachProgramDomainId, quality: TrainableQualityId): PlanningOutcome {
  const outcome = runningOutcome(id)
  outcome.domain = domain
  outcome.goal.kind = 'skill'
  outcome.goal.statement = `Build a repeatable ${domain} training practice`
  outcome.goal.requiredQualityIds = [quality]
  outcome.measurement = null
  outcome.binding = { movementId: null, distance: null, equipmentIds: [], variation: null }
  return outcome
}

export function snapshot(outcomes: PlanningOutcome[]): PlanningIntentSnapshot {
  return { schemaVersion: 1, memoryId: '11111111-1111-4111-8111-111111111111', memoryVersion: 1, content: intent(...outcomes) }
}

export function traceGeneratedWeek(input: ProgrammingProfile, confirmed: PlanningIntentSnapshot) {
  const before = hash({ input, confirmed })
  const validation = validatePlanningIntent(confirmed.content)
  if (!validation.ok) throw new Error(`Invalid synthetic fixture: ${validation.errors.join('; ')}`)
  const profile = applyConfirmedIntentToProfile(input, confirmed)
  const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Use the confirmed goal demands to select the training emphasis.' })
  const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
  if (plan.kind !== 'weekly_plan') throw new Error('Expected a compiled development week')
  const adaptive = buildAdaptivePlanContract(profile, [plan])
  const stored = buildStoredRollingWeeklyIntent(plan, adaptive)
  const readback = parseStoredRollingWeeklyIntent(JSON.parse(JSON.stringify(stored)))
  if (!readback) throw new Error('Stored-format readback failed')
  if (before !== hash({ input, confirmed })) throw new Error('Trace mutated a source input')
  const serializedSessions = serializeRollingSessions(plan)
  return {
    profile, plan, stored, readback, serializedSessions,
    summary: {
      declaredOutcomes: confirmed.content.outcomes.map(o => ({ id: o.goal.id, domain: o.domain, qualities: o.goal.requiredQualityIds })),
      selectedTargets: plan.schedule.requirements.map(r => r.targetId),
      assignedTargets: plan.schedule.assignments.map(a => a.targetId),
      gaps: plan.schedule.gaps,
      adaptiveQualities: adaptive.qualityEmphases.map(q => q.qualityId),
      adaptiveGoalIds: adaptive.goals.map(g => g.goalId),
      sessionCount: plan.sessions.length,
      movementIds: plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises.map(e => e.movementId))),
      fullSessionPayloadHash: hash(serializedSessions),
      storedIntentHash: hash(stored.training_intent),
      storedFormatReadback: true,
      readbackSessionsMatch: hash(serializeRollingSessions(readback.weekly_plan)) === hash(serializedSessions),
      readbackIntentMatches: hash(readback.training_intent) === hash(confirmed),
      sourceInputsUnchanged: true
    }
  }
}

export function runGoalDemandTrace() {
  const speedProfile = demandTraceProfile('speed_agility')
  const acceleration = traceGeneratedWeek(speedProfile, snapshot([speedOutcome('acceleration')]))
  const maximumVelocity = traceGeneratedWeek(speedProfile, snapshot([speedOutcome('max_velocity')]))

  const nonEventProfile = demandTraceProfile('strength')
  const force = traceGeneratedWeek(nonEventProfile, snapshot([skillOutcome('goal:practice', 'strength', 'maximal_strength')]))
  const capacity = traceGeneratedWeek(nonEventProfile, snapshot([skillOutcome('goal:practice', 'strength', 'strength_endurance')]))

  const secondarySpeedProfile = demandTraceProfile('strength')
  secondarySpeedProfile.secondaryGoals = [{ id: 'goal:secondary:speed', domain: 'speed_agility', role: 'secondary', allocation: 'development', athleteIntent: 'Develop upright running speed' }]
  const secondarySpeed = traceGeneratedWeek(secondarySpeedProfile, snapshot([
    skillOutcome('goal:strength', 'strength', 'maximal_strength'), speedOutcome('max_velocity')
  ]))

  const aerobicProfile = demandTraceProfile('aerobic')
  const runs = snapshot([runningOutcome('goal:short-run', 1500), runningOutcome('goal:long-run', 10000)])
  runs.content.priorityOrder = ['goal:short-run', 'goal:long-run']
  const shortFirst = traceGeneratedWeek(aerobicProfile, runs)
  const reversed = structuredClone(runs)
  reversed.content.priorityOrder = ['goal:long-run', 'goal:short-run']
  const longFirst = traceGeneratedWeek(aerobicProfile, reversed)

  const event = snapshot([
    skillOutcome('goal:force', 'strength', 'maximal_strength'),
    skillOutcome('goal:power', 'power_explosiveness', 'explosive_strength'),
    speedOutcome('max_velocity'), runningOutcome('goal:endurance', 1600)
  ])
  event.content.event = { name: 'Synthetic four-domain event', goalIds: event.content.outcomes.map(o => o.goal.id), date: null }
  const eventValidation = validatePlanningIntent(event.content)
  if (!eventValidation.ok) throw new Error(eventValidation.errors.join('; '))
  const eventProfile = demandTraceProfile('strength')
  eventProfile.secondaryGoals = [
    { id: 'goal:power', domain: 'power_explosiveness', role: 'secondary', allocation: 'development', athleteIntent: 'Develop power' },
    { id: 'goal:speed', domain: 'speed_agility', role: 'secondary', allocation: 'development', athleteIntent: 'Develop speed' }
  ]
  let eventError: string | null = null
  try { applyConfirmedIntentToProfile(eventProfile, event) } catch (error) { eventError = error instanceof Error ? error.message : String(error) }

  return {
    schemaVersion: 1,
    scope: 'Synthetic offline current-behavior characterization; no hosted DB, UI or athlete-outcome validation',
    supportedCoachingBehaviorProven: false,
    initialDosePolicy: personalizedCoachingCapabilities().initialDosePolicy,
    cases: {
      speedQuality: { acceleration: acceleration.summary, maximumVelocity: maximumVelocity.summary,
        fullSessionPayloadsEqual: acceleration.summary.fullSessionPayloadHash === maximumVelocity.summary.fullSessionPayloadHash },
      nonEventQuality: { force: force.summary, capacity: capacity.summary,
        fullSessionPayloadsEqual: force.summary.fullSessionPayloadHash === capacity.summary.fullSessionPayloadHash },
      secondaryMaximumVelocity: secondarySpeed.summary,
      sameDomainPriority: { shortFirst: shortFirst.summary, longFirst: longFirst.summary,
        fullSessionPayloadsEqual: shortFirst.summary.fullSessionPayloadHash === longFirst.summary.fullSessionPayloadHash },
      fourDomainEvent: { validConfirmedIntent: true, outcomeIds: event.content.outcomes.map(o => o.goal.id), error: eventError },
      domainControl: { fullSessionPayloadsDiffer: force.summary.fullSessionPayloadHash !== acceleration.summary.fullSessionPayloadHash }
    }
  }
}
