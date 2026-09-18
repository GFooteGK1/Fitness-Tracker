'use client'
import { refreshAfterCanonicalSave } from '@/app/lib/client/recommendations'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/app/lib/auth/supabase'
import { planningGoalPrefill } from '@/app/lib/auth/onboarding'
import { ADAPTIVE_ASSESSMENT_DEFINITIONS, findAssessmentDefinition } from '@/app/lib/coach/adaptive-programming-contracts'
import { MOVEMENT_CATALOG, MOVEMENT_EQUIPMENT_IDS, type MovementEquipmentId } from '@/app/lib/coach/movement-catalog'
import { COACH_PROGRAM_DOMAIN_IDS, type CoachProgramDomainId } from '@/app/lib/coach/types'
import { validatePlanningIntent, type PlanningIntentV1, type PlanningOutcome, type PlanningIntentSnapshot } from '@/app/lib/coach/planning-intent'
import type { IntentBaselineCandidate } from '@/app/lib/coach/planning-intent-server'

const field = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white'
const labels: Record<CoachProgramDomainId, string> = { strength: 'Strength', hypertrophy: 'Build muscle', power_explosiveness: 'Power', speed_agility: 'Speed', aerobic: 'Aerobic fitness', resilience: 'Resilience' }
const definitions = ADAPTIVE_ASSESSMENT_DEFINITIONS.filter(d => d.allowedSemanticRoles.includes('direct_outcome'))

export function newPlanningOutcome(statement = '', confirmedAt = new Date().toISOString()): PlanningOutcome {
  return {
    goal: { schemaVersion: 1, id: `outcome:${crypto.randomUUID()}`, kind: 'performance_outcome', statement, priority: 'primary', status: 'active', target: null, targetDate: null, requiredQualityIds: ['maximal_strength'], source: { kind: 'athlete_confirmed', confirmedAt } },
    domain: null, measurement: null,
    binding: { movementId: null, distance: null, equipmentIds: [], variation: null },
    baseline: { status: 'unknown' }, capability: { status: 'unsupported', reason: 'Choose a supported outcome and measurement protocol before using it for programming.' },
  }
}

