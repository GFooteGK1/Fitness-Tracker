import { createHash } from 'node:crypto'
import { CoachingContextError, contextObject } from './coaching-context'

export const COACHING_REFERENCE_VERSION = 'external-coaching-0.1.0'
export const COACHING_REFERENCE_MAX_DOMAINS = 4
export const COACHING_REFERENCE_MAX_RESPONSE_BYTES = 32_768
export const COACHING_REFERENCE_DOMAINS = ['assessment', 'strength', 'power', 'conditioning', 'recovery', 'isometrics'] as const
type Domain = typeof COACHING_REFERENCE_DOMAINS[number]

// A new publication requires a new version and editorial review. Never overwrite
// an older publication to silently change a historical version's meaning.
const publication = {
  schemaVersion: 1,
  version: COACHING_REFERENCE_VERSION,
  authority: 'general_reference_not_athlete_records',
  intendedPopulation: 'Generally healthy adult athletes seeking general wellness and athletic development.',
  review: { status: 'reviewed', interfaceReviewedAt: '2026-10-19', inheritedEvidenceReviewDate: '2026-10-17',
    scope: 'External interface and qualitative adaptation of existing repository guidance. No new sports-science review or numeric target validation.' },
  provenance: [
    { sourcePath: 'docs/decisions/ADR-0039-chosen-llm-and-durable-context.md', sourceVersion: '2026-10-19', role: 'authority_boundary' },
    { sourcePath: 'docs/coach/training-doctrine.md', sourceVersion: '0.1.1', role: 'qualitative_training_principles',
      coverage: 'The 2026-10-17 evidence review covered the isometric supplement; other sections retain their earlier review.' },
    { sourcePath: 'app/lib/coach/isometric-guidance.ts', sourceVersion: 'isometric-guidance-0.1.0', role: 'qualitative_isometric_guidance' },
    { sourcePath: 'app/lib/coach/external-coaching-reference.ts', sourceVersion: COACHING_REFERENCE_VERSION, role: 'published_external_reference' },
  ],
  supersession: { scope: 'external_chosen_llm_interface_only',
    supersedes: 'The legacy reference rule that the model only composes presentation while app policy owns programming numbers.',
    replacement: 'The selected LLM authors programming and synthesis. Socius supplies durable facts, reference, deterministic calculations and validated operations.',
    preserved: 'Legacy internal generation, historical reference/policy snapshots, accepted plans and athlete records remain unchanged.' },
  safetyBoundary: [
    'General wellness and athletic development only. Do not diagnose, treat, rehabilitate, predict injury or claim to prevent disease or injury.',
    'Stop or adjust for sharp or escalating pain, swelling, loss of position or unsafe technique; do not progress through these signs.',
    'Stop training and seek appropriate medical guidance for chest pressure, unusual or extreme shortness of breath, dizziness, confusion, extreme fatigue or a fast or irregular heartbeat.',
    'Acute injury, loss of function, neurological symptoms, clinician restrictions, suspected disordered eating or low energy availability leave the coaching scope.',
  ],
  principles: [
    'Begin with current saved goals, athlete requirements, training history, constraints, equipment, schedule and preferences. This reference creates no athlete requirement.',
    'Prioritize the largest meaningful gap against the athlete goals when comparable evidence and validated targets support that comparison. Otherwise state the missing evidence and avoid false precision.',
    'Follow the saved plan unless current evidence justifies a proposed change. Distinguish accepted sessions, historical plans and unsaved proposals explicitly.',
    'The selected LLM gives a specific session with its stimulus, rationale, expected quality and stop or adjustment criteria; Socius retrieval itself generates no session.',
    'Use source timestamps, coverage and freshness. Missing, stale, unreviewed or estimated evidence is not proof that an activity did not occur.',
    'Progress a small number of meaningful variables while preserving movement quality and recovery. Prefer a simple session the athlete can execute.',
    'Treat wearable readiness as advisory evidence alongside symptoms, performance and athlete feedback, not an automatic prescription or plan replacement.',
    'Do not treat inherited numerical targets as revalidated or general guidance as an individualized medical assessment. A proposal remains unsaved until a separately authorized operation succeeds.',
  ],
  domains: {
    assessment: [
      'Identify the goal, relevant capacity and comparable measurements before ranking a gap. Distinguish measurement quality, date and testing conditions.',
      'Separate training stimulus from test performance. Ask for material missing constraints or requirements instead of inferring durable facts.',
    ],
    strength: [
      'Match exercise selection, effort and progression to the intended strength adaptation, current capacity and available equipment.',
      'Preserve technical quality and account for accumulated work. State why a progression or reduction serves the session stimulus.',
    ],
    power: [
      'Place priority explosive work where the athlete can preserve speed and quality. Avoid adding fatigue that defeats the intended output.',
      'Choose task-relevant movements and stop or adjust when quality falls; do not assume every athlete needs the same power priority.',
    ],
    conditioning: [
      'Distinguish aerobic development, repeated high-intensity work and strength endurance by the intended adaptation and execution quality.',
      'Fit conditioning around the athlete goals and priority work; account for its fatigue rather than using a fixed universal hierarchy.',
    ],
    recovery: [
      'Use recent workload, sleep, symptoms, athlete feedback and stored recovery with their dates and limitations.',
      'Explain any evidence-based adjustment to the saved plan. Stale wearable data alone cannot establish current readiness.',
    ],
    isometrics: [
      'Apply only when relevant to the goal or saved athlete requirement. This guidance mandates no daily cadence, weekly frequency or universal dose.',
      'A brief low-fatigue hold in preparation should support subsequent priority work. Place harder or longer holds after priority work or on an easier day when appropriate; count their training cost.',
      'Specify position, purpose, sets, hold duration per side where relevant, effort or load, recovery and stop criteria. Duration alone does not identify an isometric exercise.',
      'Count existing holds and distinguish positions and protocols. Review symptoms, movement quality, priority performance and next-day response before progressing one variable.',
      'Stop for pain or loss of position. Reduce or move work that interferes with the session stimulus. Do not promise acute performance, injury prevention or long-term outcomes.',
    ],
  } satisfies Record<Domain, string[]>,
}

