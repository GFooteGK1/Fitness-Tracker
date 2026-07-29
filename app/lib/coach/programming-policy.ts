import { COMPLETE_PROGRAMMING_REFERENCE } from './programming-reference'
import type {
  CompleteProgrammingDose,
  NumericRange,
  ProgrammingCost,
  ProgrammingExecutionTarget,
  ProgrammingSessionBlockRole,
  WeeklyCoveragePriority,
  WeeklyCoverageKind
} from './programming-schema'
import type { CoachProgramDomainId, EightWeekRole } from './types'

export const COMPLETE_PROGRAMMING_POLICY_VERSION = '0.3.0'

export type ProgrammingProgressionVariable =
  | 'load'
  | 'repetitions'
  | 'sets'
  | 'duration'
  | 'distance'
  | 'density'
  | 'complexity'
  | 'execution_quality'

export type ProgrammingDoseAnchorId =
  | 'strength:primary_pattern'
  | 'hypertrophy:regional_work'
  | 'power:ballistic_quality'
  | 'speed:max_quality'
  | 'aerobic:easy_continuous'
  | 'aerobic:controlled_intervals'
  | 'resilience:controlled_capacity'

export interface ProgrammingDoseAnchor {
  id: ProgrammingDoseAnchorId
  domain: CoachProgramDomainId
  policyBasis: 'product_policy'
  coverageKind: WeeklyCoverageKind
  dose: CompleteProgrammingDose
  executionTarget: ProgrammingExecutionTarget
  restSeconds: NumericRange
  loadPercentEstimatedOneRepMax?: NumericRange
  successCondition: string
  stopCondition: string
  eligibleProgressionVariables: ProgrammingProgressionVariable[]
  evidenceRuleIds: string[]
}

export interface WeeklyCoverageTemplatePolicy {
  id: string
  domain: CoachProgramDomainId
  kind: WeeklyCoverageKind
  targetId: string
  targetLabel: string
  priority: WeeklyCoveragePriority
  secondaryRank: 1 | 2 | 3
  doseAnchorId: ProgrammingDoseAnchorId
  minimumExposures: number
  targetExposures: number
  estimatedMinutesPerExposure: number
  fatigueCost: ProgrammingCost
  impactCost: ProgrammingCost
  preferredRecoveryHours: number | null
  mustPrecedeKinds: WeeklyCoverageKind[]
  incompatibleTargetIds: string[]
  evidenceRuleIds: string[]
}

export interface ProgrammingSessionTimeBudget {
  sessionMinutes: number
  specificPreparationMinutes: number
  priorityAdaptationMinutes: number
  flexibleMinutes: number
  preservedRoles: ['specific_preparation', 'priority_adaptation']
}

interface DomainCoveragePolicy {
  allowedKinds: WeeklyCoverageKind[]
  doseAnchorIds: ProgrammingDoseAnchorId[]
  allocationRule: string
}

