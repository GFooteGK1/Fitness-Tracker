import { COACH_POLICY_VERSION, getEightWeekIntent } from './policy'
import { COACH_REFERENCE_MANIFEST } from './reference'
import {
  COACH_PROGRAM_DOMAIN_IDS,
  type CoachPlanProposalDraft,
  type CoachPlanningInput,
  type CoachProgramDomainId,
  type CoachReferenceDomain,
  type TrainingExperience,
  type TrainingWeekday
} from './types'

const WEEKDAY_OFFSET: Record<TrainingWeekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
}

const EXPERIENCE_VALUES: readonly TrainingExperience[] = [
  'new_or_returning',
  'consistent',
  'experienced'
]

const SESSION_MINUTES = [30, 45, 60, 75, 90] as const

const DOMAIN_TITLE: Record<CoachProgramDomainId, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  power_explosiveness: 'Power and explosiveness',
  speed_agility: 'Speed and agility',
  aerobic: 'Aerobic conditioning',
  resilience: 'Resilience and movement capacity'
}

export type CoachPlanningValidation =
  | { ok: true; value: CoachPlanningInput }
  | { ok: false; errors: string[] }

export function validateCoachPlanningInput(value: unknown): CoachPlanningValidation {
  if (!isRecord(value)) return { ok: false, errors: ['Planning input must be an object'] }

  const errors: string[] = []
  const primaryDomain = value.primaryDomain
  const goal = typeof value.goal === 'string' ? value.goal.trim() : ''
  const experience = value.experience
  const equipment = typeof value.equipment === 'string' ? value.equipment.trim() : ''
  const constraints = typeof value.constraints === 'string' ? value.constraints.trim() : ''
  const startDate = typeof value.startDate === 'string' ? value.startDate : ''
  const sessionMinutes = value.sessionMinutes
  const trainingDays = Array.isArray(value.trainingDays) ? value.trainingDays : []

  if (!COACH_PROGRAM_DOMAIN_IDS.includes(primaryDomain as CoachProgramDomainId)) {
    errors.push('Choose a supported primary training focus')
  }
  if (goal.length < 5 || goal.length > 500) {
    errors.push('Goal must be between 5 and 500 characters')
  }
  if (!EXPERIENCE_VALUES.includes(experience as TrainingExperience)) {
    errors.push('Choose a supported training experience level')
  }
  if (!SESSION_MINUTES.includes(sessionMinutes as CoachPlanningInput['sessionMinutes'])) {
    errors.push('Session length must be 30, 45, 60, 75, or 90 minutes')
  }
  if (equipment.length < 1 || equipment.length > 500) {
    errors.push('Equipment must be between 1 and 500 characters')
  }
  if (constraints.length > 500) {
    errors.push('Constraints must be 500 characters or fewer')
  }

  const validTrainingDays = trainingDays.every(day => (
    typeof day === 'string' && Object.hasOwn(WEEKDAY_OFFSET, day)
  ))
  if (
    !validTrainingDays
    || trainingDays.length < 2
    || trainingDays.length > 6
    || new Set(trainingDays).size !== trainingDays.length
  ) {
    errors.push('Choose 2 to 6 different training days')
  }

  if (!isIsoDate(startDate) || isoWeekday(startDate) !== 1) {
    errors.push('Week one must start on a Monday')
  }

  if (errors.length > 0) return { ok: false, errors }

  const sortedDays = ([...trainingDays]
    .sort((a, b) => WEEKDAY_OFFSET[a as TrainingWeekday] - WEEKDAY_OFFSET[b as TrainingWeekday])) as TrainingWeekday[]

  return {
    ok: true,
    value: {
      primaryDomain: primaryDomain as CoachProgramDomainId,
      goal,
      experience: experience as TrainingExperience,
      trainingDays: sortedDays,
      sessionMinutes: sessionMinutes as CoachPlanningInput['sessionMinutes'],
      equipment,
      constraints,
      startDate
    }
  }
}

export function buildEightWeekProposal(value: unknown): CoachPlanProposalDraft {
  const validated = validateCoachPlanningInput(value)
  if (!validated.ok) throw new Error(validated.errors.join('; '))

  const input = validated.value
  const domain = getProgramDomain(input.primaryDomain)
  const weeks = getEightWeekIntent().map(week => ({ ...week }))
  const sessions = weeks.flatMap(week => input.trainingDays.map((day, index) => ({
    weekNumber: week.week,
    sessionIndex: index + 1,
    scheduledDate: addDays(
      input.startDate,
      ((week.week - 1) * 7) + WEEKDAY_OFFSET[day]
    ),
    prescription: {
      domain: input.primaryDomain,
      intent: `${week.intent} ${domain.intent}`,
      dose: {
        source: 'validated_policy' as const,
        sessionMinutes: input.sessionMinutes,
        structure: sessionStructure(input.experience, week.reviewRequired)
      },
      effort: domain.feel,
      rest: restGuidance(input.primaryDomain),
      success_condition: `Finish with the target quality intact: ${domain.feel}`,
      stop_condition: domain.stopConditions[0],
      scale_options: [
        'Shorten the session while preserving its primary intent.',
        'Use an easier variation that keeps the same target quality.'
      ],
      evidence: {
        doctrineVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
        policyVersion: COACH_POLICY_VERSION
      }
    }
  })))

  return {
    title: `${DOMAIN_TITLE[input.primaryDomain]} · 8 weeks`,
    goalSummary: input.goal,
    startDate: input.startDate,
    endDate: addDays(input.startDate, 55),
    referenceVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
    policyVersion: COACH_POLICY_VERSION,
    weeks,
    sessions,
    inputSnapshot: input
  }
}

function getProgramDomain(id: CoachProgramDomainId): CoachReferenceDomain {
  const domain = COACH_REFERENCE_MANIFEST.domains.find(candidate => candidate.id === id)
  if (!domain) throw new Error(`Coach reference domain is unavailable: ${id}`)
  return domain
}

function sessionStructure(experience: TrainingExperience, reviewRequired: boolean): string {
  if (reviewRequired) {
    return 'Keep useful practice and reduce the stressors that show accumulated fatigue.'
  }

  if (experience === 'new_or_returning') {
    return 'Practice the primary patterns and progress only after repeatable quality.'
  }

  if (experience === 'experienced') {
    return 'Target the primary adaptation and progress one meaningful variable at a time.'
  }

  return 'Use focused, repeatable work and progress one meaningful variable at a time.'
}

function restGuidance(domain: CoachProgramDomainId): string {
  if (domain === 'power_explosiveness' || domain === 'speed_agility') {
    return 'Rest until speed and coordination are available again.'
  }
  return 'Rest until the target feel and technique are available again.'
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isoWeekday(value: string): number | null {
  if (!isIsoDate(value)) return null
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
