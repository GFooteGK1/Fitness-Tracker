import {describe,it,expect,vi,beforeEach} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {freshCoachRecommendation} from '@/app/lib/recommendations/coach-context'
import {getRecommendationView} from '@/app/lib/recommendations/service'
import {buildTrainerPrompt} from '@/app/lib/agents/prompts/trainer'
import {buildNutritionistPrompt} from '@/app/lib/agents/prompts/nutritionist'
import {buildSociusPrompt} from '@/app/lib/agents/prompts/socius'
import {stored} from './fixtures'
vi.mock('@/app/lib/recommendations/service',()=>({getRecommendationView:vi.fn()}))
beforeEach(()=>vi.resetAllMocks())
it('revalidates current decision on every Coach read with raw timezone conversion',async()=>{
 const row=stored();const db={} as SupabaseClient
 vi.mocked(getRecommendationView).mockResolvedValueOnce({status:'ready',coverage:null,recommendations:[row],refreshState:{sourceRevision:7,responseRevision:2,pending:false},outcomes:[]}).mockResolvedValueOnce({status:'pending',coverage:null,recommendations:[],refreshState:{sourceRevision:8,responseRevision:2,pending:true},outcomes:[]})
 expect((await freshCoachRecommendation(db,'user-1',-300)).current_recommendation?.id).toBe(row.id)
 expect(await freshCoachRecommendation(db,'user-1',-300)).toMatchObject({recommendation_status:'pending',current_recommendation:null})
 expect(getRecommendationView).toHaveBeenCalledTimes(2);expect(getRecommendationView).toHaveBeenLastCalledWith(db,'user-1',300,false)
})
it('keeps recommendation outage separate from the rest of Coach',async()=>{
 vi.mocked(getRecommendationView).mockRejectedValue(new Error('unavailable'))
 expect(await freshCoachRecommendation({} as SupabaseClient,'user-1',0)).toEqual({recommendation_status:'unavailable',current_recommendation:null})
})
describe('same recommendation identity in every cold-start domain prompt',()=>{
 const macros={protein:0,carbs:0,fat:0,calories:0};const c:any={user_id:'user-1',targets:{...macros,tolerance_pct:0},targets_confirmed:false,today:{macros_consumed:macros,macros_remaining:macros,meals_logged:0,workouts_logged:0,latest_whoop_recovery:null,latest_whoop_strain:null},week:{days_elapsed:1,actual:macros,prorated_target:macros,adherence_pct:macros,overall_status:'on-track'},recent_chat:[],pending_insights:[],current_time:'noon',current_date:'2026-09-17',day_of_week:'Thursday',has_whoop:false,recent_workouts:[],benchmark_prs:[],todays_program:null,movement_aliases:{},todays_meals:[],portion_defaults:{},user_portion_history:null,thirty_day_summary:{workout_count:0,workout_types:{},avg_rpe:null,total_meals:0,avg_daily_protein:0,avg_daily_calories:0,pr_count:0,whoop_avg_recovery:null,whoop_avg_sleep_score:null},recent_insights:[],data_availability:{has_workouts:false,has_meals:false,has_whoop:false,has_targets:false},recommendation_status:'ready',current_recommendation:{id:'shared-decision-123',kind:'collect_signal',title:'Confirm baseline',reason:'Defined baseline missing',reasonCodes:['defined_baseline_missing'],destination:{type:'baseline',href:'/program'},sourceRevision:7,validUntil:'2026-09-18T00:00:00Z'}}
 it.each([['Trainer',buildTrainerPrompt],['Nutritionist',buildNutritionistPrompt],['Socius',buildSociusPrompt]] as const)('%s receives the current ID even with no logged rows',(_name,build)=>{
  const prompt=build(c);expect(prompt.match(/shared-decision-123/g)).toHaveLength(1);expect(prompt).toContain('Defined baseline missing');expect(prompt).toContain('Plan acceptance and canonical logging use their explicit controls')
 })
})