interface CompleteProgrammingPolicy {
  schemaVersion: 1
  policyVersion: string
  evidenceReferenceVersion: string
  intendedPopulation: string
  authority: {
    numericPrescriptionSource: 'validated_policy'
    modelMayCreateNumericDose: false
    activationRequiresAthleteAcceptance: true
  }
  goalAllocation: {
    primaryGoals: 1
    maximumSecondaryGoals: 2
    secondaryAllocations: ['development', 'maintenance']
  }
  sessionTime: {
    minimumMinutes: 30
    maximumMinutes: 90
    minimumSpecificPreparationMinutes: 5
    maximumSpecificPreparationMinutes: 10
    minimumPriorityAdaptationMinutes: 15
    specificPreparationFraction: number
    priorityAdaptationFraction: number
    preservedRoles: ['specific_preparation', 'priority_adaptation']
    coveragePriorityPrecedesRoleTiebreaker: true
    removalOrder: ProgrammingSessionBlockRole[]
    supersetEligibleRoles: ProgrammingSessionBlockRole[]
  }
  coverageByDomain: Record<CoachProgramDomainId, DomainCoveragePolicy>
  doseAnchors: ProgrammingDoseAnchor[]
  weeklyCoverageTemplates: WeeklyCoverageTemplatePolicy[]
  composition: {
    startingStrengthPercentEstimatedOneRepMax: NumericRange
    loadRoundingIncrement: { lb: number; kg: number }
    selectionScore: {
      unambiguousAssessment: number
      preferredMovement: number
      recentlyPerformedMovement: number
      avoidedMovement: number
      lowerFatigue: Record<ProgrammingCost, number>
    }
  }
  progression: {
    maxPrincipalVariablesPerRevision: 1
    allowedVariables: ProgrammingProgressionVariable[]
    requiresCompletedExposureEvidence: true
    noAutomaticProgressionAtReview: true
  }
  review: {
    checkpointWeeks: [4, 8]
    uniformNoTrainingWeek: false
    automaticPlanActivation: false
    adjustableStressors: Array<'volume' | 'intensity' | 'impact' | 'complexity' | 'density'>
    requiredSignals: string[]
  }
  eightWeekIntent: Array<{
    week: number
    role: EightWeekRole
    intent: string
    reviewRequired: boolean
  }>
  evidenceRuleIds: string[]
}

