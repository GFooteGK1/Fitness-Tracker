export type ProgrammingEvidenceConfidence = 'high' | 'moderate' | 'emerging'
export type ProgrammingTemporalStatus = 'stable' | 'shifting' | 'emerging'
export type ProgrammingSourceKind =
  | 'position_statement'
  | 'systematic_review'
  | 'meta_analysis'
  | 'critical_review'

export interface ProgrammingEvidenceSource {
  id: string
  title: string
  authors: string
  year: number
  kind: ProgrammingSourceKind
  url: string
}

export interface ProgrammingEvidenceRule {
  id: string
  claim: string
  programmingImplication: string
  confidence: ProgrammingEvidenceConfidence
  temporalStatus: ProgrammingTemporalStatus
  sourceIds: readonly string[]
}

export type SessionBlockRequirement = 'required' | 'conditional' | 'optional'

export interface ProgrammingSessionBlockRole {
  id:
    | 'specific_preparation'
    | 'priority_adaptation'
    | 'secondary_adaptation'
    | 'assistance_and_capacity'
    | 'conditioning'
    | 'downshift'
  requirement: SessionBlockRequirement
  purpose: string
  includeWhen: string
  omitWhen: string
  sourceRuleIds: readonly string[]
}

export interface CompleteProgrammingReference {
  schemaVersion: 1
  referenceVersion: string
  evidenceReviewDate: string
  intendedPopulation: string
  outOfScope: readonly string[]
  sources: readonly ProgrammingEvidenceSource[]
  evidenceRules: readonly ProgrammingEvidenceRule[]
  productContract: {
    authority: string
    universalExerciseCount: null
    completenessDefinition: string
    sessionBlockRoles: readonly ProgrammingSessionBlockRole[]
    orderingRules: readonly string[]
    timeBudgetRules: readonly string[]
    weeklyPlanRules: readonly string[]
    reviewRules: readonly string[]
  }
}

const SOURCES: readonly ProgrammingEvidenceSource[] = [
  {
    id: 'acsm-resistance-training-2026',
    title: 'Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults',
    authors: 'Currier et al.; chaired by Stuart M. Phillips',
    year: 2026,
    kind: 'position_statement',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/'
  },
  {
    id: 'nunes-exercise-order-2021',
    title: 'What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy?',
    authors: 'Nunes et al.',
    year: 2021,
    kind: 'meta_analysis',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32077380/'
  },
  {
    id: 'mccrary-warmup-2015',
    title: 'A systematic review of the effects of upper body warm-up on performance and injury',
    authors: 'McCrary, Ackermann, and Halaki',
    year: 2015,
    kind: 'systematic_review',
    url: 'https://pubmed.ncbi.nlm.nih.gov/25694615/'
  },
  {
    id: 'schoenfeld-hypertrophy-position-2021',
    title: 'Resistance Training Recommendations to Maximize Muscle Hypertrophy in an Athletic Population',
    authors: 'Schoenfeld et al.',
    year: 2021,
    kind: 'position_statement',
    url: 'https://doi.org/10.47206/ijsc.v1i1.81'
  },
  {
    id: 'pelland-dose-response-2026',
    title: 'The Resistance Training Dose Response: Meta-Regressions Exploring Weekly Volume and Frequency',
    authors: 'Pelland et al.',
    year: 2026,
    kind: 'meta_analysis',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/'
  },
  {
    id: 'ramos-campo-split-full-body-2024',
    title: 'Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth',
    authors: 'Ramos-Campo et al.',
    year: 2024,
    kind: 'meta_analysis',
    url: 'https://pubmed.ncbi.nlm.nih.gov/38595233/'
  },
  {
    id: 'singer-rest-interval-2024',
    title: 'Give it a rest: the effect of inter-set rest interval duration on muscle hypertrophy',
    authors: 'Singer et al.',
    year: 2024,
    kind: 'meta_analysis',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11349676/'
  },
  {
    id: 'suchomel-strength-considerations-2018',
    title: 'The Importance of Muscular Strength: Training Considerations',
    authors: 'Suchomel et al.',
    year: 2018,
    kind: 'critical_review',
    url: 'https://doi.org/10.1007/s40279-018-0862-z'
  },
  {
    id: 'jukic-velocity-loss-2023',
    title: 'The Acute and Chronic Effects of Implementing Velocity Loss Thresholds During Resistance Training',
    authors: 'Jukic et al.',
    year: 2023,
    kind: 'meta_analysis',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9807551/'
  },
  {
    id: 'haugen-sprint-practice-2019',
    title: 'Sprint running: from fundamental mechanics to practice',
    authors: 'Haugen, McGhie, and Ettema',
    year: 2019,
    kind: 'critical_review',
    url: 'https://pubmed.ncbi.nlm.nih.gov/30963240/'
  },
  {
    id: 'buchheit-hiit-2013',
    title: 'High-Intensity Interval Training, Solutions to the Programming Puzzle',
    authors: 'Buchheit and Laursen',
    year: 2013,
    kind: 'critical_review',
    url: 'https://pubmed.ncbi.nlm.nih.gov/23539308/'
  },
  {
    id: 'schumann-concurrent-training-2022',
    title: 'Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function',
    authors: 'Schumann et al.',
    year: 2022,
    kind: 'meta_analysis',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8891239/'
  },
  {
    id: 'hickmott-autoregulation-2022',
    title: 'The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy',
    authors: 'Hickmott et al.',
    year: 2022,
    kind: 'meta_analysis',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8762534/'
  },
  {
    id: 'kiely-periodization-2018',
    title: 'Periodization Theory: Confronting an Inconvenient Truth',
    authors: 'John Kiely',
    year: 2018,
    kind: 'critical_review',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5856877/'
  },
  {
    id: 'zhang-superset-2025',
    title: 'Superset Versus Traditional Resistance Training Prescriptions',
    authors: 'Zhang et al.',
    year: 2025,
    kind: 'meta_analysis',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39903375/'
  }
]

