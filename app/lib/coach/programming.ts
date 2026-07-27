import type {
  CoachPlanningContext,
  CoachPlanningInput,
  CoachPrescriptionBlock,
  CoachPrescriptionExercise,
  CoachProgramDomainId,
  CoachReferenceDomain,
  CoachSessionPrescription,
  CoachSessionVolumeLevel,
  CoachStrengthAssessmentSummary,
  EightWeekIntent,
  LoadUnit,
  TrainingExperience
} from './types'
import { COACH_REFERENCE_MANIFEST } from './reference'
import { COACH_POLICY_VERSION } from './policy'

type Equipment =
  | 'barbell'
  | 'rack'
  | 'dumbbell'
  | 'kettlebell'
  | 'bench'
  | 'band'
  | 'cable'
  | 'machine'
  | 'pull_up_bar'
  | 'medicine_ball'
  | 'box'
  | 'sled'
  | 'bike'
  | 'rower'
  | 'treadmill'
  | 'track'
  | 'bodyweight'

interface MovementOption {
  name: string
  requires?: readonly Equipment[]
  purpose: string
  assessmentAliases?: readonly string[]
  overhead?: boolean
  running?: boolean
}

interface SessionTemplate {
  role: string
  title: string
  primary: readonly MovementOption[]
  secondary: readonly MovementOption[]
}

interface DosePolicy {
  volume: CoachSessionVolumeLevel
  primary: string
  secondary: string
  effort: string
  rest: string
  stop: string
  percentRange?: [number, number]
}

interface ExplicitConstraints {
  noOverhead: boolean
  noRunning: boolean
}

const ALL_EQUIPMENT: readonly Equipment[] = [
  'barbell', 'rack', 'dumbbell', 'kettlebell', 'bench', 'band', 'cable', 'machine',
  'pull_up_bar', 'medicine_ball', 'box', 'sled', 'bike', 'rower', 'treadmill',
  'track', 'bodyweight'
]

