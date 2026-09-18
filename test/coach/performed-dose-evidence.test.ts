import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePerformedDoseEvidence, type DoseEvidenceSnapshot } from '@/app/lib/coach/performed-dose-evidence'
import { projectPerformedDoseShadowReview } from '@/app/lib/coach/performed-dose-review'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

const movement = MOVEMENT_CATALOG[0]
const base: DoseEvidenceSnapshot = { userId: 'athlete-1', asOf: '2026-09-17T18:00:00Z', startsOn: '2026-08-21', endsOn: '2026-09-17',
  retrievalComplete: true, athleteCoverage: 'unknown', completions: [], workouts: [{ id: 'workout-1', user_id: 'athlete-1', workout_date: '2026-09-10',
    created_at: '2026-09-10T18:00:00Z', updated_at: '2026-09-10T18:00:00Z', blocks: [{ role: 'priority_adaptation', movements: [{ name: movement.name, sets: 3, reps: { min: 5, max: 8 }, load: 20, unit: 'kg', perSide: true, protocol: 'paused', equipment: 'dumbbell', effort: { scope: 'hardest_set', scale: 'RPE', value: 7.5 } }] }] }] }
const canonical = () => {
  const input = structuredClone(base)
  Object.assign(input.workouts[0], { execution_source: 'program_runner', execution_status: 'completed', execution_revision: 0,
    blocks: [{ role: 'priority_adaptation', exercises: [{ movementId: movement.id, role: 'priority_adaptation', dose: { kind: 'sets_reps', sets: { min: 2, max: 4 }, repetitions: { min: 5, max: 8 } }, loadAnchor: { loadRange: { min: 20, max: 30, unit: 'kg' } } }] }] })
  input.completions = [{ id: 'checkin-1', user_id: input.userId, prescribed_session_id: 'session-1', occurred_at: '2026-09-10T18:00:00Z', created_at: '2026-09-10T18:01:00Z', responses: {
    workoutId: 'workout-1', resultStatus: 'completed', completionContractVersion: 2, completionRequest: { contractVersion: 2, sessionId: 'session-1', status: 'completed', occurredAt: '2026-09-10T18:00:00Z', feedback: { outcome: 'as_planned' }, performedWork: { mode: 'as_prescribed', workoutDate: '2026-09-10', blocks: null, inputText: null } } } }]
  return input
}

