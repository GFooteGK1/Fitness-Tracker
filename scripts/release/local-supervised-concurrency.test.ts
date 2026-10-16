/** Real independent PostgreSQL backends on the retained synthetic target.
 * No migrations, new Auth users, acceptance, global switches or deletion. */
import { spawn,type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync,mkdirSync,writeFileSync,existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe,it,expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { effortWorkInput } from '../../test/fixtures/reviewed-effort-work'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { formatUTCAsLocalDateWithOffset,localDateToUTCStart } from '@/app/lib/timezone-utils'
import type { SupervisedPending } from '@/app/lib/coach/supervised-pending'

const podman='output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe'
const connection='sociusfit-local',container='supabase_db_sociusfit-programming-local'
const quote=(value:unknown)=>`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`
const sql=(name:string,args:unknown[])=>`SELECT to_json(public.${name}(${args.map(quote).join(',')}));`
const childEnv:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))}
interface Result { code:string; lines:string[] }
class Session {
  child:ChildProcessWithoutNullStreams;buffer='';pid=0;exited=false
  pending:null|{marker:string;lines:string[];resolve:(r:Result)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}=null
  constructor(){
    this.child=spawn(podman,['--connection',connection,'exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=0'],{windowsHide:true,env:childEnv})
    this.child.stderr.resume() // SQL errors may echo full payload; retain only SQLSTATE.
    this.child.stdout.on('data',data=>{
      this.buffer+=data.toString();let end:number
      while((end=this.buffer.indexOf('\n'))>=0){
        const line=this.buffer.slice(0,end).replace(/\r$/,'');this.buffer=this.buffer.slice(end+1)
        const p=this.pending;if(!p)continue
        if(line.startsWith(p.marker+' ')){this.pending=null;clearTimeout(p.timer);p.resolve({code:line.slice(p.marker.length+1).trim(),lines:p.lines})}
        else if(line)p.lines.push(line)
      }
    })
    const fail=()=>{this.exited=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Local PostgreSQL session ended'));this.pending=null}}
    this.child.once('error',fail);this.child.once('exit',fail)
  }
  request(statement:string):Promise<Result>{
    if(this.pending||this.exited)throw Error('Unavailable PostgreSQL session')
    return new Promise((resolve,reject)=>{
      const marker=`SUPERVISED_${randomUUID().replaceAll('-','')}`
      const timer=setTimeout(()=>{this.pending=null;this.child.kill();reject(Error('Local PostgreSQL deadline exceeded'))},10000)
      this.pending={marker,lines:[],resolve,reject,timer}
      this.child.stdin.write(`${statement}\n\\echo ${marker} :SQLSTATE\n`)
    })
  }
  async exec(statement:string){const r=await this.request(statement);if(r.code!=='00000')throw Error(`Local SQLSTATE ${r.code}`);return r}
  async json(statement:string){const r=await this.exec(statement);expect(r.lines).toHaveLength(1);return JSON.parse(r.lines[0])}
  async begin(actor:string,role='authenticated'){
    await this.exec('BEGIN;');await this.exec("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='5s';")
    await this.exec(`SET LOCAL ROLE ${role};`);await this.exec(`SELECT set_config('request.jwt.claim.sub',${quote(actor)},true);`)
  }
  async close(){if(this.exited)return;if(this.pending){this.child.kill();return}try{await this.exec('ROLLBACK;')}finally{this.child.stdin.end('\\q\n')}}
}

describe.skipIf(process.env.SOCIUS_LOCAL_SUPERVISED_RACES!=='true')('real supervised request races',()=>{
  it('serializes saved-first and closure-first schedules for submit, decide and issue',async()=>{
    const runId=process.env.SOCIUS_LOCAL_SUPERVISED_RACE_RUN
    const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
    if(!runId||!uuid.test(runId))throw Error('Explicit race UUID required')
    const sourceRun='f0d5bb72-36aa-49d6-8d7c-5a8214e6176d'
    const source=JSON.parse(readFileSync(`output/app-quality-release/supervised-auth-${sourceRun}/receipt.json`,'utf8'))
    if(source.runId!==sourceRun||source.status!=='passed'||source.target!=='http://127.0.0.1:55321'||source.cycles?.length!==2||source.users?.map((u:{actor:string})=>u.actor).sort().join(',')!=='athlete,foreign,reviewer'||!uuid.test(source.programId)||!uuid.test(source.enrollmentId))throw Error('Verified synthetic source required')
    const status=JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json','utf8')),dbUrl=new URL(status.DB_URL)
    if(status.API_URL!=='http://127.0.0.1:55321'||dbUrl.hostname!=='127.0.0.1'||dbUrl.port!=='55322')throw Error('Nonlocal target denied')
    const config=readFileSync('output/app-quality-release/local-supabase/supabase/config.toml','utf8')
    if(!/^project_id = "sociusfit-programming-local"\s*$/m.test(config))throw Error('Unexpected project configuration')
    if(existsSync('output/app-quality-release/local-supabase/supabase/.temp/project-ref'))throw Error('Linked project denied')
    const directory=`output/app-quality-release/supervised-races-${runId}`;mkdirSync(directory)
    const checks:Array<Record<string,unknown>>=[],journal:Array<Record<string,unknown>>=[]
    const receipt:Record<string,unknown>={runId,sourceRun,target:container,status:'running',checks,journal,programId:source.programId}
    const save=()=>writeFileSync(`${directory}/receipt.json`,JSON.stringify(receipt,null,2))
    const attempt=async<T>(name:string,payload:unknown,operation:()=>PromiseLike<T>)=>{
      const event:Record<string,unknown>={name,payload,disposition:'pending',attemptedAt:new Date().toISOString()};journal.push(event);save()
      try{const result=await operation();event.disposition='response_received';event.result=result;save();return result}catch(error){event.disposition='inspect_required';save();throw error}
    }
    const localFetch:typeof fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.origin!==status.API_URL)throw Error('Nonlocal request denied');return fetch(input,{...init,redirect:'error'})}
    const client=(service=false)=>createClient(status.API_URL,service?status.SERVICE_ROLE_KEY:status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}})
    const admin=client(true),a=new Session(),b=new Session(),observer=new Session()
    save()
    try{
      const inspection=await new Promise<string>((resolve,reject)=>{
        const p=spawn(podman,['--connection',connection,'inspect',container],{windowsHide:true,env:childEnv});let out='';p.stdout.on('data',d=>out+=d);p.stderr.resume();p.once('error',reject);p.once('exit',code=>code===0?resolve(out):reject(Error('Container readback failed')))
      })
      const inspected=JSON.parse(inspection)[0];expect(inspected.Config.Labels['com.supabase.cli.project']).toBe('sociusfit-programming-local');expect(inspected.State.Running).toBe(true)
      for(const session of [a,b,observer]){const identity=await session.json("SELECT json_build_object('pid',pg_backend_pid(),'database',current_database(),'version',current_setting('server_version_num'),'role',current_user);");expect(identity.database).toBe('postgres');expect(Math.floor(Number(identity.version)/10000)).toBe(17);expect(identity.role).toBe('postgres');session.pid=identity.pid}
      expect(new Set([a.pid,b.pid,observer.pid]).size).toBe(3);receipt.backends=[a.pid,b.pid,observer.pid];save()
      const actors=new Map<string,ReturnType<typeof client>>()
      for(const actor of ['athlete','reviewer']){
        const user=source.users.find((u:{actor:string})=>u.actor===actor);if(!user||!uuid.test(user.id))throw Error('Source actor missing')
        const identity=await admin.auth.admin.getUserById(user.id);expect(identity.data.user?.email).toBe(user.email)
        let tokenHash=''
        await attempt('issue_existing_local_login',{actor,userId:user.id},async()=>{const r=await admin.auth.admin.generateLink({type:'magiclink',email:user.email});tokenHash=r.data.properties?.hashed_token??'';return {userId:r.data.user?.id,error:r.error?{message:r.error.message}:null}})
        if(!tokenHash)throw Error('Local login not issued')
        const db=client()
        const verified=await attempt('verify_existing_local_login',{actor,userId:user.id},async()=>{const r=await db.auth.verifyOtp({type:'magiclink',token_hash:tokenHash});return {userId:r.data.user?.id,error:r.error?{message:r.error.message}:null}})
        expect(verified.error).toBeNull();expect(verified.userId).toBe(user.id);actors.set(actor,db)
      }
      const ownerId=source.users.find((u:{actor:string})=>u.actor==='athlete').id,reviewerId=source.users.find((u:{actor:string})=>u.actor==='reviewer').id
      const owner=actors.get('athlete')!,reviewer=actors.get('reviewer')!,review=createSupervisedReviewService({enabled:()=>true,createServiceClient:()=>admin})
      const active=await owner.from('training_programs').select('active_plan_version_id').eq('id',source.programId).single();expect(active.error).toBeNull()
      const base=await owner.from('training_plan_versions').select('window_start,window_end,sequence_number,intent').eq('id',active.data!.active_plan_version_id).single();expect(base.error).toBeNull()
      await observer.exec(`CREATE TEMP TABLE prior_rows(table_name text,id uuid,digest text); DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['training_programs','training_plan_versions','prescribed_sessions','workouts','coach_reviewed_set_reports'] LOOP
          EXECUTE format('INSERT INTO prior_rows SELECT %L,id,md5(to_jsonb(x)::text) FROM public.%I x',t,t);
        END LOOP; END $$;`)
      // An earlier race legitimately left a pending proposal. Keep that evidence
      // and seed one explicitly isolated transport program from the exact
      // verified accepted content, rather than deleting/rejecting prior work.
      const targetProgramId=randomUUID(),targetBaseId=randomUUID(),targetEnrollmentId=randomUUID()
      Object.assign(receipt,{sourceProgramId:source.programId,programId:targetProgramId,baseId:targetBaseId,enrollmentId:targetEnrollmentId});save()
      const provision=async(name:string,payload:unknown,call:()=>PromiseLike<{error:unknown}>)=>{const r=await attempt(name,payload,call);expect(r.error).toBeNull()}
      const program={id:targetProgramId,user_id:ownerId,title:'Isolated real supervised races',goal_summary:'Copied mechanical fixture; no athlete suitability approval',start_date:base.data!.window_start,end_date:base.data!.window_end,status:'draft',program_mode:'rolling_weekly'}
      await provision('isolated_program_seed',program,()=>admin.from('training_programs').insert(program))
      const plan={id:targetBaseId,program_id:targetProgramId,user_id:ownerId,version:1,status:'accepted',accepted_at:new Date().toISOString(),reference_version:'local-supervised-races',policy_version:'initial-dose-0.2.0',plan_mode:'rolling_weekly',window_start:base.data!.window_start,window_end:base.data!.window_end,sequence_number:base.data!.sequence_number,intent:base.data!.intent,input_snapshot:{}}
      await provision('isolated_base_seed',plan,()=>admin.from('training_plan_versions').insert(plan))
      await provision('isolated_base_activate',{programId:targetProgramId,baseId:targetBaseId},()=>admin.from('training_programs').update({status:'active',active_plan_version_id:targetBaseId}).eq('id',targetProgramId).eq('user_id',ownerId))
      const slots=base.data!.intent.reviewed_week.scheduledSessions.map((slot:any,index:number)=>({id:randomUUID(),user_id:ownerId,program_id:targetProgramId,plan_version_id:targetBaseId,week_number:1,session_index:index+1,scheduled_date:slot.scheduledDate,prescription:slot.prescription}))
      await provision('isolated_session_seed',slots,()=>admin.from('prescribed_sessions').insert(slots))
      const enrollment={p_id:targetEnrollmentId,p_program_id:targetProgramId,p_user_id:ownerId,p_reviewer_id:reviewerId,p_expected_version:0,p_enabled:true,p_expires_at:new Date(Date.now()+3600000).toISOString(),p_operations:['same_week','next_week'],p_operator_ref:`local-races:${runId}`}
      await provision('isolated_enrollment',enrollment,()=>admin.rpc('version_supervised_enrollment',enrollment))
      const anchor={p_program_id:targetProgramId,p_plan_version_id:targetBaseId,p_operator_ref:`local-races:${runId}`}
      await provision('isolated_base_anchor',anchor,()=>admin.rpc('provision_supervised_initial_base',anchor))
      for(const operation of ['submit','decide','issue'] as const){for(const order of ['saved_first','closure_first'] as const){
        const input=effortWorkInput(),recipe=input.registry[0].recipe
        // The source already has completed work. Rebuilding its current-week
        // provenance would rewrite that prescription, so use an adjacent-week
        // candidate while preserving the accepted current week and actuals.
        const draft={candidateId:randomUUID(),enrollmentId:targetEnrollmentId,programId:targetProgramId,basePlanVersionId:targetBaseId,historyDays:90,tzOffset:0,transition:'next_week' as const,
          windowStart:formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(base.data!.window_start,0))+7*86400000).toISOString(),0),sequenceNumber:base.data!.sequence_number+1,
          recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,schedules:recipe.schedules,protocols:recipe.protocols,instructions:recipe.instructions,limitations:recipe.limitations},scheduleId:input.input.context.scheduleId,rationale:'Real local race fixture only; no athlete suitability claim.'}
        const prepared=await prepareSupervisedCandidate(owner,draft)
        writeFileSync(`${directory}/${operation}-${order}-prepared.json`,JSON.stringify(prepared,null,2),{flag:'wx'})
        expect(prepared.kind).toBe('prepared_candidate');if(prepared.kind!=='prepared_candidate')throw Error('Candidate compilation unavailable')
        let writerSql=sql('submit_supervised_candidate',[draft.candidateId,targetEnrollmentId,prepared.privatePacket,prepared.reviewPacket])
        let actor=ownerId,writerRole='service_role'
        let pending:SupervisedPending={schemaVersion:1,userId:ownerId,programId:targetProgramId,operation:'submit',body:{expectedUserId:ownerId,draft}}
        if(operation!=='submit'){
          const submitted=await attempt('seed_candidate',{expectedUserId:ownerId,draft},()=>review.submit(owner,ownerId,draft));expect(submitted.kind).toBe('saved');if(submitted.kind!=='saved')throw Error('Candidate seed unavailable')
          const c=submitted.candidate,decision={expectedUserId:reviewerId,candidateId:draft.candidateId,requestId:randomUUID(),decision:'approve' as const,enrollmentId:targetEnrollmentId,contentHash:c.contentHash,sourceHash:c.sourceHash}
          if(operation==='decide'){actor=reviewerId;writerRole='authenticated';pending={schemaVersion:1,userId:actor,programId:targetProgramId,operation,body:decision};writerSql=sql('decide_supervised_candidate',[decision.candidateId,decision.requestId,decision.decision,decision.contentHash,decision.sourceHash,decision.enrollmentId])}
          else{
            const approved=await attempt('approve_candidate',decision,()=>review.decide(reviewer,decision));expect(approved.kind).toBe('decided')
            const args={p_id:draft.candidateId,p_packet:prepared.privatePacket,p_fingerprint:doseContentHash(prepared.privatePacket)}
            const registered=await attempt('register_candidate',args,()=>admin.rpc('register_reviewed_week_proposal',args));expect(registered.error).toBeNull()
            const body={expectedUserId:ownerId,programId:targetProgramId,candidateId:draft.candidateId,requestId:randomUUID()};pending={schemaVersion:1,userId:actor,programId:targetProgramId,operation,body};writerRole='authenticated';writerSql=sql('create_registered_reviewed_week_proposal',[draft.candidateId,body.requestId])
          }
        }
        const resolverSql=sql('resolve_supervised_request',[pending])
        await a.begin(actor,order==='saved_first'?writerRole:'authenticated');await b.begin(actor,order==='saved_first'?'authenticated':writerRole)
        const first=await attempt(`${operation}_${order}_first`,pending,()=>a.json(order==='saved_first'?writerSql:resolverSql))
        const competing=attempt(`${operation}_${order}_competing`,pending,()=>b.request(order==='saved_first'?resolverSql:writerSql))
        let observed:any=null,second:Result
        const blockingSubmit=operation==='submit'&&order==='closure_first'
        if(blockingSubmit){
          for(let poll=0;poll<12;poll++){
            observed=await observer.json(`SELECT json_build_object('blockers',pg_blocking_pids(${b.pid}),'waitType',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${b.pid}));`)
            if(observed.blockers.includes(a.pid)&&observed.waitType==='Lock')break
            await new Promise(resolve=>setTimeout(resolve,20))
          }
          expect(observed.blockers).toContain(a.pid);expect(observed.waitType).toBe('Lock')
        }else{
          // Five paths deliberately use try-lock/NOWAIT. An explicit55P03
          // means the competing SQL transaction aborted; it is not a lost reply.
          second=await competing;expect(second.code).toBe('55P03');await b.exec('ROLLBACK;')
          observed=await observer.json(`SELECT json_build_object('firstState',(SELECT state FROM pg_stat_activity WHERE pid=${a.pid}),
            'firstAdvisoryLocks',(SELECT count(*) FROM pg_locks WHERE pid=${a.pid} AND locktype='advisory' AND granted));`)
          expect(observed.firstState).toBe('idle in transaction');expect(observed.firstAdvisoryLocks).toBeGreaterThan(0)
        }
        await attempt(`${operation}_${order}_commit_first`,pending,()=>a.exec('COMMIT;'))
        if(blockingSubmit)second=await competing
        else{
          // Deliberate test-only same-identity retry, after confirmed SQL
          // rejection/rollback and first-winner commit. No automatic app resend.
          await b.begin(actor,order==='saved_first'?'authenticated':writerRole)
          second=await attempt(`${operation}_${order}_verified_retry`,pending,()=>b.request(order==='saved_first'?resolverSql:writerSql))
        }
        if(order==='saved_first'){expect(second!.code).toBe('00000');const result=JSON.parse(second!.lines[0]);expect(result.disposition).toBe('saved');await attempt(`${operation}_${order}_commit_competing`,pending,()=>b.exec('COMMIT;'))}
        else{expect(first.disposition).toBe('no_write');expect(second!.code).toBe('55000');await b.exec('ROLLBACK;')}
        await observer.begin(actor)
        const resolved=await observer.json(sql('get_supervised_request_resolution',[pending]))
        await observer.exec('COMMIT;');expect(resolved.disposition).toBe(order==='saved_first'?'saved':'no_write')
        if(order==='saved_first'){
          if(operation==='submit')expect(resolved.result.candidate.candidateId).toBe(first.candidateId)
          if(operation==='decide')expect(resolved.result.receipt.requestId).toBe(first.requestId)
          if(operation==='issue'){expect(resolved.result.proposalId).toBe(first.proposalId);expect(resolved.result.planVersionId).toBe(first.planVersionId)}
        }else if(operation==='issue'){
          await b.begin(actor)
          const differentKey=randomUUID()
          const lateKey=await attempt('closed_issue_different_key',{candidateId:draft.candidateId,requestId:differentKey},()=>b.request(sql('create_registered_reviewed_week_proposal',[draft.candidateId,differentKey])))
          expect(lateKey.code).toBe('55000');await b.exec('ROLLBACK;')
        }
        checks.push({operation,order,passed:true,contentionKind:blockingSubmit?'observed_wait':'busy_conflict',lockEvidence:observed,disposition:resolved.disposition,firstResult:first,finalSqlState:second!.code});save()
      }}
      await observer.exec(`DO $$ DECLARE t text; drift boolean; BEGIN FOREACH t IN ARRAY ARRAY['training_programs','training_plan_versions','prescribed_sessions','workouts','coach_reviewed_set_reports'] LOOP
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM prior_rows b LEFT JOIN public.%I x ON x.id=b.id WHERE b.table_name=%L AND (x.id IS NULL OR md5(to_jsonb(x)::text)<>b.digest))',t,t) INTO drift;
        IF drift THEN RAISE EXCEPTION 'Prior data changed in %',t; END IF; END LOOP; END $$;`)
      receipt.priorRowsPreserved=true;receipt.status='passed';receipt.finishedAt=new Date().toISOString();save()
    }catch(error){receipt.status='failed';receipt.failure=error instanceof Error?error.message:'Unknown local race failure';save();throw error}
    finally{await Promise.allSettled([a.close(),b.close(),observer.close()])}
  },60000)
})
