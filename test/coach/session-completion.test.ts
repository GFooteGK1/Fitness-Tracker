import { describe, expect, it } from 'vitest'
import {
  ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
  validateAtomicSessionCompletionInput
} from '@/app/lib/coach/session-completion'

const occurredAt = '2026-09-01T15:00:00.000Z'

function feedback(outcome: 'as_planned' | 'modified' | 'stopped_early' | 'skipped') {
  return {
    outcome,
    sessionRpe: outcome === 'skipped' ? null : 7.5,
    energy: 'okay',
    pain: 'none',
    note: null,
    occurredAt
  }
}

function strengthObservation() {
  return {
    clientId: 'trap-bar-capacity-set-1',
    kind: 'strength_set',
    semanticRole: 'training_signal',
    observedAt: '2026-09-01T14:45:00.000Z',
    assessmentDefinition: { id: 'strength.repetition_capacity', version: '1.0.0' },
    protocol: { id: 'strength-repetition-capacity-standard', version: '1.0.0' },
    metric: { metricId: 'strength.repetitions', value: 8, unit: 'repetitions' },
    sourceDeviceId: null,
    comparison: {
      movementId: 'trap_bar_deadlift',
      variationId: 'high_handle',
      repetitions: null,
      externalLoad: { value: 315, unit: 'lb' },
      distance: null,
      duration: { value: 45, unit: 's' },
      equipmentIds: ['trap_bar'],
      techniqueModifiers: ['continuous_repetitions'],
      environmentModifiers: []
    },
    metadata: { setNumber: 1 }
  }
}

describe('atomic coach session completion contract', () => {
  it('accepts explicit as-prescribed confirmation without copied client blocks', () => {
    const result = validateAtomicSessionCompletionInput({
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      feedback: feedback('as_planned'),
      performedWork: {
        mode: 'as_prescribed',
        workoutDate: '2026-09-01',
        inputText: null,
        blocks: null,
        totalDurationMinutes: 55
      },
      observations: []
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        status: 'completed',
        performedWork: expect.objectContaining({ mode: 'as_prescribed', blocks: null })
      })
    }))
  })

  it('accepts modified actual work and builds a protocol comparability key', () => {
    const result = validateAtomicSessionCompletionInput({
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      feedback: feedback('modified'),
      performedWork: {
        mode: 'modified',
        workoutDate: '2026-09-01',
        inputText: 'Reduced the final two sets from eight reps to six reps.',
        blocks: [{ label: 'Primary strength', actualSets: [8, 8, 6, 6] }],
        totalDurationMinutes: 48
      },
      observations: [strengthObservation()]
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        observations: [expect.objectContaining({
          clientId: 'trap-bar-capacity-set-1',
          assessmentCatalogVersion: '0.2.0',
          comparabilityKey: expect.stringContaining('comparison-v1')
        })]
      })
    }))
  })

  it('does not let an as-prescribed result replace the accepted blocks', () => {
    const result = validateAtomicSessionCompletionInput({
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      feedback: feedback('as_planned'),
      performedWork: {
        mode: 'as_prescribed',
        workoutDate: '2026-09-01',
        inputText: 'Reinterpreted plan',
        blocks: [{ replacement: true }],
        totalDurationMinutes: null
      },
      observations: []
    })

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'As-prescribed completion must not submit replacement blocks',
        'As-prescribed completion must not reinterpret the workout summary'
      ])
    })
  })

  it('keeps skipped sessions free of performed work and observations', () => {
    expect(validateAtomicSessionCompletionInput({
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      feedback: feedback('skipped'),
      performedWork: null,
      observations: []
    })).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({ status: 'skipped', performedWork: null })
    }))
  })

  it('rejects duplicated session RPE and observations captured after completion', () => {
    const observation = {
      ...strengthObservation(),
      observedAt: '2026-09-01T15:01:00.000Z',
      assessmentDefinition: { id: 'session.rpe', version: '1.0.0' },
      protocol: { id: 'session-rpe-ten-point', version: '1.0.0' },
      kind: 'session_outcome',
      semanticRole: 'training_signal',
      metric: { metricId: 'session.rpe', value: 7.5, unit: 'score' },
      comparison: {
      movementId: null,
      variationId: null,
      repetitions: null,
      externalLoad: null,
      distance: null,
      duration: null,
      equipmentIds: [],
      techniqueModifiers: [],
      environmentModifiers: []
    }
    }

    const result = validateAtomicSessionCompletionInput({
      contractVersion: ATOMIC_SESSION_RESULT_CONTRACT_VERSION,
      feedback: feedback('modified'),
      performedWork: {
        mode: 'modified',
        workoutDate: '2026-09-01',
        inputText: 'Recorded actual work.',
        blocks: [],
        totalDurationMinutes: null
      },
      observations: [observation]
    })

    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        expect.stringContaining('no later than session completion'),
        expect.stringContaining('Session RPE comes from the session check-in')
      ])
    })
  })
})