const TEMPLATES: Record<CoachProgramDomainId, readonly SessionTemplate[]> = {
  strength: [
    {
      role: 'Squat + push',
      title: 'Squat + push',
      primary: [
        movement('Barbell back squat', 'Build lower-body strength.', ['back squat', 'squat'], ['barbell', 'rack']),
        movement('Dumbbell goblet squat', 'Build lower-body strength.', ['goblet squat'], ['dumbbell']),
        movement('Kettlebell goblet squat', 'Build lower-body strength.', ['goblet squat'], ['kettlebell']),
        movement('Tempo split squat', 'Build single-leg strength with minimal equipment.', ['split squat'])
      ],
      secondary: [
        movement('Dumbbell floor press', 'Build horizontal pressing strength.', ['floor press'], ['dumbbell']),
        movement('Barbell floor press', 'Build horizontal pressing strength.', ['floor press'], ['barbell']),
        movement('Push-up', 'Build horizontal pressing strength.', ['push up', 'push-up'])
      ]
    },
    {
      role: 'Hinge + pull',
      title: 'Hinge + pull',
      primary: [
        movement('Barbell deadlift', 'Build force through the hinge pattern.', ['deadlift'], ['barbell']),
        movement('Dumbbell Romanian deadlift', 'Build posterior-chain strength.', ['romanian deadlift', 'rdl'], ['dumbbell']),
        movement('Kettlebell deadlift', 'Build hinge strength with a compact setup.', ['deadlift'], ['kettlebell']),
        movement('Single-leg hip bridge', 'Build posterior-chain strength with bodyweight.', ['hip bridge'])
      ],
      secondary: [
        movement('One-arm dumbbell row', 'Build pulling strength and trunk control.', ['dumbbell row'], ['dumbbell']),
        movement('Cable row', 'Build horizontal pulling strength.', ['cable row'], ['cable']),
        movement('Band row', 'Build horizontal pulling strength.', ['band row'], ['band']),
        movement('Prone bodyweight row', 'Practice upper-back tension.', ['row'])
      ]
    },
    {
      role: 'Full-body strength',
      title: 'Full-body strength',
      primary: [
        movement('Barbell front squat', 'Build upright full-body strength.', ['front squat'], ['barbell', 'rack']),
        movement('Dumbbell split squat', 'Build single-leg strength.', ['split squat'], ['dumbbell']),
        movement('Rear-foot elevated split squat', 'Build single-leg strength.', ['split squat'], ['bench']),
        movement('Reverse lunge', 'Build single-leg strength.', ['lunge'])
      ],
      secondary: [
        movement(
          'Barbell overhead press',
          'Build standing pressing strength.',
          ['overhead press', 'strict press'],
          ['barbell', 'rack'],
          { overhead: true }
        ),
        movement(
          'Dumbbell overhead press',
          'Build standing pressing strength.',
          ['overhead press'],
          ['dumbbell'],
          { overhead: true }
        ),
        movement('Dumbbell floor press', 'Build pressing strength.', ['floor press'], ['dumbbell']),
        movement('Half-kneeling cable press', 'Build pressing strength with trunk control.', ['cable press'], ['cable']),
        movement('Push-up', 'Build pressing strength.', ['push up', 'push-up'])
      ]
    }
  ],
  hypertrophy: [
    {
      role: 'Lower + chest', title: 'Lower + chest',
      primary: [
        movement('Dumbbell goblet squat', 'Train quads and glutes close to fatigue.', ['goblet squat'], ['dumbbell']),
        movement('Barbell back squat', 'Train quads and glutes close to fatigue.', ['back squat', 'squat'], ['barbell', 'rack']),
        movement('Tempo split squat', 'Train quads and glutes close to fatigue.', ['split squat'])
      ],
      secondary: [
        movement('Dumbbell floor press', 'Train chest and triceps close to fatigue.', ['floor press'], ['dumbbell']),
        movement('Machine chest press', 'Train chest and triceps close to fatigue.', ['chest press'], ['machine']),
        movement('Push-up', 'Train chest and triceps close to fatigue.', ['push up', 'push-up'])
      ]
    },
    {
      role: 'Posterior + back', title: 'Posterior + back',
      primary: [
        movement('Dumbbell Romanian deadlift', 'Train hamstrings and glutes through length.', ['romanian deadlift', 'rdl'], ['dumbbell']),
        movement('Barbell Romanian deadlift', 'Train hamstrings and glutes through length.', ['romanian deadlift', 'rdl'], ['barbell']),
        movement('Single-leg hip bridge', 'Train glutes and hamstrings.', ['hip bridge'])
      ],
      secondary: [
        movement('One-arm dumbbell row', 'Train the upper back close to fatigue.', ['dumbbell row'], ['dumbbell']),
        movement('Cable row', 'Train the upper back close to fatigue.', ['cable row'], ['cable']),
        movement('Band row', 'Train the upper back close to fatigue.', ['band row'], ['band']),
        movement('Prone W raise', 'Train the upper back with bodyweight.', ['prone raise'])
      ]
    },
    {
      role: 'Full-body volume', title: 'Full-body volume',
      primary: [
        movement('Dumbbell split squat', 'Accumulate useful lower-body volume.', ['split squat'], ['dumbbell']),
        movement('Reverse lunge', 'Accumulate useful lower-body volume.', ['lunge'])
      ],
      secondary: [
        movement('Dumbbell floor press', 'Accumulate useful upper-body volume.', ['floor press'], ['dumbbell']),
        movement('Push-up', 'Accumulate useful upper-body volume.', ['push up', 'push-up'])
      ]
    }
  ],
  power_explosiveness: [
    {
      role: 'Takeoff', title: 'Jump and takeoff',
      primary: [
        movement('Box jump', 'Express lower-body power with a stable landing.', [], ['box']),
        movement('Broad jump', 'Express horizontal power.', []),
      ],
      secondary: [
        movement('Medicine-ball scoop toss', 'Project force through the hips.', [], ['medicine_ball']),
        movement('Kettlebell swing', 'Express fast hip extension.', [], ['kettlebell']),
        movement('Pogo jump', 'Build elastic stiffness.', [])
      ]
    },
    {
      role: 'Projection', title: 'Throw and project',
      primary: [
        movement('Medicine-ball chest pass', 'Express upper-body power.', [], ['medicine_ball']),
        movement('Explosive incline push-up', 'Express upper-body power.', [])
      ],
      secondary: [
        movement('Dumbbell jump squat', 'Express lower-body power under light load.', [], ['dumbbell']),
        movement('Countermovement jump', 'Express lower-body power.', [])
      ]
    },
    {
      role: 'Hip power', title: 'Hip power',
      primary: [
        movement('Kettlebell swing', 'Express fast hip extension.', [], ['kettlebell']),
        movement('Barbell jump shrug', 'Express fast hip extension under light load.', [], ['barbell']),
        movement('Repeated broad jump', 'Express repeated horizontal power.', [])
      ],
      secondary: [
        movement('Box jump', 'Reinforce crisp takeoff and landing.', [], ['box']),
        movement('Pogo jump', 'Build elastic stiffness.', [])
      ]
    }
  ],
  speed_agility: [
    {
      role: 'Acceleration', title: 'Acceleration',
      primary: [
        runningMovement('Short hill sprint', 'Practice powerful acceleration.'),
        movement('Bike acceleration', 'Practice rapid force and cadence.', [], ['bike']),
        movement('Fast high-knee march', 'Practice acceleration positions.', [])
      ],
      secondary: [
        movement('Wall acceleration drill', 'Reinforce projection and shin angle.', []),
        movement('Pogo jump', 'Build ankle stiffness for speed.', [])
      ]
    },
    {
      role: 'Max velocity', title: 'Max velocity',
      primary: [
        runningMovement('Flying sprint', 'Practice relaxed upright speed.'),
        movement('Bike cadence sprint', 'Practice high-rate cyclical power.', [], ['bike']),
        movement('Fast A-march', 'Practice upright rhythm.', [])
      ],
      secondary: [
        movement('Straight-leg bound', 'Coordinate front-side mechanics.', []),
        movement('Fast step-up', 'Train rapid force application.', [], ['box'])
      ]
    },
    {
      role: 'Deceleration + change', title: 'Deceleration and change of direction',
      primary: [
        runningMovement('Build-up to controlled stop', 'Practice braking under control.'),
        movement('Lateral shuffle to stick', 'Practice lateral braking.', [])
      ],
      secondary: [
        movement('Snap-down to athletic stance', 'Practice absorbing force.', []),
        movement('Lateral bound to stick', 'Practice single-leg deceleration.', [])
      ]
    }
  ],
  aerobic: [
    {
      role: 'Easy base', title: 'Easy aerobic base',
      primary: cardioOptions('Sustained easy'),
      secondary: [movement('Easy mobility flow', 'Finish down-regulated and moving well.', [])]
    },
    {
      role: 'Tempo', title: 'Controlled tempo',
      primary: cardioOptions('Tempo'),
      secondary: [movement('Easy recovery movement', 'Return to relaxed breathing.', [])]
    },
    {
      role: 'Aerobic intervals', title: 'Aerobic intervals',
      primary: cardioOptions('Aerobic interval'),
      secondary: [movement('Easy recovery movement', 'Return to relaxed breathing.', [])]
    }
  ],
  resilience: [
    {
      role: 'Lower capacity', title: 'Lower-body capacity',
      primary: [
        movement('Controlled split squat', 'Build tolerant single-leg capacity.', []),
        movement('Dumbbell split squat', 'Build tolerant single-leg capacity.', [], ['dumbbell'])
      ],
      secondary: [
        movement('Single-leg calf raise', 'Build foot and ankle capacity.', []),
        movement('Side plank', 'Build lateral trunk capacity.', [])
      ]
    },
    {
      role: 'Upper + trunk capacity', title: 'Upper-body and trunk capacity',
      primary: [
        movement('Band row', 'Build repeatable shoulder-blade control.', [], ['band']),
        movement('Prone Y raise', 'Build repeatable shoulder-blade control.', [])
      ],
      secondary: [
        movement('Dead bug', 'Build trunk control while breathing.', []),
        movement('Suitcase carry', 'Build trunk and grip capacity.', [], ['dumbbell'])
      ]
    },
    {
      role: 'Movement capacity', title: 'Movement capacity',
      primary: [
        movement('Step-down', 'Build controlled knee and hip capacity.', [], ['box']),
        movement('Reverse lunge', 'Build controlled lower-body capacity.', [])
      ],
      secondary: [
        movement('Bear crawl', 'Coordinate trunk and shoulder control.', []),
        movement('Farmer carry', 'Build whole-body work capacity.', [], ['dumbbell'])
      ]
    }
  ]
}