const EVIDENCE_RULES: readonly ProgrammingEvidenceRule[] = [
  {
    id: 'session.complete-by-role',
    claim: 'Evidence supports matching training variables to the intended adaptation and covering the relevant musculature or performance quality; it does not establish one universally correct exercise count per session.',
    programmingImplication: 'Judge completeness from the session intent, weekly coverage, and time budget rather than requiring a fixed number of movements.',
    confidence: 'high',
    temporalStatus: 'stable',
    sourceIds: ['acsm-resistance-training-2026', 'ramos-campo-split-full-body-2024']
  },
  {
    id: 'session.priority-first',
    claim: 'Strength gains are greatest for exercises performed early, while hypertrophy appears less sensitive to exercise order.',
    programmingImplication: 'Place the athlete\'s highest-priority strength, skill, speed, or power work before fatigue-producing work.',
    confidence: 'high',
    temporalStatus: 'stable',
    sourceIds: ['acsm-resistance-training-2026', 'nunes-exercise-order-2021']
  },
  {
    id: 'session.specific-preparation',
    claim: 'Dynamic, task-relevant preparation can improve subsequent strength and power performance; passive or generic low-load activity is not reliably sufficient by itself.',
    programmingImplication: 'Prepare the exact positions, pattern, range, and output required by the priority work without creating fatigue.',
    confidence: 'moderate',
    temporalStatus: 'stable',
    sourceIds: ['mccrary-warmup-2015', 'suchomel-strength-considerations-2018']
  },
  {
    id: 'week.dose-before-split',
    claim: 'Weekly resistance-training volume has a positive dose-response with diminishing returns; frequency is chiefly a way to distribute work and practice, especially when hypertrophy volume is equated.',
    programmingImplication: 'Set a weekly exposure or set budget, then distribute it across days so priority work remains high quality and recoverable.',
    confidence: 'high',
    temporalStatus: 'shifting',
    sourceIds: ['acsm-resistance-training-2026', 'pelland-dose-response-2026', 'ramos-campo-split-full-body-2024']
  },
  {
    id: 'movement.selection-by-coverage',
    claim: 'Multiple exercise types can produce useful adaptations. Exercise selection should reflect specificity, equipment, skill, regional or movement coverage, preference, and tolerance.',
    programmingImplication: 'Give every selected movement a named role and use assistance work to fill a weekly gap, not to make a session look busy.',
    confidence: 'moderate',
    temporalStatus: 'shifting',
    sourceIds: ['acsm-resistance-training-2026', 'schoenfeld-hypertrophy-position-2021']
  },
  {
    id: 'session.rest-preserves-output',
    claim: 'Rest needs depend on the outcome. Very short rest can reduce subsequent volume or output, and hypertrophy may receive a small benefit from rest periods longer than 60 seconds.',
    programmingImplication: 'Prescribe enough recovery to repeat the intended force, velocity, technique, or target-muscle work; use density only when density is itself the goal.',
    confidence: 'moderate',
    temporalStatus: 'shifting',
    sourceIds: ['singer-rest-interval-2024', 'acsm-resistance-training-2026']
  },
  {
    id: 'power.preserve-velocity',
    claim: 'Power and speed improve through high-intent, technically specific work with low-to-moderate fatigue; accumulating large velocity loss changes the training stimulus.',
    programmingImplication: 'Keep power and speed exposures early, provide substantial recovery, and stop a set or repetition series when speed or mechanics meaningfully decline.',
    confidence: 'high',
    temporalStatus: 'stable',
    sourceIds: ['acsm-resistance-training-2026', 'suchomel-strength-considerations-2018', 'jukic-velocity-loss-2023', 'haugen-sprint-practice-2019']
  },
  {
    id: 'conditioning.define-variables',
    claim: 'Interval-session demand changes with work intensity and duration, recovery intensity and duration, modality, repetitions, series, and between-series recovery.',
    programmingImplication: 'Never emit a generic hard finisher; name the output target, work and recovery structure, repeat count, modality, and stop rule.',
    confidence: 'high',
    temporalStatus: 'stable',
    sourceIds: ['buchheit-hiit-2013']
  },
  {
    id: 'concurrent.protect-explosive-priority',
    claim: 'Concurrent aerobic and resistance training generally does not blunt maximal strength or hypertrophy, but same-session concurrent work can reduce explosive-strength development.',
    programmingImplication: 'Mixed-goal plans may combine qualities, but separate or sequence endurance away from priority speed and power work when explosive development leads.',
    confidence: 'high',
    temporalStatus: 'stable',
    sourceIds: ['schumann-concurrent-training-2022']
  },
  {
    id: 'progression.anchor-and-adjust',
    claim: 'Standardized percentage-based and autoregulated load prescription can produce similar strength gains; neither removes the need for progressive exposure and review.',
    programmingImplication: 'Use accepted baselines and deterministic ranges as anchors, then adjust within bounds from RIR, velocity or quality, and recent performance.',
    confidence: 'moderate',
    temporalStatus: 'shifting',
    sourceIds: ['hickmott-autoregulation-2022', 'acsm-resistance-training-2026']
  },
  {
    id: 'progression.simple-over-complex',
    claim: 'Progressive training is valuable, but complex periodization models are not consistently superior for healthy adults and should not be treated as biological laws.',
    programmingImplication: 'Plan a clear progression hypothesis, vary only what serves the goal, and use review checkpoints to revise the next exposure.',
    confidence: 'moderate',
    temporalStatus: 'shifting',
    sourceIds: ['acsm-resistance-training-2026', 'kiely-periodization-2018']
  },
  {
    id: 'time.preserve-priority',
    claim: 'Time-efficient structures such as supersets can preserve chronic strength and hypertrophy outcomes while increasing effort and density; they are not equivalent for every training quality.',
    programmingImplication: 'When time shrinks, preserve specific preparation and priority work, trim optional volume first, and reserve supersets for compatible non-priority work.',
    confidence: 'moderate',
    temporalStatus: 'emerging',
    sourceIds: [
      'zhang-superset-2025',
      'nunes-exercise-order-2021',
      'acsm-resistance-training-2026'
    ]
  }
]

