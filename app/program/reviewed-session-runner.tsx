'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ReviewedSessionCard } from './reviewed-session-card'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { parseReviewedSetReport, type ReviewedSetReport } from '@/app/lib/coach/reviewed-set-report'
import type { ReviewedSessionState } from '@/app/lib/coach/reviewed-session-state'
import { readReviewedPending, resolveReviewedPending, saveReviewedPending, sendReviewedPending, type ReviewedPendingSessionRequest } from '@/app/lib/coach/reviewed-session-pending'
import { formatUTCAsLocalDateTime, formatUTCAsLocalDateWithOffset, getLocalDate, getTimezoneOffset, localDateTimeToUTC } from '@/app/lib/timezone-utils'
import { reportedFeedbackProvenance } from '@/app/lib/coach/execution-feedback'

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-gray-400 bg-transparent p-2 text-base'
const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to confirm this session. Refresh and try again.'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Canonical session identity, not a movable planning-slot ID. */
export function ReviewedSessionRunner({ userId, sessionId }: { userId: string; sessionId: string }) {
  const [state, setState] = useState<ReviewedSessionState | null>(null)
  const [pending, setPending] = useState<ReviewedPendingSessionRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resolvedDraft, setResolvedDraft] = useState<ReviewedSetReport | null>(null)
  const [resolvedCompletion, setResolvedCompletion] = useState<Record<string, unknown> | null>(null)
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null)
  const [formRevision, setFormRevision] = useState(0)
  const owner = useRef<string | null>(userId), sending = useRef(false), readSequence = useRef(0)
  owner.current = userId
  const canonicalId = sessionId.toLowerCase()
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    setState(null)
    const response = await fetch(`/api/coach/reviewed/sessions/${canonicalId}`, { cache: 'no-store' })
    const result = await response.json()
    if (owner.current !== userId || readSequence.current !== sequence) return
    if (!response.ok || result.kind !== 'session' || result.session?.userId !== userId || result.session?.sessionId !== canonicalId) {
      setState(null); throw new Error(result.error ?? 'Complete session history unavailable')
    }
    setState(result.session)
  }, [canonicalId, userId])
  useEffect(() => {
    owner.current = userId
    try { setPending(readReviewedPending(sessionStorage, userId, canonicalId)); setStorageReady(true) }
    catch (failure) { setError(message(failure)); setStorageReady(false) }
    void refresh().catch(failure => { if (owner.current === userId) setError(message(failure)) })
    return () => { owner.current = null }
  }, [userId, canonicalId, refresh])

  async function submit(report?: ReviewedSetReport, completion?: Record<string, unknown>) {
    if (sending.current || !storageReady || owner.current !== userId) return
    sending.current = true; setBusy(true); setError(null)
    try {
      const request = pending ?? saveReviewedPending(sessionStorage, { schemaVersion: 1, userId, sessionId: canonicalId,
        operation: completion ? 'complete' : 'set', body: { expectedUserId: userId, requestId: crypto.randomUUID(),
          ...(completion ? { completion } : { report }) } })
      setPending(request)
      await sendReviewedPending(sessionStorage, request, () => owner.current)
      if (owner.current !== userId) return
      setPending(null)
      setResolvedDraft(null)
      setResolvedCompletion(null)
      setFormRevision(current => current + 1)
      await refresh()
    } catch (failure) { if (owner.current === userId) setError(message(failure)) }
    finally { sending.current = false; if (owner.current === userId) setBusy(false) }
  }

  async function resolvePrevious() {
    if (!pending || sending.current || !storageReady || owner.current !== userId) return
    sending.current = true; setBusy(true); setError(null)
    try {
      const resolution = await resolveReviewedPending(sessionStorage, pending, () => owner.current)
      if (owner.current !== userId) return
      setPending(null)
      setResolvedDraft(resolution.disposition === 'no_write' && pending.operation === 'set' ? parseReviewedSetReport(pending.body.report) : null)
      setResolvedCompletion(resolution.disposition === 'no_write' && pending.operation === 'complete' && object(pending.body.completion) ? pending.body.completion : null)
      setFormRevision(current => current + 1)
      setResolutionNotice(resolution.disposition === 'saved' ? 'The original save was recovered. Review the saved session below.'
        : 'The original request did not save and is now closed. Its details are preserved. Review the current session before saving a correction.')
      await refresh()
    } catch (failure) { if (owner.current === userId) setError(message(failure)) }
    finally { sending.current = false; if (owner.current === userId) setBusy(false) }
  }

  return <section className="mx-auto max-w-3xl space-y-4 p-4 text-base">
    <a href="/program" className="inline-flex min-h-11 items-center underline">Back to program</a>
    <h1 className="text-2xl font-bold">Session and actual sets</h1>
    {error && <p role="alert">{error}</p>}
    {resolutionNotice && <p role="status">{resolutionNotice}</p>}
    {pending && <section className="rounded-lg border border-amber-500 p-3">
      <p>A previous {pending.operation === 'set' ? 'set save' : 'completion'} is unconfirmed. Recover it before recording more work.</p>
      <button type="button" className="app-primary mt-2 min-h-11 px-4" disabled={busy} onClick={() => void submit()}>Retry original save</button>
      <p className="mt-2">To edit a rejected save, first recover it or safely close it if it never saved.</p>
      <button type="button" className="mt-2 min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => void resolvePrevious()}>Resolve previous save</button>
    </section>}
    <button type="button" className="min-h-11 rounded-lg border px-4" disabled={busy}
      onClick={() => { setError(null); void refresh().catch(failure => setError(message(failure))) }}>Refresh saved session</button>
    {!state ? <p role="status">Session details are not available yet.</p> : <>
      <ReviewedSessionCard prescription={state.prescription} />
      <p className="capitalize">Status: {state.status}</p>
      {!state.writable && <p>This session is read-only. Saved-request recovery remains available.</p>}
      <ReviewedActualSetForm key={`${state.latestReportIds.join(':')}:${formRevision}`} state={state} initialReport={resolvedDraft ?? undefined} disabled={busy || !!pending || !storageReady || !state.writable}
        onSave={report => submit(report)} />
      {state.writable && <ReviewedCompletionForm key={formRevision} state={state} initialCompletion={resolvedCompletion ?? undefined} disabled={busy || !!pending || !storageReady}
        onSave={completion => submit(undefined, completion)} />}
    </>}
  </section>
}

