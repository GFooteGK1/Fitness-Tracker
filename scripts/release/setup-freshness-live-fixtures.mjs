// Pure fixed-fixture SQL renderer. No connection, credential or execution path.
import {createHash} from 'node:crypto';
import {validateLiveSetupManifest} from './setup-freshness-live-contract.mjs';
const check=(ok,code)=>{if(!ok)throw Error(code);};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const literal=value=>`E'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll('\\','\\\\').replaceAll("'","''")}'`;
const confirmations={
  'rolling-confirm-initial':'rolling','rolling-confirm-replacement':'rolling',
  'rolling-confirm-review':'rolling','rolling-confirm-current-review':'rolling',
  'legacy-confirm':'legacy','legacy-confirm-replacement':'legacy',
};
const expirations={'rolling-expire-initial':'rolling','rolling-expire-review':'rolling','legacy-expire':'legacy'};
const rpc=(name,args)=>`SELECT row_to_json(q) FROM public.${name}(${args.map(literal).join(',')}) q;`;

export function renderLiveFixtureSql(manifest,step,request) {
  const validated=validateLiveSetupManifest(manifest);
  const label=confirmations[step]??expirations[step]??(step==='legacy-create'?'legacy':null);
  check(label,'fixture_step');
  const actor=manifest.owners[label];check(request?.owner===actor.userId,'fixture_owner');
  if(!expirations[step])check(request.idempotencyKey===manifest.idempotencyKeys[step],'fixture_key');
  let action;
  if(confirmations[step]) {
    action=`SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub=${literal(actor.userId)};
${rpc('confirm_coach_memory',['training_schedule','schedule',
      {experience:'consistent',trainingDays:['monday','wednesday','friday'],sessionMinutes:60},
      {source:'program_setup',confirmedBy:'athlete'},1,request.idempotencyKey])}`;
  } else if(expirations[step]) {
    check(uuid(request.memory?.memory_id),'fixture_memory');
    action=`DO $expire_fixture$
DECLARE changed integer;
BEGIN
 UPDATE public.coach_memories SET review_after=clock_timestamp()+interval '15 seconds'
 WHERE id=${literal(request.memory.memory_id)}::uuid AND user_id=${literal(actor.userId)}::uuid
 AND memory_key='training_schedule' AND kind='schedule' AND status='confirmed';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Exact synthetic memory required'; END IF;
END $expire_fixture$;
SELECT to_json(review_after) FROM public.coach_memories WHERE id=${literal(request.memory.memory_id)}::uuid AND user_id=${literal(actor.userId)}::uuid;`;
  } else {
    const sessions=Array.from({length:16},(_,i)=>({week_number:Math.floor(i/2)+1,session_index:i%2+1,scheduled_date:'2026-09-14',
      prescription:{domain:'strength',intent:'Synthetic legacy fixture',dose:{},effort:'Controlled',rest:'As needed',success_condition:'Quality',stop_condition:'Stop on pain',scale_options:[],evidence:{}}}));
    action=`SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub=${literal(actor.userId)};
${rpc('create_initial_training_plan_proposal',['Synthetic legacy conversion fixture','Build useful full-body strength','2026-09-14','fixture','fixture',
      {horizon_weeks:8,primary_domain:'strength',weeks:[{week_number:1}]},{},sessions,{},'e'.repeat(64),request.idempotencyKey])}`;
  }
  // The shared lock lasts through COMMIT. A successful operator pause drains
  // these fixture writes too, even though coach_memories has no pause trigger.
  // Queued/late transactions check the new generation before any side effect.
  const sql=`BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='3s';
SET LOCAL application_name=${literal(`setup-live-${manifest.runId}`)};
DO $fixture_guard$
DECLARE control public.coaching_write_control%ROWTYPE;
BEGIN
 SELECT * INTO STRICT control FROM public.coaching_write_control WHERE singleton FOR SHARE;
 IF control.paused OR control.generation<>${validated.expectedOpenGeneration}::bigint THEN
  RAISE EXCEPTION 'Synthetic fixture window is closed' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${literal(actor.userId)}::uuid AND email=${literal(actor.email)}) THEN
  RAISE EXCEPTION 'Synthetic owner identity mismatch' USING ERRCODE='42501';
 END IF;
END $fixture_guard$;
${action}
COMMIT;
`;
  const input={owner:actor.userId,...(expirations[step]?{memory:{memory_id:request.memory.memory_id}}:{idempotencyKey:request.idempotencyKey})};
  return Object.freeze({sql,sha256:createHash('sha256').update(sql).digest('hex'),step,owner:actor.userId,manifestHash:validated.hash,input});
}
