'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
import { pendingRecommendationEvent, pendingRecommendationEvents, RecommendationNeedsReview, RecommendationRefreshSuperseded, recommendationScopeKey, refreshAfterCanonicalSave, refreshRecommendations, sendRecommendationEvent, type RecommendationView } from '@/app/lib/client/recommendations'
import type { StoredRecommendation } from '@/app/lib/recommendations/contracts'
import { hasUnreconciledCapture, mayPublishRecommendation } from '@/app/lib/client/capture-uncertainty'
import { offlineQueue } from '@/app/lib/offline-queue'
import { CaptureRecovery } from '@/app/components/capture/CaptureRecovery'

export function NextActionCard() {
  const { user } = useAuth()
  return user ? <OwnedNextAction key={user.id} owner={user.id} /> : null
}

function OwnedNextAction({ owner }: { owner: string }) {
  const [view, setView] = useState<RecommendationView | null>(null)
  const [loadedScope, setLoadedScope] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<Record<string, unknown> | null>(null)
  const [adjustHref, setAdjustHref] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [offlineUncertain, setOfflineUncertain] = useState<boolean | null>(null)
  const alive = useRef(true)
  const shown = useRef(new Set<string>())
  const card = useRef<HTMLElement | null>(null)
  const scope = recommendationScopeKey()
  const captureUncertain = hasUnreconciledCapture(owner) || offlineUncertain === true
  const load = useCallback(async () => {
    const requestScope = recommendationScopeKey()
    setView(null)
    try {
      if (hasUnreconciledCapture(owner) || await offlineQueue.captureNeedsReconciliation(owner)) return
      const result = await refreshRecommendations(owner)
      if (alive.current && requestScope === recommendationScopeKey()) { setView(result); setLoadedScope(requestScope) }
    } catch (error) {
      if (error instanceof RecommendationRefreshSuperseded) return
      if (alive.current && requestScope === recommendationScopeKey()) { setView({ status: 'unavailable', recommendations: [], refreshState: null }); setLoadedScope(requestScope) }
    }
  }, [owner])
  useEffect(() => {
    alive.current = true
    const certainty = () => {
      setClock(Date.now())
      setView(null)
      void offlineQueue.captureNeedsReconciliation(owner).then(uncertain => { if (alive.current) { setOfflineUncertain(uncertain); if (!uncertain && !hasUnreconciledCapture(owner)) void load() } }).catch(() => { if (alive.current) setOfflineUncertain(true) })
    }
    certainty()
    const updated = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail.owner === owner && detail.scope === recommendationScopeKey()) { setView(detail.view); setLoadedScope(detail.scope) }
    }
    const pending = (event: Event) => {
      if ((event as CustomEvent).detail.owner === owner) setView({ status: 'pending', recommendations: [], refreshState: null })
    }
    const unavailable = (event: Event) => {
      if ((event as CustomEvent).detail.owner === owner) { setView({ status: 'unavailable', recommendations: [], refreshState: null }); setLoadedScope(recommendationScopeKey()) }
    }
    const tick = () => setClock(Date.now())
    const interval = setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    window.addEventListener('recommendations-updated', updated)
    window.addEventListener('recommendations-pending', pending)
    window.addEventListener('recommendations-unavailable', unavailable)
    window.addEventListener('capture-certainty-changed', certainty)
    window.addEventListener('storage', certainty)
    return () => { alive.current = false; clearInterval(interval); window.removeEventListener('focus', tick); window.removeEventListener('recommendations-updated', updated); window.removeEventListener('recommendations-pending', pending); window.removeEventListener('recommendations-unavailable', unavailable); window.removeEventListener('capture-certainty-changed', certainty); window.removeEventListener('storage', certainty) }
  }, [load, owner, scope])
  const row = view && mayPublishRecommendation({ captureNeedsReconciliation: captureUncertain || offlineUncertain === null, serverStatus: view.status }) && loadedScope === scope ? view.recommendations.find(item => item.lifecycle === 'active'
    && item.decision.localDate === getLocalDate() && item.decision.tzOffset === getTimezoneOffset() && Date.parse(item.decision.validUntil) > clock) : undefined
  const rowId = row?.id
  useEffect(() => { setResponse(rowId ? pendingRecommendationEvent(owner, rowId, 'response') : null) }, [owner, rowId])
  useEffect(() => {
    if (!rowId || !card.current) return
    let inView = false
    const acknowledge = () => {
      if (!inView || document.visibilityState === 'hidden' || shown.current.has(rowId)) return
      shown.current.add(rowId)
      void sendRecommendationEvent(owner, rowId, 'shown', {}).catch(() => { shown.current.delete(rowId) })
    }
    const observer = new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); acknowledge() }, { threshold: 0.1 })
    observer.observe(card.current)
    document.addEventListener('visibilitychange', acknowledge)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', acknowledge) }
  }, [owner, rowId])
  async function respond(payload: Record<string, unknown>) {
    if (!row || busy) return
    setResponse(payload); setBusy(true); setMessage('')
    try {
      await sendRecommendationEvent(owner, row.id, 'response', payload)
      if (!alive.current) return
      setView(null); setResponse(null)
      if (payload.response === 'adjust_requested') setAdjustHref(destination(row))
      setMessage(payload.response === 'done_reported' ? 'Done recorded as your report. No meal or workout was logged.' : 'Response saved.')
      await load()
    } catch (error) { if (alive.current) { if (error instanceof RecommendationNeedsReview) { setResponse(null); setView({ status: 'pending', recommendations: [], refreshState: null }) }; setMessage(error instanceof Error ? error.message : 'Response unconfirmed. Retry the same response.') } }
    finally { if (alive.current) setBusy(false) }
  }
  const loading = !view || loadedScope !== scope
  return <section ref={card} className="app-panel p-5 sm:p-6 space-y-4" aria-label="Next action" data-recommendation-id={row?.id}>
    <p className="app-eyebrow">Your next action</p>
    {captureUncertain ? <><p role="status">An earlier save needs confirmation. Check it before using your next action.</p><CaptureRecovery /><Link className="app-secondary" href="/food-progress?view=camera">Review queued photos</Link><button className="app-secondary" onClick={() => void load()}>Check current records</button></>
      : loading || offlineUncertain === null ? <p role="status" className="app-muted">Checking your current records…</p>
      : view.status === 'disabled' ? <p className="app-muted">Next actions are not enabled. Your plan and logging are available below.</p>
      : view.status === 'unavailable' ? <><h2 className="text-xl font-semibold">Next action unavailable</h2><p className="app-muted">We could not check your records. Your plan and logging still work.</p><button className="app-secondary" onClick={() => void load()}>Try again</button></>
      : view.status === 'pending' ? <><p role="status">Your records changed. Your next action is pending.</p><button className="app-secondary" onClick={() => void load()}>Check again</button></>
      : !row ? <><p>Your next action needs a fresh check.</p><button className="app-secondary" onClick={() => void load()}>Refresh next action</button></>
      : <>
        <h2 className="text-xl font-semibold tracking-tight">{row.decision.title}</h2>
        <p className="app-muted leading-relaxed">{briefReason(row)}</p>
        {row.decision.destination && <Link className="app-primary" href={destination(row)}>{destinationLabel(row)} <span aria-hidden="true">→</span></Link>}
        {row.decision.kind !== 'abstain' && <>
          <p className="app-muted text-sm">Done records your report. Log an activity separately.</p>
          {response ? <div className="space-y-2"><p className="text-sm">{busy ? 'Saving your response…' : 'A response is awaiting confirmation.'}</p><button className="app-secondary" disabled={busy} onClick={() => void respond(response)}>Retry same response</button></div>
            : <div className="flex flex-wrap gap-2">
              <button className="app-secondary" disabled={busy} onClick={() => void respond({ response: 'done_reported' })}>Done</button>
              <button className="app-secondary" disabled={busy} onClick={() => void respond({ response: 'not_applicable' })}>Not applicable</button>
              <DeferControl disabled={busy} onDefer={until => void respond({ response: 'deferred', deferUntil: until })} />
              {row.decision.destination && <button className="app-secondary" disabled={busy} onClick={() => void respond({ response: 'adjust_requested' })}>Ask to adjust</button>}
            </div>}
        </>}
        <details><summary className="cursor-pointer min-h-11 flex items-center font-medium">Why this action?</summary>
          <div className="app-muted text-sm space-y-3 break-words">
            <p>{row.decision.reason}</p>
            <p>Current through {new Date(row.decision.validUntil).toLocaleString()}.</p>
            {!!row.decision.missing.length && <p>Not established: {row.decision.missing.join(', ')}.</p>}
            {!!row.decision.conflicts.length && <p>Conflicts: {row.decision.conflicts.join(', ')}.</p>}
            <ul className="space-y-2">{row.decision.sources.map((source, index) => <li key={`${source.table}:${source.id}:${index}`}><p>{sourceLabel(source.table)} · {/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source.at) ? source.at : new Date(source.at).toLocaleString()}</p><p>{describeFacts(source.facts)}</p></li>)}</ul>
          </div>
        </details>
      </>}
    {message && <p role="status" className="app-notice text-sm">{message}</p>}
    {adjustHref && <Link className="app-primary" href={adjustHref}>Review what to adjust →</Link>}
    <PendingResponseRecovery owner={owner} currentId={rowId} coverageVisible={view?.status === 'ready' && loadedScope === scope && !!view.refreshState} onResolved={load} />
    <div className="flex flex-wrap gap-x-5 gap-y-2"><Link className="min-h-11 inline-flex items-center underline" href="/program">Your plan</Link><Link className="min-h-11 inline-flex items-center underline" href="/log">Log activity</Link></div>
    {!captureUncertain && view?.status === 'ready' && loadedScope === scope && view.refreshState && <CoverageControl key={`${owner}:${scope}:${view.refreshState.sourceRevision}`} owner={owner} sourceRevision={view.refreshState.sourceRevision} coverage={view.coverage} onReview={load} />}
    {!!view?.outcomes?.length && loadedScope === scope && <details><summary className="min-h-11 flex items-center cursor-pointer font-medium">Recent follow-up</summary><ul className="space-y-4 mt-2">{view.outcomes.map(outcome => <li key={outcome.id} className="app-surface rounded-xl p-3 space-y-2"><p className="font-medium">{outcome.title}</p><p className="text-sm">{outcome.invalidated ? 'Unknown · source records changed' : `${outcome.payload.adherence === 'reported' ? 'Reported by you' : outcome.payload.adherence === 'observed' ? 'Observed in records' : 'Unknown'}`}</p>{outcome.invalidated ? <details><summary className="min-h-11 flex items-center cursor-pointer text-sm">Earlier observation</summary><p className="app-muted text-sm">{outcome.payload.summary}</p></details> : <p className="app-muted text-sm">{outcome.payload.summary}</p>}<p className="app-muted text-sm">{outcome.payload.attributionLimits.join(' ')}</p></li>)}</ul></details>}
  </section>
}

