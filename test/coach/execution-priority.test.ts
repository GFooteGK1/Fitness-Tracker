import { describe, expect, it } from 'vitest'
import { findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { buildStoredRollingWeeklyIntent, parseStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { mustPrecede, orderSessionAssignments } from '@/app/lib/coach/execution-priority'
import type { WeeklyCoverageRequirement } from '@/app/lib/coach/programming-schema'
import type { WeeklyCoverageAssignment } from '@/app/lib/coach/weekly-coverage'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'

function profile(movementId='push_up') {
  const p=structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile),o=runningOutcome('goal:push'),d=findAssessmentDefinition('strength.repetition_max')!
  o.domain='strength';o.goal.requiredQualityIds=['maximal_strength'];o.goal.statement='Improve push-up repetitions'
  o.measurement={metricId:d.primaryMetricId,unit:'kg',assessmentDefinition:{id:d.id,version:d.version},protocol:{id:d.protocol.id,version:d.protocol.version}}
  o.binding={movementId,variation:'standard',equipmentIds:['bodyweight'],distance:null,assessmentContext:{repetitions:1,externalLoad:null,duration:null,techniqueModifiers:[],environmentModifiers:[]}}
  const content=intent(o);content.priorityOrder=[o.goal.id]
  p.trainingIntent={schemaVersion:1,memoryId:'11111111-1111-4111-8111-111111111111',memoryVersion:1,content}
  p.executionPriority={goalId:o.goal.id,movementId}
  return p
}
describe('bounded execution priority',()=>{
  it('changes order and preparation together without changing the allocated dose',()=>{
    const p=profile(),direction=buildRollingTrainingDirection(p,{hypothesis:'Repeatable practice supports the confirmed push outcome.',goalTargetDate:'2026-12-31'})
    const a=buildRollingWeeklyPlan({source:'initial',windowStart:p.startDate,profile:p,direction})
    const noPriority=structuredClone(p);delete noPriority.executionPriority
    const b=buildRollingWeeklyPlan({source:'initial',windowStart:p.startDate,profile:noPriority,direction})
    if(a.kind!=='weekly_plan'||b.kind!=='weekly_plan') throw new Error('Expected plans')
    expect(a.schedule.assignments).toEqual(b.schedule.assignments)
    expect(a.executionPriority?.status).toBe('achieved')
    for(const day of a.executionPriority!.days){const session=a.sessions.find(s=>s.day===day.day)!;expect(session.blocks[1].exercises[0].movementId).toBe('push_up');expect(session.blocks[0].exercises[0].movementId).toBe('push_up');expect(session.blocks[1].role).toBe('priority_adaptation')}
    const stored=buildStoredRollingWeeklyIntent(a,buildAdaptivePlanContract(p,[a]));expect(parseStoredRollingWeeklyIntent(stored)).not.toBeNull()
    stored.weekly_plan.executionPriority!.version='future' as any;expect(parseStoredRollingWeeklyIntent(stored)).toBeNull()
  })
  it('reports a constrained exact movement as unavailable without weakening equipment constraints',()=>{
    const p=profile('barbell_bench_press');p.trainingIntent!.content.outcomes[0].measurement={...p.trainingIntent!.content.outcomes[0].measurement!}
    const result=buildRollingWeeklyPlan({source:'initial',windowStart:p.startDate,profile:p,direction:buildRollingTrainingDirection(p,{hypothesis:'Protect the confirmed priority within available equipment.',goalTargetDate:'2026-12-31'})})
    if(result.kind!=='weekly_plan')throw new Error('Expected plan')
    expect(result.executionPriority?.status).toBe('unavailable');expect(result.sessions.flatMap(s=>s.blocks.flatMap(b=>b.exercises)).some(e=>e.movementId==='barbell_bench_press')).toBe(false)
  })
  it('retains mandatory sequencing ahead of the optional preference for every input order and detects cycles',()=>{
    const make=(id:string,kind:WeeklyCoverageRequirement['kind'],fatigueCost:WeeklyCoverageRequirement['fatigueCost']):WeeklyCoverageRequirement=>({id,kind,fatigueCost,sequencing:{mustPrecedeKinds:[]}} as unknown as WeeklyCoverageRequirement)
    const power=make('power','performance_quality','high'),lift=make('lift','movement_pattern','high'),map=new Map([[power.id,power],[lift.id,lift]])
    const a={id:'a',requirementId:'power'} as WeeklyCoverageAssignment,b={id:'b',requirementId:'lift'} as WeeklyCoverageAssignment
    for(const input of [[a,b],[b,a]]) expect(orderSessionAssignments(input,map)).toEqual([a,b])
    expect(mustPrecede(power,lift)).toBe(true)
    lift.sequencing.mustPrecedeKinds=['performance_quality'];expect(()=>orderSessionAssignments([a,b],map)).toThrow('Conflicting mandatory')
  })
})
