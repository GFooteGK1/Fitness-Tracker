import { describe, expect, it } from 'vitest'
import { MOVEMENT_CATALOG, MOVEMENT_EQUIPMENT_IDS, isMovementEligible, findMovementSubstitutions } from '@/app/lib/coach/movement-catalog'
import { validateReviewedMovementEligibility, resolveReviewedMovementId } from '@/app/lib/coach/reviewed-movement-eligibility'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { compileOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { compileOfflineReviewedSession } from '@/app/lib/coach/offline-reviewed-session'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedDevelopmentalWeek } from '../fixtures/reviewed-developmental-week'
import { reviewedBenchExample } from '../fixtures/reviewed-bench-session'

describe('reviewed canonical movement and equipment eligibility', () => {
  it('resolves all accepted activities without changing their identity, dose or protocol', () => {
    const fixture = reviewedDevelopmentalWeek(), before = structuredClone(fixture)
    for (const session of fixture.registry[0].recipe.sessions) for (const activity of reviewedSessionActivities(session)) {
      expect(validateReviewedMovementEligibility(activity.movementId, fixture.context.profile, activity.requiredEquipment)).toMatchObject({ ok: true })
    }
    expect(compileOfflineReviewedWeek(fixture.context, fixture.registry).kind).toBe('compiled')
    expect(fixture).toEqual(before)
    expect(resolveReviewedMovementId('run')).toBe('reviewed_run')
    expect(resolveReviewedMovementId('high_handle_trap_bar')).toBe('high_handle_trap_bar')
    expect(resolveReviewedMovementId('Deadlift')).toBeNull()
    expect(resolveReviewedMovementId('bench')).toBeNull()
  })
  it.each(['canonical avoidance', 'canonical run avoidance', 'new trainee', 'missing trap bar', 'generic trap bar', 'missing runout', 'unresolved setup', 'no running', 'unknown movement'])(
    'requires review despite a rehashed registry for %s', change => {
      const { context, registry } = reviewedDevelopmentalWeek()
      if (change === 'canonical avoidance') context.profile.preferences.push({ movementId: 'bike_erg', preference: 'avoid', source: 'athlete_confirmed' })
      if (change === 'canonical run avoidance') context.profile.preferences.push({ movementId: 'easy_run', preference: 'avoid', source: 'athlete_confirmed' })
      if (change === 'new trainee') context.profile.trainingExperience = 'new_or_returning'
      if (change === 'missing trap bar' || change === 'generic trap bar') {
        context.profile.equipment.resolvedIds = context.profile.equipment.resolvedIds.filter(id => id !== 'high_handle_trap_bar')
        if (change === 'generic trap bar') context.profile.equipment.resolvedIds.push('trap_bar')
      }
      if (change === 'missing runout') context.profile.equipment.resolvedIds = context.profile.equipment.resolvedIds.filter(id => id !== 'safe_runout')
      if (change === 'unresolved setup') context.profile.equipment.unresolvedAthleteDescription = 'Maybe low handles only'
      if (change === 'no running') context.profile.explicitConstraints.push({ id: 'no-run', kind: 'no_running', source: 'athlete_confirmed', description: 'No running' })
      if (change === 'unknown movement') reviewedSessionActivities(registry[0].recipe.sessions[0])[0].movementId = 'unknown-bike'
      registry[0].recipe.profileHash = doseContentHash(context.profile)
      registry[0].contentHash = doseContentHash(registry[0].recipe)
      expect(compileOfflineReviewedWeek(context, registry).kind).toBe('review_required')
    })
  it('canonical requirements reject a falsely declared bodyweight setup', () => {
    const fixture = reviewedDevelopmentalWeek()
    fixture.context.profile.equipment.resolvedIds = ['bodyweight']
    expect(validateReviewedMovementEligibility('barbell_bench_press', fixture.context.profile, ['bodyweight']).ok).toBe(false)
    expect(validateReviewedMovementEligibility('high_handle_trap_bar', fixture.context.profile, ['bodyweight']).ok).toBe(false)
  })
  it('checks preparation equipment and avoidance in the accepted standalone bench session', () => {
    const base = reviewedBenchExample()
    expect(compileOfflineReviewedSession(base).kind).toBe('compiled')
    for (const id of ['bike', 'band']) {
      const fixture = structuredClone(base)
      fixture.profile.equipment.resolvedIds = fixture.profile.equipment.resolvedIds.filter(value => value !== id)
      expect(compileOfflineReviewedSession(fixture).kind).toBe('review_required')
    }
    base.profile.preferences.push({ movementId: 'scapular_push_up', preference: 'avoid', source: 'athlete_confirmed' })
    expect(compileOfflineReviewedSession(base).kind).toBe('review_required')
  })
  it('does not allow a familiar assessment name to override reviewed skill constraints', () => {
    const fixture = reviewedBenchExample()
    fixture.profile.trainingExperience = 'new_or_returning'
    fixture.profile.recentTraining.performedMovementIds = ['barbell_bench_press']
    fixture.profile.assessments = [{ id: 'named-assessment', movement: 'Bench press', variation: null, load: 165, unit: 'lb', reps: 5,
      assessedOn: '2026-08-01', isTrueRepMax: false, rir: null, rpe: 7, athleteConfidence: 0.8,
      estimatedOneRepMax: 198, estimateKind: 'estimated_1rm', calculatorVersion: 'synthetic' }]
    expect(validateReviewedMovementEligibility('barbell_bench_press', fixture.profile).ok).toBe(false)
  })
  it('keeps added identities out of default selection and automatic substitution', () => {
    const context = { availableEquipmentIds: [...MOVEMENT_EQUIPMENT_IDS], trainingExperience: 'experienced' as const, noOverhead: false, noRunning: false }
    const reviewed = MOVEMENT_CATALOG.filter(item => item.substitutionGroup.startsWith('reviewed:'))
    expect(reviewed).toHaveLength(16)
    expect(MOVEMENT_CATALOG.find(item => item.id === 'reviewed_run')?.coverage).toEqual([])
    expect(MOVEMENT_CATALOG.find(item => item.id === 'band_pull_apart')?.coverage).not.toContainEqual({ kind: 'movement_pattern', targetId: 'horizontal_pull' })
    for (const movement of reviewed) {
      expect(movement.programmingStatus).toBe('evidence_only')
      expect(isMovementEligible(movement, context)).toBe(false)
      expect(findMovementSubstitutions({ movementId: movement.id, domain: movement.domains[0], requiredCoverage: [], eligibility: context })).toEqual([])
    }
  })
})