// Hash exact UTF-8 JSON.stringify bytes (in publication insertion order), not a
// platform's display formatting. The complete-publication and returned-view
// hashes have different scopes so a subset never masquerades as the full text.
export function coachingReferenceHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}
const contentHash = coachingReferenceHash(publication)

export function coachingReferencePointer(version = COACHING_REFERENCE_VERSION) {
  if (version !== publication.version || publication.review.status !== 'reviewed') {
    return { status: 'unpublished' as const, tool: 'get_coaching_reference', requestedVersion: version, reference: null }
  }
  return { status: 'available' as const, tool: 'get_coaching_reference', version: publication.version,
    contentHash, hashAlgorithm: 'sha256_utf8_json_stringify_v1', hashScope: 'complete_publication',
    reviewedAt: publication.review.interfaceReviewedAt, sourcePath: 'app/lib/coach/external-coaching-reference.ts' }
}

export function readCoachingReference(input: unknown) {
  const params = input === undefined ? {} : input
  if (!contextObject(params) || Object.keys(params).some(key => !['version', 'domains'].includes(key))
    || ('version' in params && (typeof params.version !== 'string' || params.version !== publication.version))) {
    throw new CoachingContextError(400, 'Only a published version and optional whitelisted domains are supported')
  }
  const requested = 'domains' in params ? params.domains : []
  if (!Array.isArray(requested) || requested.length > COACHING_REFERENCE_MAX_DOMAINS
    || requested.some(domain => typeof domain !== 'string' || !COACHING_REFERENCE_DOMAINS.includes(domain as Domain))
    || new Set(requested).size !== requested.length) {
    throw new CoachingContextError(400, 'Choose at most four distinct whitelisted domains')
  }
  const pointer = coachingReferencePointer()
  if (pointer.status !== 'available') throw new CoachingContextError(503, 'Coaching reference is unpublished')
  // Canonical publication order makes equivalent domain selections reproducible.
  const domains = Object.fromEntries(COACHING_REFERENCE_DOMAINS.filter(domain => requested.includes(domain)).map(domain => [domain, publication.domains[domain]]))
  const selected = { ...publication, domains }
  return JSON.parse(JSON.stringify({ ...pointer, selectedDomains: Object.keys(domains), availableDomains: COACHING_REFERENCE_DOMAINS,
    maxDomains: COACHING_REFERENCE_MAX_DOMAINS, selectedContentHash: coachingReferenceHash(selected), selectedHashScope: 'returned_reference',
    reference: selected })) as {
      status: 'available'; version: string; contentHash: string; selectedContentHash: string; selectedDomains: Domain[];
      availableDomains: readonly Domain[]; reference: Omit<typeof publication, 'domains'> & { domains: Partial<Record<Domain, string[]>> }
    }
}