const SESSION_BLOCK_ROLES: readonly ProgrammingSessionBlockRole[] = [
  {
    id: 'specific_preparation',
    requirement: 'required',
    purpose: 'Raise readiness and rehearse the positions, range, rhythm, or output used in the priority work.',
    includeWhen: 'Every session, scaled to the task and athlete.',
    omitWhen: 'Never omit entirely; compress to the smallest effective task-specific preparation.',
    sourceRuleIds: ['session.specific-preparation', 'time.preserve-priority']
  },
  {
    id: 'priority_adaptation',
    requirement: 'required',
    purpose: 'Deliver the session\'s main adaptation while the athlete is least fatigued.',
    includeWhen: 'Every training session.',
    omitWhen: 'Only when the session is intentionally recovery-only or assessment-only.',
    sourceRuleIds: ['session.priority-first', 'power.preserve-velocity']
  },
  {
    id: 'secondary_adaptation',
    requirement: 'conditional',
    purpose: 'Add a second high-value pattern or quality needed to complete the weekly plan.',
    includeWhen: 'Weekly coverage or the athlete\'s secondary goal requires another meaningful exposure.',
    omitWhen: 'The priority block already supplies the required coverage or the time/recovery budget cannot support it.',
    sourceRuleIds: ['session.complete-by-role', 'week.dose-before-split']
  },
  {
    id: 'assistance_and_capacity',
    requirement: 'conditional',
    purpose: 'Fill a specific muscle, position, trunk, unilateral, resilience, or capacity gap.',
    includeWhen: 'A named weekly coverage gap remains after priority and secondary work.',
    omitWhen: 'No gap exists, recovery is constrained, or the movement would be filler.',
    sourceRuleIds: ['movement.selection-by-coverage', 'time.preserve-priority']
  },
  {
    id: 'conditioning',
    requirement: 'conditional',
    purpose: 'Develop a named energy-system or repeat-output quality.',
    includeWhen: 'The weekly plan assigns conditioning to this session and it will not compromise the primary adaptation.',
    omitWhen: 'It is present only to create fatigue or would interfere with priority speed or power.',
    sourceRuleIds: ['conditioning.define-variables', 'concurrent.protect-explosive-priority']
  },
  {
    id: 'downshift',
    requirement: 'optional',
    purpose: 'Transition out of demanding work, capture feedback, or add low-cost recovery activity.',
    includeWhen: 'It improves recovery, skill retention, or the athlete experience within the time budget.',
    omitWhen: 'It displaces preparation or priority work.',
    sourceRuleIds: ['time.preserve-priority']
  }
]

