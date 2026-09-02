import type {
  ProgrammingCost,
  WeeklyCoverageKind
} from './programming-schema'
import {
  COACH_PROGRAM_DOMAIN_IDS,
  type CoachProgramDomainId,
  type TrainingExperience
} from './types'

export const MOVEMENT_CATALOG_VERSION = 'complete-movements-0.1.0'

export const MOVEMENT_EQUIPMENT_IDS = [
  'barbell',
  'rack',
  'dumbbell',
  'kettlebell',
  'bench',
  'band',
  'cable',
  'machine',
  'pull_up_bar',
  'medicine_ball',
  'box',
  'sled',
  'bike',
  'rower',
  'treadmill',
  'track',
  'bodyweight'
] as const

export type MovementEquipmentId = typeof MOVEMENT_EQUIPMENT_IDS[number]
export type MovementSkillLevel = 'low' | 'moderate' | 'high'
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'jump'
  | 'throw'
  | 'sprint'
  | 'locomotion'
  | 'deceleration'
  | 'calf_raise'
  | 'carry'
  | 'trunk_anti_extension'
  | 'trunk_anti_lateral_flexion'
  | 'scapular_control'
  | 'crawl'
  | 'mobility'
  | 'cyclical'

export type BodyRegion =
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'upper_back'
  | 'lats'
  | 'trunk'
  | 'whole_body'

export interface MovementCoverageTag {
  kind: WeeklyCoverageKind
  targetId: string
}

export interface MovementDefinition {
  id: string
  name: string
  intent: string
  domains: CoachProgramDomainId[]
  patterns: MovementPattern[]
  regions: BodyRegion[]
  equipment: MovementEquipmentId[]
  skillLevel: MovementSkillLevel
  fatigueCost: ProgrammingCost
  impactCost: ProgrammingCost
  unilateral: boolean
  overhead: boolean
  running: boolean
  programmingStatus: 'active' | 'evidence_only'
  assessmentAliases: string[]
  coverage: MovementCoverageTag[]
  substitutionGroup: string
  progressionFamily: string
}

export interface MovementEligibilityContext {
  availableEquipmentIds: readonly MovementEquipmentId[]
  trainingExperience: TrainingExperience
  assessedMovementIds?: readonly string[]
  noOverhead: boolean
  noRunning: boolean
}

export interface FindEligibleMovementsRequest {
  domain: CoachProgramDomainId
  requiredCoverage?: readonly MovementCoverageTag[]
  eligibility: MovementEligibilityContext
}

export interface FindMovementSubstitutionsRequest {
  movementId: string
  domain: CoachProgramDomainId
  requiredCoverage: readonly MovementCoverageTag[]
  eligibility: MovementEligibilityContext
}

export interface MovementCatalogValidation {
  ok: boolean
  errors: string[]
}

type MovementOptions = Partial<Pick<MovementDefinition,
  'skillLevel'
  | 'fatigueCost'
  | 'impactCost'
  | 'unilateral'
  | 'overhead'
  | 'running'
  | 'programmingStatus'
  | 'assessmentAliases'
>>

const tag = (kind: WeeklyCoverageKind, targetId: string): MovementCoverageTag => ({
  kind,
  targetId
})

