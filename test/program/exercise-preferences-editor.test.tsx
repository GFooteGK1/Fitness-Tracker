// @vitest-environment jsdom
import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExercisePreferencesEditor, SetupExercisePreferences, PREFERENCES_CHANGED_EVENT } from '@/app/program/exercise-preferences-editor'
import type { ExercisePreferences } from '@/app/lib/coach/exercise-preferences'

const saved: ExercisePreferences = { schemaVersion: 1, state: 'specified', entries: [{ athleteWording: 'Squat variations', target: { kind: 'interest', id: 'squat_variations' } }] }
const response = (value: unknown) => ({ ok: true, json: async () => value })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('exercise preference collection', () => {
  it('keeps own wording unresolved and distinguishes none from skip', () => {
    const changed = vi.fn()
    const skipped = vi.fn()
    render(<ExercisePreferencesEditor onChange={changed} onSkip={skipped} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Balance practice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Keep “Balance practice” as an interest' }))
    expect(changed).toHaveBeenLastCalledWith({ schemaVersion: 1, state: 'specified', entries: [{ athleteWording: 'Balance practice', target: { kind: 'unresolved' } }] })
    fireEvent.click(screen.getByRole('button', { name: 'No preference' }))
    expect(changed).toHaveBeenLastCalledWith({ schemaVersion: 1, state: 'none', entries: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(skipped).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox').className).toContain('text-base')
    expect(screen.getByRole('button', { name: 'No preference' }).className).toContain('min-h-11')
  })

  it('keeps saved snapshot out of intake until edited and refreshes after correction', async () => {
    let snapshot = saved
    vi.stubGlobal('fetch', vi.fn(async () => response({ exercisePreferencesEnabled: true, exercisePreferences: snapshot })))
    const changed = vi.fn()
    function Harness() {
      const [value, setValue] = useState<ExercisePreferences>()
      return <SetupExercisePreferences value={value} disabled={false} onChange={next => { changed(next); setValue(next) }} />
    }
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit favorites' }))
    expect(changed).toHaveBeenCalledWith(saved)
    snapshot = { schemaVersion: 1, state: 'none', entries: [] }
    await act(async () => { window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT)) })
    expect(changed).toHaveBeenLastCalledWith(undefined)
    expect(await screen.findByText('No exercise preference')).not.toBeNull()
  })

  it('removes a saved final favorite as explicit none and retains that choice after save and reload', async () => {
    let snapshot = saved
    const writes: ExercisePreferences[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        snapshot = body.planningInput.exercisePreferences
        writes.push(snapshot)
        return response({ saved: true })
      }
      return response({ exercisePreferencesEnabled: true, exercisePreferences: snapshot })
    }))
    function Harness() {
      const [value, setValue] = useState<ExercisePreferences>()
      return <><SetupExercisePreferences value={value} disabled={false} onChange={setValue} /><button onClick={() => {
        void fetch('/api/coach/intake', { method: 'POST', body: JSON.stringify({ planningInput: { exercisePreferences: value } }) })
      }}>Save setup</button></>
    }
    const first = render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit favorites' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Squat variations' }))
    expect(screen.getByText('No preference selected.')).not.toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save setup' })))
    expect(writes).toEqual([{ schemaVersion: 1, state: 'none', entries: [] }])
    first.unmount()
    render(<Harness />)
    expect(await screen.findByText('No exercise preference')).not.toBeNull()
    expect(screen.queryByText('Squat variations')).toBeNull()
  })

  it('does not overwrite an edit when a delayed read resolves', async () => {
    let finish!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
    const changed = vi.fn()
    const { rerender } = render(<SetupExercisePreferences disabled={false} onChange={changed} />)
    rerender(<SetupExercisePreferences value={saved} disabled={false} onChange={changed} />)
    await act(async () => finish(response({ exercisePreferencesEnabled: true, exercisePreferences: { schemaVersion: 1, state: 'none', entries: [] } })))
    expect(screen.getByRole('button', { name: 'Remove Squat variations' })).not.toBeNull()
    expect(changed).not.toHaveBeenCalled()
  })

  it('fails closed on read errors and hides collection with flag disabled', async () => {
    const changed = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({ exercisePreferencesEnabled: false, exercisePreferences: saved })))
    render(<SetupExercisePreferences disabled={false} onChange={changed} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry favorites' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry favorites' })).toBeNull())
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
  })
})
