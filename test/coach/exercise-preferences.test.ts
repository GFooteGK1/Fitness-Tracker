import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateExercisePreferences, resolveExercisePreferences, type ExercisePreferences } from '@/app/lib/coach/exercise-preferences'
import { applyExercisePreferenceContext } from '@/app/lib/coach/exercise-preferences-context'
import { assembleCoachEvidenceContext, type CoachEvidenceMemoryRow } from '@/app/lib/coach/evidence-context'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
function planningFixture() {
 const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
 profile.startDate = '2026-09-14'
 const evidence = assembleCoachEvidenceContext('synthetic-athlete',{purpose:'new_planning',asOf:'2026-09-14T12:00:00Z'}, {
  programs:[],planVersions:[],sessions:[],memories:[],strengthAssessments:[],imports:[],observationGroups:[],observationValues:[]
 })
 return {userId:'synthetic-athlete',profile,context:{evidence}}
}
function compose(input: ReturnType<typeof planningFixture>) {
 const profile = applyExercisePreferenceContext(input.profile,input.context.evidence)
 const plan = buildRollingWeeklyPlan({source:'initial',windowStart:profile.startDate,profile,direction:buildRollingTrainingDirection(profile,{hypothesis:'Test suitable favorite exercise selection.'})})
 if(plan.kind !== 'weekly_plan') throw new Error('Expected weekly plan')
 return {profile,plan}
}
function apply(input: ReturnType<typeof planningFixture>) { return applyExercisePreferenceContext(input.profile,input.context.evidence) }


const favorite = (id: string): ExercisePreferences => ({ schemaVersion: 1, state: 'specified', entries: [{ athleteWording: id, target: { kind: 'movement', id } }] })
const none: ExercisePreferences = { schemaVersion: 1, state: 'none', entries: [] }
function row(content: unknown, changes: Partial<CoachEvidenceMemoryRow> = {}): CoachEvidenceMemoryRow {
  return { id: 'snapshot', user_id: 'synthetic-athlete', memory_key: 'exercise_preferences', kind: 'preference', content,
    provenance: { source: 'athlete' }, confidence: 1, confirmed_at: '2026-09-13T12:00:00Z', version: 2, status: 'confirmed',
    effective_from: null, effective_until: null, review_after: null, last_reviewed_at: null, ...changes }
}
function fixture(memories: CoachEvidenceMemoryRow[]) {
  const input = planningFixture()
  input.context.evidence = assembleCoachEvidenceContext(input.userId, { purpose: 'new_planning', asOf: '2026-09-14T12:00:00Z' }, {
    programs: [], planVersions: [], sessions: [], memories, strengthAssessments: [], imports: [], observationGroups: [], observationValues: []
  })
  return input
}
const movements = (result: ReturnType<typeof compose>) => result.plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises.map(e => e.movementId)))

