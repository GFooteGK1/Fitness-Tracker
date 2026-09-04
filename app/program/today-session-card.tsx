'use client'

import React, { useState, type FormEvent, type ReactNode } from 'react'
import {
  findAssessmentDefinition,
  type MetricUnit
} from '@/app/lib/coach/adaptive-programming-contracts'
import type { AtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import {
  buildTodaySessionCompletion,
  type TodayScheduledMeasurementDraft
} from '@/app/lib/coach/today-session'
import type {
  ActiveCoachProgramSummary,
  CoachScheduledMeasurementSummary
} from '@/app/lib/coach/types'
import type {
  CoachSessionEnergy,
  CoachSessionOutcome,
  CoachSessionPain
} from '@/app/lib/coach/execution-feedback'
import type { CompleteProgrammingSessionPrescription } from '@/app/lib/coach/programming-schema'
import { getLocalDate, parseDateString } from '@/app/lib/timezone-utils'

type ProgramSession = ActiveCoachProgramSummary['upcomingSessions'][number]

interface TodaySessionCardProps {
  session: ProgramSession
  prescription: CompleteProgrammingSessionPrescription
  saving: boolean
  onSubmit: (
    sessionId: string,
    completion: AtomicSessionCompletionInput
  ) => Promise<string | null>
  onEditFailedEntry: (sessionId: string) => void
  onRefreshPlan: () => Promise<void>
  children: ReactNode
}

const FIELD_CLASS = 'mt-2 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'
const CHOICE_CLASS = 'min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40'

export function TodaySessionCard({
  session,
  prescription,
  saving,
  onSubmit,
  onEditFailedEntry,
  onRefreshPlan,
  children
}: TodaySessionCardProps) {
  const [readiness, setReadiness] = useState<number | null>(null)
  const [readinessObservedAt, setReadinessObservedAt] = useState<string | null>(null)
  const [showConstraint, setShowConstraint] = useState(false)
  const [pain, setPain] = useState<CoachSessionPain>('none')
  const [constraint, setConstraint] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [outcome, setOutcome] = useState<CoachSessionOutcome>('as_planned')
  const [confirmedAsPrescribed, setConfirmedAsPrescribed] = useState(false)
  const [sessionRpe, setSessionRpe] = useState('7')
  const [energy, setEnergy] = useState<CoachSessionEnergy>('okay')
  const [actualWorkSummary, setActualWorkSummary] = useState('')
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')
  const [measurements, setMeasurements] = useState<TodayScheduledMeasurementDraft[]>(() => (
    (session.scheduledMeasurements ?? []).map(defaultMeasurementDraft)
  ))
  const [pending, setPending] = useState<AtomicSessionCompletionInput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chooseReadiness = (value: number) => {
    setReadiness(value)
    setReadinessObservedAt(new Date().toISOString())
    if (value <= 2) setShowConstraint(true)
  }
  const readinessIsScheduled = measurements.some(item => (
    item.schedule.assessmentDefinition.id === 'readiness.self_report'
  ))
  const scheduledMeasurements = measurements.filter(item => (
    item.schedule.assessmentDefinition.id !== 'readiness.self_report'
  ))
  const lowReadiness = readiness !== null && readiness <= 2
  const today = getLocalDate()
  const exactDate = session.scheduledDate === today

  const submitPayload = async (payload: AtomicSessionCompletionInput) => {
    setError(null)
    const saveError = await onSubmit(session.id, payload)
    if (saveError) setError(saveError)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (outcome === 'as_planned' && !confirmedAsPrescribed) {
      setError('Confirm that you completed the accepted prescription before saving.')
      return
    }
    const measurementError = validateMeasurementDrafts(measurements)
    if (outcome !== 'skipped' && measurementError) {
      setError(measurementError)
      return
    }

    const occurredAt = new Date().toISOString()
    const combinedNote = [
      constraint.trim() ? `Before session: ${constraint.trim()}` : '',
      note.trim()
    ].filter(Boolean).join(' ') || null
    const validation = buildTodaySessionCompletion({
      sessionId: session.id,
      prescription,
      workoutDate: getLocalDate(),
      outcome,
      sessionRpe: outcome === 'skipped' ? null : Number(sessionRpe),
      energy,
      pain,
      note: combinedNote,
      actualWorkSummary: actualWorkSummary.trim() || null,
      totalDurationMinutes: duration ? Number(duration) : null,
      occurredAt,
      readiness,
      readinessObservedAt,
      measurements
    })

    if (!validation.ok) {
      setError(validation.errors[0] ?? 'Check the session entry and try again.')
      return
    }

    setPending(validation.value)
    await submitPayload(validation.value)
  }

  const editFailedEntry = () => {
    setPending(null)
    setError(null)
    onEditFailedEntry(session.id)
  }

  return (
    <section className="rounded-2xl border-2 border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-gray-900 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            {exactDate
              ? 'Today'
              : session.scheduledDate && session.scheduledDate < today
                ? 'Past-due session'
                : 'Next session'} · Week {session.weekNumber}
          </p>
          <h2 className="mt-2 break-words text-2xl font-bold text-gray-950 dark:text-white">
            {prescription.title}
          </h2>
          {session.scheduledDate && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {formatDate(session.scheduledDate)} · {prescription.scheduledMinutes} min
            </p>
          )}
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Planned
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <IntentCue label="Do" value={prescription.intent} />
        <IntentCue label="Feel" value={sessionFeel(prescription)} />
        <IntentCue label="Stop or modify" value={sessionStop(prescription)} warning />
      </div>

      <section aria-labelledby={`readiness-${session.id}`} className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-gray-950/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id={`readiness-${session.id}`} className="font-semibold text-gray-950 dark:text-white">
              How ready do you feel?
            </h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              One tap. This guides today&apos;s choices but cannot rewrite your plan.
            </p>
          </div>
          {readinessIsScheduled && (
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              Measure today
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1 sm:gap-2" role="group" aria-label="Readiness from 1 through 5">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              aria-label={`Readiness ${value}`}
              aria-pressed={readiness === value}
              disabled={pending !== null || saving}
              onClick={() => chooseReadiness(value)}
              className={`${CHOICE_CLASS} ${readiness === value
                ? 'border-blue-700 bg-blue-700 text-white'
                : 'border-gray-300 bg-white text-gray-800 hover:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'}`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span>Very low</span><span>Ready</span>
        </div>
        {(lowReadiness || pain !== 'none') && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Protect the training target. Use the stop rules and log Modified, Stopped early, or Skipped if quality is not there.
          </p>
        )}
        <button
          type="button"
          disabled={pending !== null || saving}
          onClick={() => setShowConstraint(value => !value)}
          aria-expanded={showConstraint}
          className="mt-3 min-h-11 rounded-xl px-1 text-left text-sm font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-300"
        >
          {showConstraint ? 'Hide pain or constraint' : 'Something changed'}
        </button>
        {showConstraint && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Pain signal
              <select
                aria-label="Pain signal"
                value={pain}
                disabled={pending !== null || saving}
                onChange={event => setPain(event.target.value as CoachSessionPain)}
                className={FIELD_CLASS}
              >
                <option value="none">None</option>
                <option value="mild">Mild</option>
                <option value="concerning">Concerning</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Constraint or change
              <input
                aria-label="Constraint or change"
                type="text"
                maxLength={240}
                value={constraint}
                disabled={pending !== null || saving}
                onChange={event => setConstraint(event.target.value)}
                placeholder="Example: Left knee feels stiff"
                className={FIELD_CLASS}
              />
            </label>
          </div>
        )}
      </section>

      {scheduledMeasurements.length > 0 && (
        <section aria-labelledby={`measure-${session.id}`} className="mt-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <h3 id={`measure-${session.id}`} className="font-semibold text-gray-950 dark:text-white">
            Measure today
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
            Record this only if the standard can be measured without compromising the session.
          </p>
          <div className="mt-3 space-y-4">
            {measurements.map((measurement, index) => (
              measurement.schedule.assessmentDefinition.id === 'readiness.self_report'
                ? null
                : (
                  <MeasurementFields
                    key={measurement.schedule.id}
                    draft={measurement}
                    disabled={pending !== null || saving}
                    onChange={next => setMeasurements(current => (
                      current.map((item, itemIndex) => itemIndex === index ? next : item)
                    ))}
                  />
                )
            ))}
          </div>
        </section>
      )}

      <details className="mt-5 border-t border-gray-200 pt-3 dark:border-gray-700">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700 dark:text-blue-300">
          Full prescription
        </summary>
        <div className="mt-3">{children}</div>
      </details>

      {!finishing ? (
        <button
          type="button"
          onClick={() => setFinishing(true)}
          className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          Finish or skip session
        </button>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
          <fieldset disabled={pending !== null || saving} className="space-y-4 disabled:opacity-70">
            <legend className="font-semibold text-gray-950 dark:text-white">What happened?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ['as_planned', 'As prescribed'],
                ['modified', 'Modified'],
                ['stopped_early', 'Stopped early'],
                ['skipped', 'Skipped']
              ] as Array<[CoachSessionOutcome, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => setOutcome(value)}
                  className={`${CHOICE_CLASS} ${outcome === value
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-gray-300 bg-white text-gray-800 hover:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {outcome === 'as_planned' && (
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                <input
                  aria-label="Confirm completed prescribed work"
                  type="checkbox"
                  checked={confirmedAsPrescribed}
                  onChange={event => setConfirmedAsPrescribed(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span>I completed the accepted prescription. Save it as performed without re-entering the work.</span>
              </label>
            )}

            {(outcome === 'modified' || outcome === 'stopped_early') && (
              <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                What did you actually do?
                <textarea
                  aria-label="Actual work summary"
                  required
                  minLength={3}
                  maxLength={5000}
                  rows={3}
                  value={actualWorkSummary}
                  onChange={event => setActualWorkSummary(event.target.value)}
                  placeholder="Example: Completed the first three sets, then reduced the final set to six reps."
                  className={FIELD_CLASS}
                />
              </label>
            )}

            {outcome !== 'skipped' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                  Session RPE
                  <input
                    aria-label="Session RPE"
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    required
                    value={sessionRpe}
                    onChange={event => setSessionRpe(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </label>
                <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                  Duration in minutes (optional)
                  <input
                    aria-label="Duration in minutes"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    value={duration}
                    onChange={event => setDuration(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </label>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Session energy</p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Session energy">
                {(['low', 'okay', 'high'] as CoachSessionEnergy[]).map(value => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={energy === value}
                    onClick={() => setEnergy(value)}
                    className={`${CHOICE_CLASS} capitalize ${energy === value
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-gray-300 bg-white text-gray-800 hover:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              {outcome === 'skipped' ? 'Why was it skipped? (optional)' : 'Session note (optional)'}
              <textarea
                aria-label="Session note"
                value={note}
                maxLength={240}
                rows={2}
                onChange={event => setNote(event.target.value)}
                className={FIELD_CLASS}
              />
            </label>
          </fieldset>

          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
              <p>{error}</p>
              {pending && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitPayload(pending)}
                    className="min-h-11 rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? 'Retrying…' : 'Retry same entry'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={editFailedEntry}
                    className="min-h-11 rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-800 dark:border-red-800 dark:text-red-200"
                  >
                    Edit entry
                  </button>
                  {error.toLowerCase().includes('active plan changed') && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onRefreshPlan()}
                      className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
                    >
                      Refresh active plan
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!pending && (
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 flex-1 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:flex-none"
              >
                {saving ? 'Saving once…' : outcome === 'skipped' ? 'Save skipped session' : 'Save session once'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setFinishing(false)}
                className="min-h-12 rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  )
}

export function TodayTerminalCard({ session }: { session: ProgramSession }) {
  const completed = session.status === 'completed'
  return (
    <section className={`rounded-2xl border p-5 ${completed
      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
      : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600 dark:text-gray-300">Today</p>
      <h2 className="mt-2 text-xl font-bold text-gray-950 dark:text-white">
        {completed ? 'Session saved' : 'Session skipped'}
      </h2>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
        {completed
          ? 'The session result is terminal. Retrying cannot create a duplicate workout.'
          : 'No workout or performed-session observation was created.'}
      </p>
      {completed && session.completedWorkoutId && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-gray-900">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Canonical workout linked</p>
          <p className="mt-1 break-all font-mono text-xs text-gray-600 dark:text-gray-300">
            {session.completedWorkoutId}
          </p>
          <a href="/dashboard" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline dark:text-blue-300">
            View training history
          </a>
        </div>
      )}
    </section>
  )
}

export function selectTodaySession(program: ActiveCoachProgramSummary): ProgramSession | null {
  const today = getLocalDate()
  const exactPlanned = program.upcomingSessions.find(session => (
    session.status === 'planned' && session.scheduledDate === today
  ))
  if (exactPlanned) return exactPlanned

  const currentWeekPlanned = program.upcomingSessions.find(session => (
    session.status === 'planned'
    && (program.currentWeek === null || session.weekNumber === program.currentWeek)
  ))
  if (currentWeekPlanned) return currentWeekPlanned

  const nextPlanned = program.upcomingSessions.find(session => session.status === 'planned')
  if (nextPlanned) return nextPlanned

  const currentWeekTerminal = program.upcomingSessions
    .filter(session => (
      session.status !== 'planned'
      && (program.currentWeek === null || session.weekNumber === program.currentWeek)
    ))
    .sort((left, right) => right.sessionIndex - left.sessionIndex)[0]
  if (currentWeekTerminal) return currentWeekTerminal

  return program.upcomingSessions.find(session => session.scheduledDate === today) ?? null
}

function MeasurementFields({
  draft,
  disabled,
  onChange
}: {
  draft: TodayScheduledMeasurementDraft
  disabled: boolean
  onChange: (draft: TodayScheduledMeasurementDraft) => void
}) {
  const definition = findAssessmentDefinition(
    draft.schedule.assessmentDefinition.id,
    draft.schedule.assessmentDefinition.version
  )
  if (!definition) return null

  return (
    <fieldset className="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-gray-900">
      <legend className="px-1 text-sm font-semibold text-gray-950 dark:text-white">{definition.name}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {metricLabel(definition.id)} (optional)
          <input
            aria-label={metricLabel(definition.id)}
            type="number"
            min="0"
            step="any"
            value={draft.value ?? ''}
            disabled={disabled}
            onChange={event => onChange({
              ...draft,
              value: event.target.value === '' ? null : Number(event.target.value)
            })}
            className={FIELD_CLASS}
          />
        </label>
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Unit
          <select
            aria-label={`${metricLabel(definition.id)} unit`}
            value={draft.unit}
            disabled={disabled}
            onChange={event => onChange({ ...draft, unit: event.target.value as MetricUnit })}
            className={FIELD_CLASS}
          >
            {definition.allowedUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
      </div>

      {definition.id === 'strength.repetition_max' && (
        <label className="mt-3 block text-sm font-medium text-gray-800 dark:text-gray-200">
          Repetitions
          <select
            aria-label="Repetition maximum repetitions"
            value={draft.repetitions ?? 3}
            disabled={disabled}
            onChange={event => onChange({ ...draft, repetitions: Number(event.target.value) })}
            className={FIELD_CLASS}
          >
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
          </select>
        </label>
      )}

      {definition.id === 'strength.repetition_capacity' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Fixed load
            <input
              aria-label="Fixed load"
              type="number"
              min="0"
              step="any"
              value={draft.externalLoadValue ?? ''}
              disabled={disabled}
              onChange={event => onChange({
                ...draft,
                externalLoadValue: event.target.value === '' ? null : Number(event.target.value)
              })}
              className={FIELD_CLASS}
            />
          </label>
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Load unit
            <select
              aria-label="Fixed load unit"
              value={draft.externalLoadUnit}
              disabled={disabled}
              onChange={event => onChange({
                ...draft,
                externalLoadUnit: event.target.value as 'lb' | 'kg'
              })}
              className={FIELD_CLASS}
            >
              <option value="lb">lb</option><option value="kg">kg</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200 sm:col-span-2">
            Standard set window in seconds
            <input
              aria-label="Repetition capacity duration"
              type="number"
              min="1"
              step="1"
              value={draft.durationValue ?? ''}
              disabled={disabled}
              onChange={event => onChange({
                ...draft,
                durationValue: event.target.value === '' ? null : Number(event.target.value)
              })}
              className={FIELD_CLASS}
            />
          </label>
        </div>
      )}

      {(definition.id === 'sprint.time' || definition.id === 'run.time_trial') && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Distance
            <input
              aria-label={`${definition.name} distance`}
              type="number"
              min="0"
              step="any"
              value={draft.distanceValue ?? ''}
              disabled={disabled}
              onChange={event => onChange({
                ...draft,
                distanceValue: event.target.value === '' ? null : Number(event.target.value)
              })}
              className={FIELD_CLASS}
            />
          </label>
          <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Distance unit
            <select
              aria-label={`${definition.name} distance unit`}
              value={draft.distanceUnit}
              disabled={disabled}
              onChange={event => onChange({
                ...draft,
                distanceUnit: event.target.value as 'm' | 'km' | 'mi'
              })}
              className={FIELD_CLASS}
            >
              <option value="m">m</option><option value="km">km</option><option value="mi">mi</option>
            </select>
          </label>
        </div>
      )}
    </fieldset>
  )
}

function IntentCue({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${warning
      ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
      : 'bg-gray-50 text-gray-900 dark:bg-gray-950/50 dark:text-gray-100'}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-sm leading-5">{value}</p>
    </div>
  )
}

function defaultMeasurementDraft(
  schedule: CoachScheduledMeasurementSummary
): TodayScheduledMeasurementDraft {
  const definition = findAssessmentDefinition(
    schedule.assessmentDefinition.id,
    schedule.assessmentDefinition.version
  )
  const unit = definition?.id === 'strength.repetition_capacity'
    ? 'repetitions'
    : definition?.id === 'strength.repetition_max'
      ? 'lb'
    : definition?.id === 'jump.height'
      ? 'in'
      : definition?.id === 'run.time_trial'
        ? 'min'
        : definition?.id === 'sprint.time'
          ? 's'
          : definition?.allowedUnits[0] ?? 'score'

  return {
    schedule,
    value: null,
    unit,
    repetitions: definition?.id === 'strength.repetition_max' ? 3 : null,
    externalLoadValue: null,
    externalLoadUnit: 'lb',
    distanceValue: null,
    distanceUnit: definition?.id === 'run.time_trial' ? 'km' : 'm',
    durationValue: null,
    durationUnit: 's'
  }
}

function validateMeasurementDrafts(measurements: readonly TodayScheduledMeasurementDraft[]): string | null {
  for (const measurement of measurements) {
    if (measurement.value === null) continue
    const id = measurement.schedule.assessmentDefinition.id
    if (id === 'strength.repetition_capacity'
      && (measurement.externalLoadValue === null || measurement.durationValue === null)
    ) {
      return 'Enter the fixed load and standard set window for the repetition-capacity measure.'
    }
    if ((id === 'sprint.time' || id === 'run.time_trial') && measurement.distanceValue === null) {
      return 'Enter the standardized distance for the timed measure.'
    }
  }
  return null
}

function metricLabel(assessmentId: string): string {
  if (assessmentId === 'strength.repetition_max') return 'Completed load'
  if (assessmentId === 'strength.repetition_capacity') return 'Completed repetitions'
  if (assessmentId === 'jump.height') return 'Jump height'
  if (assessmentId === 'sprint.time') return 'Sprint time'
  if (assessmentId === 'run.time_trial') return 'Time-trial time'
  return 'Measurement'
}

function sessionFeel(prescription: CompleteProgrammingSessionPrescription): string {
  const targets = prescription.blocks.flatMap(block => (
    block.exercises.map(exercise => exercise.executionTarget.kind === 'rir'
        ? `${formatRange(exercise.executionTarget.range)} reps in reserve`
        : exercise.executionTarget.kind === 'rpe'
          ? `RPE ${formatRange(exercise.executionTarget.range)}`
          : exercise.executionTarget.cue)
  ))
  return [...new Set(targets)].slice(0, 2).join(' · ') || 'Controlled and repeatable'
}

function sessionStop(prescription: CompleteProgrammingSessionPrescription): string {
  const rules = prescription.blocks.flatMap(block => block.exercises.map(exercise => exercise.stopCondition))
  return [...new Set(rules)].slice(0, 2).join(' ') || 'Stop when technique or output materially changes.'
}

function formatRange(range: { min: number; max: number }): string {
  return range.min === range.max ? String(range.min) : `${range.min}-${range.max}`
}

function formatDate(value: string): string {
  return parseDateString(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
