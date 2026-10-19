import {createServerClient} from '@/app/lib/auth/supabase-server'
import {nutritionPhotoQualificationEnabled} from '@/app/lib/nutrition/photo-pilot-qualification-policy'
import {PhotoQualificationError,qualifyPhotoModels} from '@/app/lib/nutrition/photo-pilot-qualification-server'
const reply=(body:object,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}})
export async function GET(request:Request){
  if(!nutritionPhotoQualificationEnabled())return reply({error:'Hosted metadata qualification is awaiting exact approval.'},409)
  if(new URL(request.url).search)return reply({error:'No qualification parameters are accepted.'},422)
  try{return reply(await qualifyPhotoModels(await createServerClient()))}
  catch(error){return error instanceof PhotoQualificationError?reply({error:error.message},error.status):reply({error:'Metadata qualification unavailable.'},503)}
}
