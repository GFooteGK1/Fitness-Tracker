import type {SupabaseClient} from '@supabase/supabase-js'
import {nutritionPhotoPilotOwner} from './photo-pilot-policy'
import {nutritionPhotoQualificationEnabled} from './photo-pilot-qualification-policy'

export class PhotoQualificationError extends Error {
  constructor(readonly status:number,message:string){super(message)}
}
const models=['gpt-6-luna','gpt-5.6-luna'] as const
type MetadataState='not_checked'|'available'|'denied'|'unavailable'
async function metadata(model:typeof models[number],key:string):Promise<MetadataState>{
  try{
    const response=await fetch('https://api.openai.com/v1/models/'+model,{method:'GET',
      headers:{Authorization:'Bearer '+key},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)})
    if(response.status!==200){await response.body?.cancel();return [401,403].includes(response.status)?'denied':'unavailable'}
    if(!response.body)return 'unavailable'
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
    try{
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength
        if(size>4096){await reader.cancel();return 'unavailable'}chunks.push(value)}
    }finally{reader.releaseLock()}
    const data:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return data&&typeof data==='object'&&'id' in data&&data.id===model&&'object' in data&&data.object==='model'?'available':'unavailable'
  }catch{return 'unavailable'}
}

/** Only fixed metadata GETs, in the existing server environment. No generation,
 * photo, arbitrary URL/model, key export, provider body or authorization returned. */
export async function qualifyPhotoModels(db:SupabaseClient){
  if(!nutritionPhotoQualificationEnabled())throw new PhotoQualificationError(409,'Hosted metadata qualification is awaiting exact approval.')
  const identity=await db.auth.getUser(),owner=identity.data.user?.id
  if(identity.error||!owner)throw new PhotoQualificationError(401,'Sign in to Socius.')
  if(!nutritionPhotoPilotOwner(owner))throw new PhotoQualificationError(403,'This account cannot qualify the pilot.')
  const key=process.env.OPENAI_API_KEY?.trim()
  const results:Array<{model:typeof models[number];metadata:MetadataState}>=[]
  for(const model of models){
    const current=await db.auth.getUser()
    if(current.error||current.data.user?.id!==owner)throw new PhotoQualificationError(401,'Owner session could not be reverified.')
    results.push({model,metadata:key?await metadata(model,key):'not_checked'})
  }
  return {asOf:new Date().toISOString(),configured:!!key,models:results,
    paidEndpointBillingQualification:'not_established',pricingQualification:'not_established',dataControlQualification:'not_established'}
}