export function buildSessionPrescription(
  input: CoachPlanningInput,
  week: EightWeekIntent,
  sessionIndex: number,
  domain: CoachReferenceDomain,
  context: CoachPlanningContext = {}
): CoachSessionPrescription {
  const constraints = parseExplicitConstraints(input.constraints)
  const equipment = parseEquipment(input.equipment)
  const templates = TEMPLATES[input.primaryDomain]
  const template = templates[(sessionIndex - 1) % templates.length]
  const policy = policyFor(input.primaryDomain, week.week, input.experience)
  const primary = selectExercise(template.primary, equipment, constraints)
  const secondary = selectExercise(template.secondary, equipment, constraints)
  const primarySubstitutions = primaryAlternatives(template.primary, primary, equipment, constraints)
  const secondarySubstitutions = primaryAlternatives(template.secondary, secondary, equipment, constraints)
  const blocks = buildBlocks(
    input,
    policy,
    primary,
    secondary,
    primarySubstitutions,
    secondarySubstitutions,
    context.assessments ?? []
  )
  const deloadSuffix = week.role === 'deload_review'
    ? ' · Deload'
    : week.role === 'deload_assess' ? ' · Deload + Assess' : ''

  return {
    domain: input.primaryDomain,
    session_role: template.role,
    session_title: `${template.title}${deloadSuffix}`,
    intent: primary.purpose,
    dose: {
      source: 'validated_policy',
      sessionMinutes: input.sessionMinutes,
      structure: `${blocks.map(block => `${block.label} ${block.minutes} min`).join(' · ')}.`,
      volume_level: policy.volume,
      blocks
    },
    effort: policy.effort,
    rest: policy.rest,
    success_condition: `Complete the session with ${domain.feel.toLowerCase()}`,
    stop_condition: policy.stop,
    scale_options: [
      `Use ${primarySubstitutions[0] ?? 'an easier version'} for the primary movement.`,
      'Do one fewer working set while preserving the session intent.'
    ],
    constraint_notes: constraintNotes(constraints, input.constraints),
    progression: progressionFor(input.primaryDomain, week),
    evidence: {
      doctrineVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
      policyVersion: COACH_POLICY_VERSION
    }
  }
}

