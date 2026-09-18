import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import type { PlanningIntentV1, PlanningOutcome } from '@/app/lib/coach/planning-intent'
export function runningOutcome(id = 'goal:5k', distance = 5000): PlanningOutcome {
  const definition = findAssessmentDefinition('run.time_trial')!
  return {
    goal: { schemaVersion: 1, id, kind: 'performance_outcome', statement: `Improve ${distance} meter time`, priority: 'primary', status: 'active', target: null, targetDate: null, requiredQualityIds: ['aerobic_endurance'], source: { kind: 'athlete_confirmed', confirmedAt: '2026-09-17T12:00:00.000Z' } },
    domain: 'aerobic', measurement: { metricId: definition.primaryMetricId, unit: 's', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } },
    binding: { movementId: null, distance: { value: distance, unit: 'm' }, equipmentIds: ['track'], variation: null },
    baseline: { status: 'unknown' }, capability: { status: 'supported' },
  }
}
export function intent(...outcomes: PlanningOutcome[]): PlanningIntentV1 {
  return { schemaVersion: 1, outcomes: outcomes.length ? outcomes : [runningOutcome()], priorityOrder: null, event: null, confirmedAt: '2026-09-17T12:00:00.000Z' }
}

