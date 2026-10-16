/** Build review artifacts only. No dispatch, credentials or private data. */
import { createHash } from 'node:crypto'
import { buildDecisionCheck, type Verdict } from './programming-decision-check'
import { decisionFixture, DECISION_CASES } from '../test/fixtures/programming-decision-check'

export const SHADOW_LIMITS = {
  model: 'jev-1.13.0', maxRequests: 8, maxRequestBytes: 8192, maxSpendUsd: 0.10,
  // Published model maximum, used as a conservative pre-dispatch reservation.
  maxInputTokensPerRequest: 64000, inputUsdPerMillion: 0.042,
} as const
export const jsonBytes = (value: unknown) => JSON.stringify(value, null, 2) + '\n'
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const goals = [
  ['Improve the timed flying-run result.', 'upright_speed'],
  ['Build a comfortable walking habit without barbell training.', 'walking_capacity'],
  ['Reach an approach-jump event target.', 'approach_jump_power'],
  ['Retain achieved strength and prioritize the unmet running target.', 'strength_maintenance'],
  ['Reintroduce upright speed after symptoms have resolved.', 'upright_speed_tolerance'],
  ['Prepare for an implement-specific event.', 'event_specific_skill'],
  ['Improve pulling performance under a repeatable protocol.', 'pulling_strength'],
  ['Develop strength while preserving working-set technique.', 'strength_quality'],
]

export function prepareProgrammingShadowPacket() {
  const cases = DECISION_CASES.map((c, index) => {
    const input = decisionFixture(index)
    input.questionVersion = 'programming-decision-check-1' // Historical trial remains reproducible.
    const id = `case_${String(index + 1).padStart(2, '0')}`
    // Fixture IDs describe intended failures. Replace them before any model sees them.
    input.packet.checks[0].id = 'check_1'
    input.packet.confirmedDemands[0].goal = goals[index][0]
    input.packet.confirmedDemands[0].quality = goals[index][1]
    input.packet.context.constraints = index === 1 ? ['The athlete declines barbell training.'] : []
    input.packet.context.counterevidenceIds = index === 7 ? ['evidence-1'] : []
    input.packet.dispositions[0].disposition = index === 4 ? 'introduce' : input.packet.dispositions[0].disposition
    const built = buildDecisionCheck(input)
    const request = { ...built.request, model: SHADOW_LIMITS.model }
    const contents = jsonBytes(request)
    if (Buffer.byteLength(contents) > SHADOW_LIMITS.maxRequestBytes) throw new Error('Shadow request exceeds frozen budget')
    return { id, request, requestHash: sha256(contents), requestBytes: Buffer.byteLength(contents), basis: built.basis,
      review: { goal: goals[index][0], claim: c.claim, evidence: c.evidence,
        proposedVerdict: c.expected as Verdict, reviewerVerdict: null, reviewer: null } }
  })
  const manifest = { schemaVersion: 1, purpose: 'programming_decision_quality', limits: SHADOW_LIMITS,
    entries: cases.map(c => ({ id: c.id, file: `${c.id}.request.json`, sha256: c.requestHash, bytes: c.requestBytes })) }
  const labels = { schemaVersion: 1, status: 'awaiting_review', cases: cases.map(c => ({ id: c.id, ...c.review })) }
  return { cases, manifest, manifestHash: sha256(jsonBytes(manifest)), labels, labelsHash: sha256(jsonBytes(labels)) }
}