describe('shadow performed-dose evidence', () => {
  it('preserves exact, bounded and unknown fields without promoting legacy provenance', () => {
    const evidence = normalizePerformedDoseEvidence(base)
    expect(evidence.exposures[0]).toMatchObject({ basis: 'legacy_unknown', sets: { kind: 'exact', value: 3 }, repetitions: { kind: 'bounded', min: 5, max: 8 }, durationMinutes: { kind: 'unknown' }, loadUnit: 'kg', unilateralConvention: true, protocol: 'paused', equipment: 'dumbbell', effort: { scope: 'hardest_set', scale: 'RPE', value: 7.5 } })
    expect(evidence.numericPolicyEligible).toBe(false)
    expect(evidence.coverage.athleteCoverage).toBe('unknown')
  })
  it('preserves an athlete-reported field origin separately from confirmation', () => {
    const input = structuredClone(base)
    input.workouts[0].capture_provenance = captureProvenance('workout', 'athlete_reported', 'athlete_confirmed')
    expect(normalizePerformedDoseEvidence(input).exposures[0]).toMatchObject({ basis: 'reported_work', origin: 'athlete_reported', reviewState: 'athlete_confirmed' })
    input.workouts[0].capture_provenance = captureProvenance('workout', 'model_estimated', 'athlete_confirmed')
    expect(normalizePerformedDoseEvidence(input).exposures[0].basis).toBe('estimated_work')
  })
  it('keeps a confirmed as-prescribed range bounded, never midpoint or maximum performed work', () => {
    const evidence = normalizePerformedDoseEvidence(canonical())
    expect(evidence.exposures[0]).toMatchObject({ basis: 'confirmed_prescription', completionId: 'checkin-1', sessionId: 'session-1', sets: { kind: 'bounded', min: 2, max: 4 }, load: { kind: 'bounded', min: 20, max: 30 } })
  })
  it('does not reuse prescription ranges for modified, stopped, revised or unlinked work', () => {
    for (const outcome of ['modified', 'stopped_early']) {
      const input = canonical()
      const responses = input.completions[0].responses as { completionRequest: { feedback: { outcome: string } } }
      responses.completionRequest.feedback.outcome = outcome
      expect(normalizePerformedDoseEvidence(input).exposures[0].basis).toBe('unverified_prescription')
    }
    const input = canonical(); input.workouts[0].execution_revision = 1
    expect(normalizePerformedDoseEvidence(input).exposures[0].basis).toBe('unverified_prescription')
    const amended = canonical(); amended.workouts[0].capture_revision = 2
    expect(normalizePerformedDoseEvidence(amended).exposures[0].basis).toBe('unverified_prescription')
  })
  it('deduplicates identical linked records but preserves distinct same-day workouts', () => {
    const input = canonical(); input.workouts.push(structuredClone(input.workouts[0])); input.completions.push(structuredClone(input.completions[0]))
    expect(normalizePerformedDoseEvidence(input).exposures).toHaveLength(1)
    input.workouts.push({ ...input.workouts[0], id: 'other' })
    const evidence = normalizePerformedDoseEvidence(input)
    expect(evidence.exposures).toHaveLength(2)
    expect(evidence.issues.some(issue => issue.reason.includes('separate_same_day'))).toBe(true)
  })
  it('preserves preparation precedence, unknown units and incomplete quantities', () => {
    const input = structuredClone(base)
    input.workouts[0].blocks = [{ role: 'specific_preparation', movements: [{ name: movement.name, role: 'priority_adaptation', sets: 2.5, reps: -2, load: 10, unit: 'plates' }] }]
    expect(normalizePerformedDoseEvidence(input).exposures[0]).toMatchObject({ role: 'preparation', sets: { kind: 'unknown' }, repetitions: { kind: 'unknown' }, loadUnit: null })
  })
  it('rejects cross-owner, conflicting identities and current corrections after as-of', () => {
    const input = canonical(); input.workouts[0].user_id = 'other'
    expect(() => normalizePerformedDoseEvidence(input)).toThrow('ownership')
    const conflict = canonical(); conflict.workouts.push({ ...conflict.workouts[0], blocks: [] })
    expect(normalizePerformedDoseEvidence(conflict).exposures).toEqual([])
    const future = canonical(); future.workouts[0].updated_at = '2026-09-18T12:00:00Z'
    expect(normalizePerformedDoseEvidence(future).exposures).toEqual([])
  })
  it('does not mutate a frozen strategy compiler result when shadow quantity evidence changes', () => {
    const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
    profile.startDate = '2026-09-07'
    const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Stable supported direction.', goalTargetDate: '2026-12-31' })
    const frozen = { source: 'initial' as const, windowStart: profile.startDate, profile, direction }
    const before = buildRollingWeeklyPlan(structuredClone(frozen))
    if (before.kind !== 'weekly_plan') throw new Error('Expected plan')
    const evidence = normalizePerformedDoseEvidence(base)
    const review = projectPerformedDoseShadowReview({ userId: base.userId, plan: before }, evidence)
    expect(review.numericPolicyEligible).toBe(false)
    evidence.exposures[0].sets = { kind: 'exact', value: 100, sourcePath: 'changed-shadow-fixture' }
    projectPerformedDoseShadowReview({ userId: base.userId, plan: before }, evidence)
    expect(buildRollingWeeklyPlan(structuredClone(frozen))).toEqual(before)
  })
  it('keeps shadow modules out of runtime compiler and prompt source imports', () => {
    for (const path of ['app/lib/coach/planning-context.ts', 'app/lib/coach/session-composer.ts', 'app/lib/coach/weekly-coverage.ts', 'app/lib/coach/rolling-weekly-plan.ts', 'app/lib/agents/prompts/socius.ts']) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/from\s+['"][^'"]*performed-dose-(evidence|review)/)
    }
  })
})
