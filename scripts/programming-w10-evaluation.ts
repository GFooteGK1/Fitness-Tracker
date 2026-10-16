/** Offline W10 development adapter. No model, persistence or activation authority. */
import { createHash } from 'node:crypto'
import { buildReviewedRollingWeeklyPlan } from '../app/lib/coach/rolling-weekly-plan'
import { parseReviewedRollingWeek } from '../app/lib/coach/reviewed-week-plan-contract'
import { reviewedSessionTimeBudget } from '../app/lib/coach/reviewed-session-contract'
import { qualityDimensions } from './programming-quality-adjudication'

type CompilerInput = Parameters<typeof buildReviewedRollingWeeklyPlan>[0]
type Registry = Parameters<typeof buildReviewedRollingWeeklyPlan>[1]
export interface W10Case {
  id: string
  family: string
  origin: 'exposed_development'
  changedVariable: string | null
  expected: 'reviewed_candidate' | 'review_required'
  input: CompilerInput
  registry: Registry
}
export interface W10Suite {
  schemaVersion: 1
  purpose: 'development_harness_verification'
  cases: W10Case[]
}
export const w10Hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const equal = (left: unknown, right: unknown) => w10Hash(left) === w10Hash(right)

/** Fail closed on cohort/identity drift; never recategorize an observed failure. */
export function validateW10Suite(suite: W10Suite): void {
  if (suite.schemaVersion !== 1 || suite.purpose !== 'development_harness_verification'
    || !Array.isArray(suite.cases) || suite.cases.length < 2) throw new Error('Invalid W10 development suite')
  const ids = new Set<string>()
  for (const row of suite.cases) {
    if (!row.id?.trim() || ids.has(row.id) || !row.family?.trim()
      || row.origin !== 'exposed_development'
      || !['reviewed_candidate', 'review_required'].includes(row.expected)
      || !(row.changedVariable === null || (typeof row.changedVariable === 'string' && row.changedVariable.trim()))
      || !row.input || !Array.isArray(row.registry)) throw new Error(`Invalid W10 case: ${row.id}`)
    ids.add(row.id)
  }
  if (!suite.cases.some(row => row.expected === 'reviewed_candidate')
    || !suite.cases.some(row => row.expected === 'review_required')) throw new Error('Both positive and abstention cases are required')
}

/** Check whole content and bindings, not just the fact that compilation returned. */
function inspectCandidate(row: W10Case, result: ReturnType<typeof buildReviewedRollingWeeklyPlan>): string[] {
  if (result.kind !== 'reviewed_candidate') return []
  const violations: string[] = []
  if (result.persistable !== false || result.numericRuntimeEligible !== false) violations.push('authority_flags')
  const plan = result.plan
  if (!parseReviewedRollingWeek(JSON.parse(JSON.stringify(plan)))) violations.push('lossless_read_contract')
  if (!equal(plan.profileSnapshot, row.input.context.profile) || !equal(plan.directionSnapshot, row.input.direction)) violations.push('context_snapshot')
  const registrations = row.registry.filter(item => item.recipe.id === row.input.context.recipeId)
  if (registrations.length !== 1) return [...violations, 'registry_identity']
  const registration = registrations[0], recipe = registration.recipe
  const schedule = recipe.schedules.find(item => item.id === row.input.context.scheduleId)
  if (!schedule) return [...violations, 'schedule_identity']
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  if (plan.sequenceNumber !== row.input.sequenceNumber || plan.windowStart !== row.input.windowStart
    || Date.parse(`${plan.windowEnd}T00:00:00Z`) - Date.parse(`${row.input.windowStart}T00:00:00Z`) !== 6 * 86400000) violations.push('requested_week')
  if (!equal(plan.basis, { recipeId: recipe.id, recipeHash: registration.contentHash,
    contextHash: recipe.contextHash, scheduleId: schedule.id, reason: schedule.reason })) violations.push('week_basis')
  if (!days.every(day => plan.baseSchedule[day] === recipe.baseSchedule[day])) violations.push('base_schedule')
  if (!equal(plan.instructions, recipe.instructions)) violations.push('week_instructions')
  if (!recipe.limitations.every(limit => plan.limitations.includes(limit))) violations.push('reviewed_limitations')
  // Verify every pair's signed calendar separation against each complete schedule.
  const position = (calendar: typeof recipe.baseSchedule, id: string) => days.findIndex(day => calendar[day] === id)
  if (plan.spacing.length !== recipe.sessions.length * (recipe.sessions.length - 1) / 2
    || plan.spacing.some(pair => !recipe.sessions.some(session => session.id === pair.from)
      || !recipe.sessions.some(session => session.id === pair.to)
      || pair.baseDays !== position(recipe.baseSchedule, pair.to) - position(recipe.baseSchedule, pair.from)
      || pair.selectedDays !== position(schedule.days, pair.to) - position(schedule.days, pair.from))) violations.push('calendar_spacing')
  const scheduled = days.filter(day => schedule.days[day] !== null)
  if (plan.scheduledSessions.length !== scheduled.length) violations.push('session_count')
  scheduled.forEach((day, index) => {
    const actual = plan.scheduledSessions[index]
    const expected = recipe.sessions.find(session => session.id === schedule.days[day])
    if (!actual || !expected || !equal(actual.prescription.content, expected)) violations.push(`prescription_content:${day}`)
    if (!actual) return
    if (actual.prescription.day !== day
      || Date.parse(`${actual.scheduledDate}T00:00:00Z`) - Date.parse(`${row.input.windowStart}T00:00:00Z`) !== days.indexOf(day) * 86400000) violations.push(`scheduled_date:${day}`)
    if (!equal(actual.prescription.protocols, recipe.protocols.filter(protocol => protocol.sessionId === expected?.id))) violations.push(`monitoring_protocols:${day}`)
    const source = actual.prescription.source
    if (source.recipeId !== recipe.id || source.recipeHash !== registration.contentHash
      || !equal(source.review, recipe.review) || !equal(source.sources, recipe.sources)) violations.push(`source_binding:${day}`)
    const available = row.input.context.profile.sessionAvailability.find(slot => slot.day === day)
    const budget = reviewedSessionTimeBudget(actual.prescription.content)
    if (!available || budget.requiredSeconds > available.minutes * 60
      || actual.prescription.estimatedSeconds !== budget.requiredSeconds + budget.optionalSeconds
      || actual.prescription.scheduledMinutes !== available.minutes) violations.push(`estimated_time_budget:${day}`)
  })
  return violations
}

