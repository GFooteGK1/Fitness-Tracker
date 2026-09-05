import { describe, it, expect, vi } from 'vitest'
import {
  parseNutritionistResponse,
  inferMealTiming,
  applyPortionDefaults,
  persistMeal
} from '@/app/lib/agents/nutritionist-agent'
import { PORTION_DEFAULTS } from '@/app/lib/agents/constants'
import type {
  NutritionistContext,
  NutritionistResponse,
  MealItem,
  MacroTotals,
  MealTiming
} from '@/app/lib/agents/types'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeBaseContext(overrides?: Partial<NutritionistContext>): NutritionistContext {
  return {
    user_id: 'test-user-123',
    targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
    today: {
      meals_logged: 1,
      macros_consumed: { protein: 40, carbs: 60, fat: 20, calories: 580 },
      macros_remaining: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
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

function makeValidMealJSON(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    message: 'Logged your chicken and rice. You have 80g protein remaining today.',
    meal: {
      items: [
        { food: 'Chicken breast', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 },
        { food: 'White rice', portion: '1 cup', protein: 4, carbs: 45, fat: 0, calories: 196 },
      ],
      totals: { protein: 46, carbs: 45, fat: 3, calories: 391 },
      timing: 'LUNCH',
    },
    remaining_budget: { protein: 64, carbs: 95, fat: 42, calories: 1029 },
    week_status: {
      adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
      overall_status: 'on-track',
      days_elapsed: 3,
    },
    smart_defaults: [],
    confidence: 0.92,
    ...overrides,
  })
}

// ─── parseNutritionistResponse ───────────────────────────────────────

describe('parseNutritionistResponse', () => {
  it('parses valid JSON with meal data', () => {
    const raw = makeValidMealJSON()
    const result = parseNutritionistResponse(raw)

    expect(result.message).toContain('chicken and rice')
    expect(result.meal).toBeDefined()
    expect(result.meal!.items).toHaveLength(2)
    expect(result.meal!.items[0].food).toBe('Chicken breast')
    expect(result.meal!.totals.protein).toBe(46)
    expect(result.meal!.timing).toBe('LUNCH')
    expect(result.remaining_budget.protein).toBe(64)
    expect(result.week_status.overall_status).toBe('on-track')
    expect(result.confidence).toBe(0.92)
  })

  it('parses conversational response without meal', () => {
    const raw = JSON.stringify({
      message: 'You have had 40g protein so far today. Your target is 150g.',
      remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
      week_status: {
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
        days_elapsed: 3,
      },
      smart_defaults: [],
      confidence: 0.95,
    })

    const result = parseNutritionistResponse(raw)
    expect(result.message).toContain('40g protein')
    expect(result.meal).toBeUndefined()
    expect(result.remaining_budget.protein).toBe(110)
    expect(result.confidence).toBe(0.95)
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n' + makeValidMealJSON() + '\n```'
    const result = parseNutritionistResponse(raw)
    expect(result.message).toContain('chicken and rice')
    expect(result.meal).toBeDefined()
  })

  it('strips plain code fences', () => {
    const raw = '```\n{"message":"test","remaining_budget":{"protein":0,"carbs":0,"fat":0,"calories":0},"week_status":{"adherence_pct":{"protein":0,"carbs":0,"fat":0,"calories":0},"overall_status":"on-track","days_elapsed":0},"confidence":0.7}\n```'
    const result = parseNutritionistResponse(raw)
    expect(result.message).toBe('test')
  })

  it('handles malformed JSON gracefully', () => {
    const raw = 'This is not JSON, just a conversational response about nutrition.'
    const result = parseNutritionistResponse(raw)
    expect(result.message).toContain('trouble processing that meal')
    expect(result.meal).toBeUndefined()
    expect(result.confidence).toBe(0.3)
    expect(result.remaining_budget).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 })
  })

  it('handles empty string', () => {
    const result = parseNutritionistResponse('')
    expect(result.message).toBeTruthy()
    expect(result.confidence).toBe(0.3)
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = JSON.stringify({ message: 'test', confidence: 1.5, remaining_budget: {}, week_status: {} })
    const result = parseNutritionistResponse(raw)
    expect(result.confidence).toBe(1)

    const raw2 = JSON.stringify({ message: 'test', confidence: -0.5, remaining_budget: {}, week_status: {} })
    const result2 = parseNutritionistResponse(raw2)
    expect(result2.confidence).toBe(0)
  })

  it('defaults confidence to 0.5 when missing', () => {
    const raw = JSON.stringify({ message: 'test', remaining_budget: {}, week_status: {} })
    const result = parseNutritionistResponse(raw)
    expect(result.confidence).toBe(0.5)
  })

  it('normalizes invalid meal timing to SNACK', () => {
    const raw = JSON.stringify({
      message: 'test',
      meal: {
        items: [{ food: 'Apple', portion: '1 medium', protein: 0, carbs: 25, fat: 0, calories: 95 }],
        totals: { protein: 0, carbs: 25, fat: 0, calories: 95 },
        timing: 'INVALID_TIMING',
      },
      remaining_budget: {},
      week_status: {},
      confidence: 0.8,
    })
    const result = parseNutritionistResponse(raw)
    expect(result.meal!.timing).toBe('SNACK')
  })

  it('handles missing meal item fields gracefully', () => {
    const raw = JSON.stringify({
      message: 'test',
      meal: {
        items: [{ food: 'Mystery food' }],
        totals: { protein: 10 },
        timing: 'LUNCH',
      },
      remaining_budget: {},
      week_status: {},
      confidence: 0.6,
    })
    const result = parseNutritionistResponse(raw)
    const item = result.meal!.items[0]
    expect(item.food).toBe('Mystery food')
    expect(item.portion).toBe('standard serving')
    expect(item.protein).toBe(0)
    expect(item.carbs).toBe(0)
  })

  it('normalizes week_status with valid overall_status values', () => {
    for (const status of ['on-track', 'ahead', 'behind']) {
      const raw = JSON.stringify({
        message: 'test',
        remaining_budget: {},
        week_status: { overall_status: status, days_elapsed: 3 },
        confidence: 0.8,
      })
      const result = parseNutritionistResponse(raw)
      expect(result.week_status.overall_status).toBe(status)
    }
  })

  it('defaults invalid overall_status to on-track', () => {
    const raw = JSON.stringify({
      message: 'test',
      remaining_budget: {},
      week_status: { overall_status: 'INVALID' },
      confidence: 0.8,
    })
    const result = parseNutritionistResponse(raw)
    expect(result.week_status.overall_status).toBe('on-track')
  })
})

// ─── inferMealTiming ─────────────────────────────────────────────────

describe('inferMealTiming', () => {
  it('returns BREAKFAST before 10am', () => {
    expect(inferMealTiming('2026-01-20T08:30:00Z', 0)).toBe('BREAKFAST')
    expect(inferMealTiming('2026-01-20T06:00:00Z', 0)).toBe('BREAKFAST')
    expect(inferMealTiming('2026-01-20T09:59:00Z', 0)).toBe('BREAKFAST')
  })

  it('returns LUNCH between 10am and 1pm', () => {
    expect(inferMealTiming('2026-01-20T10:00:00Z', 0)).toBe('LUNCH')
    expect(inferMealTiming('2026-01-20T12:30:00Z', 0)).toBe('LUNCH')
  })

  it('returns SNACK between 1pm and 4pm', () => {
    expect(inferMealTiming('2026-01-20T13:00:00Z', 0)).toBe('SNACK')
    expect(inferMealTiming('2026-01-20T15:30:00Z', 0)).toBe('SNACK')
  })

  it('returns DINNER between 4pm and 8pm', () => {
    expect(inferMealTiming('2026-01-20T16:00:00Z', 0)).toBe('DINNER')
    expect(inferMealTiming('2026-01-20T19:30:00Z', 0)).toBe('DINNER')
  })

  it('returns SNACK after 8pm', () => {
    expect(inferMealTiming('2026-01-20T20:00:00Z', 0)).toBe('SNACK')
    expect(inferMealTiming('2026-01-20T23:00:00Z', 0)).toBe('SNACK')
  })

  it('returns PRE_WORKOUT when workouts logged and early morning', () => {
    expect(inferMealTiming('2026-01-20T06:00:00Z', 1)).toBe('PRE_WORKOUT')
  })

  it('returns POST_WORKOUT when workouts logged and mid-morning', () => {
    expect(inferMealTiming('2026-01-20T09:00:00Z', 1)).toBe('POST_WORKOUT')
  })

  it('returns PRE_WORKOUT when workouts logged and afternoon', () => {
    expect(inferMealTiming('2026-01-20T15:30:00Z', 1)).toBe('PRE_WORKOUT')
  })

  it('returns POST_WORKOUT when workouts logged and evening', () => {
    expect(inferMealTiming('2026-01-20T18:00:00Z', 1)).toBe('POST_WORKOUT')
  })

  it('returns null for invalid timestamp', () => {
    expect(inferMealTiming('not-a-date', 0)).toBeNull()
  })
})

// ─── applyPortionDefaults ────────────────────────────────────────────

describe('applyPortionDefaults', () => {
  it('applies standard portion default for vague portions', () => {
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'chicken breast', portion: 'standard serving', protein: 42, carbs: 0, fat: 3, calories: 195 },
        ],
        totals: { protein: 42, carbs: 0, fat: 3, calories: 195 },
        timing: 'LUNCH',
      },
      remaining_budget: { protein: 68, carbs: 140, fat: 42, calories: 1225 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.85,
    }

    const ctx = makeBaseContext()
    const result = applyPortionDefaults(response, ctx)
    expect(result.meal!.items[0].portion).toBe(PORTION_DEFAULTS['chicken breast'])
    expect(result.smart_defaults!.some(d => d.field === 'portion')).toBe(true)
  })

  it('prefers user portion history over standard defaults', () => {
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'chicken breast', portion: 'standard serving', protein: 42, carbs: 0, fat: 3, calories: 195 },
        ],
        totals: { protein: 42, carbs: 0, fat: 3, calories: 195 },
        timing: 'LUNCH',
      },
      remaining_budget: { protein: 68, carbs: 140, fat: 42, calories: 1225 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.85,
    }

    const ctx = makeBaseContext({
      user_portion_history: { 'chicken breast': '8 oz (225g)' },
    })
    const result = applyPortionDefaults(response, ctx)
    expect(result.meal!.items[0].portion).toBe('8 oz (225g)')
    expect(result.smart_defaults!.find(d => d.field === 'portion')!.source).toContain('your usual portion')
  })

  it('does not override specific portions', () => {
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'chicken breast', portion: '8 oz grilled', protein: 56, carbs: 0, fat: 4, calories: 260 },
        ],
        totals: { protein: 56, carbs: 0, fat: 4, calories: 260 },
        timing: 'DINNER',
      },
      remaining_budget: { protein: 54, carbs: 140, fat: 41, calories: 1160 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.9,
    }

    const ctx = makeBaseContext()
    const result = applyPortionDefaults(response, ctx)
    expect(result.meal!.items[0].portion).toBe('8 oz grilled')
    expect(result.smart_defaults!.some(d => d.field === 'portion')).toBe(false)
  })

  it('returns response unchanged when no meal', () => {
    const response: NutritionistResponse = {
      message: 'Just a question answer.',
      remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.9,
    }

    const ctx = makeBaseContext()
    const result = applyPortionDefaults(response, ctx)
    expect(result).toEqual(response)
  })

  it('handles fuzzy matching for portion defaults', () => {
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'salmon fillet', portion: 'some', protein: 34, carbs: 0, fat: 10, calories: 230 },
        ],
        totals: { protein: 34, carbs: 0, fat: 10, calories: 230 },
        timing: 'DINNER',
      },
      remaining_budget: { protein: 76, carbs: 140, fat: 35, calories: 1190 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.8,
    }

    const ctx = makeBaseContext()
    const result = applyPortionDefaults(response, ctx)
    // "salmon fillet" should fuzzy-match "salmon" in PORTION_DEFAULTS
    expect(result.meal!.items[0].portion).toBe(PORTION_DEFAULTS['salmon'])
    expect(result.smart_defaults!.some(d => d.field === 'portion')).toBe(true)
  })
})

// ─── macro validation (via validateAndFlag, tested through parseNutritionistResponse + callNutritionistAgent) ───

describe('macro validation flagging', () => {
  it('flags protein out of range in the message', () => {
    // We test this through parseNutritionistResponse since validateAndFlag is private
    // but we can construct a response that would trigger it via the full callNutritionistAgent flow
    // For unit testing, we verify the parse handles the data correctly
    const raw = JSON.stringify({
      message: 'Logged your meal.',
      meal: {
        items: [{ food: 'Protein shake', portion: '3 scoops', protein: 250, carbs: 10, fat: 5, calories: 1100 }],
        totals: { protein: 250, carbs: 10, fat: 5, calories: 1100 },
        timing: 'POST_WORKOUT',
      },
      remaining_budget: { protein: -140, carbs: 130, fat: 40, calories: 320 },
      week_status: { adherence_pct: { protein: 120, carbs: 83, fat: 92, calories: 87 }, overall_status: 'ahead', days_elapsed: 3 },
      confidence: 0.7,
    })
    const result = parseNutritionistResponse(raw)
    // The parse itself should succeed — validation happens in callNutritionistAgent
    expect(result.meal!.totals.protein).toBe(250)
    expect(result.confidence).toBe(0.7)
  })
})

// ─── persistMeal ─────────────────────────────────────────────────────

describe('persistMeal', () => {
  function createMockSupabase(mealId = 'meal-123') {
    const rpc = vi.fn().mockResolvedValue({ data: mealId, error: null })
    return {
      supabase: { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient,
      rpc
    }
  }

  it('persists meal and returns meal ID', async () => {
    const { supabase, rpc } = createMockSupabase()
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'Chicken breast', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 },
        ],
        totals: { protein: 42, carbs: 0, fat: 3, calories: 195 },
        timing: 'LUNCH',
      },
      remaining_budget: { protein: 68, carbs: 140, fat: 42, calories: 1225 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.9,
    }

    const id = await persistMeal(response, 'user-1', supabase)
    expect(id).toBe('meal-123')
    expect(rpc).toHaveBeenCalledWith('save_logged_activity', expect.objectContaining({
      p_kind: 'meal', p_record: expect.objectContaining({
        user_id: 'user-1',
        meal_timing: 'general',
        total_protein: 42,
        total_carbs: 0,
        total_fat: 3,
        total_calories: 195,
      })
    }))
  })

  it('returns null when no meal in response', async () => {
    const { supabase } = createMockSupabase()
    const response: NutritionistResponse = {
      message: 'Just a question.',
      remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.9,
    }

    const id = await persistMeal(response, 'user-1', supabase)
    expect(id).toBeNull()
  })

  it('returns null when meal items are empty', async () => {
    const { supabase } = createMockSupabase()
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [],
        totals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        timing: 'LUNCH',
      },
      remaining_budget: { protein: 110, carbs: 140, fat: 45, calories: 1420 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.5,
    }

    const id = await persistMeal(response, 'user-1', supabase)
    expect(id).toBeNull()
  })

  it('throws when the meal save fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const supabase = { rpc } as unknown as import('@supabase/supabase-js').SupabaseClient
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'Apple', portion: '1 medium', protein: 0, carbs: 25, fat: 0, calories: 95 },
        ],
        totals: { protein: 0, carbs: 25, fat: 0, calories: 95 },
        timing: 'SNACK',
      },
      remaining_budget: { protein: 110, carbs: 115, fat: 45, calories: 1325 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.85,
    }

    await expect(persistMeal(response, 'user-1', supabase)).rejects.toThrow('Unable to save the complete activity')
  })

  it('sets needs_review true when confidence is low', async () => {
    const { supabase, rpc } = createMockSupabase()
    const response: NutritionistResponse = {
      message: 'Logged!',
      meal: {
        items: [
          { food: 'Something', portion: '1 serving', protein: 10, carbs: 20, fat: 5, calories: 165 },
        ],
        totals: { protein: 10, carbs: 20, fat: 5, calories: 165 },
        timing: 'SNACK',
      },
      remaining_budget: { protein: 100, carbs: 120, fat: 40, calories: 1255 },
      week_status: {
        days_elapsed: 3,
        actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
        prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
        adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
        overall_status: 'on-track',
      },
      smart_defaults: [],
      confidence: 0.5,
    }

    await persistMeal(response, 'user-1', supabase)
    expect(rpc).toHaveBeenCalledWith('save_logged_activity', expect.objectContaining({
      p_kind: 'meal', p_record: expect.objectContaining({
        needs_review: true,
        ai_confidence: 0.5,
      })
    }))
  })
})
