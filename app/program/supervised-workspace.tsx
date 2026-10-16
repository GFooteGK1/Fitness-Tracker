'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTimezoneOffset } from '@/app/lib/timezone-utils'
import { parseSupervisedProgramsPage, parseSupervisedProgramWorkspace, type SupervisedProgramsPage, type SupervisedProgramWorkspace } from '@/app/lib/coach/supervised-workspace-reader'
import { parseSupervisedCandidateDraft, type SupervisedCandidateDraft } from '@/app/lib/coach/supervised-candidate-draft'
import { parseSupervisedCandidateReview, parseSupervisedReviewPacket, type SupervisedReviewPacket, type SupervisedCandidateReview } from '@/app/lib/coach/supervised-programming-contract'
import { readSupervisedPending, saveSupervisedPending, performSupervisedPending, supervisedDraftHash, listSupervisedPendingPrograms, type SupervisedPending } from '@/app/lib/coach/supervised-pending'
import type { SupervisedWeekSeed } from '@/app/lib/coach/supervised-draft-editor'
import { SupervisedWeekEditor } from './supervised-week-editor'
import { ReviewedWeekView } from './reviewed-session-card'

const actionClass = 'min-h-11 rounded-lg border px-4 py-2 disabled:opacity-50'
const errorText = (e: unknown) => e instanceof Error ? e.message : 'This result could not be verified. Refresh or recover the saved request.'
type Draft = { enrollmentId: string; basePlanVersionId: string; seed: SupervisedWeekSeed }
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')

/** Evidence remains attributed observations, including unknowns; it is not a
 * coaching conclusion. Render its structure rather than exposing raw JSON.
 */
