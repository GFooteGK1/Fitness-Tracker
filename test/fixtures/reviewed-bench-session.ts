import { doseContentHash, INITIAL_DOSE_POLICY_VERSION, type ReviewedDoseOption } from '@/app/lib/coach/initial-dose-policy'
import type { OfflineReviewedSessionContext, ReviewedPreparationStep, ReviewedSessionRecipe } from '@/app/lib/coach/offline-reviewed-session'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'

export function reviewedBenchExample(): OfflineReviewedSessionContext {
  const review = { id: 'C2-R-exact-session', contentHash: 'efa25b8a63dcfb9104e04a62f53a24d711fcdfe1ff94eacb873d0776d9187a3d' }
  const before = {
    movementId: 'barbell_bench_press', equipmentId: 'fixture-bench-bar-2.5lb-plates', protocolId: 'same-bench-variation',
    loadConvention: 'total_external' as const, repetitionsPerSide: false, sets: 3,
    repetitions: { min: 6, max: 6 }, load: { min: 165, max: 165, unit: 'lb' as const },
    targetRpe: null, restSeconds: { min: 180, max: 180 },
  }
  const facts = { scope: 'synthetic C2-R', goal: 'strength', olderHistory: null, previousIntendedEffort: null,
    actualSets: [1, 2, 3].map(() => ({ reps: 6, loadLb: 165, rpe: 7 })), restSeconds: 180,
    repQuality: 'crisp', pain: false, recovery: 'normal', availability: 'unchanged', outsideWork: 'unchanged', incrementLb: 5 }
  const source = { id: 'synthetic-completed-bench', revision: 1, contentHash: doseContentHash({ before, facts }) }
  const option: ReviewedDoseOption = { id: 'C2-R', policyVersion: INITIAL_DOSE_POLICY_VERSION, operation: 'load_trial',
    before, after: { ...structuredClone(before), load: { min: 170, max: 170, unit: 'lb' }, targetRpe: { min: 7, max: 8 } },
    review, sources: [source], reviewedFactsHash: doseContentHash(facts) }
  const preparation: ReviewedPreparationStep[] = [
    { id: 'bike', movement: 'Easy bike', dose: { kind: 'duration', seconds: 180 }, load: null, effort: { kind: 'quality', cue: 'Easy' }, restAfterSeconds: null },
    { id: 'band', movement: 'Band pull-apart', dose: { kind: 'repetitions', repetitions: 10 }, load: null, effort: { kind: 'quality', cue: 'Easy' }, restAfterSeconds: null },
    { id: 'scapular', movement: 'Scapular push-up', dose: { kind: 'repetitions', repetitions: 8 }, load: null, effort: { kind: 'quality', cue: 'Easy' }, restAfterSeconds: null },
    ...[[45, 10, 60], [95, 5, 60], [135, 3, 90], [155, 1, 180]].map(([load, repetitions, rest]): ReviewedPreparationStep => ({
      id: `ramp-${load}`, movement: 'Same barbell bench variation', dose: { kind: 'repetitions', repetitions },
      load: { min: load, max: load, unit: 'lb' },
      effort: load === 155 ? { kind: 'quality', cue: 'Comfortable, crisp' } : { kind: 'rpe', range: { min: 3, max: 4 } },
      restAfterSeconds: { min: rest, max: rest },
    })),
  ]
  const recipe: ReviewedSessionRecipe = { optionId: option.id, optionHash: doseContentHash(option), review, preparation,
    workingInstructions: ['Keep the same bench variation.', 'Stop early at the effort or technique limit.', 'Record actual reps and RPE for every working set.'] }
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
  profile.primaryGoal.domain = 'strength'
  return { profile, registry: [{ option, contentHash: doseContentHash(option) }], recipes: [{ recipe, contentHash: doseContentHash(recipe) }],
    input: { optionId: option.id, policyVersion: INITIAL_DOSE_POLICY_VERSION, before: structuredClone(before), facts,
      // Synthetic caller assertion exercises the earlier candidate gate; it is not C2-R timing evidence.
      currentSources: [structuredClone(source)], currentReviews: [review], unresolvedReasons: [], wholeWeekFit: 'verified' } }
}
