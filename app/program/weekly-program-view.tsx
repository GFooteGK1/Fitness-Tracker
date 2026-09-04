'use client'

import type { AtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import type { ActiveCoachProgramSummary } from '@/app/lib/coach/types'
import type { RollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import type { RollingWeeklyPlanDraft } from '@/app/lib/coach/rolling-weekly-plan'
import type { RollingWeeklyReview } from '@/app/lib/coach/weekly-review'
import { getLocalDate, parseDateString } from '@/app/lib/timezone-utils'
import { CompleteSessionCard } from './coach-program-components'
import {
  selectTodaySession,
  TodaySessionCard,
  TodayTerminalCard
} from './today-session-card'

export interface WeeklyPlanVersionView {
  id: string
  status: 'proposed' | 'accepted' | 'superseded'
  window_start: string
  window_end: string
  sequence_number: number
  intent: { weekly_plan?: RollingWeeklyPlanDraft }
}

export interface WeeklyReviewHistoryView {
  id: string
  base_plan_version_id: string
  review_window_start: string
  action: string
  presentation_class: string
  evidence_status: string
  confidence: number
  execution_summary: Record<string, unknown>
  rationale: Record<string, unknown>
  idempotency_key: string
  created_at: string
}

export interface WeeklyCoachState {
  mode: 'rolling_weekly'
  program: {
    id: string
    title: string
    goal_summary: string
    start_date: string
    end_date: string
    goal_target_date: string | null
    direction: RollingTrainingDirection
    active_plan_version_id: string
  } | null
  currentWeek: WeeklyPlanVersionView | null
  pendingProposal: {
    id: string
    proposed_plan_version_id: string
    idempotency_key: string
    weekly_review_id: string | null
    status: 'proposed'
  } | null
  history: {
    plans: WeeklyPlanVersionView[]
    reviews: WeeklyReviewHistoryView[]
  } | WeeklyPlanVersionView[]
}

export interface WeeklyProposalView {
  proposalId: string
  idempotencyKey: string
  proposal: RollingWeeklyPlanDraft
}

interface WeeklyProgramViewProps {
  state: WeeklyCoachState
  activeProgram: ActiveCoachProgramSummary
  review: RollingWeeklyReview | null
  proposal: WeeklyProposalView | null
  reviewing: boolean
  creatingProposal: boolean
  accepting: boolean
  savingSessionId: string | null
  onReview: () => Promise<void>
  onCreateProposal: () => Promise<void>
  onAccept: () => Promise<void>
  onRequestDirectionChange: () => void
  onRecordSessionResult: (
    sessionId: string,
    completion: AtomicSessionCompletionInput
  ) => Promise<string | null>
  onEditFailedSessionResult: (sessionId: string) => void
  onRefreshPlan: () => Promise<void>
}

export function WeeklyProgramView({
  state,
  activeProgram,
  review,
  proposal,
  reviewing,
  creatingProposal,
  accepting,
  savingSessionId,
  onReview,
  onCreateProposal,
  onAccept,
  onRequestDirectionChange,
  onRecordSessionResult,
  onEditFailedSessionResult,
  onRefreshPlan
}: WeeklyProgramViewProps) {
  const acceptedWeek = state.currentWeek?.intent.weekly_plan ?? null
  const todaySession = selectTodaySession(activeProgram)
  const todayPrescription = todaySession && isCompletePrescription(todaySession.prescription)
    ? todaySession.prescription
    : null
  const acceptedSessions = activeProgram.upcomingSessions.filter(session => (
    session.scheduledDate !== null
    && acceptedWeek !== null
    && session.scheduledDate >= acceptedWeek.windowStart
    && session.scheduledDate <= acceptedWeek.windowEnd
  ))
  const latestReview = review ?? historyReview(state)

  if (!acceptedWeek || !state.program) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100">Weekly plan data needs a refresh</h2>
        <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
          The active weekly plan is missing its accepted prescription snapshot.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              This week
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">{acceptedWeek.title}</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {formatDate(acceptedWeek.windowStart)}–{formatDate(acceptedWeek.windowEnd)} · accepted dose
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Active
          </span>
        </div>

        <div className="mt-5">
          {todaySession && todayPrescription && todaySession.status === 'planned' ? (
            <TodaySessionCard
              key={todaySession.id}
              session={todaySession}
              prescription={todayPrescription}
              saving={savingSessionId === todaySession.id}
              onSubmit={onRecordSessionResult}
              onEditFailedEntry={onEditFailedSessionResult}
              onRefreshPlan={onRefreshPlan}
            >
              <CompleteSessionCard prescription={todayPrescription} />
            </TodaySessionCard>
          ) : todaySession && todaySession.status !== 'planned' ? (
            <TodayTerminalCard session={todaySession} />
          ) : (
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
              <p className="font-semibold text-gray-950 dark:text-white">No session needs attention today</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Recovery days and missed sessions stay in this week’s record. They are not carried forward.
              </p>
            </div>
          )}
        </div>

        <details className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-semibold text-gray-900 dark:text-white">
            All accepted sessions
          </summary>
          <ul className="space-y-3 border-t border-gray-200 p-4 dark:border-gray-700">
            {acceptedSessions.map(session => (
              <li key={session.id} className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-950 dark:text-white">
                    {session.scheduledDate ? formatDate(session.scheduledDate) : `Session ${session.sessionIndex}`}
                  </p>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {session.status}
                  </span>
                </div>
                {isCompletePrescription(session.prescription) && (
                  <div className="mt-3"><CompleteSessionCard prescription={session.prescription} /></div>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <CoachReviewSection
        review={latestReview}
        proposal={proposal ?? pendingProposal(state)}
        reviewing={reviewing}
        creatingProposal={creatingProposal}
        accepting={accepting}
        onReview={onReview}
        onCreateProposal={onCreateProposal}
        onAccept={onAccept}
        onRequestDirectionChange={onRequestDirectionChange}
      />

      <TrainingDirection direction={state.program.direction} />

      <WeeklyHistory state={state} />
    </div>
  )
}

function CoachReviewSection({
  review,
  proposal,
  reviewing,
  creatingProposal,
  accepting,
  onReview,
  onCreateProposal,
  onAccept,
  onRequestDirectionChange
}: {
  review: RollingWeeklyReview | WeeklyReviewHistoryView | null
  proposal: WeeklyProposalView | null
  reviewing: boolean
  creatingProposal: boolean
  accepting: boolean
  onReview: () => Promise<void>
  onCreateProposal: () => Promise<void>
  onAccept: () => Promise<void>
  onRequestDirectionChange: () => void
}) {
  const presentation = reviewPresentation(review)
  const action = reviewAction(review)
  return (
    <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${presentation.className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Coach review and next week</p>
      <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">{presentation.title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{presentation.message}</p>

      {isLiveReview(review) && review.status === 'ready' && (
        <div className="mt-4 rounded-xl bg-white/70 p-4 dark:bg-gray-900/70">
          <p className="font-semibold text-gray-950 dark:text-white">
            {review.executionSummary.completedSessions} of {review.executionSummary.plannedSessions} completed
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {review.executionSummary.skippedSessions} skipped · {review.executionSummary.pastDuePlannedSessions} past due
            {review.executionSummary.averageSessionRpe !== null
              ? ` · average RPE ${review.executionSummary.averageSessionRpe}`
              : ''}
          </p>
          {review.rationale.length > 0 && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{review.rationale[0]}</p>
          )}
        </div>
      )}

      {proposal ? (
        <NextWeekProposal proposal={proposal.proposal} />
      ) : action === 'shift_emphasis' ? (
        <button
          type="button"
          onClick={onRequestDirectionChange}
          className="mt-5 min-h-12 w-full rounded-xl bg-violet-700 px-5 py-3 text-base font-semibold text-white hover:bg-violet-800 sm:w-auto"
        >
          Confirm replacement direction
        </button>
      ) : action === 'pause_review' ? (
        <a
          href="/coach"
          className="mt-5 inline-flex min-h-12 items-center rounded-xl border border-red-500 bg-white px-5 py-3 font-semibold text-red-700 dark:bg-gray-900 dark:text-red-300"
        >
          Discuss the safety signal
        </a>
      ) : action !== null ? (
        <button
          type="button"
          onClick={() => void onCreateProposal()}
          disabled={creatingProposal}
          className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {creatingProposal ? 'Building next week…' : 'Build next week from saved review'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void onReview()}
          disabled={reviewing}
          className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {reviewing ? 'Reviewing your week…' : 'Review this week'}
        </button>
      )}

      {proposal && (
        <button
          type="button"
          onClick={() => void onAccept()}
          disabled={accepting}
          className="mt-3 min-h-12 w-full rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:ml-3 sm:w-auto"
        >
          {accepting ? 'Accepting…' : 'Accept next week'}
        </button>
      )}
    </section>
  )
}

function NextWeekProposal({ proposal }: { proposal: RollingWeeklyPlanDraft }) {
  const action = proposal.reviewDecision?.action ?? 'continue'
  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Next week proposal</p>
      <h3 className="mt-2 font-bold text-gray-950 dark:text-white">{proposal.title}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {actionLabel(action)} · {proposal.sessions.length} sessions · acceptance required
      </p>
      {proposal.changeSummary.changedVariables.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-200">
          {proposal.changeSummary.changedVariables.map(change => (
            <li key={change}>• {change.replaceAll('_', ' ')}</li>
          ))}
        </ul>
      )}
      <details className="mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700 dark:text-blue-300">
          Inspect proposed sessions
        </summary>
        <ul className="mt-2 space-y-2">
          {proposal.scheduledSessions.map(session => (
            <li key={session.prescription.sessionId} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-950">
              <p className="font-semibold text-gray-950 dark:text-white">{formatDate(session.scheduledDate)}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {session.prescription.title} · {session.prescription.scheduledMinutes} min
              </p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function TrainingDirection({ direction }: { direction: RollingTrainingDirection }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Training direction</p>
      <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">{direction.goalSummary}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{direction.hypothesis}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {direction.currentEmphasis.map(emphasis => (
          <span key={emphasis.goalAllocationId} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {emphasis.domain.replaceAll('_', ' ')} · {emphasis.allocation}
          </span>
        ))}
      </div>
      {direction.goalTargetDate && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Goal target: {formatDate(direction.goalTargetDate)}
        </p>
      )}
    </section>
  )
}

function WeeklyHistory({ state }: { state: WeeklyCoachState }) {
  const history = Array.isArray(state.history) ? { plans: state.history, reviews: [] } : state.history
  return (
    <details className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <summary className="flex min-h-12 cursor-pointer items-center px-5 py-4 text-lg font-bold text-gray-950 dark:text-white">
        Weekly history
      </summary>
      <div className="border-t border-gray-200 p-5 dark:border-gray-700">
        {history.plans.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">No prior weekly doses yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.plans.map(plan => {
              const linkedReview = history.reviews.find(review => review.base_plan_version_id === plan.id)
              return (
                <li key={plan.id} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-950 dark:text-white">
                      Week {plan.sequence_number} · {formatDate(plan.window_start)}
                    </p>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{plan.status}</span>
                  </div>
                  {linkedReview && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      Coach decision: {actionLabel(linkedReview.action)}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </details>
  )
}

function pendingProposal(state: WeeklyCoachState): WeeklyProposalView | null {
  if (!state.pendingProposal || Array.isArray(state.history)) return null
  const plan = state.history.plans.find(item => item.id === state.pendingProposal?.proposed_plan_version_id)
  const proposal = plan?.intent.weekly_plan
  if (!proposal) return null
  return {
    proposalId: state.pendingProposal.id,
    idempotencyKey: state.pendingProposal.idempotency_key,
    proposal
  }
}

function historyReview(state: WeeklyCoachState): WeeklyReviewHistoryView | null {
  if (Array.isArray(state.history)) return null
  return state.history.reviews.find(review => (
    review.base_plan_version_id === state.currentWeek?.id
  )) ?? null
}

function reviewPresentation(review: RollingWeeklyReview | WeeklyReviewHistoryView | null) {
  const action = reviewAction(review)
  if (action === 'pause_review') return {
    title: 'Pause and review the safety signal',
    message: 'The coach will not generate another training dose until the concerning signal is reviewed.',
    className: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
  }
  if (action === 'shift_emphasis') return {
    title: 'The evidence supports a new emphasis',
    message: 'Confirm the replacement direction before the coach builds another week.',
    className: 'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100'
  }
  if (action === 'adjust_dose' || action === 'recover') return {
    title: action === 'recover' ? 'A lower-stress week is ready to review' : 'One small dose change is ready',
    message: 'The goal stays stable. Only the named weekly dose variable changes after acceptance.',
    className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
  }
  if (action === 'collect_signal') return {
    title: 'Stay on track and collect one signal',
    message: 'The evidence is not strong enough to change emphasis. The next week adds one compatible measurement.',
    className: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100'
  }
  if (action === 'continue') return {
    title: 'Continue on the same track',
    message: 'The evidence does not justify a larger change. Review and accept the next weekly dose.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
  }
  return {
    title: 'Review this week when you are ready',
    message: 'The coach will use completed work, missed work, session feedback, and compatible performance evidence.',
    className: 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
  }
}

function reviewAction(review: RollingWeeklyReview | WeeklyReviewHistoryView | null): string | null {
  if (!review) return null
  if ('status' in review && review.status === 'not_ready') return null
  return review.action
}

function isLiveReview(
  review: RollingWeeklyReview | WeeklyReviewHistoryView | null
): review is RollingWeeklyReview {
  return review !== null && 'status' in review
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    continue: 'same track',
    adjust_dose: 'one dose adjustment',
    collect_signal: 'collect one signal',
    recover: 'lower stress',
    shift_emphasis: 'shift emphasis',
    pause_review: 'safety pause'
  }
  return labels[action] ?? action.replaceAll('_', ' ')
}

function isCompletePrescription(
  value: Record<string, unknown>
): value is Record<string, unknown> & RollingWeeklyPlanDraft['sessions'][number] {
  return value.schemaVersion === 1
    && value.format === 'complete_programming_v0_3'
    && Array.isArray(value.blocks)
}

function formatDate(value: string): string {
  return parseDateString(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(value.slice(0, 4) !== getLocalDate().slice(0, 4) ? { year: 'numeric' } : {})
  })
}
