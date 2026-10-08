'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewedProposalIndex, ReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state'
import { parseReviewedRollingWeek } from '@/app/lib/coach/reviewed-week-plan-contract'
import { readReviewedProposalPending, resolveReviewedProposalPending, saveReviewedProposalPending, sendReviewedProposalPending, type ReviewedProposalPending } from '@/app/lib/coach/reviewed-proposal-pending'
import { ReviewedWeekView } from './reviewed-session-card'
import { CompleteSessionCard } from './coach-program-components'
import { ExercisePreferenceNotes } from './exercise-preferences-editor'
import { PrescriptionBasisDetails } from './prescription-basis-details'

const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to verify this proposal. Refresh and retry.'
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)

export function ReviewedProposalManager({ userId, programId }: { userId: string; programId: string }) {
  const [index, setIndex] = useState<ReviewedProposalIndex | null>(null), [proposal, setProposal] = useState<ReviewedProposalState | null>(null)
  const [pending, setPending] = useState<ReviewedProposalPending | null>(null), [storageReady, setStorageReady] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const owner = useRef<string | null>(userId), sending = useRef(false), readSequence = useRef(0)
  owner.current = userId
  const refresh = useCallback(async (proposalId?: string) => {
    const sequence = ++readSequence.current
    setIndex(null); setProposal(null)
    const response = await fetch(`/api/coach/reviewed/proposals?programId=${encodeURIComponent(programId)}`, { cache: 'no-store' })
    const body = await response.json(), list = body.index
    if (owner.current !== userId || readSequence.current !== sequence) return
    if (!response.ok || body.kind !== 'proposals' || list?.userId !== userId || list?.programId !== programId
      || !Array.isArray(list.reviews) || !Array.isArray(list.proposals)
      || list.reviews.some((entry: ReviewedProposalIndex['reviews'][number]) => !entry || typeof entry.reviewId !== 'string'
        || !['same_week', 'next_week'].includes(entry.transition) || typeof entry.windowStart !== 'string')
      || list.proposals.some((entry: ReviewedProposalIndex['proposals'][number]) => !entry || !uuid(entry.proposalId)
        || !['proposed', 'accepted', 'rejected', 'expired'].includes(entry.status))) throw new Error(body.error ?? 'Proposal list unavailable')
    setIndex(list)
    const selected = proposalId ?? list.proposals.find((entry: ReviewedProposalIndex['proposals'][number]) => entry.status === 'proposed')?.proposalId
    if (!selected) return
    if (!uuid(selected)) throw new Error('Invalid saved proposal identity')
    const detail = await fetch(`/api/coach/reviewed/proposals/${selected}`, { cache: 'no-store' }), result = await detail.json(), value = result.proposal
    if (owner.current !== userId || readSequence.current !== sequence) return
    if (!detail.ok || result.kind !== 'proposal' || value?.userId !== userId || value?.programId !== programId || value?.proposalId !== selected
      || !uuid(value.planVersionId) || !uuid(value.basePlanVersionId) || typeof value.requestId !== 'string'
      || !['proposed', 'accepted', 'rejected', 'expired'].includes(value.status) || typeof value.acceptanceAvailable !== 'boolean'
      || !parseReviewedRollingWeek(value.plan) || !value.baseWeek
      || (value.baseWeek.kind === 'reviewed' ? !parseReviewedRollingWeek(value.baseWeek.plan)
        : value.baseWeek.kind !== 'standard' || value.baseWeek.plan?.format !== 'rolling_weekly_plan_v0_1'
          || !Array.isArray(value.baseWeek.plan.scheduledSessions))) throw new Error(result.error ?? 'Full proposal unavailable')
    setProposal(value)
  }, [userId, programId])
  useEffect(() => {
    owner.current = userId
    let selected: string | undefined
    try {
      const value = readReviewedProposalPending(sessionStorage, userId, programId)
      setPending(value); setStorageReady(true); selected = value?.operation === 'accept' ? value.proposalId : undefined
    } catch (failure) { setStorageReady(false); setError(message(failure)) }
    void refresh(selected).catch(failure => { if (owner.current === userId) setError(message(failure)) })
    return () => { owner.current = null }
  }, [userId, programId, refresh])

  async function submit(request?: ReviewedProposalPending) {
    if (sending.current || !storageReady || owner.current !== userId) return
    sending.current = true; setBusy(true); setError(null); setNotice(null)
    try {
      const value = pending ?? (request && saveReviewedProposalPending(sessionStorage, request))
      if (!value) throw new Error('No saved proposal request to recover')
      setPending(value)
      const result = await sendReviewedProposalPending(sessionStorage, value, () => owner.current)
      if (owner.current !== userId) return
      setPending(null)
      setNotice(result.operation === 'accept' ? 'Acceptance confirmed. Your program contains the accepted week.' : 'Proposal saved. Review the full week before accepting.')
      await refresh(result.proposalId)
    } catch (failure) { if (owner.current === userId) setError(message(failure)) }
    finally { sending.current = false; if (owner.current === userId) setBusy(false) }
  }
  async function resolvePrevious() {
    if (sending.current || !storageReady || owner.current !== userId || (!pending && !proposal)) return
    sending.current = true; setBusy(true); setError(null); setNotice(null)
    try {
      const value = pending ?? saveReviewedProposalPending(sessionStorage, { schemaVersion: 1, userId, programId, operation: 'accept',
        proposalId: proposal!.proposalId, planVersionId: proposal!.planVersionId, body: { expectedUserId: userId, requestId: proposal!.requestId } })
      setPending(value)
      const result = await resolveReviewedProposalPending(sessionStorage, value, () => owner.current)
      if (owner.current !== userId) return
      setPending(null)
      setNotice(result.disposition === 'closed' ? 'The request is closed. Its evidence is preserved and delayed attempts cannot apply it.'
        : value.operation === 'issue' ? 'The original proposal was saved. Review it below.'
          : result.activePlanVersionId === result.planVersionId ? 'The original acceptance is confirmed and this week is active.'
            : 'The original acceptance is confirmed. Your active program has since changed; this is its saved history.')
      await refresh(result.proposalId ?? undefined)
    } catch (failure) { if (owner.current === userId) setError(message(failure)) }
    finally { sending.current = false; if (owner.current === userId) setBusy(false) }
  }
  const disabled = busy || !!pending || !storageReady
  return <section className="mx-auto max-w-3xl space-y-4 p-4 text-base">
    <a href="/program" className="inline-flex min-h-11 items-center underline">Back to program</a>
    <h1 className="text-2xl font-bold">Review a proposed week</h1>
    <p>Review the full sessions, preparation, effort targets, rests and limitations before accepting. Acceptance checks the latest training context again.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && <section className="rounded-lg border border-amber-500 p-3">
      <p>A previous {pending.operation === 'accept' ? 'acceptance' : 'proposal save'} needs recovery. Its original request is preserved.</p>
      <button type="button" className="app-primary min-h-11 px-4" disabled={busy} onClick={() => void submit()}>Recover original request</button>
      <p>Resolve to recover a completed action or permanently close an unsaved request. Resolving an unaccepted proposal closes it without changing the active week.</p>
      <button type="button" className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => void resolvePrevious()}>Resolve original request</button>
    </section>}
    <button type="button" className="min-h-11 rounded-lg border px-4" disabled={busy}
      onClick={() => { setError(null); void refresh(proposal?.proposalId).catch(failure => { if (owner.current === userId) setError(message(failure)) }) }}>Refresh proposals</button>
    {index && <>
      {index.reviews.length === 0 && <p>No new reviewed week is available for this accepted program.</p>}
      {index.reviews.map(review => <button key={review.reviewId} type="button" className="app-primary block min-h-11 px-4"
        disabled={disabled || index.proposals.some(value => value.status === 'proposed')} onClick={() => void submit({ schemaVersion: 1, userId, programId, operation: 'issue',
          body: { expectedUserId: userId, reviewId: review.reviewId, registrationId: crypto.randomUUID(), requestId: crypto.randomUUID() } })}>
        Prepare {review.transition === 'next_week' ? 'next' : 'replacement'} week · {review.windowStart}
      </button>)}
      {index.proposals.map((entry, position) => <button key={entry.proposalId} type="button" className="block min-h-11 underline" disabled={busy}
        onClick={() => { setError(null); void refresh(entry.proposalId).catch(failure => { if (owner.current === userId) setError(message(failure)) }) }}>
        Review saved proposal {position + 1} · {entry.status}
      </button>)}
    </>}
    {proposal && <>
      <p className="capitalize">Proposal status: {proposal.status}</p>
      {proposal.doseDecision && <section className="space-y-2 rounded-lg border p-3" aria-label="Reviewed load decision">
        <h2 className="text-xl font-bold">Why this load trial</h2>
        <p><strong>Historical exposure:</strong> {proposal.doseDecision.historical}</p>
        {proposal.doseDecision.observedSets.map(line => <p key={line}>{line}</p>)}
        <p><strong>Accepted base prescription:</strong> {proposal.doseDecision.base}</p>
        <p><strong>Proposed prescription:</strong> {proposal.doseDecision.proposed}</p>
        <p>{proposal.doseDecision.preparation}</p><p>{proposal.doseDecision.timing}</p>
        {proposal.doseDecision.limits.map(line => <p key={line}>{line}</p>)}
      </section>}
      <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-3">Compare the previous accepted week</summary>
        {proposal.baseWeek.kind === 'reviewed' ? <ReviewedWeekView value={proposal.baseWeek.plan} showLogging={false} /> : <section className="space-y-4">
          <h2 className="text-xl font-bold">{proposal.baseWeek.plan.title}</h2>
          <p>{proposal.baseWeek.plan.windowStart}–{proposal.baseWeek.plan.windowEnd}</p>
          <p>{proposal.baseWeek.plan.directionSnapshot.hypothesis}</p>
          <ExercisePreferenceNotes notes={proposal.baseWeek.plan.profileSnapshot.preferenceNotes} />
          <PrescriptionBasisDetails basis={proposal.baseWeek.plan.profileSnapshot.prescriptionBasis} />
          {proposal.baseWeek.plan.scheduledSessions.map(slot => <section key={slot.prescription.sessionId}><p>{slot.scheduledDate}</p>
            <CompleteSessionCard prescription={slot.prescription} /></section>)}
        </section>}
      </details>
      <ReviewedWeekView value={proposal.plan} showLogging={false} />
      {proposal.status === 'proposed' && <>
        {!proposal.acceptanceAvailable && <p>This proposal needs a fresh review because its accepted base or training context changed.</p>}
        <button type="button" className="app-primary min-h-11 px-4" disabled={disabled || !proposal.acceptanceAvailable}
          onClick={() => void submit({ schemaVersion: 1, userId, programId, operation: 'accept', proposalId: proposal.proposalId, planVersionId: proposal.planVersionId,
            body: { expectedUserId: userId, requestId: proposal.requestId } })}>Accept this reviewed week</button>
      </>}
      {proposal.status === 'accepted' && <a href="/program" className="app-primary inline-flex min-h-11 items-center px-4">Open accepted program</a>}
      {['proposed', 'expired'].includes(proposal.status) && <button type="button" className="min-h-11 rounded-lg border px-4"
        disabled={disabled} onClick={() => void resolvePrevious()}>Close unaccepted proposal</button>}
    </>}
  </section>
}
