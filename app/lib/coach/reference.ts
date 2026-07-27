import {
  COACH_DOMAIN_IDS,
  type CoachDomainId,
  type CoachReferenceManifest,
  type CoachReferenceSnapshot
} from './types'

const MAX_DETAILED_DOMAINS = 4

export const COACH_REFERENCE_MANIFEST: CoachReferenceManifest = {
  schemaVersion: 1,
  doctrineVersion: '0.1.0',
  evidenceReviewDate: '2026-07-27',
  intendedPopulation: 'Generally healthy adult athletes',
  corePrinciples: [
    'Start with goals, training age, capacity, schedule, equipment, preferences, and constraints.',
    'State the adaptation intent, expected feel, and success or stop condition before extra detail.',
    'Use deterministic policy or accepted program state for numbers; the model only composes presentation.',
    'Progress one or two meaningful variables at a time and preserve movement or output quality.',
    'Treat wearable and recovery signals as advisory evidence, never autonomous plan controls.',
    'Explain proposed changes and require athlete acceptance before activating a new plan version.'
  ],
  safetyBoundary: [
    'General wellness and athletic development only; do not diagnose, treat, rehabilitate, or predict injury.',
    'Stop and seek appropriate medical guidance for chest pressure, extreme or unusual shortness of breath, dizziness, confusion, extreme fatigue, or a fast or irregular heartbeat.',
    'Acute injury, neurological symptoms, loss of function, clinician restrictions, suspected disordered eating, or suspected low energy availability leave the coach scope.'
  ],
  domains: [
    {
      id: 'assessment',
      title: 'Assessment and baselines',
      intent: 'Establish enough trustworthy context to choose an appropriate starting plan.',
      feel: 'Collaborative, low-risk, and honest about uncertainty.',
      guidance: [
        'Capture goals, schedule, equipment, training history, preferences, limitations, recovery constraints, and recent repeatable benchmarks.',
        'Accept known 1RM, 3RM, or 5RM values and retain the source set, date, confidence, and calculator version.',
        'Label every derived value as an estimated 1RM and recalibrate from later high-quality performance.'
      ],
      stopConditions: [
        'Do not infer medical clearance, movement safety, or injury risk from a performance result.',
        'Use a low-risk calibration session when movement skill or baseline confidence is insufficient.'
      ],
      sourceIds: ['one-rm-reliability-2020', 'rep-max-prediction-2024'],
      confidence: 'moderate'
    },
    {
      id: 'strength',
      title: 'Strength',
      intent: 'Increase the ability to produce force in a stable movement.',
      feel: 'Heavy, controlled, and technically repeatable.',
      guidance: [
        'Use percentages as starting anchors and adjust within policy bounds using RIR, technique, and performance.',
        'Progress load or high-quality work only after the previous exposure met its intent.'
      ],
      stopConditions: ['Pain, unsafe technique, unexpected asymmetry, or repeated grinding.'],
      sourceIds: ['acsm-resistance-training-2026'],
      confidence: 'high'
    },
    {
      id: 'hypertrophy',
      title: 'Hypertrophy',
      intent: 'Accumulate challenging target-muscle work while managing fatigue.',
      feel: 'Increasing local effort with about one to two good repetitions remaining on most working sets.',
      guidance: [
        'Progress repetitions, load, or a small amount of volume when performance and recovery support it.',
        'Momentary failure is optional and generally reserved for lower-cost work where it remains safe.'
      ],
      stopConditions: ['The target muscle no longer drives the movement, technique becomes unsafe, or systemic fatigue overwhelms local work.'],
      sourceIds: ['acsm-resistance-training-2026', 'schoenfeld-proximity-to-failure-2023'],
      confidence: 'high'
    },
    {
      id: 'power_explosiveness',
      title: 'Power and explosiveness',
      intent: 'Express force quickly.',
      feel: 'Fast, crisp, and aggressive without strain or grinding.',
      guidance: [
        'Use skill-appropriate jumps, throws, sprints, Olympic-lift derivatives, or validated resistance work.',
        'Rest long enough for the next effort to remain fast; high intent does not mean high accumulated fatigue.'
      ],
      stopConditions: ['Visible slowing, reduced output, poor landing, or technical breakdown; never chase muscular failure.'],
      sourceIds: ['acsm-resistance-training-2026', 'nsca-weightlifting-position'],
      confidence: 'high'
    },
    {
      id: 'speed_agility',
      title: 'Speed, deceleration, and change of direction',
      intent: 'Move or redirect the body at the highest appropriate quality.',
      feel: 'Fresh, sharp, and coordinated.',
      guidance: [
        'Use short high-quality exposures with substantial recovery.',
        'Treat acceleration, maximum velocity, braking, preplanned change of direction, and reactive agility as distinct tasks.'
      ],
      stopConditions: ['Meaningful time loss, poor force direction, loss of posture, uncontrolled braking, or pain.'],
      sourceIds: ['morin-sprint-mechanics-2012'],
      confidence: 'moderate'
    },
    {
      id: 'aerobic',
      title: 'Aerobic conditioning',
      intent: 'Improve sustainable work, recovery between efforts, and aerobic durability.',
      feel: 'Most volume is repeatably controlled; hard work has a named purpose.',
      guidance: [
        'Build a substantial easy base and add limited tempo, threshold, or VO2-focused work according to the goal.',
        'Increase sustainable duration before adding unnecessary intensity; no universal 80/20 rule applies to every athlete.'
      ],
      stopConditions: ['Pace or power can no longer match the session intent, mechanics degrade, or recovery becomes disproportionate.'],
      sourceIds: ['seiler-intensity-distribution-2010', 'endurance-distribution-meta-2025'],
      confidence: 'moderate'
    },
    {
      id: 'anaerobic',
      title: 'Anaerobic work capacity',
      intent: 'Repeat high-output work with recovery characteristics matched to the goal.',
      feel: 'Demanding but controlled enough to preserve the defined output.',
      guidance: [
        'Define work duration, intensity, recovery, modality, repetitions, and series.',
        'Progress repeatability or density only while the target output remains present.'
      ],
      stopConditions: ['Output falls outside the validated range, movement quality deteriorates, or work becomes undifferentiated exhaustion.'],
      sourceIds: ['buchheit-hiit-2013'],
      confidence: 'high'
    },
    {
      id: 'nutrition',
      title: 'Nutrition and fueling',
      intent: 'Provide enough energy and nutrients to perform, recover, and adapt.',
      feel: 'Practical, sustainable, and proportional to the training demand.',
      guidance: [
        'Default to adequate energy, sufficient protein, fruits and vegetables, hydration, and carbohydrate scaled to the work.',
        'Supplements are optional and secondary to food, training, and sleep.'
      ],
      stopConditions: ['Escalate suspected disordered eating, persistent low energy, rapid unplanned weight change, menstrual disruption, recurrent bone stress, or medical nutrition questions.'],
      sourceIds: ['phillips-protein-meta-2018', 'burke-carbohydrate-2026', 'ioc-reds-2023'],
      confidence: 'high'
    },
    {
      id: 'resilience',
      title: 'Resilience and movement capacity',
      intent: 'Build the strength, control, range, and exposure tolerance needed for training.',
      feel: 'Progressive, controlled, and confidence-building.',
      guidance: [
        'Use task-specific strength, balance, landing, deceleration, plyometric, trunk, and range work.',
        'Describe capacity and resilience rather than promising injury prevention.'
      ],
      stopConditions: ['Sharp or escalating pain, swelling, loss of function, neurological symptoms, or clinician restrictions.'],
      sourceIds: ['lauersen-prevention-2014', 'impellizzeri-workload-2020'],
      confidence: 'moderate'
    },
    {
      id: 'recovery',
      title: 'Recovery and fatigue management',
      intent: 'Absorb training and remain able to express the target qualities.',
      feel: 'Responsive to trends without overreacting to one signal.',
      guidance: [
        'Use performance, session RPE, soreness, motivation, stress, sleep, illness signals, schedule, and physiological trends together.',
        'One abnormal signal lowers confidence; multiple aligned signals may justify a scale option or proposed future change.'
      ],
      stopConditions: ['A wearable score alone cannot cancel or rewrite accepted training.'],
      sourceIds: ['halson-recovery-monitoring-2019'],
      confidence: 'moderate'
    },
    {
      id: 'movement_skill',
      title: 'Movement skill and technique',
      intent: 'Produce an effective, efficient, repeatable movement outcome.',
      feel: 'Focused on one useful cue and a clear external result.',
      guidance: [
        'Lead with an external effect, provide meaningful choice, and reinforce what worked.',
        'Progress from stable to variable and from simple to sport-specific demands.'
      ],
      stopConditions: ['Do not overwhelm the athlete with simultaneous corrections or claim certainty without evidence.'],
      sourceIds: ['wulf-optimal-motor-learning'],
      confidence: 'moderate'
    },
    {
      id: 'adherence',
      title: 'Adherence and behavior',
      intent: 'Create a plan the athlete can execute consistently and learn from.',
      feel: 'Autonomy-supportive, non-moralizing, and realistic.',
      guidance: [
        'Preserve the primary intent when shortening a session and offer a minimum effective option.',
        'Evaluate patterns over time and ask what made execution easier or harder.'
      ],
      stopConditions: ['Do not frame one missed session or meal as failure.'],
      sourceIds: ['wulf-optimal-motor-learning', 'acsm-resistance-training-2026'],
      confidence: 'moderate'
    }
  ]
}

