// Shared lifecycle worker. No credentials, provisioning, pause control or network.
// Only the separately reviewed adapter may perform these named owner-scoped calls.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateLiveSetupManifest } from './setup-freshness-live-contract.mjs';

const check = (ok, label) => { if (!ok) throw new Error(label); };
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function historyDigest(value, ownerId, planId) {
  check(value?.plan?.id === planId && value.plan.user_id === ownerId && value.plan.intent
    && value.plan.input_snapshot && Array.isArray(value.sessions) && value.sessions.length > 0, 'history_shape');
  const sessions = value.sessions.map(s => {
    check(uuid(s.id) && s.plan_version_id === planId && s.user_id === ownerId
      && s.prescription && typeof s.scheduled_date === 'string', 'history_session_owner');
    return { id:s.id,plan_version_id:s.plan_version_id,user_id:s.user_id,scheduled_date:s.scheduled_date,
      week_number:s.week_number,session_index:s.session_index,prescription:s.prescription };
  }).sort((a,b)=>a.id.localeCompare(b.id));
  check(new Set(sessions.map(s=>s.id)).size===sessions.length, 'history_duplicate_session');
  // Mutable plan status/current-week linkage is intentionally not a payload field.
  return hash({id:planId,user_id:ownerId,intent:value.plan.intent,input_snapshot:value.plan.input_snapshot,sessions});
}

