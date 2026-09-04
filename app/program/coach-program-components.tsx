'use client'

import React, { useState, type FormEvent } from 'react'
import type {
  ActiveCoachProgramSummary,
  CoachSessionPrescription,
  CoachStrengthAssessmentSummary,
  StrengthAssessmentInput,
  TrainingWeekday
} from '@/app/lib/coach/types'
import type { CompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import type {
  CoachSessionCheckinInput,
  CoachSessionCheckinSummary,
  CoachWeeklyReview
} from '@/app/lib/coach/execution-feedback'
import type { AtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import type { CompleteProgrammingPlanDraft } from '@/app/lib/coach/complete-program'
import type {
  CompleteProgrammingDose,
  CompleteProgrammingExercisePrescription,
  CompleteProgrammingSessionPrescription,
  ProgrammingExecutionTarget,
  ProgrammingSessionBlockRole
} from '@/app/lib/coach/programming-schema'
import {
  MOVEMENT_CATALOG,
  type MovementEquipmentId
} from '@/app/lib/coach/movement-catalog'
import { getLocalDate, parseDateString } from '@/app/lib/timezone-utils'
import {
  selectTodaySession,
  TodaySessionCard,
  TodayTerminalCard
} from './today-session-card'

const FOCUS_OPTIONS: Array<{ value: CompleteCoachPlanningInput['primaryDomain']; label: string }> = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Build muscle' },
  { value: 'power_explosiveness', label: 'Power and explosiveness' },
  { value: 'speed_agility', label: 'Speed and agility' },
  { value: 'aerobic', label: 'Aerobic conditioning' },
  { value: 'resilience', label: 'Resilience and movement capacity' }
]

const EQUIPMENT_OPTIONS: Array<{ value: MovementEquipmentId; label: string }> = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'rack', label: 'Rack' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'kettlebell', label: 'Kettlebells' },
  { value: 'bench', label: 'Bench' },
  { value: 'band', label: 'Bands' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machines' },
  { value: 'pull_up_bar', label: 'Pull-up bar' },
  { value: 'medicine_ball', label: 'Medicine ball' },
  { value: 'box', label: 'Box' },
  { value: 'sled', label: 'Sled' },
  { value: 'bike', label: 'Bike' },
  { value: 'rower', label: 'Rower' },
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'track', label: 'Track or field' }
]

const WEEKDAYS: Array<{ value: TrainingWeekday; short: string; label: string }> = [
  { value: 'monday', short: 'Mon', label: 'Monday' },
  { value: 'tuesday', short: 'Tue', label: 'Tuesday' },
  { value: 'wednesday', short: 'Wed', label: 'Wednesday' },
  { value: 'thursday', short: 'Thu', label: 'Thursday' },
  { value: 'friday', short: 'Fri', label: 'Friday' },
  { value: 'saturday', short: 'Sat', label: 'Saturday' },
  { value: 'sunday', short: 'Sun', label: 'Sunday' }
]

const FIELD_CLASS = 'mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'

interface CoachSetupFormProps {
  value: CompleteCoachPlanningInput
  onChange: (value: CompleteCoachPlanningInput) => void
  onSave: () => void
  saving: boolean
  saved: boolean
  actionLabel?: string
  beforeAction?: React.ReactNode
}

