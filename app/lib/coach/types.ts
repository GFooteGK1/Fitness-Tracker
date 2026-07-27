export const COACH_DOMAIN_IDS = [
  'assessment',
  'strength',
  'hypertrophy',
  'power_explosiveness',
  'speed_agility',
  'aerobic',
  'anaerobic',
  'nutrition',
  'resilience',
  'recovery',
  'movement_skill',
  'adherence'
] as const

export type CoachDomainId = typeof COACH_DOMAIN_IDS[number]
export type EvidenceConfidence = 'high' | 'moderate' | 'emerging'
export type LoadUnit = 'lb' | 'kg'
export type SupportedRepMax = 1 | 3 | 5

export const COACH_PROGRAM_DOMAIN_IDS = [
  'strength',
  'hypertrophy',
  'power_explosiveness',
  'speed_agility',
  'aerobic',
  'resilience'
] as const

export type CoachProgramDomainId = typeof COACH_PROGRAM_DOMAIN_IDS[number]
export type TrainingExperience = 'new_or_returning' | 'consistent' | 'experienced'
export type TrainingWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface CoachPlanningInput {
  primaryDomain: CoachProgramDomainId
  goal: string
  experience: TrainingExperience
  trainingDays: readonly TrainingWeekday[]
  sessionMinutes: 30 | 45 | 60 | 75 | 90
  equipment: string
  constraints: string
  startDate: string
}

export interface CoachSessionPrescription {
  domain: CoachProgramDomainId
  intent: string
  dose: {
    source: 'validated_policy'
    sessionMinutes: CoachPlanningInput['sessionMinutes']
    structure: string
  }
  effort: string
  rest: string
  success_condition: string
  stop_condition: string
  scale_options: string[]
  evidence: {
    doctrineVersion: string
    policyVersion: string
  }
}

export interface CoachPlanProposalDraft {
  title: string
  goalSummary: string
  startDate: string
  endDate: string
  referenceVersion: string
  policyVersion: string
  weeks: EightWeekIntent[]
  sessions: Array<{
    weekNumber: number
    sessionIndex: number
    scheduledDate: string
    prescription: CoachSessionPrescription
  }>
  inputSnapshot: CoachPlanningInput
}

export interface CoachReferenceDomain {
  id: CoachDomainId
  title: string
  intent: string
  feel: string
  guidance: readonly string[]
  stopConditions: readonly string[]
  sourceIds: readonly string[]
  confidence: EvidenceConfidence
}

export interface CoachReferenceManifest {
  schemaVersion: 1
  doctrineVersion: string
  evidenceReviewDate: string
  intendedPopulation: string
  corePrinciples: readonly string[]
  safetyBoundary: readonly string[]
  domains: readonly CoachReferenceDomain[]
}

export interface CoachReferenceSnapshot {
  schemaVersion: 1
  doctrineVersion: string
  evidenceReviewDate: string
  intendedPopulation: string
  corePrinciples: readonly string[]
  safetyBoundary: readonly string[]
  domainIndex: ReadonlyArray<{ id: CoachDomainId; title: string }>
  domains: readonly CoachReferenceDomain[]
  truncated: boolean
}

export interface StrengthAssessmentInput {
  movement: string
  variation?: string
  load: number
  unit: LoadUnit
  reps: SupportedRepMax
  assessedOn: string
  isTrueRepMax: boolean
  rir?: number
  rpe?: number
  athleteConfidence: number
}

export interface DerivedStrengthAssessment {
  movement: string
  variation: string | null
  unit: LoadUnit
  estimatedOneRepMax: number
  estimateKind: 'reported_1rm' | 'estimated_1rm'
  sourceLoad: number
  sourceReps: SupportedRepMax
  sourceDate: string
  isTrueRepMax: boolean
  rir: number | null
  rpe: number | null
  athleteConfidence: number
  calculatorVersion: string
  formula: string
}

export type EightWeekRole =
  | 'establish'
  | 'build'
  | 'develop'
  | 'deload_review'
  | 'reestablish'
  | 'deload_assess'

export interface EightWeekIntent {
  week: number
  role: EightWeekRole
  intent: string
  reviewRequired: boolean
}

export interface CoachStrengthAssessmentSummary {
  id: string
  movement: string
  variation: string | null
  load: number
  unit: LoadUnit
  reps: SupportedRepMax
  assessedOn: string
  isTrueRepMax: boolean
  rir: number | null
  rpe: number | null
  athleteConfidence: number
  estimatedOneRepMax: number
  estimateKind: 'reported_1rm' | 'estimated_1rm'
  calculatorVersion: string
}

export interface CoachMemorySummary {
  id: string
  memoryKey: string
  kind: string
  content: Record<string, unknown>
  confidence: number
  confirmedAt: string
  version: number
}

export interface ActiveCoachProgramSummary {
  id: string
  title: string
  goalSummary: string
  startDate: string
  endDate: string
  activePlanVersionId: string
  planVersion: number
  currentWeek: number | null
  currentWeekRole: EightWeekRole | null
  referenceVersion: string
  policyVersion: string
  weeks: EightWeekIntent[]
  upcomingSessions: Array<{
    id: string
    weekNumber: number
    sessionIndex: number
    scheduledDate: string | null
    prescription: Record<string, unknown>
    status: string
  }>
}

export interface CoachRuntimeContext {
  generatedAt: string
  storageAvailable: boolean
  doctrineVersion: string
  policyVersion: string
  assessments: CoachStrengthAssessmentSummary[]
  memories: CoachMemorySummary[]
  activeProgram: ActiveCoachProgramSummary | null
}