const DOMAIN_ID_SET = new Set<string>(COACH_DOMAIN_IDS)

export function isCoachDomainId(value: unknown): value is CoachDomainId {
  return typeof value === 'string' && DOMAIN_ID_SET.has(value)
}

export function getCoachReference(
  requestedDomains: readonly unknown[] = []
): CoachReferenceSnapshot {
  const uniqueRequested = requestedDomains
    .filter(isCoachDomainId)
    .filter((domain, index, all) => all.indexOf(domain) === index)

  const selected = uniqueRequested.slice(0, MAX_DETAILED_DOMAINS)

  return {
    schemaVersion: COACH_REFERENCE_MANIFEST.schemaVersion,
    doctrineVersion: COACH_REFERENCE_MANIFEST.doctrineVersion,
    evidenceReviewDate: COACH_REFERENCE_MANIFEST.evidenceReviewDate,
    intendedPopulation: COACH_REFERENCE_MANIFEST.intendedPopulation,
    corePrinciples: COACH_REFERENCE_MANIFEST.corePrinciples,
    safetyBoundary: COACH_REFERENCE_MANIFEST.safetyBoundary,
    domainIndex: COACH_REFERENCE_MANIFEST.domains.map(domain => ({
      id: domain.id,
      title: domain.title
    })),
    domains: COACH_REFERENCE_MANIFEST.domains.filter(domain => selected.includes(domain.id)),
    truncated: uniqueRequested.length > selected.length
  }
}
