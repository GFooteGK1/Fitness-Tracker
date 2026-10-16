/** Offline mechanical comparison. No coaching grader, runtime policy or network client. */
import { createHash } from 'node:crypto'
import { MOVEMENT_CATALOG, type MovementDefinition } from '../app/lib/coach/movement-catalog'
import type { CompleteProgrammingSessionPrescription, NumericRange } from '../app/lib/coach/programming-schema'

export interface ReviewedExercise {
  name: string
  sets: number
  repetitions: NumericRange
  sides: 1 | 2
  targetRpe: NumericRange
  restSeconds: NumericRange
  sideChangeSecondsPerRound: number
  controlPriority: boolean
  load: null
  actualRpe: null
}

export interface ReviewedWeek {
  schemaVersion: 1
  id: string
  source: {
    path: string; sha256: string; baselineCaseId: string; inputHash: string
    reviewKind: 'qualitative_acceptance'; reviewer: string; responses: string[]
    rubricScores: null; runtimeAuthority: false
  }
  secondsPerRepForAccounting: number
  sessions: Array<{
    day: string; availableMinutes: number; preparationMinutes: number
    preparationRpe: NumericRange; transitionMinutes: number; loggingMinutes: number
    exercises: ReviewedExercise[]
  }>
}

const hash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Intentionally strict for this versioned reference's Markdown table, not a generic importer. */
export function verifyReviewedWeek(reference: ReviewedWeek, sourceText: string) {
  check(reference.schemaVersion === 1 && reference.id === 'reviewed-hypertrophy-week-1', 'Unknown reference')
  check(hash(sourceText) === reference.source.sha256, 'Reviewed source changed')
  check(reference.source.reviewKind === 'qualitative_acceptance'
    && reference.source.reviewer === 'Greg Foote'
    && reference.source.responses.length === 2
    && reference.source.responses.every(response => sourceText.includes(response)), 'Missing review source')
  check(reference.source.rubricScores === null && reference.source.runtimeAuthority === false, 'Review authority drift')
  check(same(reference.sessions.map(session => session.day), ['monday', 'tuesday', 'wednesday']), 'Reviewed days changed')
  const rows = sourceText.split(/\r?\n/).filter(line => line.startsWith('|') && /\d+ × \d+/.test(line))
  const actual = reference.sessions.flatMap(session => session.exercises)
  check(rows.length === 15 && actual.length === rows.length, 'Reviewed exercise count changed')
  let day = ''
  rows.forEach((row, index) => {
    const cells = row.split('|').map(cell => cell.trim())
    if (cells[1]) day = cells[1].split(' ')[0].toLowerCase()
    const dose = cells[3].match(/^(\d+) × (\d+)(?:–(\d+))?( per side)?$/)
    const effort = cells[4].match(/^(\d+)–(\d+)/)
    check(dose && effort, 'Unrecognized reviewed dose or effort')
    const rest = cells[5].startsWith('2–3') ? { min: 120, max: 180 }
      : cells[5].startsWith('90–120') ? { min: 90, max: 120 }
        : cells[5].startsWith('90 seconds after both sides') ? { min: 90, max: 90 } : null
    check(rest, 'Unrecognized reviewed rest')
    const expected: ReviewedExercise = {
      name: cells[2], sets: Number(dose[1]),
      repetitions: { min: Number(dose[2]), max: Number(dose[3] || dose[2]) },
      sides: dose[4] ? 2 : 1, targetRpe: { min: Number(effort[1]), max: Number(effort[2]) },
      restSeconds: rest, sideChangeSecondsPerRound: dose[4] ? 15 : 0,
      controlPriority: cells[4].includes('control'), load: null, actualRpe: null,
    }
    const session = reference.sessions.find(candidate => candidate.day === day)
    check(session?.exercises.includes(actual[index]), `Reviewed day changed: ${cells[2]}`)
    check(same(actual[index], expected), `Reviewed prescription changed: ${cells[2]}`)
  })
  check(reference.secondsPerRepForAccounting === 3, 'Timing assumption changed')
  return reference.sessions.map(session => {
    check(session.availableMinutes === 60 && session.preparationMinutes === 13
      && session.transitionMinutes === 8 && session.loggingMinutes === 3
      && same(session.preparationRpe, { min: 3, max: 4 }), 'Session assumptions changed')
    const workSeconds = session.exercises.reduce((sum, exercise) => sum
      + exercise.sets * exercise.repetitions.max * exercise.sides * reference.secondsPerRepForAccounting
      + (exercise.sets - 1) * exercise.restSeconds.max
      + exercise.sets * exercise.sideChangeSecondsPerRound, 0)
    const estimatedSeconds = workSeconds + 60 * (session.preparationMinutes + session.transitionMinutes + session.loggingMinutes)
    check(estimatedSeconds <= session.availableMinutes * 60, 'Reviewed session exceeds availability')
    return { day: session.day, workingSetsOrRounds: session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
      estimatedSeconds, marginSeconds: session.availableMinutes * 60 - estimatedSeconds }
  })
}

