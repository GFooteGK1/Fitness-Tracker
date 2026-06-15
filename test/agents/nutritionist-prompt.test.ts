import { describe, it, expect } from 'vitest'
import { buildNutritionistPrompt } from '@/app/lib/agents/prompts/nutritionist'
import { PORTION_DEFAULTS } from '@/app/lib/agents/constants'
import type { NutritionistContext, MealSummary, ChatMessage, RecentInsight } from '@/app/lib/agents/types'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeBaseContext(overrides?: Partial<NutritionistContext>): NutritionistContext {
  return {
    user_id: 'test-user-123',
    targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
    today: {
      meals_logged: 1,
      macros_consumed: { protein: 40, carbs: 60, fat: 15, calories: 535 },
      macros_remaining: { protein: 110, carbs: 140, fat: 50, calories: 1465 },
      workouts_logged: 0,
      latest_whoop_recovery: null,
      latest_whoop_strain: null,
    },
    week: {
      days_elapsed: 3,
      actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
      prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
      adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
      overall_status: 'on-track',
    },
    recent_chat: [],
    pending_insights: [],
    current_time: '2026-01-20T12:30:00Z',
    current_date: '2026-02-28',
    day_of_week: 'Tuesday',
    has_whoop: false,
    todays_meals: [],
    portion_defaults: PORTION_DEFAULTS,
    user_portion_history: null,
    ...overrides,
  }
}

function makeMeal(overrides?: Partial<MealSummary>): MealSummary {
  return {
    id: 'meal-1',
    timestamp: '2026-01-20T08:00:00Z',
    timing: 'BREAKFAST',
    items: [
      { food: 'Eggs', portion: '3 large', protein: 18, carbs: 1, fat: 15, calories: 210 },
      { food: 'Toast', portion: '2 slices', protein: 6, carbs: 26, fat: 2, calories: 146 },
    ],
    totals: { protein: 24, carbs: 27, fat: 17, calories: 356 },
    ...overrides,
  }
}

// ─── Core Function Tests ─────────────────────────────────────────────

describe('buildNutritionistPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toBeTruthy()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes the Nutritionist persona', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('SociusFit Nutritionist')
    expect(prompt).toContain('sports nutritionist')
    expect(prompt).toContain('Supportive, consistency-oriented, practical')
  })

  it('includes current state from context', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Tuesday')
    expect(prompt).toContain('2026-01-20T12:30:00Z')
    expect(prompt).toContain('Meals logged today: 1')
  })

  it('embeds WHOOP data when available', () => {
    const ctx = makeBaseContext({
      has_whoop: true,
      today: {
        meals_logged: 2,
        macros_consumed: { protein: 80, carbs: 100, fat: 30, calories: 1000 },
        macros_remaining: { protein: 70, carbs: 100, fat: 35, calories: 1000 },
        workouts_logged: 1,
        latest_whoop_recovery: 75,
        latest_whoop_strain: 12.3,
      },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('75%')
    expect(prompt).toContain('12.3')
    expect(prompt).toContain('Has WHOOP: Yes')
  })

  it('shows N/A when WHOOP data is absent', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('WHOOP Recovery: N/A')
    expect(prompt).toContain('WHOOP Strain: N/A')
    expect(prompt).toContain('Has WHOOP: No')
  })
})

// ─── Daily Targets & Budget Embedding ────────────────────────────────

describe('buildNutritionistPrompt - targets and budget', () => {
  it('embeds daily targets', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Protein: 150g')
    expect(prompt).toContain('Carbs: 200g')
    expect(prompt).toContain('Fat: 65g')
    expect(prompt).toContain('Calories: 2000')
    expect(prompt).toContain('Tolerance: ±10%')
  })

  it('embeds consumed macros', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Protein: 40g')
    expect(prompt).toContain('Carbs: 60g')
    expect(prompt).toContain('Fat: 15g')
    expect(prompt).toContain('Calories: 535')
  })

  it('embeds remaining budget', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Protein: 110g')
    expect(prompt).toContain('Carbs: 140g')
    expect(prompt).toContain('Fat: 50g')
    expect(prompt).toContain('Calories: 1465')
  })
})

// ─── Today's Meals Embedding ─────────────────────────────────────────

