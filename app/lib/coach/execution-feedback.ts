export type CoachSessionOutcome =
  | 'as_planned'
  | 'modified'
  | 'stopped_early'
  | 'skipped'

export type CoachSessionEnergy = 'low' | 'okay' | 'high'
export type CoachSessionPain = 'none' | 'mild' | 'concerning'

export type FeedbackField = 'sessionRpe' | 'energy' | 'pain'
export interface FeedbackFieldProvenance {
  origin: 'athlete_reported' | 'unknown' | 'legacy_unknown'
  reviewState: 'athlete_confirmed' | 'unreviewed'
}
export type FeedbackProvenance = Record<FeedbackField, FeedbackFieldProvenance>

export interface CoachSessionCheckinInput {
  feedbackVersion?: 1 | 2
  provenance?: FeedbackProvenance
  outcome: CoachSessionOutcome
  sessionRpe: number | null
  energy: CoachSessionEnergy | null
  pain: CoachSessionPain | null
  note: string | null
  occurredAt: string
}

export interface CoachSessionCheckinSummary extends CoachSessionCheckinInput {
  id: string
  prescribedSessionId: string
}

export interface CoachExecutionSession {
  id: string
  weekNumber: number
  sessionIndex: number
  scheduledDate: string | null
  status: 'planned' | 'completed' | 'skipped'
}

export type CoachAdaptationAction =
  | 'continue_as_written'
  | 'hold_and_review'
  | 'reduce_next_week_stress'
  | 'pause_and_seek_support'

export interface CoachAdaptationProposalPreview {
  status: 'preview'
  action: CoachAdaptationAction
  title: string
  rationale: string
  proposedChanges: string[]
  requiresAcceptance: boolean
  numericChangeStatus: 'not_needed' | 'not_generated'
}

export interface CoachWeeklyReview {
  weekNumber: number
  status: 'not_started' | 'in_progress' | 'ready'
  checkpointReviewRequired: boolean
  plannedSessions: number
  completedSessions: number
  skippedSessions: number
  completionRate: number
  checkinCount: number
  averageSessionRpe: number | null
  explicitRpeCount?: number
  eligibleCompletionCount?: number
  signals: string[]
  adaptationProposal: CoachAdaptationProposalPreview | null
}

type CheckinValidation =
  | { ok: true; value: CoachSessionCheckinInput }
  | { ok: false; errors: string[] }

export function validateCoachSessionCheckinInput(value: unknown): CheckinValidation {
  if (!isRecord(value)) return { ok: false, errors: ['Session check-in must be an object'] }

  if (value.feedbackVersion === 2) return validateV2Checkin(value)
  if ((value.feedbackVersion !== undefined && value.feedbackVersion !== 1)
    || (value.schemaVersion !== undefined && value.schemaVersion !== 1)) {
    return { ok: false, errors: ['Session feedback version is unsupported or conflicting'] }
  }

  const errors: string[] = []
  const outcome = isSessionOutcome(value.outcome) ? value.outcome : null
  const energy = isSessionEnergy(value.energy) ? value.energy : null
  const pain = isSessionPain(value.pain) ? value.pain : null
  const sessionRpe = value.sessionRpe === null || value.sessionRpe === undefined
    ? null
    : typeof value.sessionRpe === 'number' && Number.isFinite(value.sessionRpe)
      ? value.sessionRpe
      : Number.NaN
  const note = typeof value.note === 'string'
    ? value.note.trim() || null
    : value.note === null || value.note === undefined
      ? null
      : undefined
  const occurredAt = typeof value.occurredAt === 'string' ? value.occurredAt : ''

  if (!outcome) errors.push('Choose how the session went')
  if (!energy) errors.push('Choose your session energy')
  if (!pain) errors.push('Choose a pain signal')

  if (outcome === 'skipped') {
    if (sessionRpe !== null) errors.push('Skipped sessions cannot include session RPE')
  } else if (
    sessionRpe === null
    || !Number.isFinite(sessionRpe)
    || sessionRpe < 1
    || sessionRpe > 10
    || !Number.isInteger(sessionRpe * 2)
  ) {
    errors.push('Session RPE must be from 1 through 10 in half-point steps')
  }

  if (note === undefined) errors.push('Session note must be text')
  if (typeof note === 'string' && note.length > 500) {
    errors.push('Session note must be 500 characters or fewer')
  }
  if (!isIsoTimestamp(occurredAt)) errors.push('Completion time must be an ISO timestamp')

  if (errors.length > 0 || !outcome || !energy || !pain || note === undefined) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: { outcome, sessionRpe, energy, pain, note, occurredAt }
  }
}

