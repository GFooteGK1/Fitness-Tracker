/** Proposed P3 design only. Never import this development artifact into app runtime. */
export interface StrategyBasis {
  ownerId: string
  intent: { id: string; version: number }
  sourceRevision: number
  acceptedBaseId: string
  evidencePacketId: string
  policyVersion: string
  catalogVersion: string
}

export interface OutcomeDisposition {
  outcomeId: string
  status: 'active' | 'achieved' | 'paused' | 'superseded'
  disposition: 'develop' | 'maintain' | 'observe' | 'defer' | 'unsupported'
  rationale: string
  evidenceIds: string[]
  exposureIds: string[]
}

export interface ExposureObligation {
  id: string
  role: 'working' | 'monitoring'
  prescriptionRef: {
    kind: 'accepted_unchanged' | 'reviewed_base' | 'validated_policy'
    id: string
    version: string
  }
  protocolRef: { id: string; version: string } | null
  outcomeCredits: Array<{
    outcomeId: string
    relation: 'direct' | 'proxy' | 'proposed'
    rationale: string
    evidenceIds: string[]
  }>
}

export type TimeAmount =
  | { certainty: 'known'; minutes: number; sourceId: string }
  | { certainty: 'estimated'; lower: number; upper: number; sourceId: string }
  | { certainty: 'unknown'; sourceId: string }

// Dates and local intervals come from confirmed athlete context. Offset follows
// timezone-utils' raw convention. Cross-midnight work is split into dated parts.
export type DatedInterval =
  | { certainty: 'known'; date: string; startMinute: number; endMinute: number; rawTzOffset: number; sourceId: string }
  | { certainty: 'unknown'; date: string | null; sourceId: string }

export interface SessionWindow {
  id: string
  date: string
  interval: DatedInterval
  budgetMinutes: number
  timeEntries: Array<{
    id: string
    kind: 'preparation' | 'ramp' | 'monitoring' | 'work_with_rest' | 'transition' | 'outside_commitment' | 'reserve'
    exposureId: string | null
    duration: TimeAmount
  }>
}

export interface ScheduleCandidate {
  id: string
  // This P3 slice only rearranges a fixed obligation set. Bundle changes require
  // a separate strategy draft and explicit prescription-change review.
  exposureIds: string[]
  sessions: SessionWindow[]
  priorityOutput: string
  hardConstraintRefs: string[]
  tradeoffs: string[]
  changeReasons: Array<{ kind: 'schedule' | 'dose' | 'emphasis' | 'protocol'; basisIds: string[] }>
}

export interface StrategyDraft {
  designVersion: 'p3-preparation-1'
  basis: StrategyBasis
  outcomes: OutcomeDisposition[]
  exposures: ExposureObligation[]
  outsideContext: {
    coverage: 'confirmed_none' | 'reported_partial' | 'reported_complete' | 'unknown'
    sourceIds: string[]
    adjacentSessions: Array<{ id: string; interval: DatedInterval; sourceId: string; demands: string[] }>
    adjacentCoverage: 'known' | 'partial' | 'unknown'
  }
  outsideWork: Array<{
    id: string
    status: 'confirmed_planned' | 'performed' | 'uncertain'
    sourceId: string
    interval: DatedInterval
    duration: TimeAmount
    overlap: { status: 'confirmed'; windowId: string; evidenceId: string } | { status: 'none' | 'unknown' }
    demands: string[]
  }>
  candidates: ScheduleCandidate[]
  result:
    | { status: 'ready'; selectedCandidateId: string; rationale: string }
    | { status: 'needs_confirmation'; questions: string[]; affectedOutcomeIds: string[] }
    | { status: 'capability_gap'; missingCapabilities: string[]; affectedOutcomeIds: string[] }
    | { status: 'no_feasible_candidate_found'; searchComplete: boolean; limitingConstraintRefs: string[]; affectedOutcomeIds: string[] }
}