function buildBlocks(
  input: CoachPlanningInput,
  policy: DosePolicy,
  primary: MovementOption,
  secondary: MovementOption,
  primarySubstitutions: readonly string[],
  secondarySubstitutions: readonly string[],
  assessments: readonly CoachStrengthAssessmentSummary[]
): CoachPrescriptionBlock[] {
  const preparationMinutes = Math.max(5, Math.round(input.sessionMinutes * 0.15))
  const primaryMinutes = Math.round(input.sessionMinutes * 0.5)
  const supportMinutes = input.sessionMinutes - preparationMinutes - primaryMinutes

  return [
    {
      label: 'Prepare',
      minutes: preparationMinutes,
      exercises: [{
        name: preparationFor(input.primaryDomain),
        purpose: 'Prepare the exact positions and pace used today.',
        prescription: `${preparationMinutes} minutes, gradually building to training quality.`,
        effort: 'Easy and exploratory.',
        rest: 'As needed.',
        substitutions: ['Use a pain-free range and slower pace.']
      }]
    },
    {
      label: 'Primary work',
      minutes: primaryMinutes,
      exercises: [exerciseFrom(
        primary,
        policy.primary,
        policy,
        primarySubstitutions,
        assessments,
        true
      )]
    },
    {
      label: 'Support work',
      minutes: supportMinutes,
      exercises: [exerciseFrom(
        secondary,
        policy.secondary,
        policy,
        secondarySubstitutions,
        assessments,
        false
      )]
    }
  ]
}