describe('buildNutritionistPrompt - todays meals', () => {
  it('shows "No meals logged yet today" when empty', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext({ todays_meals: [] }))
    expect(prompt).toContain('No meals logged yet today')
  })

  it('embeds meal details from context', () => {
    const meal = makeMeal()
    const prompt = buildNutritionistPrompt(makeBaseContext({ todays_meals: [meal] }))
    expect(prompt).toContain('BREAKFAST')
    expect(prompt).toContain('Eggs')
    expect(prompt).toContain('3 large')
    expect(prompt).toContain('Toast')
    expect(prompt).toContain('2 slices')
    expect(prompt).toContain('P:24g')
    expect(prompt).toContain('356 cal')
  })

  it('embeds multiple meals', () => {
    const breakfast = makeMeal({ id: 'meal-1', timing: 'BREAKFAST' })
    const lunch = makeMeal({
      id: 'meal-2',
      timestamp: '2026-01-20T12:00:00Z',
      timing: 'LUNCH',
      items: [{ food: 'Chicken Salad', portion: '1 bowl', protein: 35, carbs: 15, fat: 12, calories: 308 }],
      totals: { protein: 35, carbs: 15, fat: 12, calories: 308 },
    })
    const prompt = buildNutritionistPrompt(makeBaseContext({ todays_meals: [breakfast, lunch] }))
    expect(prompt).toContain('BREAKFAST')
    expect(prompt).toContain('LUNCH')
    expect(prompt).toContain('Eggs')
    expect(prompt).toContain('Chicken Salad')
  })

  it('handles meals with null timing', () => {
    const meal = makeMeal({ timing: null })
    const prompt = buildNutritionistPrompt(makeBaseContext({ todays_meals: [meal] }))
    expect(prompt).toContain('unspecified')
  })
})

// ─── Portion Defaults Embedding ──────────────────────────────────────

describe('buildNutritionistPrompt - portion defaults', () => {
  it('embeds standard portion defaults', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('chicken breast: 6 oz (170g)')
    expect(prompt).toContain('rice: 1 cup cooked (200g)')
    expect(prompt).toContain('greek yogurt: 1 cup (227g)')
    expect(prompt).toContain('protein shake: 1 scoop (30g powder)')
  })

  it('works with custom portion defaults', () => {
    const ctx = makeBaseContext({
      portion_defaults: { 'tofu': '4 oz (113g)', 'quinoa': '1/2 cup cooked (90g)' },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('tofu: 4 oz (113g)')
    expect(prompt).toContain('quinoa: 1/2 cup cooked (90g)')
    // Should not contain the standard defaults
    expect(prompt).not.toContain('chicken breast: 6 oz')
  })
})

// ─── User Portion History ────────────────────────────────────────────

describe('buildNutritionistPrompt - user portion history', () => {
  it('shows "No portion history available" when null', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext({ user_portion_history: null }))
    expect(prompt).toContain('No portion history available')
  })

  it('embeds user portion history when present', () => {
    const ctx = makeBaseContext({
      user_portion_history: { 'chicken breast': '8 oz', 'rice': '2 cups cooked' },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('chicken breast: 8 oz')
    expect(prompt).toContain('rice: 2 cups cooked')
  })
})

// ─── Week-to-Date Adherence ──────────────────────────────────────────

describe('buildNutritionistPrompt - week-to-date adherence', () => {
  it('embeds week-to-date status', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Week-to-Date (3 days)')
    expect(prompt).toContain('Status: on-track')
    expect(prompt).toContain('P:89%')
    expect(prompt).toContain('C:83%')
    expect(prompt).toContain('F:92%')
    expect(prompt).toContain('Cal:87%')
  })

  it('includes on-track adherence guidance', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Adherence Guidance')
    expect(prompt).toContain('ON-TRACK')
    expect(prompt).toContain('Reinforce consistency')
  })

  it('includes behind adherence guidance when behind', () => {
    const ctx = makeBaseContext({
      week: {
        days_elapsed: 4,
        actual: { protein: 300, carbs: 400, fat: 150, calories: 4100 },
        prorated_target: { protein: 600, carbs: 800, fat: 260, calories: 8000 },
        adherence_pct: { protein: 50, carbs: 50, fat: 58, calories: 51 },
        overall_status: 'behind',
      },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('BEHIND')
    expect(prompt).toContain('constructive guidance')
    expect(prompt).toContain('protein (50%)')
  })

  it('includes ahead adherence guidance when ahead', () => {
    const ctx = makeBaseContext({
      week: {
        days_elapsed: 3,
        actual: { protein: 550, carbs: 750, fat: 250, calories: 7400 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 122, carbs: 125, fat: 128, calories: 123 },
        overall_status: 'ahead',
      },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('AHEAD')
    expect(prompt).toContain('Gentle awareness')
    expect(prompt).toContain('protein (122%)')
  })
})

// ─── End-of-Week Summary ─────────────────────────────────────────────

describe('buildNutritionistPrompt - end-of-week summary', () => {
  it('does not include end-of-week summary when days_elapsed < 6', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).not.toContain('End-of-Week Summary')
  })

  it('includes end-of-week summary when days_elapsed >= 6', () => {
    const ctx = makeBaseContext({
      week: {
        days_elapsed: 7,
        actual: { protein: 1050, carbs: 1400, fat: 455, calories: 13800 },
        prorated_target: { protein: 1050, carbs: 1400, fat: 455, calories: 14000 },
        adherence_pct: { protein: 100, carbs: 100, fat: 100, calories: 99 },
        overall_status: 'on-track',
      },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('End-of-Week Summary')
    expect(prompt).toContain('Days tracked: 7')
    expect(prompt).toContain('consistency trends')
    expect(prompt).toContain('actionable suggestion')
  })

  it('includes end-of-week summary at exactly 6 days', () => {
    const ctx = makeBaseContext({
      week: {
        days_elapsed: 6,
        actual: { protein: 900, carbs: 1200, fat: 390, calories: 12000 },
        prorated_target: { protein: 900, carbs: 1200, fat: 390, calories: 12000 },
        adherence_pct: { protein: 100, carbs: 100, fat: 100, calories: 100 },
        overall_status: 'on-track',
      },
    })
    const prompt = buildNutritionistPrompt(ctx)
    expect(prompt).toContain('End-of-Week Summary')
    expect(prompt).toContain('Days tracked: 6')
  })
})

// ─── Meal Timing Inference Rules ─────────────────────────────────────

describe('buildNutritionistPrompt - meal timing rules', () => {
  it('includes meal timing inference rules', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Meal Timing Inference')
    expect(prompt).toContain('BREAKFAST')
    expect(prompt).toContain('LUNCH')
    expect(prompt).toContain('DINNER')
    expect(prompt).toContain('SNACK')
    expect(prompt).toContain('PRE_WORKOUT')
    expect(prompt).toContain('POST_WORKOUT')
    expect(prompt).toContain('Workout proximity overrides')
  })
})

// ─── Instruction Sections ────────────────────────────────────────────

describe('buildNutritionistPrompt - instructions', () => {
  it('includes macro validation rules', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Macro Validation')
    expect(prompt).toContain('0–200g')
    expect(prompt).toContain('0–300g')
    expect(prompt).toContain('0–150g')
    expect(prompt).toContain('within 10%')
  })

  it('includes smart default rules', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Smart Default')
    expect(prompt).toContain('Missing portion size')
    expect(prompt).toContain('Missing meal timing')
  })

  it('includes adherence messaging rules', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Adherence Messaging')
    expect(prompt).toContain('On-track')
    expect(prompt).toContain('Behind')
    expect(prompt).toContain('Ahead')
  })

  it('includes tool-use response format', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Tool Use Instructions')
    expect(prompt).toContain('log_meal')
    expect(prompt).toContain('query_meals')
    expect(prompt).toContain('update_meal')
    expect(prompt).toContain('conversational message')
    expect(prompt).toContain('respond directly without calling tools')
    expect(prompt).toContain('respond with just a text message')
  })

  it('includes portion and timing instructions', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext())
    expect(prompt).toContain('Parse meals and estimate macros')
    expect(prompt).toContain('remaining daily budget')
    expect(prompt).toContain('week-to-date adherence')
    expect(prompt).toContain('Infer meal_timing')
  })
})