export async function runLiveSetupLifecycle(manifest, io, gate) {
  manifest = structuredClone(manifest);
  validateLiveSetupManifest(manifest);
  check(gate?.manifestHash === validateLiveSetupManifest(manifest).hash, 'gate_manifest');
  const rolling=manifest.owners.rolling.userId, legacy=manifest.owners.legacy.userId;
  const operation=(step,fn,request)=>gate.perform(step,context=>fn({...context,step}),request);
  const key=label=>manifest.idempotencyKeys[label];
  const api=async(step,owner,route,body,expected)=>{
    const result=await operation(step,context=>io.api({owner,route,body,...context}),{method:'api',owner,route,body,expected});
    check(result?.status===expected,`${step}_status_expected_${expected}_received_${result?.status}`);
    return result.value;
  };
  const call=(step,method,args)=>operation(step,context=>io[method]({...args,...context}),{method,...args});
  const confirm=(step,owner)=>call(step,'confirm',{owner,idempotencyKey:key(step)});
  const expire=(step,owner,memory)=>call(step,'expire',{owner,memory});
  const revision=(step,owner)=>call(step,'revision',{owner});
  const elapsed=(step,at)=>call(step,'waitUntil',{at});
  const accept=(step,owner,proposal,idempotencyKey,status=200)=>{
    check(uuid(proposal?.proposalId),'proposal_identity');
    return api(step,owner,`/api/coach/proposals/${proposal.proposalId}/accept`,{idempotencyKey},status);
  };
  const history=(step,owner,planId)=>operation(step,async context=>{
    check(uuid(planId),'history_plan_id');
    return historyDigest(await io.history({owner,planId,...context}),owner,planId);
  },{method:'history',owner,planId});
  const planningInput={format:'complete_programming_intake_v0_3',primaryDomain:'strength',goal:'Build useful full-body strength',experience:'consistent',
    trainingDays:['monday','wednesday','friday'],sessionMinutes:60,equipment:'Bodyweight',resolvedEquipmentIds:['bodyweight'],constraints:'',constraintKinds:[],
    secondaryGoals:[],startDate:'2026-09-14',setupConfirmed:true};
  const fresh=label=>({tzOffset:300,idempotencyKey:key(label),goalTargetDate:'2027-04-01',planningInput:structuredClone(planningInput)});
  const review=label=>({asOf:'2026-09-23T16:00:00.000Z',tzOffset:300,windowDays:28,athleteRequestedReview:true,
    reviewIdempotencyKey:key(`${label}-review`),proposalIdempotencyKey:key(`${label}-proposal`)});

  const memory=await confirm('rolling-confirm-initial',rolling);
  const at=await expire('rolling-expire-initial',rolling,memory);
  const rev=await revision('rolling-revision-initial',rolling);
  const initialRequest=fresh('initial-create'), initial=await api('initial-create',rolling,'/api/coach/weekly',initialRequest,201);
  await elapsed('initial-elapse',at);
  check(isDeepStrictEqual(await revision('initial-revision-check',rolling),rev),'initial_revision_changed');
  await accept('initial-stale-accept',rolling,initial,initialRequest.idempotencyKey,409);
  check((await api('initial-read-expired',rolling,'/api/coach/weekly',undefined,200)).pendingProposal===null,'stale_pending_visible');
  await confirm('rolling-confirm-replacement',rolling);
  const replacementRequest=fresh('initial-replacement-create');
  const replacement=await api('initial-replacement-create',rolling,'/api/coach/weekly',replacementRequest,201);
  check(replacement.proposalId!==initial.proposalId,'replacement_identity');
  await accept('initial-replacement-accept',rolling,replacement,replacementRequest.idempotencyKey);
  const originalDigest=await history('initial-accepted-read',rolling,replacement.planVersionId);

  const reviewMemory=await confirm('rolling-confirm-review',rolling);
  const reviewAt=await expire('rolling-expire-review',rolling,reviewMemory);
  const reviewRev=await revision('rolling-revision-review',rolling);
  const partialRequest=review('stored'); delete partialRequest.proposalIdempotencyKey;
  const partial=await api('review-save-partial',rolling,'/api/coach/weekly/review',partialRequest,400);
  check(partial.error==='A valid proposal idempotency key is required','stored_partial_response');
  const saved=await call('review-read-saved','findReview',{owner:rolling,idempotencyKey:partialRequest.reviewIdempotencyKey});
  check(uuid(saved?.id)&&saved.rationale?.setupMemoryBindings,'stored_review_binding');
  const storedKey=key('stored-review-create'),route=`/api/coach/weekly/reviews/${saved.id}/proposal`;
  const stored=await api('stored-review-create',rolling,route,{tzOffset:300,idempotencyKey:storedKey},201);
  await elapsed('review-elapse',reviewAt);
  check(isDeepStrictEqual(await revision('review-revision-check',rolling),reviewRev),'review_revision_changed');
  await accept('stored-review-stale-accept',rolling,stored,storedKey,409);
  const stale=await api('stored-review-stale-reconstruct',rolling,route,{tzOffset:300,idempotencyKey:key('stored-stale-reconstruct')},409);
  check(stale.error==='Review the current training setup again before creating a proposal','stored_stale_response');
  check(await history('initial-history-read',rolling,replacement.planVersionId)===originalDigest,'initial_history_changed');
  await accept('initial-accepted-replay',rolling,replacement,replacementRequest.idempotencyKey);
  await confirm('rolling-confirm-current-review',rolling);
  const currentRequest=review('current'), current=await api('current-review-create',rolling,'/api/coach/weekly/review',currentRequest,201);
  check(uuid(current.review?.id)&&current.review.id!==saved.id&&current.proposalId!==stored.proposalId,'current_review_identity');
  await accept('current-review-accept',rolling,current,currentRequest.proposalIdempotencyKey);
  check(uuid(current.planVersionId) && (await api('current-review-accepted-read',rolling,'/api/coach/weekly',undefined,200)).currentWeek?.id===current.planVersionId,'current_review_current_identity');
  check(await history('initial-history-final',rolling,replacement.planVersionId)===originalDigest,'initial_final_history_changed');

  const legacyKey=key('legacy-create');
  const old=await call('legacy-create','seedLegacy',{owner:legacy,idempotencyKey:legacyKey});
  check(uuid(old?.proposal_id)&&uuid(old.proposed_plan_version_id),'legacy_identity');
  await accept('legacy-accept',legacy,{proposalId:old.proposal_id},legacyKey);
  const legacyDigest=await history('legacy-history-read',legacy,old.proposed_plan_version_id);
  const legacyMemory=await confirm('legacy-confirm',legacy), conversionAt=await expire('legacy-expire',legacy,legacyMemory);
  const conversionRev=await revision('legacy-revision',legacy);
  const conversionRequest={...fresh('conversion-create'),hypothesis:'Confirm current setup and replace legacy programming'};
  const conversion=await api('conversion-create',legacy,'/api/coach/weekly/convert',conversionRequest,201);
  await elapsed('conversion-elapse',conversionAt);
  check(isDeepStrictEqual(await revision('conversion-revision-check',legacy),conversionRev),'conversion_revision_changed');
  await accept('conversion-stale-accept',legacy,conversion,conversionRequest.idempotencyKey,409);
  await confirm('legacy-confirm-replacement',legacy);
  const recoveredRequest={...conversionRequest,idempotencyKey:key('conversion-replacement-create')};
  const recovered=await api('conversion-replacement-create',legacy,'/api/coach/weekly/convert',recoveredRequest,201);
  check(recovered.proposalId!==conversion.proposalId,'conversion_replacement_identity');
  await accept('conversion-replacement-accept',legacy,recovered,recoveredRequest.idempotencyKey);
  check((await api('conversion-accepted-read',legacy,'/api/coach/weekly',undefined,200)).currentWeek?.id===recovered.planVersionId,'conversion_current_identity');
  check(await history('legacy-history-final',legacy,old.proposed_plan_version_id)===legacyDigest,'legacy_history_changed');
  check(gate.status().completed,'incomplete_lifecycle');
  return {lifecyclePassed:true,containmentVerified:false,globalHistoryVerified:false,
    historyProofs:[{owner:rolling,planId:replacement.planVersionId,sha256:originalDigest},{owner:legacy,planId:old.proposed_plan_version_id,sha256:legacyDigest}],
    groups:['initial-expiry-recovery','stored-review-expiry','current-review-recovery','legacy-conversion-expiry-recovery']};
}