function exerciseFrom(
  option: MovementOption,
  prescription: string,
  policy: DosePolicy,
  substitutions: readonly string[],
  assessments: readonly CoachStrengthAssessmentSummary[],
  useLoadGuidance: boolean
): CoachPrescriptionExercise {
  const loadGuidance = useLoadGuidance && policy.percentRange
    ? assessmentLoadGuidance(option, policy.percentRange, assessments)
    : undefined

  return {
    name: option.name,
    purpose: option.purpose,
    prescription,
    effort: policy.effort,
    rest: policy.rest,
    substitutions: substitutions.length > 0
      ? substitutions.slice(0, 2)
      : ['Choose the closest pain-free variation that preserves the same intent.'],
    ...(loadGuidance ? { load_guidance: loadGuidance } : {})
  }
}

function policyFor(
  domain: CoachProgramDomainId,
  week: number,
  experience: TrainingExperience
): DosePolicy {
  const isDeload = week === 4 || week === 8
  const volume: CoachSessionVolumeLevel = isDeload ? 'low' : week === 3 || week === 7 ? 'high' : 'moderate'
  const finish = (policy: DosePolicy) => adaptForExperience(policy, experience, isDeload)

  if (domain === 'strength') {
    const strengthByWeek: Record<number, { sets: string; reps: string; percent: [number, number] }> = {
      1: { sets: '3', reps: '5-6', percent: [65, 72] },
      2: { sets: '3-4', reps: '4-6', percent: [68, 76] },
      3: { sets: '4', reps: '3-5', percent: [72, 80] },
      4: { sets: '2', reps: '5', percent: [55, 65] },
      5: { sets: '3', reps: '4-6', percent: [68, 75] },
      6: { sets: '3-4', reps: '3-5', percent: [72, 80] },
      7: { sets: '4', reps: '3-5', percent: [75, 82] },
      8: { sets: '2', reps: '3-5', percent: [55, 65] }
    }
    const dose = strengthByWeek[week]
    return finish({
      volume,
      primary: `${dose.sets} sets × ${dose.reps} reps.`,
      secondary: `${isDeload ? '2' : '3'} sets × 6-10 reps.`,
      effort: isDeload ? 'Finish every set with at least 4 reps in reserve.' : 'Finish working sets with 2-3 reps in reserve.',
      rest: '2-4 minutes after primary work and 90-150 seconds after support work.',
      stop: 'Stop the set when position or repeatable force breaks down; do not grind through failure.',
      percentRange: dose.percent
    })
  }

  if (domain === 'hypertrophy') return finish({
    volume,
    primary: `${isDeload ? '2' : volume === 'high' ? '4' : '3'} sets × 6-12 reps.`,
    secondary: `${isDeload ? '1-2' : '3'} sets × 8-15 reps.`,
    effort: isDeload ? 'Keep 4 reps in reserve.' : 'Finish the last useful set with 1-2 reps in reserve.',
    rest: '90-180 seconds so the target muscle can produce another useful set.',
    stop: 'Stop when the target muscle can no longer do the work with stable technique.',
  })

  if (domain === 'power_explosiveness') return finish({
    volume,
    primary: `${isDeload ? '2-3' : '4-5'} sets × 2-4 crisp reps.`,
    secondary: `${isDeload ? '2' : '3-4'} sets × 3-5 crisp reps.`,
    effort: 'Fast, crisp, and intentional on every rep.',
    rest: '2-4 minutes, until speed and coordination are fully available.',
    stop: 'End the set when rep speed drops or landing quality changes; never chase muscular failure.'
  })

  if (domain === 'speed_agility') return finish({
    volume,
    primary: `${isDeload ? '4' : volume === 'high' ? '8' : '6'} high-quality reps of 5-10 seconds.`,
    secondary: `${isDeload ? '2' : '3'} sets × 3-5 controlled reps.`,
    effort: 'Fast and relaxed, with the same mechanics each rep.',
    rest: 'Walk or rest 2-4 minutes so true speed returns.',
    stop: 'Stop when speed drops, posture changes, or deceleration becomes uncontrolled.'
  })

  if (domain === 'aerobic') return finish({
    volume,
    primary: isDeload
      ? '20-30 minutes easy and continuous.'
      : week === 3 || week === 7
        ? '4-6 × 4 minutes steady-hard with 2 minutes easy.'
        : '25-45 minutes continuous at a sustainable pace.',
    secondary: '5-10 minutes very easy.',
    effort: isDeload ? 'Conversational throughout.' : 'Mostly conversational; finish able to repeat the session.',
    rest: 'Keep recoveries easy enough to regain controlled breathing.',
    stop: 'Stop if effort rises sharply without a pace increase or normal mechanics cannot be maintained.'
  })

  return finish({
    volume,
    primary: `${isDeload ? '2' : '3'} sets × 6-10 smooth reps per side.`,
    secondary: `${isDeload ? '1-2' : '2-3'} sets × 20-40 seconds or 8-12 reps.`,
    effort: 'Use smooth control and finish with clear capacity left.',
    rest: '45-90 seconds, longer if control has not returned.',
    stop: 'Stop when range, breathing, or control becomes less repeatable.'
  })
}

