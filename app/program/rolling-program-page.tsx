'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { recommendationOrigin, refreshAfterCanonicalSave } from '@/app/lib/client/recommendations'
import { sendCaptureCorrection } from '@/app/lib/client/logging-request'
import { CaptureReceiptPanel, type ReceiptResult } from '@/app/components/capture/CaptureReceiptPanel'
import { CaptureRecovery } from '@/app/components/capture/CaptureRecovery'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { savedSetupIsConfirmed, type CompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import type { AtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import type {
  CoachRuntimeContext,
  CoachStrengthAssessmentSummary,
  StrengthAssessmentInput
} from '@/app/lib/coach/types'
import type { RollingWeeklyReview } from '@/app/lib/coach/weekly-review'
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
import {
  ActiveProgramView,
  CoachSetupForm,
  StrengthAssessmentPanel
} from './coach-program-components'
import { ExercisePreferenceNotes } from './exercise-preferences-editor'
import { PrescriptionBasisDetails } from './prescription-basis-details'
import { TrainingIntentPanel } from './training-intent-editor'
import { CoachTrustCenter } from './coach-trust-center'
import {
  WeeklyProgramView,
  type WeeklyCoachState,
  type WeeklyProposalView
} from './weekly-program-view'

const INITIAL_PLANNING_INPUT: CompleteCoachPlanningInput = {
  format: 'complete_programming_intake_v0_3',
  primaryDomain: 'strength',
  goal: '',
  experience: 'consistent',
  trainingDays: [],
  setupConfirmed: false,
  sessionMinutes: 60,
  equipment: '',
  resolvedEquipmentIds: [],
  constraints: '',
  constraintKinds: [],
  secondaryGoals: [],
  startDate: ''
}

type ReviewWithId = RollingWeeklyReview & { id?: string }

export default function RollingProgramPage() {
  const { user, profile } = useAuth()
  const authenticatedUserId = useRef(user?.id)
  authenticatedUserId.current = user?.id
  const [captureResult, setCaptureResult] = useState<ReceiptResult | null>(null)
  const [context, setContext] = useState<CoachRuntimeContext | null>(null)
  const [weeklyState, setWeeklyState] = useState<WeeklyCoachState | null>(null)
  const [planningInput, setPlanningInput] = useState<CompleteCoachPlanningInput>(INITIAL_PLANNING_INPUT)
  const [goalTargetDate, setGoalTargetDate] = useState('')
  const [replacementHypothesis, setReplacementHypothesis] = useState('')
  const [review, setReview] = useState<ReviewWithId | null>(null)
  const [proposal, setProposal] = useState<WeeklyProposalView | null>(null)
  const [proposalReviewId, setProposalReviewId] = useState<string | null>(null)
  const [proposalReviewAction, setProposalReviewAction] = useState<string | null>(null)
  const [showDirectionForm, setShowDirectionForm] = useState(false)
  const [showLegacyConversion, setShowLegacyConversion] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creatingProposal, setCreatingProposal] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intakeKey = useRef<string | null>(null)
  const proposalKey = useRef<string | null>(null)
  const reviewKey = useRef<string | null>(null)
  const assessmentKey = useRef<string | null>(null)
  const sessionResultKeys = useRef(new Map<string, string>())
  const sessionResultOwners = useRef(new Map<string, string>())
  const sessionOrigins = useRef(new Map<string, string | undefined>())
  const loadGeneration = useRef(0)
  const loadedOwner = useRef<string | null>(null)

  const loadState = useCallback(async () => {
    const requestOwner = authenticatedUserId.current
    if (!requestOwner || (loadedOwner.current && loadedOwner.current !== requestOwner)) return
    const generation = ++loadGeneration.current
    const currentRequest = () => authenticatedUserId.current === requestOwner && loadGeneration.current === generation
    setLoading(true)
    setError(null)
    try {
      const [coachResponse, weeklyResponse] = await Promise.all([
        fetch('/api/coach'),
        fetch('/api/coach/weekly')
      ])
      const [coachBody, weeklyBody] = await Promise.all([coachResponse.json(), weeklyResponse.json()])
      if (!currentRequest()) return
      if (!coachResponse.ok) throw new Error(errorMessage(coachBody, 'Coach state unavailable'))
      const nextContext = coachBody.context as CoachRuntimeContext
      if (nextContext.userId !== undefined && nextContext.userId !== requestOwner) throw new Error('The signed-in account changed. Refresh your account.')
      if (nextContext.capabilities?.feedbackV2 && nextContext.userId !== requestOwner) throw new Error('Coach account identity is unavailable. Refresh before logging.')
      loadedOwner.current = requestOwner
      setContext(nextContext)
      setPlanningInput(current => hydratePlanningInput(current, nextContext))

      if (weeklyResponse.ok) {
        const nextWeeklyState = weeklyBody as WeeklyCoachState
        setWeeklyState(nextWeeklyState)
        const targetDate = nextWeeklyState.program?.goal_target_date
        if (targetDate) setGoalTargetDate(targetDate)
        setProposal(proposalFromState(nextWeeklyState))
        const currentReview = Array.isArray(nextWeeklyState.history)
          ? null
          : nextWeeklyState.history.reviews.find(item => (
              item.base_plan_version_id === nextWeeklyState.currentWeek?.id
            )) ?? null
        if (currentReview?.sourceInvalidated) {
          reviewKey.current = null
          proposalKey.current = null
          setReview(null)
          setProposal(null)
        }
        setProposalReviewId(currentReview?.sourceInvalidated ? null : currentReview?.id ?? null)
        setProposalReviewAction(currentReview?.sourceInvalidated ? null : currentReview?.action ?? null)
      } else {
        setWeeklyState(null)
        setProposalReviewId(null)
        setProposalReviewAction(null)
      }
    } catch (caught) {
      if (currentRequest()) setError(caught instanceof Error ? caught.message : 'Coach state unavailable')
    } finally {
      if (currentRequest()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const startDate = nextMonday()
    setPlanningInput(current => current.startDate ? current : { ...current, startDate })
    setGoalTargetDate(current => current || addLocalDays(startDate, 90))
    void loadState()
  }, [loadState, user?.id])

  const updatePlanningInput = (next: CompleteCoachPlanningInput) => {
    const setupChanged = JSON.stringify([next.trainingDays,next.sessionMinutes,next.resolvedEquipmentIds,next.equipment]) !== JSON.stringify([planningInput.trainingDays,planningInput.sessionMinutes,planningInput.resolvedEquipmentIds,planningInput.equipment])
    setPlanningInput(setupChanged ? { ...next, setupConfirmed: false } : next)
    setProposal(null)
    setStatus(null)
    setError(null)
    intakeKey.current = null
    proposalKey.current = null
  }

  const prepareReplacementForm = (mode: 'weekly_shift' | 'legacy_conversion') => {
    const startDate = mode === 'weekly_shift' && weeklyState?.currentWeek
      ? addLocalDays(weeklyState.currentWeek.window_end, 1)
      : nextMonday()
    setPlanningInput(current => ({ ...current, startDate }))
    setGoalTargetDate(current => current >= startDate ? current : addLocalDays(startDate, 90))
    setReplacementHypothesis(current => current || (
      mode === 'weekly_shift'
        ? 'A new weekly emphasis will better support the current athlete goal.'
        : 'Use repeatable weekly doses and review the athlete response before the next week.'
    ))
    proposalKey.current = null
    setStatus(null)
    setError(null)
    if (mode === 'weekly_shift') {
      setShowDirectionForm(true)
      setShowLegacyConversion(false)
    } else {
      setShowLegacyConversion(true)
      setShowDirectionForm(false)
    }
  }

  const savePlanningInput = async () => {
    intakeKey.current ??= createIdempotencyKey('coach-intake')
    const response = await fetch('/api/coach/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planningInput, idempotencyKey: intakeKey.current })
    })
    const body = await response.json()
    if (!response.ok) throw new Error(errorMessage(body, 'Unable to save coach setup'))
  }

  const createFirstWeek = async () => {
    setCreatingProposal(true)
    setStatus(null)
    setError(null)
    intakeKey.current ??= createIdempotencyKey('coach-intake')
    proposalKey.current ??= createIdempotencyKey('weekly-proposal')
    try {
      await savePlanningInput()

      const response = await fetch('/api/coach/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningInput,
          goalTargetDate,
          tzOffset: getTimezoneOffset(),
          idempotencyKey: proposalKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to create the first week'))
      setProposal(body as WeeklyProposalView)
      setStatus('Your first week is ready to review. It is not active yet.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the first week')
    } finally {
      setCreatingProposal(false)
    }
  }

  const reviewWeek = async () => {
    setReviewing(true)
    setStatus(null)
    setError(null)
    reviewKey.current ??= createIdempotencyKey('weekly-review')
    proposalKey.current ??= createIdempotencyKey('weekly-proposal')
    try {
      const response = await fetch('/api/coach/weekly/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asOf: new Date().toISOString(),
          tzOffset: getTimezoneOffset(),
          windowDays: 84,
          reviewIdempotencyKey: reviewKey.current,
          proposalIdempotencyKey: proposalKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to review this week'))
      setReview(body.review as ReviewWithId)
      setProposalReviewId(body.review?.id ?? null)
      setProposalReviewAction(body.review?.action ?? null)
      if (body.proposalId && body.proposal) {
        setProposal({
          proposalId: body.proposalId,
          idempotencyKey: body.idempotencyKey ?? proposalKey.current,
          proposal: body.proposal
        } as WeeklyProposalView)
        setStatus('Coach review complete. The next week is ready for acceptance.')
      } else if (body.review?.status === 'not_ready') {
        setStatus('The week is still open. Keep logging scheduled work or request an early review in Coach.')
      } else if (body.nextAction?.type === 'confirm_replacement_direction') {
        prepareReplacementForm('weekly_shift')
        setStatus('The evidence supports an emphasis change. Confirm the replacement direction.')
      } else {
        setStatus('Coach review saved. No next-week proposal is available yet.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to review this week')
    } finally {
      setReviewing(false)
    }
  }

  const createProposalFromStoredReview = async () => {
    const storedReviewId = review?.id ?? proposalReviewId
    if (!storedReviewId) return
    const storedReviewAction = review?.status === 'ready'
      ? review.action
      : proposalReviewAction
    setCreatingProposal(true)
    setError(null)
    setStatus(null)
    proposalKey.current ??= createIdempotencyKey('weekly-proposal')
    try {
      if (storedReviewAction === 'shift_emphasis' && planningInput.exercisePreferences !== undefined) {
        await savePlanningInput()
      }
      const response = await fetch(`/api/coach/weekly/reviews/${storedReviewId}/proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storedReviewAction === 'shift_emphasis'
          ? {
              idempotencyKey: proposalKey.current,
              replacementPlanningInput: planningInput,
              tzOffset: getTimezoneOffset(),
              replacementGoalTargetDate: goalTargetDate,
              replacementHypothesis
            }
          : { idempotencyKey: proposalKey.current })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to build the replacement week'))
      setProposal(body as WeeklyProposalView)
      setShowDirectionForm(false)
      setStatus('Replacement week ready. Review and accept it to change emphasis.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to build the replacement week')
    } finally {
      setCreatingProposal(false)
    }
  }

  const createLegacyConversion = async () => {
    setCreatingProposal(true)
    setError(null)
    setStatus(null)
    proposalKey.current ??= createIdempotencyKey('legacy-weekly-conversion')
    try {
      if (planningInput.exercisePreferences !== undefined) await savePlanningInput()
      const response = await fetch('/api/coach/weekly/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningInput,
          goalTargetDate,
          hypothesis: replacementHypothesis,
          tzOffset: getTimezoneOffset(),
          idempotencyKey: proposalKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to build the weekly replacement'))
      setProposal(body as WeeklyProposalView)
      setShowLegacyConversion(false)
      setStatus('Weekly replacement ready. Your accepted legacy plan is still active.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to build the weekly replacement')
    } finally {
      setCreatingProposal(false)
    }
  }

  const acceptProposal = async () => {
    const selected = proposal ?? (weeklyState ? proposalFromState(weeklyState) : null)
    if (!selected) return
    setAccepting(true)
    setStatus(null)
    setError(null)
    try {
      const response = await fetch(`/api/coach/proposals/${selected.proposalId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: selected.idempotencyKey })
      })
      const body = await response.json()
      if (!response.ok) {
        if (response.status === 409) await loadState()
        throw new Error(errorMessage(body, 'Unable to accept the weekly proposal'))
      }
      setContext(body.context as CoachRuntimeContext)
      setProposal(null)
      setReview(null)
      setProposalReviewId(null)
      setProposalReviewAction(null)
      setShowDirectionForm(false)
      setShowLegacyConversion(false)
      proposalKey.current = null
      reviewKey.current = null
      setStatus('Next week accepted.')
      if (user?.id) refreshAfterCanonicalSave(user.id)
      await loadState()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to accept the weekly proposal')
    } finally {
      setAccepting(false)
    }
  }

  const recordSessionResult = async (
    sessionId: string,
    completion: AtomicSessionCompletionInput
  ): Promise<string | null> => {
    const expectedUserId = sessionResultOwners.current.get(sessionId) ?? context?.userId
    if (expectedUserId && authenticatedUserId.current !== expectedUserId) return 'The signed-in account changed. Restore the original account before retrying.'
    if (completion.feedback.feedbackVersion === 2 && !expectedUserId) return 'Refresh your account before saving this session.'
    if (expectedUserId) sessionResultOwners.current.set(sessionId, expectedUserId)
    setSavingSessionId(sessionId)
    setStatus(null)
    setError(null)
    const idempotencyKey = sessionResultKeys.current.get(sessionId)
      ?? createIdempotencyKey('coach-session')
    sessionResultKeys.current.set(sessionId, idempotencyKey)
    if (!sessionOrigins.current.has(sessionId)) sessionOrigins.current.set(sessionId, completion.feedback.feedbackVersion === 2 ? recommendationOrigin() : undefined)
    try {
      const response = await sendCaptureCorrection(`/api/coach/sessions/${sessionId}/complete`, 'POST',
        { idempotencyKey, expectedUserId, recommendationId: sessionOrigins.current.get(sessionId), ...completion }, expectedUserId ?? '')
      const body = await response.json()
      if (!response.ok) return errorMessage(body, 'Unable to save session result')
      if (expectedUserId && authenticatedUserId.current !== expectedUserId) return 'The signed-in account changed. Restore the original account to reconcile this save.'
      if (body.context) setContext(body.context as CoachRuntimeContext)
      setCaptureResult(body)
      sessionResultKeys.current.delete(sessionId)
      sessionResultOwners.current.delete(sessionId)
      sessionOrigins.current.delete(sessionId)
      setStatus(body.result?.workout_id
        ? 'Session and performance evidence saved.'
        : 'Skipped session saved as review evidence.')
      return null
    } catch {
      return typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. Retry will reuse the same save key.'
        : 'The save response was interrupted. Retry will reuse the same save key.'
    } finally {
      setSavingSessionId(null)
    }
  }

  const saveAssessment = async (input: StrengthAssessmentInput): Promise<string | null> => {
    assessmentKey.current ??= createIdempotencyKey('coach-assessment')
    try {
      const response = await fetch('/api/coach/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment: input, idempotencyKey: assessmentKey.current })
      })
      const body = await response.json()
      if (!response.ok) return errorMessage(body, 'Unable to save baseline')
      const assessment = body.assessment as CoachStrengthAssessmentSummary
      setContext(current => current ? {
        ...current,
        assessments: [assessment, ...current.assessments.filter(item => item.id !== assessment.id)]
      } : current)
      assessmentKey.current = null
      if (user?.id) refreshAfterCanonicalSave(user.id)
      return null
    } catch {
      return 'Unable to save baseline'
    }
  }

  const weeklyProgram = weeklyState?.program && context?.activeProgram
    ? { state: weeklyState, activeProgram: context.activeProgram }
    : null
  const accountChanged = Boolean(context?.userId && user?.id !== context.userId)

  return (
    <ProtectedRoute>
      {accountChanged && <p role="alert" className="app-notice app-notice-error">The signed-in account changed. Restore the original account to continue this entry, or reload to open the current account.</p>}
      <main hidden={accountChanged} className="mx-auto max-w-5xl space-y-5 pb-10">
        <header className="py-2">
          <p className="app-eyebrow">Made for your week</p>
          <h1 className="app-title">Your training plan</h1>
          <p className="app-muted mt-2 max-w-2xl text-sm leading-6">
            Your current plan stays active until you approve a change.
          </p>
        </header>

        {captureResult && <CaptureReceiptPanel result={captureResult} />}
        <CaptureRecovery />
        {status && <p role="status" className="app-notice app-notice-success text-sm font-medium">{status}</p>}
        {error && <p role="alert" className="app-notice app-notice-error text-sm">{error}</p>}
        {!loading && context?.storageAvailable && <TrainingIntentPanel profileGoals={profile?.fitnessGoals} goal={planningInput.goal} />}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Loading this week…
          </div>
        ) : !context?.storageAvailable ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
            <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100">Coach storage is not available</h2>
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">Weekly plans need the private, user-scoped coach storage contract.</p>
          </section>
        ) : weeklyProgram ? (
          <WeeklyProgramView
            feedbackV2={context.capabilities?.feedbackV2 === true}
            state={weeklyProgram.state}
            activeProgram={weeklyProgram.activeProgram}
            review={review}
            proposal={proposal}
            reviewing={reviewing}
            creatingProposal={creatingProposal}
            accepting={accepting}
            savingSessionId={savingSessionId}
            onReview={reviewWeek}
            onCreateProposal={() => createProposalFromStoredReview()}
            onAccept={acceptProposal}
            onRequestDirectionChange={() => prepareReplacementForm('weekly_shift')}
            onRecordSessionResult={recordSessionResult}
            onEditFailedSessionResult={sessionId => sessionResultKeys.current.delete(sessionId)}
            onRefreshPlan={loadState}
          />
        ) : context?.activeProgram ? (
          <>

            {proposal && (
              <WeeklyProposalCard
                proposal={proposal}
                label="Weekly replacement proposal"
                accepting={accepting}
                onAccept={acceptProposal}
              />
            )}
            <ActiveProgramView
              feedbackV2={context.capabilities?.feedbackV2 === true}
              program={context.activeProgram}
              onRecordSessionResult={recordSessionResult}
              onEditFailedSessionResult={sessionId => sessionResultKeys.current.delete(sessionId)}
              onRefreshPlan={loadState}
              savingSessionId={savingSessionId}
            />
            <details className="app-panel p-4">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium">Update your plan</summary>
              <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">Your accepted plan remains unchanged</h2>
              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                Continue using your current plan. Moving to one-week programming requires a separate weekly replacement that you review and accept.
              </p>
              {!proposal && !showLegacyConversion && (
                <button
                  type="button"
                  onClick={() => prepareReplacementForm('legacy_conversion')}
                  className="app-primary mt-4"
                >
                  Build a weekly replacement
                </button>
              )}
            </details>
          </>
        ) : proposal ? (
          <WeeklyProposalCard
            proposal={proposal}
            label="First week proposal"
            accepting={accepting}
            onAccept={acceptProposal}
          />
        ) : (
          <CoachSetupForm
            value={planningInput}
            onChange={updatePlanningInput}
            onSave={() => void createFirstWeek()}
            saving={creatingProposal}
            saved={false}
            actionLabel="Create first week"
            beforeAction={(
              <GoalTargetDateField
                value={goalTargetDate}
                minimum={planningInput.startDate}
                onChange={setGoalTargetDate}
              />
            )}
          />
        )}

        {showDirectionForm && context && (
          <CoachSetupForm
            value={planningInput}
            onChange={updatePlanningInput}
            onSave={() => void createProposalFromStoredReview()}
            saving={creatingProposal}
            saved={false}
            actionLabel="Build replacement week"
            beforeAction={<ReplacementFields goalTargetDate={goalTargetDate} minimum={planningInput.startDate} hypothesis={replacementHypothesis} onGoalTargetDateChange={setGoalTargetDate} onHypothesisChange={setReplacementHypothesis} />}
          />
        )}

        {showLegacyConversion && context?.activeProgram && (
          <CoachSetupForm
            value={planningInput}
            onChange={updatePlanningInput}
            onSave={() => void createLegacyConversion()}
            saving={creatingProposal}
            saved={false}
            actionLabel="Build weekly replacement"
            beforeAction={<ReplacementFields goalTargetDate={goalTargetDate} minimum={planningInput.startDate} hypothesis={replacementHypothesis} onGoalTargetDateChange={setGoalTargetDate} onHypothesisChange={setReplacementHypothesis} />}
          />
        )}

        {context && (
          <details className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <summary className="flex min-h-12 cursor-pointer items-center px-5 py-4 text-lg font-bold text-gray-950 dark:text-white">Data and trust</summary>
            <div className="space-y-5 border-t border-gray-200 p-4 dark:border-gray-700">
              <StrengthAssessmentPanel assessments={context.assessments} onSubmit={saveAssessment} />
              <CoachTrustCenter onPlanChanged={loadState} />
            </div>
          </details>
        )}
      </main>
    </ProtectedRoute>
  )
}

