'use client'

import React, { useState, type FormEvent } from 'react'
import type {
  ActiveCoachProgramSummary,
  CoachPlanProposalDraft,
  CoachPlanningInput,
  CoachStrengthAssessmentSummary,
  StrengthAssessmentInput,
  TrainingWeekday
} from '@/app/lib/coach/types'
import { getLocalDate, parseDateString } from '@/app/lib/timezone-utils'

const FOCUS_OPTIONS: Array<{ value: CoachPlanningInput['primaryDomain']; label: string }> = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Build muscle' },
  { value: 'power_explosiveness', label: 'Power and explosiveness' },
  { value: 'speed_agility', label: 'Speed and agility' },
  { value: 'aerobic', label: 'Aerobic conditioning' },
  { value: 'resilience', label: 'Resilience and movement capacity' }
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
  value: CoachPlanningInput
  onChange: (value: CoachPlanningInput) => void
  onSave: () => void
  saving: boolean
  saved: boolean
}

export function CoachSetupForm({
  value,
  onChange,
  onSave,
  saving,
  saved
}: CoachSetupFormProps) {
  const toggleDay = (day: TrainingWeekday) => {
    const trainingDays = value.trainingDays.includes(day)
      ? value.trainingDays.filter(candidate => candidate !== day)
      : [...value.trainingDays, day]
    onChange({ ...value, trainingDays })
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
          Step 1 · Training intent
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">
          Build your 8-week plan
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Tell the coach what matters and what is realistic. The plan will emphasize intent,
          feel, and stop conditions before extra detail.
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
              primaryDomain: event.target.value as CoachPlanningInput['primaryDomain']
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
              experience: event.target.value as CoachPlanningInput['experience']
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
              sessionMinutes: Number(event.target.value) as CoachPlanningInput['sessionMinutes']
            })}
            className={FIELD_CLASS}
          >
            {[30, 45, 60, 75, 90].map(minutes => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Week one starts
          <input
            type="date"
            aria-label="Week one starts"
            value={value.startDate}
            onChange={event => onChange({ ...value, startDate: event.target.value })}
            className={FIELD_CLASS}
          />
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            Choose a Monday.
          </span>
        </label>
      </div>

      <label className="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
        Available equipment
        <textarea
          aria-label="Available equipment"
          value={value.equipment}
          onChange={event => onChange({ ...value, equipment: event.target.value })}
          rows={2}
          placeholder="Barbell and rack, commercial gym, home dumbbells, track, bike..."
          className={FIELD_CLASS}
        />
      </label>

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

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-6 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {saving ? 'Saving setup…' : saved ? 'Save updated setup' : 'Save coach setup'}
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
  proposal: CoachPlanProposalDraft
  onAccept: () => void
  accepting: boolean
}

export function ProposalPreview({ proposal, onAccept, accepting }: ProposalPreviewProps) {
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/20 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
        Step 2 · Athlete review
      </p>
      <h2 className="mt-2 text-2xl font-bold text-gray-950 dark:text-white">Review your proposal</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {proposal.title} · {formatDate(proposal.startDate)} to {formatDate(proposal.endDate)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {proposal.weeks.map(week => {
          const example = proposal.sessions.find(session => session.weekNumber === week.week)
          return (
            <article key={week.week} className="rounded-xl border border-blue-100 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-gray-950 dark:text-white">Week {week.week}</h3>
                {week.reviewRequired && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {week.week === 4 ? 'Review-led deload' : 'Deload and assess'}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-5 text-gray-700 dark:text-gray-200">{week.intent}</p>
              {example && (
                <div className="mt-4 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <p><span className="font-semibold text-gray-700 dark:text-gray-200">Feel:</span> {example.prescription.effort}</p>
                  <p className="mt-1"><span className="font-semibold text-gray-700 dark:text-gray-200">Stop:</span> {example.prescription.stop_condition}</p>
                </div>
              )}
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
        {accepting ? 'Accepting plan…' : 'Accept this plan'}
      </button>
    </section>
  )
}

export function ActiveProgramView({ program }: { program: ActiveCoachProgramSummary }) {
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

      {program.upcomingSessions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 dark:text-white">Upcoming sessions</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {program.upcomingSessions.slice(0, 6).map(session => (
              <li key={session.id} className="rounded-xl bg-white p-4 dark:bg-gray-900">
                <p className="font-semibold text-gray-900 dark:text-white">
                  Week {session.weekNumber} · Session {session.sessionIndex}
                </p>
                {session.scheduledDate && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(session.scheduledDate)}
                  </p>
                )}
                {typeof session.prescription.intent === 'string' && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                    {session.prescription.intent}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  return parseDateString(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
