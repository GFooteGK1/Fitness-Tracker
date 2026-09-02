'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import type {
  CoachRuntimeContext,
  CoachStrengthAssessmentSummary,
  StrengthAssessmentInput
} from '@/app/lib/coach/types'
import type { CompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import type { CompleteProgrammingPlanDraft } from '@/app/lib/coach/complete-program'
import type { AtomicSessionCompletionInput } from '@/app/lib/coach/session-completion'
import {
  MOVEMENT_EQUIPMENT_IDS,
  type MovementEquipmentId
} from '@/app/lib/coach/movement-catalog'
import {
  ActiveProgramView,
  CoachSetupForm,
  ProposalPreview,
  StrengthAssessmentPanel
} from './coach-program-components'
import { CoachTrustCenter } from './coach-trust-center'

interface ProposalResponse {
  proposalId: string
  idempotencyKey: string
  proposal: CompleteProgrammingPlanDraft
}

const INITIAL_PLANNING_INPUT: CompleteCoachPlanningInput = {
  format: 'complete_programming_intake_v0_3',
  primaryDomain: 'strength',
  goal: '',
  experience: 'consistent',
  trainingDays: ['monday', 'wednesday', 'friday'],
  sessionMinutes: 60,
  equipment: 'Bodyweight',
  resolvedEquipmentIds: ['bodyweight'],
  constraints: '',
  constraintKinds: [],
  secondaryGoals: [],
  startDate: ''
}

export default function ProgramPage() {
  const [context, setContext] = useState<CoachRuntimeContext | null>(null)
  const [planningInput, setPlanningInput] = useState<CompleteCoachPlanningInput>(INITIAL_PLANNING_INPUT)
  const [proposal, setProposal] = useState<ProposalResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSetup, setSavingSetup] = useState(false)
  const [setupSaved, setSetupSaved] = useState(false)
  const [creatingProposal, setCreatingProposal] = useState(false)
  const [acceptingProposal, setAcceptingProposal] = useState(false)
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null)
  const [replacingPlan, setReplacingPlan] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intakeKey = useRef<string | null>(null)
  const proposalKey = useRef<string | null>(null)
  const assessmentKey = useRef<string | null>(null)
  const sessionResultKeys = useRef(new Map<string, string>())

  const loadCoachState = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/coach')
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Coach state unavailable'))
      const nextContext = body.context as CoachRuntimeContext
      setContext(nextContext)
      setPlanningInput(current => hydratePlanningInput(current, nextContext))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coach state unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPlanningInput(current => current.startDate
      ? current
      : { ...current, startDate: nextMonday() })
    void loadCoachState()
  }, [loadCoachState])

  const updatePlanningInput = (next: CompleteCoachPlanningInput) => {
    setPlanningInput(next)
    setSetupSaved(false)
    setProposal(null)
    setStatus(null)
    setError(null)
    intakeKey.current = null
    proposalKey.current = null
  }

  const saveSetup = async () => {
    setSavingSetup(true)
    setStatus(null)
    setError(null)
    intakeKey.current ??= createIdempotencyKey('coach-intake')

    try {
      const response = await fetch('/api/coach/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningInput,
          idempotencyKey: intakeKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to save coach setup'))

      setSetupSaved(true)
      setStatus('Coach setup saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save coach setup')
    } finally {
      setSavingSetup(false)
    }
  }

  const saveAssessment = async (input: StrengthAssessmentInput): Promise<string | null> => {
    assessmentKey.current ??= createIdempotencyKey('coach-assessment')
    try {
      const response = await fetch('/api/coach/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment: input,
          idempotencyKey: assessmentKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) return errorMessage(body, 'Unable to save baseline')

      const assessment = body.assessment as CoachStrengthAssessmentSummary
      setContext(current => current ? {
        ...current,
        assessments: [
          assessment,
          ...current.assessments.filter(existing => existing.id !== assessment.id)
        ]
      } : current)
      assessmentKey.current = null
      return null
    } catch {
      return 'Unable to save baseline'
    }
  }

  const createProposal = async () => {
    setCreatingProposal(true)
    setStatus(null)
    setError(null)
    proposalKey.current ??= createIdempotencyKey('coach-proposal')

    try {
      const response = await fetch('/api/coach/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planningInput,
          idempotencyKey: proposalKey.current
        })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to create proposal'))

      setProposal(body as ProposalResponse)
      setStatus('Proposal ready for your review.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create proposal')
    } finally {
      setCreatingProposal(false)
    }
  }

  const acceptProposal = async () => {
    if (!proposal) return
    setAcceptingProposal(true)
    setStatus(null)
    setError(null)

    try {
      const response = await fetch(`/api/coach/proposals/${proposal.proposalId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: proposal.idempotencyKey })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to accept proposal'))

      setContext(body.context as CoachRuntimeContext)
      setProposal(null)
      setReplacingPlan(false)
      proposalKey.current = null
      setStatus('Plan accepted.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to accept proposal')
    } finally {
      setAcceptingProposal(false)
    }
  }

  const recordSessionResult = async (
    sessionId: string,
    completion: AtomicSessionCompletionInput
  ): Promise<string | null> => {
    setSavingSessionId(sessionId)
    setStatus(null)
    setError(null)
    const idempotencyKey = sessionResultKeys.current.get(sessionId)
      ?? createIdempotencyKey('coach-session')
    sessionResultKeys.current.set(sessionId, idempotencyKey)

    try {
      const response = await fetch(`/api/coach/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, ...completion })
      })
      const body = await response.json()
      if (!response.ok) return errorMessage(body, 'Unable to save session result')

      setContext(body.context as CoachRuntimeContext)
      sessionResultKeys.current.delete(sessionId)
      const workoutId = typeof body.result?.workout_id === 'string'
        ? body.result.workout_id
        : null
      setStatus(workoutId
        ? `Session saved once. Canonical workout ${workoutId} is linked.`
        : 'Skipped session saved. No workout was created.')
      return null
    } catch {
      return typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. Your entry is still here. Retry will reuse the same save key.'
        : 'The save response was interrupted. Your entry is still here. Retry will reuse the same save key.'
    } finally {
      setSavingSessionId(null)
    }
  }

  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-6xl space-y-5 pb-10">
        <header className="rounded-2xl bg-gradient-to-br from-gray-950 to-blue-950 p-5 text-white shadow-sm sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Socius coach</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Your training plan, built with you</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
            This is the durable plan home. Use Socius to discuss and understand the work;
            only a plan you review and accept becomes active here.
          </p>
        </header>

        {status && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {status}
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <p>{error}</p>
            {loading === false && context === null && (
              <button type="button" onClick={() => void loadCoachState()} className="mt-2 font-semibold underline">
                Try again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Loading coach state…
          </div>
        ) : context && !context.storageAvailable ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
            <h2 className="text-lg font-bold text-amber-950 dark:text-amber-100">Coach setup is not available yet</h2>
            <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
              The private coach storage contract must be available before plans or baselines can be saved.
            </p>
          </section>
        ) : context ? (
          <>
            <CoachTrustCenter onPlanChanged={loadCoachState} />

            {context.activeProgram && (
              <ActiveProgramView
                program={context.activeProgram}
                onRecordSessionResult={recordSessionResult}
                onEditFailedSessionResult={sessionId => sessionResultKeys.current.delete(sessionId)}
                onRefreshPlan={loadCoachState}
                savingSessionId={savingSessionId}
              />
            )}

            {context.activeProgram && !replacingPlan && (
              <div className="flex flex-wrap gap-3">
                <a
                  href="/coach"
                  className="inline-flex min-h-11 items-center rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  Discuss this plan with Coach
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setReplacingPlan(true)
                    setSetupSaved(false)
                    setProposal(null)
                    setStatus(null)
                    setError(null)
                    proposalKey.current = null
                  }}
                  className="min-h-11 rounded-xl border border-blue-600 bg-white px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  Build a replacement proposal
                </button>
              </div>
            )}

            {(!context.activeProgram || replacingPlan) && (
              <>
                {context.activeProgram && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingPlan(false)
                      setProposal(null)
                      setSetupSaved(false)
                      proposalKey.current = null
                    }}
                    className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    Keep current plan
                  </button>
                )}

                <CoachSetupForm
                  value={planningInput}
                  onChange={updatePlanningInput}
                  onSave={() => void saveSetup()}
                  saving={savingSetup}
                  saved={setupSaved}
                />

                <StrengthAssessmentPanel
                  assessments={context.assessments}
                  onSubmit={saveAssessment}
                />

                {setupSaved && !proposal && (
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
                    <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                      Your confirmed setup and any known baselines will be attached to the proposal snapshot.
                      No plan becomes active until you review and accept it.
                    </p>
                    <button
                      type="button"
                      onClick={() => void createProposal()}
                      disabled={creatingProposal}
                      className="mt-4 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
                    >
                      {creatingProposal
                        ? 'Creating proposal…'
                        : context.activeProgram ? 'Create replacement proposal' : 'Create 8-week proposal'}
                    </button>
                  </section>
                )}

                {proposal && (
                  <ProposalPreview
                    proposal={proposal.proposal}
                    onAccept={() => void acceptProposal()}
                    accepting={acceptingProposal}
                    replacement={Boolean(context.activeProgram)}
                  />
                )}
              </>
            )}

            {context.activeProgram && !replacingPlan && (
              <StrengthAssessmentPanel
                assessments={context.assessments}
                onSubmit={saveAssessment}
              />
            )}
          </>
        ) : null}
      </main>
    </ProtectedRoute>
  )
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

  return {
    ...current,
    primaryDomain: isProgramDomain(goal?.primaryDomain) ? goal.primaryDomain : current.primaryDomain,
    goal: typeof goal?.goal === 'string' ? goal.goal : current.goal,
    secondaryGoals: isSecondaryGoals(goal?.secondaryGoals) ? goal.secondaryGoals : current.secondaryGoals,
    experience: isExperience(schedule?.experience) ? schedule.experience : current.experience,
    trainingDays: isTrainingDays(schedule?.trainingDays) ? schedule.trainingDays : current.trainingDays,
    sessionMinutes: isSessionMinutes(schedule?.sessionMinutes) ? schedule.sessionMinutes : current.sessionMinutes,
    equipment: typeof equipment?.equipment === 'string' ? equipment.equipment : current.equipment,
    resolvedEquipmentIds: isEquipmentIds(equipment?.resolvedEquipmentIds)
      ? equipment.resolvedEquipmentIds
      : current.resolvedEquipmentIds,
    constraints: typeof constraints?.constraints === 'string' ? constraints.constraints : current.constraints,
    constraintKinds: isConstraintKinds(constraints?.constraintKinds)
      ? constraints.constraintKinds
      : current.constraintKinds,
    startDate: current.startDate || nextMonday()
  }
}