function WeeklyProposalCard({
  proposal,
  label,
  accepting,
  onAccept
}: {
  proposal: WeeklyProposalView
  label: string
  accepting: boolean
  onAccept: () => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{label}</p>
      <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">{proposal.proposal.title}</h2>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
        {proposal.proposal.sessions.length} sessions · {proposal.proposal.windowStart} to {proposal.proposal.windowEnd}
      </p>
      <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-100">
        Nothing changes until you accept this week.
      </p>
      <ExercisePreferenceNotes notes={proposal.proposal.profileSnapshot.preferenceNotes} />
      <PrescriptionBasisDetails basis={proposal.proposal.profileSnapshot.prescriptionBasis} />
      <details className="mt-4 rounded-xl border border-[var(--accent-line)] bg-white/70 dark:bg-gray-900/70">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-semibold text-[var(--accent)]">
          Inspect proposed sessions
        </summary>
        <ul className="space-y-2 border-t border-[var(--accent-line)] p-4">
          {proposal.proposal.scheduledSessions.map(session => (
            <li key={session.prescription.sessionId} className="rounded-lg bg-white p-3 dark:bg-gray-950">
              <p className="font-semibold text-gray-950 dark:text-white">{session.scheduledDate}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {session.prescription.title} · {session.prescription.scheduledMinutes} min
              </p>
            </li>
          ))}
        </ul>
      </details>
      <button type="button" onClick={() => void onAccept()} disabled={accepting} className="app-primary mt-5 w-full text-base disabled:opacity-60 sm:w-auto">
        {accepting ? 'Accepting…' : label === 'First week proposal' ? 'Accept first week' : 'Accept weekly replacement'}
      </button>
    </section>
  )
}