export const COMPLETE_PROGRAMMING_REFERENCE: CompleteProgrammingReference = {
  schemaVersion: 1,
  referenceVersion: 'complete-programming-0.1.0',
  evidenceReviewDate: '2026-07-28',
  intendedPopulation: 'Generally healthy adults training two to six days per week for strength, hypertrophy, power, speed, conditioning, resilience, or a mixed goal.',
  outOfScope: [
    'Medical diagnosis, rehabilitation, return-to-play clearance, and injury prediction.',
    'Elite sport peaking that requires sport-calendar, technical, and multidisciplinary staff context.',
    'Disease-specific exercise prescription or clinician-directed restrictions.'
  ],
  sources: SOURCES,
  evidenceRules: EVIDENCE_RULES,
  productContract: {
    authority: 'Evidence constrains the design; deterministic application policy selects numbers and movements; the LLM may explain but cannot prescribe unsupported values or activate a plan.',
    universalExerciseCount: null,
    completenessDefinition: 'A session is complete when it delivers its priority adaptation, supplies the weekly coverage assigned to that day, includes the required execution details, and fits the athlete\'s time and recovery budget.',
    sessionBlockRoles: SESSION_BLOCK_ROLES,
    orderingRules: [
      'Specific preparation precedes the work it prepares.',
      'Highest-priority skill, speed, power, or strength work precedes fatigue-producing work.',
      'Secondary and assistance work follow in order of weekly importance.',
      'Conditioning is placed last only when that preserves the primary goal; otherwise schedule it separately.'
    ],
    timeBudgetRules: [
      'Preserve a compressed specific preparation and the priority adaptation first.',
      'Reduce optional assistance volume before reducing priority quality.',
      'Remove filler rather than shortening recovery that is required for the intended output.',
      'Use compatible supersets only for non-priority work when they preserve technique and target output.'
    ],
    weeklyPlanRules: [
      'Assign a primary goal and bounded secondary priorities before composing sessions.',
      'Track weekly exposure by movement pattern, muscle or region, and performance quality as appropriate to the goal.',
      'Distribute weekly dose across available days to preserve quality, recovery, preference, and adherence.',
      'Every movement must declare the weekly gap or session role it fills.',
      'Protect speed and power from avoidable same-session endurance fatigue.'
    ],
    reviewRules: [
      'Weeks 4 and 8 remain product-defined review checkpoints, not claims that every athlete needs the same deload.',
      'Review performance, execution quality, session RPE or RIR, soreness, schedule, and athlete feedback together.',
      'Change the next plan version through an inspectable proposal and explicit athlete acceptance.'
    ]
  }
}

export function getCompleteProgrammingReference(): CompleteProgrammingReference {
  return COMPLETE_PROGRAMMING_REFERENCE
}
