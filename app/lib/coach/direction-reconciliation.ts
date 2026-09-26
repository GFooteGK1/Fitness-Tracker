import { validateCompleteCoachPlanningInput, type CompleteCoachPlanningInput } from './complete-intake'
import { validatePlanningIntentSnapshot, type PlanningIntentSnapshot } from './planning-intent'
import type { RollingWeeklyPlanDraft } from './rolling-weekly-plan'
import type { CoachProgramDomainId } from './types'

export const DIRECTION_MEMORY_KEYS = ['primary_goal', 'training_schedule', 'available_equipment', 'training_constraints', 'training_intent'] as const
export type DirectionMemoryKey = typeof DIRECTION_MEMORY_KEYS[number]
export interface DirectionMemoryRow {
  id: string; user_id: string; memory_key: DirectionMemoryKey; kind: string; version: number
  status: string; content: unknown; effective_from: string | null; effective_until: string | null; review_after: string | null
}
export interface DirectionReconciliation {
  status: 'unchanged' | 'changed' | 'confirmation_required' | 'unsupported' | 'unavailable'
  reasons: string[]
  changedFields: string[]
  /** A form draft only. A new athlete acknowledgement is always required. */
  replacementPlanningInput?: CompleteCoachPlanningInput
  goalTargetDate?: string | null
  currentIntent?: PlanningIntentSnapshot
}