// ─── Pending Insights & Recent Chat ──────────────────────────────────

describe('buildNutritionistPrompt - insights and chat', () => {
  it('shows "None" when no pending insights', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext({ pending_insights: [] }))
    expect(prompt).toContain('Pending Insights')
    expect(prompt).toContain('None')
  })

  it('embeds pending insights when present', () => {
    const insights: RecentInsight[] = [{
      id: 'i1',
      pattern_id: 'CAL_DEF',
      priority: 'urgent',
      confidence: 0.85,
      content: 'Caloric deficit detected on high-strain day',
      created_at: '2026-01-20T10:00:00Z',
    }]
    const prompt = buildNutritionistPrompt(makeBaseContext({ pending_insights: insights }))
    expect(prompt).toContain('CAL_DEF')
    expect(prompt).toContain('urgent')
    expect(prompt).toContain('Caloric deficit detected')
  })

  it('shows "No recent conversation" when chat is empty', () => {
    const prompt = buildNutritionistPrompt(makeBaseContext({ recent_chat: [] }))
    expect(prompt).toContain('No recent conversation')
  })

  it('embeds recent chat messages (last 5)', () => {
    const messages: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      user_id: 'test-user-123',
      role: i % 2 === 0 ? 'user' as const : 'nutritionist' as const,
      content: `Message ${i}`,
      input_mode: null,
      input_type: null,
      domain: null,
      confidence: null,
      related_entity_id: null,
      related_entity_type: null,
      is_compacted: false,
      created_at: `2026-01-20T${10 + i}:00:00Z`,
    }))
    const prompt = buildNutritionistPrompt(makeBaseContext({ recent_chat: messages }))
    // Should include last 5 messages (indices 3-7)
    expect(prompt).toContain('Message 3')
    expect(prompt).toContain('Message 7')
    // Should NOT include earlier messages
    expect(prompt).not.toContain('[user]: Message 0')
    expect(prompt).not.toContain('[nutritionist]: Message 1')
    expect(prompt).not.toContain('[user]: Message 2')
  })
})
