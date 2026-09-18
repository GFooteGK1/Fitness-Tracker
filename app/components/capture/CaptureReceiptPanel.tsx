'use client'
import { useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { assertCaptureOwner, sendCaptureCorrection } from '@/app/lib/client/logging-request'
import type { CaptureReceipt, CaptureReceiptBundle } from '@/app/lib/capture/contracts'
import type { MealEntry } from '@/app/lib/types/food-tracking'
import MealEditModal from '../MealEditModal'

export interface ReceiptResult { receipt?: CaptureReceipt; receipts?: CaptureReceipt[]; receiptBundle?: CaptureReceiptBundle; state?: string }
export function captureSourceLabel(receipt: CaptureReceipt): string {
  const fields = Object.values(receipt.provenance.fields)
  const origins = [...new Set(fields.map(field => field.origin))]
  const labels: Record<string, string> = { model_estimated: 'Estimated', athlete_reported: 'Reported', copied_template: 'Copied estimate', imported_unverified: 'Imported, unverified', legacy_unknown: 'Earlier entry, source unknown' }
  const origin = origins.map(value => labels[value] ?? 'Source unknown').join(' · ')
  return `${origin}${fields.some(field => field.reviewState === 'unreviewed') ? ' · review available' : ' · reviewed'}`
}
const editableKeys = new Set(['name','title','reps','sets','weight','load','duration_min','duration_s','time_s','distance','rounds','rounds_completed','extra_reps','rpe','rest_s','min','max','value','unit'])
function WorkoutFields({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  if (Array.isArray(value)) return <div className="space-y-3">{value.map((child, index) => <fieldset className="rounded-lg border p-3" key={index}><legend className="text-sm">Item {index + 1}</legend><WorkoutFields value={child} onChange={next => onChange(value.map((item, i) => i === index ? next : item))} /></fieldset>)}</div>
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return <div className="space-y-2">{Object.entries(record).map(([key, child]) => {
    if (child && typeof child === 'object') return <WorkoutFields key={key} value={child} onChange={next => onChange({ ...record, [key]: next })} />
    if (!editableKeys.has(key) || (child !== null && !['string','number'].includes(typeof child))) return null
    const numeric = typeof child === 'number' || child === null
    return <label key={key} className="block text-sm capitalize">{key.replaceAll('_', ' ')}<input className="app-input min-h-11 w-full text-base" type={numeric ? 'number' : 'text'} step="any" value={child === null ? '' : String(child)} onChange={event => onChange({ ...record, [key]: numeric ? (event.target.value.trim() === '' ? null : Number(event.target.value)) : event.target.value })} /></label>
  })}</div>
}
export function CaptureReceiptPanel({ result }: { result: ReceiptResult }) {
  const { user } = useAuth()
  const [meal, setMeal] = useState<MealEntry | null>(null)
  const [workout, setWorkout] = useState<{ receipt: CaptureReceipt; record: Record<string, unknown>; execution: boolean; revision: number } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState<CaptureReceipt | null>(null)
  const receipts = (result.receiptBundle?.receipts ?? result.receipts ?? (result.receipt ? [result.receipt] : []))
    .map(receipt => updated?.entityId === receipt.entityId ? updated : receipt).filter(receipt => receipt.userId === user?.id)
  const unresolved = result.state === 'save_unconfirmed' || result.receiptBundle?.state === 'save_unconfirmed'
  const open = async (receipt: CaptureReceipt) => {
    setBusy(true); setMessage('')
    try {
      await assertCaptureOwner(receipt.userId)
      const response = await fetch(receipt.entityKind === 'meal' ? `/api/meals/${receipt.entityId}` : `/api/capture?kind=workout&entityId=${receipt.entityId}&expectedUserId=${encodeURIComponent(receipt.userId)}`)
      const current = await response.json()
      await assertCaptureOwner(receipt.userId)
      if (!response.ok) throw new Error(current.error ?? 'Entry unavailable')
      if (receipt.entityKind === 'meal') {
        if (current.meal?.userId !== receipt.userId) throw new Error('The signed-in account changed.')
        setMeal(current.meal)
      } else setWorkout({ receipt, record: current.record, revision: current.captureRevision ?? current.revision, execution: current.execution === true })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load the saved entry.') }
    finally { setBusy(false) }
  }
  const saveWorkout = async () => {
    if (!workout) return
    setBusy(true); setMessage('')
    try {
      const finite = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value) : value && typeof value === 'object' ? Object.values(value).every(finite) : true
      if (!finite(workout.record)) throw new Error('Enter finite quantities or leave unknown amounts blank.')
      const response = await sendCaptureCorrection('/api/capture', 'PATCH', { kind: 'workout', entityId: workout.receipt.entityId, expectedRevision: workout.revision, record: workout.record, execution: workout.execution }, workout.receipt.userId)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Correction unconfirmed. Retry the same edit.')
      setUpdated(data.receipt); setWorkout(null); setMessage('Correction saved. Your accepted program is unchanged.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Correction unconfirmed.') }
    finally { setBusy(false) }
  }
  if (!receipts.length && !unresolved) return null
  return <section className="app-surface space-y-3 rounded-xl p-4" aria-label="Save receipt">
    {unresolved && <p role="status">Some entries are still unconfirmed. Only the saved entries below are included in your history. Retry the original request to resolve the rest.</p>}
    {receipts.map(receipt => <div key={`${receipt.entityId}:${receipt.revision}`} className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{receipt.entityKind === 'meal' ? 'Meal' : 'Workout'} saved</p><p className="app-muted text-sm">{captureSourceLabel(receipt)}</p></div><button type="button" className="app-secondary min-h-11" disabled={busy} onClick={() => void open(receipt)}>Review or correct</button></div>)}
    {message && <p role="status">{message}</p>}
    {meal && meal.userId === user?.id && <MealEditModal meal={meal} isOpen onClose={() => setMeal(null)} onMealUpdated={saved => { setMeal(null); setMessage('Correction saved.'); const old = receipts.find(receipt => receipt.entityId === saved.id); if (old && saved.captureRevision) setUpdated({ ...old, revision: saved.captureRevision, provenance: saved.captureProvenance ?? old.provenance }) }} />}
    {workout && workout.receipt.userId === user?.id && <div role="dialog" aria-label="Correct workout" className="space-y-3 border-t pt-3"><p>Edit the work you actually performed. Changing notes does not confirm quantities.</p><label className="block">Workout date<input type="date" className="app-input min-h-11 w-full text-base" value={String(workout.record.workout_date ?? '')} onChange={event => setWorkout({ ...workout, record: { ...workout.record, workout_date: event.target.value } })} /></label><WorkoutFields value={workout.record.blocks} onChange={blocks => setWorkout({ ...workout, record: { ...workout.record, blocks } })} /><label className="block">Notes<textarea className="app-input min-h-11 w-full text-base" value={String(workout.record.notes ?? '')} onChange={event => setWorkout({ ...workout, record: { ...workout.record, notes: event.target.value } })} /></label><div className="flex gap-2"><button type="button" disabled={busy} className="app-primary" onClick={() => void saveWorkout()}>Save correction</button><button type="button" disabled={busy} className="app-secondary" onClick={() => setWorkout(null)}>Close</button></div></div>}
  </section>
}
