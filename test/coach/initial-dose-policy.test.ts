import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  doseContentHash, evaluateInitialDoseCandidate, INITIAL_DOSE_POLICY_VERSION,
  type InitialDoseCandidateInput, type ReviewedDoseOption, type ReviewedDoseRegistryEntry,
} from '../../app/lib/coach/initial-dose-policy'

const reviewText = readFileSync('docs/verification/programming-quality/bench-next-exposure-review-1.md', 'utf8').replace(/\r\n/g, '\n')
const review = { id: 'C2-R-exact-session', contentHash: doseContentHash(reviewText) }

function example() {
  const before = {
    movementId: 'synthetic-flat-bench', equipmentId: 'fixture-bench-bar-plates', protocolId: 'same-bench-variation',
    loadConvention: 'total_external' as const, repetitionsPerSide: false, sets: 3,
    repetitions: { min: 6, max: 6 }, load: { min: 165, max: 165, unit: 'lb' as const },
    targetRpe: null, restSeconds: { min: 180, max: 180 },
  }
  const facts = {
    goal: 'strength', completedExposures: 1, olderHistory: null,
    actualSets: [1, 2, 3].map(() => ({ reps: 6, load: 165, unit: 'lb', rpe: 7 })),
    repQuality: 'crisp', recovery: 'normal', pain: false, availability: 'unchanged', addedOutsideWork: false,
    equipmentIncrementLb: 5, scope: 'synthetic_reviewed_case',
  }
  const source = { id: 'fixture-completed-bench', revision: 1, contentHash: doseContentHash({ before, facts }) }
  const option: ReviewedDoseOption = {
    id: 'C2-R-reviewed-load-trial', policyVersion: INITIAL_DOSE_POLICY_VERSION, operation: 'load_trial', review,
    sources: [source], reviewedFactsHash: doseContentHash(facts), before,
    after: { ...structuredClone(before), load: { min: 170, max: 170, unit: 'lb' }, targetRpe: { min: 7, max: 8 } },
  }
  const registry: ReviewedDoseRegistryEntry[] = [{ option, contentHash: doseContentHash(option) }]
  const input: InitialDoseCandidateInput = {
    optionId: option.id, policyVersion: INITIAL_DOSE_POLICY_VERSION, before: structuredClone(before), facts,
    currentSources: [structuredClone(source)], currentReviews: [review], unresolvedReasons: [], wholeWeekFit: 'verified',
  }
  return { input, registry }
}