function emptyReport(activityId: string, side: ReviewedSetReport['side']): ReviewedSetReport {
  return { schemaVersion: 2, activityId, setNumber: 1, side, revision: 1, status: 'performed', performedAt: new Date().toISOString(), rir: null,
    repetitions: null, durationSeconds: null, distanceMetres: null, load: null, rpe: null, restAfterSeconds: null,
    stopped: null, symptoms: null, note: null, velocity: null }
}

function localTimestamp(value: string) {
  const date = new Date(value)
  return `${getLocalDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function ReviewedActualSetForm({ state, disabled, onSave, initialReport }: {
  state: ReviewedSessionState; disabled: boolean; onSave: (report: ReviewedSetReport) => Promise<void>; initialReport?: ReviewedSetReport
}) {
  const activities = reviewedSessionActivities(state.prescription.content)
  const sideFor = (id: string) => {
    const activity = activities.find(value => value.id === id)!
    return activity.work.kind !== 'distance' && activity.work.sides === 2 ? 'left' : 'both'
  }
  const nextNumber = (activityId: string, side: ReviewedSetReport['side']) =>
    Math.max(0, ...state.reports.filter(row => row.report.activityId === activityId && row.report.side === side).map(row => row.report.setNumber)) + 1
  const newReport = (activityId: string) => {
    const report = emptyReport(activityId, sideFor(activityId))
    report.setNumber = nextNumber(activityId, report.side)
    return report
  }
  const latest = state.reports.filter(row => state.latestReportIds.includes(row.id))
  const [draft, setDraft] = useState(() => initialReport && activities.some(activity => activity.id === initialReport.activityId)
    ? structuredClone(initialReport) : newReport(activities[0].id))
  const [correcting, setCorrecting] = useState<string | null>(() => latest.find(row => initialReport
    && row.report.activityId === initialReport.activityId && row.report.side === initialReport.side
    && row.report.setNumber === initialReport.setNumber && row.report.revision + 1 === initialReport.revision)?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const change = <K extends keyof ReviewedSetReport>(key: K, value: ReviewedSetReport[K]) => setDraft(current => ({ ...current, [key]: value }))
  const numeric = (key: 'repetitions' | 'durationSeconds' | 'distanceMetres' | 'restAfterSeconds', label: string) =>
    <label>{label}<input className={inputClass} type="number" min="0" step={key === 'repetitions' ? '1' : 'any'}
      value={draft[key] ?? ''} onChange={event => change(key, event.target.value === '' ? null : Number(event.target.value))} /></label>
  const startNew = (activityId = draft.activityId) => { setDraft(newReport(activityId)); setCorrecting(null); setError(null) }
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">Saved actual sets</h2>
    {!latest.length && <p>No sets reported. Missing work is not treated as completed.</p>}
    <ul className="space-y-2">{latest.map(row => <li key={row.id} className="rounded-lg border p-3">
      <p>{activities.find(activity => activity.id === row.report.activityId)?.movementId.replaceAll('_', ' ')} · set {row.report.setNumber} · {row.report.side}</p>
      <p>{row.report.status === 'not_performed' ? 'Not performed' : `${row.report.repetitions ?? 'Unknown'} reps · RPE ${row.report.rpe?.value ?? 'unknown'} · RIR ${row.report.rir ?? 'unknown'} · rest ${row.report.restAfterSeconds ?? 'unknown'} seconds`}</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3">Full actual set details</summary>
        <ActualReportDetails report={row.report} />
        {state.reports.filter(prior => prior.report.activityId === row.report.activityId && prior.report.setNumber === row.report.setNumber
          && prior.report.side === row.report.side && prior.id !== row.id).map(prior => <details key={prior.id}>
          <summary className="min-h-11 cursor-pointer py-3">Earlier report · revision {prior.report.revision}</summary>
          <ActualReportDetails report={prior.report} />
        </details>)}
      </details>
      <button type="button" disabled={disabled} className="min-h-11 underline" onClick={() => {
        setDraft({ ...structuredClone(row.report), revision: row.report.revision + 1 }); setCorrecting(row.id); setError(null)
      }}>Correct this set</button>
    </li>)}</ul>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); setError(null)
      const report = parseReviewedSetReport(draft)
      if (!report) { setError('Check the actual values and units. Leave unknown values blank.'); return }
      const existing = latest.find(row => row.report.activityId === report.activityId && row.report.setNumber === report.setNumber && row.report.side === report.side)
      if (existing && existing.id !== correcting) { setError('Use Correct this set to revise an existing set, or choose a new set number.'); return }
      void onSave(report)
    }}>
      <h2 className="text-xl font-bold">{correcting ? 'Correct reported set' : 'Record an actual set'}</h2>
      <p>Enter what you actually did. Leave unknown values blank. Include RPE for each working set when you can assess it. Report RIR separately as your estimate of additional controlled reps remaining.</p>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <label>Performed at<input className={inputClass} type="datetime-local" value={localTimestamp(draft.performedAt)} onChange={event => {
          if (!event.target.value) return
          try { const [date, time] = event.target.value.split('T'); change('performedAt', localDateTimeToUTC(date, time, -getTimezoneOffset(new Date(event.target.value)))) }
          catch { setError('Choose a valid local date and time.') }
        }} /></label>
        <label>Movement<select className={inputClass} disabled={!!correcting} value={draft.activityId} onChange={event => startNew(event.target.value)}>
          {activities.map(activity => <option key={activity.id} value={activity.id}>{activity.movementId.replaceAll('_', ' ')} · {activity.role}</option>)}
        </select></label>
        <label>Set number<input className={inputClass} disabled={!!correcting} type="number" min="1" max="1000" step="1" value={draft.setNumber}
          onChange={event => change('setNumber', Number(event.target.value))} /></label>
        <label>Side<select className={inputClass} disabled={!!correcting} value={draft.side} onChange={event => {
          const side = event.target.value as ReviewedSetReport['side']
          setDraft(current => ({ ...current, side, setNumber: nextNumber(current.activityId, side) }))
        }}>
          {sideFor(draft.activityId) === 'both' ? <option value="both">Both / whole movement</option> : <><option value="left">Left</option><option value="right">Right</option></>}
        </select></label>
        <label>Set outcome<select className={inputClass} value={draft.status} onChange={event => {
          const status = event.target.value as ReviewedSetReport['status']
          setDraft(current => ({ ...current, status, ...(status === 'not_performed' ? {
            repetitions: null, durationSeconds: null, distanceMetres: null, load: null, rpe: null, restAfterSeconds: null, velocity: null,
            ...(current.schemaVersion === 2 ? { rir: null } : {}),
          } : {}) }))
        }}><option value="performed">Performed</option><option value="not_performed">Not performed</option></select></label>
        {draft.status === 'performed' && <>
          {numeric('repetitions', 'Actual reps')}{numeric('durationSeconds', 'Actual duration (seconds)')}
          {numeric('distanceMetres', 'Actual distance (metres)')}{numeric('restAfterSeconds', 'Rest after set (seconds)')}
          <label>Actual load<input className={inputClass} type="number" min="0" step="any" value={draft.load?.value ?? ''} onChange={event => change('load',
            event.target.value === '' ? null : { value: Number(event.target.value), unit: draft.load?.unit ?? 'lb', convention: draft.load?.convention ?? 'total' })} /></label>
          <label>Load unit<select className={inputClass} disabled={!draft.load} value={draft.load?.unit ?? 'lb'} onChange={event => draft.load && change('load', { ...draft.load, unit: event.target.value as 'lb' | 'kg' })}><option value="lb">lb</option><option value="kg">kg</option></select></label>
          <label>Load convention<select className={inputClass} disabled={!draft.load} value={draft.load?.convention ?? 'total'} onChange={event => draft.load && change('load', { ...draft.load, convention: event.target.value as 'total' | 'per_hand' })}><option value="total">Total load</option><option value="per_hand">Per hand</option></select></label>
          <label>Actual set RPE<input className={inputClass} type="number" min="0" max="10" step="0.5" value={draft.rpe?.value ?? ''} onChange={event => change('rpe',
            event.target.value === '' ? null : { value: Number(event.target.value), scale: draft.rpe?.scale ?? 'effort_0_10' })} /></label>
          <label>RPE scale<select className={inputClass} disabled={!draft.rpe} value={draft.rpe?.scale ?? 'effort_0_10'} onChange={event => draft.rpe && change('rpe', { ...draft.rpe, scale: event.target.value as 'effort_0_10' | 'rir_based' })}><option value="effort_0_10">Effort, 0–10</option><option value="rir_based">Reps-in-reserve-based RPE</option></select></label>
          <label>Actual set RIR (estimated)<input className={inputClass} type="number" min="0" max="1000" step="any" value={draft.rir ?? ''}
            onChange={event => setDraft(current => ({ ...current, schemaVersion: 2,
              rir: event.target.value === '' ? null : Number(event.target.value) }))} /></label>
        </>}
        <label>Stopped early?<select className={inputClass} value={draft.stopped === null ? '' : String(draft.stopped)} onChange={event => change('stopped', event.target.value === '' ? null : event.target.value === 'true')}><option value="">Unknown</option><option value="false">No</option><option value="true">Yes</option></select></label>
        <label>Symptoms<input className={inputClass} maxLength={500} value={draft.symptoms ?? ''} onChange={event => change('symptoms', event.target.value.trim() ? event.target.value : null)} /></label>
        <label>What changed and why?<textarea className={inputClass} maxLength={1000} value={draft.note ?? ''} onChange={event => change('note', event.target.value.trim() ? event.target.value : null)} /></label>
        {draft.status === 'performed' && <details className="sm:col-span-2">
          <summary className="min-h-11 cursor-pointer py-3">Rep velocity (optional)</summary>
          <p>Record the measured mean concentric speed for each available rep. Keep the device and method with the measurements.</p>
          <label>Device<input className={inputClass} value={draft.velocity?.device ?? ''} onChange={event => change('velocity', {
            unit: 'm/s', device: event.target.value, method: draft.velocity?.method ?? '', repetitions: draft.velocity?.repetitions ?? [],
          })} /></label>
          <label>Measurement method<input className={inputClass} value={draft.velocity?.method ?? ''} onChange={event => change('velocity', {
            unit: 'm/s', device: draft.velocity?.device ?? '', method: event.target.value, repetitions: draft.velocity?.repetitions ?? [],
          })} /></label>
          {draft.velocity?.repetitions.map((rep, index) => <div key={index} className="grid grid-cols-2 gap-2">
            <label>Rep number<input className={inputClass} type="number" min="1" step="1" value={rep.rep} onChange={event => draft.velocity && change('velocity', {
              ...draft.velocity, repetitions: draft.velocity.repetitions.map((value, position) => position === index ? { ...value, rep: Number(event.target.value) } : value),
            })} /></label>
            <label>Mean velocity (m/s)<input className={inputClass} type="number" min="0" step="any" value={Number.isFinite(rep.meanConcentricVelocity) ? rep.meanConcentricVelocity : ''} onChange={event => draft.velocity && change('velocity', {
              ...draft.velocity, repetitions: draft.velocity.repetitions.map((value, position) => position === index ? { ...value, meanConcentricVelocity: event.target.value === '' ? NaN : Number(event.target.value) } : value),
            })} /></label>
          </div>)}
          <button type="button" className="min-h-11 underline" onClick={() => change('velocity', {
            unit: 'm/s', device: draft.velocity?.device ?? '', method: draft.velocity?.method ?? '',
            repetitions: [...(draft.velocity?.repetitions ?? []), { rep: (draft.velocity?.repetitions.length ?? 0) + 1, meanConcentricVelocity: NaN }],
          })}>Add measured rep</button>
          {draft.velocity && <button type="button" className="ml-4 min-h-11 underline" onClick={() => change('velocity', null)}>Mark velocity unknown</button>}
        </details>}
        <button className="app-primary min-h-11 px-4" type="submit">Save actual set</button>
        {correcting && <button type="button" className="min-h-11 underline" onClick={() => startNew()}>Start a new set</button>}
      </fieldset>
    </form>
  </section>
}

function ActualReportDetails({ report }: { report: ReviewedSetReport }) {
  const fields = [
    ['Revision', report.revision], ['Set outcome', report.status.replaceAll('_', ' ')],
    ['Performed at (local)', formatUTCAsLocalDateTime(report.performedAt)], ['Repetitions', report.repetitions ?? 'Unknown'],
    ['Duration', report.durationSeconds === null ? 'Unknown' : `${report.durationSeconds} seconds`],
    ['Distance', report.distanceMetres === null ? 'Unknown' : `${report.distanceMetres} metres`],
    ['Load', report.load ? `${report.load.value} ${report.load.unit} · ${report.load.convention.replaceAll('_', ' ')}` : 'Unknown'],
    ['Set RPE', report.rpe ? `${report.rpe.value} · ${report.rpe.scale === 'rir_based' ? 'reps-in-reserve-based' : 'effort 0–10'}` : 'Unknown'],
    ['Set RIR (athlete estimate)', report.rir ?? 'Unknown'],
    ['Rest after set', report.restAfterSeconds === null ? 'Unknown' : `${report.restAfterSeconds} seconds`],
    ['Stopped early', report.stopped === null ? 'Unknown' : report.stopped ? 'Yes' : 'No'],
    ['Symptoms', report.symptoms ?? 'Unreported'], ['Note', report.note ?? 'Unreported'],
  ]
  return <div className="space-y-2"><dl className="grid gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0">
    <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd>
  </div>)}</dl>
    {report.velocity ? <><p>Velocity: {report.velocity.device} · {report.velocity.method} · mean concentric m/s</p>
      <ul>{report.velocity.repetitions.map(rep => <li key={rep.rep}>Rep {rep.rep}: {rep.meanConcentricVelocity} m/s</li>)}</ul></> : <p>Rep velocity: unknown</p>}
  </div>
}

export function ReviewedCompletionForm({ state, disabled, onSave, initialCompletion }: {
  state: ReviewedSessionState; disabled: boolean; onSave: (completion: Record<string, unknown>) => Promise<void>; initialCompletion?: Record<string, unknown>
}) {
  const actuals = state.reports.filter(row => state.latestReportIds.includes(row.id))
  const performed = actuals.filter(row => row.report.status === 'performed')
  const prior = object(initialCompletion?.feedback) ? initialCompletion.feedback : {}
  const oneOf = (value: unknown, choices: string[]) => typeof value === 'string' && choices.includes(value) ? value : ''
  const numberText = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
  const [outcome, setOutcome] = useState(() => oneOf(prior.outcome, performed.length ? ['as_planned', 'modified', 'stopped_early'] : ['skipped']))
  const [rpe, setRpe] = useState(() => numberText(prior.sessionRpe)), [duration, setDuration] = useState(() => numberText(initialCompletion?.totalDurationMinutes))
  const [energy, setEnergy] = useState(() => oneOf(prior.energy, ['low', 'okay', 'high']))
  const [pain, setPain] = useState(() => oneOf(prior.pain, ['none', 'mild', 'concerning']))
  const [note, setNote] = useState(() => typeof prior.note === 'string' ? prior.note : '')
  const [occurredAt, setOccurredAt] = useState(() => typeof initialCompletion?.occurredAt === 'string'
    && Number.isFinite(Date.parse(initialCompletion.occurredAt)) ? initialCompletion.occurredAt : new Date().toISOString())
  const [finishEdited, setFinishEdited] = useState(() => typeof initialCompletion?.occurredAt === 'string'
    && Number.isFinite(Date.parse(initialCompletion.occurredAt)))
  const [error, setError] = useState<string | null>(null)
  return <form className="space-y-3 rounded-lg border p-4" onSubmit={event => {
    event.preventDefault(); setError(null)
    if (!oneOf(outcome, performed.length ? ['as_planned', 'modified', 'stopped_early'] : ['skipped'])) { setError('Choose how the session went.'); return }
    const finishTime = finishEdited ? occurredAt : new Date().toISOString()
    const finished = Date.parse(finishTime)
    if (!Number.isFinite(finished)) { setError('Choose when this session finished.'); return }
    if (finished > Date.now() + 5 * 60 * 1000) { setError('The finish time cannot be in the future.'); return }
    if (actuals.some(row => Date.parse(row.report.performedAt) > finished)) { setError('The finish time must be at or after every reported set.'); return }
    const tzOffset = getTimezoneOffset(new Date(finishTime))
    const first = performed.map(row => row.report.performedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? finishTime
    const workoutDate = formatUTCAsLocalDateWithOffset(first, tzOffset)
    const finishDate = formatUTCAsLocalDateWithOffset(finishTime, tzOffset)
    const daysApart = (Date.parse(`${finishDate}T00:00:00Z`) - Date.parse(`${workoutDate}T00:00:00Z`)) / 86400000
    if (daysApart < 0 || daysApart > 1) { setError('Choose the actual finish time on the first set’s day or the following day for an overnight session.'); return }
    const values = { sessionRpe: !performed.length || rpe === '' ? null : Number(rpe), energy: energy === '' ? null : energy as 'low' | 'okay' | 'high',
      pain: pain === '' ? null : pain as 'none' | 'mild' | 'concerning' }
    void onSave({ contractVersion: 3, status: outcome === 'skipped' ? 'skipped' : 'completed', occurredAt: finishTime,
      workoutDate, tzOffset,
      totalDurationMinutes: !performed.length || duration === '' ? null : Number(duration), setReportIds: state.latestReportIds,
      feedback: { schemaVersion: 2, feedbackVersion: 2, outcome, ...values, note: note.trim() || null, provenance: reportedFeedbackProvenance(values) } })
  }}>
    <h2 className="text-xl font-bold">Finish this session</h2>
    <p>This saves the latest reported sets above. Unreported sets stay unknown.</p>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <label>Finished at<input className={inputClass} type="datetime-local" required value={occurredAt ? localTimestamp(occurredAt) : ''} onChange={event => {
        setFinishEdited(true)
        if (!event.target.value) { setOccurredAt(''); return }
        try {
          const entered = event.target.value, [date, time] = entered.split('T')
          const converted = localDateTimeToUTC(date, time, -getTimezoneOffset(new Date(entered)))
          if (localTimestamp(converted) !== entered) throw new RangeError('Local time does not exist')
          setOccurredAt(converted)
        }
        catch { setOccurredAt(''); setError('Choose a valid local date and time.') }
      }} /><span className="block">Leave the default for a session you are finishing now. When logging later, enter the local time you finished or skipped it.</span></label>
      <label>Session outcome<select className={inputClass} value={outcome} onChange={event => setOutcome(event.target.value)}>
        <option value="">Choose an outcome</option>
        {performed.length ? <><option value="as_planned">As planned</option><option value="modified">Modified</option><option value="stopped_early">Stopped early</option></> : <option value="skipped">Skipped</option>}
      </select></label>
      {!!performed.length && <>
        <label>Overall session RPE<input className={inputClass} type="number" min="1" max="10" step="0.5" value={rpe} onChange={event => setRpe(event.target.value)} /></label>
        <label>Actual duration (minutes)<input className={inputClass} type="number" min="1" max="1440" step="1" value={duration} onChange={event => setDuration(event.target.value)} /></label>
      </>}
      <label>Energy<select className={inputClass} value={energy} onChange={event => setEnergy(event.target.value)}><option value="">Unanswered</option><option value="low">Low</option><option value="okay">Okay</option><option value="high">High</option></select></label>
      <label>Pain<select className={inputClass} value={pain} onChange={event => setPain(event.target.value)}><option value="">Unanswered</option><option value="none">None</option><option value="mild">Mild</option><option value="concerning">Concerning</option></select></label>
      <label>Session note<textarea className={inputClass} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button type="submit" className="app-primary min-h-11 px-4">Save session outcome</button>
    </fieldset>
  </form>
}
