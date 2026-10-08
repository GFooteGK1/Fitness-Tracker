import { describe,expect,it,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseFirstReviewProgramsPage,parseFirstReviewProgramWorkspace,parseFirstReviewSnapshotsPage,
  type FirstReviewProgramsPage,type FirstReviewProgramWorkspace,type FirstReviewSnapshotsPage } from '@/app/lib/coach/first-reviewed-workspace-contract'
import { readFirstReviewWorkspace } from '@/app/lib/coach/first-reviewed-workspace-reader'
import { createFirstReviewWorkspaceHttp } from '@/app/lib/coach/first-reviewed-workspace-http'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function fixture(){
  const program={programId:id(10),title:'Owned legacy week',role:'athlete' as const,athleteId:id(1),activePlanVersionId:id(11),
    legacyBase:{planVersionId:id(11),windowStart:'2026-09-14',windowEnd:'2026-09-20',sequenceNumber:1},
    latestDesignation:{designationId:id(20),programId:id(10),userId:id(1),basePlanVersionId:id(11),reviewerId:id(2),
      version:2,targetWindowStart:'2026-10-05',enabled:true,expiresAt:'2099-01-01T00:00:00Z'},reviewAvailable:true}
  const programs:FirstReviewProgramsPage={schemaVersion:1,actorId:id(1),programs:[program],nextAfterProgramId:null}
  const workspace:FirstReviewProgramWorkspace={schemaVersion:1,actorId:id(1),program,candidates:[{candidateId:id(30),designationId:id(20),
    designationVersion:2,reviewerId:id(2),createdAt:'2026-10-05T12:00:00Z',decision:'pending',proposalId:null,proposalStatus:null,planVersionId:null,proposalRequestId:null}],nextAfterCandidateId:null}
  const snapshots:FirstReviewSnapshotsPage={schemaVersion:1,actorId:id(1),programId:id(10),snapshots:[{snapshotId:id(40),designationId:id(20),
    createdAt:'2026-10-05T12:00:00Z',validBefore:'2026-10-05T12:05:00Z',confirmationRequestId:id(41),confirmedAt:'2026-10-05T12:01:00Z'}],nextAfterSnapshotId:null}
  return {programs,workspace,snapshots}
}
function client(data:unknown){
  const state={actor:id(1),authCalls:0,switchAt:0,error:false,throwRpc:false}
  const rpc=vi.fn(async()=>{if(state.throwRpc)throw Error('private backend detail');return {data,error:state.error?{message:'private error'}:null}})
  const db={auth:{getUser:async()=>{state.authCalls++;if(state.switchAt===state.authCalls)state.actor=id(3);
    return {data:{user:state.actor?{id:state.actor}:null},error:null}}},rpc} as unknown as SupabaseClient
  return {state,rpc,db}
}
describe('first review bounded navigation contract and HTTP',()=>{
  it('reads three strictly scoped getter projections',async()=>{
    const f=fixture(),a=client(f.programs),b=client(f.workspace),c=client(f.snapshots)
    expect(await readFirstReviewWorkspace(a.db,{expectedUserId:id(1)},'programs')).toEqual({kind:'programs',page:f.programs})
    expect(a.rpc).toHaveBeenCalledWith('list_first_review_programs',{p_after_program_id:null,p_limit:20})
    expect(await readFirstReviewWorkspace(b.db,{expectedUserId:id(1),programId:id(10)},'workspace')).toEqual({kind:'workspace',page:f.workspace})
    expect(b.rpc).toHaveBeenCalledWith('get_first_review_program_workspace',{p_program_id:id(10),p_after_candidate_id:null,p_limit:20})
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1),programId:id(10)},'snapshots')).toEqual({kind:'snapshots',page:f.snapshots})
    expect(c.rpc).toHaveBeenCalledWith('list_first_review_profile_snapshots',{p_program_id:id(10),p_after_snapshot_id:null,p_limit:20})
  })
  it('accepts owner discovery before designation and history after disabled scope or changed base',()=>{
    const f=fixture(),p=f.programs.programs[0];p.latestDesignation=null;p.reviewAvailable=false
    expect(parseFirstReviewProgramsPage(f.programs,id(1))).toEqual(f.programs)
    p.latestDesignation=fixture().programs.programs[0].latestDesignation;p.latestDesignation!.enabled=false;p.activePlanVersionId=id(99)
    expect(parseFirstReviewProgramsPage(f.programs,id(1))).toEqual(f.programs)
    p.reviewAvailable=true;expect(parseFirstReviewProgramsPage(f.programs,id(1))).toBeNull()
  })
  it('limits reviewer navigation to its current designation and hides the active base',()=>{
    const f=fixture();f.workspace.actorId=id(2);f.workspace.program.role='reviewer';f.workspace.program.activePlanVersionId=null
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(2),id(10))).toEqual(f.workspace)
    f.workspace.candidates[0].designationId=id(19);expect(parseFirstReviewProgramWorkspace(f.workspace,id(2),id(10))).toBeNull()
    f.workspace.candidates[0].designationId=id(20);f.workspace.program.activePlanVersionId=id(11)
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(2),id(10))).toBeNull()
  })
  it.each(['privatePacket','operator_ref','projection','profile','reviewPacket'])('rejects private or unknown field %s',key=>{
    const f=fixture();Object.assign(f.workspace.candidates[0],{[key]:{}});Object.assign(f.snapshots.snapshots[0],{[key]:{}})
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
    expect(parseFirstReviewSnapshotsPage(f.snapshots,id(1),id(10))).toBeNull()
    Object.assign(f.programs.programs[0].latestDesignation!,{[key]:{}})
    expect(parseFirstReviewProgramsPage(f.programs,id(1))).toBeNull()
  })
  it.each(['actor','program','date','sequence','target','binding','scope'])('rejects incorrect %s metadata',failure=>{
    const f=fixture(),p=f.programs.programs[0]
    if(failure==='actor')f.programs.actorId=id(3)
    if(failure==='program')p.latestDesignation!.programId=id(99)
    if(failure==='date')p.legacyBase.windowStart='2026-02-30'
    if(failure==='sequence')p.legacyBase.sequenceNumber=2147483647
    if(failure==='target')p.latestDesignation!.targetWindowStart='2026-09-21'
    if(failure==='binding')p.latestDesignation!.basePlanVersionId=id(99)
    if(failure==='scope')p.reviewAvailable=true,p.latestDesignation=null
    expect(parseFirstReviewProgramsPage(f.programs,id(1))).toBeNull()
  })
  it('rejects incomplete proposal and confirmation metadata',()=>{
    const f=fixture();f.workspace.candidates[0].proposalId=id(50)
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
    f.snapshots.snapshots[0].confirmedAt=null
    expect(parseFirstReviewSnapshotsPage(f.snapshots,id(1),id(10))).toBeNull()
  })
  it('retains the original issuance key for an owner and rejects reviewer disclosure',()=>{
    const f=fixture(),c=f.workspace.candidates[0]
    Object.assign(c,{decision:'approve',proposalId:id(50),planVersionId:id(51),proposalStatus:'proposed',proposalRequestId:'original-issuance-key'})
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toEqual(f.workspace)
    f.workspace.actorId=id(2);f.workspace.program.role='reviewer';f.workspace.program.activePlanVersionId=null
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(2),id(10))).toBeNull()
    c.proposalRequestId=null
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(2),id(10))).toEqual(f.workspace)
  })
  it.each([null,'short',' leading-key','trailing-key ',{},'x'.repeat(201)])('rejects missing or invalid owner issuance identity %s',key=>{
    const f=fixture()
    Object.assign(f.workspace.candidates[0],{decision:'approve',proposalId:id(50),planVersionId:id(51),proposalStatus:'proposed',proposalRequestId:key})
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
  })
  it('rejects a request key without an issued proposal',()=>{
    const f=fixture();f.workspace.candidates[0].proposalRequestId='invented-key'
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
  })
  it('rejects enum lookalike arrays rather than returning them as scalar decisions/status',()=>{
    const f=fixture();Object.assign(f.workspace.candidates[0],{decision:['pending']})
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
    Object.assign(f.workspace.candidates[0],{decision:'approve',proposalId:id(50),planVersionId:id(51),proposalStatus:['accepted']})
    expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
  })
  it('requires stable ordered pages and correct continuation cursors',()=>{
    const f=fixture();f.programs.nextAfterProgramId=id(10)
    expect(parseFirstReviewProgramsPage(f.programs,id(1),null,1)).toEqual(f.programs)
    expect(parseFirstReviewProgramsPage(f.programs,id(1),null,2)).toBeNull()
    expect(parseFirstReviewProgramsPage(f.programs,id(1),id(10),1)).toBeNull()
    f.workspace.candidates.push(structuredClone(f.workspace.candidates[0]));expect(parseFirstReviewProgramWorkspace(f.workspace,id(1),id(10))).toBeNull()
    f.snapshots.nextAfterSnapshotId=id(99);expect(parseFirstReviewSnapshotsPage(f.snapshots,id(1),id(10),null,1)).toBeNull()
  })
  it.each([0,51,1.5,null,'20'])('rejects invalid input limit %s before RPC',async limit=>{
    const c=client(fixture().programs)
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1),limit},'programs')).toEqual({kind:'invalid_request'})
    expect(c.rpc).not.toHaveBeenCalled()
  })
  it('rejects unknown request fields, malformed cursors and missing program',async()=>{
    const c=client(fixture().programs)
    for(const input of [{expectedUserId:id(1),afterProgramId:''},{expectedUserId:id(1),profile:{}},{expectedUserId:id(1),afterProgramId:undefined}]){
      expect(await readFirstReviewWorkspace(c.db,input,'programs')).toEqual({kind:'invalid_request'})
    }
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1)},'workspace')).toEqual({kind:'invalid_request'})
    expect(c.rpc).not.toHaveBeenCalled()
  })
  it('fences account changes before and after RPC',async()=>{
    const c=client(fixture().programs);c.state.actor=id(3)
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1)},'programs')).toEqual({kind:'account_changed'})
    expect(c.rpc).not.toHaveBeenCalled();c.state.actor=id(1);c.state.switchAt=3
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1)},'programs')).toEqual({kind:'account_changed'})
  })
  it('distinguishes scoped absence from unavailable/malformed responses without leaking errors',async()=>{
    const c=client(null)
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1)},'programs')).toEqual({kind:'unavailable'})
    expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1),programId:id(10)},'snapshots')).toEqual({kind:'not_found'})
    c.state.error=true;expect(await readFirstReviewWorkspace(c.db,{expectedUserId:id(1),programId:id(10)},'workspace')).toEqual({kind:'unavailable'})
  })
  it('HTTP authenticates before query validation and returns private no-store bounded metadata',async()=>{
    const c=client(fixture().programs),h=createFirstReviewWorkspaceHttp({createUserClient:async()=>c.db,enabled:()=>false})
    c.state.actor='';expect((await h.listPrograms(new Request('http://localhost/programs?bad=1'))).status).toBe(401);expect(c.rpc).not.toHaveBeenCalled()
    c.state.actor=id(1);const r=await h.listPrograms(new Request('http://localhost/programs'))
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(await r.json()).toEqual({kind:'programs',page:fixture().programs,writesEnabled:false,numericRuntimeEligible:false})
  })
  it.each(['limit=0','limit=51','limit=1.5','limit=01','limit=20&limit=20','afterProgramId=','afterProgramId=all','profile=raw'])('HTTP rejects %s',async query=>{
    const c=client(fixture().programs),h=createFirstReviewWorkspaceHttp({createUserClient:async()=>c.db,enabled:()=>true})
    expect((await h.listPrograms(new Request(`http://localhost/programs?${query}`))).status).toBe(400);expect(c.rpc).not.toHaveBeenCalled()
  })
  it('HTTP final actor fence rejects a switch after reader success',async()=>{
    const c=client(fixture().workspace);c.state.switchAt=4
    const h=createFirstReviewWorkspaceHttp({createUserClient:async()=>c.db,enabled:()=>true})
    const r=await h.readProgram(new Request('http://localhost/programs'),id(10));expect(r.status).toBe(409)
    expect(await r.json()).toEqual({kind:'account_changed'})
  })
  it('HTTP returns absence, malformed response and backend failure conservatively',async()=>{
    const c=client(null),h=createFirstReviewWorkspaceHttp({createUserClient:async()=>c.db,enabled:()=>true})
    expect((await h.listSnapshots(new Request('http://localhost/programs'),id(10))).status).toBe(404)
    c.state.throwRpc=true;const r=await h.listPrograms(new Request('http://localhost/programs'))
    expect(r.status).toBe(503);expect(await r.json()).toEqual({kind:'unavailable'})
  })
})