function destination(row: StoredRecommendation) {
  const href = row.decision.destination?.href ?? '/program'
  return `${href}${href.includes('?') ? '&' : '?'}recommendationId=${encodeURIComponent(row.id)}`
}
function briefReason(row: StoredRecommendation) {
  const reason = row.decision.reason
  if (row.decision.destination?.type !== 'nutrition' || reason.length < 220) return reason
  const meals = row.decision.sources.filter(source => source.table === 'meals')
  const protein = meals.reduce((sum, source) => sum + (typeof source.facts.protein === 'number' ? source.facts.protein : 0), 0)
  const calories = meals.reduce((sum, source) => sum + (typeof source.facts.calories === 'number' ? source.facts.calories : 0), 0)
  const coverage = row.decision.sources.find(source => source.table === 'logging_coverage_confirmations')
  return `${Math.round(protein)} g protein and ${Math.round(calories)} calories logged against your saved targets. ${meals.some(source => source.facts.estimated) ? 'Some amounts are estimates. ' : ''}${coverage ? `Coverage reported ${String(coverage.facts.status).replaceAll('_', ' ')} through ${new Date(String(coverage.facts.through)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}; later intake is unknown.` : 'Logging coverage is unknown.'} This does not establish total intake or a fueling deficit.`
}
function sourceLabel(table: string) {
  return ({ meals: 'Meal record', daily_targets: 'Saved nutrition targets', coach_memories: 'Confirmed training outcomes', prescribed_sessions: 'Planned session', coach_checkins: 'Session feedback', performance_observation_groups: 'Recorded measurement', performance_observation_values: 'Measurement result', coach_weekly_reviews: 'Saved training review', training_plan_versions: 'Accepted plan', adaptation_proposals: 'Proposed plan change', logging_coverage_confirmations: 'Your coverage report' } as Record<string, string>)[table] ?? 'Source record'
}
function describeFacts(facts: Record<string, unknown>): string {
  const labels: Record<string, string> = { protein: 'Protein', calories: 'Calories', carbs: 'Carbohydrates', fat: 'Fat', estimated: 'Includes estimates', status: 'Status', action: 'Review action', scheduledDate: 'Scheduled date', scheduled_date: 'Scheduled date', goal: 'Goal', statement: 'Outcome', value: 'Result', unit: 'Unit', metricId: 'Measurement', coverage: 'Coverage', coverageThrough: 'Through', through: 'Through', direction: 'Desired direction', priority: 'Priority', origin: 'Source', reviewState: 'Review state' }
  const parts = Object.entries(facts).flatMap(([key, value]) => labels[key] && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? [`${labels[key]}: ${typeof value === 'boolean' ? value ? 'yes' : 'no' : String(value).replaceAll('_', ' ')}`] : [])
  return parts.join(' · ') || 'Used as context for this action. Open its plan or logging record to review it.'
}

function PendingResponseRecovery({ owner, currentId, coverageVisible, onResolved }: { owner: string; currentId?: string; coverageVisible: boolean; onResolved: () => Promise<void> }) {
  const [entries, setEntries] = useState(() => pendingRecommendationEvents(owner))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; setEntries(pendingRecommendationEvents(owner)); return () => { alive.current = false } }, [owner, currentId, coverageVisible])
  const pending = entries.filter(entry => entry.kind === 'response' ? entry.id !== currentId : !coverageVisible || entry.id !== getLocalDate())
  if (!pending.length) return null
  return <div className="app-surface rounded-xl p-3 space-y-3"><p>Earlier responses need confirmation. Retrying cannot log an activity.</p>{pending.map(entry => <div key={`${entry.kind}:${entry.id}`}><p className="app-muted text-sm">{entry.kind === 'coverage' ? 'Earlier meal coverage report' : `Earlier response: ${String(entry.payload.response).replaceAll('_', ' ')}`}</p><button className="app-secondary mt-2" disabled={busy} onClick={async () => { setBusy(true); try { await sendRecommendationEvent(owner, entry.id, entry.kind, entry.payload); if (alive.current) { setEntries(pendingRecommendationEvents(owner)); setMessage('Earlier response confirmed.'); await onResolved() } } catch (error) { if (alive.current) { setEntries(pendingRecommendationEvents(owner)); setMessage(error instanceof Error ? error.message : 'Still unconfirmed.') } } finally { if (alive.current) setBusy(false) } }}>Retry earlier response</button></div>)}{message && <p role="status">{message}</p>}</div>
}
function destinationLabel(row: StoredRecommendation) {
  const type = row.decision.destination?.type
  return type === 'nutrition' ? 'Open meal log' : type === 'baseline' ? 'Review your baseline' : type === 'session' ? 'Open session' : type === 'proposal' ? 'Review proposed change' : 'Review your plan'
}
function DeferControl({ disabled, onDefer }: { disabled: boolean; onDefer: (until: string) => void }) {
  const [until, setUntil] = useState<string | null>(null)
  return until ? <div className="basis-full app-surface rounded-xl p-3"><p className="text-sm">Hide this action until {new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p><div className="flex gap-2 mt-2"><button className="app-secondary" disabled={disabled} onClick={() => onDefer(until)}>Confirm defer</button><button className="app-secondary" onClick={() => setUntil(null)}>Cancel</button></div></div>
    : <button className="app-secondary" disabled={disabled} onClick={() => setUntil(new Date(Date.now() + 3_600_000).toISOString())}>Defer</button>
}
function CoverageControl({ owner, sourceRevision, coverage, onReview }: { owner: string; sourceRevision: number; coverage: RecommendationView['coverage']; onReview: () => Promise<void> }) {
  const [status, setStatus] = useState('partial')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [frozen, setFrozen] = useState<Record<string, unknown> | null>(() => pendingRecommendationEvent(owner, getLocalDate(), 'coverage'))
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function save() {
    const payload = frozen ?? { domain: 'nutrition', localDate: getLocalDate(), status, coverageThrough: new Date().toISOString(), expectedSourceRevision: sourceRevision }
    setFrozen(payload); setBusy(true)
    try {
      await sendRecommendationEvent(owner, String(payload.localDate), 'coverage', payload)
      if (!alive.current) return
      setMessage('Your coverage report was saved.'); setFrozen(null); refreshAfterCanonicalSave(owner)
    } catch (error) { if (alive.current) { if (error instanceof RecommendationNeedsReview) { setFrozen(null); setNeedsReview(true) }; setMessage(error instanceof Error ? error.message : 'Report unconfirmed. Retry the same report.') } }
    finally { if (alive.current) setBusy(false) }
  }
  return <details><summary className="min-h-11 flex items-center cursor-pointer font-medium">Meal logging coverage</summary><div className="space-y-3 mt-2">
    <p className="app-muted text-sm">Optional: describe your meal records through the time you save this report. Meal count and Done do not establish complete intake.</p>
    {coverage && <p className="text-sm">Last report: {coverage.status.replaceAll('_', ' ')} through {new Date(coverage.coverage_through).toLocaleString()}. {coverage.coverageValid ? '' : 'Meal records changed; review coverage again.'}</p>}
    <label className="block">Coverage<select className="app-input mt-1 w-full text-base min-h-11" value={status} disabled={busy || !!frozen} onChange={event => setStatus(event.target.value)}><option value="partial">Some meals are missing</option><option value="complete_through">All food and drink logged through now</option><option value="unknown">I am not sure</option></select></label>
    {needsReview ? <button className="app-secondary" onClick={() => void onReview()}>Review current records</button> : <button className="app-secondary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : frozen ? 'Retry same coverage report' : 'Save coverage report'}</button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div></details>
}