export function PlanningIntentEditor({ value, onChange, disabled = false }: {
  value: PlanningIntentV1; onChange: (value: PlanningIntentV1) => void; disabled?: boolean
}) {
  const change = (index: number, outcome: PlanningOutcome) => {
    // A changed binding needs a new baseline confirmation; never retain a stale reference.
    const previous = value.outcomes[index]
    const bindingChanged = JSON.stringify([previous.binding, previous.measurement]) !== JSON.stringify([outcome.binding, outcome.measurement])
    onChange({ ...value, outcomes: value.outcomes.map((o, i) => i === index ? { ...outcome, ...(bindingChanged ? { baseline: { status: 'unknown' as const } } : {}) } : o) })
  }
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="text-base font-semibold">What would success look like?</legend>
    <p className="text-sm text-gray-600 dark:text-gray-300">Keep separate outcomes separate, even within the same sport. A target and baseline are optional. Saved changes affect a new proposal; your accepted plan stays intact.</p>
    {value.outcomes.map((o, index) => {
      const definition = o.measurement ? findAssessmentDefinition(o.measurement.assessmentDefinition.id) : null
      const dimensions = definition?.protocol.comparabilityDimensions ?? []
      const context = o.binding.assessmentContext ?? { repetitions: null, externalLoad: null, duration: null, techniqueModifiers: [], environmentModifiers: [] }
      return <section key={o.goal.id} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700" aria-label={`Outcome ${index + 1}`}>
        <label className="block text-sm font-medium">Outcome {index + 1}
          <input aria-label={`Outcome ${index + 1} statement`} value={o.goal.statement} maxLength={500} className={field} onChange={e => change(index, { ...o, goal: { ...o.goal, statement: e.target.value } })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Training area<select aria-label={`Outcome ${index + 1} area`} className={field} value={o.domain ?? ''} onChange={e => change(index, { ...o, domain: e.target.value as CoachProgramDomainId || null })}><option value="">Not supported or not yet specified</option>{COACH_PROGRAM_DOMAIN_IDS.map(d => <option key={d} value={d}>{labels[d]}</option>)}</select></label>
          <label className="text-sm">Kind<select aria-label={`Outcome ${index + 1} kind`} className={field} value={o.goal.kind} onChange={e => change(index, { ...o, goal: { ...o.goal, kind: e.target.value as PlanningOutcome['goal']['kind'], ...(e.target.value === 'process' ? { requiredQualityIds: ['training_adherence'], target: null } : {}) } })}><option value="performance_outcome">Performance outcome</option><option value="capacity">Capacity</option><option value="skill">Explore a skill</option><option value="process">Consistent habit</option><option value="maintenance">Maintain a result</option></select></label>
        </div>
        <label className="block text-sm">How to measure progress<select aria-label={`Outcome ${index + 1} measurement`} value={o.measurement?.assessmentDefinition.id ?? ''} className={field} onChange={e => {
          const d = findAssessmentDefinition(e.target.value)
          change(index, { ...o, goal: { ...o.goal, target: null, ...(d ? { requiredQualityIds: [...d.qualityIds] } : {}) }, measurement: d ? { metricId: d.primaryMetricId, unit: d.allowedUnits[0], assessmentDefinition: { id: d.id, version: d.version }, protocol: { id: d.protocol.id, version: d.protocol.version } } : null })
        }}><option value="">No numerical measurement yet</option>{definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        {o.measurement && <details open className="space-y-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Measurement details</summary>
          {dimensions.includes('movement') && <label className="block text-sm">Movement<select aria-label={`Outcome ${index + 1} movement`} className={field} value={o.binding.movementId ?? ''} onChange={e => change(index, { ...o, binding: { ...o.binding, movementId: e.target.value || null } })}><option value="">Choose the measured movement</option>{MOVEMENT_CATALOG.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
          {dimensions.includes('variation') && <label className="block text-sm">Variation or test setup<input aria-label={`Outcome ${index + 1} variation`} className={field} value={o.binding.variation ?? ''} placeholder="Describe the exact test setup" onChange={e => change(index, { ...o, binding: { ...o.binding, variation: e.target.value || null } })} /></label>}
          {dimensions.includes('distance') && <label className="block text-sm">Test distance in meters<input aria-label={`Outcome ${index + 1} distance`} type="number" min="0.01" step="any" className={field} value={o.binding.distance ? o.binding.distance.value * ({m:1,km:1000,mi:1609.344}[o.binding.distance.unit]) : ''} onChange={e => change(index, { ...o, binding: { ...o.binding, distance: e.target.value ? { value: Number(e.target.value), unit: 'm' } : null } })} /></label>}
          {dimensions.includes('repetitions') && <label className="block text-sm">Repetitions in this test<input aria-label={`Outcome ${index + 1} test repetitions`} type="number" min="1" step="1" className={field} value={context.repetitions ?? ''} onChange={e => change(index, { ...o, binding: { ...o.binding, assessmentContext: { ...context, repetitions: e.target.value ? Number(e.target.value) : null } } })} /></label>}
          {dimensions.includes('external_load') && <label className="block text-sm">Fixed test load in kg<input aria-label={`Outcome ${index + 1} test load`} type="number" min="0.01" step="any" className={field} value={context.externalLoad ? context.externalLoad.value * (context.externalLoad.unit === 'lb' ? 0.45359237 : 1) : ''} onChange={e => change(index, { ...o, binding: { ...o.binding, assessmentContext: { ...context, externalLoad: e.target.value ? { value: Number(e.target.value), unit: 'kg' } : null } } })} /></label>}
          {dimensions.includes('duration') && <label className="block text-sm">Test duration in seconds<input aria-label={`Outcome ${index + 1} test duration`} type="number" min="0.01" step="any" className={field} value={context.duration ? context.duration.value * (context.duration.unit === 'min' ? 60 : 1) : ''} onChange={e => change(index, { ...o, binding: { ...o.binding, assessmentContext: { ...context, duration: e.target.value ? { value: Number(e.target.value), unit: 's' } : null } } })} /></label>}
          {(['techniqueModifiers', 'environmentModifiers'] as const).map(key => <label key={key} className="block text-sm">{key === 'techniqueModifiers' ? 'Technique details' : 'Environment details'} (optional, comma separated)<input aria-label={`Outcome ${index + 1} ${key}`} className={field} value={context[key].join(', ')} onChange={e => change(index, { ...o, binding: { ...o.binding, assessmentContext: { ...context, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } } })} /></label>)}
          {dimensions.includes('equipment') && <label className="block text-sm">Test equipment<select aria-label={`Outcome ${index + 1} equipment`} className={field} value={o.binding.equipmentIds[0] ?? ''} onChange={e => change(index, { ...o, binding: { ...o.binding, equipmentIds: e.target.value ? [e.target.value as MovementEquipmentId] : [] } })}><option value="">Choose the equipment or setting</option>{MOVEMENT_EQUIPMENT_IDS.map(id => <option key={id} value={id}>{id.replaceAll('_', ' ')}</option>)}</select></label>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Target (optional)<input aria-label={`Outcome ${index + 1} target`} type="number" min="0" step="any" className={field} value={o.goal.target?.metric.value ?? ''} onChange={e => change(index, { ...o, goal: { ...o.goal, target: e.target.value && o.measurement ? { role: 'target', comparison: ['run.time', 'sprint.time'].includes(o.measurement.metricId) ? 'at_most' : 'at_least', metric: { metricId: o.measurement.metricId, unit: o.measurement.unit, value: Number(e.target.value) }, assessmentDefinition: o.measurement.assessmentDefinition, protocol: o.measurement.protocol } : null } })} /></label>
            <label className="text-sm">Unit<select aria-label={`Outcome ${index + 1} unit`} className={field} value={o.measurement.unit} onChange={e => change(index, { ...o, measurement: { ...o.measurement!, unit: e.target.value as NonNullable<PlanningOutcome['measurement']>['unit'] }, goal: { ...o.goal, target: null } })}>{definition?.allowedUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></label></div>
        </details>}
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={o.capability.status === 'supported'} onChange={e => change(index, { ...o, capability: e.target.checked ? { status: 'supported' } : { status: 'unsupported', reason: 'Outcome saved for review; its supported measurement or programming capability is not yet specified.' } })} />Use this supported protocol for this outcome</label>
        <p className="text-sm text-gray-600 dark:text-gray-300">Baseline: {o.baseline.status === 'unknown' ? 'not recorded or not yet linked' : 'linked to a recorded observation'}. {o.capability.status === 'unsupported' ? o.capability.reason : 'Progress requires a follow-up measurement with this exact test, units, equipment and context. Generic domain assessments do not establish this outcome.'}</p>
        <label className="block text-sm">Target date (optional)<input aria-label={`Outcome ${index + 1} target date`} type="date" className={field} value={o.goal.targetDate ?? ''} onChange={e => change(index, { ...o, goal: { ...o.goal, targetDate: e.target.value || null } })} /></label>
        {value.outcomes.length > 1 && <button type="button" className="app-secondary" onClick={() => onChange({ ...value, outcomes: value.outcomes.filter((_, i) => i !== index), priorityOrder: null, event: null })}>Remove outcome {index + 1} from this draft</button>}
        {index > 0 && <button type="button" className="app-secondary" onClick={() => { const outcomes = [...value.outcomes]; [outcomes[index - 1], outcomes[index]] = [outcomes[index], outcomes[index - 1]]; onChange({ ...value, outcomes, priorityOrder: null }) }}>Move outcome {index + 1} up</button>}
      </section>
    })}
    {value.outcomes.length < 8 && <button type="button" className="app-secondary" onClick={() => onChange({ ...value, outcomes: [...value.outcomes, newPlanningOutcome('', value.confirmedAt)], priorityOrder: null })}>Add another outcome</button>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={value.priorityOrder !== null} onChange={e => onChange({ ...value, priorityOrder: e.target.checked ? value.outcomes.map(o => o.goal.id) : null })} />I confirm these outcomes are ordered from most to least important</label>
    {value.priorityOrder && <p className="text-sm text-gray-600 dark:text-gray-300">Priority: {value.outcomes.map(o => o.goal.statement || 'Unnamed outcome').join(' → ')}</p>}
    <label className="block text-sm">Shared event (optional)<input aria-label="Shared event name" className={field} maxLength={160} value={value.event?.name ?? ''} onChange={e => onChange({ ...value, event: e.target.value ? { name: e.target.value, goalIds: value.event?.goalIds ?? value.outcomes.map(o => o.goal.id), date: value.event?.date ?? null } : null })} /></label>
    {value.event && <div className="space-y-2"><label className="block text-sm">Event date (optional)<input aria-label="Shared event date" type="date" className={field} value={value.event.date ?? ''} onChange={e => onChange({ ...value, event: { ...value.event!, date: e.target.value || null } })} /></label>{value.outcomes.map(o => <label key={o.goal.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={value.event!.goalIds.includes(o.goal.id)} onChange={e => onChange({ ...value, event: { ...value.event!, goalIds: e.target.checked ? [...value.event!.goalIds, o.goal.id] : value.event!.goalIds.filter(id => id !== o.goal.id) } })} />{o.goal.statement || 'Unnamed outcome'} contributes to this event</label>)}</div>}
  </fieldset>
}

export function TrainingIntentPanel({ goal = '', profileGoals }: { goal?: string; profileGoals?: string[] }) {
  const [snapshot, setSnapshot] = useState<PlanningIntentSnapshot | null>(null)
  const [draft, setDraft] = useState<PlanningIntentV1 | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [baselineCandidates, setBaselineCandidates] = useState<IntentBaselineCandidate[]>([])
  const [baselineCandidatesAvailable, setBaselineCandidatesAvailable] = useState(true)
  const pending = useRef<{ owner: string; payload: string } | null>(null)
  const owner = useRef<string | null>(null)
  const initialGoal = useRef(goal)
  const initialProfileGoals = useRef(profileGoals)
  useEffect(() => {
    let active = true
    const auth = createClient()
    const load = async () => {
      const { data } = await auth.auth.getUser()
      if (!active) return
      const userId = data.user?.id ?? null
      owner.current = userId
      const response = await fetch('/api/coach/intent')
      const body = await response.json()
      if (!active || owner.current !== userId) return
      if (!response.ok) { setError('Confirmed outcomes are unavailable. Try reloading.'); return }
      setEnabled(body.enabled === true)
      setSnapshot(body.snapshot)
      setBaselineCandidates(body.baselineCandidates ?? [])
      setBaselineCandidatesAvailable(body.baselineCandidatesAvailable !== false)
      if (body.snapshot) setDraft(body.snapshot.content)
      else { const confirmedAt = new Date().toISOString(); const statements = initialGoal.current.trim() ? [initialGoal.current] : planningGoalPrefill(initialProfileGoals.current); setDraft({ schemaVersion: 1, outcomes: (statements.length ? statements : ['']).map(statement => newPlanningOutcome(statement, confirmedAt)), priorityOrder: null, event: null, confirmedAt }) }
      const stored = userId ? sessionStorage.getItem(`training-intent-pending:${userId}`) : null
      if (stored) { const request = JSON.parse(stored); if (request.expectedUserId === userId && validatePlanningIntent(request.intent).ok) { pending.current = { owner: userId!, payload: stored }; setDraft(request.intent); setError('A previous save is unconfirmed. Retry the same confirmation.'); } }
    }
    void load().catch(() => active && setError('Confirmed outcomes are unavailable.'))
    const { data: listener } = auth.auth.onAuthStateChange((_event, session) => {
      if (owner.current && session?.user.id !== owner.current) { owner.current = null; pending.current = null; setDraft(null); setSnapshot(null); setEnabled(false); setError('Account changed. Reload before editing outcomes.') }
    })
    return () => { active = false; owner.current = null; listener.subscription.unsubscribe() }
  }, []) // The initial goal is a prefill; later typing must not replace an edited outcome.
  const save = async () => {
    if (!draft || !owner.current) return
    setBusy(true); setError(null)
    const userId = owner.current
    pending.current ??= { owner: userId, payload: JSON.stringify({ expectedUserId: userId, intent: draft, confirmed: true, previousMemoryId: snapshot?.memoryId ?? null, idempotencyKey: `training-intent:${crypto.randomUUID()}` }) }
    try {
      sessionStorage.setItem(`training-intent-pending:${userId}`, pending.current.payload)
      if (pending.current.owner !== owner.current) throw new Error('Account changed. Reload before retrying.')
      const response = await fetch('/api/coach/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current.payload })
      const body = await response.json()
      if (owner.current !== userId) return
      if (!response.ok) { if (response.status < 500) { pending.current = null; sessionStorage.removeItem(`training-intent-pending:${userId}`) } throw new Error(body.error ?? 'Unable to confirm outcomes') }
      pending.current = null; sessionStorage.removeItem(`training-intent-pending:${userId}`); setSaved(true)
      refreshAfterCanonicalSave(userId)
      const refreshed = await fetch('/api/coach/intent'); const next = await refreshed.json()
      if (owner.current !== userId) return
      if (!refreshed.ok) throw new Error('Saved outcomes need a reload before more edits')
      setSnapshot(next.snapshot); setDraft(next.snapshot?.content ?? draft)
      setBaselineCandidates(next.baselineCandidates ?? [])
      setBaselineCandidatesAvailable(next.baselineCandidatesAvailable !== false)
    } catch (e) { if (owner.current !== userId) return; setError(e instanceof Error ? e.message : 'Unable to confirm outcomes') }
    finally { setBusy(false) }
  }
  if (!enabled && !snapshot) return error ? <p role="status" className="text-sm">{error}</p> : null
  if (!draft) return null
  const validation = validatePlanningIntent(draft)
  return <section className="app-card space-y-4 p-5" aria-label="Confirmed training outcomes">
    <h2 className="text-xl font-bold">Your outcomes</h2>
    <PlanningIntentEditor value={draft} disabled={busy || !enabled || pending.current !== null} onChange={value => { setDraft(value); setSaved(false) }} />
    {!validation.ok && <p role="status" className="text-sm">{validation.errors.join('. ')}</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    {saved && <p role="status" className="text-sm">Outcomes confirmed. Your accepted plan is unchanged.</p>}
    {enabled && <button type="button" disabled={busy || !validation.ok} onClick={() => void save()} className="app-primary">{busy ? 'Saving…' : pending.current ? 'Retry the same confirmation' : snapshot ? 'Confirm corrected outcomes' : 'Confirm outcomes'}</button>}
    {snapshot && enabled && JSON.stringify(draft) === JSON.stringify(snapshot.content) && <>
      {!baselineCandidatesAvailable && <p role="status" className="text-sm">Saved measurement lookup is unavailable. Reload before choosing an existing baseline.</p>}
      {baselineCandidates.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2 font-medium">Use a comparable recorded measurement</summary>{baselineCandidates.map(c => <button type="button" className="app-secondary my-2 block" key={`${c.goalId}:${c.observationId}`} onClick={() => { setDraft({ ...draft, outcomes: draft.outcomes.map(o => o.goal.id === c.goalId ? { ...o, baseline: { status: 'referenced', observationId: c.observationId } } : o) }); setSaved(false) }}>{draft.outcomes.find(o => o.goal.id === c.goalId)?.goal.statement}: {c.value} {c.unit} ({c.source === 'scheduled_session' ? 'scheduled session' : 'manual measurement'}, {c.observedAt.slice(0,10)}) — use as baseline</button>)}</details>}
      <BaselineCapture key={`${owner.current}:${snapshot.memoryId}`} ownerId={owner.current!} isCurrentOwner={() => owner.current} snapshot={snapshot} onLinked={next => { setDraft(next.content); setSaved(false) }} />
    </>}
  </section>
}

function BaselineCapture({ snapshot, onLinked, ownerId, isCurrentOwner }: { ownerId: string; isCurrentOwner: () => string | null; snapshot: PlanningIntentSnapshot; onLinked: (snapshot: PlanningIntentSnapshot) => void }) {
  const [goalId, setGoalId] = useState('')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<string | null>(null)
  const storageKey = `training-baseline-pending:${ownerId}:${snapshot.memoryId}`
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) { try { const request = JSON.parse(saved); if (request.expectedUserId === ownerId && request.intentMemoryId === snapshot.memoryId) { pending.current = saved; setGoalId(request.goalId); setValue(String(request.value)); setMessage('A baseline save is unconfirmed. Retry the same request.'); } } catch { setMessage('Stored baseline request needs review.') } }
  }, [storageKey, ownerId, snapshot.memoryId])
  const eligible = snapshot.content.outcomes.filter(o => o.capability.status === 'supported' && o.measurement && findAssessmentDefinition(o.measurement.assessmentDefinition.id)?.allowedSemanticRoles.includes('direct_outcome'))
  if (!eligible.length) return null
  const selected = eligible.find(o => o.goal.id === goalId)
  const save = async () => {
    if (!selected || isCurrentOwner() !== ownerId) return
    pending.current ??= JSON.stringify({ expectedUserId: ownerId, intentMemoryId: snapshot.memoryId, goalId, value: Number(value), observedAt: new Date().toISOString(), idempotencyKey: `baseline:${crypto.randomUUID()}`, confirmed: true })
    setBusy(true)
    try {
      sessionStorage.setItem(storageKey, pending.current)
      const response = await fetch('/api/coach/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current })
      const body = await response.json()
      if (isCurrentOwner() !== ownerId) return
      if (!response.ok) { if (response.status < 500) { pending.current = null; sessionStorage.removeItem(storageKey) } throw new Error(body.error ?? 'Unable to record baseline') }
      pending.current = null; sessionStorage.removeItem(storageKey); setMessage('Baseline recorded. Confirm its use for this outcome below.')
      refreshAfterCanonicalSave(ownerId)
      onLinked({ ...snapshot, content: { ...snapshot.content, outcomes: snapshot.content.outcomes.map(o => o.goal.id === goalId ? { ...o, baseline: { status: 'referenced', observationId: body.observationId } } : o) } })
    } catch(e) { if (isCurrentOwner() !== ownerId) return; setMessage(e instanceof Error ? e.message : 'Baseline save is unconfirmed. Retry the same request.') }
    finally { setBusy(false) }
  }
  return <details className="space-y-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">Record an optional baseline now</summary><p className="text-sm">Use a completed measurement matching the confirmed test. This adapter records a manual measurement with its own source provenance. This entry records the measurement at the current time.</p>
    <select aria-label="Baseline outcome" className={field} value={goalId} disabled={busy || pending.current !== null} onChange={e => setGoalId(e.target.value)}><option value="">Choose an outcome</option>{eligible.map(o => <option key={o.goal.id} value={o.goal.id}>{o.goal.statement}</option>)}</select>
    <label className="block text-sm">Observed result {selected?.measurement ? `(${selected.measurement.unit})` : ''}<input aria-label="Baseline result" type="number" step="any" min="0" className={field} value={value} disabled={busy || pending.current !== null} onChange={e => setValue(e.target.value)} /></label>
    <button className="app-secondary" type="button" disabled={busy || !selected || !value} onClick={() => void save()}>{pending.current ? 'Retry same baseline' : 'Record this measurement'}</button>{message && <p role="status" className="text-sm">{message}</p>}
  </details>
}
