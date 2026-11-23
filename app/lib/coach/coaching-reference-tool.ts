import { CoachingContextError } from './coaching-context'
import { assertVerifiedContextPrincipal, type AuthorizeContextRequest, type ContextToolPolicy } from './coaching-context-tool'
import { COACHING_REFERENCE_DOMAINS, COACHING_REFERENCE_MAX_RESPONSE_BYTES, readCoachingReference } from './external-coaching-reference'

export const coachingReferenceTool = {
  name: 'get_coaching_reference',
  description: 'Use the versioned Coaching Playbook when drafting or revising a training week or block and when interpreting a monthly training review. The current publication includes goal assessment, build and maintenance dose, High/Low scheduling, progression and review. Request up to four relevant domains for more detail. Use get_coaching_context for saved athlete facts. This tool is read-only.',
  inputSchema: { type: 'object', properties: {
    version: { type: 'string', description: 'Exact published version from get_coaching_context; omit for current reviewed publication.' },
    domains: { type: 'array', items: { type: 'string', enum: COACHING_REFERENCE_DOMAINS }, maxItems: 4, uniqueItems: true },
  }, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
} as const

export function createCoachingReferenceTool(authorize: AuthorizeContextRequest, policy: ContextToolPolicy) {
  return { descriptor: coachingReferenceTool, async call(input: unknown) {
    try {
      const { principal, db } = await authorize()
      assertVerifiedContextPrincipal(principal, policy)
      const result = await db.auth.getUser()
      if (result.error || result.data.user?.id !== principal.subject) throw new CoachingContextError(401, 'Authenticated subject mismatch')
      // Static publication: no domain SELECT, RPC, provider call or mutation.
      const reference = readCoachingReference(input)
      const response = { structuredContent: { reference }, content: [{ type: 'text' as const, text: JSON.stringify({ reference }) }], isError: false }
      if (Buffer.byteLength(JSON.stringify(response), 'utf8') > COACHING_REFERENCE_MAX_RESPONSE_BYTES) {
        throw new CoachingContextError(503, 'Coaching reference exceeds the bounded response budget')
      }
      return response
    } catch (error) {
      if (error instanceof CoachingContextError) throw error
      throw new CoachingContextError(503, 'Coaching reference is unavailable')
    }
  } }
}
