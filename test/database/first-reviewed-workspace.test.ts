import { randomUUID } from 'node:crypto'
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest'
import { supervisedLifecycleFixture,lifecycleIds,sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { readFirstReviewWorkspace } from '@/app/lib/coach/first-reviewed-workspace-reader'

describe('first review discovery with unmocked disposable SQL (not real Auth)',()=>{
  let f:Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const {owner,reviewer,foreign,program,base}=lifecycleIds
  beforeAll(async()=>{
    f=await supervisedLifecycleFixture(true,true,true)
    for(const file of ['20261003150403_supervised_issue_closure_preflight.sql','20261005120000_first_reviewed_designation.sql',
      '20261005130000_first_reviewed_candidates.sql','20261005155602_first_reviewed_acceptance.sql','20261005172408_first_reviewed_workspace.sql'])
      await f.db.exec(sqlFile(`supabase/migrations/${file}`))
  },30000)
  beforeEach(async()=>{await f.db.exec('BEGIN')})
  afterEach(async()=>{await f.db.exec('ROLLBACK; RESET ROLE')})
  afterAll(async()=>{await f?.db.close()})
  const read=(actor=owner,kind:'programs'|'workspace'|'snapshots'='programs',extra={})=>
    readFirstReviewWorkspace(sourceClient(f.db,actor),{expectedUserId:actor,...(kind==='programs'?{}:{programId:program}),...extra},kind)
  async function designation(expected=0,enabled=true,designated=reviewer,expiry=new Date(Date.now()+3600000).toISOString()){
    const id=randomUUID();await f.actor(owner,'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [id,program,owner,base,designated,expected,'2026-10-05',enabled,expiry,'disposable workspace test'])
    return id
  }
  async function reject(operation:()=>Promise<unknown>,code='42501'){
    await f.db.exec('SAVEPOINT rejected');try{await expect(operation()).rejects.toMatchObject({code})}
    finally{await f.db.exec('ROLLBACK TO SAVEPOINT rejected; RELEASE SAVEPOINT rejected')}
  }
  it('discovers the existing owned active legacy base before designation without granting review',async()=>{
    const r=await read();expect(r.kind).toBe('programs');if(r.kind!=='programs')return
    expect(r.page.programs).toHaveLength(1);expect(r.page.programs[0]).toMatchObject({programId:program,athleteId:owner,role:'athlete',
      activePlanVersionId:base,legacyBase:{planVersionId:base,windowStart:'2026-09-14',windowEnd:'2026-09-20',sequenceNumber:1},
      latestDesignation:null,reviewAvailable:false})
    expect(await read(reviewer)).toMatchObject({kind:'programs',page:{programs:[]}})
    expect(await read(owner,'workspace')).toMatchObject({kind:'workspace',page:{candidates:[]}})
    await f.db.exec('RESET ROLE');expect(await f.scalar('SELECT count(*)::int AS value FROM coach_first_review_designations')).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_supervised_programs')).toBe(0)
  })
  it('shows current designated reviewer scope but never standalone profile snapshots',async()=>{
    const id=await designation(),r=await read(reviewer);expect(r.kind).toBe('programs');if(r.kind!=='programs')return
    expect(r.page.programs[0]).toMatchObject({role:'reviewer',activePlanVersionId:null,reviewAvailable:true,latestDesignation:{designationId:id}})
    expect(await read(reviewer,'snapshots')).toEqual({kind:'not_found'})
    expect(await read(foreign,'workspace')).toEqual({kind:'not_found'})
  })
  it('replacement hides the old reviewer and revocation preserves owner navigation',async()=>{
    await designation();await designation(1,true,foreign)
    expect(await read(reviewer)).toMatchObject({kind:'programs',page:{programs:[]}})
    expect(await read(foreign)).toMatchObject({kind:'programs',page:{programs:[{role:'reviewer'}]}})
    await designation(2,false,foreign)
    expect(await read(foreign,'workspace')).toEqual({kind:'not_found'})
    expect(await read(owner)).toMatchObject({kind:'programs',page:{programs:[{reviewAvailable:false,latestDesignation:{version:3,enabled:false}}]}})
  })
  it('expiry hides reviewer scope and retains owner history',async()=>{
    await designation(0,true,reviewer,new Date(Date.now()+300).toISOString());await new Promise(resolve=>setTimeout(resolve,400))
    expect(await read(reviewer,'workspace')).toEqual({kind:'not_found'})
    expect(await read(owner,'workspace')).toMatchObject({kind:'workspace',page:{program:{reviewAvailable:false}}})
  })
  it('rejects foreign and unknown cursors without exposing their metadata',async()=>{
    await designation()
    for(const [kind,cursor] of [['programs','afterProgramId'],['workspace','afterCandidateId'],['snapshots','afterSnapshotId']] as const){
      expect(await read(owner,kind,{[cursor]:randomUUID()})).toEqual({kind:'unavailable'})
    }
    expect(await read(foreign,'workspace',{programId:randomUUID()})).toEqual({kind:'not_found'})
  })
  it('guards function privileges and keeps the projection helper private',async()=>{
    await f.actor(owner,'anon');await reject(()=>f.scalar('SELECT list_first_review_programs() AS value'))
    await f.actor(owner,'authenticated');await reject(()=>f.scalar('SELECT first_review_workspace_program($1,$2) AS value',[program,foreign]))
    await f.actor(owner,'service_role');await reject(()=>f.scalar('SELECT list_first_review_programs() AS value'))
    await f.db.exec('RESET ROLE');expect(await f.scalar("SELECT bool_and(proconfig @> ARRAY['search_path=\"\"']) AS value FROM pg_proc WHERE proname IN ('first_review_workspace_program','list_first_review_programs','get_first_review_program_workspace','list_first_review_profile_snapshots')")).toBe(true)
  })
  it('validates page limits in SQL rather than trusting the HTTP parser',async()=>{
    await f.actor(owner)
    for(const limit of [0,51,null])await reject(()=>f.scalar('SELECT list_first_review_programs(NULL,$1) AS value',[limit]),'22023')
  })
  it('requires an authenticated subject even when the caller has the authenticated SQL role',async()=>{
    await f.actor(owner);await f.db.query("SELECT set_config('request.jwt.claim.sub','',true)")
    await reject(()=>f.scalar('SELECT list_first_review_programs() AS value'))
    await reject(()=>f.scalar('SELECT get_first_review_program_workspace($1) AS value',[program]))
    await reject(()=>f.scalar('SELECT list_first_review_profile_snapshots($1) AS value',[program]))
  })
  it('paginates owned programs by UUID without skipping visible entries',async()=>{
    await f.db.exec('RESET ROLE')
    const copies=[randomUUID(),randomUUID()]
    for(const id of copies){
      await f.db.query("INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode) SELECT $1,user_id,title,goal_summary,start_date,end_date,'draft',program_mode FROM training_programs WHERE id=$2",[id,program])
      const plan=randomUUID()
      await f.db.query("INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot) SELECT $1,$2,user_id,version,status,accepted_at,reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot FROM training_plan_versions WHERE id=$3",[plan,id,base])
      await f.db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2",[plan,id])
    }
    const expected=[program,...copies].sort(),seen:string[]=[];let cursor:string|null=null
    for(let i=0;i<3;i++){
      const r=await read(owner,'programs',{limit:1,afterProgramId:cursor});expect(r.kind).toBe('programs');if(r.kind!=='programs')throw Error('page missing')
      seen.push(r.page.programs[0].programId);cursor=r.page.nextAfterProgramId
      expect(cursor).toBe(i<2?expected[i]:null)
    }
    expect(seen).toEqual(expected)
  })
})