describe('reviewed initial-dose option boundary, offline only', () => {
  it('preserves the accepted 165 to 170 trial and unknown prior effort without requiring two exposures', () => {
    expect(reviewText).toContain('**170 lb — 3×6**')
    expect(reviewText).toContain('**RPE7–8 each set**')
    const { input, registry } = example()
    const result = evaluateInitialDoseCandidate(input, registry)
    expect(result.kind).toBe('candidate')
    if (result.kind !== 'candidate') throw new Error('Expected candidate')
    expect(result.option.after.load).toEqual({ min: 170, max: 170, unit: 'lb' })
    expect(result.option.before.targetRpe).toBeNull()
    expect(result.option.after.targetRpe).toEqual({ min: 7, max: 8 })
    expect(result.requiresAthleteAcceptance).toBe(true)
    expect(result.mode).toBe('offline_only')
    expect(result.numericRuntimeEligible).toBe(false)
  })

  it('does not mutate the accepted source or let a returned draft mutate the registry', () => {
    const { input, registry } = example()
    const frozen = structuredClone({ input, registry })
    const result = evaluateInitialDoseCandidate(input, registry)
    expect({ input, registry }).toEqual(frozen)
    if (result.kind !== 'candidate') throw new Error('Expected candidate')
    result.option.after.load.min = 999
    expect(registry).toEqual(frozen.registry)
  })

  it('does not calculate an arbitrary next increment or accept changed option contents', () => {
    const { input, registry } = example()
    registry[0].option.after.load = { min: 175, max: 175, unit: 'lb' }
    expect(evaluateInitialDoseCandidate(input, registry)).toMatchObject({ kind: 'review_required', reasons: ['reviewed_option_changed'] })
    input.optionId = 'unreviewed-option'
    expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('unsupported')
  })

  it.each(['source_revision', 'source_contents', 'source_added', 'source_duplicate', 'review_changed'])(
    'invalidates binding when %s changes', change => {
      const { input, registry } = example()
      if (change === 'source_revision') input.currentSources[0].revision++
      if (change === 'source_contents') input.currentSources[0].contentHash = doseContentHash('correction')
      if (change === 'source_added') input.currentSources.push({ ...input.currentSources[0], id: 'later-stopped-session' })
      if (change === 'source_duplicate') input.currentSources.push(structuredClone(input.currentSources[0]))
      if (change === 'review_changed') input.currentReviews = [{ ...review, contentHash: doseContentHash('revised review') }]
      expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
    },
  )

  it.each(['pain', 'outside_work', 'set_effort', 'goal', 'protocol', 'unit'])(
    'does not reuse the reviewed trial after %s changes', change => {
      const { input, registry } = example()
      if (change === 'pain') input.facts!.pain = true
      if (change === 'outside_work') input.facts!.addedOutsideWork = true
      if (change === 'set_effort') input.facts!.actualSets = [{ reps: 6, load: 165, unit: 'lb', rpe: 10 }]
      if (change === 'goal') input.facts!.goal = 'different_goal'
      if (change === 'protocol') input.before!.protocolId = 'different-variation'
      if (change === 'unit') input.before!.load.unit = 'kg'
      expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
    },
  )

  it('prioritizes contrary evidence and whole-week uncertainty over missing history', () => {
    const { input, registry } = example()
    input.before = null
    input.unresolvedReasons = ['later_session_stop_unresolved']
    expect(evaluateInitialDoseCandidate(input, registry)).toMatchObject({ kind: 'review_required', reasons: input.unresolvedReasons })
    input.unresolvedReasons = []
    input.wholeWeekFit = 'infeasible'
    expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
    input.wholeWeekFit = 'verified'
    expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('provisional')
  })

  it.each(['sets', 'rest', 'range_load', 'unit', 'known_effort'])(
    'rejects a structurally invalid reviewed load operation: %s', change => {
      const { input, registry } = example()
      const option = registry[0].option
      if (change === 'sets') option.after.sets++
      if (change === 'rest') option.after.restSeconds.max = 120
      if (change === 'range_load') option.before.load.max = 170
      if (change === 'unit') option.after.load.unit = 'kg'
      if (change === 'known_effort') option.before.targetRpe = { min: 5, max: 6 }
      registry[0].contentHash = doseContentHash(option) // Even a trusted registry cannot bypass operation invariants.
      expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
    },
  )

  it('preserves doubles and ranges in a synthetic retention contract without clamping or deriving a maximum', () => {
    const { input, registry } = example()
    const option = registry[0].option
    option.operation = 'retain'
    option.review = { id: 'mechanical-retention-fixture-not-a-human-label', contentHash: doseContentHash('test-only structural fixture') }
    input.currentReviews = [option.review]
    option.before = { ...option.before, repetitions: { min: 2, max: 2 }, load: { min: 200, max: 205, unit: 'lb' }, targetRpe: { min: 7, max: 8 } }
    option.after = structuredClone(option.before)
    input.before = structuredClone(option.before)
    registry[0].contentHash = doseContentHash(option)
    // Mechanical invariant fixture only, not another coaching review of this dose.
    const result = evaluateInitialDoseCandidate(input, registry)
    expect(result.kind).toBe('candidate')
    if (result.kind !== 'candidate') throw new Error('Expected candidate')
    expect(result.option.after.repetitions).toEqual({ min: 2, max: 2 })
    expect(result.option.after.load).toEqual({ min: 200, max: 205, unit: 'lb' })
    option.after.repetitions.min = 3
    registry[0].contentHash = doseContentHash(option)
    expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
  })

  it('rejects ambiguous identities, unavailable policy versions and non-JSON evidence', () => {
    const { input, registry } = example()
    expect(evaluateInitialDoseCandidate(input, [...registry, ...registry]).kind).toBe('review_required')
    expect(evaluateInitialDoseCandidate({ ...input, policyVersion: 'future' }, registry).kind).toBe('unsupported')
    input.facts!.rpe = NaN
    expect(evaluateInitialDoseCandidate(input, registry).kind).toBe('review_required')
    expect(() => doseContentHash({ unknown: undefined })).toThrow('finite JSON')
  })

  it('does not emit a retained working prescription with an unknown effort target', () => {
    const { input, registry } = example()
    registry[0].option.operation = 'retain'
    registry[0].option.after = structuredClone(registry[0].option.before)
    registry[0].contentHash = doseContentHash(registry[0].option)
    expect(evaluateInitialDoseCandidate(input, registry)).toMatchObject({
      kind: 'review_required', reasons: ['explicit_working_effort_missing'],
    })
  })
})
