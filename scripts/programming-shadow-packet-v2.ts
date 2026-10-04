/** Versioned offline preparation. Review is rendered from the exact model state, never paraphrased. */
import { buildDecisionCheck } from './programming-decision-check'
import { jsonBytes, sha256, SHADOW_LIMITS } from './programming-shadow-packet'
import { clarifiedDecisionFixture, CLARIFIED_CASES } from '../test/fixtures/programming-decision-check-v2'

export function prepareClarifiedShadowPacket() {
  const cases = CLARIFIED_CASES.map((c, index) => {
    const input = clarifiedDecisionFixture(index)
    const built = buildDecisionCheck(input)
    const id = `case_${String(index + 1).padStart(2, '0')}`
    const request = { ...built.request, model: SHADOW_LIMITS.model }
    const bytes = jsonBytes(request)
    if (Buffer.byteLength(bytes) > SHADOW_LIMITS.maxRequestBytes) throw new Error('Clarified request exceeds budget')
    return { id, request, requestHash: sha256(bytes), requestBytes: Buffer.byteLength(bytes), basis: built.basis,
      unchecked: built.unchecked,
      review: { claim: built.checkedClaims[0].claim,
        // Include full evidence, goals, constraints and instructions for review, without rewording.
        modelState: structuredClone(request.state), question: structuredClone(request.questions.check_1),
        proposedVerdict: c.expected, reviewerVerdict: null, reviewer: null } }
  })
  const manifest = { schemaVersion: 1, purpose: 'programming_decision_quality', limits: SHADOW_LIMITS,
    entries: cases.map(c => ({ id: c.id, file: `${c.id}.request.json`, sha256: c.requestHash, bytes: c.requestBytes })) }
  const labels = { schemaVersion: 1, status: 'awaiting_review', cases: cases.map(c => ({ id: c.id, ...c.review })) }
  return { cases, manifest, manifestHash: sha256(jsonBytes(manifest)), labels, labelsHash: sha256(jsonBytes(labels)) }
}

export function renderClarifiedReview(packet: ReturnType<typeof prepareClarifiedShadowPacket>): string {
  const header = '# JEV clarified development packet v2\n\nProposed judgments only; no new paid calls or human labels recorded.\n\n'
  return header + packet.cases.map(c => `## ${c.id}\n\nExact claim: ${c.review.claim}\n\nProposed judgment: ${c.review.proposedVerdict}\n\nComplete model state and question:\n\n\`\`\`json\n${JSON.stringify({ state: c.review.modelState, question: c.review.question }, null, 2)}\n\`\`\`\n`).join('\n')
}
