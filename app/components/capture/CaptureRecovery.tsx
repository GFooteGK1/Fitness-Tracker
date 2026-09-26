'use client'
import { hasConfirmedCapture, refreshAfterCanonicalSave } from '@/app/lib/client/recommendations'
import { markCaptureCertainty, recoverPendingCaptures } from '@/app/lib/client/capture-uncertainty'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { assertCaptureOwner, sendCaptureCorrection } from '@/app/lib/client/logging-request'
import { CaptureReceiptPanel, type ReceiptResult } from './CaptureReceiptPanel'
const kinds: Record<string, string> = { '/api/parse-workout': 'workout-text', '/api/meals/parse-text': 'meal-text', '/api/meals/upload': 'photo', '/api/meals/quick-log': 'quick-meal', '/api/foods/log': 'reviewed-food', '/api/agent/process': 'agent' }
interface Pending { storageKey: string; requestId: string; kind: string; originalReceipt?: import('@/app/lib/capture/contracts').CaptureReceipt; result?: ReceiptResult; resolved?: boolean; pendingItems?: string[] }
interface Draft { id: string; revision: number; normalized: { kind: string; record: { items?: Array<{ food: string; portion: string; calories: number }>; input_text?: string; blocks?: Array<{ title?: string; block_type?: string; movements?: Array<{ name?: string; reps?: number | null; weight?: string | null }> }> } } }
export function CaptureRecovery() {
  const { user } = useAuth()
  const ownerId = user?.id
  const currentOwner = useRef(user?.id)
  currentOwner.current = user?.id
  const [loadedOwner, setLoadedOwner] = useState(user?.id)
  const [corrections, setCorrections] = useState<Array<{ key: string; url: string; method: 'PUT' | 'PATCH' | 'POST' | 'DELETE'; body: Record<string, unknown> }>>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ReceiptResult | null>(null)
  useEffect(() => {
    let active = true
    setLoadedOwner(ownerId)
    setDrafts([]); setResult(null); setPending([]); setCorrections([]); setMessage(''); setBusy(false)
    if (!ownerId) return
    const refresh = () => {
      recoverPendingCaptures(ownerId)
      const entries: Pending[] = []
      const edits: typeof corrections = []
      for (let index = 0; index < sessionStorage.length; index++) {
        const key = sessionStorage.key(index)
        if (key?.startsWith(`socius-correction:${ownerId}:`)) {
          try { const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (stored?.signature && stored?.method) edits.push({ key, url: key.slice(`socius-correction:${ownerId}:`.length).split(':')[0], method: stored.method, body: JSON.parse(stored.signature) }) } catch { /* preserve unavailable correction */ }
        }
        if (!key?.startsWith(`socius-pending:${ownerId}:`)) continue
        const route = key.slice(`socius-pending:${ownerId}:`.length).split(':')[0]
        try { const record = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (record?.requestId && kinds[route]) entries.push({ storageKey: key, requestId: record.requestId, kind: kinds[route], originalReceipt: record.correctionReceipt }) } catch { /* preserve unreadable envelope */ }
      }
      setCorrections(edits)
      setPending(previous => entries.map(entry => previous.find(old => old.storageKey === entry.storageKey && old.requestId === entry.requestId) ?? entry))
    }
    refresh()
    const loadDrafts = () => { void fetch('/api/capture/drafts').then(async response => response.ok ? response.json() : null).then(data => { if (active && data?.userId === ownerId) setDrafts(data.drafts ?? []) }).catch(() => {}) }
    loadDrafts()
    window.addEventListener('capture-updated', loadDrafts)
    const interval = setInterval(refresh, 3000)
    return () => { active = false; clearInterval(interval); window.removeEventListener('capture-updated', loadDrafts) }
  }, [ownerId])
  const reconcile = async (entry: Pending, retry = false, cancelId?: string) => {
    if (!user) return
    const owner = user.id
    setBusy(true); setMessage('')
    try {
      await assertCaptureOwner(owner)
      const response = await fetch(`/api/logging/requests/${encodeURIComponent(`${entry.kind}:${entry.requestId}`)}?expectedUserId=${encodeURIComponent(owner)}`, { method: cancelId ? 'DELETE' : retry ? 'POST' : 'GET', ...(cancelId ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: cancelId }) } : {}) })
      const data = await response.json()
      await assertCaptureOwner(owner)
      if (currentOwner.current !== owner) return
      if (!response.ok) throw new Error(data.error ?? 'Save remains unconfirmed. Retry the original entry or check your history.')
      if (hasConfirmedCapture(data)) refreshAfterCanonicalSave(owner)
      if (data.state === 'saved' || data.retryAllowed === true) markCaptureCertainty(owner, entry.storageKey, true)
      if (entry.kind === 'workout-text' && data.state === 'draft' && data.retryAllowed === true && !data.receipts?.length && !entry.originalReceipt) {
        setMessage('No workout was saved. Choose Log another occurrence, then submit your workout again.')
      }
      setPending(current => current.map(item => item.storageKey === entry.storageKey ? { ...item, result: !data.receipts?.length && item.originalReceipt ? { ...data, receipts: [item.originalReceipt] } : data, pendingItems: data.pendingItems ?? data.receiptBundle?.unresolved?.map((item: { operationId: string }) => item.operationId) ?? [], resolved: data.state === 'saved' || data.retryAllowed === true } : item))
    } catch (error) { if (currentOwner.current === owner) setMessage(error instanceof Error ? error.message : 'Save remains unconfirmed.') }
    finally { if (currentOwner.current === owner) setBusy(false) }
  }
  const draftAction = async (draft: Draft, action: 'commit' | 'discard') => {
    if (!user) return
    const owner = user.id
    setBusy(true); setMessage('')
    try {
      const response = await sendCaptureCorrection('/api/capture/drafts', 'POST', { action, draftId: draft.id, expectedRevision: draft.revision }, user.id)
      const data = await response.json()
      if (currentOwner.current !== owner) return
      if (!response.ok) throw new Error(data.error ?? 'Draft action remains unconfirmed.')
      setDrafts(current => current.filter(item => item.id !== draft.id)); setResult(data)
      setMessage(action === 'commit' ? 'Estimate saved. Its source remains visible.' : 'Draft discarded.')
    } catch (error) { if (currentOwner.current === owner) setMessage(error instanceof Error ? error.message : 'Draft action remains unconfirmed.') }
    finally { if (currentOwner.current === owner) setBusy(false) }
  }
  if (!user || loadedOwner !== user.id) return null
  if (!pending.length && !drafts.length && !corrections.length && !result) return null
  return <section className="space-y-3" aria-label="Pending saves and estimates">
    {corrections.map(edit => <div key={edit.key} className="app-surface rounded-xl p-4 space-y-2"><p>Earlier correction remains unconfirmed. Retry its saved values before editing again.</p><button type="button" className="app-secondary" disabled={busy} onClick={() => { if (!user) return; const owner = user.id; setBusy(true); void sendCaptureCorrection(edit.url, edit.method, edit.body, user.id, edit.key).then(async response => { const data = await response.json(); if (currentOwner.current !== owner) return; if (!response.ok) throw new Error(data.error ?? 'Correction remains unconfirmed.'); setResult(data); setCorrections(current => current.filter(item => item.key !== edit.key)); setMessage('Correction confirmed. Reopen the saved entry to make another edit.') }).catch(error => { if (currentOwner.current === owner) setMessage(error.message) }).finally(() => { if (currentOwner.current === owner) setBusy(false) }) }}>Retry unchanged correction</button></div>)}
    {pending.map(entry => <div key={entry.storageKey} className="app-surface rounded-xl p-4 space-y-2"><p className="font-semibold">Earlier save needs reconciliation</p><p className="text-sm app-muted">This device retained the original request. Resolve it before logging another occurrence.</p>{entry.result && <CaptureReceiptPanel result={entry.result} />}<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="app-secondary" onClick={() => void reconcile(entry)}>Check save</button>{!entry.resolved && <button type="button" disabled={busy} className="app-secondary" onClick={() => void reconcile(entry, true)}>Retry original save</button>}{entry.resolved && <button type="button" className="app-secondary" onClick={() => { sessionStorage.removeItem(entry.storageKey); window.dispatchEvent(new CustomEvent('capture-request-resolved', { detail: entry.storageKey })); setPending(current => current.filter(item => item.storageKey !== entry.storageKey)) }}>Log another occurrence</button>}{entry.pendingItems?.map(id => <button type="button" key={id} disabled={busy} className="app-secondary" onClick={() => void reconcile(entry, false, id)}>Discard unsaved item</button>)}</div></div>)}
    {drafts.map(draft => <div key={draft.id} className="app-surface rounded-xl p-4 space-y-2"><h3 className="font-semibold">Unsaved {draft.normalized?.kind === 'workout' ? 'workout' : 'meal'} estimate</h3><p className="text-sm app-muted">This estimate is excluded from history and totals until you save it.</p>{draft.normalized?.record?.items?.map((item, index) => <p key={index}>{item.food} · {item.portion} · {item.calories} cal</p>)}{draft.normalized?.record?.blocks?.map((block, index) => <div key={index}><p>{block.title ?? block.block_type ?? 'Workout block'}</p>{block.movements?.map((movement, movementIndex) => <p key={movementIndex} className="text-sm app-muted">{movement.name ?? 'Movement'}{movement.reps != null ? ` · ${movement.reps} reps` : ' · repetitions unknown'}{movement.weight ? ` · ${movement.weight}` : ''}</p>)}</div>)}{draft.normalized?.record?.input_text && <p>{draft.normalized.record.input_text}</p>}<div className="flex gap-2"><button type="button" disabled={busy} className="app-primary" onClick={() => void draftAction(draft, 'commit')}>Save estimate</button><button type="button" disabled={busy} className="app-secondary" onClick={() => void draftAction(draft, 'discard')}>Discard estimate</button></div></div>)}
    {result && <CaptureReceiptPanel result={result} />}{message && <p role="status">{message}</p>}
  </section>
}
