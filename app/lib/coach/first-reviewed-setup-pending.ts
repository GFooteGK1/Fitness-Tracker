/** Exact setup-save recovery. Shares tab coordination with the other first-review actions. */
import { parseFirstReviewSetupRequest,parseFirstReviewSetupResolution,type FirstReviewSetupRequest } from './first-reviewed-setup-request'
import { firstProfileUuid as uuid } from './first-reviewed-profile-contract'
import { stableStringify } from './rolling-weekly-contracts'

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>
const key=(actor:string,program:string)=>`first-reviewed-setup-pending:${actor}:${program}`
const otherKey=(actor:string,program:string)=>`first-reviewed-pending:${actor}:${program}`
const same=(a:unknown,b:unknown)=>stableStringify(a)===stableStringify(b)
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function readFirstReviewSetupPending(store:Store,actor:string,program:string):FirstReviewSetupRequest|null{
  if(!uuid(actor)||!uuid(program))throw Error('The setup request scope is invalid.')
  const raw=store.getItem(key(actor,program));if(raw===null)return null
  let q:FirstReviewSetupRequest|null=null
  try{q=parseFirstReviewSetupRequest(JSON.parse(raw))}catch{/* Preserve unreadable original work. */}
  if(!q||q.expectedUserId!==actor||q.programId!==program)throw Error('The saved setup request could not be read. It remains preserved.')
  return q
}
export function listFirstReviewSetupPendingPrograms(store:Pick<Storage,'length'|'key'>,actor:string):string[]{
  if(!uuid(actor))return []
  if(store.length>10000)throw Error('Local request storage is too large to inspect safely. Saved requests remain preserved.')
  const prefix=`first-reviewed-setup-pending:${actor}:`,programs:string[]=[]
  for(let i=0;i<store.length;i++){const name=store.key(i),program=name?.startsWith(prefix)?name.slice(prefix.length):null;if(uuid(program))programs.push(program)}
  return [...new Set(programs)].sort()
}
export async function runFirstReviewSetupBrowserAction(store:Store,input:FirstReviewSetupRequest,currentActor:()=>string|null,
  mode:'send'|'recover'|'close',fetcher:typeof fetch=fetch,locks:Pick<LockManager,'request'>|null|undefined=globalThis.navigator?.locks){
  const q=parseFirstReviewSetupRequest(input)
  if(!q||!locks||!['send','recover','close'].includes(mode))throw Error('Safe browser request coordination is unavailable. Nothing was sent.')
  return locks.request(`first-reviewed-request:${q.expectedUserId}:${q.programId}`,{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock)throw Error('Another tab is handling this program. Wait for it to finish, then recover the original request.')
    const unchanged=()=>{
      if(currentActor()!==q.expectedUserId)throw Error('Restore the original account and program before recovering this request.')
      if(!same(readFirstReviewSetupPending(store,q.expectedUserId,q.programId),q))throw Error('Pending state changed. The original request remains preserved.')
    }
    if(currentActor()!==q.expectedUserId)throw Error('Restore the original account and program before this action.')
    if(mode==='send'){
      if(store.getItem(otherKey(q.expectedUserId,q.programId))!==null||readFirstReviewSetupPending(store,q.expectedUserId,q.programId))throw Error('Recover the previous request before creating another.')
      const encoded=JSON.stringify(q);store.setItem(key(q.expectedUserId,q.programId),encoded)
      if(store.getItem(key(q.expectedUserId,q.programId))!==encoded)throw Error('The request could not be preserved. Nothing was sent.')
    }
    const post=(suffix:string)=>fetcher(`/api/coach/first-reviewed/setup${suffix}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)})
    unchanged()
    if(mode!=='recover'){
      const response=await post(mode==='send'?'':'/resolve');unchanged()
      if(!response.ok)throw Error('The result is unconfirmed. Recover the original setup request before another action.')
    }
    const response=await post('/resolution'),raw:unknown=await response.json();unchanged()
    const resolution=response.ok&&record(raw)&&raw.kind==='resolved'?parseFirstReviewSetupResolution(raw.resolution,q):null
    if(!resolution||resolution.disposition==='not_found')throw Error('The result is unconfirmed. The original setup request remains preserved.')
    const archive=`first-reviewed-setup-receipt:${q.expectedUserId}:${q.programId}:${q.requestId}`,encoded=JSON.stringify(resolution),prior=store.getItem(archive)
    if(prior!==null){let old:unknown;try{old=JSON.parse(prior)}catch{throw Error('The saved receipt could not be read. Pending state remains preserved.')}
      if(!same(old,resolution))throw Error('A conflicting receipt exists. Pending state remains preserved.')
    }else{store.setItem(archive,encoded);if(store.getItem(archive)!==encoded)throw Error('The confirmed result could not be retained. Pending state remains preserved.')}
    unchanged();store.removeItem(key(q.expectedUserId,q.programId))
    if(store.getItem(key(q.expectedUserId,q.programId))!==null)throw Error('The result is saved; local pending state still needs recovery.')
    return resolution
  })
}
