import { fc, test } from '@fast-check/vitest'
import { expect } from 'vitest'
import {
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  areObservationsComparable,
  buildObservationComparabilityKey,
  type PerformanceObservation
} from '@/app/lib/coach/adaptive-programming-contracts'

function observation({
  id,
  loadValue,
  loadUnit,
  equipmentIds = ['trap_bar'],
  techniqueModifiers = ['continuous_repetitions'],
  protocolVersion = '1.0.0'
}: {
  id: string
  loadValue: number
  loadUnit: 'kg' | 'lb'
  equipmentIds?: string[]
  techniqueModifiers?: string[]
  protocolVersion?: string
}): PerformanceObservation {
  return {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id,
    kind: 'strength_set',
    semanticRole: 'direct_outcome',
    status: 'complete',
    metric: { metricId: 'strength.repetitions', value: 8, unit: 'repetitions' },
    observedAt: '2026-08-31T15:00:00.000Z',
    capturedAt: '2026-08-31T15:01:00.000Z',
    assessmentDefinition: { id: 'strength.repetition_capacity', version: '1.0.0' },
    protocol: { id: 'strength-repetition-capacity-standard', version: protocolVersion },
    source: {
      kind: 'manual',
      system: 'sociusfit',
      recordId: id,
      fingerprint: `fingerprint:${id}`,
      deviceId: null
    },
    comparison: {
      movementId: 'trap_bar_deadlift',
      variationId: 'high_handle',
      repetitions: null,
      externalLoad: { value: loadValue, unit: loadUnit },
      distance: null,
      duration: { value: 60, unit: 's' },
      equipmentIds,
      techniqueModifiers,
      environmentModifiers: []
    },
    completion: { missingFields: [] },
    exclusion: null,
    supersededByObservationId: null,
    derivedFromObservationIds: []
  }
}

const propertyConfig = { numRuns: 100 }

test.prop([
  fc.double({ min: 1, max: 400, noNaN: true, noDefaultInfinity: true })
], propertyConfig)('equivalent kilogram and pound loads build the same comparability key', kg => {
  const kilograms = observation({ id: 'kg', loadValue: kg, loadUnit: 'kg' })
  const pounds = observation({ id: 'lb', loadValue: kg / 0.45359237, loadUnit: 'lb' })

  expect(areObservationsComparable(kilograms, pounds)).toBe(true)
})

test.prop([
  fc.uniqueArray(fc.constantFrom('trap_bar', 'belt', 'straps'), { minLength: 1 }),
  fc.uniqueArray(fc.constantFrom(
    'continuous_repetitions',
    'paused_each_repetition',
    'tempo_eccentric'
  ), { minLength: 1 })
], propertyConfig)('comparison keys are invariant to set-like dimension ordering', (
  equipmentIds,
  techniqueModifiers
) => {
  const forward = observation({
    id: 'forward',
    loadValue: 180,
    loadUnit: 'kg',
    equipmentIds,
    techniqueModifiers
  })
  const reverse = observation({
    id: 'reverse',
    loadValue: 180,
    loadUnit: 'kg',
    equipmentIds: [...equipmentIds].reverse(),
    techniqueModifiers: [...techniqueModifiers].reverse()
  })

  expect(buildObservationComparabilityKey(forward))
    .toEqual(buildObservationComparabilityKey(reverse))
})

test.prop([
  fc.double({ min: 20, max: 300, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 0.1, max: 20, noNaN: true, noDefaultInfinity: true })
], propertyConfig)('different external loads never compare under a fixed-load protocol', (kg, delta) => {
  const first = observation({ id: 'first', loadValue: kg, loadUnit: 'kg' })
  const second = observation({ id: 'second', loadValue: kg + delta, loadUnit: 'kg' })

  expect(areObservationsComparable(first, second)).toBe(false)
})

test.prop([
  fc.integer({ min: 1, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
], propertyConfig)('a protocol version change always breaks comparability', (major, minor, patch) => {
  const first = observation({ id: 'first', loadValue: 180, loadUnit: 'kg' })
  const second = observation({
    id: 'second',
    loadValue: 180,
    loadUnit: 'kg',
    protocolVersion: `${major}.${minor}.${patch}`
  })

  expect(areObservationsComparable(first, second)).toBe(
    `${major}.${minor}.${patch}` === '1.0.0'
  )
})
