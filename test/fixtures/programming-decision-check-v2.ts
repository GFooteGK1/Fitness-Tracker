import type { DecisionCheckInput, Dimension, Verdict } from '@/scripts/programming-decision-check'

/** Synthetic development labels proposed for review; not new athlete facts or human adjudications. */
export const CLARIFIED_CASES: Array<{
  goal: string; quality: string; dimension: Dimension; claim: string; evidence: string
  expected: Verdict; missingFacts: string[]; disposition: 'observe' | 'maintain' | 'introduce'
}> = [
  { goal: 'Improve a standardized timed flying-run result.', quality: 'upright_speed', dimension: 'demand_mapping',
    claim: 'Upright running speed is relevant to this goal.',
    evidence: 'The confirmed goal measures running speed during the upright portion of a flying run.',
    expected: 'supported', missingFacts: ['Current training exposure and response are unknown.'], disposition: 'observe' },
  { goal: 'Improve a standardized timed flying-run result.', quality: 'upright_speed', dimension: 'emphasis',
    claim: 'The available athlete evidence justifies increasing upright-speed training now.',
    evidence: 'The flying-run goal is confirmed. Current exposure, comparable performance, tolerance and competing priorities have not been supplied.',
    expected: 'insufficient_evidence', missingFacts: ['Current exposure, performance, tolerance and priorities.'], disposition: 'observe' },
  { goal: 'Improve a standardized timed flying-run result.', quality: 'upright_speed', dimension: 'tradeoff',
    claim: 'The demand map should retain upright speed and consider an appropriate exposure while resolving the athlete-specific emphasis.',
    evidence: 'Upright speed is relevant to the confirmed goal. No reason for excluding the quality is established; exact dose and emphasis remain unresolved.',
    expected: 'supported', missingFacts: ['Individual emphasis and eligible prescription.'], disposition: 'observe' },
  { goal: 'Meet an approach-jump target under a defined event protocol.', quality: 'approach_jump_power', dimension: 'evidence_fidelity',
    claim: 'The athlete met the approach-jump target in a comparable exact-event assessment.',
    evidence: 'Only a standing-jump proxy was measured. No exact approach-jump assessment result is available.',
    expected: 'insufficient_evidence', missingFacts: ['Comparable exact-event result.'], disposition: 'observe' },
  { goal: 'Meet an approach-jump target under a defined event protocol.', quality: 'approach_jump_power', dimension: 'evidence_fidelity',
    claim: 'The athlete met the approach-jump target in a comparable exact-event assessment.',
    evidence: 'The current verified exact-event assessment used the agreed protocol and scored below the agreed target. This is the assessment being discussed.',
    expected: 'contradicted', missingFacts: [], disposition: 'observe' },
  { goal: 'Meet an approach-jump target under a defined event protocol.', quality: 'approach_jump_power', dimension: 'evidence_fidelity',
    claim: 'The athlete met the approach-jump target in a comparable exact-event assessment.',
    evidence: 'The current verified exact-event assessment used the agreed protocol and met the agreed target. This is the assessment being discussed.',
    expected: 'supported', missingFacts: [], disposition: 'observe' },
  { goal: 'Retain achieved strength while improving the priority running outcome and retaining speed exposure.', quality: 'strength_maintenance', dimension: 'tradeoff',
    claim: 'Maintain achieved strength and prioritize the unmet running outcome while retaining appropriate speed exposure within the existing week.',
    evidence: 'Repeated comparable assessments meet the strength target. Comparable running assessments remain below target. The athlete confirms running is the current priority, reports good tolerance of existing speed work, and has no additional training days. Reviewed maintenance and running options exist, but their exact schedule has not yet been compiled.',
    expected: 'supported', missingFacts: ['Compiled time fit and exact prescription selection.'], disposition: 'maintain' },
  { goal: 'Improve a multi-event result involving running speed, strength and jumping.', quality: 'upright_speed', dimension: 'emphasis',
    claim: 'The available athlete evidence justifies adding maximal upright sprinting and increasing lower-body lifting volume together next week.',
    evidence: 'The athlete reports resolved symptoms and one easy lifting session. Only a standing-jump proxy has improved; no current direct sprint or approach-jump result is available. Recent upright-speed exposure and tolerance, outside conditioning demands and next-week availability are unknown.',
    expected: 'insufficient_evidence', missingFacts: ['Upright tolerance, outside training, schedule and comparable direct results.'], disposition: 'introduce' },
]

export function clarifiedDecisionFixture(index: number): DecisionCheckInput {
  const c = CLARIFIED_CASES[index]
  const input: DecisionCheckInput = {
    questionVersion: 'programming-decision-check-2', model: 'jev-1.13.0',
    baseline: { proposal: { id: 'synthetic-proposal', status: 'unchanged' }, acceptance: { state: 'proposed' } },
    packet: {
      dataset: 'synthetic_development',
      basis: { ownerId: 'synthetic-owner', intentId: 'synthetic-intent', intentVersion: 2, sourceRevision: 1, policyVersion: 'goal-exposure-clarification-1' },
      confirmedDemands: [{ id: 'demand_1', outcomeId: 'goal_1', quality: c.quality, goal: c.goal }],
      evidence: [{ id: 'evidence_1', ownerId: 'synthetic-owner', status: index === 3 ? 'proxy' : 'confirmed',
        statement: c.evidence, protocol: index === 4 || index === 5 ? 'verified synthetic exact-event protocol v1' : null }],
      context: { constraints: index >= 6 ? ['No new training day or numerical prescription is authorized by this judgment.'] : [],
        missingFacts: [...c.missingFacts], counterevidenceIds: index === 4 ? ['evidence_1'] : [] },
      dispositions: [{ demandId: 'demand_1', disposition: c.disposition,
        rationale: 'Provisional disposition pending the scoped review; it is not independent evidence.',
        alternative: 'Retain current work and obtain decision-changing missing context.', evidenceIds: ['evidence_1'] }],
      checks: [{ id: 'check_1', demandId: 'demand_1', dimension: c.dimension, claim: c.claim, evidenceIds: ['evidence_1'] }],
    },
  }
  if (index >= 6) {
    const otherQualities = index === 6 ? ['running_capacity', 'upright_speed'] : ['strength', 'jump_power']
    for (const [i, quality] of otherQualities.entries()) {
      const id = `demand_${i + 2}`
      input.packet.confirmedDemands.push({ id, outcomeId: `goal_${i + 2}`, quality, goal: c.goal })
      input.packet.dispositions.push({ ...input.packet.dispositions[0], demandId: id, disposition: 'observe' })
    }
  }
  return input
}
