/** Fixed synthetic-local runtime boundary; it grants no execution authority. */
export const firstReviewLocalTarget = Object.freeze({
  api: 'http://127.0.0.1:55321', origin: 'http://127.0.0.1:3014',
  machine: 'sociusfit-local', container: 'supabase_db_sociusfit-programming-local',
  programId: '0fba21db-85dd-41dd-bdf6-b601b11bbeb6',
  baseId: 'faf607da-40a6-4d6a-921d-2c21603c9288',
  ownerId: '9398e7b9-5e88-48e6-a308-3ea3b56b14bd',
  reviewerId: 'a230bf32-14ea-4eb9-8b89-4a3ef7514ef0',
  foreignId: 'f0fed184-82b3-48c8-a50e-6025cf83a69e', targetWindowStart: '2026-10-05',
})
export const firstReviewLocalSources = Object.freeze([
  {path:'output/app-quality-release/reviewed-dose-7af8657d-70d7-4ef7-be95-969b45651c59/receipt.json',
    sha256:'4aa3a139173fd363690cb0a84549ec177de290660d7b79fe8a02dbd8de4427c9'},
  {path:'output/app-quality-release/supervised-auth-f0d5bb72-36aa-49d6-8d7c-5a8214e6176d/receipt.json',
    sha256:'c7f96cfff180aa45b556d1f6e8188170d3cd65835c964abc4130c18fad0ec96b'},
])
export const firstReviewRenewalSource = Object.freeze({
  designationId:'7ec93f5b-c081-4259-a052-b03ceac93139',version:1,
})
export const firstReviewLocalObservation = Object.freeze({
  path:'output/project-board/first-reviewed-runtime-eligibility-post-repair-3825443c.json',
  sha256:'019a1f3eb91c9a6417661137f0a39a5ce6679747f1fac3889df344e401d50825',
})
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const object = v => !!v && typeof v === 'object' && !Array.isArray(v)
const prefix = '/api/coach/first-reviewed'
export function firstReviewFixedFixture(sources, runId, designationId, designationVersion=1) {
  if (!uuid(runId) || !uuid(designationId) || !Array.isArray(sources) || sources.length !== 2
    || ![1,2].includes(designationVersion) || designationId===firstReviewRenewalSource.designationId) throw Error('Exact fixture sources required')
  const [base, identities] = sources, t = firstReviewLocalTarget
  if (base.status !== 'passed' || identities.status !== 'passed' || base.target !== t.api || identities.target !== t.api
    || base.runId !== '7af8657d-70d7-4ef7-be95-969b45651c59' || identities.runId !== 'f0d5bb72-36aa-49d6-8d7c-5a8214e6176d'
    || base.programId !== t.programId || base.planId !== t.baseId || base.syntheticUserIds?.[0] !== t.ownerId
    || !identities.journal?.every(e => e.disposition === 'response_received')) throw Error('Qualified fixed sources changed')
  const reviewSource = identities.users?.find(u => u.actor === 'athlete'), foreign = identities.users?.find(u => u.actor === 'foreign')
  if (reviewSource?.id !== t.reviewerId || foreign?.id !== t.foreignId
    || [reviewSource, foreign].some(u => typeof u.email !== 'string' || !u.email.endsWith('@sociusfit-local.invalid'))) throw Error('Fixed synthetic identities required')
  return {schemaVersion:1,runId,designationId,designationVersion,...t,
    ...(designationVersion===2?{expectedDesignationVersion:1,previousDesignationId:firstReviewRenewalSource.designationId}:{}),
    users:[{actor:'athlete',id:t.ownerId,email:`reviewed-dose-${base.runId}-0@sociusfit-local.invalid`},
      {actor:'reviewer',id:reviewSource.id,email:reviewSource.email},{actor:'foreign',id:foreign.id,email:foreign.email}]}
}
/** Read-only operator metadata; no Auth issuance or designation grant. */
export function firstReviewIdentitySql() {
  const t=firstReviewLocalTarget
  return `BEGIN READ ONLY; SELECT jsonb_build_object('capturedAt',clock_timestamp(),
'program',(SELECT jsonb_build_object('programId',p.id,'ownerId',p.user_id,'baseId',v.id,'windowStart',v.window_start,'sequenceNumber',v.sequence_number,'legacy',v.intent->>'format'='rolling_weekly_intent_v0_1','accepted',v.status='accepted','active',p.status='active','oneOwnedActive',(SELECT count(*)=1 FROM public.training_programs x WHERE x.user_id=p.user_id AND x.status='active'),'unanchored',NOT EXISTS(SELECT 1 FROM public.coach_supervised_programs x WHERE x.program_id=p.id),'unenrolled',NOT EXISTS(SELECT 1 FROM public.coach_supervised_enrollments x WHERE x.program_id=p.id)) FROM public.training_programs p JOIN public.training_plan_versions v ON v.id=p.active_plan_version_id WHERE p.id='${t.programId}'),
'identities',(SELECT jsonb_agg(jsonb_build_object('id',u.id,'synthetic',u.email LIKE '%@sociusfit-local.invalid','profileExists',EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=u.id),'whoopCount',(SELECT count(*) FROM public.whoop_tokens w WHERE w.user_id=u.id))) FROM auth.users u WHERE u.id IN ('${t.ownerId}','${t.reviewerId}','${t.foreignId}')),
'designationCount',(SELECT count(*) FROM public.coach_first_review_designations WHERE program_id='${t.programId}'),
'latestDesignation',(SELECT public.first_review_designation_json(id) FROM public.coach_first_review_designations WHERE program_id='${t.programId}' ORDER BY version DESC LIMIT 1),
'bridgeInstalled',to_regclass('public.coach_first_review_setup_requests') IS NOT NULL); ROLLBACK;`
}
/** Only the retained immutable v1 can be the starting point of this prepared v2. */
export function firstReviewRenewalObservation(observed) {
  const d=observed?.latestDesignation,t=firstReviewLocalTarget,r=firstReviewRenewalSource
  return !!(firstReviewEligibleObservation(observed)&&observed.bridgeInstalled===true&&observed.designationCount===1
    &&d?.designationId===r.designationId&&d.version===r.version&&d.programId===t.programId&&d.userId===t.ownerId
    &&d.basePlanVersionId===t.baseId&&d.reviewerId===t.reviewerId&&d.targetWindowStart===t.targetWindowStart
    &&d.enabled===true&&typeof d.expiresAt==='string'&&Number.isFinite(Date.parse(d.expiresAt)))
}
export function firstReviewEligibleObservation(observed) {
  const t=firstReviewLocalTarget,p=observed?.program,m=observed?.executionManifest
  return !!(p && p.programId===t.programId && p.ownerId===t.ownerId && p.baseId===t.baseId
    && p.windowStart==='2026-09-21' && p.sequenceNumber===1 && p.active && p.accepted && p.legacy
    && p.oneOwnedActive && p.unanchored && p.unenrolled && m?.exact===true
    && Number.isSafeInteger(m.expectedSessions) && m.expectedSessions>=1 && m.expectedSessions<=14
    && m.rawSessions===m.expectedSessions && m.effectiveSessions===m.expectedSessions
    && Array.isArray(observed.identities) && observed.identities.length===3
    && [t.ownerId,t.reviewerId,t.foreignId].every(id=>observed.identities.some(u=>u.id===id&&u.synthetic&&u.profileExists&&u.whoopCount===0)))
}
/** Pure SELECT, evaluated under the existing owner's RLS before designation/start. */
/** @param {{ownerId:string,programId:string,baseId:string}} [target] */
export function firstReviewExecutionManifestSql(target=firstReviewLocalTarget) {
  if (![target.ownerId,target.programId,target.baseId].every(uuid)) throw Error('Exact manifest identities required')
  return `BEGIN READ ONLY; SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='${target.ownerId}';
WITH base AS (SELECT intent FROM public.training_plan_versions WHERE id='${target.baseId}' AND user_id='${target.ownerId}' AND program_id='${target.programId}' AND status='accepted' AND intent->>'format'='rolling_weekly_intent_v0_1'),
expected AS (SELECT e.value,e.ordinality FROM base CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(intent#>'{weekly_plan,scheduledSessions}')='array' THEN intent#>'{weekly_plan,scheduledSessions}' ELSE '[]'::jsonb END) WITH ORDINALITY e),
raw AS (SELECT * FROM public.prescribed_sessions WHERE user_id='${target.ownerId}' AND program_id='${target.programId}' AND plan_version_id='${target.baseId}'),
effective AS (SELECT * FROM public.coach_effective_prescribed_sessions WHERE user_id='${target.ownerId}' AND program_id='${target.programId}' AND plan_version_id='${target.baseId}'),
matched AS (SELECT s.id FROM expected e JOIN effective s ON s.session_index=e.ordinality WHERE s.week_number=1
AND s.scheduled_date::text=e.value->>'scheduledDate' AND s.prescription=e.value->'prescription' AND jsonb_typeof(e.value->'prescription')='object'
AND s.execution_plan_version_id IS NOT NULL AND s.status IN ('planned','completed','skipped') AND s.has_reports IS NOT NULL
AND (s.status<>'planned' OR (s.completed_workout_id IS NULL AND s.completion_contract_version IS NULL)))
SELECT jsonb_build_object('expectedSessions',(SELECT count(*) FROM expected),'rawSessions',(SELECT count(*) FROM raw),'effectiveSessions',(SELECT count(*) FROM effective),
'exact',(SELECT count(*) FROM base)=1 AND (SELECT count(*) FROM expected) BETWEEN 1 AND 14
AND (SELECT count(*) FROM raw)=(SELECT count(*) FROM expected) AND (SELECT count(*) FROM effective)=(SELECT count(*) FROM expected)
AND (SELECT count(DISTINCT id) FROM matched)=(SELECT count(*) FROM expected)); ROLLBACK;`
}
/** Exact stage parser remains in the real route. This outer boundary limits IDs/target. */
export function firstReviewBoundBody(fixture, pathname, body) {
  const users=fixture.users.map(u=>u.id),t=firstReviewLocalTarget
  if (!object(body)) return null
  if ([`${prefix}/setup`,`${prefix}/setup/resolution`,`${prefix}/setup/resolve`].includes(pathname)) {
    if (body.schemaVersion!==1 || !users.includes(body.expectedUserId) || body.programId!==t.programId || body.basePlanVersionId!==t.baseId
      || body.designationId!==fixture.designationId || body.designationVersion!==fixture.designationVersion || !uuid(body.requestId)) return null
    return {key:`setup:${body.expectedUserId}:${body.requestId}`,mutation:pathname===`${prefix}/setup`,closure:pathname===`${prefix}/setup/resolve`}
  }
  if (pathname===`${prefix}/preview`) {
    const d=body.draft
    return users.includes(body.expectedUserId)&&validDraft(d,fixture)?{key:`preview:${d.candidateId}`,mutation:false,closure:false}:null
  }
  if (![prefix,`${prefix}/resolution`,`${prefix}/resolve`].includes(pathname) || body.schemaVersion!==1
    || !users.includes(body.userId) || body.programId!==t.programId || !object(body.body) || body.body.expectedUserId!==body.userId) return null
  const b=body.body,op=body.operation
  let id
  if (op==='prepare_profile') {
    const q=b.request
    if (!object(q)||q.programId!==t.programId||q.basePlanVersionId!==t.baseId||q.designationId!==fixture.designationId
      ||q.windowStart!==t.targetWindowStart||!object(q.targetSetup)||q.targetSetup.startDate!==t.targetWindowStart||!uuid(q.snapshotId)) return null
    id=q.snapshotId
  } else if (op==='confirm_profile') { if (!uuid(b.snapshotId)||!uuid(b.requestId)) return null; id=b.requestId }
  else if (op==='submit') { if(!validDraft(b.draft,fixture))return null; id=b.draft.candidateId }
  else if (op==='decide') { if(b.designationId!==fixture.designationId||!uuid(b.candidateId)||!uuid(b.requestId))return null; id=b.requestId }
  else if (op==='issue'||op==='accept') {
    if(b.programId!==t.programId||!uuid(b.candidateId)||!uuid(b.requestId))return null
    if(op==='accept'&&(!uuid(b.proposalId)||!uuid(b.planVersionId)))return null
    id=b.requestId
  } else return null
  return {key:`${op}:${body.userId}:${id}`,mutation:pathname===prefix,closure:pathname===`${prefix}/resolve`}
}
function validDraft(d,f) {
  const t=firstReviewLocalTarget
  return object(d)&&uuid(d.candidateId)&&d.programId===t.programId&&d.basePlanVersionId===t.baseId
    &&d.designationId===f.designationId&&d.windowStart===t.targetWindowStart&&d.sequenceNumber===2
    &&uuid(d.profileSnapshotId)&&uuid(d.profileConfirmationRequestId)&&object(d.confirmedTargetProfile)
    &&d.confirmedTargetProfile.startDate===t.targetWindowStart
}
export function firstReviewReadPath(pathname, knownIds=[]) {
  const t=firstReviewLocalTarget
  return pathname===`${prefix}/programs` || pathname===`${prefix}/programs/${t.programId}`
    || ['profiles','setup','setup-editor'].some(s=>pathname===`${prefix}/programs/${t.programId}/${s}`)
    || ['profiles','candidates'].some(kind=>knownIds.some(id=>uuid(id)&&pathname===`${prefix}/${kind}/${id}`))
}
/** Database readback, not a submitted UUID, admits candidate/profile GETs. */
export function firstReviewResourceSql(fixture, pathname) {
  const match=/^\/api\/coach\/first-reviewed\/(profiles|candidates)\/([a-f0-9-]+)$/.exec(pathname)
  if(!match||!uuid(match[2])||!uuid(fixture.designationId))return null
  const table=match[1]==='profiles'?'coach_first_review_profile_snapshots':'coach_first_review_candidates',t=firstReviewLocalTarget
  return `BEGIN READ ONLY; SELECT to_jsonb(EXISTS(SELECT 1 FROM public.${table} WHERE id='${match[2]}' AND user_id='${t.ownerId}' AND program_id='${t.programId}' AND base_plan_version_id='${t.baseId}' AND designation_id='${fixture.designationId}')); ROLLBACK;`
}
/** Every admitted operation releases even if parsing or evidence saving fails. */
export async function firstReviewAdmitted(drain, action) {
  const release=drain.admit()
  if(!release)return false
  try{await action();return true}finally{release()}
}
/** One bounded transport fault; never repeats or changes the application write. */
export class FirstReviewResponseLoss {
  constructor(runId){if(!uuid(runId))throw Error('Exact run required');this.runId=runId;this.requestId=null;this.armedOnce=false}
  arm(body){
    if(this.armedOnce||!object(body)||Object.keys(body).sort().join(',')!=='operation,programId,requestId,runId'
      ||body.operation!=='lose_acceptance_response'||body.runId!==this.runId||body.programId!==firstReviewLocalTarget.programId||!uuid(body.requestId))return false
    this.armedOnce=true;this.requestId=body.requestId;return true
  }
  take(pathname,body){
    if(pathname!==prefix||!this.requestId||body?.operation!=='accept'||body.userId!==firstReviewLocalTarget.ownerId
      ||body.body?.expectedUserId!==firstReviewLocalTarget.ownerId||body.body?.requestId!==this.requestId)return false
    this.requestId=null;return true
  }
}
/** The real route must finish first. Suppress only its successful response. */
export function firstReviewSuppressResponse(response, shouldLose, capture) {
  const write=response.write.bind(response),end=response.end.bind(response)
  let lost=false
  response.write=function(chunk,...args){
    if(chunk)capture(chunk)
    if(shouldLose()&&response.statusCode===200){const callback=args.find(v=>typeof v==='function');if(callback)callback();return true}
    return write(chunk,...args)
  }
  response.end=function(chunk,...args){
    if(chunk)capture(chunk)
    if(shouldLose()&&response.statusCode===200){lost=true;response.destroy();return response}
    return end(chunk,...args)
  }
  return ()=>lost
}
/** Allow only the expected existing-row changes; preserve all other old content. */
export function firstReviewSnapshotSql(tables, memoryIds=[]) {
  const t=firstReviewLocalTarget
  if(!Array.isArray(tables)||!tables.length||new Set(tables).size!==tables.length
    ||!tables.every(n=>typeof n==='string'&&/^[a-z_][a-z0-9_]*$/.test(n)&&n!=='auth_identity')
    ||!Array.isArray(memoryIds)||!memoryIds.every(uuid))throw Error('Invalid fixed snapshot identifiers')
  const queries=tables.map(table=>{
    let value='to_jsonb(t)'
    if(table==='training_programs')value=`CASE WHEN t.id='${t.programId}' THEN to_jsonb(t)-'active_plan_version_id'-'updated_at'-'start_date'-'end_date'-'title'-'goal_summary'-'goal_target_date'-'direction' ELSE to_jsonb(t) END`
    if(table==='training_plan_versions')value=`CASE WHEN t.id='${t.baseId}' THEN to_jsonb(t)-'status' ELSE to_jsonb(t) END`
    if(table==='coach_memories'&&memoryIds.length)value=`CASE WHEN t.id IN (${memoryIds.map(id=>`'${id}'`).join(',')}) THEN to_jsonb(t)-'status'-'effective_until'-'last_reviewed_at'-'review_after'-'updated_at' ELSE to_jsonb(t) END`
    if(table==='coach_context_revisions')value=`CASE WHEN t.user_id='${t.ownerId}' THEN to_jsonb(t)-'revision'-'updated_at' ELSE to_jsonb(t) END`
    if(table==='recommendation_refresh_state')value=`CASE WHEN t.user_id='${t.ownerId}' THEN to_jsonb(t)-'source_revision'-'updated_at' ELSE to_jsonb(t) END`
    return `SELECT '${table}' table_name,coalesce(jsonb_object_agg(h,nb),'{}'::jsonb) rows FROM (SELECT md5((${value})::text) h,count(*) nb FROM public."${table}" t GROUP BY 1) d`
  })
  queries.push("SELECT 'auth_identity',coalesce(jsonb_object_agg(h,nb),'{}'::jsonb) FROM (SELECT md5(jsonb_build_object('id',id,'email',email,'deleted_at',deleted_at)::text) h,count(*) nb FROM auth.users GROUP BY 1) d")
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='1s'; SELECT jsonb_object_agg(table_name,rows) FROM (${queries.join(' UNION ALL ')}) snapshots; ROLLBACK;`
}
export function firstReviewPreservesRows(before,after) {
  return object(before)&&object(after)&&JSON.stringify(Object.keys(before).sort())===JSON.stringify(Object.keys(after).sort())
    &&Object.entries(before).every(([table,rows])=>object(rows)&&object(after[table])
      &&Object.entries(rows).every(([hash,count])=>Number.isSafeInteger(count)&&count>0
        &&Number.isSafeInteger(after[table][hash])&&after[table][hash]>=count))
}
/** No Auth/other-table additions. Extra hashes must be explicitly fixture scoped. */
export function firstReviewIsolationPreserved(before,after,allowed) {
  return firstReviewPreservesRows(before,after)&&object(allowed)
    &&Object.entries(after).every(([table,rows])=>Object.entries(rows).every(([hash,count])=>
      Number.isSafeInteger(count)&&count>0&&(count-(before[table][hash]??0)<=0
        ||(Number.isSafeInteger(allowed[table]?.[hash])&&allowed[table][hash]>=count-(before[table][hash]??0)))))
}
/** Only additive tables used by this onboarding flow, constrained to its owner/program. */
export function firstReviewAllowedAdditionsSql(tables,fixture) {
  // Reuse strict identifier validation; no caller-controlled SQL identifiers.
  firstReviewSnapshotSql(tables)
  if(!uuid(fixture.designationId))throw Error('Exact designation required')
  const t=firstReviewLocalTarget,owner=`r->>'user_id'='${t.ownerId}'`,program=`r->>'program_id'='${t.programId}'`
  const owned=`${owner} AND ${program}`,designation=`r->>'designation_id'='${fixture.designationId}'`
  const profile=`r->>'snapshot_id' IN (SELECT id::text FROM public.coach_first_review_profile_snapshots WHERE user_id='${t.ownerId}' AND program_id='${t.programId}' AND designation_id='${fixture.designationId}')`
  const candidate=`r->>'candidate_id' IN (SELECT id::text FROM public.coach_first_review_candidates WHERE user_id='${t.ownerId}' AND program_id='${t.programId}' AND designation_id='${fixture.designationId}')`
  const plan=`r->>'plan_version_id' IN (SELECT plan_version_id::text FROM public.coach_reviewed_proposal_registrations WHERE id IN (SELECT id FROM public.coach_first_review_candidates WHERE program_id='${t.programId}' AND designation_id='${fixture.designationId}'))`
  const memoryKey="r->>'memory_key' IN ('primary_goal','training_schedule','available_equipment','training_constraints')"
  const conditions={
    coach_first_review_profile_snapshots:`${owned} AND ${designation}`,
    coach_first_review_profile_confirmations:`${owner} AND ${profile}`,
    coach_first_review_candidates:`${owned} AND ${designation}`,
    coach_first_review_decisions:`r->>'reviewer_id'='${t.reviewerId}' AND ${designation} AND ${candidate}`,
    coach_first_review_setup_requests:`${owned} AND r#>>'{request,designationId}'='${fixture.designationId}'`,
    coach_first_review_request_resolutions:`${program} AND r->>'actor_id' IN ('${t.ownerId}','${t.reviewerId}','${t.foreignId}')`,
    coach_first_review_acceptances:`${owned} AND r->>'base_plan_version_id'='${t.baseId}' AND ${plan}`,
    coach_supervised_programs:owned,coach_supervised_initial_bases:`${owned} AND ${plan}`,
    training_plan_versions:`${owned} AND r->>'window_start'='${t.targetWindowStart}' AND r->>'sequence_number'='2'`,
    prescribed_sessions:`${owned} AND ${plan}`,coach_reviewed_execution_slots:`${owned} AND ${plan}`,
    adaptation_proposals:`${owned} AND r->>'base_plan_version_id'='${t.baseId}'`,
    coach_reviewed_proposal_registrations:`${owner} AND r->>'id' IN (SELECT id::text FROM public.coach_first_review_candidates WHERE program_id='${t.programId}' AND designation_id='${fixture.designationId}')`,
    coach_memories:`${owner} AND ${memoryKey} AND r->>'status'='confirmed' AND r->>'id' IN (SELECT m.value->>'memoryId' FROM public.coach_first_review_setup_requests s CROSS JOIN LATERAL jsonb_each(s.receipt->'memories') m WHERE s.user_id='${t.ownerId}' AND s.program_id='${t.programId}' AND s.request->>'designationId'='${fixture.designationId}')`,
    coach_memory_review_events:`${owner} AND r->>'idempotency_key' LIKE 'first-review-setup:%'`,
    coach_context_revisions:owner,
    recommendation_refresh_state:`${owner} AND r->>'response_revision'='0' AND r->>'nutrition_revision'='0' AND r->>'processed_source_revision'='-1' AND r->>'processed_response_revision'='-1' AND r->>'lease_token' IS NULL AND r->>'lease_expires_at' IS NULL AND r->>'claim_context' IS NULL AND r->>'processed_context' IS NULL AND r->>'current_recommendation_id' IS NULL AND r->>'next_due_at' IS NULL AND r->>'last_error' IS NULL`,
  }
  const parts=tables.map(name=>`SELECT '${name}' table_name,coalesce(jsonb_object_agg(h,nb),'{}'::jsonb) rows FROM (SELECT md5((${name==='coach_context_revisions'?"r-'revision'-'updated_at'":name==='recommendation_refresh_state'?"r-'source_revision'-'updated_at'":'r'})::text) h,count(*) nb FROM (SELECT to_jsonb(t) r FROM public."${name}" t) x WHERE ${conditions[name]??'false'} GROUP BY 1) d`)
  parts.push("SELECT 'auth_identity','{}'::jsonb")
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT jsonb_object_agg(table_name,rows) FROM (${parts.join(' UNION ALL ')}) allowed; ROLLBACK;`
}
/** Independently validate every normalized mutation, including monotonic revisions. */
export function firstReviewMutableSql(fixture,memoryIds=[]) {
  firstReviewSnapshotSql(['coach_memories'],memoryIds)
  if(!uuid(fixture.designationId))throw Error('Exact designation required')
  const t=firstReviewLocalTarget,ids=memoryIds.length?memoryIds.map(id=>`'${id}'::uuid`).join(','):'NULL::uuid'
  return `BEGIN READ ONLY; SELECT jsonb_build_object(
    'programUpdatedAt',(SELECT updated_at FROM public.training_programs WHERE id='${t.programId}' AND user_id='${t.ownerId}'),
    'capturedAt',clock_timestamp(),
    'contextRevision',coalesce((SELECT revision FROM public.coach_context_revisions WHERE user_id='${t.ownerId}'),0),
    'recommendationRevision',coalesce((SELECT source_revision FROM public.recommendation_refresh_state WHERE user_id='${t.ownerId}'),0),
    'memoriesValid',NOT EXISTS(SELECT 1 FROM public.coach_memories old WHERE old.id IN (${ids}) AND NOT EXISTS(
      SELECT 1 FROM public.coach_first_review_setup_requests s
      JOIN public.coach_memory_review_events e ON e.user_id=s.user_id AND e.memory_id=old.id AND e.action='corrected'
        AND e.idempotency_key='first-review-setup:'||s.request_id::text||':'||old.memory_key
      JOIN public.coach_memories replacement ON replacement.id=e.replacement_memory_id AND replacement.user_id=old.user_id
      WHERE s.user_id='${t.ownerId}' AND s.program_id='${t.programId}' AND s.disposition='saved'
        AND s.request->>'designationId'='${fixture.designationId}' AND old.status='superseded'
        AND old.effective_until=replacement.effective_from AND old.last_reviewed_at=replacement.last_reviewed_at AND old.review_after IS NULL
        AND old.updated_at=replacement.updated_at AND replacement.supersedes_id=old.id
        AND replacement.status='confirmed' AND replacement.memory_key=old.memory_key
        AND replacement.id::text=s.receipt#>>ARRAY['memories',old.memory_key,'memoryId']
        AND replacement.content=s.receipt#>ARRAY['memories',old.memory_key,'content']
    ))); ROLLBACK;`
}
export function firstReviewMutablePreserved(before,after) {
  return object(before)&&object(after)&&after.memoriesValid===true
    &&['contextRevision','recommendationRevision'].every(key=>Number.isSafeInteger(before[key])&&before[key]>=0
      &&Number.isSafeInteger(after[key])&&after[key]>=before[key])
}
/** Normalized pointer/status fields require this separate exact accepted-state check. */
function firstReviewTerminalQuery(fixture,baseline,projection) {
  if(!uuid(fixture.designationId))throw Error('Exact designation required')
  const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
  if(!object(baseline)||![baseline.programUpdatedAt,baseline.capturedAt].every(value=>
    typeof value==='string'&&timestamp.test(value)&&Number.isFinite(Date.parse(value))))throw Error('Exact pre-flow program clock baseline required')
  const t=firstReviewLocalTarget
  return `BEGIN READ ONLY; WITH checks AS (SELECT jsonb_build_object(
      'active_pointer',p.status='active' AND p.active_plan_version_id=v.id AND v.status='accepted',
      'window_sequence_anchor',v.window_start='${t.targetWindowStart}' AND v.sequence_number=2 AND anchor.plan_snapshot->>'id'=v.id::text,
      'program_window',p.start_date=v.window_start AND p.end_date=v.window_end,
      'program_clock',p.updated_at>='${baseline.programUpdatedAt}'::timestamptz
        AND p.updated_at>='${baseline.capturedAt}'::timestamptz AND p.updated_at<=v.accepted_at
        AND v.accepted_at>='${baseline.capturedAt}'::timestamptz AND v.accepted_at<=clock_timestamp(),
      'title',p.title=btrim(public.reviewed_registration_rationale(a.registration_id)#>>'{program_metadata,title}'),
      'goal_summary',p.goal_summary=btrim(public.reviewed_registration_rationale(a.registration_id)#>>'{program_metadata,goal_summary}'),
      'goal_target_date',p.goal_target_date IS NOT DISTINCT FROM nullif(public.reviewed_registration_rationale(a.registration_id)#>>'{program_metadata,goal_target_date}','')::date,
      'direction',p.direction IS NOT DISTINCT FROM public.reviewed_registration_rationale(a.registration_id)#>'{program_metadata,direction}',
      'one_active_program',(SELECT count(*) FROM public.training_programs WHERE user_id=p.user_id AND status='active')=1,
      'one_acceptance',(SELECT count(*) FROM public.coach_first_review_acceptances WHERE program_id=p.id)=1,
      'two_plan_versions',(SELECT count(*) FROM public.training_plan_versions WHERE program_id=p.id)=2,
      'no_enrollment',NOT EXISTS(SELECT 1 FROM public.coach_supervised_enrollments WHERE program_id=p.id)
    ) predicates,p.updated_at program_updated_at,v.accepted_at,clock_timestamp() observed_at
    FROM public.coach_first_review_acceptances a
    JOIN public.coach_first_review_candidates c ON c.id=a.registration_id AND c.designation_id='${fixture.designationId}'
    JOIN public.training_programs p ON p.id=a.program_id AND p.user_id=a.user_id
    JOIN public.training_plan_versions b ON b.id=a.base_plan_version_id AND b.status='superseded'
    JOIN public.training_plan_versions v ON v.id=a.plan_version_id AND v.program_id=p.id AND v.user_id=p.user_id
    JOIN public.coach_supervised_programs lineage ON lineage.program_id=p.id AND lineage.user_id=p.user_id
    JOIN public.coach_supervised_initial_bases anchor ON anchor.program_id=p.id AND anchor.user_id=p.user_id AND anchor.plan_version_id=v.id
    WHERE p.id='${t.programId}' AND p.user_id='${t.ownerId}' AND a.base_plan_version_id='${t.baseId}'
    ) SELECT ${projection}; ROLLBACK;`
}
export function firstReviewTerminalDiagnosticsSql(fixture,baseline) {
  return firstReviewTerminalQuery(fixture,baseline,`jsonb_build_object('matchedRows',(SELECT count(*) FROM checks),
    'checks',coalesce((SELECT jsonb_agg(to_jsonb(checks)) FROM checks),'[]'::jsonb))`)
}
export function firstReviewTerminalPreserved(diagnostics) {
  const required=['active_pointer','direction','goal_summary','goal_target_date','no_enrollment','one_acceptance',
    'one_active_program','program_clock','program_window','title','two_plan_versions','window_sequence_anchor'].sort()
  return object(diagnostics)&&diagnostics.matchedRows===1&&Array.isArray(diagnostics.checks)
    &&diagnostics.checks.length===1&&object(diagnostics.checks[0])&&object(diagnostics.checks[0].predicates)
    &&JSON.stringify(Object.keys(diagnostics.checks[0].predicates).sort())===JSON.stringify(required)
    &&Object.values(diagnostics.checks[0].predicates).every(value=>value===true)
}
export function firstReviewTerminalSql(fixture,baseline) {
  return firstReviewTerminalQuery(fixture,baseline,`to_jsonb((SELECT count(*) FROM checks)=1 AND NOT EXISTS(
    SELECT 1 FROM checks,jsonb_each(predicates) p WHERE p.value IS DISTINCT FROM 'true'::jsonb))`)
}