export function compareReviewedWeek(
  reference: ReviewedWeek, sourceText: string,
  current: { id: string; inputHash: string; plan: { sessions: CompleteProgrammingSessionPrescription[] } | null; error: string | null },
  catalog: readonly MovementDefinition[] = MOVEMENT_CATALOG,
) {
  const referenceTiming = verifyReviewedWeek(reference, sourceText)
  check(current.id === reference.source.baselineCaseId && current.inputHash === reference.source.inputHash, 'Case input changed')
  const exercises = reference.sessions.flatMap(session => session.exercises)
  const catalogGaps = exercises.flatMap(exercise => {
    const exact = catalog.find(movement => movement.name === exercise.name)
    return exact?.programmingStatus === 'active' ? [] : [{ name: exercise.name, reason: exact ? 'not_active' : 'no_exact_entry' }]
  })
  const all = current.plan?.sessions.flatMap(session => session.blocks.flatMap(block => block.exercises.map(exercise => ({ day: session.day, exercise })))) ?? []
  const work = all.filter(row => row.exercise.role !== 'specific_preparation' && row.exercise.role !== 'downshift')
  const expected = reference.sessions.flatMap(session => session.exercises.map(exercise => ({ day: session.day, exercise })))
  const missingNamedPrescriptions = expected.filter(row => !work.some(actual => actual.day === row.day && actual.exercise.movementName === row.exercise.name))
    .map(row => ({ day: row.day, name: row.exercise.name }))
  const otherPrescriptions = work.filter(row => !expected.some(item => item.day === row.day && item.exercise.name === row.exercise.movementName))
    .map(row => ({ day: row.day, name: row.exercise.movementName }))
  const prescriptionDifferences = expected.flatMap(row => {
    const matching = work.filter(actual => actual.day === row.day && actual.exercise.movementName === row.exercise.name)
    if (matching.length === 0) return [] // Already reported as a named-prescription difference.
    const fields: string[] = []
    if (matching.length !== 1) fields.push('duplicate_prescription')
    const actual = matching[0].exercise
    const target = row.exercise
    if (actual.dose.kind !== 'sets_reps' || actual.dose.sets.min !== target.sets || actual.dose.sets.max !== target.sets
      || !same(actual.dose.repetitions, target.repetitions)) fields.push('sets_or_repetitions')
    if (actual.executionTarget.kind !== 'rpe' || !same(actual.executionTarget.range, target.targetRpe)) fields.push('explicit_rpe_target')
    if (!same(actual.restSeconds, target.restSeconds)) fields.push('rest')
    if (actual.loadAnchor) fields.push('load_not_in_reviewed_reference')
    if (target.sides === 2) fields.push('per_side_count_not_structured_in_current_contract')
    return fields.length ? [{ day: row.day, name: target.name, fields }] : []
  })
  return {
    purpose: 'Mechanical development comparison, not a coaching-quality score or runtime approval',
    referenceId: reference.id, referenceSourceHash: reference.source.sha256, referenceTiming,
    currentStatus: current.plan ? 'compiled' : 'blocked', compilerError: current.error,
    currentWorkingExercises: work.length,
    currentWorkingRpeTargets: work.filter(row => row.exercise.executionTarget.kind === 'rpe').length,
    missingWorkingRpeTargets: work.filter(row => row.exercise.executionTarget.kind !== 'rpe')
      .map(row => ({ day: row.day, name: row.exercise.movementName, suppliedTargetKind: row.exercise.executionTarget.kind })),
    missingPreparationRpeTargets: all.filter(row => row.exercise.role === 'specific_preparation' && row.exercise.executionTarget.kind !== 'rpe')
      .map(row => ({ day: row.day, name: row.exercise.movementName })),
    catalogGaps, missingNamedPrescriptions, otherPrescriptions, prescriptionDifferences,
    equipmentConfirmation: 'Named stations remain unconfirmed; generic full-gym categories are not station-level evidence',
    qualityScores: null, runtimeAuthority: false,
    limitations: [
      'Alternative exercises or splits can be appropriate; nominal differences require review, not automatic rejection',
      'No inferred RPE from RIR or actual effort from a target; no load imputation',
      'Reference timing is arithmetic, not observed duration; current compiler timing is not qualified by it',
      'Detailed preparation repetitions, stop rules and follow-up remain in the bound source document',
      'No persisted-program, model-output, physiological-outcome or holdout evidence is supplied',
    ],
  }
}
