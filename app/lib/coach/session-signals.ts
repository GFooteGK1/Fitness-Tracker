import type { CompleteProgrammingExercisePrescription, CompleteProgrammingSessionPrescription } from './programming-schema'

export const SESSION_CAPTURE_POLICY_VERSION = 'session-capture-1'
export interface SessionSignalInput {
  schemaVersion: 1
  exerciseId: string
  ratingScope: 'hardest_set' | 'effort'
  workStatus: 'as_planned' | 'changed' | 'unsure'
  rpe?: number
  rpeScale?: 'effort_0_10' | 'rir_based'
  actualReps?: number
  actualLoad?: number
  actualLoadUnit?: 'lb' | 'kg'
  completedWorkingSets?: number
  actualDurationMinutes?: number
  actualRestSeconds?: number
  stop?: boolean
  note?: string
}
export interface SessionSignalRecord {
  id: string
  prescribedSessionId: string
  signal: SessionSignalInput
  createdAt: string
  policyVersion: string
}

export function resolveSignalExercise(prescription: unknown, exerciseId: string): CompleteProgrammingExercisePrescription | null {
  if (!prescription || typeof prescription !== 'object') return null
  const session = prescription as CompleteProgrammingSessionPrescription
  if (session.format !== 'complete_programming_v0_3' || !Array.isArray(session.blocks)) return null
  for (const block of session.blocks) {
    if (!Array.isArray(block.exercises)) continue
    const exercise = block.exercises.find((_, index) => `${block.id}:${index}` === exerciseId)
    if (exercise) return exercise
  }
  return null
}

export function validateSessionSignal(value: unknown): { ok: true; value: SessionSignalInput } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Feedback must be an object' }
  const input = value as Record<string, unknown>
  const numericBounds = { rpe: 10, actualReps: 1000, actualLoad: 2000, completedWorkingSets: 100,
    actualDurationMinutes: 1440, actualRestSeconds: 3600 }
  const keys = new Set(['schemaVersion', 'exerciseId', 'ratingScope', 'workStatus', 'rpeScale', 'actualLoadUnit', 'stop', 'note', ...Object.keys(numericBounds)])
  if (Object.keys(input).some(key => !keys.has(key))) return { ok: false, error: 'Unsupported exercise feedback field' }
  if (input.schemaVersion !== 1 || typeof input.exerciseId !== 'string' || input.exerciseId.length < 3 || input.exerciseId.length > 200
    || !['hardest_set', 'effort'].includes(String(input.ratingScope))
    || !['as_planned', 'changed', 'unsure'].includes(String(input.workStatus))) return { ok: false, error: 'Choose the exercise and report scope' }
  for (const [key, max] of Object.entries(numericBounds)) {
    const field = input[key]
    if (field !== undefined && (typeof field !== 'number' || !Number.isFinite(field) || field < 0 || field > max)) {
      return { ok: false, error: `Invalid ${key}` }
    }
  }
  if ((input.actualReps !== undefined && !Number.isInteger(input.actualReps))
    || (input.rpeScale !== undefined && input.rpe === undefined)
    || (input.actualLoadUnit !== undefined && input.actualLoad === undefined)
    || (input.completedWorkingSets !== undefined && !Number.isInteger(input.completedWorkingSets))
    || (input.rpe !== undefined && !['effort_0_10', 'rir_based'].includes(String(input.rpeScale)))
    || (input.rpeScale !== undefined && !['effort_0_10', 'rir_based'].includes(String(input.rpeScale)))
    || (input.actualLoad !== undefined && !['lb', 'kg'].includes(String(input.actualLoadUnit)))
    || (input.actualLoadUnit !== undefined && !['lb', 'kg'].includes(String(input.actualLoadUnit)))
    || (input.stop !== undefined && typeof input.stop !== 'boolean')
    || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 500))) return { ok: false, error: 'Invalid exercise feedback' }
  return { ok: true, value: { ...input } as unknown as SessionSignalInput }
}

/** Reports only. No RIR conversion, dose selection, or adaptation policy lives here. */
export function signalRequiresActualWork(signal: SessionSignalInput): boolean {
  return signal.stop === true || signal.workStatus === 'changed' || signal.actualReps !== undefined
    || signal.actualLoad !== undefined || signal.completedWorkingSets !== undefined
    || signal.actualDurationMinutes !== undefined || signal.actualRestSeconds !== undefined
}

export function summarizeSignalWork(records: SessionSignalRecord[], prescription: CompleteProgrammingSessionPrescription): string {
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).filter(item => signalRequiresActualWork(item.signal))
    .map(({ signal }) => {
      const name = resolveSignalExercise(prescription, signal.exerciseId)?.movementName ?? 'Exercise'
      const scope = signal.ratingScope === 'hardest_set' ? 'Hardest set' : 'Reported effort'
      const details = [signal.workStatus === 'changed' ? 'Work changed' : null,
        signal.actualReps !== undefined ? `${scope}: ${signal.actualReps} reps` : null,
        signal.actualLoad !== undefined ? `${scope}: ${signal.actualLoad} ${signal.actualLoadUnit}` : null,
        signal.completedWorkingSets !== undefined ? `${signal.completedWorkingSets} work sets finished` : null,
        signal.actualDurationMinutes !== undefined ? `${signal.actualDurationMinutes} minutes on this exercise` : null,
        signal.actualRestSeconds !== undefined ? `${signal.actualRestSeconds} seconds rest before this effort` : null,
        signal.stop === true ? 'Reached a stop rule' : null, signal.note].filter(Boolean)
      return `${name}: ${details.join('; ')}.`
    }).join('\n')
}
