import type { ExercisePreferences } from './exercise-preferences'
import type { ReviewedWeekActivity } from './offline-reviewed-week'

/** Qualitative authoring guidance, not a dose policy or a movement substitution. */
export const ISOMETRIC_GUIDANCE = {
  version: 'isometric-guidance-0.1.0',
  interestId: 'isometric_training',
  title: 'Isometrics in warm-ups or accessories',
  preparation: 'Use brief, low-fatigue holds after general preparation and before progressive drills or priority work. Preserve sprint, jump and lifting quality; an immediate performance boost is not guaranteed.',
  accessories: 'Place longer or harder holds after priority work, or on a suitable easier day. Count their effort and recovery cost across the whole week.',
  prescription: 'Specify the held position, purpose, sets, hold seconds per side, effort, load, recovery and stop condition. A duration alone does not identify an isometric contraction. Reviewed holds can use Duration work and explicit hold instructions.',
  continuity: 'Count existing PIMA and other isometric work before adding more. Do not infer that different positions, efforts or protocols are equivalent. Review monitoring comparability when preparation changes.',
  progression: 'Review position quality, symptoms, priority-work performance and next-day response. Progress one variable when supported; reduce or move holds when they interfere with the main work.',
  boundary: 'Stop for pain or loss of position. Isometrics are not clinical clearance, an injury-prevention guarantee, or a prerequisite that must be mastered before all explosive training. Hold times, effort and loading require an explicit reviewed prescription; this guidance supplies no automatic dose.',
  evidence: 'Adaptation depends on position, effort and intent. Comparative jump evidence is limited; same-session potentiation and long-term training benefit are separate questions.',
  sources: [
    { id: 'oranchuk-isometric-2019', title: 'Isometric training and long-term adaptations', authors: 'Oranchuk, Storey, Nelson, and Cronin', year: 2019, kind: 'systematic_review', url: 'https://doi.org/10.1111/sms.13375' },
    { id: 'miao-isometric-jump-2026', title: 'Isometric training, conditioning and testing in relation to jump performance', authors: 'Miao, Yan, and Huang', year: 2026, kind: 'systematic_review', url: 'https://doi.org/10.1186/s13102-026-02079-9' }
  ]
} as const

export const ISOMETRIC_REFERENCE_GUIDANCE = [
  `${ISOMETRIC_GUIDANCE.version}: ${ISOMETRIC_GUIDANCE.evidence}`,
  ISOMETRIC_GUIDANCE.preparation, ISOMETRIC_GUIDANCE.accessories,
  ISOMETRIC_GUIDANCE.prescription, ISOMETRIC_GUIDANCE.continuity,
  ISOMETRIC_GUIDANCE.progression, ISOMETRIC_GUIDANCE.boundary
]

export function requestsIsometrics(preferences?: ExercisePreferences): boolean {
  return preferences?.state === 'specified' && preferences.entries.some(entry =>
    entry.target.kind === 'interest' && entry.target.id === ISOMETRIC_GUIDANCE.interestId) === true
}

/** Existing exact reviewed movements can be held in an explicitly described
 * position. This does not rename a dynamic assessment or create a new identity. */
export const ISOMETRIC_HOLD_CUES: Readonly<Record<string, string>> = {
  bodyweight_split_squat: 'Hold the explicitly reviewed split-squat position without repeated lowering or rising. Keep the selected stance and joint position stable.',
  bent_knee_calf_raise: 'Hold the explicitly reviewed heel height with the knee bent. Keep the knee and heel position stable rather than performing calf-raise repetitions.',
  single_leg_hip_bridge: 'Hold the explicitly reviewed single-leg bridge position with a level pelvis. Keep the hip position stable rather than performing bridge repetitions.',
  side_plank: 'Hold the explicitly reviewed side-plank position with the prescribed support. Keep the trunk position stable.'
}

/** Deliberate draft edit only. Hold duration remains blank until entered; no
 * source, monitoring protocol, rest, effort or accepted prescription is changed. */
export function proposeIsometricHold(activity: ReviewedWeekActivity): ReviewedWeekActivity {
  const cue = ISOMETRIC_HOLD_CUES[activity.movementId]
  if (!Object.hasOwn(ISOMETRIC_HOLD_CUES, activity.movementId) || activity.protocolId || !['preparation', 'working'].includes(activity.role)) {
    throw new Error('Choose a supported preparation or accessory movement without a monitoring protocol.')
  }
  const next = structuredClone(activity)
  next.work = { kind: 'duration', seconds: NaN, sides: 'sides' in activity.work ? activity.work.sides : 1, sideSwitchSeconds: 0 }
  // Repetition cues may contradict a hold. The deliberate conversion replaces
  // these instructions; the caller keeps the original draft until it is edited.
  next.instructions = [cue]
  return next
}