// Entirely synthetic scheduling fixture. Durations and references are invented
// for arithmetic checks, not Greg's prescription or approved coaching policy.
const outcomeIds = ['strength-a', 'strength-b', 'endurance', 'skill', 'capacity']
const exposures: ExposureObligation[] = outcomeIds.map((outcomeId, index) => ({
  id: `work-${index}`,
  role: 'working',
  prescriptionRef: { kind: 'accepted_unchanged', id: `synthetic-base-${index}`, version: '1' },
  protocolRef: null,
  outcomeCredits: [{ outcomeId, relation: 'direct', rationale: 'Synthetic accepted work reference.', evidenceIds: ['synthetic-source'] }]
}))
exposures.push({
  id: 'monitor', role: 'monitoring',
  prescriptionRef: { kind: 'reviewed_base', id: 'synthetic-fixed-monitor', version: '1' },
  protocolRef: { id: 'synthetic-protocol', version: '1' },
  outcomeCredits: [{ outcomeId: 'strength-a', relation: 'proxy', rationale: 'Monitoring signal, not attainment.', evidenceIds: ['synthetic-source'] }]
})

export const syntheticStrategy: StrategyDraft = {
  designVersion: 'p3-preparation-1',
  basis: { ownerId: 'synthetic-owner', intent: { id: 'synthetic-intent', version: 1 }, sourceRevision: 1, acceptedBaseId: 'synthetic-base', evidencePacketId: 'synthetic-packet', policyVersion: 'inactive-example', catalogVersion: 'example' },
  outcomes: outcomeIds.map((outcomeId, index) => ({
    outcomeId, status: 'active', disposition: 'maintain', rationale: 'Retain synthetic accepted work pending review.',
    evidenceIds: ['synthetic-source'], exposureIds: index === 0 ? ['work-0', 'monitor'] : [`work-${index}`]
  })),
  exposures,
  outsideContext: { coverage: 'confirmed_none', sourceIds: ['synthetic-confirmation'], adjacentSessions: [], adjacentCoverage: 'unknown' },
  outsideWork: [],
  candidates: [{
    id: 'retain-synthetic', exposureIds: exposures.map(exposure => exposure.id), priorityOutput: 'Retain accepted work in confirmed windows.', hardConstraintRefs: ['synthetic-availability'],
    tradeoffs: ['Only one illustrative arrangement; no coaching comparison has run.'], changeReasons: [],
    sessions: ['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25', '2026-09-26'].map((date, index) => ({
      id: `window-${index}`, date, interval: { certainty: 'known', date, startMinute: 1080, endMinute: 1140, rawTzOffset: 300, sourceId: 'synthetic-availability' }, budgetMinutes: 60,
      timeEntries: [
        { id: `prep-${index}`, kind: 'preparation', exposureId: null, duration: { certainty: 'estimated', lower: 6, upper: 8, sourceId: 'synthetic-time' } },
        { id: `ramp-${index}`, kind: 'ramp', exposureId: null, duration: { certainty: 'estimated', lower: 3, upper: 4, sourceId: 'synthetic-time' } },
        ...(index === 0 ? [{ id: 'monitor-time', kind: 'monitoring' as const, exposureId: 'monitor', duration: { certainty: 'estimated' as const, lower: 4, upper: 5, sourceId: 'synthetic-time' } }] : []),
        { id: `work-time-${index}`, kind: 'work_with_rest', exposureId: `work-${index}`, duration: { certainty: 'estimated', lower: 27, upper: 32, sourceId: 'synthetic-time' } },
        { id: `transition-${index}`, kind: 'transition', exposureId: null, duration: { certainty: 'estimated', lower: 2, upper: 3, sourceId: 'synthetic-time' } },
        { id: `reserve-${index}`, kind: 'reserve', exposureId: null, duration: { certainty: 'known', minutes: index === 0 ? 8 : 13, sourceId: 'synthetic-budget' } }
      ]
    }))
  }],
  result: { status: 'ready', selectedCandidateId: 'retain-synthetic', rationale: 'Ready refers only to this hypothetical contract example, not product readiness or coaching quality.' }
}