function adaptForExperience(
  policy: DosePolicy,
  experience: TrainingExperience,
  isDeload: boolean
): DosePolicy {
  if (experience !== 'new_or_returning' || isDeload) return policy

  return {
    ...policy,
    primary: reduceStartingDose(policy.primary),
    secondary: reduceStartingDose(policy.secondary),
    effort: `${policy.effort} Start conservatively and leave one additional good rep in reserve.`
  }
}

function reduceStartingDose(value: string): string {
  return value
    .replace(/^4-5 sets/, '3 sets')
    .replace(/^4 sets/, '3 sets')
    .replace(/^3-4 sets/, '2-3 sets')
    .replace(/^3 sets/, '2 sets')
    .replace(/^6 high-quality reps/, '4 high-quality reps')
    .replace(/^25-45 minutes/, '20-30 minutes')
    .replace(/^4-6 ×/, '3-4 ×')
}

function assessmentLoadGuidance(
  option: MovementOption,
  percentRange: [number, number],
  assessments: readonly CoachStrengthAssessmentSummary[]
) {
  const aliases = new Set([
    normalizeMovement(option.name),
    ...(option.assessmentAliases ?? []).map(normalizeMovement)
  ])
  const assessment = assessments.find(candidate => aliases.has(normalizeMovement(candidate.movement)))
  if (!assessment) return undefined

  const increment = assessment.unit === 'lb' ? 5 : 2.5
  return {
    source: 'saved_assessment' as const,
    assessmentId: assessment.id,
    assessmentMovement: assessment.movement,
    basis: assessment.estimateKind === 'reported_1rm'
      ? 'Saved 1RM'
      : `Estimated 1RM from saved ${assessment.reps}RM`,
    percentRange,
    loadRange: {
      min: roundLoad(assessment.estimatedOneRepMax * percentRange[0] / 100, increment),
      max: roundLoad(assessment.estimatedOneRepMax * percentRange[1] / 100, increment),
      unit: assessment.unit as LoadUnit
    }
  }
}

function selectExercise(
  options: readonly MovementOption[],
  equipment: ReadonlySet<Equipment>,
  constraints: ExplicitConstraints
): MovementOption {
  const selected = options.find(option => optionAvailable(option, equipment, constraints))
  if (!selected) throw new Error('Programming catalog has no available movement fallback')
  return selected
}

function primaryAlternatives(
  options: readonly MovementOption[],
  selected: MovementOption,
  equipment: ReadonlySet<Equipment>,
  constraints: ExplicitConstraints
): string[] {
  return options
    .filter(option => option.name !== selected.name && optionAvailable(option, equipment, constraints))
    .map(option => option.name)
}

function optionAvailable(
  option: MovementOption,
  equipment: ReadonlySet<Equipment>,
  constraints: ExplicitConstraints
): boolean {
  return !blockedByConstraint(option, constraints)
    && (option.requires ?? ['bodyweight']).every(requirement => equipment.has(requirement))
}

function blockedByConstraint(option: MovementOption, constraints: ExplicitConstraints): boolean {
  return (constraints.noOverhead && option.overhead === true)
    || (constraints.noRunning && option.running === true)
}

