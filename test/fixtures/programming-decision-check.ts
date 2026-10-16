import type { DecisionCheckInput, Dimension, Verdict } from '@/scripts/programming-decision-check'

/** Synthetic development expectations, not human-calibrated labels or model results. */
export const DECISION_CASES: Array<{
  id: string; dimension: Dimension; claim: string; evidence: string; status: 'confirmed' | 'proxy'
  expected: Verdict; protocol: string | null
}> = [
  { id: 'supported_mapping', dimension: 'demand_mapping', claim: 'The timed upright running goal requires upright speed work.',
    evidence: 'The confirmed goal is to improve a timed flying run under a standardized protocol.', status: 'confirmed', expected: 'supported', protocol: 'synthetic flying-run protocol v1' },
  { id: 'unsupported_mapping', dimension: 'demand_mapping', claim: 'The goal requires maximal barbell lifting.',
    evidence: 'The only confirmed goal is a comfortable walking habit. The athlete explicitly declines barbell training.', status: 'confirmed', expected: 'contradicted', protocol: null },
  { id: 'proxy_overreach', dimension: 'evidence_fidelity', claim: 'The exact approach-jump event target has been achieved.',
    evidence: 'Only a standing jump proxy was measured. No approach-jump event attempt has been recorded.', status: 'proxy', expected: 'insufficient_evidence', protocol: 'synthetic standing-jump protocol v1' },
  { id: 'maintenance', dimension: 'emphasis', claim: 'Maintain the achieved strength quality while emphasizing the unmet running goal.',
    evidence: 'Repeated comparable strength assessments meet the agreed target. The athlete confirms running is now the priority and its target remains unmet.', status: 'confirmed', expected: 'supported', protocol: 'synthetic strength assessment v1' },
  { id: 'uncertain_introduction', dimension: 'emphasis', claim: 'Current evidence establishes tolerance of maximal upright sprinting.',
    evidence: 'Symptoms are reported resolved. No recent upright running exposure or response is available.', status: 'confirmed', expected: 'insufficient_evidence', protocol: null },
  { id: 'justified_deferral', dimension: 'tradeoff', claim: 'Temporarily defer the exact event assessment until the required implement is available.',
    evidence: 'The confirmed event protocol requires an implement unavailable this week. Retain the goal and review access next week; a proxy cannot confirm attainment.', status: 'confirmed', expected: 'supported', protocol: 'synthetic implement-specific event v1' },
  { id: 'unknown_protocol', dimension: 'evidence_fidelity', claim: 'These two recorded pulling results establish like-for-like improvement.',
    evidence: 'The implement, handle height and rest conditions are unknown for both records.', status: 'confirmed', expected: 'insufficient_evidence', protocol: null },
  { id: 'counterevidence', dimension: 'evidence_fidelity', claim: 'All working sets were easy and technically sound.',
    evidence: 'The final two working sets were explicitly logged as hard with deteriorating technique.', status: 'confirmed', expected: 'contradicted', protocol: 'synthetic working-set log v1' },
]

export function decisionFixture(index = 0): DecisionCheckInput {
  const c = DECISION_CASES[index]
  return {
    // Test model identifier only: never dispatched by this suite.
    model: 'jev-1.13.0', baseline: { proposal: { sessions: [{ id: 'synthetic-session' }] }, acceptance: { state: 'proposed' } },
    packet: {
      dataset: 'synthetic_development',
      basis: { ownerId: 'synthetic-owner', intentId: 'synthetic-intent', intentVersion: 1, sourceRevision: 1, policyVersion: 'synthetic-policy-1' },
      confirmedDemands: [{ id: 'demand-1', outcomeId: 'goal-1', quality: 'case-specific-quality', goal: c.evidence }],
      evidence: [{ id: 'evidence-1', ownerId: 'synthetic-owner', status: c.status, statement: c.evidence, protocol: c.protocol }],
      context: { constraints: ['Use only the stated synthetic context.'], missingFacts: c.protocol === null ? ['No verified measurement protocol supplied.'] : [], counterevidenceIds: ['evidence-1'] },
      dispositions: [{ demandId: 'demand-1', disposition: index === 3 ? 'maintain' : index === 5 ? 'defer' : 'develop', rationale: c.claim, alternative: 'Retain the current emphasis and gather the missing evidence.', evidenceIds: ['evidence-1'] }],
      checks: [{ id: c.id, demandId: 'demand-1', dimension: c.dimension, claim: c.claim, evidenceIds: ['evidence-1'] }],
    },
  }
}