function GoalTargetDateField({
  value,
  minimum,
  onChange
}: {
  value: string
  minimum: string
  onChange: (value: string) => void
}) {
  return (
    <label className="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
      Goal target date
      <input type="date" aria-label="Goal target date" value={value} min={minimum} onChange={event => onChange(event.target.value)} className="mt-2 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <span className="mt-2 block text-xs text-gray-500 dark:text-gray-400">
        This date anchors the goal. It does not expose future weekly prescriptions.
      </span>
    </label>
  )
}

function ReplacementFields({
  goalTargetDate,
  minimum,
  hypothesis,
  onGoalTargetDateChange,
  onHypothesisChange
}: {
  goalTargetDate: string
  minimum: string
  hypothesis: string
  onGoalTargetDateChange: (value: string) => void
  onHypothesisChange: (value: string) => void
}) {
  return (
    <div>
      <GoalTargetDateField value={goalTargetDate} minimum={minimum} onChange={onGoalTargetDateChange} />
      <label className="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
        Replacement hypothesis
        <textarea aria-label="Replacement hypothesis" value={hypothesis} onChange={event => onHypothesisChange(event.target.value)} rows={3} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      </label>
    </div>
  )
}

function proposalFromState(state: WeeklyCoachState): WeeklyProposalView | null {
  if (!state.pendingProposal || Array.isArray(state.history)) return null
  const plan = state.history.plans.find(item => item.id === state.pendingProposal?.proposed_plan_version_id)
  const proposal = plan?.intent.weekly_plan
  return proposal ? {
    proposalId: state.pendingProposal.id,
    idempotencyKey: state.pendingProposal.idempotency_key,
    proposal
  } : null
}

