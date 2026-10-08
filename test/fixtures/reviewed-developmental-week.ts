/** Mechanical lowering of the accepted synthetic source. No default/live registry. */
import source from './reviewed-developmental-bench-week.json'
import { doseContentHash, INITIAL_DOSE_POLICY_VERSION } from '@/app/lib/coach/initial-dose-policy'
import { REVIEWED_WEEK_DAYS, type OfflineReviewedWeekContext, type ReviewedWeekActivity as Activity,
  type ReviewedWeekEffort as Effort, type ReviewedWeekStep as Step, type ReviewedWeekRecipe,
  type ReviewedWeekRegistration, type ReviewedWeekSession, type ReviewedWeekSchedule } from '@/app/lib/coach/offline-reviewed-week'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'

const rpe = (min: number, max: number): Effort => ({ kind: 'rpe', min, max })
const perceived = (min: number, max = min): Effort => ({ kind: 'perceived_percent', min, max,
  cue: 'Controlled familiar effort; not measured speed or an RPE conversion.' })
const equipment: Record<string, string[]> = {
  bike: ['stationary_bike'], a_march: ['measured_running_area'], a_skip: ['measured_running_area'],
  run: ['measured_running_area', 'safe_runout'], barbell_bench_press: ['flat_bench', 'rack_safeties', 'barbell_45lb', 'plates'],
  barbell_back_squat: ['rack_safeties', 'barbell_45lb', 'plates'], high_handle_trap_bar: ['high_handle_trap_bar', 'plates'],
  chest_supported_dumbbell_row: ['flat_bench', 'dumbbells'], cable_triceps_pressdown: ['cable_station'],
  band_pull_apart: ['resistance_band'], pull_up: ['pull_up_bar'],
}
function rep(id: string, movementId: string, sets: number, min: number, max: number, effort: Effort,
  restBetweenSeconds: number, load: number | 'bodyweight' | 'selected' = 'bodyweight',
  role: Activity['role'] = 'working', restAfterSeconds = 0, sides: 1 | 2 = 1): Activity {
  return { kind: 'activity', id, movementId, role, requiredEquipment: equipment[movementId] ?? ['bodyweight'], sets,
    work: { kind: 'repetitions', repetitions: { min, max }, sides, secondsPerRep: 3 },
    load: typeof load === 'number' ? { kind: 'external', value: load, unit: 'lb', convention: 'total' }
      : load === 'selected' ? { kind: 'athlete_selected', instruction: role === 'preparation' ? 'Light familiar rehearsal load.' : 'Familiar load/assistance at target RPE; record actual selection.' }
      : { kind: 'bodyweight' },
    effort, restBetweenSeconds, restAfterSeconds, protocolId: null,
    instructions: [sides === 2 ? 'Repetitions per side; alternate sides.' : 'Listed repetitions are total.',
      'Prescribed effort only; record actual load, reps, RPE and symptoms separately.'],
  }
}
function duration(id: string, movement: string, seconds: number, role: Activity['role'],
  effort: Effort = role === 'cooldown' ? { kind: 'quality', cue: 'Easy walk/jog as prescribed.' } : rpe(3, 4)): Activity {
  return { ...rep(id, movement, 1, 1, 1, effort, 0, 'bodyweight', role),
    work: { kind: 'duration', seconds, sides: 1, sideSwitchSeconds: 0 }, load: { kind: 'not_applicable' }, instructions: [] }
}
function run(id: string, sets: number, metres: number, allowanceSeconds: number, effort: Effort,
  restBetweenSeconds: number, restAfterSeconds = 0, role: Activity['role'] = 'working'): Activity {
  return { ...rep(id, 'run', sets, 1, 1, effort, restBetweenSeconds, 'bodyweight', role, restAfterSeconds),
    work: { kind: 'distance', stages: [{ label: 'run', metres }], targetSeconds: null, allowanceSeconds, finish: 'Safe deceleration/runout.' },
    instructions: ['Stop for symptoms or loss of smooth mechanics.'], load: { kind: 'not_applicable' } }
}
const allowance = (id: string, seconds: number, purpose: 'recovery' | 'transition' | 'logging' = 'recovery'): Step => ({ kind: 'allowance', id, seconds, purpose })
function drills(prefix: string): Activity[] {
  // Ten seconds per 15 m drill trip is an implementation accounting allowance
  // inside the reviewed fixed preparation window, not a pace instruction.
  return ['a_march', 'a_skip'].map(movement => ({ ...run(`${prefix}-${movement}`, 2, 15, 10, rpe(3, 4), 30, 30, 'preparation'),
    movementId: movement, requiredEquipment: equipment[movement] }))
}
function prep(id: string, seconds: number, activities: Activity[]): Step {
  return { kind: 'preparation_window', id, seconds, activities,
    instructions: ['Ordered preparation at RPE 3–4. Remaining time is setup/recovery; do not shorten prescribed rests.'] }
}
function lowerPrep(hinge: boolean): Step {
  return prep('preparation', 600, [duration('easy-bike', 'bike', 300, 'preparation'), ...drills('prep'),
    rep('bodyweight-rehearsal', hinge ? 'bodyweight_hinge' : 'bodyweight_squat', 1, 8, 8, rpe(3, 4), 0, 'bodyweight', 'preparation'),
    run('build-ups', 2, 20, 5, rpe(3, 4), 30, 0, 'preparation')])
}
function benchPrep(seconds: number, bikeSeconds: number): Step {
  return prep('preparation', seconds, [duration('easy-bike', 'bike', bikeSeconds, 'preparation'),
    rep('band', 'band_pull_apart', 1, 15, 15, rpe(3, 4), 0, 'selected', 'preparation', 30),
    rep('scapular', 'scapular_push_up', 1, 8, 8, rpe(3, 4), 0, 'bodyweight', 'preparation')])
}
function ramp(movement: string, doses: number[][]): Activity[] {
  return doses.map(([load, reps, rest], index) => rep(`ramp-${index + 1}`, movement, 1, reps, reps, rpe(3, 4), 0, load, 'preparation', rest))
}
const deadbug = () => rep('dead-bug', 'dead_bug', 2, 6, 6, rpe(5, 6), 60, 'bodyweight', 'working', 0, 2)
function monitor(movement: string, load: number, protocolId: string): Activity {
  return { ...rep('monitoring', movement, 1, 2, 2, { kind: 'rpe_ceiling', max: 7 }, 0, load, 'monitoring', 180),
    protocolId, instructions: [source.monitoring.prescriptionMarkdown] }
}
const end = (transition: number): Step[] => [
  ...(transition ? [allowance('transitions', transition, 'transition')] : []), allowance('logging', 180, 'logging'),
]
function session(id: string, themes: string[], steps: Step[]): ReviewedWeekSession {
  const original = source.sessions.find(value => value.id === id)!
  return { id, themes, steps, instructions: [original.prescriptionMarkdown, source.sharedExecutionMarkdown] }
}

