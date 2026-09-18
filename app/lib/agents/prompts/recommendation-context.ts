import type {PassiveContext} from '../types'
export function renderRecommendationContext(ctx:PassiveContext):string{
 const r=ctx.current_recommendation
 if(!r)return `Current next-action status: ${ctx.recommendation_status??'unavailable'}. No verified current recommendation is supplied. Do not invent one or treat historical analyst messages as validated evidence.`
 return `Verified current next action (same record shown on Today): ${JSON.stringify(r)}. Explain these reasons without replacing its action, adding a numerical prescription, claiming causal benefit, or treating Done as an activity. Plan acceptance and canonical logging use their explicit controls.`
}
