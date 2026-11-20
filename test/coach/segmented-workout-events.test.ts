import {describe,expect,it} from 'vitest'
import { normalizePerformedDoseEvidence } from '@/app/lib/coach/performed-dose-evidence'
import { buildPerformedWorkEvidence } from '@/app/lib/coach/performed-work-context'
import { buildFactualPlanningContext } from '@/app/lib/coach/planning-context'
import { captureProvenance } from '@/app/lib/capture/contracts'
const event=()=>({movement_name:'Barbell bench press',prescribed:{reps:6,load:{value:225,unit:'lb'},rpe:8},performed:{reps:18,load:{value:185,unit:'lb'}},notes:'Totals from three sets; per-set distribution not established.'})
function fixture(block:any={segments:[{rounds:3,events:[event()]}],block_score:{rounds_completed:3,extra_reps:2,total_reps:56}}){
 return {userId:'athlete',asOf:'2026-10-11T21:00:00Z',startsOn:'2026-10-01',endsOn:'2026-10-11',mode:'current' as const,
 available:true,complete:true,retrievalComplete:true,athleteCoverage:'unknown' as const,completions:[],
 workouts:[{id:'workout',user_id:'athlete',workout_date:'2026-10-08',created_at:'2026-10-08T18:00:00Z',execution_status:'completed',
 capture_provenance:captureProvenance('workout','athlete_reported','athlete_confirmed'),blocks:[block],rpe:7}]}
}
describe('stored segmented workouts in coaching evidence',()=>{
 it('retains only event-local actual quantities and source paths, separately from targets/rounds/scores',()=>{
  const f=fixture(),original=structuredClone(f),r=normalizePerformedDoseEvidence(f)
  expect(r.issues).toEqual([]);expect(r.exposures).toHaveLength(1)
  const e=r.exposures[0],path='blocks[0].segments[0].events[0]'
  expect(e.sourcePath).toBe(path);expect(e.repetitions).toEqual({kind:'exact',value:18,sourcePath:path+'.performed.reps'})
  expect(e.load).toEqual({kind:'exact',value:185,sourcePath:path+'.performed.load.value'})
  expect(e.sets.kind).toBe('unknown');expect(e.effort).toBeNull()
  expect(e.role).toBe('unknown');expect(e.basis).toBe('reported_work')
  expect(e.recordedEvent).toMatchObject({prescribed:{value:{reps:6}},segmentRounds:{value:3},blockScore:{value:{extra_reps:2}}})
  expect(e.raw).toEqual(event());expect(f).toEqual(original)
  const records=buildPerformedWorkEvidence(f)
  expect(records.coverage.complete).toBe(true);expect(records.records[0].recordedName).toBe('Barbell bench press')
  expect(records.records[0].recordedEvent).toEqual(e.recordedEvent);expect(records.records[0].sessionEffort.value).toBe(7)
  expect(records.records[0].effort).toBeNull()
  const planning=buildFactualPlanningContext(f);expect(planning.retrievalComplete).toBe(true)
  expect(planning.movements[0]).toMatchObject({sourcePath:path,familiarityEligible:true})
 })
 it('retains distance, duration, varying loads and set detail literally without turning them into invented sets or reps',()=>{
  const raw={movement_name:'Running',prescribed:{reps:10},performed:{distance:{value:400,unit:'m'},duration_s:95,loads_lb:[175,180],sets:2},sets_detail:[{reps:6},{reps:4}]}
  const e=normalizePerformedDoseEvidence(fixture({segments:[{rounds:5,events:[raw]}]})).exposures[0]
  expect(e.repetitions.kind).toBe('unknown');expect(e.load.kind).toBe('unknown');expect(e.durationMinutes.kind).toBe('unknown')
  expect(e.sets).toMatchObject({kind:'exact',value:2});expect(e.raw).toEqual(raw);expect(e.recordedEvent).toMatchObject({performed:{value:raw.performed}})
 })
 it.each([
  {segments:null}, {segments:[]}, {segments:[{}]}, {segments:[{events:[]}]},
  {segments:[{events:[null]}]}, {segments:[{events:[{movement_name:'Bench',prescribed:{reps:6}}]}]},
  {segments:[{events:[{movement_name:'Bench',performed:{}}]}]},
  {segments:[{events:[event()]}],movements:[]}, {segments:[{events:[event()]}],exercises:[]},
 ])('fails closed on malformed, prescribed-only or mixed event representation %j',block=>{
  const f=fixture(block),e=buildPerformedWorkEvidence(f),p=buildFactualPlanningContext(f)
  expect(e.coverage.complete).toBe(false);expect(p.retrievalComplete).toBe(false)
 })
 it('retains unresolved movements without guessing an implement or granting familiarity',()=>{
  const f=fixture({segments:[{events:[{movement_name:'Mystery machine',performed:{reps:0,load:{value:0,unit:'lb'}}}]}]})
  const e=normalizePerformedDoseEvidence(f).exposures[0]
  expect(e.movementId).toBeNull();expect(e.repetitions).toMatchObject({kind:'exact',value:0})
  expect(buildFactualPlanningContext(f).movements).toEqual([])
 })
 it('retains nested blocks roots, unknown quantity values and provenance without converting strings',()=>{
  const f=fixture({segments:[{events:[{movement_name:'Barbell bench press',performed:{reps:'6',load:{value:'185',unit:'lb'}}}]}]})
  f.workouts[0].blocks={blocks:f.workouts[0].blocks} as any
  const e=normalizePerformedDoseEvidence(f).exposures[0]
  expect(e.sourcePath).toBe('blocks.blocks[0].segments[0].events[0]')
  expect(e.repetitions.kind).toBe('unknown');expect(e.load.kind).toBe('unknown')
  expect(e.quantityProvenance.repetitions.origin).toBe('athlete_reported')
 })
 it('preserves ownership and historical timestamp rejection',()=>{
  const f=fixture();f.workouts[0].user_id='foreign'
  expect(()=>normalizePerformedDoseEvidence(f)).toThrow('ownership')
  f.workouts[0].user_id='athlete';f.workouts[0].created_at='2026-10-12T18:00:00Z'
  expect(buildPerformedWorkEvidence(f).coverage.complete).toBe(false)
 })
})
