import { describe,expect,it } from 'vitest'
import { seedFirstReviewedWeek,addFirstReviewedSession,addFirstReviewedStep } from '@/app/lib/coach/first-reviewed-draft-editor'
import { seedSupervisedWeek,moveSupervisedSession,copySupervisedSession,editSupervisedStep } from '@/app/lib/coach/supervised-draft-editor'
import { reviewedStepSeconds,isReviewedActivity } from '@/app/lib/coach/reviewed-session-contract'
import { firstReviewedProgram } from '../fixtures/first-reviewed-program'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

function ids(){let n=0;return ()=>`draft-${++n}`}
function seed(){const p=firstReviewedProgram();return seedFirstReviewedWeek(p,p.athleteId)!}
describe('initial complete-week authoring',()=>{
  it('uses only the designated non-adjacent window with empty proposed work and no copied history',()=>{
    const p=firstReviewedProgram(),s=seedFirstReviewedWeek(p,p.athleteId)!
    expect(s).toMatchObject({transition:'first_reviewed',windowStart:'2026-10-05',sequenceNumber:2})
    expect(s.recipe.sessions).toEqual([]);expect(s.recipe.protocols).toEqual([])
    expect(Object.values(s.recipe.baseSchedule)).toEqual(Array(7).fill(null))
    expect(seedSupervisedWeek(reviewedRollingWeek().plan,'first_reviewed' as 'same_week')).toBeNull()
  })
  it.each(['foreign','reviewer','disabled','expired','malformed','accepted'])('does not seed unavailable %s scope',kind=>{
    const p=firstReviewedProgram();let actor=p.athleteId
    if(kind==='foreign')actor=p.programId
    if(kind==='reviewer'){p.role='reviewer';actor=p.latestDesignation!.reviewerId;p.activePlanVersionId=null}
    if(kind==='disabled')p.reviewAvailable=false
    if(kind==='expired')p.latestDesignation!.expiresAt='2026-01-01T00:00:00Z'
    if(kind==='malformed')p.latestDesignation!.targetWindowStart='2026-10-06'
    if(kind==='accepted'){p.reviewAvailable=false;p.activePlanVersionId=p.programId}
    expect(seedFirstReviewedWeek(p,actor)).toBeNull()
  })
  it('creates explicit preparation, working and logging blanks which cannot compile into a prescription',()=>{
    const s=seed(),next=addFirstReviewedSession(s,'monday',ids()),session=next.recipe.sessions[0]
    expect(s.recipe.sessions).toHaveLength(0);expect(session.steps.map(s=>s.kind)).toEqual(['preparation_window','activity','allowance'])
    expect(next.recipe.schedules[0].days.monday).toBe(session.id)
    expect(next.recipe.baseSchedule.monday).toBe(session.id)
    const work=session.steps[1];expect(isReviewedActivity(work)).toBe(false)
    expect(()=>reviewedStepSeconds(session.steps[0])).toThrow();expect(()=>reviewedStepSeconds(work)).toThrow()
    expect(work).toMatchObject({movementId:'',sets:NaN,effort:{kind:'rpe',min:NaN,max:NaN},restBetweenSeconds:NaN})
  })
  it('creates monitoring identity and protocol without observations and keeps final logging required',()=>{
    const nextId=ids(),s=addFirstReviewedSession(seed(),'monday',nextId),session=s.recipe.sessions[0]
    let next=addFirstReviewedStep(s,session.id,'monitoring',nextId)
    next=addFirstReviewedStep(next,session.id,'transition',nextId)
    const protocol=next.recipe.protocols[0],steps=next.recipe.sessions[0].steps
    expect(protocol).toMatchObject({sessionId:session.id,instructions:[],sensorMetadata:null,actualObservations:[]})
    expect(steps.find(s=>s.id===protocol.activityId)).toMatchObject({role:'monitoring',protocolId:protocol.id,sets:NaN})
    expect(steps.at(-1)).toMatchObject({kind:'allowance',purpose:'logging'})
    expect(s.recipe.protocols).toEqual([])
    expect(()=>editSupervisedStep(next,session.id,protocol.activityId,'remove',nextId)).toThrow('logging allowance')
    const logging=next.recipe.sessions[0].steps.at(-1)!
    if(logging.kind!=='allowance')throw Error('Expected final logging')
    logging.seconds=60
    const removed=editSupervisedStep(next,session.id,protocol.activityId,'remove',nextId)
    expect(removed.recipe.protocols).toEqual([])
  })
  it('moves and copies first-review proposed work without changing the target window or ordinary transition',()=>{
    const nextId=ids(),s=addFirstReviewedSession(seed(),'monday',nextId),moved=moveSupervisedSession(s,s.recipe.sessions[0].id,'tuesday')
    const copied=copySupervisedSession(moved,s.recipe.sessions[0].id,'monday',nextId)
    expect(copied.transition).toBe('first_reviewed');expect(copied.windowStart).toBe(s.windowStart)
    expect(copied.recipe.sessions).toHaveLength(2)
    for(const schedule of [copied.recipe.baseSchedule,copied.recipe.schedules[0].days]){
      expect(Object.values(schedule).filter(Boolean).sort()).toEqual(copied.recipe.sessions.map(s=>s.id).sort())
    }
    expect(s.recipe.sessions).toHaveLength(1)
  })
  it('preserves both complete allocations when a fresh session uses a day freed by a move',()=>{
    const nextId=ids(),s=addFirstReviewedSession(seed(),'monday',nextId),original=s.recipe.sessions[0].id
    const moved=moveSupervisedSession(s,original,'tuesday'),created=addFirstReviewedSession(moved,'monday',nextId)
    expect(created.recipe.schedules[0].days.tuesday).toBe(original)
    expect(created.recipe.baseSchedule.monday).toBe(original)
    expect(created.recipe.schedules[0].days.monday).toBe(created.recipe.sessions[1].id)
    for(const schedule of [created.recipe.baseSchedule,created.recipe.schedules[0].days]){
      expect(Object.values(schedule).filter(Boolean).sort()).toEqual(created.recipe.sessions.map(s=>s.id).sort())
    }
    expect(s.recipe.sessions).toHaveLength(1)
  })
  it('rejects occupied days and damaged logging instead of inventing a replacement allocation',()=>{
    const nextId=ids(),s=addFirstReviewedSession(seed(),'monday',nextId)
    expect(()=>addFirstReviewedSession(s,'monday',nextId)).toThrow('empty training day')
    s.recipe.sessions[0].steps=[]
    expect(()=>addFirstReviewedStep(s,s.recipe.sessions[0].id,'working',nextId)).toThrow('final logging')
    const ordinary=seedSupervisedWeek(reviewedRollingWeek().plan,'next_week')!
    expect(()=>addFirstReviewedSession(ordinary,'sunday',nextId)).toThrow('first-review')
  })
})
