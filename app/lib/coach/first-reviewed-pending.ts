/** Browser-owned immutable pending envelopes for the complete first-review flow. */
import { parseFirstReviewedPending,parseFirstReviewedRequestResolution,type FirstReviewedPending,type FirstReviewedRequestResolution } from './first-reviewed-request-resolution'
import { firstProfileUuid as uuid,parseFirstReviewedProfileSnapshot } from './first-reviewed-profile-contract'
import { parseFirstReviewedCandidateReview } from './first-reviewed-contract'
import { stableStringify } from './rolling-weekly-contracts'

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>
const same=(a:unknown,b:unknown)=>stableStringify(a)===stableStringify(b)
const key=(actor:string,program:string)=>`first-reviewed-pending:${actor}:${program}`
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export async function firstReviewedBrowserHash(value:unknown){
  const bytes=new TextEncoder().encode(stableStringify(value)),digest=await crypto.subtle.digest('SHA-256',bytes)
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
export function readFirstReviewedPending(store:Store,actor:string,program:string):FirstReviewedPending|null {
  if(!uuid(actor)||!uuid(program))throw Error('The request scope is invalid.')
  const raw=store.getItem(key(actor,program));if(raw===null)return null
  let v:FirstReviewedPending|null=null
  try{v=parseFirstReviewedPending(JSON.parse(raw))}catch{/* Preserve unreadable user state. */}
  if(!v||v.userId!==actor||v.programId!==program)throw Error('The saved request could not be read. It remains preserved.')
  return v
}
export function listFirstReviewedPendingPrograms(store:Pick<Storage,'length'|'key'>,actor:string):string[]{
  if(!uuid(actor))return []
  if(store.length>10000)throw Error('Local request storage is too large to inspect safely. Saved requests remain preserved.')
  const prefix=`first-reviewed-pending:${actor}:`,programs:string[]=[]
  for(let i=0;i<store.length;i++){
    const name=store.key(i),program=name?.startsWith(prefix)?name.slice(prefix.length):null
    if(uuid(program))programs.push(program)
  }
  return [...new Set(programs)].sort()
}
export function saveFirstReviewedPending(store:Store,input:FirstReviewedPending):FirstReviewedPending {
  const v=parseFirstReviewedPending(input);if(!v)throw Error('Complete the request before saving. Nothing was sent.')
  const prior=readFirstReviewedPending(store,v.userId,v.programId)
  if(prior&&!same(prior,v))throw Error('Recover the previous request before creating another.')
  const encoded=JSON.stringify(v);store.setItem(key(v.userId,v.programId),encoded)
  if(store.getItem(key(v.userId,v.programId))!==encoded)throw Error('The request could not be preserved. Nothing was sent.')
  return v
}
async function verifySaved(resolution:FirstReviewedRequestResolution & {disposition:'saved'}){
  const q=resolution.request,r=resolution.result
  if(q.operation==='prepare_profile'){
    const s=parseFirstReviewedProfileSnapshot(r)
    if(!s||!same(s.projection.assessments,s.projection.profile.assessments)
      ||s.requestHash!==await firstReviewedBrowserHash(q.body.request)||s.profileHash!==await firstReviewedBrowserHash(s.projection.profile)
      ||s.projection.factsHash!==await firstReviewedBrowserHash({projectionAsOf:s.projection.projectionAsOf,sourceHash:s.sourceHash,
        profile:s.projection.profile,baselines:s.projection.baselines}))throw Error('Context confirmation does not match the original request.')
  }
  if(q.operation==='submit'){
    const c=parseFirstReviewedCandidateReview(r),hash=await firstReviewedBrowserHash(q.body.draft)
    if(!c||!c.reviewPacket.week.scheduledSessions.every(s=>s.prescription.source.review.id===`first-reviewed-candidate:${q.body.draft.candidateId}`
      &&s.prescription.source.review.contentHash===hash))throw Error('The saved candidate does not match the original draft.')
  }
}
/** send is only for a newly preserved explicit action. Recovery never resends:
 * it reads the original envelope, and absence remains pending. close is explicit.
 * Every result is verified through the common original-envelope getter before
 * archive/removal. An execute or closure response alone cannot clear user work. */
export async function performFirstReviewedPending(store:Store,input:FirstReviewedPending,currentActor:()=>string|null,
  mode:'send'|'recover'|'close',fetcher:typeof fetch=fetch){
  const q=parseFirstReviewedPending(input);if(!q)throw Error('The original request is invalid and remains preserved.')
  if(mode!=='send'&&mode!=='recover'&&mode!=='close')throw Error('The request action is invalid. Nothing was sent.')
  const unchanged=()=>{
    if(currentActor()!==q.userId)throw Error('Restore the original account and program before recovering this request.')
    if(!same(readFirstReviewedPending(store,q.userId,q.programId),q))throw Error('Pending state changed. The original request remains preserved.')
  }
  const post=async(path:string)=>fetcher(`/api/coach/first-reviewed${path}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)})
  unchanged()
  if(mode!=='recover'){
    const response=await post(mode==='send'?'':'/resolve');unchanged()
    // Retain uncertain requests. Do not turn transport or writer denial into a
    // cancellation, and do not issue another write on the user's behalf.
    if(!response.ok)throw Error('The result is unconfirmed. Recover the original request before another action.')
  }
  unchanged()
  const response=await post('/resolution'),value:unknown=await response.json();unchanged()
  const resolution=response.ok&&record(value)&&value.kind==='resolved'?parseFirstReviewedRequestResolution(value.resolution,q):null
  if(!resolution||resolution.disposition==='not_found')throw Error('The result is unconfirmed. The original request remains preserved.')
  if(resolution.disposition==='saved')await verifySaved(resolution)
  unchanged()
  const originalId=q.operation==='prepare_profile'?q.body.request.snapshotId:q.operation==='submit'?q.body.draft.candidateId:q.body.requestId
  // The saved resolution is the stable historical proof, including no-write
  // closure. Keep its exact request and proof before removing pending state.
  const archiveKey=`first-reviewed-receipt:${q.userId}:${q.programId}:${q.operation}:${originalId}`
  const encoded=JSON.stringify(resolution),prior=store.getItem(archiveKey)
  if(prior!==null){
    let old:unknown;try{old=JSON.parse(prior)}catch{throw Error('The saved receipt could not be read. Pending state remains preserved.')}
    // Later acceptance supersession can change only activePlanVersionId. Retain
    // the first receipt rather than overwrite its historical active-base value.
    if(!same(old,resolution)){
      const parsed=parseFirstReviewedRequestResolution(old,q)
      const stable=(r:FirstReviewedRequestResolution)=>r.disposition==='saved'&&(q.operation==='issue'||q.operation==='accept')
        ?{...r,result:{proposalId:r.result.proposalId,planVersionId:r.result.planVersionId}}:r
      if(!parsed||!same(stable(parsed),stable(resolution)))throw Error('A conflicting receipt exists. Pending state remains preserved.')
    }
  }else{
    store.setItem(archiveKey,encoded)
    if(store.getItem(archiveKey)!==encoded)throw Error('The confirmed result could not be retained. Pending state remains preserved.')
  }
  unchanged();store.removeItem(key(q.userId,q.programId))
  if(store.getItem(key(q.userId,q.programId))!==null)throw Error('The result is saved; local pending state still needs recovery.')
  return resolution
}

/** All UI reservation, archive and removal use one cooperating-tab lock. No
 * waiting queue or resend: a second tab must recover after the first finishes.
 * Unsupported lock storage is a visible unavailable state, never a weaker send. */
export async function runFirstReviewedBrowserAction(store:Store,input:FirstReviewedPending,currentActor:()=>string|null,
  mode:'send'|'recover'|'close',fetcher:typeof fetch=fetch,locks:Pick<LockManager,'request'>|null|undefined=globalThis.navigator?.locks){
  const q=parseFirstReviewedPending(input)
  if(!q||!locks||!['send','recover','close'].includes(mode))throw Error('Safe browser request coordination is unavailable. Nothing was sent.')
  return locks.request(`first-reviewed-request:${q.userId}:${q.programId}`,{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock)throw Error('Another tab is handling this program. Wait for it to finish, then recover the original request.')
    if(currentActor()!==q.userId)throw Error('Restore the original account and program before this action.')
    if(mode==='send'){
      if(store.getItem(`first-reviewed-setup-pending:${q.userId}:${q.programId}`)!==null||readFirstReviewedPending(store,q.userId,q.programId))throw Error('Recover the previous request before creating another.')
      saveFirstReviewedPending(store,q)
    }
    return performFirstReviewedPending(store,q,currentActor,mode,fetcher)
  })
}