/** Each exception is retained as a failed case. The runner never retries or edits it. */
export function runW10DevelopmentSuite(suite: W10Suite) {
  validateW10Suite(suite)
  const cases = suite.cases.map(row => {
    const before = w10Hash(row)
    let result: ReturnType<typeof buildReviewedRollingWeeklyPlan> | null = null
    let error: string | null = null
    let violations: string[] = []
    // Clone separates cases while still detecting mutation by the actual entry point.
    const execution = structuredClone(row)
    try {
      result = buildReviewedRollingWeeklyPlan(execution.input, execution.registry)
      if (result.kind !== row.expected) violations.push('unexpected_disposition')
      violations.push(...inspectCandidate(row, result))
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); violations.push('compiler_exception') }
    if (w10Hash(execution) !== before) violations.push('input_mutation')
    violations = [...new Set(violations)]
    const output = { result, error }
    return { caseId: row.id, family: row.family, origin: row.origin, changedVariable: row.changedVariable,
      expected: row.expected, inputHash: before, input: structuredClone(row), outputHash: w10Hash(output), output,
      mechanicalStatus: violations.length ? 'failed' as const : 'passed' as const, violations,
      // Qualitative reference acceptance is not a six-dimension evaluation score.
      review: { status: 'unreviewed' as const, reviewer: null, source: null,
        scores: Object.fromEntries(qualityDimensions.map(dimension => [dimension, null])),
        rationale: null, disagreements: [] },
    }
  })
  const failures = cases.filter(row => row.mechanicalStatus === 'failed').map(row => row.caseId)
  const compiled = cases.filter(row => row.output.result?.kind === 'reviewed_candidate').length
  return { schemaVersion: 1, suiteHash: w10Hash(suite), purpose: suite.purpose,
    systemEntryPoint: 'buildReviewedRollingWeeklyPlan', cases,
    summary: { total: cases.length, compiled, abstained: cases.filter(row => row.output.result?.kind === 'review_required').length,
      exceptions: cases.filter(row => row.output.error !== null).length, failed: failures.length, failures,
      mechanicalStatus: failures.length ? 'failed' : 'passed',
      coachingQuality: 'unvalidated', reviewedUnderRubric: 0, unseenCases: 0, qualifiedUsableWeeks: 0,
      numericalActivationAuthorized: false, w10Complete: false },
    limitations: [
      'Development references and their counterfactuals are already exposed; these are not holdouts.',
      'Exact reviewed registration is required. This does not evaluate generalized autonomous dose selection.',
      'Time is an estimate; conditional recovery remains conditional, not an observed duration or rest cap.',
      'Pure compilation does not verify server ownership, database persistence, model choice or physiological outcomes.',
      'Human scores and counterfactual coaching judgments remain separate from deterministic checks.',
    ],
  }
}