function hydratePlanningInput(
  current: CompleteCoachPlanningInput,
  context: CoachRuntimeContext
): CompleteCoachPlanningInput {
  const memory = (key: string) => context.memories.find(item => item.memoryKey === key)?.content
  const goal = memory('primary_goal')
  const schedule = memory('training_schedule')
  const equipment = memory('available_equipment')
  const constraints = memory('training_constraints')
  const hydrated: CompleteCoachPlanningInput = {
    ...current,
    setupConfirmed: true,
    secondaryGoals: Array.isArray(goal?.secondaryGoals) ? goal.secondaryGoals as CompleteCoachPlanningInput['secondaryGoals'] : current.secondaryGoals,
    primaryDomain: isDomain(goal?.primaryDomain) ? goal.primaryDomain : current.primaryDomain,
    goal: typeof goal?.goal === 'string' ? goal.goal : current.goal,
    experience: ['new_or_returning', 'consistent', 'experienced'].includes(String(schedule?.experience))
      ? schedule?.experience as CompleteCoachPlanningInput['experience']
      : current.experience,
    trainingDays: Array.isArray(schedule?.trainingDays)
      ? schedule.trainingDays as CompleteCoachPlanningInput['trainingDays']
      : current.trainingDays,
    sessionMinutes: [30, 45, 60, 75, 90].includes(Number(schedule?.sessionMinutes))
      ? Number(schedule?.sessionMinutes) as CompleteCoachPlanningInput['sessionMinutes']
      : current.sessionMinutes,
    equipment: typeof equipment?.equipment === 'string' ? equipment.equipment : current.equipment,
    resolvedEquipmentIds: Array.isArray(equipment?.resolvedEquipmentIds)
      ? equipment.resolvedEquipmentIds as CompleteCoachPlanningInput['resolvedEquipmentIds']
      : current.resolvedEquipmentIds,
    constraints: typeof constraints?.constraints === 'string' ? constraints.constraints : current.constraints,
    constraintKinds: Array.isArray(constraints?.constraintKinds)
      ? constraints.constraintKinds as CompleteCoachPlanningInput['constraintKinds']
      : current.constraintKinds,
    startDate: current.startDate || nextMonday()
  }
  return { ...hydrated, setupConfirmed: savedSetupIsConfirmed(schedule, equipment) }
}

function isDomain(value: unknown): value is CompleteCoachPlanningInput['primaryDomain'] {
  return ['strength', 'hypertrophy', 'power_explosiveness', 'speed_agility', 'aerobic', 'resilience']
    .includes(String(value))
}

function nextMonday(): string {
  const date = new Date()
  const weekday = date.getDay()
  const daysAhead = weekday === 1 ? 7 : (8 - weekday) % 7
  date.setDate(date.getDate() + daysAhead)
  return getLocalDate(date)
}

function addLocalDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return getLocalDate(date)
}

function createIdempotencyKey(prefix: string): string {
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}:${randomPart}`
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback
  const error = 'error' in body && typeof body.error === 'string' ? body.error : fallback
  if (!('details' in body)) return error
  if (typeof body.details === 'string' && body.details) return `${error}: ${body.details}`
  if (Array.isArray(body.details) && body.details.every(item => typeof item === 'string')) {
    return `${error}: ${body.details.join('; ')}`
  }
  return error
}