export function validateStoredCoachSessionCheckin(
  responses: unknown,
  occurredAt: unknown,
  checkinId?: string
): CheckinValidation {
  const parsedOccurredAt = typeof occurredAt === 'string'
    ? new Date(occurredAt)
    : null
  const normalizedOccurredAt = parsedOccurredAt && !Number.isNaN(parsedOccurredAt.getTime())
    ? parsedOccurredAt.toISOString()
    : ''

  if (!isRecord(responses)) return { ok: false, errors: ['Stored feedback must be an object'] }
  if (responses.schemaVersion === 2 && responses.feedbackVersion !== 2) {
    return { ok: false, errors: ['Stored feedback version is conflicting'] }
  }
  const validation = validateCoachSessionCheckinInput({
    ...responses,
    occurredAt: normalizedOccurredAt
  })
  if (!validation.ok) return validation
  if (responses.schemaVersion === 2) {
    if (!sameProvenance(responses.provenance, reportedFeedbackProvenance(validation.value))) {
      return { ok: false, errors: ['Stored feedback field provenance is missing or invalid'] }
    }
    const binding = isRecord(responses.feedbackProvenance) ? responses.feedbackProvenance : {}
    if (!checkinId || binding.checkinId !== checkinId || binding.revision !== 1) {
      return { ok: false, errors: ['Stored feedback provenance does not match its check-in'] }
    }
    return validation
  }
  return { ok: true, value: { ...validation.value, feedbackVersion: 1,
    provenance: legacyFeedbackProvenance() } }
}

export function hasExplicitFeedback(checkin: CoachSessionCheckinInput, field: FeedbackField): boolean {
  return checkin.feedbackVersion === 2 && checkin[field] !== null
    && checkin.provenance?.[field].origin === 'athlete_reported'
    && checkin.provenance?.[field].reviewState === 'athlete_confirmed'
}

export function reportedFeedbackProvenance(values: Pick<CoachSessionCheckinInput, FeedbackField>): FeedbackProvenance {
  const field = (value: unknown): FeedbackFieldProvenance => value === null || value === undefined
    ? { origin: 'unknown', reviewState: 'unreviewed' }
    : { origin: 'athlete_reported', reviewState: 'athlete_confirmed' }
  return { sessionRpe: field(values.sessionRpe), energy: field(values.energy), pain: field(values.pain) }
}

function legacyFeedbackProvenance(): FeedbackProvenance {
  return {
    sessionRpe: { origin: 'legacy_unknown', reviewState: 'unreviewed' },
    energy: { origin: 'legacy_unknown', reviewState: 'unreviewed' },
    pain: { origin: 'legacy_unknown', reviewState: 'unreviewed' }
  }
}

function validateV2Checkin(value: Record<string, unknown>): CheckinValidation {
  const errors: string[] = []
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2) errors.push('Session feedback version is conflicting')
  const outcome = isSessionOutcome(value.outcome) ? value.outcome : null
  const sessionRpe = value.sessionRpe === null || value.sessionRpe === undefined ? null : value.sessionRpe
  const energy = value.energy === null || value.energy === undefined ? null : value.energy
  const pain = value.pain === null || value.pain === undefined ? null : value.pain
  const note = value.note === null || value.note === undefined ? null
    : typeof value.note === 'string' ? value.note.trim() || null : undefined
  const occurredAt = typeof value.occurredAt === 'string' ? value.occurredAt : ''
  if (!outcome) errors.push('Choose how the session went')
  if (sessionRpe !== null && (typeof sessionRpe !== 'number' || !Number.isFinite(sessionRpe)
    || sessionRpe < 1 || sessionRpe > 10 || !Number.isInteger(sessionRpe * 2))) errors.push('Session RPE must be from 1 through 10 in half-point steps')
  if (outcome === 'skipped' && sessionRpe !== null) errors.push('Skipped sessions cannot include session RPE')
  if (energy !== null && !isSessionEnergy(energy)) errors.push('Choose a valid session energy or leave it unanswered')
  if (pain !== null && !isSessionPain(pain)) errors.push('Choose a valid pain signal or leave it unanswered')
  if (note === undefined || (note !== null && note.length > 500)) errors.push('Session note must be text of 500 characters or fewer')
  if (!isIsoTimestamp(occurredAt)) errors.push('Completion time must be an ISO timestamp')
  if (errors.length || !outcome) return { ok: false, errors }
  const result: CoachSessionCheckinInput = {
    feedbackVersion: 2, outcome, sessionRpe: sessionRpe as number | null,
    energy: energy as CoachSessionEnergy | null, pain: pain as CoachSessionPain | null,
    note: note ?? null, occurredAt
  }
  result.provenance = reportedFeedbackProvenance(result)
  if (value.provenance !== undefined && !sameProvenance(value.provenance, result.provenance)) {
    return { ok: false, errors: ['Feedback provenance must match the supplied reports'] }
  }
  return { ok: true, value: result }
}

