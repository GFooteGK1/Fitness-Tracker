// @vitest-environment jsdom
import React,{useState} from 'react'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,describe,expect,it } from 'vitest'
import { ReviewedSetupEditor } from '@/app/program/reviewed-setup-editor'
import { reviewedSetupEditorValue,validReviewedSetupEdit } from '@/app/lib/coach/reviewed-setup-memory'
import { currentSetupContents } from '../fixtures/first-reviewed-setup'

afterEach(cleanup)
function Harness({memoryKey,initial,onSave,disabled=false}:{memoryKey:string;initial:Record<string,unknown>;onSave:(value:Record<string,unknown>)=>void;disabled?:boolean}){
  const [value,setValue]=useState(initial),current=reviewedSetupEditorValue(memoryKey,value)
  return <form onSubmit={e=>{e.preventDefault();onSave(current)}}><ReviewedSetupEditor memoryKey={memoryKey} value={value} onChange={setValue} disabled={disabled}/>
    <button type="submit" disabled={disabled||!validReviewedSetupEdit(memoryKey,current)}>Confirm setup</button></form>
}
function mount(key:string,initial=currentSetupContents()[key],disabled=false){let saved:Record<string,unknown>|undefined
  render(<Harness memoryKey={key} initial={initial} onSave={value=>{saved=value}} disabled={disabled}/>);return ()=>saved}
describe('structured current setup editing',()=>{
  it('edits unequal saved daily limits without flattening other days',()=>{
    const saved=mount('training_schedule')
    fireEvent.change(screen.getByLabelText('Minutes on tuesday'),{target:{value:'55'}})
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}))
    expect(saved()).toEqual({schemaVersion:2,experience:'experienced',sessionAvailability:[{day:'tuesday',minutes:55},{day:'saturday',minutes:75}]})
  })
  it('requires an explicit time on a newly selected day',()=>{
    const saved=mount('training_schedule')
    fireEvent.click(screen.getByRole('checkbox',{name:'monday'}));expect((screen.getByLabelText('Minutes on monday') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('button',{name:'Confirm setup'}) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Minutes on monday'),{target:{value:'40'}})
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}));expect(saved()).toMatchObject({sessionAvailability:[{day:'tuesday',minutes:45},{day:'saturday',minutes:75},{day:'monday',minutes:40}]})
  })
  it('converts saved uniform declarations only when explicitly submitted',()=>{
    const saved=mount('training_schedule',{experience:'consistent',trainingDays:['monday','friday'],sessionMinutes:55,startDate:'2026-09-14'})
    expect(saved()).toBeUndefined();fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}))
    expect(saved()).toEqual({schemaVersion:2,experience:'consistent',sessionAvailability:[{day:'monday',minutes:55},{day:'friday',minutes:55}]})
  })
  it('keeps original equipment wording and unresolved questions when adding a confirmed implement',()=>{
    const saved=mount('available_equipment')
    fireEvent.click(screen.getByRole('checkbox',{name:'high handle trap bar'}));fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}))
    expect(saved()).toMatchObject({equipment:' A bench, barbell and an unmeasured outdoor area. ',
      resolvedEquipmentIds:['barbell','bench','bodyweight','high_handle_trap_bar'],unresolvedAthleteDescription:'Outdoor distance and runout need confirmation.'})
    fireEvent.change(screen.getByLabelText('Equipment or space still needing clarification'),{target:{value:''}})
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}));expect(saved()).toMatchObject({unresolvedAthleteDescription:null})
  })
  it('retains legacy equipment prose as a question until the athlete resolves it',()=>{
    const saved=mount('available_equipment',{equipment:'Barbell and maybe a running area.',resolvedEquipmentIds:['barbell']})
    expect((screen.getByLabelText('Equipment or space still needing clarification') as HTMLTextAreaElement).value).toBe('Barbell and maybe a running area.')
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}));expect(saved()).toMatchObject({schemaVersion:2,equipment:'Barbell and maybe a running area.',unresolvedAthleteDescription:'Barbell and maybe a running area.'})
  })
  it('requires explicit component, emphasis and purpose for each new supporting goal',()=>{
    const saved=mount('primary_goal');fireEvent.click(screen.getByRole('button',{name:'Add supporting goal'}))
    expect((screen.getByRole('button',{name:'Confirm setup'}) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Fitness component 2'),{target:{value:'speed_agility'}})
    fireEvent.change(screen.getByLabelText('Training emphasis 2'),{target:{value:'development'}})
    fireEvent.change(screen.getByLabelText('Purpose of supporting goal 2'),{target:{value:'Develop upright running speed.'}})
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}))
    expect(saved()).toMatchObject({secondaryGoals:[{domain:'strength',allocation:'maintenance'},{domain:'speed_agility',allocation:'development',athleteIntent:'Develop upright running speed.'}]})
    fireEvent.change(screen.getByLabelText('Primary fitness component'),{target:{value:'speed_agility'}})
    expect((screen.getByRole('button',{name:'Confirm setup'}) as HTMLButtonElement).disabled).toBe(true)
  })
  it('requires an athlete-selected restriction and retains clarification wording',()=>{
    const saved=mount('training_constraints');fireEvent.click(screen.getByRole('checkbox',{name:'Running is unavailable'}))
    fireEvent.click(screen.getByRole('button',{name:'Confirm setup'}));expect(saved()).toEqual({constraints:'Ask about the outdoor surface.',constraintKinds:['no_running']})
  })
  it('disables editing and saving while a caller is busy',()=>{
    const saved=mount('training_schedule',currentSetupContents().training_schedule,true)
    expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true)
    expect((screen.getByRole('button',{name:'Confirm setup'}) as HTMLButtonElement).disabled).toBe(true);expect(saved()).toBeUndefined()
  })
})
