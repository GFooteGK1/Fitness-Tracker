'use client'
import React from 'react'
import { COACH_PROGRAM_DOMAIN_IDS } from '@/app/lib/coach/types'
import { MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'
import { REVIEWED_EQUIPMENT_ALIASES } from '@/app/lib/coach/reviewed-movement-eligibility'
import { reviewedSetupEditorValue,validReviewedSetupEdit } from '@/app/lib/coach/reviewed-setup-memory'

const field='mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:bg-gray-900 dark:text-white'
const label=(s:string)=>s.replaceAll('_',' ')
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const string=(v:unknown)=>typeof v==='string'?v:''
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[]
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const equipment=[...new Set<string>([...MOVEMENT_EQUIPMENT_IDS,...Object.keys(REVIEWED_EQUIPMENT_ALIASES)])]
interface Props {memoryKey:string;value:Record<string,unknown>;onChange:(value:Record<string,unknown>)=>void;disabled?:boolean}

/** Controlled declaration editor. No fetch, confirmation, prescription or inferred defaults. */
export function ReviewedSetupEditor({memoryKey,value,onChange,disabled=false}:Props){
  const current=reviewedSetupEditorValue(memoryKey,value)
  const set=(change:Record<string,unknown>)=>onChange({...current,...change})
  const domainOptions=<><option value="">Choose a fitness component</option>{COACH_PROGRAM_DOMAIN_IDS.map(d=><option key={d} value={d}>{label(d)}</option>)}</>
  let controls:React.ReactNode
  if(memoryKey==='training_schedule'){
    const availability=array(current.sessionAvailability)
    controls=<>
      <label className="block">Training experience<select className={field} value={string(current.experience)} onChange={e=>set({experience:e.target.value})}>
        <option value="">Choose experience</option><option value="new_or_returning">New or returning</option><option value="consistent">Consistent</option><option value="experienced">Experienced</option>
      </select></label>
      <p>Choose two to six days and your actual time limit for each. New days have no assumed time.</p>
      {days.map(day=>{const slot=availability.find(v=>record(v)&&v.day===day);return <div key={day} className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 capitalize"><input type="checkbox" checked={!!slot}
          disabled={!slot&&availability.length>=6} onChange={e=>set({sessionAvailability:e.target.checked?[...availability,{day,minutes:Number.NaN}]:availability.filter(v=>!record(v)||v.day!==day)})}/>{day}</label>
        {record(slot)&&<label>Minutes on {day}<input className={field} type="number" min={30} max={90} step={1}
          value={typeof slot.minutes==='number'&&Number.isFinite(slot.minutes)?slot.minutes:''} onChange={e=>set({sessionAvailability:availability.map(v=>record(v)&&v.day===day?{...v,minutes:e.target.value===''?Number.NaN:Number(e.target.value)}:v)})}/></label>}
      </div>})}
    </>
  }else if(memoryKey==='available_equipment'){
    const ids=array(current.resolvedEquipmentIds)
    controls=<>
      <label className="block">Your equipment and training space<textarea className={field} rows={3} maxLength={4000} value={string(current.equipment)} onChange={e=>set({equipment:e.target.value})}/></label>
      <p>Select only equipment and space you can confirm. Your wording stays in the saved record.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2">{equipment.map(id=><label key={id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={ids.includes(id)}
        onChange={e=>set({resolvedEquipmentIds:e.target.checked?[...ids,id]:ids.filter(v=>v!==id)})}/>{label(id)}</label>)}</div>
      <label className="block">Equipment or space still needing clarification<textarea className={field} rows={2} maxLength={4000}
        value={string(current.unresolvedAthleteDescription)} onChange={e=>set({unresolvedAthleteDescription:e.target.value.trim()?e.target.value:null})}/></label>
      <p>Clear the clarification field only after resolving those questions. Selecting equipment does not resolve them automatically.</p>
    </>
  }else if(memoryKey==='primary_goal'){
    const goals=array(current.secondaryGoals)
    controls=<>
      <label className="block">Your goal<textarea className={field} maxLength={500} rows={3} value={string(current.goal)} onChange={e=>set({goal:e.target.value})}/></label>
      <label className="block">Primary fitness component<select className={field} value={string(current.primaryDomain)} onChange={e=>set({primaryDomain:e.target.value})}>{domainOptions}</select></label>
      {goals.map((raw,i)=>{const goal=record(raw)?raw:{};const change=(v:Record<string,unknown>)=>set({secondaryGoals:goals.map((g,j)=>j===i?{...goal,...v}:g)})
        return <fieldset key={i} className="space-y-2 rounded-lg border p-3"><legend>Supporting goal {i+1}</legend>
          <label className="block">Fitness component {i+1}<select className={field} value={string(goal.domain)} onChange={e=>change({domain:e.target.value})}>{domainOptions}</select></label>
          <label className="block">Training emphasis {i+1}<select className={field} value={string(goal.allocation)} onChange={e=>change({allocation:e.target.value})}>
            <option value="">Choose emphasis</option><option value="development">Develop</option><option value="maintenance">Maintain</option></select></label>
          <label className="block">Purpose of supporting goal {i+1}<textarea className={field} rows={2} maxLength={500} value={string(goal.athleteIntent)} onChange={e=>change({athleteIntent:e.target.value})}/></label>
          <button className="app-secondary min-h-11" type="button" onClick={()=>set({secondaryGoals:goals.filter((_,j)=>i!==j)})}>Remove supporting goal {i+1}</button>
        </fieldset>})}
      <button className="app-secondary min-h-11" type="button" disabled={goals.length>=5} onClick={()=>set({secondaryGoals:[...goals,{domain:'',allocation:'',athleteIntent:''}]})}>Add supporting goal</button>
    </>
  }else if(memoryKey==='training_constraints'){
    const kinds=array(current.constraintKinds)
    controls=<>
      <label className="block">Constraints or questions to clarify<textarea className={field} rows={3} maxLength={4000} value={string(current.constraints)} onChange={e=>set({constraints:e.target.value})}/></label>
      {(['no_overhead','no_running'] as const).map(kind=><label key={kind} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={kinds.includes(kind)}
        onChange={e=>set({constraintKinds:e.target.checked?[...kinds,kind]:kinds.filter(v=>v!==kind)})}/>{kind==='no_overhead'?'Overhead work is unavailable':'Running is unavailable'}</label>)}
    </>
  }else return <p role="alert">This setup field needs a different editor.</p>
  return <fieldset disabled={disabled} className="space-y-3 text-base">{controls}
    {!validReviewedSetupEdit(memoryKey,current)&&<p role="status">Complete valid choices before saving. Days need 30–90 minutes; fitness components must be distinct; equipment questions may remain unresolved.</p>}
  </fieldset>
}
