import type { DecisionPacket, Verdict } from '@/scripts/programming-decision-check'
import { demandTraceProfile, skillOutcome, snapshot, speedOutcome } from '@/scripts/programming-goal-demand-trace'
import { runningOutcome } from './personalized-coaching/intent'

type Claim = [DecisionPacket['checks'][number]['dimension'], string, Verdict]
const ownerId = 'synthetic-development-owner'

/** Development hypotheses and proposed labels, not athlete records or human adjudication. */
export function wholeWeekFixtures() {
  const speed = speedOutcome('acceleration')
  speed.goal.statement = 'Improve a 40 meter sprint, including acceleration and upright running speed'
  speed.goal.requiredQualityIds = ['acceleration', 'max_velocity']
  speed.binding.distance = { value: 40, unit: 'm' }
  const secondarySpeed = demandTraceProfile('strength')
  secondarySpeed.secondaryGoals = [{ id: 'goal:secondary:speed', domain: 'speed_agility', role: 'secondary',
    allocation: 'development', athleteIntent: 'Develop upright running speed' }]
  const running = snapshot([runningOutcome('goal:short-run', 1500), runningOutcome('goal:long-run', 10000)])
  running.content.priorityOrder = ['goal:short-run', 'goal:long-run']
  const mixedProfile = demandTraceProfile('aerobic')
  mixedProfile.secondaryGoals = [{ id: 'goal:secondary:strength', domain: 'strength', role: 'secondary',
    allocation: 'maintenance', athleteIntent: 'Retain strength while improving running' }]
  const mixed = snapshot([runningOutcome('goal:run', 1600), skillOutcome('goal:strength', 'strength', 'maximal_strength')])
  mixed.content.priorityOrder = ['goal:run', 'goal:strength']

  const scenarios: Array<{
    name: string; profile: ReturnType<typeof demandTraceProfile>; confirmed: ReturnType<typeof snapshot>
    evidence: string; missing: string[]; dispositions: DecisionPacket['dispositions'][number]['disposition'][]
    claims: Claim[]
  }> = [
    { name: 'Sprint qualities with incomplete upright exposure history', profile: demandTraceProfile('speed_agility'), confirmed: snapshot([speed]),
      evidence: 'The athlete completed two comparable acceleration sessions with smooth mechanics and no reported symptoms. An easy upright drill felt comfortable. No near-max upright exposure or current timed 40 meter result is recorded.',
      missing: ['Comparable upright-speed exposure and response.', 'A current standardized timed 40 meter assessment.'],
      dispositions: ['develop', 'introduce'], claims: [
        ['demand_mapping', 'Acceleration is relevant to the confirmed 40 meter goal.', 'supported'],
        ['evidence_fidelity', 'The easy upright drill establishes that a new timed 40 meter personal best has occurred.', 'insufficient_evidence'],
        ['emphasis', 'Retain an appropriate acceleration exposure while checking upright tolerance before selecting its intensity.', 'supported'],
        ['tradeoff', 'The athlete has shown intolerance of acceleration and it should be removed for that reason.', 'contradicted'],
        ['demand_mapping', 'Upright running speed is relevant to the confirmed goal even though its current performance is unknown.', 'supported'],
        ['emphasis', 'The upright-speed intensity in this compiled week is justified by demonstrated tolerance of comparable upright work.', 'insufficient_evidence'],
      ] },
    { name: 'Secondary upright speed lost during compilation', profile: secondarySpeed,
      confirmed: snapshot([skillOutcome('goal:strength', 'strength', 'maximal_strength'), speedOutcome('max_velocity')]),
      evidence: 'The athlete confirms both strength and upright speed goals. Two comparable lifting sessions were well tolerated. Current upright exposure, tolerance and timed results are unknown. The athlete has not withdrawn either goal.',
      missing: ['Upright exposure and tolerance.', 'A comparable current sprint result.'], dispositions: ['develop', 'observe'], claims: [
        ['demand_mapping', 'Maximal strength is relevant to the confirmed strength practice goal.', 'supported'],
        ['evidence_fidelity', 'The two lifting sessions prove that upright sprint performance has improved.', 'insufficient_evidence'],
        ['emphasis', 'Retain strength practice while obtaining the missing speed context.', 'supported'],
        ['tradeoff', 'The athlete withdrew the speed goal, so its omission from this compiled week follows their confirmed intent.', 'contradicted'],
        ['demand_mapping', 'Upright speed should remain a named demand while its individual emphasis is unresolved.', 'supported'],
        ['emphasis', 'A temporary delay in choosing maximal speed intensity should carry a reason and a tolerance reassessment condition.', 'supported'],
      ] },
    { name: 'Two running outcomes with explicit short-event priority', profile: demandTraceProfile('aerobic'), confirmed: running,
      evidence: 'The athlete prioritizes 1500 meter improvement over the 10000 meter outcome. Two comparable easy runs were tolerated. A current standardized 1500 meter assessment is slower than the agreed performance target. The 10000 meter outcome has not been measured recently. No extra training day is available.',
      missing: ['A current standardized 10000 meter result.', 'Tolerance of proposed faster intervals.'], dispositions: ['develop', 'maintain'], claims: [
        ['demand_mapping', 'Aerobic endurance is relevant to the 1500 meter outcome.', 'supported'],
        ['evidence_fidelity', 'The cited current 1500 meter assessment met its agreed target.', 'contradicted'],
        ['emphasis', 'The short-event priority supports considering more specific 1500 meter work within the available week, subject to tolerance and dose checks.', 'supported'],
        ['tradeoff', 'Prioritize the 10000 meter outcome because it is the athlete\'s confirmed first priority.', 'contradicted'],
        ['demand_mapping', 'Aerobic endurance is also relevant to the 10000 meter outcome.', 'supported'],
        ['emphasis', 'Recent evidence proves that the 10000 meter outcome is achieved and needs no further development.', 'insufficient_evidence'],
      ] },
    { name: 'Running priority with retained strength and uncertain interference', profile: mixedProfile, confirmed: mixed,
      evidence: 'The athlete confirms running as the current priority and asks to retain their repeatable strength practice. Recent strength sessions and easy runs were well tolerated. Two comparable strength checks met the athlete\'s established reference level. The latest running assessment remains below the desired outcome. No new training day is available; outside conditioning load is not recorded.',
      missing: ['Outside conditioning and its recovery cost.', 'Response to a proposed combination of hard running and lower-body lifting.'], dispositions: ['develop', 'maintain'], claims: [
        ['demand_mapping', 'Aerobic endurance is relevant to the running outcome.', 'supported'],
        ['evidence_fidelity', 'The latest running assessment demonstrates the desired running outcome was achieved.', 'contradicted'],
        ['emphasis', 'Running should receive the development emphasis while strength practice is retained, subject to validated scheduling and dose.', 'supported'],
        ['tradeoff', 'Increase both hard running and lower-body lifting volume immediately because their combined recovery cost is established as negligible.', 'insufficient_evidence'],
        ['demand_mapping', 'Maximal strength remains relevant to the retained strength practice goal.', 'supported'],
        ['emphasis', 'Maintaining the demonstrated strength level is a reasonable theme while prioritizing the unmet running outcome; this does not establish an exact maintenance dose.', 'supported'],
      ] },
  ]
  return scenarios.map((s, index) => {
    const demands = s.confirmed.content.outcomes.flatMap(o => o.goal.requiredQualityIds.map(quality => ({
      id: `${o.goal.id}:${quality}`, outcomeId: o.goal.id, quality, goal: o.goal.statement,
    })))
    if (demands.length !== 2) throw new Error('Development scenario requires two explicit demands')
    const packet: DecisionPacket = {
      dataset: 'synthetic_development',
      basis: { ownerId, intentId: `synthetic-week-${index + 1}`, intentVersion: 1, sourceRevision: 1, policyVersion: 'whole-week-development-1' },
      confirmedDemands: demands,
      evidence: [{ id: 'evidence_1', ownerId, status: 'confirmed', statement: s.evidence, protocol: 'Synthetic narrative; only explicitly comparable observations may be compared.' }],
      context: { constraints: ['All data is synthetic. These are independent review hypotheses, not six simultaneous instructions.',
        'Generated doses are compiler output under evaluation, not accepted prescriptions. Numerical activation remains disabled.'],
      missingFacts: s.missing, counterevidenceIds: ['evidence_1'] },
      dispositions: demands.map((d, i) => ({ demandId: d.id, disposition: s.dispositions[i],
        rationale: 'Candidate theme based on the stated goals and synthetic observations; compiled realization must be checked separately.',
        alternative: 'Retain the goal, clarify missing context and reassess before changing the dose.', evidenceIds: ['evidence_1'] })),
      checks: s.claims.map(([dimension, claim], i) => ({ id: `check_${i + 1}`, demandId: demands[i < 4 ? 0 : 1].id,
        dimension, claim, evidenceIds: ['evidence_1'] })),
    }
    return { name: s.name, profile: s.profile, confirmed: s.confirmed, packet, proposedLabels: s.claims.map(c => c[2]) }
  })
}
