import type {
  ClassificationResult,
  AgentMessage,
  AgentDomain,
  AgentRequest
} from './types'

/**
 * Route decision based on classification result.
 * - Single domain, confidence > 0.7: call one agent
 * - Multi-domain: sequential pipeline
 * - Low confidence (< 0.5): return clarification message
 */
export type RouteDecision =
  | { type: 'single'; domain: AgentDomain }
  | { type: 'multi'; domains: AgentDomain[] }
  | { type: 'clarify' }

export function determineRoute(classification: ClassificationResult): RouteDecision {
  const { domains, confidence } = classification

  // Low confidence — ask for clarification
  if (confidence < 0.5 || domains.length === 0) {
    return { type: 'clarify' }
  }

  // Single domain
  if (domains.length === 1) {
    return { type: 'single', domain: domains[0] }
  }

  // Multi-domain — sequential pipeline
  return { type: 'multi', domains }
}

/**
 * Build a clarification message when the classifier can't determine intent.
 */
export function buildClarificationMessage(): AgentMessage {
  return {
    role: 'system',
    content: "I'm not sure what you'd like to do. Could you clarify — is this a workout, a meal, or a question?"
  }
}

/**
 * Agent caller type — the actual agent implementations will satisfy this interface.
 * This allows the router to be tested independently of the real agents.
 */
export type AgentCaller = (
  userId: string,
  content: string,
  request: AgentRequest,
  previousMessages: AgentMessage[]
) => Promise<AgentMessage[]>

/**
 * Execute routing: calls agent(s) based on the route decision.
 * For multi-domain, runs sequentially so later agents see earlier responses.
 */
export async function executeRoute(
  decision: RouteDecision,
  userId: string,
  content: string,
  request: AgentRequest,
  agentCallers: Record<AgentDomain, AgentCaller>
): Promise<AgentMessage[]> {
  if (decision.type === 'clarify') {
    return [buildClarificationMessage()]
  }

  if (decision.type === 'single') {
    const caller = agentCallers[decision.domain]
    return caller(userId, content, request, [])
  }

  // Multi-domain: sequential pipeline
  const allMessages: AgentMessage[] = []
  for (const domain of decision.domains) {
    const caller = agentCallers[domain]
    const messages = await caller(userId, content, request, allMessages)
    allMessages.push(...messages)
  }
  return allMessages
}