export function CoachSetupForm({
  value,
  onChange,
  onSave,
  saving,
  saved,
  actionLabel = 'Save coach setup',
  beforeAction
}: CoachSetupFormProps) {
  const toggleDay = (day: TrainingWeekday) => {
    const trainingDays = value.trainingDays.includes(day)
      ? value.trainingDays.filter(candidate => candidate !== day)
      : [...value.trainingDays, day]
    onChange({ ...value, trainingDays })
  }
  const toggleEquipment = (equipmentId: MovementEquipmentId) => {
    const resolvedEquipmentIds = value.resolvedEquipmentIds.includes(equipmentId)
      ? value.resolvedEquipmentIds.filter(candidate => candidate !== equipmentId)
      : [...value.resolvedEquipmentIds, equipmentId]
    const equipment = EQUIPMENT_OPTIONS
      .filter(option => resolvedEquipmentIds.includes(option.value))
      .map(option => option.label)
      .join(', ')
    onChange({ ...value, resolvedEquipmentIds, equipment })
  }
  const toggleConstraint = (kind: CompleteCoachPlanningInput['constraintKinds'][number]) => {
    const constraintKinds = value.constraintKinds.includes(kind)
      ? value.constraintKinds.filter(candidate => candidate !== kind)
      : [...value.constraintKinds, kind]
    onChange({ ...value, constraintKinds })
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
          Step 1 · Training intent
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">
          Set your training direction
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Tell the coach what matters and what is realistic. You will see and accept one
          Monday-to-Sunday dose at a time.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Primary focus
          <select
            aria-label="Primary focus"
            value={value.primaryDomain}
            onChange={event => onChange({
              ...value,
              primaryDomain: event.target.value as CompleteCoachPlanningInput['primaryDomain'],
              secondaryGoals: value.secondaryGoals.filter(goal => goal.domain !== event.target.value)
            })}
            className={FIELD_CLASS}
          >
            {FOCUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Training experience
          <select
            aria-label="Training experience"
            value={value.experience}
            onChange={event => onChange({
              ...value,
              experience: event.target.value as CompleteCoachPlanningInput['experience']
            })}
            className={FIELD_CLASS}
          >
            <option value="new_or_returning">New or returning</option>
            <option value="consistent">Training consistently</option>
            <option value="experienced">Experienced</option>
          </select>
        </label>
      </div>

      <label className="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
        Goal
        <textarea
          aria-label="Goal"
          value={value.goal}
          onChange={event => onChange({ ...value, goal: event.target.value })}
          rows={3}
          placeholder="Example: Build full-body strength without losing conditioning."
          className={FIELD_CLASS}
        />
      </label>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Supporting focus (optional)
          <select
            aria-label="Supporting focus"
            value={value.secondaryGoals[0]?.domain ?? ''}
            onChange={event => {
              const domain = event.target.value as CompleteCoachPlanningInput['primaryDomain'] | ''
              onChange({
                ...value,
                secondaryGoals: domain ? [{
                  domain,
                  allocation: 'maintenance',
                  athleteIntent: `Support ${FOCUS_OPTIONS.find(option => option.value === domain)?.label ?? domain}`
                }] : []
              })
            }}
            className={FIELD_CLASS}
          >
            <option value="">No supporting focus</option>
            {FOCUS_OPTIONS.filter(option => option.value !== value.primaryDomain).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {value.secondaryGoals[0] && (
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Supporting dose
            <select
              aria-label="Supporting dose"
              value={value.secondaryGoals[0].allocation}
              onChange={event => onChange({
                ...value,
                secondaryGoals: [{
                  ...value.secondaryGoals[0],
                  allocation: event.target.value as 'development' | 'maintenance'
                }]
              })}
              className={FIELD_CLASS}
            >
              <option value="maintenance">Maintain</option>
              <option value="development">Develop alongside primary</option>
            </select>
          </label>
        )}
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Days you can usually train
        </legend>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAYS.map(day => {
            const selected = value.trainingDays.includes(day.value)
            return (
              <label
                key={day.value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  aria-label={day.label}
                  checked={selected}
                  onChange={() => toggleDay(day.value)}
                />
                {day.short}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Session length
          <select
            aria-label="Session length"
            value={value.sessionMinutes}
            onChange={event => onChange({
              ...value,
              sessionMinutes: Number(event.target.value) as CompleteCoachPlanningInput['sessionMinutes']
            })}
            className={FIELD_CLASS}
          >
            {[30, 45, 60, 75, 90].map(minutes => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          First week starts
          <input
            type="date"
            aria-label="First week starts"
            value={value.startDate}
            onChange={event => onChange({ ...value, startDate: event.target.value })}
            className={FIELD_CLASS}
          />
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            Choose a Monday.
          </span>
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Available equipment
        </legend>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Select what the plan may use. Unselected equipment will never be assumed from notes.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {EQUIPMENT_OPTIONS.map(option => {
            const selected = value.resolvedEquipmentIds.includes(option.value)
            return (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm font-medium ${
                  selected
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                    : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={option.label}
                  checked={selected}
                  onChange={() => toggleEquipment(option.value)}
                  className="mr-2 size-4"
                />
                {option.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Movement constraints
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([
            ['no_overhead', 'Do not prescribe overhead work'],
            ['no_running', 'Do not prescribe running']
          ] as const).map(([kind, label]) => (
            <label key={kind} className="flex min-h-11 items-center rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
              <input
                type="checkbox"
                checked={value.constraintKinds.includes(kind)}
                onChange={() => toggleConstraint(kind)}
                className="mr-2 size-4"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
        Constraints or preferences
        <textarea
          aria-label="Constraints or preferences"
          value={value.constraints}
          onChange={event => onChange({ ...value, constraints: event.target.value })}
          rows={2}
          placeholder="Optional: schedule limits, movements you avoid, or preferences to preserve."
          className={FIELD_CLASS}
        />
      </label>

      {beforeAction}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-6 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? 'Saving setup…' : saved ? 'Save updated setup' : actionLabel}
      </button>
    </section>
  )
}

interface StrengthAssessmentPanelProps {
  assessments: CoachStrengthAssessmentSummary[]
  onSubmit: (input: StrengthAssessmentInput) => Promise<string | null>
}

export function StrengthAssessmentPanel({ assessments, onSubmit }: StrengthAssessmentPanelProps) {
  const [movement, setMovement] = useState('')
  const [load, setLoad] = useState('')
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb')
  const [reps, setReps] = useState<1 | 3 | 5>(5)
  const [assessedOn, setAssessedOn] = useState(() => getLocalDate())
  const [isTrueRepMax, setIsTrueRepMax] = useState(true)
  const [athleteConfidence, setAthleteConfidence] = useState(0.85)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    const result = await onSubmit({
      movement,
      load: Number(load),
      unit,
      reps,
      assessedOn,
      isTrueRepMax,
      athleteConfidence
    })
    setSaving(false)

    if (result) {
      setMessage(result)
      return
    }

    setMovement('')
    setLoad('')
    setMessage('Baseline saved.')
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
        Optional baseline
      </p>
      <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">
        Known strength baselines
      </h2>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
        Add any 1RM, 3RM, or 5RM you know. A 3RM or 5RM is saved with its source and shown as an estimated 1RM.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200 sm:col-span-2">
          Movement
          <input
            aria-label="Movement"
            value={movement}
            onChange={event => setMovement(event.target.value)}
            placeholder="Back squat"
            required
            className={FIELD_CLASS}
          />
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Load
          <input
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            aria-label="Load"
            value={load}
            onChange={event => setLoad(event.target.value)}
            required
            className={FIELD_CLASS}
          />
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Unit
          <select
            aria-label="Unit"
            value={unit}
            onChange={event => setUnit(event.target.value as 'lb' | 'kg')}
            className={FIELD_CLASS}
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Rep max
          <select
            aria-label="Rep max"
            value={reps}
            onChange={event => setReps(Number(event.target.value) as 1 | 3 | 5)}
            className={FIELD_CLASS}
          >
            <option value={1}>1RM</option>
            <option value={3}>3RM</option>
            <option value={5}>5RM</option>
          </select>
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Date
          <input
            type="date"
            aria-label="Assessment date"
            value={assessedOn}
            onChange={event => setAssessedOn(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Confidence
          <select
            aria-label="Assessment confidence"
            value={athleteConfidence}
            onChange={event => setAthleteConfidence(Number(event.target.value))}
            className={FIELD_CLASS}
          >
            <option value={0.7}>Fair</option>
            <option value={0.85}>Good</option>
            <option value={1}>High</option>
          </select>
        </label>

        <label className="flex min-h-12 items-center gap-3 self-end rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200">
          <input
            type="checkbox"
            checked={isTrueRepMax}
            onChange={event => setIsTrueRepMax(event.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600"
          />
          True max effort
        </label>

        <button
          type="submit"
          disabled={saving}
          className="min-h-12 rounded-xl border border-blue-600 px-4 py-3 font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950/40"
        >
          {saving ? 'Saving…' : 'Add baseline'}
        </button>
      </form>

      {message && (
        <p role="status" className="mt-3 text-sm text-gray-600 dark:text-gray-300">{message}</p>
      )}

      {assessments.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {assessments.map(assessment => (
            <li key={assessment.id} className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
              <p className="font-semibold text-gray-900 dark:text-white">{assessment.movement}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {assessment.load} {assessment.unit} × {assessment.reps} ·{' '}
                {assessment.estimateKind === 'reported_1rm' ? 'Reported 1RM' : 'Estimated 1RM'}{' '}
                {assessment.estimatedOneRepMax} {assessment.unit}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface ProposalPreviewProps {
  proposal: CompleteProgrammingPlanDraft
  onAccept: () => void
  accepting: boolean
  replacement?: boolean
}

export function ProposalPreview({
  proposal,
  onAccept,
  accepting,
  replacement = false
}: ProposalPreviewProps) {
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/20 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
        Step 2 · Athlete review
      </p>
      <h2 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">
        {replacement ? 'Review your replacement proposal' : 'Review your proposal'}
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {proposal.title} · {formatDate(proposal.startDate)} to {formatDate(proposal.endDate)}
      </p>

      <div className="mt-6 space-y-3">
        {proposal.weeks.map(week => {
          const sessions = week.sessions
          return (
            <article key={week.weekNumber} className="min-w-0 rounded-xl border border-blue-100 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <h3 className="font-bold text-gray-950 dark:text-white">Week {week.weekNumber}</h3>
                {week.review.status === 'pending_athlete_review' && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {week.weekNumber === 4 ? 'Review before deload' : 'Review and assess'}
                  </span>
                )}
              </div>
              <p className="mt-3 break-words text-sm leading-5 text-gray-700 dark:text-gray-200">{week.intent}</p>
              <details className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Weekly coverage · {week.schedule.ledger.filter(entry => entry.plannedDose > 0).length} planned
                </summary>
                <ul className="mt-2 space-y-2">
                  {week.schedule.ledger.map(entry => {
                    const gap = week.schedule.gaps.find(candidate => candidate.requirementId === entry.requirement.id)
                    return (
                      <li key={entry.requirement.id} className="min-w-0 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-950/50">
                        <p className="break-words font-medium text-gray-900 dark:text-white">{entry.requirement.targetLabel}</p>
                        <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
                          {entry.plannedDose > 0
                            ? `${entry.plannedDose} ${doseUnitLabel(entry.requirement.dose.unit)}`
                            : gap?.detail ?? 'Not planned'}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </details>
              <details className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800" open={week.weekNumber === 1}>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {sessions.length} complete sessions
                </summary>
                <div className="mt-3 space-y-3">
                  {sessions.map((session, index) => (
                    <CompleteSessionCard
                      key={session.sessionId}
                      prescription={session}
                      label={`Session ${index + 1} · ${weekdayLabel(session.day)}`}
                    />
                  ))}
                </div>
              </details>
            </article>
          )
        })}
      </div>

      <div className="mt-6 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Acceptance changes the plan state.</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          This preview is not active until you accept it. The coach cannot silently replace an accepted plan.
        </p>
      </div>

      <button
        type="button"
        onClick={onAccept}
        disabled={accepting}
        className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
      >
        {accepting ? 'Accepting plan…' : replacement ? 'Accept replacement plan' : 'Accept this plan'}
      </button>
    </section>
  )
}

interface ActiveProgramViewProps {
  program: ActiveCoachProgramSummary
  onRecordSessionResult?: (
    sessionId: string,
    completion: AtomicSessionCompletionInput
  ) => Promise<string | null>
  onEditFailedSessionResult?: (sessionId: string) => void
  onRefreshPlan?: () => Promise<void>
  savingSessionId?: string | null
}

export function ActiveProgramView({
  program,
  onRecordSessionResult,
  onEditFailedSessionResult = () => undefined,
  onRefreshPlan = async () => undefined,
  savingSessionId = null
}: ActiveProgramViewProps) {
  const todaySession = selectTodaySession(program)
  const todayPrescription = todaySession && isCompletePrescription(todaySession.prescription)
    ? todaySession.prescription
    : null
  const todayIsActionable = todaySession
    && todaySession.status === 'planned'
    && todayPrescription
    && onRecordSessionResult
  const todayIsTerminal = todaySession && todaySession.status !== 'planned'
  const visibleSessions = program.upcomingSessions
    .filter(session => (
      session.status === 'planned'
      || program.currentWeek === null
      || session.weekNumber >= program.currentWeek
    ))
    .filter(session => !todayIsActionable && !todayIsTerminal || session.id !== todaySession?.id)
    .slice(0, 6)

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
        Accepted · Version {program.planVersion}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">Active training plan</h1>
      <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{program.title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{program.goalSummary}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {formatDate(program.startDate)} to {formatDate(program.endDate)}
        {program.currentWeek ? ` · Week ${program.currentWeek}` : ''}
      </p>

      <div className="mt-6">
        {todayIsActionable && todayPrescription ? (
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
        ) : todayIsTerminal ? (
          <TodayTerminalCard session={todaySession} />
        ) : !todaySession ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Today</p>
            <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">No session waiting</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Your accepted plan has no planned session to log right now.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
            <h2 className="text-xl font-bold text-gray-950 dark:text-white">Legacy session format</h2>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
              Review this accepted session below. Atomic Today logging starts with the current prescription format.
            </p>
          </section>
        )}
      </div>

      {program.weeks.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 dark:text-white">Eight-week intent</h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {program.weeks.map(week => (
              <li key={week.week} className="rounded-xl bg-white p-3 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">Week {week.week}</p>
                  {week.reviewRequired && (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Review</span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300">{week.intent}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {program.currentWeekReview && (
        <WeeklyReviewCard review={program.currentWeekReview} />
      )}

      {visibleSessions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 dark:text-white">Plan sessions</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {visibleSessions.map(session => (
              <li key={session.id} className="rounded-xl bg-white p-4 dark:bg-gray-900">
                <p className="font-semibold text-gray-900 dark:text-white">
                  Week {session.weekNumber} · Session {session.sessionIndex}
                </p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                  session.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : session.status === 'skipped'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                }`}>
                  {sessionStatusLabel(session.status)}
                </span>
                {session.scheduledDate && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(session.scheduledDate)}
                  </p>
                )}
                {isCompletePrescription(session.prescription) ? (
                  <CompleteSessionCard prescription={session.prescription} />
                ) : isDetailedPrescription(session.prescription) ? (
                  <SessionPrescriptionCard prescription={session.prescription} />
                ) : typeof session.prescription.intent === 'string' && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                    {session.prescription.intent}
                  </p>
                )}
                {program.sessionCheckins.find(item => item.prescribedSessionId === session.id) && (
                  <SessionCheckinSummaryCard
                    checkin={program.sessionCheckins.find(item => (
                      item.prescribedSessionId === session.id
                    )) as CoachSessionCheckinSummary}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function WeeklyReviewCard({ review }: { review: CoachWeeklyReview }) {
  const proposal = review.adaptationProposal
  return (
    <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Week {review.weekNumber} review</h3>
        {review.checkpointReviewRequired && (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Planned review checkpoint
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
        {review.status === 'ready'
          ? `${review.completedSessions} of ${review.plannedSessions} completed · ${review.skippedSessions} skipped`
          : review.status === 'in_progress'
            ? `${review.completedSessions + review.skippedSessions} of ${review.plannedSessions} results logged`
            : 'No session results logged yet.'}
      </p>
      {review.signals.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
          {review.signals.map(signal => <li key={signal}>• {signal}</li>)}
        </ul>
      )}
      {proposal && (
        <div className="mt-4 border-t border-blue-200 pt-4 dark:border-blue-900">
          <h4 className="font-semibold text-gray-900 dark:text-white">{proposal.title}</h4>
          <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-200">
            {proposal.rationale}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            {proposal.proposedChanges.map(change => <li key={change}>• {change}</li>)}
          </ul>
          {proposal.requiresAcceptance && (
            <p className="mt-3 text-sm font-semibold text-blue-800 dark:text-blue-200">
              No future session has changed. Review and accept a replacement proposal before applying an adjustment.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function SessionCheckinSummaryCard({ checkin }: { checkin: CoachSessionCheckinSummary }) {
  return (
    <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-950/50 dark:text-gray-300">
      {checkin.outcome === 'skipped' ? 'Skipped' : `Session RPE ${checkin.sessionRpe}`}
      {' · '}{energyLabel(checkin.energy)} energy
      {checkin.pain !== 'none' ? ` · ${painLabel(checkin.pain)}` : ''}
      {checkin.note && <p className="mt-1">{checkin.note}</p>}
    </div>
  )
}

function sessionStatusLabel(status: 'planned' | 'completed' | 'skipped'): string {
  if (status === 'completed') return 'Completed'
  if (status === 'skipped') return 'Skipped'
  return 'Planned'
}

function energyLabel(energy: CoachSessionCheckinInput['energy']): string {
  return energy === 'okay' ? 'Okay' : energy.charAt(0).toUpperCase() + energy.slice(1)
}

function painLabel(pain: CoachSessionCheckinInput['pain']): string {
  return pain === 'mild' ? 'Mild pain signal' : 'Concerning pain signal'
}

export function CompleteSessionCard({
  prescription,
  label
}: {
  prescription: CompleteProgrammingSessionPrescription
  label?: string
}) {
  return (
    <article className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/50">
      {label && (
        <p className="break-words text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
      )}
      <div className="mt-1 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words font-bold text-gray-950 dark:text-white">{prescription.title}</h4>
          <p className="mt-1 break-words text-sm leading-5 text-gray-700 dark:text-gray-200">
            {prescription.intent}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
          {prescription.scheduledMinutes} min
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {prescription.blocks.map(block => (
          <section key={block.id} className="min-w-0 border-l-2 border-blue-200 pl-3 dark:border-blue-900">
            <p className="break-words text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {blockRoleLabel(block.role)} · {block.estimatedMinutes} min
            </p>
            <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
              Why: {block.intent}
            </p>
            {block.exercises.map(exercise => (
              <div key={`${block.id}:${exercise.movementId}`} className="mt-3 min-w-0">
                <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">
                  {exercise.movementName}
                </p>
                <p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">
                  {formatDose(exercise.dose)} · {formatExecutionTarget(exercise.executionTarget)}
                </p>
                {exercise.loadAnchor && (
                  <p className="mt-1 break-words text-xs font-medium text-blue-700 dark:text-blue-300">
                    Load: {exercise.loadAnchor.loadRange.min}-{exercise.loadAnchor.loadRange.max}{' '}
                    {exercise.loadAnchor.loadRange.unit}
                    {exercise.loadAnchor.source === 'saved_assessment'
                      ? ` (${exercise.loadAnchor.percentRange.min}-${exercise.loadAnchor.percentRange.max}% saved e1RM)`
                      : ' (accepted prior plan)'}
                  </p>
                )}
                <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
                  Rest: {formatRange(exercise.restSeconds)} sec
                </p>
                <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-300">
                  Success: {exercise.successCondition}
                </p>
                <p className="mt-1 break-words text-xs font-medium text-amber-800 dark:text-amber-200">
                  Stop: {exercise.stopCondition}
                </p>
                <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                  {substitutionText(exercise)}
                </p>
                {exercise.selectionReasons.length > 0 && (
                  <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                    Selected because: {exercise.selectionReasons.join(' ')}
                  </p>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}

function SessionPrescriptionCard({
  prescription,
  label
}: {
  prescription: CoachSessionPrescription
  label?: string
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/50">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
      )}
      <h4 className={`${label ? 'mt-1 ' : ''}font-bold text-gray-950 dark:text-white`}>
        {prescription.session_title}
      </h4>
      <p className="mt-1 text-sm leading-5 text-gray-700 dark:text-gray-200">
        {prescription.intent}
      </p>

      <div className="mt-3 space-y-3">
        {prescription.dose.blocks.map(block => (
          <section key={block.label} className="border-l-2 border-blue-200 pl-3 dark:border-blue-900">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {block.label} · {block.minutes} min
            </p>
            {block.exercises.map(exercise => (
              <div key={exercise.name} className="mt-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{exercise.name}</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">{exercise.prescription}</p>
                {exercise.load_guidance && (
                  <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                    Saved baseline: {exercise.load_guidance.loadRange.min}-
                    {exercise.load_guidance.loadRange.max} {exercise.load_guidance.loadRange.unit}{' '}
                    ({exercise.load_guidance.percentRange[0]}-{exercise.load_guidance.percentRange[1]}% e1RM)
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Swap: {exercise.substitutions.join(' or ')}
                </p>
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-600 dark:border-gray-800 dark:text-gray-300">
        <p><span className="font-semibold">Feel:</span> {prescription.effort}</p>
        <p><span className="font-semibold">Recovery:</span> {prescription.rest}</p>
        <p><span className="font-semibold">Success:</span> {prescription.success_condition}</p>
        <p><span className="font-semibold">Stop:</span> {prescription.stop_condition}</p>
        <p className="mt-1"><span className="font-semibold">Progress:</span> {prescription.progression.next_week}</p>
        {prescription.constraint_notes.map(note => (
          <p key={note} className="mt-1 font-medium">{note}</p>
        ))}
      </div>
    </article>
  )
}

function isCompletePrescription(
  value: Record<string, unknown>
): value is Record<string, unknown> & CompleteProgrammingSessionPrescription {
  return value.schemaVersion === 1
    && value.format === 'complete_programming_v0_3'
    && value.kernelVersion === '0.3.0'
    && typeof value.title === 'string'
    && typeof value.intent === 'string'
    && typeof value.scheduledMinutes === 'number'
    && Array.isArray(value.blocks)
}

function doseUnitLabel(unit: string): string {
  return unit.replaceAll('_', ' ')
}

function weekdayLabel(day: TrainingWeekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

function blockRoleLabel(role: ProgrammingSessionBlockRole): string {
  const labels: Record<ProgrammingSessionBlockRole, string> = {
    specific_preparation: 'Specific preparation',
    priority_adaptation: 'Priority work',
    secondary_adaptation: 'Secondary work',
    assistance_and_capacity: 'Assistance and capacity',
    conditioning: 'Conditioning',
    downshift: 'Downshift'
  }
  return labels[role]
}

function formatDose(dose: CompleteProgrammingDose): string {
  if (dose.kind === 'sets_reps') {
    return `${formatRange(dose.sets)} sets × ${formatRange(dose.repetitions)} reps`
  }
  if (dose.kind === 'quality_repetitions') {
    return `${dose.totalRepetitions ?? formatRange(dose.repetitionsPerSeries)} quality reps`
  }
  if (dose.kind === 'continuous') {
    return `${formatRange(dose.durationMinutes)} minutes continuous`
  }
  return `${dose.totalIntervals ?? formatRange(dose.repetitions)} intervals · ${formatRange(dose.workSeconds)} sec work / ${formatRange(dose.recoverySeconds)} sec recovery`
}

function formatExecutionTarget(target: ProgrammingExecutionTarget): string {
  if (target.kind === 'rir') return `${formatRange(target.range)} reps in reserve`
  if (target.kind === 'rpe') return `RPE ${formatRange(target.range)}`
  return target.cue
}

function formatRange(range: { min: number; max: number }): string {
  return range.min === range.max ? String(range.min) : `${range.min}-${range.max}`
}

function substitutionText(exercise: CompleteProgrammingExercisePrescription): string {
  if (exercise.substitutionMovementIds.length === 0) return exercise.substitutionGuidance
  const names = exercise.substitutionMovementIds.map(id => (
    MOVEMENT_CATALOG.find(movement => movement.id === id)?.name ?? id
  ))
  return `Equivalent options: ${names.join(' or ')}`
}

function isDetailedPrescription(
  value: Record<string, unknown>
): value is Record<string, unknown> & CoachSessionPrescription {
  if (
    typeof value.session_role !== 'string'
    || typeof value.session_title !== 'string'
    || !isRecord(value.dose)
    || !Array.isArray(value.dose.blocks)
    || !isRecord(value.progression)
    || typeof value.progression.next_session !== 'string'
    || typeof value.progression.next_week !== 'string'
    || !Array.isArray(value.constraint_notes)
    || !value.constraint_notes.every(note => typeof note === 'string')
    || typeof value.stop_condition !== 'string'
    || typeof value.success_condition !== 'string'
  ) return false

  return value.dose.blocks.every(block => (
    isRecord(block)
    && typeof block.label === 'string'
    && typeof block.minutes === 'number'
    && Array.isArray(block.exercises)
    && block.exercises.every(exercise => (
      isRecord(exercise)
      && typeof exercise.name === 'string'
      && typeof exercise.prescription === 'string'
      && typeof exercise.effort === 'string'
      && typeof exercise.rest === 'string'
      && Array.isArray(exercise.substitutions)
      && exercise.substitutions.every(substitution => typeof substitution === 'string')
      && (exercise.load_guidance === undefined || isLoadGuidance(exercise.load_guidance))
    ))
  ))
}

function isLoadGuidance(value: unknown): boolean {
  return isRecord(value)
    && Array.isArray(value.percentRange)
    && value.percentRange.length === 2
    && value.percentRange.every(item => typeof item === 'number')
    && isRecord(value.loadRange)
    && typeof value.loadRange.min === 'number'
    && typeof value.loadRange.max === 'number'
    && (value.loadRange.unit === 'lb' || value.loadRange.unit === 'kg')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatDate(value: string): string {
  return parseDateString(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
