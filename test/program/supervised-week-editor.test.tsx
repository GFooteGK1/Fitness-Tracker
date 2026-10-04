/** @vitest-environment jsdom */
import React, { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SupervisedActivityEditor, SupervisedWeekEditor } from '@/app/program/supervised-week-editor'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'
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
