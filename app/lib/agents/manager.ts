import type {
  AgentDomain,
  ClassificationResult,
  ManagerContextRequest,
  ManagerDecision,
  ManagerIntent
} from './types'

const DEFAULT_CONTEXT_REQUEST: ManagerContextRequest = {
  user_goals: true,
  recent_training_days: 14,
  recent_nutrition_days: 14,
  recent_recovery_days: 14,
  include_prs: true,
  include_today_program: true,
  include_daily_context: true
}

/**
 * The Manager owns routing plus context-budget selection.
 *
 * This is intentionally deterministic for v1. The classifier still handles
 * language ambiguity, then Manager maps the result to an explicit retrieval
 * contract for downstream agents.
 */
export function buildManagerDecision(
  classification: ClassificationResult,
  content: string
): ManagerDecision {
  const intent = inferManagerIntent(classification, content)
  const agents = selectAgents(classification.domains, intent)
  const contextRequest = buildContextRequest(intent, classification.domains)
  const followUpReason = getFollowUpReason(classification)

  return {
    intent,
    agents,
    context_request: contextRequest,
    follow_up_needed: followUpReason !== undefined,
    follow_up_reason: followUpReason,
    confidence: classification.confidence
  }
}

function inferManagerIntent(
  classification: ClassificationResult,
  content: string
): ManagerIntent {
  if (classification.confidence < 0.5 || classification.input_type === 'unclear') {
    return 'unclear'
  }

  if (isProgrammingRequest(content)) {
    return 'programming_request'
  }

  switch (classification.input_type) {
    case 'workout_log':
      return 'log_workout'
    case 'meal_log':
      return 'log_meal'
    case 'question':
      return 'ask_question'
    case 'mixed':
      return 'mixed'
  }
}

function isProgrammingRequest(content: string): boolean {
  const lower = content.toLowerCase()
  return [
    'program',
    'programming',
    'what should i train',
    'what should i do today',
    'scale today',
    'scale the workout',
    'build me a week',
    'plan my week',
    'tomorrow based on my recovery',
    'based on my recovery'
  ].some(phrase => lower.includes(phrase))
}

function selectAgents(domains: AgentDomain[], intent: ManagerIntent): AgentDomain[] {
  if (intent === 'unclear') return []

  if (intent === 'programming_request') {
    return ['socius', 'trainer', 'nutritionist']
  }

  if (domains.length > 0) return domains

  return intent === 'ask_question' ? ['socius'] : []
}

function buildContextRequest(
  intent: ManagerIntent,
  domains: AgentDomain[]
): ManagerContextRequest {
  const request = { ...DEFAULT_CONTEXT_REQUEST }

  if (intent === 'log_workout') {
    request.recent_training_days = 7
    request.recent_nutrition_days = 1
    request.recent_recovery_days = 7
  }

  if (intent === 'log_meal') {
    request.recent_training_days = 1
    request.recent_nutrition_days = 7
    request.recent_recovery_days = 1
  }

  if (intent === 'programming_request') {
    request.recent_training_days = 30
    request.recent_nutrition_days = 14
    request.recent_recovery_days = 30
  }

  if (domains.includes('socius')) {
    request.recent_training_days = Math.max(request.recent_training_days, 30)
    request.recent_nutrition_days = Math.max(request.recent_nutrition_days, 30)
    request.recent_recovery_days = Math.max(request.recent_recovery_days, 30)
  }

  return request
}

function getFollowUpReason(classification: ClassificationResult): string | undefined {
  if (classification.confidence < 0.5) {
    return 'The input could not be confidently routed.'
  }

  if (classification.input_type === 'meal_log' && !classification.context.has_portions) {
    return 'Meal was logged without portion details.'
  }

  if (classification.input_type === 'workout_log' && !classification.context.has_score) {
    return 'Workout was logged without a score or result.'
  }

  return undefined
}