function sameProvenance(value: unknown, expected: FeedbackProvenance): boolean {
  if (!isRecord(value) || Object.keys(value).length !== 3) return false
  return (['sessionRpe', 'energy', 'pain'] as const).every(key => {
    const field = value[key]
    return isRecord(field) && Object.keys(field).length === 2
      && field.origin === expected[key].origin && field.reviewState === expected[key].reviewState
  })
}

export function buildCoachWeeklyReview({
  weekNumber,
  reviewRequired,
  sessions,
  checkins
}: {
  weekNumber: number
  reviewRequired: boolean
  sessions: readonly CoachExecutionSession[]
  checkins: readonly CoachSessionCheckinSummary[]
}): CoachWeeklyReview {
  const weekSessions = sessions.filter(session => session.weekNumber === weekNumber)
  const sessionIds = new Set(weekSessions.map(session => session.id))
  const weekCheckins = latestCheckins(checkins.filter(checkin => (
    sessionIds.has(checkin.prescribedSessionId)
  )))
  const completedSessions = weekSessions.filter(session => session.status === 'completed').length
  const skippedSessions = weekSessions.filter(session => session.status === 'skipped').length
  const terminalSessions = completedSessions + skippedSessions
  const plannedSessions = weekSessions.length
  const status: CoachWeeklyReview['status'] = terminalSessions === 0
    ? 'not_started'
    : terminalSessions < plannedSessions
      ? 'in_progress'
      : 'ready'
  const completedRpes = weekCheckins
    .filter(checkin => checkin.outcome !== 'skipped' && hasExplicitFeedback(checkin, 'sessionRpe'))
    .map(checkin => checkin.sessionRpe as number)
  const averageSessionRpe = completedRpes.length > 0
    ? roundToHalf(completedRpes.reduce((sum, value) => sum + value, 0) / completedRpes.length)
    : null
  const completionRate = plannedSessions === 0
    ? 0
    : roundToHundredth(completedSessions / plannedSessions)
  const signals = buildSignals({
    completedSessions,
    skippedSessions,
    plannedSessions,
    averageSessionRpe,
    checkins: weekCheckins
  })

  return {
    weekNumber,
    status,
    checkpointReviewRequired: reviewRequired,
    plannedSessions,
    completedSessions,
    skippedSessions,
    completionRate,
    checkinCount: weekCheckins.length,
    averageSessionRpe,
    explicitRpeCount: completedRpes.length,
    eligibleCompletionCount: completedSessions,
    signals,
    adaptationProposal: status === 'ready'
      ? buildAdaptationProposal({
        completionRate,
        terminalSessions,
        checkins: weekCheckins,
        averageSessionRpe,
        reviewRequired
      })
      : null
  }
}

function buildSignals({
  completedSessions,
  skippedSessions,
  plannedSessions,
  averageSessionRpe,
  checkins
}: {
  completedSessions: number
  skippedSessions: number
  plannedSessions: number
  averageSessionRpe: number | null
  checkins: readonly CoachSessionCheckinSummary[]
}): string[] {
  const signals = [
    `${completedSessions} of ${plannedSessions} sessions completed`
  ]
  if (skippedSessions > 0) signals.push(`${skippedSessions} session${skippedSessions === 1 ? '' : 's'} skipped`)
  if (averageSessionRpe !== null) signals.push(`Average session RPE ${averageSessionRpe}`)

  const modified = checkins.filter(checkin => checkin.outcome === 'modified').length
  const stoppedEarly = checkins.filter(checkin => checkin.outcome === 'stopped_early').length
  const lowEnergy = checkins.filter(checkin => checkin.energy === 'low' && hasExplicitFeedback(checkin, 'energy')).length
  const painSignals = checkins.filter(checkin => checkin.pain === 'concerning'
    || (checkin.pain === 'mild' && hasExplicitFeedback(checkin, 'pain'))).length
  if (modified > 0) signals.push(`${modified} session${modified === 1 ? '' : 's'} modified`)
  if (stoppedEarly > 0) signals.push(`${stoppedEarly} session${stoppedEarly === 1 ? '' : 's'} stopped early`)
  if (lowEnergy > 0) signals.push(`Low energy reported ${lowEnergy} time${lowEnergy === 1 ? '' : 's'}`)
  if (painSignals > 0) signals.push(`Pain signal reported ${painSignals} time${painSignals === 1 ? '' : 's'}`)
  return signals
}

