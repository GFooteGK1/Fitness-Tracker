'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import type {
  CoachTrustCenter as CoachTrustCenterModel,
  CoachTrustImport,
  CoachTrustMemory,
  CoachTrustProposal,
  CoachTrustObservationValue
} from '@/app/lib/coach/trust-center'
import { QwikImportPanel } from './qwik-import-panel'

interface CoachTrustCenterProps {
  onPlanChanged?: () => void | Promise<void>
}

type TrustAction =
  | 'reaffirm_memory'
  | 'withdraw_memory'
  | 'correct_memory'
  | 'confirm_import'
  | 'reject_import'
  | 'accept_proposal'
  | 'reject_proposal'

const ROLE_LABELS: Record<string, string> = {
  target: 'Targets',
  estimate: 'Estimates',
  proxy: 'Proxies',
  training_signal: 'Training signals',
  direct_outcome: 'Direct outcomes'
}

export function CoachTrustCenter({ onPlanChanged }: CoachTrustCenterProps) {
  const [trust, setTrust] = useState<CoachTrustCenterModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editMemoryId, setEditMemoryId] = useState<string | null>(null)
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const retryKeys = useRef(new Map<string, string>())

  const load = useCallback(async (preserveContent = false) => {
    if (!preserveContent) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/coach/trust')
      const body = await response.json()
      if (!response.ok && !body.trust) throw new Error(errorMessage(body, 'Trust center unavailable'))
      setTrust(body.trust as CoachTrustCenterModel)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trust center unavailable')
    } finally {
      if (!preserveContent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (
    action: TrustAction,
    resourceId: string,
    extra: Record<string, unknown> = {},
    successMessage = 'Review saved.'
  ) => {
    const actionKey = `${action}:${resourceId}`
    retryKeys.current.set(actionKey, retryKeys.current.get(actionKey) ?? createIdempotencyKey('trust'))
    setBusy(actionKey)
    setError(null)
    setStatus(null)
    try {
      const response = await fetch('/api/coach/trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          resourceId,
          idempotencyKey: retryKeys.current.get(actionKey),
          ...extra
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to save review'))
      setTrust(body.trust as CoachTrustCenterModel)
      retryKeys.current.delete(actionKey)
      setEditMemoryId(null)
      setReasonFor(null)
      setStatus(successMessage)
      if (action === 'accept_proposal') await onPlanChanged?.()
    } catch (caught) {
      const prefix = typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. '
        : ''
      setError(`${prefix}${caught instanceof Error ? caught.message : 'Unable to save review'} Your entry is still here; retry uses the same save key.`)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <section aria-label="Coach trust center" className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">Loading what Coach knows…</section>
  }
  if (!trust) {
    return <Unavailable message={error ?? 'Trust center unavailable'} onRetry={() => void load()} />
  }
  if (!trust.available) {
    return <Unavailable message={trust.unavailableReason ?? 'Trust center storage is not available yet'} onRetry={() => void load()} />
  }

  return (
    <section aria-labelledby="coach-trust-title" className="space-y-4 rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950/30 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Data trust</p>
        <h2 id="coach-trust-title" className="mt-1 text-xl font-bold text-gray-950 dark:text-white">What Coach knows and why it matters</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          You control confirmed facts, imported evidence, and plan changes. One hard day never changes the plan by itself.
        </p>
      </div>

      {status && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{status}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}

      <TrustSection title="What Coach Knows" description="Only athlete-confirmed facts appear here.">
        {trust.memories.length === 0 ? <Empty>No confirmed facts yet.</Empty> : trust.memories.map(memory => (
          <article key={memory.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label(memory.memoryKey)} · version {memory.version}</p>
                <p className="mt-1 font-semibold text-gray-950 dark:text-white">{memory.summary}</p>
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {memory.source} · {confidence(memory.confidence)} confidence · confirmed {dateLabel(memory.confirmedAt)}
                  {memory.lastReviewedAt ? ` · reviewed ${dateLabel(memory.lastReviewedAt)}` : ''}
                </p>
              </div>
              <Badge tone={memory.freshness === 'review_due' ? 'amber' : 'green'}>
                {memory.freshness === 'review_due' ? 'Review due' : 'Current'}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void act('reaffirm_memory', memory.id, {}, 'Coach memory reaffirmed.')} className={secondaryButton}>Still correct</button>
              <button type="button" disabled={busy !== null} onClick={() => {
                setMemoryDrafts(current => ({ ...current, [memory.id]: { ...memory.content } }))
                setEditMemoryId(memory.id)
                setReasonFor(null)
              }} className={secondaryButton}>Correct</button>
              <button type="button" disabled={busy !== null} onClick={() => {
                setReasonFor(`withdraw:${memory.id}`)
                setEditMemoryId(null)
              }} className={warningButton}>Withdraw</button>
            </div>

            {editMemoryId === memory.id && (
              <MemoryCorrectionForm
                memory={memory}
                value={memoryDrafts[memory.id] ?? memory.content}
                onChange={content => setMemoryDrafts(current => ({ ...current, [memory.id]: content }))}
                onCancel={() => setEditMemoryId(null)}
                onSave={content => void act('correct_memory', memory.id, { content }, 'Coach memory corrected as a new version.')}
                saving={busy === `correct_memory:${memory.id}`}
              />
            )}
            {reasonFor === `withdraw:${memory.id}` && (
              <ReasonForm
                label="Why should Coach stop using this fact?"
                value={reasons[`withdraw:${memory.id}`] ?? ''}
                onChange={value => setReasons(current => ({ ...current, [`withdraw:${memory.id}`]: value }))}
                onCancel={() => setReasonFor(null)}
                onSubmit={reason => void act('withdraw_memory', memory.id, { reason }, 'Coach memory withdrawn. History was preserved.')}
                submitting={busy === `withdraw_memory:${memory.id}`}
                submitLabel="Confirm withdrawal"
              />
            )}
          </article>
        ))}
      </TrustSection>

      <TrustSection title="Needs Review" description="Import measurements here, then confirm what Coach may use.">
        <QwikImportPanel onImported={() => load(true)} />
        {trust.imports.length === 0 ? <Empty>No measurement imports need review.</Empty> : trust.imports.map(item => (
          <ImportReviewCard
            key={item.id}
            item={item}
            mappings={mappings}
            setMapping={(groupId, movementId) => setMappings(current => ({ ...current, [groupId]: movementId }))}
            reason={reasons[`import:${item.id}`] ?? ''}
            rejecting={reasonFor === `import:${item.id}`}
            busy={busy}
            onShowReject={() => setReasonFor(`import:${item.id}`)}
            onCancelReject={() => setReasonFor(null)}
            onReasonChange={value => setReasons(current => ({ ...current, [`import:${item.id}`]: value }))}
            onConfirm={selected => void act('confirm_import', item.id, { mappings: selected }, 'Qwik import confirmed. Eligible observations can now enter evidence selection.')}
            onReject={reason => void act('reject_import', item.id, { reason }, 'Qwik import rejected and excluded from evidence.')}
          />
        ))}
      </TrustSection>

      <TrustSection title="Quality Progress" description="Targets, estimates, proxies, training signals, and direct outcomes stay distinct.">
        {trust.goals.length === 0 ? <Empty>Accept an adaptive plan to establish goal and quality tracking.</Empty> : (
          <div className="space-y-3">
            {trust.goals.map(goal => (
              <article key={goal.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={goal.priority === 'primary' ? 'blue' : 'gray'}>{label(goal.priority)}</Badge>
                  <p className="font-semibold text-gray-950 dark:text-white">{goal.statement}</p>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{goal.startsOn} through {goal.endsOn} · {goal.target ? `Target ${goal.target}` : 'No numeric target supplied'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trust.qualities.filter(item => item.goalId === goal.id).map(item => (
                    <Badge key={item.id} tone={item.state === 'development' ? 'blue' : 'gray'}>{label(item.qualityId)} · {label(item.state)}</Badge>
                  ))}
                </div>
              </article>
            ))}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {Object.keys(ROLE_LABELS).map(role => {
                const signal = trust.signalSummary.find(item => item.semanticRole === role)
                return (
                  <div key={role} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{ROLE_LABELS[role]}</p>
                    <p className="mt-1 text-lg font-bold text-gray-950 dark:text-white">{signal?.count ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{signal?.latestObservedAt ? `Latest ${dateLabel(signal.latestObservedAt)}` : 'No confirmed evidence'}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </TrustSection>

      <TrustSection title="Why This Changed" description="A proposal is an explanation and a draft. Your accepted plan remains active until you accept a replacement.">
        {trust.proposals.length === 0 ? <Empty>No adaptation proposals need a decision.</Empty> : trust.proposals.map(proposal => (
          <ProposalReviewCard
            key={proposal.id}
            proposal={proposal}
            reason={reasons[`proposal:${proposal.id}`] ?? ''}
            rejecting={reasonFor === `proposal:${proposal.id}`}
            busy={busy}
            onShowReject={() => setReasonFor(`proposal:${proposal.id}`)}
            onCancelReject={() => setReasonFor(null)}
            onReasonChange={value => setReasons(current => ({ ...current, [`proposal:${proposal.id}`]: value }))}
            onAccept={() => void act('accept_proposal', proposal.id, {}, 'Replacement plan accepted.')}
            onReject={reason => void act('reject_proposal', proposal.id, { reason }, 'Adaptation proposal rejected. Your current plan remains active.')}
          />
        ))}
      </TrustSection>
    </section>
  )
}

function ImportReviewCard(props: {
  item: CoachTrustImport
  mappings: Record<string, string>
  setMapping: (groupId: string, movementId: string) => void
  reason: string
  rejecting: boolean
  busy: string | null
  onShowReject: () => void
  onCancelReject: () => void
  onReasonChange: (value: string) => void
  onConfirm: (mappings: Array<{ groupId: string; movementId: string }>) => void
  onReject: (reason: string) => void
}) {
  const selections = props.item.groups
    .filter(group => group.mappingStatus === 'ambiguous')
    .map(group => ({ groupId: group.id, movementId: props.mappings[group.id] ?? '' }))
  const everyAmbiguousMapped = selections.every(item => item.movementId)
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-gray-950 dark:text-white">{props.item.fileName}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Qwik · exported {props.item.sourceExportedAt ? dateLabel(props.item.sourceExportedAt) : 'time unavailable'} · hash {props.item.fileHashPrefix}…</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Normalized measurements only. Original file stays with you and was not uploaded.</p>
        </div>
        <Badge tone="amber">{props.item.groups.length} sets · {props.item.warningCount} warnings</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {props.item.groups.map(group => (
          <div key={group.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{group.sourceExercise}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{dateLabel(group.observedAt)} · {group.protocol} · {measurementSummary(group.values)}</p>
              </div>
              <Badge tone={group.mappingStatus === 'mapped' ? 'green' : group.mappingStatus === 'ambiguous' ? 'amber' : 'red'}>{label(group.mappingStatus)}</Badge>
            </div>
            {group.mappingStatus === 'mapped' && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Mapped to {group.canonicalMovementName}</p>}
            {group.mappingStatus === 'ambiguous' && (
              <label className="mt-3 block text-sm font-medium text-gray-800 dark:text-gray-200">
                Choose the movement
                <select value={props.mappings[group.id] ?? ''} onChange={event => props.setMapping(group.id, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                  <option value="">Select a movement</option>
                  {group.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </label>
            )}
            {group.mappingStatus === 'unmapped' && <p className="mt-2 text-sm text-red-700 dark:text-red-300">No supported movement match is available.</p>}
          </div>
        ))}
      </div>
      {props.item.blockingReason && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{props.item.blockingReason}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={props.busy !== null || !props.item.canConfirm || !everyAmbiguousMapped} onClick={() => props.onConfirm(selections)} className={primaryButton}>Confirm import</button>
        <button type="button" disabled={props.busy !== null} onClick={props.onShowReject} className={warningButton}>Reject import</button>
      </div>
      {props.rejecting && <ReasonForm label="Why should these measurements be excluded?" value={props.reason} onChange={props.onReasonChange} onCancel={props.onCancelReject} onSubmit={props.onReject} submitting={props.busy === `reject_import:${props.item.id}`} submitLabel="Confirm rejection" />}
    </article>
  )
}

function ProposalReviewCard(props: {
  proposal: CoachTrustProposal
  reason: string
  rejecting: boolean
  busy: string | null
  onShowReject: () => void
  onCancelReject: () => void
  onReasonChange: (value: string) => void
  onAccept: () => void
  onReject: (reason: string) => void
}) {
  return (
    <article className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{label(props.proposal.action)}</Badge><Badge tone="gray">{label(props.proposal.trend)}</Badge><Badge tone="gray">{label(props.proposal.evidenceStatus)}</Badge></div>
      <p className="mt-3 font-semibold text-gray-950 dark:text-white">Evidence-derived proposal</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700 dark:text-gray-200">
        {props.proposal.explanation.map(item => <li key={item}>{item}</li>)}
      </ul>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {props.proposal.includedCount} observations included · {props.proposal.excludedCount} excluded · {props.proposal.confidence === null ? 'confidence unavailable' : `${confidence(props.proposal.confidence)} confidence`}.
      </p>
      {props.proposal.excludedReasons.length > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Excluded because: {props.proposal.excludedReasons.map(label).join(', ')}.</p>
      )}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Created {dateLabel(props.proposal.createdAt)} · automatic activation is off.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={props.busy !== null} onClick={props.onAccept} className={primaryButton}>Accept replacement</button>
        <button type="button" disabled={props.busy !== null} onClick={props.onShowReject} className={warningButton}>Reject proposal</button>
      </div>
      {props.rejecting && <ReasonForm label="Why are you rejecting this change?" value={props.reason} onChange={props.onReasonChange} onCancel={props.onCancelReject} onSubmit={props.onReject} submitting={props.busy === `reject_proposal:${props.proposal.id}`} submitLabel="Confirm rejection" />}
    </article>
  )
}

function MemoryCorrectionForm(props: {
  memory: CoachTrustMemory
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  onCancel: () => void
  onSave: (value: Record<string, unknown>) => void
  saving: boolean
}) {
  const fields = Object.entries(props.value).filter(([, value]) => (
    typeof value === 'string' || typeof value === 'number' || isStringArray(value)
  ))
  return (
    <form className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20" onSubmit={event => { event.preventDefault(); props.onSave(props.value) }}>
      <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">Save a corrected version</p>
      {fields.map(([field, value]) => (
        <label key={field} className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {label(field)}
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={Array.isArray(value) ? value.join(', ') : String(value)}
            onChange={event => props.onChange({
              ...props.value,
              [field]: typeof value === 'number'
                ? Number(event.target.value)
                : Array.isArray(value)
                  ? event.target.value.split(',').map(item => item.trim()).filter(Boolean)
                  : event.target.value
            })}
            className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={props.saving || fields.length === 0} className={primaryButton}>{props.saving ? 'Saving…' : 'Save correction'}</button>
        <button type="button" onClick={props.onCancel} className={secondaryButton}>Cancel</button>
      </div>
    </form>
  )
}

function ReasonForm(props: {
  label: string
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: (reason: string) => void
  submitting: boolean
  submitLabel: string
}) {
  return (
    <form className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20" onSubmit={event => { event.preventDefault(); props.onSubmit(props.value.trim()) }}>
      <label className="block text-sm font-medium text-amber-950 dark:text-amber-100">{props.label}
        <textarea value={props.value} onChange={event => props.onChange(event.target.value)} minLength={3} maxLength={500} required rows={3} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-amber-800 dark:bg-gray-900 dark:text-white" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={props.submitting || props.value.trim().length < 3} className={warningButton}>{props.submitting ? 'Saving…' : props.submitLabel}</button>
        <button type="button" onClick={props.onCancel} className={secondaryButton}>Cancel</button>
      </div>
    </form>
  )
}

function TrustSection(props: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-3"><div><h3 className="text-lg font-bold text-gray-950 dark:text-white">{props.title}</h3><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{props.description}</p></div>{props.children}</section>
}

function Unavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section aria-label="Coach trust center unavailable" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30"><h2 className="font-bold text-amber-950 dark:text-amber-100">Data trust is unavailable</h2><p role="alert" className="mt-2 text-sm text-amber-900 dark:text-amber-200">{message}</p><button type="button" onClick={onRetry} className={`mt-3 ${secondaryButton}`}>Try again</button></section>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{children}</p>
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  const colors = { green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', blue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>
}

const primaryButton = 'min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const warningButton = 'min-h-11 rounded-xl border border-amber-500 bg-white px-4 py-2 font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-900 dark:text-amber-200'

function measurementSummary(values: CoachTrustObservationValue[]): string {
  const load = values.find(item => item.metricId === 'strength.load')
  const reps = values.find(item => item.metricId === 'strength.repetitions')
  const velocities = values.filter(item => item.metricId === 'bar.mean_velocity')
  return [load ? `${load.value} ${load.unit}` : null, reps ? `${reps.value} reps` : null, velocities.length ? `${velocities.length} velocity readings` : null].filter(Boolean).join(' · ')
}

function confidence(value: number): string { return `${Math.round(value * 100)}%` }
function dateLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
function label(value: string): string { return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string') }
function createIdempotencyKey(prefix: string): string { return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}` }
function errorMessage(body: unknown, fallback: string): string { return typeof body === 'object' && body !== null && !Array.isArray(body) && 'error' in body && typeof body.error === 'string' ? body.error : fallback }