export function reviewedDevelopmentalWeek(): { context: OfflineReviewedWeekContext; registry: ReviewedWeekRegistration[] } {
  const sessions: ReviewedWeekSession[] = [
    session('acceleration-squat', ['acceleration', 'lower_body_power', 'squat_strength', 'core'], [
      lowerPrep(false), rep('jumps', 'countermovement_jump', 3, 1, 1, rpe(6, 7), 60), allowance('before-acceleration', 120),
      run('acceleration', 4, 10, 3, perceived(80, 85), 120), allowance('before-squat', 180),
      ...ramp('barbell_back_squat', [[45, 8, 60], [135, 5, 90], [185, 3, 90], [225, 1, 180]]),
      rep('squat', 'barbell_back_squat', 3, 3, 3, rpe(6, 7), 180, 245), allowance('before-core', 120),
      { ...rep('side-plank', 'side_plank', 2, 1, 1, rpe(5, 6), 60),
        work: { kind: 'duration', seconds: 30, sides: 2, sideSwitchSeconds: 15 }, instructions: ['30 seconds per side each round; 15 seconds to switch sides.'] },
      allowance('before-calves', 60), rep('calves', 'bodyweight_calf_raise', 2, 12, 12, rpe(6, 7), 60),
      duration('cooldown', 'walk', 180, 'cooldown'), ...end(120),
    ]),
    session('bench-volume', ['bench_volume', 'upper_body_pull', 'triceps'], [
      benchPrep(300, 180), ...ramp('barbell_bench_press', [[45, 10, 60], [95, 5, 60], [135, 3, 90], [155, 1, 180]]),
      rep('bench', 'barbell_bench_press', 4, 6, 6, rpe(7, 8), 180, 175), allowance('before-row', 120),
      rep('row-rehearsal', 'chest_supported_dumbbell_row', 1, 5, 5, rpe(3, 4), 0, 'selected', 'preparation', 60),
      rep('rows', 'chest_supported_dumbbell_row', 3, 10, 10, rpe(7, 8), 90, 'selected'), allowance('before-triceps', 120),
      rep('triceps-rehearsal', 'cable_triceps_pressdown', 1, 5, 5, rpe(3, 4), 0, 'selected', 'preparation', 60),
      rep('triceps', 'cable_triceps_pressdown', 2, 15, 15, rpe(7, 8), 60, 'selected'),
      duration('cooldown', 'walk', 180, 'cooldown'), ...end(0),
    ]),
    session('running', ['running_intervals', 'core'], [
      duration('easy-jog', 'run', 300, 'preparation'), prep('drill-preparation', 300, [...drills('prep'),
        rep('lunges', 'walking_lunge', 1, 10, 10, rpe(3, 4), 0, 'bodyweight', 'preparation')]),
      run('strides', 2, 20, 5, perceived(80), 60), allowance('before-intervals', 120),
      { ...run('intervals', 5, 400, 100, rpe(7, 8), 120),
        work: { kind: 'distance', stages: [{ label: 'interval', metres: 400 }], targetSeconds: 100, allowanceSeconds: 100, finish: 'Walk during recovery.' },
        instructions: ['Reassess if materially harder than target RPE; do not force the split.'] },
      duration('cooldown', 'run', 300, 'cooldown'), allowance('core-preparation', 60), deadbug(), ...end(120),
    ]),
    session('upright-trap-bar', ['upright_speed_exposure', 'pull_strength', 'core'], [
      lowerPrep(true), { ...run('upright-runs', 3, 30, 8, perceived(80, 85), 180),
        work: { kind: 'distance', stages: [{ label: 'gradual entry', metres: 20 }, { label: 'relaxed upright running', metres: 10 }],
          targetSeconds: null, allowanceSeconds: 8, finish: 'Safe deceleration; not a maximal flying-speed test.' } },
      allowance('before-pull', 180), ...ramp('high_handle_trap_bar', [[135, 5, 60], [225, 3, 90], [285, 2, 180]]),
      monitor('high_handle_trap_bar', 335, 'dev-high-handle-pull-v1'),
      rep('pull', 'high_handle_trap_bar', 3, 3, 3, rpe(7, 8), 180, 365), allowance('before-core', 120), deadbug(),
      duration('cooldown', 'walk', 180, 'cooldown'), ...end(180),
    ]),
    session('bench-force', ['bench_force', 'upper_body_pull', 'aerobic_support'], [
      benchPrep(480, 300), ...ramp('barbell_bench_press', [[45, 10, 60], [95, 5, 60], [135, 3, 90], [165, 1, 180]]),
      monitor('barbell_bench_press', 185, 'dev-bench-v1'), rep('bench', 'barbell_bench_press', 4, 2, 2, rpe(7, 8), 180, 205),
      allowance('before-pull-ups', 180), rep('pull-ups', 'pull_up', 3, 6, 8, rpe(7, 8), 120, 'selected'),
      allowance('before-bike', 120), duration('aerobic-bike', 'bike', 1500, 'working'), ...end(60),
    ]),
  ]
  const profile = structuredClone(GOLDEN_PROGRAMMING_PROFILES[1].profile)
  profile.primaryGoal = { id: 'strength', domain: 'strength', role: 'primary', allocation: 'lead', athleteIntent: 'Strength priority' }
  profile.secondaryGoals = ['aerobic', 'power_explosiveness'].map(domain => ({ id: domain, domain: domain as 'aerobic' | 'power_explosiveness',
    role: 'secondary', allocation: 'development', athleteIntent: 'Supporting running and power' }))
  profile.athleteGoalSummary = 'Synthetic developmental strength week with supporting running and power'
  profile.trainingExperience = 'experienced'
  profile.sessionAvailability = REVIEWED_WEEK_DAYS.filter(day => source.availabilityMinutes[day] > 0)
    .map(day => ({ day, minutes: source.availabilityMinutes[day] }))
  profile.equipment = { resolvedIds: ['bodyweight', ...new Set(Object.values(equipment).flat())], unresolvedAthleteDescription: null }
  const facts = { evidenceStatus: 'synthetic_declared', familiarMovementsAndDoses: true, pain: false, adverseResponse: false,
    unusualRecoveryProblem: false, outsideTraining: [],
    commitments: { wednesdayBenchEvening: 'repeatedly missed', tuesday: 'reliable', wednesdayRunningMorning: 'available' },
    monitoringMetadata: null, historicalVelocities: [], sourceHash: source.source.sha256 }
  const recipe: ReviewedWeekRecipe = {
    id: source.id, policyVersion: INITIAL_DOSE_POLICY_VERSION,
    review: { id: source.source.questionId, contentHash: source.source.sha256 },
    sources: [{ id: source.source.path, revision: 1, contentHash: source.source.sha256 }],
    profileHash: doseContentHash(profile), contextHash: doseContentHash(facts), sessions,
    baseSchedule: structuredClone(source.baseSchedule) as ReviewedWeekSchedule,
    schedules: [{ id: 'base', days: structuredClone(source.baseSchedule) as ReviewedWeekSchedule, reason: 'Reviewed comparison base.' },
      { id: 'tuesday-bench', days: structuredClone(source.reviewedSchedule) as ReviewedWeekSchedule, reason: 'Move complete bench volume to the reliable Tuesday slot; running remains in the existing allocation.' }],
    protocols: [
      { id: 'dev-bench-v1', sessionId: 'bench-force', activityId: 'monitoring', instructions: [source.monitoring.prescriptionMarkdown], sensorMetadata: null, actualObservations: [] },
      { id: 'dev-high-handle-pull-v1', sessionId: 'upright-trap-bar', activityId: 'monitoring', instructions: [source.monitoring.prescriptionMarkdown], sensorMetadata: null, actualObservations: [] },
    ],
    instructions: [source.sharedExecutionMarkdown],
    limitations: ['Synthetic reviewed case; not the athlete current program or formal testing.',
      'Saturday requires 75 minutes; this does not prove five 60-minute sessions.',
      'No load progression, actual RPE, velocity series, max estimate or general numerical authority inferred.',
      'Three seconds per rep/jump/10 m acceleration, five per stride and eight per upright run are timing allowances, not execution tempos.',
      'Preparation drill trips use a ten-second accounting allowance within the reviewed preparation windows; no drill pace was prescribed.'],
  }
  return { context: { recipeId: recipe.id, scheduleId: 'tuesday-bench', profile, facts,
    currentReviews: [recipe.review], currentSources: structuredClone(recipe.sources), unresolvedReasons: [] },
    registry: [{ recipe, contentHash: doseContentHash(recipe) }] }
}