const DOSE_ANCHORS: ProgrammingDoseAnchor[] = [
  {
    id: 'strength:primary_pattern',
    domain: 'strength',
    policyBasis: 'product_policy',
    coverageKind: 'movement_pattern',
    dose: {
      kind: 'sets_reps',
      sets: { min: 2, max: 5 },
      repetitions: { min: 3, max: 8 }
    },
    executionTarget: { kind: 'rir', range: { min: 2, max: 4 } },
    restSeconds: { min: 120, max: 300 },
    loadPercentEstimatedOneRepMax: { min: 55, max: 85 },
    successCondition: 'Every planned repetition is repeatable with stable position and force.',
    stopCondition: 'Stop the set when position or repeatable force materially breaks down.',
    eligibleProgressionVariables: ['load', 'repetitions', 'sets', 'execution_quality'],
    evidenceRuleIds: [
      'session.priority-first',
      'session.rest-preserves-output',
      'progression.anchor-and-adjust'
    ]
  },
  {
    id: 'hypertrophy:regional_work',
    domain: 'hypertrophy',
    policyBasis: 'product_policy',
    coverageKind: 'muscle_region',
    dose: {
      kind: 'sets_reps',
      sets: { min: 2, max: 4 },
      repetitions: { min: 6, max: 15 }
    },
    executionTarget: { kind: 'rir', range: { min: 1, max: 3 } },
    restSeconds: { min: 90, max: 180 },
    successCondition: 'The target region remains the limiter through the last useful repetition.',
    stopCondition: 'Stop when another repetition would shift work away from the target region or destabilize technique.',
    eligibleProgressionVariables: ['load', 'repetitions', 'sets', 'execution_quality'],
    evidenceRuleIds: [
      'week.dose-before-split',
      'movement.selection-by-coverage',
      'session.rest-preserves-output'
    ]
  },
  {
    id: 'power:ballistic_quality',
    domain: 'power_explosiveness',
    policyBasis: 'product_policy',
    coverageKind: 'performance_quality',
    dose: {
      kind: 'quality_repetitions',
      series: { min: 2, max: 5 },
      repetitionsPerSeries: { min: 2, max: 5 },
      workSeconds: null
    },
    executionTarget: {
      kind: 'velocity',
      cue: 'Use maximal intent while rep speed and landing or receiving quality remain stable.',
      baselineId: null
    },
    restSeconds: { min: 120, max: 300 },
    successCondition: 'Repetitions stay fast, coordinated, and directionally consistent.',
    stopCondition: 'End the exposure when rep speed, landing quality, or coordination meaningfully declines.',
    eligibleProgressionVariables: ['repetitions', 'sets', 'complexity', 'execution_quality'],
    evidenceRuleIds: [
      'session.priority-first',
      'power.preserve-velocity',
      'concurrent.protect-explosive-priority'
    ]
  },
  {
    id: 'speed:max_quality',
    domain: 'speed_agility',
    policyBasis: 'product_policy',
    coverageKind: 'performance_quality',
    dose: {
      kind: 'quality_repetitions',
      series: { min: 1, max: 2 },
      repetitionsPerSeries: { min: 4, max: 10 },
      workSeconds: { min: 5, max: 12 }
    },
    executionTarget: {
      kind: 'quality',
      cue: 'Move fast and relaxed with repeatable mechanics, force direction, and deceleration control.'
    },
    restSeconds: { min: 120, max: 300 },
    successCondition: 'Speed and mechanics remain consistent across the planned high-quality repetitions.',
    stopCondition: 'End the exposure when speed, mechanics, posture, or deceleration control meaningfully declines.',
    eligibleProgressionVariables: ['repetitions', 'distance', 'complexity', 'execution_quality'],
    evidenceRuleIds: [
      'session.priority-first',
      'power.preserve-velocity',
      'concurrent.protect-explosive-priority'
    ]
  },
  {
    id: 'aerobic:easy_continuous',
    domain: 'aerobic',
    policyBasis: 'product_policy',
    coverageKind: 'energy_system',
    dose: {
      kind: 'continuous',
      durationMinutes: { min: 20, max: 60 }
    },
    executionTarget: {
      kind: 'talk_test',
      cue: 'Keep breathing controlled enough for short conversational phrases.'
    },
    restSeconds: { min: 0, max: 0 },
    successCondition: 'Pace and breathing remain controlled without a late-session effort spike.',
    stopCondition: 'Stop when normal mechanics cannot be maintained or effort rises sharply without more output.',
    eligibleProgressionVariables: ['duration', 'distance', 'execution_quality'],
    evidenceRuleIds: [
      'conditioning.define-variables',
      'progression.simple-over-complex'
    ]
  },
  {
    id: 'aerobic:controlled_intervals',
    domain: 'aerobic',
    policyBasis: 'product_policy',
    coverageKind: 'energy_system',
    dose: {
      kind: 'intervals',
      workSeconds: { min: 60, max: 300 },
      recoverySeconds: { min: 60, max: 180 },
      repetitions: { min: 2, max: 6 },
      series: { min: 1, max: 2 },
      seriesRecoverySeconds: { min: 180, max: 300 }
    },
    executionTarget: {
      kind: 'pace',
      cue: 'Select an output that keeps the final work interval within the planned quality range.',
      baselineId: null
    },
    restSeconds: { min: 60, max: 180 },
    successCondition: 'Work and recovery outputs remain repeatable through the final interval.',
    stopCondition: 'Stop when output falls outside the planned repeatable range or mechanics deteriorate.',
    eligibleProgressionVariables: ['repetitions', 'duration', 'distance', 'density', 'execution_quality'],
    evidenceRuleIds: [
      'conditioning.define-variables',
      'session.rest-preserves-output',
      'concurrent.protect-explosive-priority'
    ]
  },
  {
    id: 'resilience:controlled_capacity',
    domain: 'resilience',
    policyBasis: 'product_policy',
    coverageKind: 'resilience_capacity',
    dose: {
      kind: 'sets_reps',
      sets: { min: 1, max: 4 },
      repetitions: { min: 6, max: 15 }
    },
    executionTarget: { kind: 'rir', range: { min: 3, max: 5 } },
    restSeconds: { min: 45, max: 120 },
    successCondition: 'Range, breathing, and control remain repeatable on both sides.',
    stopCondition: 'Stop when range or control becomes less repeatable or the work no longer matches the named capacity.',
    eligibleProgressionVariables: ['repetitions', 'sets', 'duration', 'complexity', 'execution_quality'],
    evidenceRuleIds: [
      'movement.selection-by-coverage',
      'progression.simple-over-complex'
    ]
  }
]

