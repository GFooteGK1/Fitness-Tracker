import type { FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { validatePlanningIntent, type PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { resolveHistorySnapshot } from '@/app/lib/coach/planning-history'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { validateSessionSignal } from '@/app/lib/coach/session-signals'
import { validateCoachSessionCheckinInput, hasExplicitFeedback } from '@/app/lib/coach/execution-feedback'

type Facts = Record<string, FixtureValue>
type Add = (table: string, row: Record<string, unknown>) => void

/** Explicit orthogonal scaffold: manual athlete-confirmed standard assessments;
 * 400m and 5000m track outcomes for the dual-distance family, or a standard
 * single-repetition bench assessment for the equipment family. Distances and
 * repetition count can be supplied explicitly. No dose or eligibility is input. */
export function materializeBoundBaselines(facts: Facts, owner: string, now: string, uuid: (v: string) => string, add: Add) {
  const multi = Array.isArray(facts.goalIds) && typeof facts.firstGoalBaseline === 'string'
  const equipment = typeof facts.requestedEquipment === 'string'
  if (!multi && !equipment) return null
  let outcomes: PlanningOutcome[]
  if (multi) {
    const ids = facts.goalIds as string[]
    const distances = (facts.goalDistancesMeters as number[] | undefined) ?? [400, 5000]
    if (ids.length !== 2 || distances.length !== 2) throw Error('Dual-distance family requires exactly two bound outcomes')
    outcomes = ids.map((id, index) => runningOutcome(id, distances[index]))
    outcomes.forEach((outcome, index) => { if ((index === 0 ? facts.firstGoalBaseline : facts.secondGoalBaseline) === 'achieved') outcome.goal.status = 'achieved' })
  } else {
    if (facts.metric !== 'strength.load' || !['kg', 'lb'].includes(String(facts.unit)) || facts.transferPolicy !== null) throw Error('Equipment family requires an installed strength load protocol and no transfer policy')
    const definition = findAssessmentDefinition('strength.repetition_max')!
    const outcome = runningOutcome(String(facts.goalId))
    outcome.domain = 'strength'; outcome.goal.requiredQualityIds = ['maximal_strength']; outcome.goal.statement = 'Improve standard bench repetition maximum'
    outcome.measurement = { metricId: 'strength.load', unit: facts.unit as 'kg' | 'lb', assessmentDefinition: { id: definition.id, version: definition.version }, protocol: { id: definition.protocol.id, version: definition.protocol.version } }
    outcome.binding = { movementId: String(facts.movementId ?? 'barbell_bench_press'), distance: null, equipmentIds: [String(facts.requestedEquipment) as PlanningOutcome['binding']['equipmentIds'][number]], variation: 'standard',
      assessmentContext: { repetitions: Number(facts.repetitions ?? 1), externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } }
    outcomes = [outcome]
  }
  outcomes.forEach((outcome, index) => {
    const status = multi ? index === 0 ? facts.firstGoalBaseline : facts.secondGoalBaseline : 'confirmed_comparable'
    if (status === 'missing') return
    const id = uuid(String(facts.measurementId ?? `${outcome.goal.id}:baseline`))
    outcome.baseline = { status: 'referenced', observationId: id }
    const b = outcome.binding, m = outcome.measurement!
    add('performance_observation_groups', { id, status: 'complete', verification_status: 'athlete_confirmed', verified_by: owner, source_kind: 'manual', source_system: 'sociusfit_training_baseline', observed_at: now,
      assessment_definition_id: m.assessmentDefinition.id, protocol_version: m.protocol.version,
      metadata: { origin: 'athlete_reported', assessmentDefinitionVersion: m.assessmentDefinition.version, protocolId: m.protocol.id },
      comparison_modifiers: { movementId: b.movementId, variationId: b.variation, distance: b.distance, equipmentIds: equipment ? [facts.observedEquipment] : b.equipmentIds,
        repetitions: b.assessmentContext?.repetitions ?? null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] } })
    add('performance_observation_values', { id: uuid(`${id}:value`), group_id: id, status: 'complete', semantic_role: 'direct_outcome', metric_id: m.metricId, unit: m.unit, value_numeric: multi ? 120 : 80 })
  })
  const content = intent(...outcomes)
  content.confirmedAt = now; outcomes.forEach(o => o.goal.source.confirmedAt = now)
  content.priorityOrder = Array.isArray(facts.goalPriority) ? facts.goalPriority as string[] : null
  const parsed = validatePlanningIntent(content)
  if (!parsed.ok) throw Error(`Bound-baseline scaffold rejected: ${parsed.errors.join('; ')}`)
  if (facts.goalConfirmed === true || facts.goalsConfirmed === true) add('coach_memories', { id: uuid(`${owner}:intent`), version: 1, memory_key: 'training_intent', status: 'confirmed', content: parsed.value })
  return { outcomes: parsed.value.outcomes, invariantScaffold: multi ? 'two standard track distances; direct baseline values are not attainment calculations' : 'standard single-repetition bench baseline; no equipment transfer' }
}

export function executeHistoricalSource(facts: Facts, owner: string) {
  const id = String(facts.observationId), asOf = '2026-09-16T12:00:00.000Z'
  const old = { id, user_id: owner, workout_date: '2026-09-15', created_at: '2026-09-15T12:00:00.000Z', blocks: [{ movements: [{ name: 'Bench press', reps: 5 }] }] }
  const current = { ...old, capture_revision: Number(facts.currentRevision), captured_at: '2026-09-17T12:00:00.000Z', blocks: [{ movements: [{ name: 'Bench press', reps: 8 }] }] }
  const revision = { id: `${id}:revision:${facts.asOfRevision}`, user_id: owner, original_entity_id: id, entity_kind: 'workout', revision: Number(facts.asOfRevision), record: old,
    provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'), captured_at: old.created_at, event_at: old.created_at, deleted: false }
  const input = { userId: owner, asOf, mode: 'historical_replay' as const, workouts: [current], revisions: facts.snapshotAvailable ? [revision] : [] }
  const before = JSON.stringify(input)
  const resolved = resolveHistorySnapshot(input)
  return { resolved, inputsUnchanged: JSON.stringify(input) === before, currentBlocks: current.blocks, archivedBlocks: old.blocks }
}

export function executeEffortScope(facts: Facts, now: string) {
  const hardest = facts.effortScope === 'hardest_set'
  const signal = hardest ? validateSessionSignal({ schemaVersion: 1, exerciseId: String(facts.measurementId), ratingScope: 'hardest_set', workStatus: 'as_planned', rpe: facts.value, rpeScale: 'effort_0_10' }) : null
  const session = validateCoachSessionCheckinInput({ feedbackVersion: 2, outcome: 'as_planned', sessionRpe: hardest ? null : facts.value, pain: null, energy: null, note: null, occurredAt: now })
  return { signal, session, sessionExplicit: session.ok && hasExplicitFeedback(session.value, 'sessionRpe') }
}
