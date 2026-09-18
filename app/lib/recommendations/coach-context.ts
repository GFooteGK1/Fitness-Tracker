import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecommendationDecision } from './contracts'
import { getRecommendationView } from './service'
export interface CoachRecommendationContext {
  recommendation_status: 'disabled' | 'unavailable' | 'pending' | 'ready'
  current_recommendation: null | Pick<RecommendationDecision,'kind'|'title'|'reason'|'reasonCodes'|'destination'|'validUntil'|'sourceRevision'> & {id:string}
}
/** Revalidated outside the passive cache; Coach and Today share the persisted decision ID. */
export async function freshCoachRecommendation(db:SupabaseClient,userId:string,agentTzOffset:number):Promise<CoachRecommendationContext>{
  try{
    const view=await getRecommendationView(db,userId,-agentTzOffset,false)
    const row=view.recommendations[0]
    return {recommendation_status:view.status,current_recommendation:row?{id:row.id,kind:row.decision.kind,title:row.decision.title,reason:row.decision.reason,reasonCodes:row.decision.reasonCodes,destination:row.decision.destination,validUntil:row.decision.validUntil,sourceRevision:row.decision.sourceRevision}:null}
  }catch{return {recommendation_status:'unavailable',current_recommendation:null}}
}
