import { describe, expect, it } from 'vitest'
import { buildManagerDecision } from '@/app/lib/agents/manager'
import type { ClassificationResult } from '@/app/lib/agents/types'

function classification(overrides: Partial<ClassificationResult>): ClassificationResult {
  return {
    input_type: 'question',
    domains: ['socius'],
    confidence: 0.9,
    context: {
      has_portions: false,
      has_score: false,
      is_benchmark: false
    },
    ...overrides
  }
}

describe('buildManagerDecision', () => {
  it('routes programming requests through Socius, Trainer, and Nutritionist with expanded context', () => {
    const decision = buildManagerDecision(
      classification({ input_type: 'question', domains: ['trainer'], confidence: 0.9 }),
      'Program tomorrow based on my recovery'
    )

    expect(decision.intent).toBe('programming_request')
    expect(decision.agents).toEqual(['socius', 'trainer', 'nutritionist'])
    expect(decision.context_request.recent_training_days).toBe(30)
    expect(decision.context_request.recent_recovery_days).toBe(30)
    expect(decision.context_request.user_goals).toBe(true)
    expect(decision.context_request.include_daily_context).toBe(true)
  })

  it('flags meal logs without portions for follow-up', () => {
    const decision = buildManagerDecision(
      classification({
        input_type: 'meal_log',
        domains: ['nutritionist'],
        context: { has_portions: false, has_score: false, is_benchmark: false }
      }),
      'Had a protein shake and banana'
    )

    expect(decision.intent).toBe('log_meal')
    expect(decision.agents).toEqual(['nutritionist'])
    expect(decision.follow_up_needed).toBe(true)
    expect(decision.follow_up_reason).toContain('portion')
  })

  it('returns unclear with no agents when confidence is too low', () => {
    const decision = buildManagerDecision(
      classification({ input_type: 'unclear', domains: [], confidence: 0.3 }),
      'hey'
    )

    expect(decision.intent).toBe('unclear')
    expect(decision.agents).toEqual([])
    expect(decision.follow_up_needed).toBe(true)
  })
})
