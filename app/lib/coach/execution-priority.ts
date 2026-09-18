import { MOVEMENT_CATALOG } from './movement-catalog'
import type { CompleteProgrammingSessionPrescription, ProgrammingProfile, WeeklyCoverageRequirement } from './programming-schema'
import type { WeeklyCoverageAssignment, WeeklyCoverageSchedule } from './weekly-coverage'

export const EXECUTION_PRIORITY_VERSION = 'execution-priority-1' as const
export interface ExecutionPriorityIntent { goalId: string; movementId: string }
export function mustPrecede(before: WeeklyCoverageRequirement, after: WeeklyCoverageRequirement): boolean {
  return before.id !== after.id && (before.sequencing.mustPrecedeKinds.includes(after.kind)
    || (before.kind === 'performance_quality' && after.kind !== 'performance_quality' && after.fatigueCost === 'high'))
}
export function focusedRequirement(profile: ProgrammingProfile, schedule: WeeklyCoverageSchedule): WeeklyCoverageRequirement | null {
  const intent = profile.executionPriority
  if (!intent) return null
  const outcome = profile.trainingIntent?.content.outcomes.find(o => o.goal.id === intent.goalId)
  if (!outcome || outcome.domain !== 'strength' || outcome.binding.movementId !== intent.movementId
    || profile.trainingIntent?.content.priorityOrder?.[0] !== intent.goalId) throw new Error('Execution priority needs a confirmed leading strength outcome')
  const movement = MOVEMENT_CATALOG.find(m => m.id === intent.movementId)
  const matches = schedule.requirements.filter(r => r.goalAllocationId === profile.primaryGoal.id && r.kind === 'movement_pattern'
    && movement?.coverage.some(tag => tag.kind === r.kind && tag.targetId === r.targetId))
  return matches.length === 1 && schedule.assignments.some(a => a.requirementId === matches[0].id) ? matches[0] : null
}
/** Stable topological ordering preserves existing tie-breaks after mandatory constraints. */
export function orderSessionAssignments(ranked: WeeklyCoverageAssignment[], requirements: ReadonlyMap<string, WeeklyCoverageRequirement>): WeeklyCoverageAssignment[] {
  const pending = [...ranked], result: WeeklyCoverageAssignment[] = []
  while (pending.length) {
    const index = pending.findIndex(candidate => !pending.some(other => other.id !== candidate.id
      && mustPrecede(requirements.get(other.requirementId)!, requirements.get(candidate.requirementId)!)))
    if (index < 0) throw new Error('Conflicting mandatory session sequencing')
    result.push(pending.splice(index, 1)[0])
  }
  return result
}
export function realizeExecutionPriority(profile: ProgrammingProfile, schedule: WeeklyCoverageSchedule, sessions: CompleteProgrammingSessionPrescription[]) {
  if (!profile.executionPriority) return undefined
  const requirement = focusedRequirement(profile, schedule)
  const days = requirement ? sessions.flatMap(session => {
    const work = session.blocks.filter(b => b.role !== 'specific_preparation')
    const index = work.findIndex(b => b.coverageRequirementIds.includes(requirement.id))
    if (index < 0) return []
    const exactMovement = work[index].exercises.some(e => e.movementId === profile.executionPriority!.movementId)
    const blockers = schedule.requirements.filter(r => mustPrecede(r, requirement) && work.slice(0, index).some(b => b.coverageRequirementIds.includes(r.id)))
    if (index > 0 && !blockers.length) throw new Error('Compiled priority lost its position without a mandatory blocker')
    if (index === 0 && (work[0].role !== 'priority_adaptation' || work[0].exercises.some(e => e.role !== 'priority_adaptation')
      || !session.title.startsWith(requirement.targetLabel) || session.blocks[0].role !== 'specific_preparation'
      || session.blocks[0].exercises[0]?.movementId !== work[0].exercises[0]?.movementId)) throw new Error('Priority preparation or role mismatch')
    return [{ day: session.day, status: !exactMovement ? 'unavailable' as const : index === 0 ? 'achieved' as const : 'blocked' as const,
      assignmentIds: schedule.assignments.filter(a => a.day === session.day && a.requirementId === requirement.id).map(a => a.id),
      blockingRequirementIds: blockers.map(r => r.id), movementIds: work[index].exercises.map(e => e.movementId),
      workOrder: work.map(b => ({ requirementIds: [...b.coverageRequirementIds], role: b.role })) }]
  }) : []
  const expectedDays = requirement ? [...new Set(schedule.assignments.filter(a => a.requirementId === requirement.id).map(a => a.day))].sort() : []
  if (JSON.stringify(days.map(d => d.day).sort()) !== JSON.stringify(expectedDays)) throw new Error('Priority missing from final sessions')
  return { version: EXECUTION_PRIORITY_VERSION, intent: { ...profile.executionPriority },
    status: !days.length || days.some(d => d.status === 'unavailable') ? 'unavailable' as const
      : days.every(d => d.status === 'achieved') ? 'achieved' as const : 'blocked' as const, days }
}
