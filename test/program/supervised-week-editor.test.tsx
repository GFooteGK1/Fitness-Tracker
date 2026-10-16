/** @vitest-environment jsdom */
import React, { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SupervisedActivityEditor, SupervisedWeekEditor } from '@/app/program/supervised-week-editor'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
import { seedFirstReviewedWeek } from '@/app/lib/coach/first-reviewed-draft-editor'
import { firstReviewedProgram } from '../fixtures/first-reviewed-program'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { compileOfflineReviewedWeek } from '@/app/lib/coach/offline-reviewed-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { effortWorkPlan } from '../fixtures/reviewed-effort-work'
import type { ReviewedWeekActivity } from '@/app/lib/coach/offline-reviewed-week'

afterEach(cleanup)
function activityHarness(activity: ReviewedWeekActivity) {
  let last = structuredClone(activity)
  function Editor() {
    const [value, setValue] = useState(activity)
    return <SupervisedActivityEditor activity={value} onChange={next => { last = next; setValue(next) }} />
  }
  render(<Editor />)
  return () => last
}
function working() { return reviewedSessionActivities(effortWorkPlan().scheduledSessions[0].prescription.content).find(a => a.id === 'required-work')! }

describe('proposed complete-week editing', () => {
  it('builds an initial week from explicit blank sessions with effort/rest and monitoring entry',()=>{
    const p=firstReviewedProgram(),seed=seedFirstReviewedWeek(p,p.athleteId)!;let last=seed
    function Editor(){const [value,setValue]=useState(seed);return <SupervisedWeekEditor value={value} onChange={next=>{last=next;setValue(next)}} />}
    render(<Editor />)
    expect(screen.queryByLabelText('Sets')).toBeNull()
    fireEvent.change(screen.getByLabelText('New session day'),{target:{value:'tuesday'}})
    fireEvent.click(screen.getByRole('button',{name:'Create session'}))
    expect(last.recipe.sessions).toHaveLength(1)
    expect(screen.getByLabelText('Preparation window seconds')).toBeTruthy()
    expect(screen.getByLabelText('logging seconds')).toBeTruthy()
    expect(screen.getAllByLabelText('Minimum RPE')).toHaveLength(2)
    expect(screen.getAllByLabelText('Rest between sets (seconds)')).toHaveLength(2)
    const fields=screen.getAllByLabelText('Sets') as HTMLInputElement[]
    expect(fields.every(f=>f.value==='')).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'Add monitoring activity'}))
    expect(last.recipe.protocols[0].actualObservations).toEqual([])
    expect(screen.getByLabelText('Monitoring protocol instructions')).toBeTruthy()
    expect(last.recipe.sessions[0].steps.at(-1)).toMatchObject({kind:'allowance',purpose:'logging'})
    expect(last.transition).toBe('first_reviewed')
    expect(screen.queryByText(/Next-week proposals require/)).toBeNull()
  })
  it('authors all required fields from blank UI controls and compiles the exact proposed session and monitoring protocol',()=>{
    const p=firstReviewedProgram(),seed=seedFirstReviewedWeek(p,p.athleteId)!,fixture=reviewedRollingWeek();let last=seed
    const source=reviewedSessionActivities(fixture.registry[0].recipe.sessions[0]).find(a=>a.role==='working')!
    function Editor(){const [value,setValue]=useState(seed);return <SupervisedWeekEditor value={value} onChange={next=>{last=next;setValue(next)}} />}
    render(<Editor />)
    fireEvent.change(screen.getByLabelText('New session day'),{target:{value:'monday'}})
    fireEvent.click(screen.getByRole('button',{name:'Create session'}))
    fireEvent.click(screen.getByRole('button',{name:'Add monitoring activity'}))
    const fill=(label:string,value:string|number,index?:number)=>fireEvent.change(index===undefined?screen.getByLabelText(label):screen.getAllByLabelText(label)[index],{target:{value:String(value)}})
    fill('Session focus','Synthetic force work');fill('Session instructions','Mechanical authoring proof only.')
    fill('Preparation window seconds',300);fill('Preparation instructions','Rehearse the prescribed working movement.')
    fill('logging seconds',60)
    for(let i=0;i<3;i++){
      fill('Movement',source.movementId,i)
      for(const equipment of source.requiredEquipment)fireEvent.click(screen.getAllByLabelText(equipment.replaceAll('_',' '))[i])
      fill('Sets',i===1?2:1,i);fill('Minimum repetitions',i===0?5:2,i);fill('Maximum repetitions',i===0?5:2,i)
      fill('Estimated seconds per repetition (time planning only)',3,i)
      fill('How to choose the weight','Use the explicitly reviewed synthetic test load; no observed result is assumed.',i)
      fill('Minimum RPE',i===0?3:6,i);fill('Maximum RPE',i===0?4:7,i)
      fill('Rest between sets (seconds)',i===1?120:0,i);fill('Rest after this movement (seconds)',i===0?60:0,i)
      fill('Movement instructions','Keep controlled mechanics and record actual results separately.',i)
    }
    fill('Monitoring protocol instructions','Use the same setup and measure each repetition; no observations have been entered.')
    fill('Week instructions','Synthetic UI/compiler qualification, not a personal program.')
    fill('Limitations and questions for review','No performance outcome or training adherence is claimed.')
    const context=structuredClone(fixture.input.context);context.profile.startDate=last.windowStart;context.scheduleId=last.scheduleId
    const recipe={...fixture.registry[0].recipe,...last.recipe,profileHash:doseContentHash(context.profile)}
    const compiled=compileOfflineReviewedWeek(context,[{recipe,contentHash:doseContentHash(recipe)}])
    expect(compiled.kind,JSON.stringify(compiled)).toBe('compiled')
    if(compiled.kind!=='compiled')throw Error('Expected exact compiled authored session')
    expect(compiled.week.days.find(d=>d.day==='monday')!.session).toEqual(last.recipe.sessions[0])
    expect(compiled.week.protocols).toEqual(last.recipe.protocols)
    expect(compiled.week.protocols[0].actualObservations).toEqual([])
    expect(compiled.week.numericRuntimeEligible).toBe(false)
    expect(last.transition).toBe('first_reviewed')
  })
  it('removes obsolete conditional timing when the last effort-led step is removed', () => {
    const seed = seedSupervisedWeek(effortWorkPlan(), 'next_week')!, session = seed.recipe.sessions[0]
    delete session.optionalTail
    session.steps = session.steps.filter(s => !s.id.startsWith('optional-'))
    session.steps.splice(2, 0, { ...structuredClone(working()), id: 'ordinary', work: { kind: 'duration', seconds: 60, sides: 1, sideSwitchSeconds: 0 } })
    let last = seed
    function Editor() {
      const [value, setValue] = useState(seed)
      return <SupervisedWeekEditor value={value} onChange={next => { last = next; setValue(next) }} />
    }
    render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: /^Session 1 ·/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }))
    expect(last.recipe.sessions[0].conditionalTiming).toBeUndefined()
    expect(last.recipe.sessions[0].steps.some(s => s.id === 'ordinary')).toBe(true)
    expect(seed.recipe.sessions[0].conditionalTiming).toBeDefined()
  })
  it('edits RIR independently of RPE, loads, preparation and original accepted work', () => {
    const original = working(), read = activityHarness(original)
    fireEvent.change(screen.getByLabelText('Target reps in reserve (RIR)'), { target: { value: '3' } })
    expect(read().work).toMatchObject({ targetRir: 3 })
    expect(read().effort).toEqual(original.effort)
    expect(read().load).toEqual(original.load)
    expect(original.work).toMatchObject({ targetRir: 2 })
    fireEvent.change(screen.getByLabelText('Minimum RPE'), { target: { value: '6' } })
    expect(read().effort).toMatchObject({ min: 6 })
    expect(read().work).toMatchObject({ targetRir: 3 })
    expect(screen.getByText(/time estimate is not a repetition target/)).toBeTruthy()
  })

  it('keeps qualitative preparation recovery as needed when editing its estimate', () => {
    const a = working(); a.role = 'preparation'; a.restBetweenSeconds = { kind: 'as_needed', estimatedSeconds: 90 }
    const read = activityHarness(a)
    fireEvent.change(screen.getByLabelText('Rest between sets estimate (seconds)'), { target: { value: '120' } })
    expect(read().restBetweenSeconds).toEqual({ kind: 'as_needed', estimatedSeconds: 120 })
    expect(screen.getByText(/does not cap recovery/)).toBeTruthy()
  })

  it('requires a new explicit effort target when switching work type instead of inventing a dose', () => {
    const a = working(); a.work = { kind: 'repetitions', repetitions: { min: 8, max: 12 }, sides: 2, secondsPerRep: 3 }
    const read = activityHarness(a)
    fireEvent.click(screen.getByRole('button', { name: 'Use effort-led repetitions instead' }))
    expect(read().work).toMatchObject({ kind: 'effort_repetitions', sides: 2, targetRir: NaN, estimatedSecondsPerSet: NaN })
    expect((screen.getByLabelText('Target reps in reserve (RIR)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Target reps in reserve (RIR)') as HTMLInputElement).validity.valid).toBe(false)
  })

  it('renders complete nested preparation, optional boundary, protocol and week guidance', () => {
    const seed = seedSupervisedWeek(effortWorkPlan(), 'next_week')!
    const view = render(<SupervisedWeekEditor value={seed} onChange={() => {}} />)
    expect(screen.queryByLabelText('Sets')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Session 1 ·/ }))
    expect(screen.getByText(/Optional work begins here/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Session 1 ·/ }))
    const monitored = seed.recipe.sessions.findIndex(s => seed.recipe.protocols.some(p => p.sessionId === s.id))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Session ${monitored + 1} ·`) }))
    expect(screen.getAllByLabelText('Preparation window seconds').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Monitoring protocol instructions').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Week instructions')).toBeTruthy()
    view.rerender(<SupervisedWeekEditor value={seed} onChange={() => {}} disabled />)
    const sets = screen.getAllByLabelText('Sets')[0] as HTMLInputElement
    expect(sets.matches(':disabled')).toBe(true)
  })

  it('can change duration or distance work and select explicit RPE after a role change', () => {
    const activity = working(); activity.effort = { kind: 'quality', cue: 'Smooth movement' }
    const read = activityHarness(activity)
    fireEvent.change(screen.getByLabelText('Work type'), { target: { value: 'distance' } })
    fireEvent.change(screen.getByLabelText('Stage 1 name'), { target: { value: 'Controlled run' } })
    fireEvent.change(screen.getByLabelText('Stage 1 metres'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('Effort type'), { target: { value: 'rpe' } })
    fireEvent.change(screen.getByLabelText('Minimum RPE'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Maximum RPE'), { target: { value: '6' } })
    expect(read().work).toMatchObject({ kind: 'distance', stages: [{ label: 'Controlled run', metres: 400 }], targetSeconds: null })
    expect(read().effort).toEqual({ kind: 'rpe', min: 5, max: 6 })
    fireEvent.change(screen.getByLabelText('Work type'), { target: { value: 'duration' } })
    expect(read().work).toMatchObject({ kind: 'duration', seconds: NaN })
    expect(read().effort).toEqual({ kind: 'rpe', min: 5, max: 6 })
  })
})