function buildAdaptationProposal({
  completionRate,
  terminalSessions,
  checkins,
  averageSessionRpe,
  reviewRequired
}: {
  completionRate: number
  terminalSessions: number
  checkins: readonly CoachSessionCheckinSummary[]
  averageSessionRpe: number | null
  reviewRequired: boolean
}): CoachAdaptationProposalPreview {
  if (checkins.length < terminalSessions && !checkins.some(checkin => checkin.pain === 'concerning')) {
    return {
      status: 'preview',
      action: 'hold_and_review',
      title: 'Complete the missing check-in before changing the plan',
      rationale: 'The app has a terminal session result without enough athlete feedback to explain it.',
      proposedChanges: ['Keep the accepted plan unchanged until the missing feedback is reviewed.'],
      requiresAcceptance: false,
      numericChangeStatus: 'not_generated'
    }
  }

  if (checkins.some(checkin => checkin.pain === 'concerning')) {
    return {
      status: 'preview',
      action: 'pause_and_seek_support',
      title: 'Pause and review the concerning pain signal',
      rationale: 'The coach does not diagnose pain or program around a concerning signal. Stop the provoking work and consult a qualified professional when appropriate.',
      proposedChanges: [
        'Do not silently change the accepted plan.',
        'Review the symptom and obtain qualified support before resuming provoking work.'
      ],
      requiresAcceptance: false,
      numericChangeStatus: 'not_generated'
    }
  }

  const stoppedEarly = checkins.filter(checkin => checkin.outcome === 'stopped_early').length
  const lowEnergy = checkins.filter(checkin => checkin.energy === 'low' && hasExplicitFeedback(checkin, 'energy')).length
  if (
    completionRate < 0.67
    || stoppedEarly >= 1
    || lowEnergy >= 2
    || (averageSessionRpe !== null && averageSessionRpe >= 9)
  ) {
    return {
      status: 'preview',
      action: 'reduce_next_week_stress',
      title: 'Review a lower-stress next week',
      rationale: 'Completion, effort, or energy signals suggest the current training cost was too high to progress automatically.',
      proposedChanges: [
        'Keep the goal and movement intent stable.',
        'Choose one stressor to reduce: volume, intensity, impact, complexity, or density.',
        'Build and accept a replacement proposal before changing future sessions.'
      ],
      requiresAcceptance: true,
      numericChangeStatus: 'not_generated'
    }
  }

  const allAsPlanned = checkins.every(checkin => checkin.outcome === 'as_planned')
  const noPain = checkins.every(checkin => checkin.pain === 'none' && hasExplicitFeedback(checkin, 'pain'))
  if (
    completionRate === 1
    && allAsPlanned
    && noPain
    && averageSessionRpe !== null
    && averageSessionRpe <= 7.5
    && !reviewRequired
  ) {
    return {
      status: 'preview',
      action: 'continue_as_written',
      title: 'Continue the accepted plan',
      rationale: 'The week was completed as planned at a controlled cost with no pain signal.',
      proposedChanges: ['Keep the accepted plan unchanged.'],
      requiresAcceptance: false,
      numericChangeStatus: 'not_needed'
    }
  }

  return {
    status: 'preview',
    action: 'hold_and_review',
    title: reviewRequired ? 'Review the week before the next block' : 'Hold the current plan and observe',
    rationale: reviewRequired
      ? 'This is a planned review checkpoint. Athlete feedback must select any stressor change.'
      : 'The week does not justify either automatic progression or a lower-stress replacement.',
    proposedChanges: ['Keep the accepted plan unchanged unless the athlete approves a replacement proposal.'],
    requiresAcceptance: false,
    numericChangeStatus: 'not_generated'
  }
}

function latestCheckins(
  checkins: readonly CoachSessionCheckinSummary[]
): CoachSessionCheckinSummary[] {
  const latest = new Map<string, CoachSessionCheckinSummary>()
  for (const checkin of checkins) {
    const current = latest.get(checkin.prescribedSessionId)
    if (!current || Date.parse(checkin.occurredAt) > Date.parse(current.occurredAt)) {
      latest.set(checkin.prescribedSessionId, checkin)
    }
  }
  return [...latest.values()]
}

function isSessionOutcome(value: unknown): value is CoachSessionOutcome {
  return ['as_planned', 'modified', 'stopped_early', 'skipped'].includes(String(value))
}

function isSessionEnergy(value: unknown): value is CoachSessionEnergy {
  return ['low', 'okay', 'high'].includes(String(value))
}

function isSessionPain(value: unknown): value is CoachSessionPain {
  return ['none', 'mild', 'concerning'].includes(String(value))
}

function isIsoTimestamp(value: string): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false
  return new Date(value).toISOString() === value
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