const KIND: Record<DirectionMemoryKey, string> = { primary_goal: 'goal', training_schedule: 'schedule', available_equipment: 'equipment', training_constraints: 'constraint', training_intent: 'goal' }
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const stable = (v: unknown): string => JSON.stringify(v, (_key, value) => record(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
const sorted = (v: readonly string[]) => [...v].sort()

/** Latest owned rows, including withdrawn rows, are supplied by the server. Never modifies the accepted week. */
export function reconcileTrainingDirection(input: {
  userId: string; acceptedWeek: RollingWeeklyPlanDraft; nextWindowStart: string
  memories: Partial<Record<DirectionMemoryKey, DirectionMemoryRow | null>>
  intentRequired: boolean; asOf: string
}): DirectionReconciliation {
  const { acceptedWeek: week } = input
  const profile = week.profileSnapshot
  const reasons: string[] = [], changedFields: string[] = []
  let status: DirectionReconciliation['status'] = 'unchanged'
  const block = (reason: string) => { status = 'confirmation_required'; reasons.push(reason) }
  const change = (field: string, reason: string) => { changedFields.push(field); reasons.push(reason) }
  const base = acceptedInput(week, input.nextWindowStart)
  let draft = { ...base }
  let savedAllocations: CompleteCoachPlanningInput | undefined
  const now = Date.parse(input.asOf)
  if (!input.userId || !Number.isFinite(now)) return unavailableDirectionReconciliation()
  const validRows: Partial<Record<DirectionMemoryKey, Record<string, unknown>>> = {}
  for (const key of DIRECTION_MEMORY_KEYS) {
    if (key === 'training_intent' && !input.intentRequired && !profile.trainingIntent) continue
    const row = input.memories[key]
    // Absent setup keeps the already accepted binding; it never confirms a new form.
    if (!row) continue
    if (row.user_id !== input.userId || row.memory_key !== key) return unavailableDirectionReconciliation()
    if (row.kind !== KIND[key] || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.id !== 'string' || !row.id) {
      block(`Saved ${key} needs correction before changing direction`); continue
    }
    const effective = validTime(row.effective_from, now, 'from') && validTime(row.effective_until, now, 'until') && validTime(row.review_after, now, 'until')
    if (row.status !== 'confirmed' || !effective) { block(`Current ${key} needs confirmation`); continue }
    if (!record(row.content)) { block(`Saved ${key} is malformed`); continue }
    validRows[key] = row.content
  }
  const setupFields: Array<[DirectionMemoryKey, string[]]> = [
    ['training_schedule', ['experience', 'trainingDays', 'sessionMinutes']],
    ['available_equipment', ['equipment', 'resolvedEquipmentIds']],
    ['training_constraints', ['constraints', 'constraintKinds']],
    ['primary_goal', ['primaryDomain', 'goal', 'secondaryGoals']]
  ]
  for (const [key, fields] of setupFields) {
    const content = validRows[key]
    if (!content) continue
    if (fields.some(field => !Object.hasOwn(content, field)) || (key === 'training_constraints' && typeof content.constraints !== 'string')) {
      block(`Saved ${key} is incomplete`); continue
    }
    const proposed = { ...draft, ...Object.fromEntries(fields.map(field => [field, content[field]])) }
    const validation = validateCompleteCoachPlanningInput({ ...proposed, setupConfirmed: true })
    if (!validation.ok) { block(`Saved ${key} needs correction before planning`); continue }
    if (key === 'primary_goal' && (input.intentRequired || profile.trainingIntent)) {
      // This convenience memory may express allocation choices, never overwrite canonical outcomes.
      savedAllocations = validation.value
      continue
    }
    draft = { ...validation.value, setupConfirmed: false }
    if (stable(setupMeaning(key, draft)) !== stable(setupMeaning(key, base))) {
      change(key, `Confirmed ${key} differs from the accepted direction`)
      if (key === 'training_constraints' && draft.constraints.trim() && draft.constraints.trim() !== base.constraints.trim()) {
        block('The changed free-text constraint needs review; only selected constraint kinds are enforced by the compiler')
      }
    }
  }
  let currentIntent: PlanningIntentSnapshot | undefined
  let goalTargetDate = week.directionSnapshot.goalTargetDate
  if (input.intentRequired || profile.trainingIntent) {
    const row = input.memories.training_intent
    const snapshot = row && validRows.training_intent ? { schemaVersion: 1, memoryId: row.id, memoryVersion: row.version, content: row.content } : null
    if (!validatePlanningIntentSnapshot(snapshot)) block('Confirm valid current outcomes before planning')
    else {
      currentIntent = structuredClone(snapshot)
      const active = snapshot.content.outcomes.filter(outcome => outcome.goal.status === 'active')
      const domains = [...new Set(active.map(outcome => outcome.domain))].filter((domain): domain is CoachProgramDomainId => domain !== null)
      if (active.some(outcome => outcome.capability.status === 'unsupported' || outcome.domain === null) || domains.length > 3) {
        return { status: 'unsupported', reasons: [...reasons, 'The current compiler cannot represent every active confirmed outcome'], changedFields: ['training_intent'], currentIntent }
      }
      if (!active.length) block('Confirm at least one active outcome before planning')
      else {
        const priority = snapshot.content.priorityOrder?.map(id => active.find(outcome => outcome.goal.id === id)).find(Boolean)?.domain
        const preferredPrimary = savedAllocations?.primaryDomain ?? draft.primaryDomain
        const primary = priority ?? (domains.includes(preferredPrimary) ? preferredPrimary : domains.includes(draft.primaryDomain) ? draft.primaryDomain : domains[0])!
        const statement = (domain: typeof primary) => active.filter(outcome => outcome.domain === domain).map(outcome => outcome.goal.statement).join('; ').slice(0, 500)
        draft = { ...draft, primaryDomain: primary!, goal: statement(primary), secondaryGoals: domains.filter(domain => domain !== primary).map(domain => ({
          domain, allocation: savedAllocations?.secondaryGoals.find(goal => goal.domain === domain)?.allocation
            ?? draft.secondaryGoals.find(goal => goal.domain === domain)?.allocation ?? 'development', athleteIntent: statement(domain).slice(0, 300)
        })) }
        if (stable(allocationMeaning(draft)) !== stable(allocationMeaning(base))) change('goal_allocations', 'Confirmed training area allocations differ from the accepted direction')
        if (stable(snapshot) !== stable(profile.trainingIntent)) change('training_intent', 'Confirmed outcomes or their confirmation version changed')
        // A removed event deliberately clears its date instead of retaining the accepted event deadline.
        if (snapshot.content.event || profile.trainingIntent?.content.event) goalTargetDate = snapshot.content.event?.date ?? null
        if (goalTargetDate !== week.directionSnapshot.goalTargetDate) change('event', 'The confirmed event date differs from the accepted direction')
      }
    }
  }
  if (status === 'unchanged' && changedFields.length) status = 'changed'
  const validated = validateCompleteCoachPlanningInput({ ...draft, setupConfirmed: true })
  if (!validated.ok && status === 'changed') block('The current setup needs a complete replacement form')
  return { status, reasons, changedFields: [...new Set(changedFields)], goalTargetDate,
    ...(currentIntent ? { currentIntent } : {}),
    ...(validated.ok ? { replacementPlanningInput: { ...validated.value, setupConfirmed: false } } : {}) }
}

export function unavailableDirectionReconciliation(): DirectionReconciliation {
  return { status: 'unavailable', reasons: ['Current confirmed planning setup is unavailable'], changedFields: [] }
}

/** Prevent stale replacement forms from overwriting the current confirmed setup. This does not grant acceptance authority. */
export function replacementSetupMatches(input: CompleteCoachPlanningInput, reconciliation: DirectionReconciliation): boolean {
  if (!['unchanged', 'changed'].includes(reconciliation.status) || !reconciliation.replacementPlanningInput) return false
  const expected = reconciliation.replacementPlanningInput
  const validated = validateCompleteCoachPlanningInput({ ...input, setupConfirmed: true })
  if (!validated.ok) return false
  return (['training_schedule', 'available_equipment', 'training_constraints', 'primary_goal'] as const)
    .every(key => stable(setupMeaning(key, validated.value)) === stable(setupMeaning(key, expected)))
}

function validTime(value: string | null, now: number, type: 'from' | 'until'): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return Number.isFinite(time) && (type === 'from' ? time <= now : time > now)
}

function acceptedInput(week: RollingWeeklyPlanDraft, nextWindowStart: string): CompleteCoachPlanningInput {
  const profile = week.profileSnapshot
  return { format: 'complete_programming_intake_v0_3', setupConfirmed: false,
    primaryDomain: profile.primaryGoal.domain, goal: profile.primaryGoal.athleteIntent,
    secondaryGoals: profile.secondaryGoals.map(goal => ({ domain: goal.domain, allocation: goal.allocation, athleteIntent: goal.athleteIntent })),
    experience: profile.trainingExperience, trainingDays: profile.sessionAvailability.map(slot => slot.day),
    // A nonuniform accepted schedule cannot be silently flattened into a confirmed setup.
    sessionMinutes: (new Set(profile.sessionAvailability.map(slot => slot.minutes)).size === 1 ? profile.sessionAvailability[0]?.minutes : 0) as CompleteCoachPlanningInput['sessionMinutes'],
    equipment: profile.equipment.unresolvedAthleteDescription ?? profile.equipment.resolvedIds.join(', '),
    resolvedEquipmentIds: [...profile.equipment.resolvedIds] as CompleteCoachPlanningInput['resolvedEquipmentIds'],
    constraints: profile.unresolvedConstraintNote ?? '', constraintKinds: profile.explicitConstraints.map(constraint => constraint.kind),
    startDate: nextWindowStart, ...(profile.exercisePreferences ? { exercisePreferences: structuredClone(profile.exercisePreferences) } : {}) }
}

function setupMeaning(key: DirectionMemoryKey, value: CompleteCoachPlanningInput): unknown {
  if (key === 'training_schedule') return [value.experience, sorted(value.trainingDays), value.sessionMinutes]
  if (key === 'available_equipment') return [value.equipment.trim(), sorted(value.resolvedEquipmentIds)]
  if (key === 'training_constraints') return [value.constraints.trim(), sorted(value.constraintKinds)]
  return [value.primaryDomain, value.goal.trim(), value.secondaryGoals.map(goal => ({ ...goal, athleteIntent: goal.athleteIntent.trim() })).sort((a, b) => a.domain.localeCompare(b.domain))]
}

function allocationMeaning(value: CompleteCoachPlanningInput): unknown {
  return [value.primaryDomain, value.secondaryGoals.map(goal => ({ domain: goal.domain, allocation: goal.allocation })).sort((a, b) => a.domain.localeCompare(b.domain))]
}

/** Stored review metadata is untrusted. This bounded browser projection excludes full intent and authority claims. */
export function decodeDirectionReconciliation(value: unknown): DirectionReconciliation | null {
  if (!record(value) || !['unchanged', 'changed', 'confirmation_required', 'unsupported', 'unavailable'].includes(String(value.status))
    || !Array.isArray(value.reasons) || value.reasons.length > 20 || value.reasons.some(reason => typeof reason !== 'string' || reason.length > 500)
    || !Array.isArray(value.changedFields) || value.changedFields.length > 20 || value.changedFields.some(field => typeof field !== 'string' || field.length > 80)) return null
  const result: DirectionReconciliation = { status: value.status as DirectionReconciliation['status'], reasons: [...value.reasons] as string[], changedFields: [...value.changedFields] as string[] }
  if (value.goalTargetDate !== undefined) {
    if (value.goalTargetDate !== null && (typeof value.goalTargetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.goalTargetDate)
      || !Number.isFinite(Date.parse(`${value.goalTargetDate}T00:00:00Z`)) || !new Date(`${value.goalTargetDate}T00:00:00Z`).toISOString().startsWith(value.goalTargetDate))) return null
    result.goalTargetDate = value.goalTargetDate as string | null
  }
  if (value.replacementPlanningInput !== undefined) {
    if (!record(value.replacementPlanningInput)) return null
    const validation = validateCompleteCoachPlanningInput({ ...value.replacementPlanningInput, setupConfirmed: true })
    if (!validation.ok) return null
    result.replacementPlanningInput = { ...validation.value, setupConfirmed: false }
  }
  return result
}
