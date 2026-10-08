/** Opt-in retained-local qualification. Preserve every intended request before
 * sending it. An existing or failed run cannot be silently reseeded/resumed. */
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe,it } from 'vitest'
import { createClient,type SupabaseClient } from '@supabase/supabase-js'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../../test/fixtures/reviewed-effort-work'
import { reviewedSetReport } from '../../test/fixtures/reviewed-set-report'
import { reviewedCompletion } from '../../test/fixtures/reviewed-completion'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { resolveSupervisedRequest } from '@/app/lib/coach/supervised-request-resolution-server'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'
import type { SupervisedCandidateDraft } from '@/app/lib/coach/supervised-candidate-draft'
import type { SupervisedPending } from '@/app/lib/coach/supervised-pending'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

describe.skipIf(process.env.SOCIUS_LOCAL_SUPERVISED_TEST!=='true')('retained Auth/PostgREST supervised qualification',()=>{
  it('preserves separate approval/acceptance and two logged/corrected week transitions',async()=>{
    const runId=process.env.SOCIUS_LOCAL_SUPERVISED_RUN
    if (!runId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId)) throw Error('Explicit qualification UUID required')
    const status=JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json','utf8'))
    const dbUrl=new URL(status.DB_URL)
    if(status.API_URL!=='http://127.0.0.1:55321'||dbUrl.hostname!=='127.0.0.1'||dbUrl.port!=='55322') throw Error('Nonlocal target denied')
    const directory=`output/app-quality-release/supervised-auth-${runId}`
    mkdirSync(directory) // No recursive/reuse: uncertain runs require inspection.
    const users=['athlete','reviewer','foreign'].map(actor=>({actor,id:randomUUID(),email:`supervised-${runId}-${actor}@sociusfit-local.invalid`}))
    const programId=randomUUID(),baseId=randomUUID(),enrollmentId=randomUUID(),base=reviewedRollingWeek()
    const checks:string[]=[],journal:Array<Record<string,unknown>>=[],cycles:Array<Record<string,unknown>>=[]
    const receipt:Record<string,unknown>={runId,target:status.API_URL,status:'running',users,programId,baseId,enrollmentId,checks,journal,cycles,
      purpose:'Mechanical local transport qualification; no athlete suitability or browser proof'}
    const save=()=>writeFileSync(`${directory}/receipt.json`,JSON.stringify(receipt,null,2))
    const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);save()}
    const attempt=async<T>(name:string,payload:unknown,call:()=>PromiseLike<T>):Promise<T>=>{
      const event:Record<string,unknown>={name,payload,disposition:'pending',attemptedAt:new Date().toISOString()};journal.push(event);save()
      try {const result=await call();event.disposition='response_received';event.result=result;save();return result}
      catch(error){event.disposition='inspect_required';save();throw error}
    }
    const localFetch:typeof fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
      if(url.origin!==status.API_URL)throw Error('Nonlocal request denied')
      return fetch(input,{...init,redirect:'error'})
    }
    const client=(service=false)=>createClient(status.API_URL,service?status.SERVICE_ROLE_KEY:status.ANON_KEY,
      {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}})
    const service=client(true),actors=new Map<string,SupabaseClient>()
    const write=async(name:string,payload:unknown,call:()=>PromiseLike<{data:unknown;error:{code?:string;message:string}|null}>)=>{
      const result=await attempt(name,payload,call);check(!result.error,`${name} succeeds (${result.error?.code??'ok'})`);return result.data
    }
    const rpc=(db:SupabaseClient,name:string,args:Record<string,unknown>)=>write(name,args,()=>db.rpc(name,args))
    save()
    try {
      for(const user of users){
        const password=randomUUID()+randomUUID()
        const made=await attempt('create_local_identity',user,async()=>{
          const r=await service.auth.admin.createUser({id:user.id,email:user.email,password,email_confirm:true})
          return {id:r.data.user?.id,error:r.error?{code:r.error.code,message:r.error.message}:null}
        })
        check(!made.error&&made.id===user.id,`${user.actor} identity confirmed`)
        const db=client(),auth=await db.auth.signInWithPassword({email:user.email,password})
        check(!auth.error&&auth.data.user?.id===user.id,`${user.actor} authenticated`);actors.set(user.actor,db)
      }
      const owner=actors.get('athlete')!,reviewer=actors.get('reviewer')!,foreign=actors.get('foreign')!,userId=users[0].id
      const profile={user_id:userId,fitness_goals:['performance'],body_metrics:{age:35,height_cm:175,weight_kg:75},preferences:{units:'imperial',notifications:false,privacy_level:'private'}}
      await write('profile_seed',profile,()=>owner.from('user_profiles').insert(profile))
      await rpc(owner,'get_coach_context_revision',{})
      const program={id:programId,user_id:userId,title:'Synthetic supervised qualification',goal_summary:'Mechanical test only',start_date:base.plan.windowStart,end_date:base.plan.windowEnd,status:'draft',program_mode:'rolling_weekly'}
      await write('program_seed',program,()=>service.from('training_programs').insert(program))
      const plan={id:baseId,program_id:programId,user_id:userId,version:1,status:'accepted',accepted_at:new Date().toISOString(),reference_version:'local-supervised-test',policy_version:'initial-dose-0.2.0',plan_mode:'rolling_weekly',window_start:base.plan.windowStart,window_end:base.plan.windowEnd,sequence_number:1,intent:base.intent,input_snapshot:{}}
      await write('base_seed',plan,()=>service.from('training_plan_versions').insert(plan))
      await write('base_activate',{programId,baseId},()=>service.from('training_programs').update({status:'active',active_plan_version_id:baseId}).eq('id',programId).eq('user_id',userId))
      const sessions=base.plan.scheduledSessions.map((slot,index)=>({id:randomUUID(),user_id:userId,program_id:programId,plan_version_id:baseId,week_number:1,session_index:index+1,scheduled_date:slot.scheduledDate,prescription:slot.prescription}))
      await write('sessions_seed',sessions,()=>service.from('prescribed_sessions').insert(sessions))
      const expiresAt=new Date(Date.now()+24*3600000).toISOString()
      await rpc(service,'version_supervised_enrollment',{p_id:enrollmentId,p_program_id:programId,p_user_id:userId,p_reviewer_id:users[1].id,p_expected_version:0,p_enabled:true,p_expires_at:expiresAt,p_operations:['same_week','next_week'],p_operator_ref:`local-qualification:${runId}`})
      await rpc(service,'provision_supervised_initial_base',{p_program_id:programId,p_plan_version_id:baseId,p_operator_ref:`local-qualification:${runId}`})
      let enabled=true
      const options={enabled:()=>enabled,createServiceClient:()=>service},review=createSupervisedReviewService(options),issue=createSupervisedWeekIssuer({...options,review})
      let active:string=baseId
      for(let index=0;index<2;index++){
        const input=effortWorkInput(),recipe=input.registry[0].recipe,candidateId=randomUUID()
        const draft:SupervisedCandidateDraft={candidateId,enrollmentId,programId,basePlanVersionId:active,historyDays:90,tzOffset:0,transition:index?'next_week':'same_week',windowStart:index?'2026-08-10':base.plan.windowStart,sequenceNumber:index+1,
          recipe:{sessions:recipe.sessions,baseSchedule:recipe.baseSchedule,schedules:recipe.schedules,protocols:recipe.protocols,instructions:recipe.instructions,limitations:recipe.limitations},scheduleId:input.input.context.scheduleId,rationale:'Mechanical authenticated qualification; no athlete suitability claim.'}
        const cycle:Record<string,unknown>={index,draft};cycles.push(cycle);save()
        const submitted=await attempt('submit_candidate',{expectedUserId:userId,draft},()=>review.submit(owner,userId,draft));check(submitted.kind==='saved','Owned exact candidate submitted')
        if(submitted.kind!=='saved')throw Error(submitted.kind)
        const c=submitted.candidate;cycle.candidate=c;save()
        check((await review.read(foreign,candidateId)).kind==='not_found','Foreign candidate hidden')
        const decision={expectedUserId:users[1].id,candidateId,requestId:randomUUID(),decision:'approve' as const,enrollmentId,contentHash:c.contentHash,sourceHash:c.sourceHash}
        const foreignDecision={...decision,expectedUserId:users[2].id,requestId:randomUUID()}
        const denied=await attempt('foreign_decision_denial',foreignDecision,()=>foreign.rpc('decide_supervised_candidate',{
          p_id:candidateId,p_request_id:foreignDecision.requestId,p_decision:'approve',p_content_hash:c.contentHash,p_source_hash:c.sourceHash,p_enrollment_id:enrollmentId}))
        check(denied.error?.code==='P0002','Foreign review decision denied by database authorization')
        const absent=await reviewer.rpc('get_supervised_decision_receipt',{p_request_id:foreignDecision.requestId})
        check(!absent.error&&absent.data===null,'Foreign denied request produced no decision receipt')
        const decided=await attempt('approve_exact_candidate',decision,()=>review.decide(reviewer,decision));check(decided.kind==='decided','Designated reviewer approves exact content')
        const before=await owner.from('training_programs').select('active_plan_version_id').eq('id',programId).single();check(before.data?.active_plan_version_id===active,'Coach approval does not activate athlete plan')
        const request={expectedUserId:userId,programId,candidateId,requestId:randomUUID()}
        const issued=await attempt('issue_proposal',request,()=>issue(owner,request));check(issued.kind==='issued','Approved proposal issued')
        if(issued.kind!=='issued')throw Error(issued.kind)
        cycle.issued=issued;cycle.decision=decision;save()
        await rpc(owner,'accept_adaptation_proposal',{p_proposal_id:issued.proposalId,p_idempotency_key:request.requestId});active=issued.planVersionId
        const effective=await owner.from('coach_effective_prescribed_sessions').select('id,scheduled_date').eq('plan_version_id',active).order('session_index');check(!effective.error&&effective.data?.length,'Accepted effective sessions readable')
        const session=effective.data![0],first={...reviewedSetReport('required-work'),schemaVersion:2 as const,performedAt:`${session.scheduled_date}T17:00:00Z`,repetitions:24,rir:2.5,load:null}
        const record=async(report:unknown)=>{const r=await rpc(owner,'record_reviewed_session_set',{p_session_id:session.id,p_request_id:randomUUID(),p_report:report}) as Array<{id:string}>;return r[0].id}
        await record(first)
        const corrected=await record({...first,revision:2,rir:1.5})
        const omitted=await record({...first,activityId:'optional-work',side:'left',status:'not_performed',repetitions:null,rir:null,rpe:null,restAfterSeconds:null})
        const state=await fetchReviewedSessionState(owner,userId,session.id)
        check(state?.reports.length===3&&state.reports.some(r=>r.report.rir===1.5&&r.report.rpe?.value===7)&&state.reports.some(r=>r.report.status==='not_performed'&&r.report.rir===null),'Corrected RIR, unchanged RPE and unknown omitted actuals retained')
        const completion={...reviewedCompletion([corrected,omitted]),occurredAt:`${session.scheduled_date}T18:00:00Z`,workoutDate:session.scheduled_date,tzOffset:0}
        const completed=await rpc(owner,'complete_reviewed_session',{p_session_id:session.id,p_request_id:randomUUID(),p_request:completion});cycle.completed=completed;cycle.sessionId=session.id;save()
        const pending:SupervisedPending={schemaVersion:1,userId,programId,operation:'issue',body:request}
        enabled=false
        const disabledRecovery=await attempt('disabled_issue_recovery',request,()=>issue(owner,request))
        check(disabledRecovery.kind==='recovered','Disabled issuer recovers existing proposal')
        const recovered=await resolveSupervisedRequest(owner,pending,false);check(recovered.kind==='resolved'&&recovered.resolution.disposition==='saved','Exact saved issue receipt readable');enabled=true
        check((await foreign.from('coach_reviewed_set_reports').select('id').eq('prescribed_session_id',session.id)).data?.length===0,'Foreign actual reports hidden by RLS')
        if(index){check(c.reviewPacket.evidence.some(row=>{
          const evidence=JSON.parse(row.summary)
          return evidence.setEvidence?.rir===1.5&&evidence.setEvidence?.revision===2
        }),'Next-week review includes the prior corrected RIR report')}
      }
      const untouched=await owner.from('training_plan_versions').select('intent').eq('id',baseId).single();check(doseContentHash(untouched.data?.intent)===doseContentHash(base.intent),'Original accepted base content preserved')
      check((await owner.from('workouts').select('id',{count:'exact'}).eq('user_id',userId)).count===2,'Exactly two owner workouts created')
      receipt.status='passed';receipt.finishedAt=new Date().toISOString();save()
      console.log(JSON.stringify({runId,status:receipt.status,checks:checks.length,receipt:`${directory}/receipt.json`}))
    }catch(error){receipt.status='failed';receipt.failure=error instanceof Error?error.message:'Unknown failure';save();throw error}
  },60000)
})
