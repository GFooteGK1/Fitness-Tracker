/** @vitest-environment jsdom */
import React from 'react'
import { webcrypto } from 'node:crypto'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { FirstReviewedWorkspace } from '@/app/program/first-reviewed-workspace'
import { saveFirstReviewedPending,readFirstReviewedPending } from '@/app/lib/coach/first-reviewed-pending'
import { parseFirstReviewedCandidateReview,legacyReviewBase } from '@/app/lib/coach/first-reviewed-contract'
import type { FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { firstReviewedProgram } from '../fixtures/first-reviewed-program'
import { effortWorkPlan } from '../fixtures/reviewed-effort-work'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const owner=id(2),programId=id(1),candidateId=id(10),proposalId=id(11),planVersionId=id(12)
const issuanceKey='original-issued-request'
function pending():FirstReviewedPending{return {schemaVersion:1,userId:owner,programId,operation:'issue',
  body:{expectedUserId:owner,programId,candidateId,requestId:issuanceKey}}}
function coordinate(){
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(name:string,_options:LockOptions,run:(lock:Lock)=>Promise<unknown>)=>run({name,mode:'exclusive'} as Lock)}})
}
beforeEach(()=>{localStorage.clear();vi.stubGlobal('crypto',webcrypto);coordinate()})
afterEach(()=>{cleanup();vi.unstubAllGlobals();Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})})