function isProgramDomain(value: unknown): value is CompleteCoachPlanningInput['primaryDomain'] {
  return ['strength', 'hypertrophy', 'power_explosiveness', 'speed_agility', 'aerobic', 'resilience']
    .includes(String(value))
}

function isExperience(value: unknown): value is CompleteCoachPlanningInput['experience'] {
  return ['new_or_returning', 'consistent', 'experienced'].includes(String(value))
}

function isTrainingDays(value: unknown): value is CompleteCoachPlanningInput['trainingDays'] {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= 6
    && value.every(item => typeof item === 'string' && days.includes(item))
}

function isSessionMinutes(value: unknown): value is CompleteCoachPlanningInput['sessionMinutes'] {
  return [30, 45, 60, 75, 90].includes(Number(value))
}

function isEquipmentIds(value: unknown): value is MovementEquipmentId[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every(item => MOVEMENT_EQUIPMENT_IDS.includes(item as MovementEquipmentId))
}

function isConstraintKinds(
  value: unknown
): value is CompleteCoachPlanningInput['constraintKinds'] {
  return Array.isArray(value)
    && value.every(item => item === 'no_overhead' || item === 'no_running')
}

function isSecondaryGoals(
  value: unknown
): value is CompleteCoachPlanningInput['secondaryGoals'] {
  return Array.isArray(value)
    && value.length <= 2
    && value.every(item => (
      typeof item === 'object'
      && item !== null
      && !Array.isArray(item)
      && 'domain' in item
      && isProgramDomain(item.domain)
      && 'allocation' in item
      && (item.allocation === 'development' || item.allocation === 'maintenance')
      && 'athleteIntent' in item
      && typeof item.athleteIntent === 'string'
    ))
}

function nextMonday(): string {
  const date = new Date()
  const weekday = date.getDay()
  const daysAhead = weekday === 1 ? 7 : (8 - weekday) % 7
  date.setDate(date.getDate() + daysAhead)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
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
