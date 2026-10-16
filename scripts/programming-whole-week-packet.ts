/** Offline development preparation only. No evaluator, credentials, transport or runtime writes. */
import { buildDecisionCheck } from './programming-decision-check'
import { jsonBytes, sha256 } from './programming-shadow-packet'
import { traceGeneratedWeek } from './programming-goal-demand-trace'
import { wholeWeekFixtures } from '../test/fixtures/programming-whole-week'
import { validateCompleteProgrammingWeekDose } from '../app/lib/coach/program-validator'
import { personalizedCoachingCapabilities } from '../app/lib/personalized-coaching-capabilities'

export const WHOLE_WEEK_PACKET_VERSION = 'programming-whole-week-development-1'
type Trace = ReturnType<typeof traceGeneratedWeek>
type Fixture = ReturnType<typeof wholeWeekFixtures>[number]
const digest = (value: unknown) => sha256(jsonBytes(value))

/** Scoped target-presence assertions for these fixtures, not a general demand-to-dose adapter.
 * A matched domain target does not establish event specificity or sufficient dose.
 */
const targetIds: Record<string, string[]> = {
  acceleration: ['locomotor_acceleration'], max_velocity: ['maximum_velocity'],
  maximal_strength: ['hip_hinge', 'knee_dominant', 'horizontal_push', 'horizontal_pull'],
  aerobic_endurance: ['aerobic_base', 'aerobic_intervals'],
}

export function checkWholeWeek(trace: Trace, demands: Fixture['packet']['confirmedDemands']) {
  const dose = validateCompleteProgrammingWeekDose(trace.profile, trace.plan.schedule, trace.plan.sessions)
  return {
    dose,
    sourceInputsUnchanged: trace.summary.sourceInputsUnchanged,
    storedRoundtripMatches: trace.summary.readbackIntentMatches && digest(trace.plan) === digest(trace.readback.weekly_plan),
    timeAccounting: trace.plan.sessions.map(s => {
      const minutes = s.blocks.reduce((sum, b) => sum + b.estimatedMinutes, 0)
      return { sessionId: s.sessionId, minutes, budget: s.scheduledMinutes,
        fits: minutes <= s.scheduledMinutes,
        blockSumsMatch: s.blocks.every(b => b.estimatedMinutes === b.exercises.reduce((sum, e) => sum + e.estimatedMinutes, 0)) }
    }),
    demandPresence: demands.map(d => {
      const mapped = targetIds[d.quality]
      const assignments = trace.plan.schedule.assignments.filter(a => mapped?.includes(a.targetId))
      // Check the actual priority-work blocks too; preparation alone cannot satisfy this assertion.
      const matches = trace.plan.sessions.flatMap(s => s.blocks.filter(b => b.role === 'priority_adaptation'
        && b.coverageRequirementIds.some(id => assignments.some(a => a.requirementId === id)))
        .map(b => ({ sessionId: s.sessionId, blockId: b.id })))
      return { demandId: d.id, expectedTargetIds: mapped ?? [], matchedBlocks: matches,
        status: !mapped ? 'unmapped' : matches.length ? 'present' : 'missing',
        scope: 'Target presence only; no claim of event specificity, appropriate emphasis or adequate dose.' }
    }),
  }
}

export function prepareWholeWeekPacket() {
  const cases = wholeWeekFixtures().map((fixture, index) => {
    const original = digest(fixture)
    const trace = traceGeneratedWeek(fixture.profile, fixture.confirmed)
    const baseline = { proposal: trace.plan, acceptance: { status: 'unaccepted_synthetic_development' } }
    const built = buildDecisionCheck({ packet: fixture.packet, baseline, model: 'jev-1.13.0' })
    const state = {
      ...(built.request.state as Record<string, unknown>),
      scope: 'Evaluate each scoped hypothesis independently against this whole week. Candidate themes are not proof of their realization in the compiled week. No answer approves the week or a dose.',
      confirmedIntent: structuredClone(fixture.confirmed),
      // Full generated plan: profile, direction, coverage, schedule and every session prescription.
      compiledWeek: structuredClone(trace.plan),
      provenance: { packetVersion: WHOLE_WEEK_PACKET_VERSION, basis: built.basis,
        intentHash: digest(fixture.confirmed), compiledWeekHash: digest(trace.plan),
        serializedSessionsHash: digest(trace.serializedSessions), storedIntentHash: digest(trace.stored),
        numericalPolicyEnabled: personalizedCoachingCapabilities().initialDosePolicy },
    }
    const request = { ...built.request, state, model: 'jev-1.13.0' }
    const bytes = jsonBytes(request)
    if (Buffer.byteLength(bytes) > 180_000) throw new Error('Whole-week development packet exceeds local byte limit')
    if (digest(fixture) !== original || sha256(JSON.stringify(trace.plan)) !== built.basis.proposalHash) {
      throw new Error('Source mutated during packet preparation')
    }
    const id = `week_${String(index + 1).padStart(2, '0')}`
    return { id, name: fixture.name, request, requestHash: sha256(bytes), requestBytes: Buffer.byteLength(bytes),
      deterministic: checkWholeWeek(trace, fixture.packet.confirmedDemands), unchecked: built.unchecked,
      review: { modelState: structuredClone(state), questions: structuredClone(request.questions),
        labels: fixture.packet.checks.map((c, i) => ({ id: c.id, claim: c.claim, dimension: c.dimension,
          proposedVerdict: fixture.proposedLabels[i], reviewerVerdict: null, reviewer: null })) } }
  })
  const manifest = { schemaVersion: 1, packetVersion: WHOLE_WEEK_PACKET_VERSION, status: 'offline_prepared_awaiting_review',
    paidCallsAuthorized: 0, oldRunnerCompatible: false,
    entries: cases.map(c => ({ id: c.id, file: `${c.id}.request.json`, sha256: c.requestHash, bytes: c.requestBytes, questions: Object.keys(c.request.questions).length })) }
  const labels = { schemaVersion: 1, status: 'awaiting_review', cases: cases.map(c => ({ id: c.id, ...c.review })) }
  return { cases, manifest, manifestHash: digest(manifest), labels, labelsHash: digest(labels) }
}

export function renderWholeWeekReview(packet: ReturnType<typeof prepareWholeWeekPacket>) {
  return '# Whole-week JEV development review\n\nFour synthetic compiler outputs; 24 independent proposed judgments. Labels await human review. No model calls or overall program approval.\n\n'
    + packet.cases.map(c => `## ${c.id}: ${c.name}\n\n`
      + c.review.labels.map(l => `- ${l.id} (${l.dimension}): ${l.claim} Proposed: **${l.proposedVerdict}**.`).join('\n')
      + `\n\nDeterministic findings (not sent as answer hints):\n\n\`\`\`json\n${JSON.stringify(c.deterministic, null, 2)}\n\`\`\`\n`
      + `\nExact model state and all questions:\n\n\`\`\`json\n${JSON.stringify({ state: c.review.modelState, questions: c.review.questions }, null, 2)}\n\`\`\`\n`).join('\n')
}