const WEEKLY_COVERAGE_TEMPLATES: WeeklyCoverageTemplatePolicy[] = [
  coverageTemplate(
    'strength:knee_dominant', 'strength', 'movement_pattern', 'knee_dominant',
    'Knee-dominant strength', 'priority', 1, 'strength:primary_pattern', 1, 2, 12,
    'high', 'moderate', 48, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage', 'session.priority-first']
  ),
  coverageTemplate(
    'strength:hip_hinge', 'strength', 'movement_pattern', 'hip_hinge',
    'Hip-hinge strength', 'priority', 1, 'strength:primary_pattern', 1, 2, 12,
    'high', 'low', 48, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage', 'session.priority-first']
  ),
  coverageTemplate(
    'strength:horizontal_push', 'strength', 'movement_pattern', 'horizontal_push',
    'Horizontal pushing strength', 'supporting', 2, 'strength:primary_pattern', 1, 1, 10,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'strength:horizontal_pull', 'strength', 'movement_pattern', 'horizontal_pull',
    'Horizontal pulling strength', 'supporting', 2, 'strength:primary_pattern', 1, 1, 10,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'hypertrophy:quadriceps', 'hypertrophy', 'muscle_region', 'quadriceps',
    'Quadriceps development', 'priority', 1, 'hypertrophy:regional_work', 1, 2, 12,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'hypertrophy:posterior_chain', 'hypertrophy', 'muscle_region', 'posterior_chain',
    'Posterior-chain development', 'priority', 1, 'hypertrophy:regional_work', 1, 2, 12,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'hypertrophy:chest', 'hypertrophy', 'muscle_region', 'chest',
    'Chest development', 'supporting', 2, 'hypertrophy:regional_work', 1, 1, 10,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'hypertrophy:upper_back', 'hypertrophy', 'muscle_region', 'upper_back',
    'Upper-back development', 'supporting', 2, 'hypertrophy:regional_work', 1, 1, 10,
    'moderate', 'low', 24, [], [],
    ['week.dose-before-split', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'power:lower_body_power', 'power_explosiveness', 'performance_quality', 'lower_body_power',
    'Lower-body power', 'priority', 1, 'power:ballistic_quality', 1, 2, 14,
    'moderate', 'high', 48, ['energy_system'], ['aerobic_intervals'],
    ['session.priority-first', 'power.preserve-velocity', 'concurrent.protect-explosive-priority']
  ),
  coverageTemplate(
    'power:upper_body_power', 'power_explosiveness', 'performance_quality', 'upper_body_power',
    'Upper-body power', 'supporting', 2, 'power:ballistic_quality', 1, 1, 10,
    'low', 'low', 24, ['energy_system'], ['aerobic_intervals'],
    ['session.priority-first', 'power.preserve-velocity', 'concurrent.protect-explosive-priority']
  ),
  coverageTemplate(
    'speed:locomotor_acceleration', 'speed_agility', 'performance_quality', 'locomotor_acceleration',
    'Locomotor acceleration', 'priority', 1, 'speed:max_quality', 1, 2, 12,
    'moderate', 'high', 48, ['energy_system'], ['aerobic_intervals'],
    ['session.priority-first', 'power.preserve-velocity', 'concurrent.protect-explosive-priority']
  ),
  coverageTemplate(
    'speed:deceleration_control', 'speed_agility', 'performance_quality', 'deceleration_control',
    'Deceleration control', 'priority', 2, 'speed:max_quality', 1, 1, 10,
    'low', 'moderate', 24, ['energy_system'], [],
    ['session.priority-first', 'power.preserve-velocity']
  ),
  coverageTemplate(
    'speed:maximum_velocity', 'speed_agility', 'performance_quality', 'maximum_velocity',
    'Maximum-velocity practice', 'secondary', 3, 'speed:max_quality', 1, 1, 12,
    'moderate', 'high', 48, ['energy_system'], ['aerobic_intervals'],
    ['session.priority-first', 'power.preserve-velocity', 'concurrent.protect-explosive-priority']
  ),
  coverageTemplate(
    'speed:sprint_mechanics', 'speed_agility', 'performance_quality', 'sprint_mechanics',
    'Sprint mechanics practice', 'supporting', 3, 'speed:max_quality', 1, 1, 8,
    'low', 'low', 24, ['energy_system'], [],
    ['session.priority-first', 'movement.selection-by-coverage']
  ),
  coverageTemplate(
    'aerobic:aerobic_easy', 'aerobic', 'energy_system', 'aerobic_easy',
    'Easy aerobic durability', 'priority', 1, 'aerobic:easy_continuous', 1, 2, 20,
    'low', 'low', 24, [], [],
    ['conditioning.define-variables', 'week.dose-before-split']
  ),
  coverageTemplate(
    'aerobic:aerobic_intervals', 'aerobic', 'energy_system', 'aerobic_intervals',
    'Controlled aerobic intervals', 'priority', 2, 'aerobic:controlled_intervals', 1, 1, 20,
    'high', 'low', 48, [], ['lower_body_power', 'locomotor_acceleration', 'maximum_velocity'],
    ['conditioning.define-variables', 'session.rest-preserves-output', 'concurrent.protect-explosive-priority']
  ),
  coverageTemplate(
    'aerobic:aerobic_tempo', 'aerobic', 'energy_system', 'aerobic_tempo',
    'Controlled tempo exposure', 'secondary', 3, 'aerobic:easy_continuous', 1, 1, 18,
    'moderate', 'low', 24, [], [],
    ['conditioning.define-variables', 'week.dose-before-split']
  ),
  coverageTemplate(
    'resilience:single_leg_control', 'resilience', 'resilience_capacity', 'single_leg_control',
    'Single-leg control', 'priority', 1, 'resilience:controlled_capacity', 1, 2, 10,
    'low', 'low', 24, [], [],
    ['movement.selection-by-coverage', 'progression.simple-over-complex']
  ),
  coverageTemplate(
    'resilience:trunk_control', 'resilience', 'resilience_capacity', 'trunk_control',
    'Trunk control', 'priority', 1, 'resilience:controlled_capacity', 1, 2, 8,
    'low', 'low', 24, [], [],
    ['movement.selection-by-coverage', 'progression.simple-over-complex']
  ),
  coverageTemplate(
    'resilience:lower_leg_capacity', 'resilience', 'resilience_capacity', 'lower_leg_capacity',
    'Lower-leg capacity', 'supporting', 2, 'resilience:controlled_capacity', 1, 1, 8,
    'low', 'low', 24, [], [],
    ['movement.selection-by-coverage', 'progression.simple-over-complex']
  ),
  coverageTemplate(
    'resilience:scapular_control', 'resilience', 'resilience_capacity', 'scapular_control',
    'Scapular control', 'supporting', 2, 'resilience:controlled_capacity', 1, 1, 8,
    'low', 'low', 24, [], [],
    ['movement.selection-by-coverage', 'progression.simple-over-complex']
  ),
  coverageTemplate(
    'resilience:whole_body_capacity', 'resilience', 'resilience_capacity', 'whole_body_capacity',
    'Whole-body capacity', 'supporting', 3, 'resilience:controlled_capacity', 1, 1, 10,
    'moderate', 'low', 24, [], [],
    ['movement.selection-by-coverage', 'progression.simple-over-complex']
  )
]

export const COMPLETE_PROGRAMMING_POLICY: CompleteProgrammingPolicy = {
  schemaVersion: 1,
  policyVersion: COMPLETE_PROGRAMMING_POLICY_VERSION,
  evidenceReferenceVersion: COMPLETE_PROGRAMMING_REFERENCE.referenceVersion,
  intendedPopulation: 'Generally healthy adults training two to six days per week in sessions lasting 30 to 90 minutes.',
  authority: {
    numericPrescriptionSource: 'validated_policy',
    modelMayCreateNumericDose: false,
    activationRequiresAthleteAcceptance: true
  },
  goalAllocation: {
    primaryGoals: 1,
    maximumSecondaryGoals: 2,
    secondaryAllocations: ['development', 'maintenance']
  },
  sessionTime: {
    minimumMinutes: 30,
    maximumMinutes: 90,
    minimumSpecificPreparationMinutes: 5,
    maximumSpecificPreparationMinutes: 10,
    minimumPriorityAdaptationMinutes: 15,
    specificPreparationFraction: 0.1,
    priorityAdaptationFraction: 0.45,
    preservedRoles: ['specific_preparation', 'priority_adaptation'],
    coveragePriorityPrecedesRoleTiebreaker: true,
    removalOrder: [
      'downshift',
      'assistance_and_capacity',
      'conditioning',
      'secondary_adaptation'
    ],
    supersetEligibleRoles: [
      'secondary_adaptation',
      'assistance_and_capacity'
    ]
  },
  coverageByDomain: {
    strength: {
      allowedKinds: ['movement_pattern', 'resilience_capacity'],
      doseAnchorIds: ['strength:primary_pattern'],
      allocationRule: 'Track lead strength by trained movement pattern; use supporting capacity only for a named gap.'
    },
    hypertrophy: {
      allowedKinds: ['muscle_region', 'movement_pattern'],
      doseAnchorIds: ['hypertrophy:regional_work'],
      allocationRule: 'Track direct regional work across useful movement angles and distribute it to preserve set quality.'
    },
    power_explosiveness: {
      allowedKinds: ['performance_quality', 'movement_pattern'],
      doseAnchorIds: ['power:ballistic_quality'],
      allocationRule: 'Track crisp high-output exposures and schedule them before avoidable fatigue.'
    },
    speed_agility: {
      allowedKinds: ['performance_quality'],
      doseAnchorIds: ['speed:max_quality'],
      allocationRule: 'Track acceleration, maximum velocity, deceleration, or change-of-direction quality separately.'
    },
    aerobic: {
      allowedKinds: ['energy_system'],
      doseAnchorIds: ['aerobic:easy_continuous', 'aerobic:controlled_intervals'],
      allocationRule: 'Track easy durability and controlled higher-intensity work as distinct energy-system requirements.'
    },
    resilience: {
      allowedKinds: ['resilience_capacity', 'movement_pattern'],
      doseAnchorIds: ['resilience:controlled_capacity'],
      allocationRule: 'Track only capacities required to tolerate the accepted plan or address an explicit movement gap.'
    }
  },
  doseAnchors: DOSE_ANCHORS,
  weeklyCoverageTemplates: WEEKLY_COVERAGE_TEMPLATES,
  composition: {
    startingStrengthPercentEstimatedOneRepMax: { min: 65, max: 75 },
    loadRoundingIncrement: { lb: 5, kg: 2.5 },
    selectionScore: {
      unambiguousAssessment: 100,
      preferredMovement: 20,
      recentlyPerformedMovement: 10,
      avoidedMovement: -100,
      lowerFatigue: { low: 3, moderate: 2, high: 1 }
    }
  },
  progression: {
    maxPrincipalVariablesPerRevision: 1,
    allowedVariables: [
      'load',
      'repetitions',
      'sets',
      'duration',
      'distance',
      'density',
      'complexity',
      'execution_quality'
    ],
    requiresCompletedExposureEvidence: true,
    noAutomaticProgressionAtReview: true
  },
  review: {
    checkpointWeeks: [4, 8],
    uniformNoTrainingWeek: false,
    automaticPlanActivation: false,
    adjustableStressors: ['volume', 'intensity', 'impact', 'complexity', 'density'],
    requiredSignals: [
      'completion and substitution patterns',
      'performance trend and execution quality',
      'session RPE or RIR and soreness',
      'athlete feedback',
      'schedule, equipment, or constraint changes'
    ]
  },
  eightWeekIntent: [
    { week: 1, role: 'establish', intent: 'Establish repeatable technique, effort, and starting dose.', reviewRequired: false },
    { week: 2, role: 'build', intent: 'Build consistency while preserving the lead training intent.', reviewRequired: false },
    { week: 3, role: 'develop', intent: 'Develop the lead quality with one controlled progression variable.', reviewRequired: false },
    { week: 4, role: 'deload_review', intent: 'Review fatigue and performance before changing any stressor.', reviewRequired: true },
    { week: 5, role: 'reestablish', intent: 'Reestablish the accepted dose after the week-four review.', reviewRequired: false },
    { week: 6, role: 'build', intent: 'Build from the reviewed baseline without stacking progression variables.', reviewRequired: false },
    { week: 7, role: 'develop', intent: 'Develop the lead quality while maintaining execution standards.', reviewRequired: false },
    { week: 8, role: 'deload_assess', intent: 'Review, assess, and decide the next training direction.', reviewRequired: true }
  ],
  evidenceRuleIds: [
    'session.complete-by-role',
    'session.priority-first',
    'session.specific-preparation',
    'week.dose-before-split',
    'movement.selection-by-coverage',
    'session.rest-preserves-output',
    'power.preserve-velocity',
    'conditioning.define-variables',
    'concurrent.protect-explosive-priority',
    'progression.anchor-and-adjust',
    'progression.simple-over-complex',
    'time.preserve-priority'
  ]
}

export function getSessionTimeBudget(sessionMinutes: number): ProgrammingSessionTimeBudget {
  const policy = COMPLETE_PROGRAMMING_POLICY.sessionTime
  if (
    !Number.isInteger(sessionMinutes)
    || sessionMinutes < policy.minimumMinutes
    || sessionMinutes > policy.maximumMinutes
  ) {
    throw new Error('sessionMinutes must be an integer from 30 through 90')
  }

  const specificPreparationMinutes = clamp(
    Math.round(sessionMinutes * policy.specificPreparationFraction),
    policy.minimumSpecificPreparationMinutes,
    policy.maximumSpecificPreparationMinutes
  )
  const priorityAdaptationMinutes = Math.max(
    policy.minimumPriorityAdaptationMinutes,
    Math.round(sessionMinutes * policy.priorityAdaptationFraction)
  )

  return {
    sessionMinutes,
    specificPreparationMinutes,
    priorityAdaptationMinutes,
    flexibleMinutes: sessionMinutes - specificPreparationMinutes - priorityAdaptationMinutes,
    preservedRoles: [...policy.preservedRoles]
  }
}

export function getDoseAnchor(id: ProgrammingDoseAnchorId): ProgrammingDoseAnchor {
  const anchor = COMPLETE_PROGRAMMING_POLICY.doseAnchors.find(candidate => candidate.id === id)
  if (!anchor) throw new Error(`Unknown programming dose anchor: ${id}`)
  return anchor
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function coverageTemplate(
  id: string,
  domain: CoachProgramDomainId,
  kind: WeeklyCoverageKind,
  targetId: string,
  targetLabel: string,
  priority: WeeklyCoveragePriority,
  secondaryRank: 1 | 2 | 3,
  doseAnchorId: ProgrammingDoseAnchorId,
  minimumExposures: number,
  targetExposures: number,
  estimatedMinutesPerExposure: number,
  fatigueCost: ProgrammingCost,
  impactCost: ProgrammingCost,
  preferredRecoveryHours: number | null,
  mustPrecedeKinds: WeeklyCoverageKind[],
  incompatibleTargetIds: string[],
  evidenceRuleIds: string[]
): WeeklyCoverageTemplatePolicy {
  return {
    id,
    domain,
    kind,
    targetId,
    targetLabel,
    priority,
    secondaryRank,
    doseAnchorId,
    minimumExposures,
    targetExposures,
    estimatedMinutesPerExposure,
    fatigueCost,
    impactCost,
    preferredRecoveryHours,
    mustPrecedeKinds,
    incompatibleTargetIds,
    evidenceRuleIds
  }
}
