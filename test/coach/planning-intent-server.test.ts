import { describe, expect, it, vi } from 'vitest'
import { applyConfirmedIntentToProfile, fetchPlanningIntent, validateIntentBaselineOwnership } from '@/app/lib/coach/planning-intent-server'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'
import { savedSetupIsConfirmed } from '@/app/lib/coach/complete-intake'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
const owner='athlete-1'
const snapshot=()=>({schemaVersion:1 as const,memoryId:'memory-1',memoryVersion:1,content:intent()})
const comparison={movementId:null,variationId:null,distance:{value:5000,unit:'m'},equipmentIds:['track'],repetitions:null,externalLoad:null,duration:null,techniqueModifiers:[],environmentModifiers:[]}
function baseline(){return {id:'observation-1',status:'complete',verification_status:'athlete_confirmed',verified_by:owner,source_kind:'manual',source_system:'sociusfit_training_baseline',assessment_definition_id:'run.time_trial',protocol_version:'1.0.0',comparison_modifiers:structuredClone(comparison),metadata:{origin:'athlete_reported',assessmentDefinitionVersion:'1.0.0',protocolId:'run-time-trial-standard'}}}
function client(group:unknown,values:unknown[]=[{id:'value-1'}]){const filters:unknown[]=[];const from=vi.fn((table:string)=>{const chain:any={select:vi.fn(()=>chain),eq:vi.fn((...args:unknown[])=>{filters.push([table,...args]);return chain}),order:vi.fn(()=>chain),limit:vi.fn(async()=>({data:table==='performance_observation_values'?values:group?[group]:[],error:null}))};return chain});return {db:{from} as never,filters}}
describe('confirmed baseline reuse',()=>{
 it('requires a complete owned exact metric and comparison binding',async()=>{const s=snapshot();s.content.outcomes[0].baseline={status:'referenced',observationId:'11111111-1111-4111-8111-111111111111'};const c=client(baseline());expect(await validateIntentBaselineOwnership(c.db,owner,s)).toEqual([]);expect(c.filters).toContainEqual(['performance_observation_values','metric_id','run.time']);expect(c.filters).toContainEqual(['performance_observation_values','unit','s'])})
 it.each(['repetitions','externalLoad','duration','techniqueModifiers','environmentModifiers','distance','equipmentIds','variationId'])('does not reuse changed %s',async key=>{const s=snapshot();s.content.outcomes[0].baseline={status:'referenced',observationId:'11111111-1111-4111-8111-111111111111'};const row=baseline();(row.comparison_modifiers as Record<string,unknown>)[key]='different';expect(await validateIntentBaselineOwnership(client(row).db,owner,s)).toHaveLength(1)})
 it.each(['version','source','metric','verification'])('rejects invalid %s provenance or value',async change=>{const s=snapshot();s.content.outcomes[0].baseline={status:'referenced',observationId:'11111111-1111-4111-8111-111111111111'};const row=baseline();if(change==='version')row.metadata.assessmentDefinitionVersion='other';if(change==='source')row.source_kind='derived';if(change==='verification')row.verified_by='other';expect(await validateIntentBaselineOwnership(client(row,change==='metric'?[]:undefined).db,owner,s)).toHaveLength(1)})
 it('does not resurrect withdrawn or not-yet-effective memories',async()=>{for(const row of [{status:'withdrawn'},{status:'confirmed',effective_from:'2999-01-01T00:00:00.000Z'}])expect(await fetchPlanningIntent(client(row).db,owner)).toBeNull()})
})

describe('confirmed intent controls new direction scope',()=>{
 it('rejects stale unrelated domain allocation and preserves one shared allocation for two distinct runs',()=>{
  const p=structuredClone(GOLDEN_PROGRAMMING_PROFILES[0].profile),s=snapshot()
  expect(()=>applyConfirmedIntentToProfile(p,s)).toThrow('Align')
  p.primaryGoal={...p.primaryGoal,domain:'aerobic'};p.secondaryGoals=[];s.content=intent(runningOutcome(),runningOutcome('goal:mile',1609))
  const updated=applyConfirmedIntentToProfile(p,s)
  expect(updated.secondaryGoals).toHaveLength(0);expect(updated.trainingIntent?.content.outcomes).toHaveLength(2)
  expect(updated.primaryGoal.athleteIntent).toContain('1609');expect(p.trainingIntent).toBeUndefined()
 })
 it('refuses to present a supported subset as a complete event program',()=>{const s=snapshot();s.content.outcomes[0].capability={status:'unsupported',reason:'Needs sport adapter'};s.content.outcomes.push(runningOutcome('goal:mile',1609));s.content.event={name:'Hybrid race',goalIds:s.content.outcomes.map(o=>o.goal.id),date:null};expect(()=>applyConfirmedIntentToProfile(GOLDEN_PROGRAMMING_PROFILES[0].profile,s)).toThrow('unsupported outcome')})
 it('never confirms malformed persisted availability through form defaults',()=>{const schedule={experience:'consistent',trainingDays:['monday','wednesday'],sessionMinutes:60};const equipment={equipment:'Bodyweight',resolvedEquipmentIds:['bodyweight']};expect(savedSetupIsConfirmed(schedule,equipment)).toBe(true);expect(savedSetupIsConfirmed({...schedule,sessionMinutes:20},equipment)).toBe(false);expect(savedSetupIsConfirmed({...schedule,sessionMinutes:undefined},equipment)).toBe(false);expect(savedSetupIsConfirmed(schedule,{equipment:'Bodyweight'})).toBe(false)})
})

describe('scheduled baseline execution supersession',()=>{
 it.each([0,1,2])('requires an unchanged capture revision, observed revision %i',async revision=>{
  const s=snapshot();s.content.outcomes[0].baseline={status:'referenced',observationId:'11111111-1111-4111-8111-111111111111'}
  const row={...baseline(),source_kind:'coach_completion',source_system:'sociusfit',workout_id:'workout-1',prescribed_session_id:'session-1',metadata:{...baseline().metadata,completionContractVersion:2}}
  const from=(table:string)=>{const chain:any={select:()=>chain,eq:()=>chain,limit:async()=>({data:table==='workouts'?[{id:'workout-1',capture_revision:revision,execution_revision:0}]:table==='performance_observation_values'?[{id:'value-1'}]:[row],error:null})};return chain}
  expect(await validateIntentBaselineOwnership({from} as never,owner,s)).toHaveLength(revision===1?0:1)
 })
})