function parseEquipment(value: string): ReadonlySet<Equipment> {
  const normalized = value.toLowerCase()
  const available = new Set<Equipment>(['bodyweight'])
  if (/all equipment/.test(normalized)) {
    ALL_EQUIPMENT.forEach(item => available.add(item))
    return available
  }
  if (/commercial gym|full gym|gym access|well[- ]equipped/.test(normalized)) {
    ALL_EQUIPMENT
      .filter(item => item !== 'track')
      .forEach(item => available.add(item))
    return available
  }
  const patterns: Array<[Equipment, RegExp]> = [
    ['barbell', /barbell|olympic bar/], ['rack', /rack|squat stand/],
    ['dumbbell', /dumbbell|free weights/], ['kettlebell', /kettlebell/],
    ['bench', /bench/], ['band', /band/], ['cable', /cable/], ['machine', /machine/],
    ['pull_up_bar', /pull[- ]?up bar/], ['medicine_ball', /medicine ball|med ball/],
    ['box', /plyo box|box/], ['sled', /sled/], ['bike', /bike|cycle|assault/],
    ['rower', /rower|rowing erg/], ['treadmill', /treadmill/],
    ['track', /track|outdoor|field/]
  ]
  patterns.forEach(([equipment, pattern]) => {
    if (pattern.test(normalized)) available.add(equipment)
  })
  return available
}

function parseExplicitConstraints(value: string): ExplicitConstraints {
  const normalized = value.toLowerCase()
  return {
    noOverhead: /no overhead|avoid overhead|do not (?:do )?overhead|can't (?:do )?overhead/.test(normalized),
    noRunning: /no running|avoid running|do not run|can't run/.test(normalized)
  }
}

function constraintNotes(constraints: ExplicitConstraints, athleteNote: string): string[] {
  const note = athleteNote.trim()
  return [
    ...(constraints.noOverhead ? ['No overhead work selected.'] : []),
    ...(constraints.noRunning ? ['No running selected.'] : []),
    ...(note ? [`Athlete note to review: ${note}`] : [])
  ]
}

function progressionFor(domain: CoachProgramDomainId, week: EightWeekIntent) {
  if (week.reviewRequired) return {
    next_session: 'Keep only work that feels better after the session than before it.',
    next_week: 'Use the athlete review to set the next starting point; do not auto-progress.'
  }
  if (domain === 'power_explosiveness' || domain === 'speed_agility') return {
    next_session: 'Repeat the same dose only while every rep stays fast and coordinated.',
    next_week: 'Add one high-quality rep or a small amount of complexity, never both.'
  }
  if (domain === 'aerobic') return {
    next_session: 'Hold the pace steady before extending the work interval.',
    next_week: 'Add 5 minutes or one interval only if breathing and pace stayed controlled.'
  }
  return {
    next_session: 'Keep the range and add load only after every planned rep is repeatable.',
    next_week: 'Progress one variable: a small load increase, one rep, or one set.'
  }
}

function preparationFor(domain: CoachProgramDomainId): string {
  if (domain === 'aerobic') return 'Easy build-up in the selected modality'
  if (domain === 'speed_agility' || domain === 'power_explosiveness') return 'Dynamic movement and low-intensity rehearsal'
  return 'Breathing, mobility, and unloaded pattern rehearsal'
}

function cardioOptions(prefix: string): readonly MovementOption[] {
  return [
    runningMovement(`${prefix} run`, 'Build aerobic capacity in the chosen intensity zone.'),
    movement(`${prefix} bike`, 'Build aerobic capacity in the chosen intensity zone.', [], ['bike']),
    movement(`${prefix} row`, 'Build aerobic capacity in the chosen intensity zone.', [], ['rower']),
    movement(`${prefix} incline walk`, 'Build aerobic capacity in the chosen intensity zone.', [], ['treadmill']),
    movement(`${prefix} brisk walk`, 'Build aerobic capacity with minimal equipment.', [])
  ]
}

function runningMovement(name: string, purpose: string): MovementOption {
  return { name, purpose, requires: ['track'], running: true }
}

function movement(
  name: string,
  purpose: string,
  assessmentAliases: readonly string[] = [],
  requires: readonly Equipment[] = [],
  flags: { overhead?: boolean; running?: boolean } = {}
): MovementOption {
  return { name, purpose, assessmentAliases, requires, ...flags }
}

function normalizeMovement(value: string): string {
  return value.toLowerCase()
    .replace(/\b(barbell|dumbbell|kettlebell|machine|cable)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function roundLoad(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}
