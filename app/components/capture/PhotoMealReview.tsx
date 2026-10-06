'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { compressImage } from '@/app/lib/imageUtils'
import { assertCaptureOwner, sendCaptureCorrection, sendLoggingRequest } from '@/app/lib/client/logging-request'
import { getLocalDate } from '@/app/lib/timezone-utils'
import type { PhotoMealDraft } from '@/app/lib/nutrition/photo-draft'
import type { FoodItem } from '@/app/lib/types/food-tracking'
import { CaptureRecovery } from './CaptureRecovery'

const endpoint = '/api/meals/photo-drafts'
const fieldNames = ['food','portion','protein','carbs','fat','calories'] as const

export function PhotoMealReview() {
  const { user } = useAuth()
  const owner = user?.id
  const session = useRef({ owner, generation: 0 })
  if (session.current.owner !== owner) session.current = { owner, generation: session.current.generation + 1 }
  const locked = useRef(false)
  const [loadedOwner, setLoadedOwner] = useState(owner)
  const [drafts, setDrafts] = useState<PhotoMealDraft[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<{ draft: PhotoMealDraft; items: FoodItem[] } | null>(null)
  const [photoTime, setPhotoTime] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    locked.current = false
    setLoadedOwner(owner); setDrafts([]); setFile(null); setEditing(null); setApproved(false); setBusy(false); setMessage('')
    const now = new Date()
    setPhotoTime(`${getLocalDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  }, [owner])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    if (!owner) return
    let active = true
    const load = async () => {
      try {
        const response = await fetch('/api/capture/drafts', { cache: 'no-store' })
        const data = await response.json()
        if (!active || data.userId && data.userId !== owner) return
        if (!response.ok) throw new Error(data.error ?? 'Photo drafts are unavailable.')
        setDrafts((data.drafts ?? []).filter((draft: PhotoMealDraft) => draft.kind === 'meal' && draft.input_method === 'photo'))
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Photo drafts are unavailable.') }
    }
    void load()
    window.addEventListener('capture-updated', load)
    return () => { active = false; window.removeEventListener('capture-updated', load) }
  }, [owner, refresh])

  const perform = async (operation: () => Promise<Response>, success: (data: Record<string, unknown>) => void) => {
    if (!owner || locked.current) return
    const generation = session.current.generation
    const current = () => session.current.owner === owner && session.current.generation === generation
    locked.current = true; setBusy(true); setMessage('')
    try {
      await assertCaptureOwner(owner)
      const response = await operation()
      const data = await response.json()
      await assertCaptureOwner(owner)
      if (!current()) return
      if (!response.ok) throw new Error(data.error ?? 'The result is unconfirmed. Check pending saves before trying another entry.')
      success(data); setRefresh(value => value + 1)
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : 'The result is unconfirmed.') }
    finally { if (current()) { locked.current = false; setBusy(false) } }
  }
  const analyze = () => {
    if (!file || !approved || !owner) return
    const selected = file
    const timestamp = new Date(photoTime)
    if (!Number.isFinite(timestamp.getTime())) { setMessage('Choose when this photo was taken.'); return }
    void perform(async () => {
      const converted = await compressImage(selected, 0.95, 1200)
      const blob = await fetch(converted.compressedDataUrl).then(response => response.blob())
      const form = new FormData()
      form.set('photo', new File([blob], 'meal.jpg', { type: 'image/jpeg' }))
      form.set('timestamp', timestamp.toISOString()); form.set('approved', 'true')
      return sendLoggingRequest(endpoint, { method: 'POST', body: form }, owner)
    }, () => { setFile(null); setApproved(false); setMessage('Estimate saved for review. Nutrition totals have not changed.') })
  }
  const draftAction = (draft: PhotoMealDraft, action: 'commit' | 'discard') => {
    if (!owner) return
    void perform(() => sendCaptureCorrection('/api/capture/drafts', 'POST', { action, draftId: draft.id, expectedRevision: draft.revision }, owner), data => {
      if (action === 'commit' && !(data.receipt as { entityId?: string } | undefined)?.entityId) throw new Error('Acceptance is unconfirmed. Check pending saves.')
      setEditing(null); setMessage(action === 'commit' ? 'Meal accepted and added to nutrition totals.' : 'Draft dismissed. Nutrition totals have not changed.')
    })
  }
  const saveEdits = () => {
    if (!owner || !editing) return
    const { draft, items } = editing
    void perform(() => sendCaptureCorrection(`${endpoint}/${draft.id}`, 'PATCH', { expectedRevision: draft.revision, items }, owner), () => {
      setEditing(null); setMessage('Corrections saved to the draft. Accept it when ready.')
    })
  }

  if (!owner || loadedOwner !== owner) return null
  return <div className="mx-auto max-w-xl space-y-6">
    <header><h1 className="app-title">Review a meal photo</h1><p className="app-muted mt-2">Photo estimates stay out of nutrition totals until you accept them.</p></header>
    <section className="app-panel p-5 space-y-4" aria-label="Choose a photo for analysis">
      <label className="block">Photo<input className="block w-full min-h-11 text-base mt-2" type="file" accept="image/*" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setApproved(false) }} /></label>
      {preview && <img src={preview} alt="Selected meal photo" className="w-full max-h-80 object-contain rounded-xl" />}
      <label className="block">Photo time<input type="datetime-local" className="app-input w-full min-h-11 text-base" value={photoTime} disabled={busy} onChange={event => setPhotoTime(event.target.value)} /></label>
      <label className="flex items-start gap-3 min-h-11"><input type="checkbox" className="mt-1 h-5 w-5" checked={approved} disabled={busy || !file} onChange={event => setApproved(event.target.checked)} /><span>Send this selected photo to Socius’s AI service for analysis. The photo is not saved by Socius; its estimate is saved for review.</span></label>
      <button className="app-primary w-full min-h-11" type="button" disabled={busy || !file || !approved} onClick={analyze}>{busy ? 'Working…' : 'Analyze approved photo'}</button>
    </section>
    {message && <p role="status">{message}</p>}
    <button type="button" className="app-secondary min-h-11" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh drafts</button>
    <section className="space-y-4" aria-label="Photo estimates awaiting review">
      {!drafts.length && <p className="app-muted">No photo estimates awaiting review.</p>}
      {drafts.map(draft => <article className="app-panel p-5 space-y-3" key={draft.id}>
        <h2 className="font-semibold">Meal estimate</h2><p className="app-muted">{new Date(draft.normalized.record.meal_timestamp).toLocaleString()} · Not in totals</p>
        <p className="text-sm app-muted">Portions and macros are estimates. Food packaging does not establish how much you ate.</p>
        {draft.normalized.record.items.map((item, index) => <p key={index}>{item.food} · {item.portion}<br />{item.calories} cal · P {item.protein} g · C {item.carbs} g · F {item.fat} g</p>)}
        {typeof draft.normalized.response?.analysisNotes === 'string' && draft.normalized.response.analysisNotes && <p>{draft.normalized.response.analysisNotes}</p>}
        {editing?.draft.id === draft.id ? <div className="space-y-3">
          {editing.items.map((item, index) => <fieldset className="space-y-2" key={index}><legend>Food {index + 1}</legend>{fieldNames.map(field => <label className="block" key={field}>{field === 'portion' ? 'Portion (include units)' : field}{['protein','carbs','fat'].includes(field) ? ' (g)' : ''}<input className="app-input w-full min-h-11 text-base" type={field === 'food' || field === 'portion' ? 'text' : 'number'} min={0} step="any" value={item[field]} disabled={busy} onChange={event => {
            const value = field === 'food' || field === 'portion' ? event.target.value : event.target.value === '' ? NaN : Number(event.target.value)
            setEditing(current => current ? { ...current, items: current.items.map((food, itemIndex) => itemIndex === index ? { ...food, [field]: value } : food) } : null)
          }} /></label>)}</fieldset>)}
          <button className="app-primary min-h-11" type="button" disabled={busy} onClick={saveEdits}>Save corrections</button>
          <button className="app-secondary min-h-11" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel editing</button>
        </div> : <div className="flex flex-wrap gap-2">
          <button className="app-secondary min-h-11" type="button" disabled={busy} onClick={() => setEditing({ draft, items: draft.normalized.record.items.map(item => ({ ...item })) })}>Correct estimate</button>
          <button className="app-primary min-h-11" type="button" disabled={busy} onClick={() => draftAction(draft, 'commit')}>Accept meal</button>
          <button className="app-secondary min-h-11" type="button" disabled={busy} onClick={() => draftAction(draft, 'discard')}>Dismiss</button>
        </div>}
      </article>)}
    </section>
    <CaptureRecovery includePhotoDrafts={false} />
    <Link className="app-secondary min-h-11" href="/food-progress">View nutrition totals</Link>
  </div>
}