function EvidenceValue({ value }: { value: unknown }) {
  if (value === null) return <span>Not reported</span>
  if (Array.isArray(value)) return value.length ? <ul className="ml-4 list-disc">{value.map((v, i) => <li key={i}><EvidenceValue value={v} /></li>)}</ul> : <span>None recorded</span>
  if (typeof value === 'object') return <dl className="space-y-1">{Object.entries(value as Record<string, unknown>).map(([key, child]) =>
    <div key={key} className="border-l pl-3"><dt className="font-medium capitalize">{key === 'rir' ? 'Reps in reserve' : key === 'rpe' ? 'RPE' : label(key)}</dt><dd><EvidenceValue value={child} /></dd></div>)}</dl>
  return <span>{typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</span>
}
function Evidence({ summary }: { summary: string }) {
  let value: unknown = summary
  try { value = JSON.parse(summary) } catch { /* Legacy bounded summaries remain text. */ }
  return <EvidenceValue value={value} />
}

export function SupervisedWorkspace({ userId }: { userId: string }) {
  const [programs, setPrograms] = useState<SupervisedProgramsPage | null>(null), [selected, setSelected] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<SupervisedProgramWorkspace | null>(null), [candidate, setCandidate] = useState<SupervisedCandidateReview | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null), [rationale, setRationale] = useState(''), [historyDays, setHistoryDays] = useState(90)
  const [preview, setPreview] = useState<{ draft: SupervisedCandidateDraft; packet: SupervisedReviewPacket } | null>(null)
  const [recoveryPrograms, setRecoveryPrograms] = useState<string[]>([])
  const [pending, setPending] = useState<SupervisedPending | null>(null), [storageReady, setStorageReady] = useState(false)
  const [busy, setBusy] = useState(false), [writesEnabled, setWritesEnabled] = useState(false), [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const actor = useRef<string | null>(userId), scope = useRef<string | null>(selected), working = useRef(false), readSequence = useRef(0)
  actor.current = userId; scope.current = selected
  const current = useCallback((program?: string) => actor.current === userId && (!program || scope.current === program), [userId])

  const readWorkspace = useCallback(async (programId: string, after: string | null = null) => {
    const sequence = ++readSequence.current
    const response = await fetch(`/api/coach/supervised/programs/${programId}${after ? `?afterCandidateId=${after}` : ''}`, { cache: 'no-store' })
    const body = await response.json(), page = parseSupervisedProgramWorkspace(body.page, userId, programId, after)
    if (!current(programId) || sequence !== readSequence.current) return
    if (!response.ok || body.kind !== 'workspace' || !page || typeof body.writesEnabled !== 'boolean') throw new Error(body.error ?? 'Program workspace unavailable.')
    setWorkspace(page); setWritesEnabled(body.writesEnabled)
  }, [userId, current])

  useEffect(() => {
    let disposed = false
    actor.current = userId
    void (async () => {
      try {
        const recoverable = listSupervisedPendingPrograms(localStorage, userId)
        if (!disposed && actor.current === userId) { setRecoveryPrograms(recoverable); setSelected(recoverable[0] ?? null) }
        const response = await fetch('/api/coach/supervised/programs', { cache: 'no-store' }), body = await response.json()
        const page = parseSupervisedProgramsPage(body.page, userId)
        if (disposed || actor.current !== userId) return
        if (!response.ok || body.kind !== 'programs' || !page) throw new Error(body.error ?? 'Assigned programs could not be read.')
        setPrograms(page); setSelected(recoverable[0] ?? page.programs[0]?.programId ?? null)
      } catch (e) { if (!disposed && actor.current === userId) setError(errorText(e)) }
    })()
    return () => { disposed = true; actor.current = null }
  }, [userId])

  useEffect(() => {
    setWorkspace(null); setCandidate(null); setDraft(null); setPreview(null); setReviewed(false); setWritesEnabled(false); setStorageReady(false)
    if (!selected) return
    try { setPending(readSupervisedPending(localStorage, userId, selected)); setStorageReady(true) }
    catch (e) { setError(errorText(e)) }
    void readWorkspace(selected).catch(e => { if (current(selected)) setError(errorText(e)) })
  }, [userId, selected, readWorkspace, current])

  async function perform(task: () => Promise<void>) {
    if (working.current) return
    working.current = true; setBusy(true); setError(null); setNotice(null)
    try { await task() } catch (e) { if (actor.current === userId) setError(errorText(e)) }
    finally { working.current = false; if (actor.current === userId) setBusy(false) }
  }
  async function loadCandidate(candidateId: string) {
    const programId = selected
    if (!programId) return
    const response = await fetch(`/api/coach/supervised/candidates/${candidateId}`, { cache: 'no-store' }), body = await response.json()
    const c = parseSupervisedCandidateReview(body.candidate)
    if (!current(programId)) return
    if (!response.ok || body.kind !== 'candidate' || !c || c.candidateId !== candidateId || c.programId !== programId
      || ![c.userId, c.reviewerId].includes(userId)) throw new Error(body.error ?? 'The complete candidate could not be read.')
    setCandidate(c); setReviewed(false)
  }
  async function send(value: SupervisedPending, mode: 'send' | 'recover' | 'resolve' | 'resolution', fresh: boolean) {
    const programId = value.programId
    if (!current(programId) || !storageReady) return
    const saved = fresh ? saveSupervisedPending(localStorage, value) : value
    setPending(saved)
    const result = await performSupervisedPending(localStorage, saved, () => current(programId) ? actor.current : null, mode)
    if (!current(programId)) return
    setPending(null); setDraft(null); setPreview(null); setReviewed(false)
    setRecoveryPrograms(previous => previous.filter(id => id !== programId))
    setNotice(result.disposition === 'no_write' ? 'The original request is confirmed unsaved and permanently closed. Prepare a new request from the current program.'
      : result.operation === 'submit' ? 'Candidate saved. Review the complete week below.'
      : result.operation === 'decide' ? 'Your review decision is confirmed.' : 'Proposal saved. The athlete must review and accept it.')
    if (workspace) await readWorkspace(programId)
    if (result.disposition === 'saved' && result.operation !== 'issue' && typeof result.confirmation.candidateId === 'string') await loadCandidate(result.confirmation.candidateId)
  }
  async function startDraft(transition: 'same_week' | 'next_week') {
    if (!selected || !workspace) return
    const programId = selected, response = await fetch(`/api/coach/supervised/programs/${programId}/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUserId: userId, transition }) })
    const body = await response.json()
    if (!current(programId)) return
    const trial = parseSupervisedCandidateDraft({ ...body.seed, candidateId: crypto.randomUUID(), enrollmentId: body.enrollmentId,
      programId, basePlanVersionId: body.basePlanVersionId, historyDays, tzOffset: getTimezoneOffset(), rationale: 'Draft validation only.' })
    if (!response.ok || body.kind !== 'draft' || body.userId !== userId || body.programId !== programId || !trial
      || body.enrollmentId !== workspace.program.latestEnrollment.enrollmentId || body.basePlanVersionId !== workspace.program.acceptedBaseId
      || trial.transition !== transition) throw new Error(body.reasons?.join(' ') ?? body.error ?? 'Current accepted week could not be prepared.')
    setDraft({ seed: body.seed, enrollmentId: body.enrollmentId, basePlanVersionId: body.basePlanVersionId }); setPreview(null); setRationale(''); setCandidate(null)
  }
  const program = workspace?.program, enrollment = program?.latestEnrollment
  const enrolled = !!enrollment?.enabled && Date.parse(enrollment.expiresAt) > Date.now()
  const unavailable = busy || !!pending || !storageReady || !writesEnabled || !enrolled
  const summary = workspace?.candidates.find(c => c.candidateId === candidate?.candidateId)
  const canDecide = candidate && enrollment?.reviewerId === userId && candidate.reviewerId === userId
    && candidate.enrollmentId === enrollment.enrollmentId && enrollment.operations.includes(candidate.transition) && summary?.decision === 'pending'
  return <section className="mx-auto max-w-4xl space-y-5 p-4 text-base">
    <a className="inline-flex min-h-11 items-center underline" href="/program">Back to program</a>
    <h1 className="text-2xl font-bold">Supervised programming</h1>
    <p>Prepare a complete week, review the evidence and proposed changes, then confirm the coach decision. The athlete accepts a saved proposal separately.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {programs?.programs.length === 0 && <p>No supervised programs are assigned to this account.</p>}
    {recoveryPrograms.length > 0 && <nav aria-label="Saved request recovery" className="flex flex-wrap gap-2">{recoveryPrograms.map(id =>
      <button key={id} className={actionClass} disabled={busy} aria-pressed={selected === id} onClick={() => setSelected(id)}>Saved request · {id.slice(-8)}</button>)}</nav>}
    {programs && <nav aria-label="Assigned programs" className="flex flex-wrap gap-2">{programs.programs.map(p =>
      <button className={actionClass} disabled={busy} key={p.programId} aria-pressed={selected === p.programId}
        onClick={() => { setError(null); setSelected(p.programId) }}>{p.title}</button>)}
      {programs.nextAfterProgramId && <button className={actionClass} disabled={busy} onClick={() => void perform(async () => {
        const after = programs.nextAfterProgramId!, response = await fetch(`/api/coach/supervised/programs?afterProgramId=${after}`, { cache: 'no-store' }), body = await response.json()
        const page = parseSupervisedProgramsPage(body.page, userId, after)
        if (actor.current !== userId) return
        if (!response.ok || body.kind !== 'programs' || !page) throw new Error('The next programs could not be read.')
        setPrograms(page); setSelected(page.programs[0]?.programId ?? null)
      })}>Next programs</button>}</nav>}
    {pending && <section className="space-y-2 rounded border border-amber-500 p-3">
      <h2 className="font-bold">A saved request needs verification</h2>
      <p>The original {pending.operation === 'submit' ? 'candidate submission' : pending.operation === 'decide' ? 'review decision' : 'proposal request'} is preserved. Verify it before editing or creating another.</p>
      <button className={actionClass} disabled={busy} onClick={() => void perform(() => send(pending, 'recover', false))}>Verify saved request</button>
      <button className={actionClass} disabled={busy} onClick={() => void perform(() => send(pending, 'resolution', false))}>Verify closure receipt</button>
      <details><summary className="min-h-11 cursor-pointer py-3">Resolve an obsolete request</summary>
        <p>This checks for the original saved result. If none exists, it permanently closes that request so it cannot save later. Closing a proposal request also closes issuance for that candidate; a replacement needs a new candidate and coach review.</p>
        <button className={actionClass} disabled={busy} onClick={() => void perform(() => send(pending, 'resolve', false))}>Recover result or close unsaved request</button>
      </details>
      <details><summary className="min-h-11 cursor-pointer py-3">Retry the exact saved request</summary><p>If verification stays unconfirmed, this sends the original request with the same identity and content.</p>
        <button className={actionClass} disabled={busy || !writesEnabled || !enrolled} onClick={() => void perform(() => send(pending, 'send', false))}>Retry original request</button>
      </details>
    </section>}
    {workspace && <>
      <h2 className="text-xl font-bold">{program!.title}</h2>
      {(!writesEnabled || !enrolled) && <p>New programming changes are unavailable. You can still read available history and verify saved requests.</p>}
      <button className={actionClass} disabled={busy} onClick={() => void perform(() => readWorkspace(workspace.program.programId))}>Refresh program</button>
      {program!.role === 'athlete' && <div className="flex flex-wrap gap-2">
        {(['same_week', 'next_week'] as const).filter(op => enrollment!.operations.includes(op)).map(op => <button key={op} className={actionClass}
          disabled={unavailable || !program!.acceptedBaseId} onClick={() => void perform(() => startDraft(op))}>{op === 'same_week' ? 'Edit current week' : 'Prepare next week'}</button>)}
        {!program!.acceptedBaseId && <p>This program has no current accepted base available for editing.</p>}
      </div>}
      <section aria-label="Candidate history" className="space-y-2">
        {workspace.candidates.map(c => <div key={c.candidateId} className="flex flex-wrap items-center gap-2">
          <button className={actionClass} disabled={busy} onClick={() => void perform(() => loadCandidate(c.candidateId))}>
            {c.transition === 'next_week' ? 'Next week' : 'Replacement week'} · {c.decision === 'pending' ? 'Awaiting review' : c.decision === 'approve' ? 'Approved' : 'Rejected'} · {c.createdAt.slice(0, 10)}
          </button>
          {c.proposalId && program!.role === 'athlete' && <a className="inline-flex min-h-11 items-center underline" href={`/program/reviewed/plans/${program!.programId}`}>Review athlete proposal · {c.proposalStatus}</a>}
        </div>)}
        {workspace.nextAfterCandidateId && <button className={actionClass} disabled={busy} onClick={() => void perform(() => readWorkspace(program!.programId, workspace.nextAfterCandidateId))}>Next candidates</button>}
      </section>
    </>}
    {draft && program && <form className="space-y-4" onSubmit={event => {
      event.preventDefault()
      if (unavailable) return
      const value = parseSupervisedCandidateDraft({ ...draft.seed, candidateId: crypto.randomUUID(), enrollmentId: draft.enrollmentId,
        programId: program.programId, basePlanVersionId: draft.basePlanVersionId, historyDays, tzOffset: getTimezoneOffset(), rationale })
      if (!value) { setError('Complete the proposed work and explain why it should change before saving.'); return }
      void perform(async () => {
        setPreview(null)
        const response = await fetch('/api/coach/supervised/candidates/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedUserId: userId, draft: value }) })
        const body = await response.json(), packet = parseSupervisedReviewPacket(body.reviewPacket)
        const hash = await supervisedDraftHash(value)
        if (!current(program.programId)) return
        if (!response.ok || body.kind !== 'preview' || !packet || body.identity?.candidateId !== value.candidateId
          || body.identity?.expectedUserId !== userId || body.identity?.enrollmentId !== value.enrollmentId || body.identity?.draftHash !== hash
          || !packet.week.scheduledSessions.every(s => s.prescription.source.review.contentHash === hash)) {
          throw new Error(body.reasons?.join(' ') ?? body.error ?? 'The proposed week could not be verified. Correct it before saving.')
        }
        setPreview({ draft: value, packet })
      })
    }}>
      <SupervisedWeekEditor value={draft.seed} onChange={seed => { setDraft({ ...draft, seed }); setPreview(null) }} disabled={unavailable} />
      <label className="block">Recent history to review (days)<input className="block min-h-11 rounded border p-2 text-base text-gray-950" type="number" min={1} max={180}
        required value={historyDays} disabled={unavailable} onChange={e => { setHistoryDays(Number(e.target.value)); setPreview(null) }} /></label>
      <label className="block">Why this week fits the goal and recent response<textarea className="block min-h-11 w-full rounded border p-2 text-base text-gray-950"
        required maxLength={4000} value={rationale} disabled={unavailable} onChange={e => { setRationale(e.target.value); setPreview(null) }} /></label>
      <button className={`${actionClass} app-primary`} disabled={unavailable}>Check and preview full week</button>
    </form>}
    {preview && <section aria-label="Unsaved week preview" className="space-y-4">
      <h2 className="text-xl font-bold">Preview before saving</h2>
      <p>This week has passed the current source and structure checks. It still requires a saved candidate, coach decision and athlete acceptance.</p>
      <ReviewedWeekView value={preview.packet.week} showLogging={false} />
      <ul className="list-disc pl-5">{preview.packet.changes.map((change, i) => <li key={i}>{change.summary}</li>)}</ul>
      <button className={`${actionClass} app-primary`} disabled={unavailable} onClick={() => void perform(() => send({ schemaVersion: 1, userId,
        programId: preview.draft.programId, operation: 'submit', body: { expectedUserId: userId, draft: preview.draft } }, 'send', true))}>Save candidate and review full week</button>
    </section>}
    {candidate && <section className="space-y-4" aria-label="Complete candidate review">
      <h2 className="text-xl font-bold">Complete week for review</h2>
      <p>{candidate.reviewPacket.rationale}</p>
      <ul className="list-disc pl-5">{candidate.reviewPacket.changes.map((change, i) => <li key={i}>{change.summary}</li>)}</ul>
      <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer py-3">Previous accepted week</summary><ReviewedWeekView value={candidate.reviewPacket.baseWeek} showLogging={false} /></details>
      <ReviewedWeekView value={candidate.reviewPacket.week} showLogging={false} />
      <section className="space-y-3"><h3 className="font-bold">Evidence and uncertainty</h3>
        <p>History through {candidate.reviewPacket.evidenceSource.historyThrough} · {candidate.reviewPacket.evidenceSource.historyDays} days reviewed.</p>
        {candidate.reviewPacket.evidence.length === 0 && <p>No performed records were available in this review window. Do not assume older training was absent.</p>}
        {candidate.reviewPacket.evidence.map((e, i) => <details key={e.sourceId} className="rounded border p-3"><summary className="min-h-11 cursor-pointer py-3">Recorded exposure {i + 1}</summary><Evidence summary={e.summary} /></details>)}
        <ul className="list-disc pl-5">{candidate.reviewPacket.limitations.map((line, i) => <li key={i}>{line}</li>)}</ul>
      </section>
      {canDecide && <>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={reviewed} disabled={unavailable} onChange={e => setReviewed(e.target.checked)} />I reviewed the complete week, changes, evidence and limitations.</label>
        {(['approve', 'reject'] as const).map(decision => <button className={actionClass} key={decision} disabled={unavailable || !reviewed} onClick={() => void perform(() => send({
          schemaVersion: 1, userId, programId: candidate.programId, operation: 'decide', body: { expectedUserId: userId, candidateId: candidate.candidateId,
            requestId: crypto.randomUUID(), decision, enrollmentId: candidate.enrollmentId, contentHash: candidate.contentHash, sourceHash: candidate.sourceHash },
        }, 'send', true))}>{decision === 'approve' ? 'Approve this exact week' : 'Reject this candidate'}</button>)}
      </>}
      {candidate.userId === userId && summary?.decision === 'approve' && !summary.proposalId && <button className={`${actionClass} app-primary`} disabled={unavailable}
        onClick={() => void perform(() => send({ schemaVersion: 1, userId, programId: candidate.programId, operation: 'issue',
          body: { expectedUserId: userId, programId: candidate.programId, candidateId: candidate.candidateId, requestId: crypto.randomUUID() } }, 'send', true))}>Create athlete proposal</button>}
    </section>}
  </section>
}
