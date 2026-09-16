'use client'

import React, { useEffect, useRef, useState } from 'react'
import { MOVEMENT_CATALOG } from '@/app/lib/coach/movement-catalog'
import { EXERCISE_INTERESTS, preferenceSummary, validateExercisePreferences, type ExercisePreferences } from '@/app/lib/coach/exercise-preferences'

export const PREFERENCES_CHANGED_EVENT = 'coach-exercise-preferences-changed'
const buttonClass = 'app-secondary min-h-11 text-sm disabled:opacity-50'

export function ExercisePreferencesEditor({ value, onChange, disabled = false, onSkip }: {
  value?: ExercisePreferences
  onChange: (value: ExercisePreferences | undefined) => void
  disabled?: boolean
  onSkip?: () => void
}) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const entries = value?.entries ?? []
  const search = query.trim().toLowerCase()
  const suggestions = [
    ...EXERCISE_INTERESTS.map(interest => ({ label: interest.label, target: { kind: 'interest' as const, id: interest.id } })),
    ...MOVEMENT_CATALOG.map(movement => ({ label: movement.name, target: { kind: 'movement' as const, id: movement.id } }))
  ].filter(item => (!search || item.label.toLowerCase().includes(search)) && !entries.some(entry => entry.target.kind === item.target.kind && entry.target.id === item.target.id)).slice(0, 6)
  const add = (entry: ExercisePreferences['entries'][number]) => {
    const next: ExercisePreferences = { schemaVersion: 1, state: 'specified', entries: [...entries, entry] }
    if (!validateExercisePreferences(next)) {
      setError('Use up to 12 different favorites, with at most 160 characters each.')
      return
    }
    onChange(next)
    setQuery('')
    setError(null)
  }
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="text-sm font-semibold">Which exercises or lifts do you enjoy and want to keep in your training?</legend>
    <p className="text-sm text-[var(--muted)]">Optional. Favorites help choose suitable exercises. They do not establish your skill level or guarantee inclusion.</p>
    {value?.state === 'none' && <p className="text-sm">No preference selected.</p>}
    {entries.length > 0 && <ul className="space-y-2">{entries.map((entry, index) => <li key={`${entry.target.kind}:${entry.target.id ?? entry.athleteWording}`} className="flex items-center justify-between gap-3">
      <span className="text-sm">{entry.athleteWording}{entry.target.kind === 'unresolved' ? ' — interest saved; movement match not confirmed' : ''}</span>
      <button type="button" className={buttonClass} aria-label={`Remove ${entry.athleteWording}`} onClick={() => {
        const remaining = entries.filter((_, entryIndex) => entryIndex !== index)
        onChange({ schemaVersion: 1, state: remaining.length ? 'specified' : 'none', entries: remaining })
      }}>Remove</button>
    </li>)}</ul>}
    <label className="block text-sm font-medium">Find an exercise or describe an interest
      <input value={query} maxLength={160} disabled={disabled || entries.length >= 12} onChange={event => { setQuery(event.target.value); setError(null) }} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--foreground)] focus:border-[var(--accent-line)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
    </label>
    <div className="flex flex-wrap gap-2">{suggestions.map(item => <button key={`${item.target.kind}:${item.target.id}`} type="button" className={buttonClass} disabled={disabled || entries.length >= 12} onClick={() => add({ athleteWording: item.label, target: item.target })}>{item.label}</button>)}</div>
    {search && <button type="button" className={buttonClass} disabled={disabled || entries.length >= 12} onClick={() => add({ athleteWording: query.trim(), target: { kind: 'unresolved' } })}>Keep “{query.trim()}” as an interest</button>}
    <p className="text-xs text-[var(--muted)]">{entries.length}/12 favorites. Broad interests may include movements the coach cannot prescribe yet.</p>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} onClick={() => { onChange({ schemaVersion: 1, state: 'none', entries: [] }); setQuery(''); setError(null) }}>No preference</button>
      {onSkip && <button type="button" className={buttonClass} onClick={() => { setQuery(''); setError(null); onSkip() }}>Skip for now</button>}
    </div>
  </fieldset>
}

/** Saved preferences stay out of the request until the athlete deliberately edits them. */
export function SetupExercisePreferences({ value, onChange, disabled }: {
  value?: ExercisePreferences
  onChange: (value: ExercisePreferences | undefined) => void
  disabled: boolean
}) {
  const [saved, setSaved] = useState<ExercisePreferences | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [editing, setEditing] = useState(false)
  const [readError, setReadError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  useEffect(() => {
    const refreshPreferences = () => {
      changeRef.current(undefined)
      setEditing(false)
      setEnabled(false)
      setRefresh(current => current + 1)
    }
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refreshPreferences)
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, refreshPreferences)
  }, [])
  useEffect(() => {
    let cancelled = false
    setReadError(false)
    void fetch('/api/coach/intake').then(async response => {
      if (!response.ok) throw new Error('Preference read failed')
      const body = await response.json()
      if (cancelled) return
      if (body.exercisePreferences != null && !validateExercisePreferences(body.exercisePreferences)) throw new Error('Invalid preferences')
      setSaved(body.exercisePreferences ?? null)
      setEnabled(body.exercisePreferencesEnabled === true)
    }).catch(() => { if (!cancelled) { setEnabled(false); setReadError(true) } })
    return () => { cancelled = true }
  }, [refresh])
  if (readError) return <div className="mt-5 text-sm"><p>Favorites could not be loaded. Existing preferences will be preserved.</p><button type="button" className={buttonClass} onClick={() => setRefresh(current => current + 1)}>Retry favorites</button></div>
  if (!enabled) return null
  return <div className="mt-5 rounded-xl border border-[var(--line)] p-4">
    {saved && !editing && !value ? <><p className="text-sm font-semibold">Favorite exercises and interests</p><p className="mt-2 text-sm">{preferenceSummary(saved)}</p><button type="button" disabled={disabled} className={`${buttonClass} mt-2`} onClick={() => { setEditing(true); onChange(saved) }}>Edit favorites</button></> : <ExercisePreferencesEditor value={value} disabled={disabled} onChange={onChange} onSkip={() => { onChange(undefined); setEditing(false) }} />}
    {value && <p className="mt-3 text-sm text-[var(--muted)]">Your answer will be confirmed when you save setup. Favorites influence new-program and changed-direction drafts. Accepted exercises stay in place until a reviewed change.</p>}
  </div>
}

export function ExercisePreferenceNotes({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null
  return <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
    <p className="text-sm font-semibold">How your favorites fit</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{notes.map(note => <li key={note}>{note}</li>)}</ul>
  </div>
}