function discoveryFailure(mode:'not_found'|'no_write'='not_found'){
  const posts:{path:string;request:FirstReviewedPending}[]=[]
  const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
    const path=String(url)
    if(init?.method==='POST'){
      const request=JSON.parse(String(init.body)) as FirstReviewedPending;posts.push({path,request})
      if(path!=='/api/coach/first-reviewed/resolution')throw Error('Unexpected mutation')
      return Response.json({kind:'resolved',resolution:mode==='no_write'
        ?{schemaVersion:1,request,disposition:'no_write',resolutionId:id(30),resolvedAt:'2026-10-05T19:00:00Z'}
        :{schemaVersion:1,request,disposition:'not_found'}})
    }
    return Response.json({kind:'unavailable'},{status:503})
  })
  vi.stubGlobal('fetch',fetcher);return {posts,fetcher}
}
describe('first reviewed root identity and recovery (component transport, not real Auth/browser)',()=>{
  it('keeps recovery discoverable when both program list and current workspace are unavailable',async()=>{
    const q=saveFirstReviewedPending(localStorage,pending()),h=discoveryFailure()
    render(<FirstReviewedWorkspace userId={owner}/>)
    const button=await screen.findByRole('button',{name:'Check the original saved result'})
    expect((screen.getByRole('combobox',{name:'Program'}) as HTMLSelectElement).value).toBe(programId)
    fireEvent.click(button)
    await screen.findByText(/result is unconfirmed/)
    expect(readFirstReviewedPending(localStorage,owner,programId)).toEqual(q)
    expect(h.posts).toEqual([{path:'/api/coach/first-reviewed/resolution',request:q}])
  })
  it('restores actor-scoped recovery through StrictMode setup/cleanup replay',async()=>{
    const q=saveFirstReviewedPending(localStorage,pending()),h=discoveryFailure()
    render(<React.StrictMode><FirstReviewedWorkspace userId={owner}/></React.StrictMode>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original saved result'}))
    await screen.findByText(/result is unconfirmed/)
    expect(readFirstReviewedPending(localStorage,owner,programId)).toEqual(q)
    expect(h.posts).toEqual([{path:'/api/coach/first-reviewed/resolution',request:q}])
  })
  it('archives a verified original no-write receipt without resending despite discovery failure',async()=>{
    const q=saveFirstReviewedPending(localStorage,pending()),h=discoveryFailure('no_write')
    render(<FirstReviewedWorkspace userId={owner}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original saved result'}))
    await waitFor(()=>expect(readFirstReviewedPending(localStorage,owner,programId)).toBeNull())
    expect(h.posts).toEqual([{path:'/api/coach/first-reviewed/resolution',request:q}])
    const archived=JSON.parse(localStorage.getItem(`first-reviewed-receipt:${owner}:${programId}:issue:${issuanceKey}`)!)
    expect(archived.request).toEqual(q);expect(archived.disposition).toBe('no_write')
    expect(screen.queryByRole('button',{name:'Check the original saved result'})).toBeNull()
  })
  it('isolates retained work immediately when the account changes',async()=>{
    saveFirstReviewedPending(localStorage,pending());const h=discoveryFailure()
    const view=render(<FirstReviewedWorkspace userId={owner}/>)
    await screen.findByRole('button',{name:'Check the original saved result'})
    view.rerender(<FirstReviewedWorkspace userId={id(99)}/>)
    expect(screen.queryByRole('button',{name:'Check the original saved result'})).toBeNull()
    expect(screen.queryByRole('combobox',{name:'Program'})).toBeNull()
    expect(readFirstReviewedPending(localStorage,owner,programId)).toEqual(pending())
    expect(h.posts).toEqual([])
  })
  it('fences an in-flight recovered result after account change without removing original work',async()=>{
    const q=saveFirstReviewedPending(localStorage,pending());discoveryFailure()
    let release!:(r:Response)=>void
    const prior=globalThis.fetch
    vi.stubGlobal('fetch',vi.fn((url:string|URL|Request,init?:RequestInit)=>init?.method==='POST'
      ?new Promise<Response>(resolve=>{release=resolve}):prior(url,init)))
    const view=render(<FirstReviewedWorkspace userId={owner}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original saved result'}))
    await waitFor(()=>expect(release).toBeTypeOf('function'))
    view.rerender(<FirstReviewedWorkspace userId={id(99)}/>)
    await act(async()=>{release(Response.json({kind:'resolved',resolution:{schemaVersion:1,request:q,disposition:'no_write',resolutionId:id(30),resolvedAt:'2026-10-05T19:00:00Z'}}))})
    expect(readFirstReviewedPending(localStorage,owner,programId)).toEqual(q)
    expect(localStorage.getItem(`first-reviewed-receipt:${owner}:${programId}:issue:${issuanceKey}`)).toBeNull()
    expect(screen.queryByText(/original request is permanently closed/)).toBeNull()
  })
  it('sends nothing when safe tab coordination is unavailable',async()=>{
    const q=saveFirstReviewedPending(localStorage,pending()),h=discoveryFailure('no_write')
    Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
    render(<FirstReviewedWorkspace userId={owner}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original saved result'}))
    await screen.findByText(/Safe browser request coordination is unavailable/)
    expect(h.posts).toEqual([]);expect(readFirstReviewedPending(localStorage,owner,programId)).toEqual(q)
  })
  it.each([false,true])('keeps designated self-review separate from exact-key athlete acceptance (self-review=%s)',async selfReview=>{
    const p=firstReviewedProgram(),week=effortWorkPlan(),profile={...reviewedRollingWeek().plan.profileSnapshot,startDate:'2026-09-14'}
    if(selfReview)p.latestDesignation!.reviewerId=owner
    const legacy=buildRollingWeeklyPlan({source:'initial',profile,windowStart:profile.startDate,
      direction:buildRollingTrainingDirection(profile,{hypothesis:'Synthetic legacy UI fixture.'})})
    if(legacy.kind!=='weekly_plan')throw Error('Expected complete legacy fixture')
    const candidate={candidateId,designationId:p.latestDesignation!.designationId,designationVersion:1,programId,userId:owner,
      reviewerId:p.latestDesignation!.reviewerId,basePlanVersionId:p.legacyBase.planVersionId,contentHash:'a'.repeat(64),sourceHash:'b'.repeat(64),createdAt:'2026-10-05T19:00:00Z',
      reviewPacket:{schemaVersion:1,reviewMode:'manual_first_reviewed_week',week,legacyBase:legacyReviewBase(legacy),
        profileFacts:{snapshotId:id(20),confirmationRequestId:id(21),projectionAsOf:'2026-10-05T19:00:00Z',factsHash:'c'.repeat(64),assessments:[],baselines:[]},
        rationale:'Synthetic complete-week UI identity check, not athlete suitability.',changes:[{kind:'changed',summary:'Reviewed working sets.',sessionIds:[week.scheduledSessions[0].prescription.sessionId]}],
        evidence:[{sourceId:'fixture:1',summary:'No performed athlete evidence.'}],evidenceSource:{sourceHash:'b'.repeat(64),revision:1,historyThrough:'2026-10-04',historyDays:90},limitations:['Synthetic UI reference only.']}}
    expect(parseFirstReviewedCandidateReview(candidate)).not.toBeNull()
    const summary={candidateId,designationId:candidate.designationId,designationVersion:1,reviewerId:candidate.reviewerId,createdAt:candidate.createdAt,
      decision:selfReview?'pending':'approve',proposalId:selfReview?null:proposalId,proposalStatus:selfReview?null:'proposed',
      planVersionId:selfReview?null:planVersionId,proposalRequestId:selfReview?null:'original-issued-request'}
    const requests:FirstReviewedPending[]=[],decisions:FirstReviewedPending[]=[];let accepted=false,reviewSaved=false,issued=!selfReview
    vi.stubGlobal('fetch',vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
      const path=String(url)
      if(init?.method==='POST'){
        const q=JSON.parse(String(init.body)) as FirstReviewedPending
        if(q.operation==='decide'){
          const result={candidateId,designationId:candidate.designationId,requestId:q.body.requestId,decision:'approve',reviewerId:owner,
            designationVersion:1,contentHash:candidate.contentHash,sourceHash:candidate.sourceHash,decisionId:id(31),decidedAt:'2026-10-05T19:00:00Z',replayed:false}
          if(path.endsWith('/resolution'))return Response.json({kind:'resolved',resolution:{schemaVersion:1,request:q,disposition:'saved',result:{...result,replayed:true}}})
          decisions.push(q);reviewSaved=true;return Response.json({kind:'approved',receipt:result})
        }
        if(q.operation!=='accept'&&q.operation!=='issue')throw Error('Unexpected action')
        const receipt={proposalId,planVersionId,activePlanVersionId:q.operation==='accept'?planVersionId:p.activePlanVersionId}
        if(path.endsWith('/resolution'))return Response.json({kind:'resolved',resolution:{schemaVersion:1,request:q,disposition:'saved',result:receipt}})
        if(q.operation==='issue'){issued=true;summary.proposalRequestId=q.body.requestId;return Response.json({kind:'issued',...receipt})}
        requests.push(q);accepted=true
        return Response.json({kind:'accepted',receipt:{proposalId,planVersionId,activePlanVersionId:planVersionId}})
      }
      if(path==='/api/coach/first-reviewed/programs')return Response.json({kind:'programs',page:{schemaVersion:1,actorId:owner,programs:[p],nextAfterProgramId:null},writesEnabled:true})
      if(path.endsWith('/profiles'))return Response.json({kind:'snapshots',page:{schemaVersion:1,actorId:owner,programId,snapshots:[],nextAfterSnapshotId:null},writesEnabled:true})
      if(path.endsWith(`/candidates/${candidateId}`))return Response.json({kind:'candidate',candidate})
      return Response.json({kind:'workspace',page:{schemaVersion:1,actorId:owner,program:accepted?{...p,reviewAvailable:false,activePlanVersionId:planVersionId}:p,
        candidates:[{...summary,decision:reviewSaved?'approve':summary.decision,proposalId:issued?proposalId:null,
          planVersionId:issued?planVersionId:null,proposalStatus:accepted?'accepted':issued?'proposed':null}],nextAfterCandidateId:null},writesEnabled:true})
    }))
    render(<FirstReviewedWorkspace userId={owner}/>)
    fireEvent.click(await screen.findByRole('button',{name:/Review complete week from/}))
    if(selfReview){
      const approve=await screen.findByRole('button',{name:'Approve this exact week'}) as HTMLButtonElement
      expect(approve.disabled).toBe(true);expect(screen.queryByRole('button',{name:'Accept this exact week'})).toBeNull()
      fireEvent.click(screen.getByRole('checkbox',{name:'I reviewed the complete week, previous plan, facts and limitations.'}))
      fireEvent.click(approve)
      const issue=await screen.findByRole('button',{name:'Create the athlete proposal'})
      expect(decisions).toHaveLength(1);expect(requests).toEqual([])
      expect(decisions[0]).toMatchObject({userId:owner,operation:'decide',body:{expectedUserId:owner,candidateId,designationId:candidate.designationId,decision:'approve'}})
      fireEvent.click(issue)
    }
    const accept=await screen.findByRole('button',{name:'Accept this exact week'}) as HTMLButtonElement
    expect(accept.disabled).toBe(true);expect(requests).toEqual([])
    expect(screen.getByText('Synthetic complete-week UI identity check, not athlete suitability.')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox',{name:'I reviewed this complete proposed week and want to accept it.'}))
    expect(accept.disabled).toBe(false);fireEvent.click(accept)
    await waitFor(()=>expect(requests).toHaveLength(1))
    expect(requests[0]).toEqual({schemaVersion:1,userId:owner,programId,operation:'accept',body:{expectedUserId:owner,programId,candidateId,
      proposalId,planVersionId,requestId:summary.proposalRequestId,contentHash:candidate.contentHash,sourceHash:candidate.sourceHash}})
    await screen.findByText(/This exact week is accepted on your existing program/)
    await screen.findByText('This exact week is accepted. Your prior program history remains preserved.')
    expect(readFirstReviewedPending(localStorage,owner,programId)).toBeNull()
  })
})
