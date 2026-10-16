/** Blank untrusted first-week authoring. No legacy dose or performed work is copied. */
import type { EditableReviewedWeekSeed } from './supervised-draft-editor'
import { REVIEWED_SESSION_DAYS as days } from './reviewed-session-contract'
import type { ReviewedWeekActivity,ReviewedWeekSchedule,ReviewedWeekStep } from './offline-reviewed-week'
import { parseFirstReviewProgramsPage,type FirstReviewProgramSummary } from './first-reviewed-workspace-contract'

export interface FirstReviewedWeekSeed extends EditableReviewedWeekSeed {transition:'first_reviewed'}
export function seedFirstReviewedWeek(program:FirstReviewProgramSummary,actor:string):FirstReviewedWeekSeed|null {
  const parsed=parseFirstReviewProgramsPage({schemaVersion:1,actorId:actor,programs:[program],nextAfterProgramId:null},actor)
  const p=parsed?.programs[0],d=p?.latestDesignation
  if(!p||p.role!=='athlete'||!p.reviewAvailable||!d||Date.parse(d.expiresAt)<=Date.now())return null
  const schedule=Object.fromEntries(days.map(day=>[day,null])) as ReviewedWeekSchedule,scheduleId='first-reviewed-week'
  return {transition:'first_reviewed',windowStart:d.targetWindowStart,sequenceNumber:p.legacyBase.sequenceNumber+1,scheduleId,
    recipe:{sessions:[],baseSchedule:schedule,schedules:[{id:scheduleId,days:structuredClone(schedule),
      reason:'Initial complete week requires explicit review and separate athlete acceptance.'}],protocols:[],instructions:[],limitations:[]}}
}
function blankActivity(id:string,role:ReviewedWeekActivity['role']):ReviewedWeekActivity {
  return {kind:'activity',id,movementId:'',role,requiredEquipment:[],sets:NaN,
    work:{kind:'repetitions',repetitions:{min:NaN,max:NaN},sides:1,secondsPerRep:NaN},
    load:{kind:'athlete_selected',instruction:''},effort:{kind:'rpe',min:NaN,max:NaN},
    restBetweenSeconds:NaN,restAfterSeconds:NaN,protocolId:null,instructions:[]}
}
/** Intentionally incomplete: a blank must fail compilation until the reviewer
 * enters actual preparation, dose, effort, rest and accounting assumptions. */
export function addFirstReviewedSession<T extends EditableReviewedWeekSeed>(seed:T,day:keyof ReviewedWeekSchedule,newId:()=>string):T {
  if(seed.transition!=='first_reviewed'||!days.includes(day))throw Error('Choose a first-review training day.')
  const next=structuredClone(seed),schedule=next.recipe.schedules.find(s=>s.id===next.scheduleId)
  if(!schedule||schedule.days[day]!==null||next.recipe.sessions.length>=7)throw Error('Choose an empty training day.')
  const baselineDay=next.recipe.baseSchedule[day]===null?day:days.find(d=>next.recipe.baseSchedule[d]===null)
  if(!baselineDay)throw Error('No baseline day is available for this session.')
  const sessionId=newId(),preparation:ReviewedWeekStep={kind:'preparation_window',id:newId(),seconds:NaN,
    activities:[blankActivity(newId(),'preparation')],instructions:[]}
  next.recipe.sessions.push({id:sessionId,themes:[],instructions:[],steps:[preparation,blankActivity(newId(),'working'),
    {kind:'allowance',id:newId(),purpose:'logging',seconds:NaN}]})
  // A move can free a proposed day still occupied in the original draft
  // allocation. Keep every session in both schedules, just as explicit copying
  // does. This is untrusted draft allocation, never intermediate legacy work.
  schedule.days[day]=sessionId;next.recipe.baseSchedule[baselineDay]=sessionId
  return next
}
export type FirstReviewedNewStep='working'|'preparation'|'monitoring'|'cooldown'|'transition'|'recovery'
export function addFirstReviewedStep<T extends EditableReviewedWeekSeed>(seed:T,sessionId:string,kind:FirstReviewedNewStep,newId:()=>string):T {
  if(seed.transition!=='first_reviewed'||!['working','preparation','monitoring','cooldown','transition','recovery'].includes(kind))throw Error('Choose a first-review activity or allowance.')
  const next=structuredClone(seed),session=next.recipe.sessions.find(s=>s.id===sessionId)
  if(!session||session.steps.length>=100)throw Error('Select a session with room for another step.')
  let step:ReviewedWeekStep
  if(kind==='transition'||kind==='recovery')step={kind:'allowance',id:newId(),purpose:kind,seconds:NaN}
  else {
    step=blankActivity(newId(),kind)
    if(kind==='monitoring'){
      step.protocolId=newId();next.recipe.protocols.push({id:step.protocolId,sessionId,activityId:step.id,
        instructions:[],sensorMetadata:null,actualObservations:[]})
    }
  }
  const logging=session.steps.findIndex(s=>s.kind==='allowance'&&s.purpose==='logging')
  if(logging<0||logging!==session.steps.length-1)throw Error('Restore the final logging allowance before adding work.')
  session.steps.splice(logging,0,step)
  return next
}