const MOVEMENTS: MovementDefinition[] = [
  movement(
    'barbell_back_squat', 'Barbell back squat', 'Build force in a knee-dominant pattern.',
    ['strength', 'hypertrophy'], ['squat'], ['quadriceps', 'glutes'], ['barbell', 'rack'],
    [tag('movement_pattern', 'knee_dominant'), tag('muscle_region', 'quadriceps'), tag('muscle_region', 'glutes')],
    'resistance:knee_dominant', 'squat:bilateral_loaded',
    { skillLevel: 'high', fatigueCost: 'high', impactCost: 'moderate', assessmentAliases: ['back squat', 'squat'] }
  ),
  movement(
    'dumbbell_goblet_squat', 'Dumbbell goblet squat', 'Build knee-dominant strength with a compact setup.',
    ['strength', 'hypertrophy'], ['squat'], ['quadriceps', 'glutes'], ['dumbbell'],
    [tag('movement_pattern', 'knee_dominant'), tag('muscle_region', 'quadriceps'), tag('muscle_region', 'glutes')],
    'resistance:knee_dominant', 'squat:goblet',
    { assessmentAliases: ['goblet squat'], fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'kettlebell_goblet_squat', 'Kettlebell goblet squat', 'Build knee-dominant strength with a compact setup.',
    ['strength', 'hypertrophy'], ['squat'], ['quadriceps', 'glutes'], ['kettlebell'],
    [tag('movement_pattern', 'knee_dominant'), tag('muscle_region', 'quadriceps'), tag('muscle_region', 'glutes')],
    'resistance:knee_dominant', 'squat:goblet',
    { assessmentAliases: ['goblet squat'], fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'tempo_split_squat', 'Tempo split squat', 'Build controlled single-leg strength and capacity.',
    ['strength', 'hypertrophy', 'resilience'], ['squat'], ['quadriceps', 'glutes'], ['bodyweight'],
    [tag('movement_pattern', 'knee_dominant'), tag('muscle_region', 'quadriceps'), tag('resilience_capacity', 'single_leg_control')],
    'resistance:knee_dominant', 'split_squat:bodyweight',
    { unilateral: true, assessmentAliases: ['split squat'], fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'reverse_lunge', 'Reverse lunge', 'Build single-leg force and control.',
    ['strength', 'hypertrophy', 'resilience'], ['squat'], ['quadriceps', 'glutes'], ['bodyweight'],
    [tag('movement_pattern', 'knee_dominant'), tag('muscle_region', 'quadriceps'), tag('resilience_capacity', 'single_leg_control')],
    'resistance:knee_dominant', 'lunge:reverse',
    { unilateral: true, assessmentAliases: ['lunge'], fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'barbell_deadlift', 'Barbell deadlift', 'Build force through a loaded hinge.',
    ['strength'], ['hinge'], ['hamstrings', 'glutes', 'whole_body'], ['barbell'],
    [tag('movement_pattern', 'hip_hinge'), tag('muscle_region', 'posterior_chain')],
    'resistance:hip_hinge', 'hinge:deadlift_from_floor',
    { skillLevel: 'high', fatigueCost: 'high', impactCost: 'moderate', assessmentAliases: ['deadlift'] }
  ),
  movement(
    'dumbbell_romanian_deadlift', 'Dumbbell Romanian deadlift', 'Build posterior-chain force through length.',
    ['strength', 'hypertrophy'], ['hinge'], ['hamstrings', 'glutes'], ['dumbbell'],
    [tag('movement_pattern', 'hip_hinge'), tag('muscle_region', 'posterior_chain')],
    'resistance:hip_hinge', 'hinge:romanian_deadlift',
    { fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['romanian deadlift', 'rdl'] }
  ),
  movement(
    'barbell_romanian_deadlift', 'Barbell Romanian deadlift', 'Build posterior-chain force through length.',
    ['strength', 'hypertrophy'], ['hinge'], ['hamstrings', 'glutes'], ['barbell'],
    [tag('movement_pattern', 'hip_hinge'), tag('muscle_region', 'posterior_chain')],
    'resistance:hip_hinge', 'hinge:romanian_deadlift',
    { skillLevel: 'moderate', fatigueCost: 'high', impactCost: 'low', assessmentAliases: ['romanian deadlift', 'rdl'] }
  ),
  movement(
    'kettlebell_deadlift', 'Kettlebell deadlift', 'Build hinge strength with a compact setup.',
    ['strength', 'hypertrophy'], ['hinge'], ['hamstrings', 'glutes'], ['kettlebell'],
    [tag('movement_pattern', 'hip_hinge'), tag('muscle_region', 'posterior_chain')],
    'resistance:hip_hinge', 'hinge:deadlift_from_floor',
    { fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['deadlift'] }
  ),
  movement(
    'single_leg_hip_bridge', 'Single-leg hip bridge', 'Build posterior-chain capacity with bodyweight.',
    ['strength', 'hypertrophy', 'resilience'], ['hinge'], ['hamstrings', 'glutes'], ['bodyweight'],
    [tag('movement_pattern', 'hip_hinge'), tag('muscle_region', 'posterior_chain'), tag('resilience_capacity', 'single_leg_control')],
    'resistance:hip_hinge', 'bridge:single_leg',
    { unilateral: true, fatigueCost: 'low', impactCost: 'low', assessmentAliases: ['hip bridge'] }
  ),
  movement(
    'dumbbell_floor_press', 'Dumbbell floor press', 'Build horizontal pressing strength.',
    ['strength', 'hypertrophy'], ['horizontal_push'], ['chest', 'triceps'], ['dumbbell'],
    [tag('movement_pattern', 'horizontal_push'), tag('muscle_region', 'chest')],
    'resistance:horizontal_push', 'press:floor',
    { fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['floor press'] }
  ),
  movement(
    'barbell_floor_press', 'Barbell floor press', 'Build horizontal pressing strength.',
    ['strength', 'hypertrophy'], ['horizontal_push'], ['chest', 'triceps'], ['barbell'],
    [tag('movement_pattern', 'horizontal_push'), tag('muscle_region', 'chest')],
    'resistance:horizontal_push', 'press:floor',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['floor press'] }
  ),
  movement(
    'push_up', 'Push-up', 'Build horizontal pressing strength and capacity.',
    ['strength', 'hypertrophy', 'resilience'], ['horizontal_push'], ['chest', 'triceps', 'trunk'], ['bodyweight'],
    [tag('movement_pattern', 'horizontal_push'), tag('muscle_region', 'chest')],
    'resistance:horizontal_push', 'push_up:bodyweight',
    { fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['push-up'] }
  ),
  movement(
    'one_arm_dumbbell_row', 'One-arm dumbbell row', 'Build pulling strength and trunk control.',
    ['strength', 'hypertrophy'], ['horizontal_pull'], ['upper_back', 'lats'], ['dumbbell'],
    [tag('movement_pattern', 'horizontal_pull'), tag('muscle_region', 'upper_back')],
    'resistance:horizontal_pull', 'row:one_arm',
    { unilateral: true, fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['dumbbell row'] }
  ),
  movement(
    'cable_row', 'Cable row', 'Build horizontal pulling strength.',
    ['strength', 'hypertrophy'], ['horizontal_pull'], ['upper_back', 'lats'], ['cable'],
    [tag('movement_pattern', 'horizontal_pull'), tag('muscle_region', 'upper_back')],
    'resistance:horizontal_pull', 'row:cable',
    { fatigueCost: 'moderate', impactCost: 'low', assessmentAliases: ['cable row'] }
  ),
  movement(
    'band_row', 'Band row', 'Build repeatable horizontal pulling capacity.',
    ['strength', 'hypertrophy', 'resilience'], ['horizontal_pull'], ['upper_back', 'lats'], ['band'],
    [tag('movement_pattern', 'horizontal_pull'), tag('muscle_region', 'upper_back'), tag('resilience_capacity', 'scapular_control')],
    'resistance:horizontal_pull', 'row:band',
    { fatigueCost: 'low', impactCost: 'low', assessmentAliases: ['band row'] }
  ),
  movement(
    'barbell_overhead_press', 'Barbell overhead press', 'Build standing vertical pressing strength.',
    ['strength'], ['vertical_push'], ['shoulders', 'triceps'], ['barbell', 'rack'],
    [tag('movement_pattern', 'vertical_push'), tag('muscle_region', 'shoulders')],
    'resistance:vertical_push', 'press:standing_overhead',
    { skillLevel: 'high', fatigueCost: 'moderate', impactCost: 'low', overhead: true, assessmentAliases: ['overhead press', 'strict press'] }
  ),
  movement(
    'dumbbell_overhead_press', 'Dumbbell overhead press', 'Build standing vertical pressing strength.',
    ['strength', 'hypertrophy'], ['vertical_push'], ['shoulders', 'triceps'], ['dumbbell'],
    [tag('movement_pattern', 'vertical_push'), tag('muscle_region', 'shoulders')],
    'resistance:vertical_push', 'press:standing_overhead',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low', overhead: true, assessmentAliases: ['overhead press'] }
  ),
  movement(
    'pike_push_up', 'Pike push-up', 'Build vertical pressing capacity with bodyweight.',
    ['strength', 'hypertrophy'], ['vertical_push'], ['shoulders', 'triceps'], ['bodyweight'],
    [tag('movement_pattern', 'vertical_push'), tag('muscle_region', 'shoulders')],
    'resistance:vertical_push', 'press:pike',
    { fatigueCost: 'moderate', impactCost: 'low', overhead: true, assessmentAliases: ['pike push-up'] }
  ),
  movement(
    'box_jump', 'Box jump', 'Express vertical lower-body power with a stable landing.',
    ['power_explosiveness'], ['jump'], ['whole_body'], ['box'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'vertical_projection')],
    'power:lower_body_projection', 'jump:box',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high' }
  ),
  movement(
    'countermovement_jump', 'Countermovement jump', 'Express vertical lower-body power.',
    ['power_explosiveness'], ['jump'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'vertical_projection')],
    'power:lower_body_projection', 'jump:countermovement',
    { fatigueCost: 'low', impactCost: 'high' }
  ),
  movement(
    'squat_jump_to_stick', 'Squat jump to stick', 'Practice fast takeoff and controlled landing.',
    ['power_explosiveness', 'resilience'], ['jump', 'deceleration'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'vertical_projection'), tag('resilience_capacity', 'landing_control')],
    'power:lower_body_projection', 'jump:squat_to_stick',
    { fatigueCost: 'low', impactCost: 'moderate' }
  ),
  movement(
    'dumbbell_jump_squat', 'Dumbbell jump squat', 'Express vertical power under light external load.',
    ['power_explosiveness'], ['jump'], ['whole_body'], ['dumbbell'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'vertical_projection')],
    'power:lower_body_projection', 'jump:loaded_squat',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high' }
  ),
  movement(
    'broad_jump', 'Broad jump', 'Express horizontal lower-body power.',
    ['power_explosiveness'], ['jump'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'horizontal_projection'), tag('performance_quality', 'hip_extension_power')],
    'power:lower_body_projection', 'jump:broad',
    { fatigueCost: 'low', impactCost: 'high' }
  ),
  movement(
    'repeated_broad_jump', 'Repeated broad jump', 'Express repeated horizontal power.',
    ['power_explosiveness'], ['jump'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'horizontal_projection'), tag('performance_quality', 'hip_extension_power')],
    'power:lower_body_projection', 'jump:broad_repeated',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high' }
  ),
  movement(
    'kettlebell_swing', 'Kettlebell swing', 'Express fast hip extension.',
    ['power_explosiveness'], ['hinge'], ['hamstrings', 'glutes'], ['kettlebell'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'hip_extension_power')],
    'power:lower_body_projection', 'ballistic_hinge:kettlebell',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'barbell_jump_shrug', 'Barbell jump shrug', 'Express fast hip extension under light external load.',
    ['power_explosiveness'], ['hinge', 'jump'], ['whole_body'], ['barbell'],
    [tag('performance_quality', 'lower_body_power'), tag('performance_quality', 'hip_extension_power')],
    'power:lower_body_projection', 'ballistic_hinge:barbell',
    { skillLevel: 'high', fatigueCost: 'moderate', impactCost: 'moderate' }
  ),
  movement(
    'medicine_ball_chest_pass', 'Medicine-ball chest pass', 'Express upper-body projection power.',
    ['power_explosiveness'], ['throw', 'horizontal_push'], ['chest', 'triceps'], ['medicine_ball'],
    [tag('performance_quality', 'upper_body_power'), tag('movement_pattern', 'horizontal_push')],
    'power:upper_body_projection', 'throw:chest_pass',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'explosive_incline_push_up', 'Explosive incline push-up', 'Express upper-body projection power with bodyweight.',
    ['power_explosiveness'], ['horizontal_push'], ['chest', 'triceps'], ['bench'],
    [tag('performance_quality', 'upper_body_power'), tag('movement_pattern', 'horizontal_push')],
    'power:upper_body_projection', 'push_up:explosive_incline',
    { fatigueCost: 'low', impactCost: 'moderate' }
  ),
  movement(
    'short_hill_sprint', 'Short hill sprint', 'Practice powerful locomotor acceleration.',
    ['speed_agility'], ['sprint'], ['whole_body'], ['track'],
    [tag('performance_quality', 'locomotor_acceleration')],
    'speed:locomotor', 'sprint:hill_acceleration',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high', running: true }
  ),
  movement(
    'flat_acceleration_sprint', 'Flat acceleration sprint', 'Practice powerful locomotor acceleration.',
    ['speed_agility'], ['sprint'], ['whole_body'], ['track'],
    [tag('performance_quality', 'locomotor_acceleration')],
    'speed:locomotor', 'sprint:flat_acceleration',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high', running: true }
  ),
  movement(
    'flying_sprint', 'Flying sprint', 'Practice relaxed maximum-velocity mechanics.',
    ['speed_agility'], ['sprint'], ['whole_body'], ['track'],
    [tag('performance_quality', 'maximum_velocity')],
    'speed:locomotor', 'sprint:flying',
    { skillLevel: 'high', fatigueCost: 'moderate', impactCost: 'high', running: true }
  ),
  movement(
    'wicket_stride', 'Wicket stride', 'Practice upright rhythm and repeatable maximum-velocity positions.',
    ['speed_agility'], ['sprint'], ['whole_body'], ['track'],
    [tag('performance_quality', 'maximum_velocity')],
    'speed:locomotor', 'sprint:wicket_stride',
    { skillLevel: 'moderate', fatigueCost: 'low', impactCost: 'moderate', running: true }
  ),
  movement(
    'relaxed_stride', 'Relaxed stride', 'Practice upright rhythm below maximum output.',
    ['speed_agility'], ['sprint'], ['whole_body'], ['track'],
    [tag('performance_quality', 'maximum_velocity')],
    'speed:locomotor', 'sprint:stride',
    { skillLevel: 'moderate', fatigueCost: 'low', impactCost: 'moderate', running: true }
  ),
  movement(
    'bike_acceleration', 'Bike acceleration', 'Practice rapid force application in a cyclical modality.',
    ['speed_agility'], ['cyclical'], ['whole_body'], ['bike'],
    [tag('performance_quality', 'cyclical_speed_power')],
    'speed:cyclical', 'bike:acceleration',
    { fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'bike_cadence_sprint', 'Bike cadence sprint', 'Practice high-rate cyclical power.',
    ['speed_agility'], ['cyclical'], ['whole_body'], ['bike'],
    [tag('performance_quality', 'cyclical_speed_power')],
    'speed:cyclical', 'bike:cadence',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'fast_high_knee_march', 'Fast high-knee march', 'Practice acceleration positions and rhythm.',
    ['speed_agility'], ['locomotion'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'sprint_mechanics')],
    'speed:mechanics_drill', 'march:high_knee',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'fast_a_march', 'Fast A-march', 'Practice upright sprint rhythm.',
    ['speed_agility'], ['locomotion'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'sprint_mechanics')],
    'speed:mechanics_drill', 'march:a',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'wall_acceleration_drill', 'Wall acceleration drill', 'Rehearse projection and shin angle.',
    ['speed_agility'], ['locomotion'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'sprint_mechanics')],
    'speed:mechanics_drill', 'drill:wall_acceleration',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'straight_leg_bound', 'Straight-leg bound', 'Coordinate front-side mechanics and stiffness.',
    ['speed_agility'], ['locomotion', 'jump'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'sprint_mechanics')],
    'speed:mechanics_drill', 'bound:straight_leg',
    { skillLevel: 'moderate', fatigueCost: 'low', impactCost: 'high', running: true }
  ),
  movement(
    'build_up_to_controlled_stop', 'Build-up to controlled stop', 'Practice braking from forward speed.',
    ['speed_agility'], ['sprint', 'deceleration'], ['whole_body'], ['track'],
    [tag('performance_quality', 'deceleration_control')],
    'speed:deceleration', 'deceleration:linear',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'high', running: true }
  ),
  movement(
    'lateral_shuffle_to_stick', 'Lateral shuffle to stick', 'Practice lateral braking under control.',
    ['speed_agility', 'resilience'], ['locomotion', 'deceleration'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'deceleration_control'), tag('resilience_capacity', 'landing_control')],
    'speed:deceleration', 'deceleration:lateral_shuffle',
    { fatigueCost: 'low', impactCost: 'moderate' }
  ),
  movement(
    'snap_down_to_stick', 'Snap-down to athletic stance', 'Practice absorbing force into a stable position.',
    ['speed_agility', 'resilience'], ['deceleration'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'deceleration_control'), tag('resilience_capacity', 'landing_control')],
    'speed:deceleration', 'deceleration:snap_down',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'lateral_bound_to_stick', 'Lateral bound to stick', 'Practice single-leg lateral landing control.',
    ['speed_agility', 'resilience'], ['jump', 'deceleration'], ['whole_body'], ['bodyweight'],
    [tag('performance_quality', 'deceleration_control'), tag('resilience_capacity', 'landing_control')],
    'speed:deceleration', 'deceleration:lateral_bound',
    { unilateral: true, skillLevel: 'moderate', fatigueCost: 'low', impactCost: 'high' }
  ),
  movement(
    'easy_run', 'Run', 'Build aerobic capacity in the assigned intensity range.',
    ['aerobic'], ['locomotion'], ['whole_body'], ['track'],
    [tag('energy_system', 'aerobic_easy'), tag('energy_system', 'aerobic_tempo'), tag('energy_system', 'aerobic_intervals')],
    'aerobic:modality', 'aerobic:run',
    { fatigueCost: 'moderate', impactCost: 'high', running: true }
  ),
  movement(
    'bike_erg', 'Bike erg', 'Build aerobic capacity in a low-impact cyclical modality.',
    ['aerobic'], ['cyclical'], ['whole_body'], ['bike'],
    [tag('energy_system', 'aerobic_easy'), tag('energy_system', 'aerobic_tempo'), tag('energy_system', 'aerobic_intervals')],
    'aerobic:modality', 'aerobic:bike',
    { fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'row_erg', 'Row erg', 'Build aerobic capacity in a whole-body cyclical modality.',
    ['aerobic'], ['cyclical'], ['whole_body'], ['rower'],
    [tag('energy_system', 'aerobic_easy'), tag('energy_system', 'aerobic_tempo'), tag('energy_system', 'aerobic_intervals')],
    'aerobic:modality', 'aerobic:row',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'incline_walk', 'Incline walk', 'Build aerobic capacity through controlled uphill walking.',
    ['aerobic'], ['locomotion'], ['whole_body'], ['treadmill'],
    [tag('energy_system', 'aerobic_easy'), tag('energy_system', 'aerobic_tempo'), tag('energy_system', 'aerobic_intervals')],
    'aerobic:modality', 'aerobic:incline_walk',
    { fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'brisk_walk', 'Brisk walk', 'Build accessible low-impact aerobic capacity.',
    ['aerobic', 'resilience'], ['locomotion'], ['whole_body'], ['bodyweight'],
    [tag('energy_system', 'aerobic_easy'), tag('energy_system', 'aerobic_tempo')],
    'aerobic:modality', 'aerobic:walk',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'single_leg_calf_raise', 'Single-leg calf raise', 'Build foot and ankle capacity.',
    ['hypertrophy', 'resilience'], ['calf_raise'], ['calves'], ['bodyweight'],
    [tag('muscle_region', 'calves'), tag('resilience_capacity', 'lower_leg_capacity')],
    'capacity:calf', 'calf_raise:straight_knee',
    { unilateral: true, fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'bent_knee_calf_raise', 'Bent-knee calf raise', 'Build lower-leg capacity with a bent knee.',
    ['hypertrophy', 'resilience'], ['calf_raise'], ['calves'], ['bodyweight'],
    [tag('muscle_region', 'calves'), tag('resilience_capacity', 'lower_leg_capacity')],
    'capacity:calf', 'calf_raise:bent_knee',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'side_plank', 'Side plank', 'Build lateral trunk capacity.',
    ['resilience'], ['trunk_anti_lateral_flexion'], ['trunk'], ['bodyweight'],
    [tag('resilience_capacity', 'lateral_trunk_capacity')],
    'capacity:lateral_trunk', 'trunk:side_plank',
    { unilateral: true, fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'suitcase_carry', 'Suitcase carry', 'Build lateral trunk and grip capacity.',
    ['resilience'], ['carry', 'trunk_anti_lateral_flexion'], ['trunk', 'whole_body'], ['dumbbell'],
    [tag('resilience_capacity', 'lateral_trunk_capacity')],
    'capacity:lateral_trunk', 'carry:suitcase',
    { unilateral: true, fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'dead_bug', 'Dead bug', 'Build trunk control while breathing.',
    ['resilience'], ['trunk_anti_extension'], ['trunk'], ['bodyweight'],
    [tag('resilience_capacity', 'trunk_control')],
    'capacity:trunk_control', 'trunk:dead_bug',
    { unilateral: true, fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'bird_dog', 'Bird dog', 'Build trunk control across opposite limbs.',
    ['resilience'], ['trunk_anti_extension'], ['trunk'], ['bodyweight'],
    [tag('resilience_capacity', 'trunk_control')],
    'capacity:trunk_control', 'trunk:bird_dog',
    { unilateral: true, fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'prone_y_raise', 'Prone Y raise', 'Build repeatable shoulder-blade control.',
    ['resilience'], ['scapular_control'], ['upper_back', 'shoulders'], ['bodyweight'],
    [tag('resilience_capacity', 'scapular_control')],
    'capacity:scapular_control', 'scapular:prone_y',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'prone_w_raise', 'Prone W raise', 'Build repeatable upper-back and shoulder-blade control.',
    ['hypertrophy', 'resilience'], ['scapular_control'], ['upper_back', 'shoulders'], ['bodyweight'],
    [tag('muscle_region', 'upper_back'), tag('resilience_capacity', 'scapular_control')],
    'capacity:scapular_control', 'scapular:prone_w',
    { fatigueCost: 'low', impactCost: 'low', assessmentAliases: ['prone raise'] }
  ),
  movement(
    'bear_crawl', 'Bear crawl', 'Coordinate trunk and shoulder control under locomotion.',
    ['resilience'], ['crawl'], ['whole_body', 'trunk'], ['bodyweight'],
    [tag('resilience_capacity', 'whole_body_capacity')],
    'capacity:whole_body', 'crawl:bear',
    { fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'farmer_carry', 'Farmer carry', 'Build whole-body bracing, grip, and work capacity.',
    ['resilience'], ['carry'], ['whole_body', 'trunk'], ['dumbbell'],
    [tag('resilience_capacity', 'whole_body_capacity')],
    'capacity:whole_body', 'carry:farmer',
    { fatigueCost: 'moderate', impactCost: 'low' }
  ),
  movement(
    'easy_mobility_flow', 'Easy mobility flow', 'Move through useful ranges without adding fatigue.',
    ['resilience'], ['mobility'], ['whole_body'], ['bodyweight'],
    [tag('resilience_capacity', 'movement_capacity')],
    'capacity:movement_flow', 'mobility:flow',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'breathing_mobility_flow', 'Breathing mobility flow', 'Pair relaxed breathing with low-cost movement.',
    ['resilience'], ['mobility'], ['whole_body'], ['bodyweight'],
    [tag('resilience_capacity', 'movement_capacity')],
    'capacity:movement_flow', 'mobility:breathing_flow',
    { fatigueCost: 'low', impactCost: 'low' }
  ),
  movement(
    'barbell_bench_press', 'Barbell bench press', 'Build horizontal pressing strength with a barbell.',
    ['strength', 'hypertrophy'], ['horizontal_push'], ['chest', 'triceps'], ['barbell', 'bench'],
    [tag('movement_pattern', 'horizontal_push'), tag('muscle_region', 'chest')],
    'resistance:horizontal_push', 'press:barbell_bench',
    { skillLevel: 'moderate', fatigueCost: 'moderate', impactCost: 'low', programmingStatus: 'evidence_only', assessmentAliases: ['bench press', 'barbell bench press'] }
  )
]

export const MOVEMENT_CATALOG: readonly MovementDefinition[] = MOVEMENTS

export function isMovementEligible(
  movementDefinition: MovementDefinition,
  context: MovementEligibilityContext
): boolean {
  const equipment = new Set<MovementEquipmentId>([
    ...context.availableEquipmentIds,
    'bodyweight'
  ])
  const skillLimit: Record<TrainingExperience, number> = {
    new_or_returning: 0,
    consistent: 1,
    experienced: 2
  }
  const skillRank: Record<MovementSkillLevel, number> = {
    low: 0,
    moderate: 1,
    high: 2
  }

  const skillEligible = skillRank[movementDefinition.skillLevel] <= skillLimit[context.trainingExperience]
    || context.assessedMovementIds?.includes(movementDefinition.id) === true

  return movementDefinition.programmingStatus === 'active'
    && movementDefinition.equipment.every(required => equipment.has(required))
    && skillEligible
    && !(context.noOverhead && movementDefinition.overhead)
    && !(context.noRunning && movementDefinition.running)
}

export function findEligibleMovements(
  request: FindEligibleMovementsRequest
): MovementDefinition[] {
  return MOVEMENT_CATALOG.filter(movementDefinition => (
    movementDefinition.domains.includes(request.domain)
    && coversEvery(movementDefinition, request.requiredCoverage ?? [])
    && isMovementEligible(movementDefinition, request.eligibility)
  ))
}

export function findMovementSubstitutions(
  request: FindMovementSubstitutionsRequest
): MovementDefinition[] {
  const source = MOVEMENT_CATALOG.find(candidate => candidate.id === request.movementId)
  if (!source) throw new Error(`Unknown movement: ${request.movementId}`)
  if (
    !source.domains.includes(request.domain)
    || !coversEvery(source, request.requiredCoverage)
  ) return []

  return MOVEMENT_CATALOG.filter(candidate => (
    candidate.id !== source.id
    && candidate.substitutionGroup === source.substitutionGroup
    && candidate.domains.includes(request.domain)
    && coversEvery(candidate, request.requiredCoverage)
    && isMovementEligible(candidate, request.eligibility)
  ))
}

export function getMovementsByAssessmentAlias(value: string): MovementDefinition[] {
  const normalized = normalizeAlias(value)
  if (!normalized) return []

  return MOVEMENT_CATALOG.filter(movementDefinition => (
    normalizeAlias(movementDefinition.name) === normalized
    || movementDefinition.assessmentAliases.some(alias => normalizeAlias(alias) === normalized)
  ))
}

export function validateMovementCatalog(
  catalog: readonly MovementDefinition[] = MOVEMENT_CATALOG
): MovementCatalogValidation {
  const errors: string[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  for (const movementDefinition of catalog) {
    if (ids.has(movementDefinition.id)) errors.push(`Duplicate movement ID: ${movementDefinition.id}`)
    ids.add(movementDefinition.id)

    const normalizedName = normalizeAlias(movementDefinition.name)
    if (names.has(normalizedName)) errors.push(`Duplicate movement name: ${movementDefinition.name}`)
    names.add(normalizedName)

    if (movementDefinition.domains.length === 0) {
      errors.push(`Movement ${movementDefinition.id} needs at least one domain`)
    }
    if (movementDefinition.coverage.length === 0) {
      errors.push(`Movement ${movementDefinition.id} needs at least one coverage tag`)
    }
    if (movementDefinition.equipment.length === 0) {
      errors.push(`Movement ${movementDefinition.id} needs explicit equipment`)
    }
    if (!/^[a-z0-9_]+$/.test(movementDefinition.id)) {
      errors.push(`Movement ${movementDefinition.id} needs a stable snake_case ID`)
    }
    if (!movementDefinition.intent.trim()) {
      errors.push(`Movement ${movementDefinition.id} needs an intent`)
    }
    if (!movementDefinition.substitutionGroup.trim() || !movementDefinition.progressionFamily.trim()) {
      errors.push(`Movement ${movementDefinition.id} needs substitution and progression families`)
    }

    for (const [label, values] of [
      ['domains', movementDefinition.domains],
      ['patterns', movementDefinition.patterns],
      ['equipment', movementDefinition.equipment],
      ['assessment aliases', movementDefinition.assessmentAliases.map(normalizeAlias)]
    ] as const) {
      if (new Set(values).size !== values.length) {
        errors.push(`Movement ${movementDefinition.id} has duplicate ${label}`)
      }
    }

    const coverageKeys = movementDefinition.coverage.map(coverageKey)
    if (new Set(coverageKeys).size !== coverageKeys.length) {
      errors.push(`Movement ${movementDefinition.id} has duplicate coverage tags`)
    }

    const hasCompatibleSubstitution = catalog.some(candidate => (
      candidate.id !== movementDefinition.id
      && candidate.substitutionGroup === movementDefinition.substitutionGroup
      && candidate.domains.some(domain => movementDefinition.domains.includes(domain))
      && candidate.coverage.some(candidateTag => (
        movementDefinition.coverage.some(sourceTag => coverageKey(sourceTag) === coverageKey(candidateTag))
      ))
    ))
    if (!hasCompatibleSubstitution) {
      errors.push(`Movement ${movementDefinition.id} has no compatible substitution`)
    }
  }

  for (const domain of COACH_PROGRAM_DOMAIN_IDS) {
    const hasBodyweightFallback = catalog.some(movementDefinition => (
      movementDefinition.domains.includes(domain)
      && movementDefinition.skillLevel === 'low'
      && movementDefinition.equipment.every(equipment => equipment === 'bodyweight')
    ))
    if (!hasBodyweightFallback) errors.push(`Domain ${domain} has no low-skill bodyweight fallback`)
  }

  return { ok: errors.length === 0, errors }
}

function movement(
  id: string,
  name: string,
  intent: string,
  domains: CoachProgramDomainId[],
  patterns: MovementPattern[],
  regions: BodyRegion[],
  equipment: MovementEquipmentId[],
  coverage: MovementCoverageTag[],
  substitutionGroup: string,
  progressionFamily: string,
  options: MovementOptions = {}
): MovementDefinition {
  return {
    id,
    name,
    intent,
    domains,
    patterns,
    regions,
    equipment,
    skillLevel: options.skillLevel ?? 'low',
    fatigueCost: options.fatigueCost ?? 'low',
    impactCost: options.impactCost ?? 'low',
    unilateral: options.unilateral ?? false,
    overhead: options.overhead ?? false,
    running: options.running ?? false,
    programmingStatus: options.programmingStatus ?? 'active',
    assessmentAliases: options.assessmentAliases ?? [],
    coverage,
    substitutionGroup,
    progressionFamily
  }
}

function coversEvery(
  movementDefinition: MovementDefinition,
  requiredCoverage: readonly MovementCoverageTag[]
): boolean {
  const available = new Set(movementDefinition.coverage.map(coverageKey))
  return requiredCoverage.every(required => available.has(coverageKey(required)))
}

function coverageKey(value: MovementCoverageTag): string {
  return `${value.kind}:${value.targetId}`
}

function normalizeAlias(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
