import { MOVEMENT_EQUIPMENT_IDS } from '@/app/lib/coach/movement-catalog'
import {
  PROGRAMMING_KERNEL_VERSION,
  PROGRAMMING_SCHEMA_VERSION,
  type ProgrammingProfile
} from '@/app/lib/coach/programming-schema'
import type {
  CoachProgramDomainId,
  TrainingExperience,
  TrainingWeekday
} from '@/app/lib/coach/types'

const WEEKDAYS: TrainingWeekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
]

interface GoldenProfileOptions {
  domain: CoachProgramDomainId
  experience: TrainingExperience
  days: number
  minutes: number
  equipment: string[]
}

function goldenProfile({
  domain,
  experience,
  days,
  minutes,
  equipment
}: GoldenProfileOptions): ProgrammingProfile {
  return {
    schemaVersion: PROGRAMMING_SCHEMA_VERSION,
    kernelVersion: PROGRAMMING_KERNEL_VERSION,
    athleteGoalSummary: `Develop ${domain} with a complete eight-week plan`,
    primaryGoal: {
      id: `goal:primary:${domain}`,
      domain,
      role: 'primary',
      allocation: 'lead',
      athleteIntent: `Develop ${domain}`
    },
    secondaryGoals: [],
    trainingExperience: experience,
    startDate: '2026-08-03',
    sessionAvailability: WEEKDAYS.slice(0, days).map(day => ({ day, minutes })),
    equipment: {
      resolvedIds: equipment,
      unresolvedAthleteDescription: null
    },
    explicitConstraints: [],
    unresolvedConstraintNote: null,
    preferences: [],
    assessments: [],
    recentTraining: {
      asOfDate: null,
      lookbackDays: 0,
      completedSessionCount: 0,
      performedMovementIds: [],
      doseByCoverageTarget: []
    },
    inputSource: { kind: 'structured_v0_3_intake' }
  }
}

export const GOLDEN_PROGRAMMING_PROFILES: ReadonlyArray<{
  id: string
  profile: ProgrammingProfile
  expectedTargetId: string
  expectedFirstWeekMovementIds: string[][]
}> = [
  {
    id: 'new-bodyweight-strength-2x30',
    profile: goldenProfile({
      domain: 'strength',
      experience: 'new_or_returning',
      days: 2,
      minutes: 30,
      equipment: ['bodyweight']
    }),
    expectedTargetId: 'knee_dominant',
    expectedFirstWeekMovementIds: [
      ['single_leg_hip_bridge', 'push_up'],
      ['reverse_lunge']
    ]
  },
  {
    id: 'consistent-full-gym-hypertrophy-3x60',
    profile: goldenProfile({
      domain: 'hypertrophy',
      experience: 'consistent',
      days: 3,
      minutes: 60,
      equipment: [...MOVEMENT_EQUIPMENT_IDS]
    }),
    expectedTargetId: 'quadriceps',
    expectedFirstWeekMovementIds: [
      ['single_leg_hip_bridge', 'dumbbell_goblet_squat'],
      ['dumbbell_goblet_squat', 'barbell_floor_press'],
      ['single_leg_hip_bridge', 'band_row']
    ]
  },
  {
    id: 'experienced-field-power-4x75',
    profile: goldenProfile({
      domain: 'power_explosiveness',
      experience: 'experienced',
      days: 4,
      minutes: 75,
      equipment: ['bodyweight', 'medicine_ball', 'box', 'track', 'barbell', 'rack']
    }),
    expectedTargetId: 'lower_body_power',
    expectedFirstWeekMovementIds: [
      ['broad_jump'],
      ['medicine_ball_chest_pass'],
      ['broad_jump']
    ]
  },
  {
    id: 'consistent-track-speed-4x60',
    profile: goldenProfile({
      domain: 'speed_agility',
      experience: 'consistent',
      days: 4,
      minutes: 60,
      equipment: ['bodyweight', 'track']
    }),
    expectedTargetId: 'locomotor_acceleration',
    expectedFirstWeekMovementIds: [
      ['flat_acceleration_sprint'],
      ['lateral_bound_to_stick', 'fast_a_march'],
      ['relaxed_stride'],
      ['flat_acceleration_sprint']
    ]
  },
  {
    id: 'experienced-cyclical-aerobic-5x45',
    profile: goldenProfile({
      domain: 'aerobic',
      experience: 'experienced',
      days: 5,
      minutes: 45,
      equipment: ['bodyweight', 'bike', 'rower']
    }),
    expectedTargetId: 'aerobic_easy',
    expectedFirstWeekMovementIds: [
      ['brisk_walk'],
      ['bike_erg'],
      ['brisk_walk'],
      ['brisk_walk']
    ]
  },
  {
    id: 'new-bodyweight-resilience-3x45',
    profile: goldenProfile({
      domain: 'resilience',
      experience: 'new_or_returning',
      days: 3,
      minutes: 45,
      equipment: ['bodyweight']
    }),
    expectedTargetId: 'trunk_control',
    expectedFirstWeekMovementIds: [
      ['single_leg_hip_bridge'],
      ['bird_dog', 'prone_w_raise'],
      ['bent_knee_calf_raise', 'bear_crawl']
    ]
  }
]
