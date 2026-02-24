import Anthropic from '@anthropic-ai/sdk'
import type { ClassificationResult, InputMode, InputType, AgentDomain } from './types'
import { CLASSIFIER_SYSTEM_PROMPT, buildClassifierInput } from './prompts/classifier'

const CLASSIFIER_MODEL = 'claude-haiku-3-20241022'

/**
 * Classify user input using Claude Haiku.
 * Falls back to keyword-based classification on LLM failure.
 */
export async function classifyInput(
  content: string,
  inputMode: InputMode
): Promise<ClassificationResult> {
  try {
    return await classifyWithLLM(content, inputMode)
  } catch (error) {
    console.error('Classifier LLM call failed, falling back to keywords:', error)
    return classifyWithKeywords(content, inputMode)
  }
}

/**
 * LLM-based classification via Claude Haiku.
 */
async function classifyWithLLM(
  content: string,
  inputMode: InputMode
): Promise<ClassificationResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const message = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildClassifierInput(content, inputMode) }]
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseClassificationResult(text)
}

/**
 * Parse raw JSON text from the LLM into a validated ClassificationResult.
 */
export function parseClassificationResult(text: string): ClassificationResult {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(cleaned)

  // Validate and coerce fields
  const inputType = validateInputType(parsed.input_type)
  const domains = validateDomains(parsed.domains)
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))

  const ctx = parsed.context || parsed.extracted_context || {}

  return {
    input_type: inputType,
    domains,
    confidence,
    context: {
      date: typeof ctx.date === 'string' ? ctx.date : undefined,
      meal_timing: ctx.meal_timing || undefined,
      has_portions: Boolean(ctx.has_portions),
      has_score: Boolean(ctx.has_score),
      is_benchmark: Boolean(ctx.is_benchmark),
      benchmark_name: typeof ctx.benchmark_name === 'string' ? ctx.benchmark_name : undefined
    }
  }
}

const VALID_INPUT_TYPES: InputType[] = ['workout_log', 'meal_log', 'question', 'mixed', 'unclear']
const VALID_DOMAINS: AgentDomain[] = ['trainer', 'nutritionist', 'socius']

function validateInputType(value: unknown): InputType {
  if (typeof value === 'string' && VALID_INPUT_TYPES.includes(value as InputType)) {
    return value as InputType
  }
  return 'unclear'
}

function validateDomains(value: unknown): AgentDomain[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (d): d is AgentDomain => typeof d === 'string' && VALID_DOMAINS.includes(d as AgentDomain)
  )
}

// ─── Keyword-Based Fallback ──────────────────────────────────────────

const WORKOUT_KEYWORDS = [
  'workout', 'exercise', 'lift', 'deadlift', 'squat', 'bench', 'pr',
  'amrap', 'emom', 'reps', 'sets', 'weight', 'strength', 'metcon', 'wod',
  'clean', 'snatch', 'jerk', 'pull-up', 'push-up', 'burpee', 'row',
  'run', 'fran', 'grace', 'murph', 'helen', 'diane', 'cindy', 'karen',
  'for time', 'rounds', 'rx'
]

const NUTRITION_KEYWORDS = [
  'protein', 'calories', 'carbs', 'fat', 'meal', 'food', 'ate', 'eating',
  'macros', 'diet', 'nutrition', 'breakfast', 'lunch', 'dinner', 'snack',
  'chicken', 'rice', 'eggs', 'shake', 'oatmeal', 'salmon', 'steak'
]

const CROSS_DOMAIN_TRIGGERS = [
  'affect', 'impact', 'correlation', 'relationship', 'between',
  'how does my', 'trend', 'insight', 'pattern'
]

const BENCHMARK_NAMES = [
  'fran', 'grace', 'helen', 'diane', 'elizabeth', 'annie', 'nancy',
  'karen', 'cindy', 'mary', 'murph', 'dt', 'kalsu', 'jt', 'badger',
  'fight gone bad', 'filthy fifty', 'king kong', 'nate', 'randy'
]

function findMatches(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase()
  return keywords.filter(k => lower.includes(k.toLowerCase()))
}

/**
 * Keyword-based fallback classification when LLM is unavailable.
 */
export function classifyWithKeywords(content: string, inputMode: InputMode): ClassificationResult {
  const workoutMatches = findMatches(content, WORKOUT_KEYWORDS)
  const nutritionMatches = findMatches(content, NUTRITION_KEYWORDS)
  const crossDomainMatches = findMatches(content, CROSS_DOMAIN_TRIGGERS)
  const benchmarkMatches = findMatches(content, BENCHMARK_NAMES)

  const isQuestion = content.includes('?') ||
    /^(what|how|when|where|why|who|did|do|have|has|is|are|was|were)\b/i.test(content.trim())

  let inputType: InputType = 'unclear'
  let domains: AgentDomain[] = []
  let confidence = 0.3

  if (crossDomainMatches.length > 0) {
    inputType = 'question'
    domains = ['socius']
    confidence = 0.7
  } else if (workoutMatches.length > 0 && nutritionMatches.length > 0) {
    inputType = 'mixed'
    domains = ['trainer', 'nutritionist']
    confidence = 0.6
  } else if (workoutMatches.length > 0) {
    inputType = isQuestion ? 'question' : 'workout_log'
    domains = ['trainer']
    confidence = 0.7
  } else if (nutritionMatches.length > 0) {
    inputType = isQuestion ? 'question' : 'meal_log'
    domains = ['nutritionist']
    confidence = 0.7
  } else if (isQuestion) {
    inputType = 'question'
    domains = ['socius']
    confidence = 0.5
  }

  return {
    input_type: inputType,
    domains,
    confidence,
    context: {
      has_portions: /\d+\s*(oz|g|cup|tbsp|lb|kg|slice|scoop)/i.test(content),
      has_score: /\d+[+:]\d+|\d+:\d{2}/.test(content),
      is_benchmark: benchmarkMatches.length > 0,
      benchmark_name: benchmarkMatches[0] || undefined
    }
  }
}