describe('exercise preferences', () => {
  beforeEach(() => vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED', 'true'))
  afterEach(() => vi.unstubAllEnvs())
  it('validates bounded typed input and rejects malformed or duplicated entries', () => {
    expect(validateExercisePreferences(none)).toBe(true)
    expect(validateExercisePreferences(favorite('dumbbell_goblet_squat'))).toBe(true)
    for (const bad of [null, {}, {...none, extra: true}, {...none, state: 'specified'}, favorite('invented'),
      {...favorite('push_up'), entries: Array(13).fill(favorite('push_up').entries[0])},
      {...none, entries: [{ athleteWording: 'x', target: {kind:'unresolved', id:'x'} }]},
      {...none, state:'specified', entries: [{ athleteWording: 'x'.repeat(161), target:{kind:'unresolved'} }]}
    ]) expect(validateExercisePreferences(bad)).toBe(false)
  })
  it('deduplicates family overlap without inventing specialist mappings', () => {
    const value: ExercisePreferences = {...favorite('dumbbell_goblet_squat'), entries: [
      ...favorite('dumbbell_goblet_squat').entries,
      {athleteWording:'Squats',target:{kind:'interest',id:'squat_variations'}},
      {athleteWording:'Gymnastics',target:{kind:'interest',id:'gymnastics'}}
    ]}
    expect(resolveExercisePreferences(value).filter(p => p.movementId === 'dumbbell_goblet_squat')).toHaveLength(1)
    expect(resolveExercisePreferences(value)).toHaveLength(3)
  })
  it.each(['withdrawn', 'superseded', 'expired', 'review_due', 'none'])('does not resurrect old favorites after %s', status => {
    const newest = row(none, status === 'expired' ? {effective_until:'2026-09-14T00:00:00Z'}
      : status === 'review_due' ? {review_after:'2026-09-14T00:00:00Z'} : status === 'none' ? {} : {status})
    const input = fixture([row(favorite('push_up'),{version:1, id:'old',status:'superseded'}), newest,
      row({movementId:'push_up',preference:'prefer'},{id:'legacy',memory_key:'favorite_pushup',version:1})])
    input.profile.preferences = [{movementId:'push_up',preference:'prefer',source:'athlete_confirmed'}]
    const before = structuredClone(input.profile)
    const result = apply(input)
    expect(result.preferences).toEqual([])
    expect(input.profile).toEqual(before)
  })
  it('ignores cross-user and future snapshots and preserves existing legacy behavior', () => {
    const input = fixture([row(none,{user_id:'other'}),row(none,{confirmed_at:'2027-01-01T00:00:00Z'}),
      row({movementId:'push_up',preference:'prefer'},{id:'legacy',memory_key:'favorite_pushup'})])
    const result = apply(input)
    expect(result.preferences).toEqual([{movementId:'push_up',preference:'prefer',source:'athlete_confirmed'}])
  })
  it('honors avoidance when a snapshot asks for the same favorite', () => {
    const input = fixture([row(favorite('dumbbell_goblet_squat')),
      row({movementId:'dumbbell_goblet_squat',preference:'avoid'},{id:'avoid',memory_key:'avoid_squat'})])
    const result = compose(input)
    expect(movements(result)).not.toContain('dumbbell_goblet_squat')
  })
  it('changes suitable exercise selection without changing planned dose', () => {
    const left = compose(fixture([row(favorite('dumbbell_goblet_squat'))]))
    const right = compose(fixture([row(favorite('kettlebell_goblet_squat'))]))
    expect(movements(left)).toContain('dumbbell_goblet_squat')
    expect(movements(right)).toContain('kettlebell_goblet_squat')
    expect(movements(left)).not.toEqual(movements(right))
    expect(left.plan.schedule.ledger.map(e=>e.plannedDose)).toEqual(right.plan.schedule.ledger.map(e=>e.plannedDose))
  })
  it('keeps unrecognized interest as data and does not infer skills or goals', () => {
    const input = fixture([row({schemaVersion:1,state:'specified',entries:[{athleteWording:'Ring skills',target:{kind:'unresolved'}}]})])
    const result = compose(input)
    expect(result.profile.primaryGoal).toEqual(input.profile.primaryGoal)
    expect(result.profile.preferences).toEqual([])
    expect(result.profile.preferenceNotes?.join(' ')).toContain('supported movement has not been identified')
    expect(input.context.evidence.memories.some(e=>e.id==='snapshot')).toBe(true)
  })
  it('enforces equipment and experience before favorite selection', () => {
    const input = fixture([row(favorite('barbell_back_squat'))])
    input.profile.equipment.resolvedIds = ['bodyweight','dumbbell']
    input.profile.trainingExperience = 'new_or_returning'
    const result = compose(input)
    expect(movements(result)).not.toContain('barbell_back_squat')
    expect(result.plan.profileSnapshot.preferenceNotes?.join(' ')).toContain('required equipment is unavailable')
  })
  it('disables new interpretation without deleting stored memory', () => {
    vi.stubEnv('COACH_EXERCISE_PREFERENCES_ENABLED','false')
    const input = fixture([row(favorite('kettlebell_goblet_squat'))])
    const result = apply(input)
    expect(result.preferences).toEqual([])
  })
})
