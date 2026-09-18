'use client'

import { useEffect, useRef, useState } from 'react'
import type { CompleteProgrammingSessionPrescription } from '@/app/lib/coach/programming-schema'
import { signalRequiresActualWork, summarizeSignalWork, validateSessionSignal,
  type SessionSignalInput, type SessionSignalRecord } from '@/app/lib/coach/session-signals'

interface Props {
  sessionId: string
  prescription: CompleteProgrammingSessionPrescription
  disabled: boolean
  onEvidence: (loaded: boolean, summary: string, hasDraft: boolean) => void
}
const field = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-white'

export function SessionSignalPanel({ sessionId, prescription, disabled, onEvidence }: Props) {
  const [records, setRecords] = useState<SessionSignalRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const owner = useRef<string | null>(null)
  const currentSession = useRef(sessionId)
  currentSession.current = sessionId
  const mounted = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exerciseId, setExerciseId] = useState('')
  const [scope, setScope] = useState<SessionSignalInput['ratingScope']>('hardest_set')
  const [workStatus, setWorkStatus] = useState<SessionSignalInput['workStatus']>('unsure')
  const [rpe, setRpe] = useState('')
  const [reps, setReps] = useState('')
  const [load, setLoad] = useState('')
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb')
  const [sets, setSets] = useState('')
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')
  const pending = useRef<{ requestId: string; signal: SessionSignalInput } | null>(null)
  const hasDraft = Boolean(exerciseId || rpe || reps || load || sets || duration || note)
  const summary = summarizeSignalWork(records, prescription)

  useEffect(() => { onEvidence(loaded, summary, hasDraft) }, [loaded, summary, hasDraft, onEvidence])
  useEffect(() => {
    let cancelled = false
    mounted.current = true
    setLoaded(false)
    void fetch(`/api/coach/sessions/${sessionId}/signals`).then(async response => {
      const body = await response.json()
      if (!response.ok || !Array.isArray(body.signals)) throw new Error('Saved exercise feedback is unavailable. Retry before confirming prescribed work.')
      if (!cancelled) { owner.current = body.userId ?? null; setRecords(body.signals); setLoaded(true); setError(null) }
    }).catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Exercise feedback unavailable') })
    return () => { cancelled = true; mounted.current = false }
  }, [sessionId, loadAttempt])

  const save = async () => {
    const requestSession = sessionId
    const requestOwner = owner.current
    setError(null)
    if (!pending.current) {
      const validation = validateSessionSignal({ schemaVersion: 1, exerciseId, ratingScope: scope, workStatus,
        ...(rpe ? { rpe: Number(rpe), rpeScale: 'effort_0_10' } : {}),
        ...(reps ? { actualReps: Number(reps) } : {}),
        ...(load ? { actualLoad: Number(load), actualLoadUnit: unit } : {}),
        ...(sets ? { completedWorkingSets: Number(sets) } : {}),
        ...(duration ? { actualDurationMinutes: Number(duration) } : {}), ...(note.trim() ? { note: note.trim() } : {}) })
      if (!validation.ok) { setError(validation.error); return }
      pending.current = { requestId: crypto.randomUUID(), signal: validation.value }
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/coach/sessions/${sessionId}/signals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pending.current, expectedUserId: owner.current })
      })
      const body = await response.json()
      if (!mounted.current || currentSession.current !== requestSession || owner.current !== requestOwner) return
      if (!response.ok || !body.id) throw new Error(body.error ?? 'The save response was interrupted. Retry this same feedback.')
      setRecords(current => current.some(row => row.id === body.id) ? current : [...current, body])
      pending.current = null
      setExerciseId(''); setRpe(''); setReps(''); setLoad(''); setSets(''); setDuration(''); setNote(''); setWorkStatus('unsure')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Exercise feedback save is unconfirmed. Retry this same feedback.') }
    finally { setSaving(false) }
  }

  return <details className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[var(--accent)]">Exercise feedback (optional)</summary>
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Report only what you know. Hardest-set effort stays separate from session effort.</p>
    {records.length > 0 && <p className="mt-2 text-sm">{records.length} saved report{records.length === 1 ? '' : 's'}{records.some(row => signalRequiresActualWork(row.signal)) ? ' · actual work will be included when you finish' : ''}.</p>}
    {!loaded && !error && <p className="mt-2 text-sm" role="status">Loading saved exercise feedback…</p>}
    {!loaded && error && <button type="button" className="app-secondary mt-2" onClick={() => { setError(null); setLoadAttempt(value => value + 1) }}>Retry loading exercise feedback</button>}
    <fieldset disabled={disabled || saving || pending.current !== null} className="mt-3 grid gap-3 disabled:opacity-60 sm:grid-cols-2">
      <label className="text-sm">Exercise<select aria-label="Feedback exercise" className={field} value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
        <option value="">Choose an exercise</option>
        {prescription.blocks.flatMap(block => block.exercises.map((exercise, index) => <option key={`${block.id}:${index}`} value={`${block.id}:${index}`}>{exercise.movementName}</option>))}
      </select></label>
      <label className="text-sm">Report scope<select aria-label="Report scope" className={field} value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="hardest_set">Hardest set</option><option value="effort">This effort</option></select></label>
      <label className="text-sm">Work completed<select aria-label="Exercise work status" className={field} value={workStatus} onChange={event => setWorkStatus(event.target.value as typeof workStatus)}><option value="unsure">Not specified</option><option value="as_planned">As planned</option><option value="changed">Changed</option></select></label>
      <label className="text-sm">Effort, 0–10 (optional)<input aria-label="Exercise effort" type="number" min="0" max="10" step="0.5" className={field} value={rpe} onChange={event => setRpe(event.target.value)} /></label>
      <label className="text-sm">Reps in this set (optional)<input aria-label="Reported reps" type="number" min="0" max="1000" className={field} value={reps} onChange={event => setReps(event.target.value)} /></label>
      <label className="text-sm">Load for this set (optional)<input aria-label="Reported load" type="number" min="0" max="2000" className={field} value={load} onChange={event => setLoad(event.target.value)} /></label>
      <label className="text-sm">Load unit<select aria-label="Reported load unit" className={field} value={unit} onChange={event => setUnit(event.target.value as typeof unit)}><option value="lb">lb</option><option value="kg">kg</option></select></label>
      <label className="text-sm">Work sets finished (optional)<input aria-label="Work sets finished" type="number" min="0" max="100" className={field} value={sets} onChange={event => setSets(event.target.value)} /></label>
      <label className="text-sm">Minutes on this exercise (optional)<input aria-label="Exercise minutes" type="number" min="0" max="1440" step="0.5" className={field} value={duration} onChange={event => setDuration(event.target.value)} /></label>
      <label className="text-sm">Note (optional)<input aria-label="Exercise feedback note" maxLength={500} className={field} value={note} onChange={event => setNote(event.target.value)} /></label>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <button type="button" className="app-secondary mt-3" disabled={disabled || saving || !loaded || !owner.current || (!pending.current && !exerciseId)} onClick={() => void save()}>{saving ? 'Saving…' : pending.current ? 'Retry same feedback' : 'Save exercise feedback'}</button>
  </details>
}
