import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  aggregateMacros,
  calculateRemaining,
  calculateWeekAdherence,
  calculateRecoveryTrend,
  getWeekStart
} from '@/app/lib/agents/context-builder'
import { MOVEMENT_ALIASES } from '@/app/lib/agents/constants'
import type { MealSummary, MacroTargets, MacroTotals } from '@/app/lib/agents/types'

// ─── aggregateMacros ─────────────────────────────────────────────────

describe('aggregateMacros', () => {
  it('returns zeros for empty meals array', () => {
    const result = aggregateMacros([])
    expect(result).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 })
  })

  it('sums macros from a single meal', () => {
    const meals: MealSummary[] = [{
      id: 'm1', timestamp: '2026-01-20T12:00:00Z', timing: 'LUNCH', items: [],
      totals: { protein: 40, carbs: 50, fat: 15, calories: 500 }
    }]
    const result = aggregateMacros(meals)
    expect(result).toEqual({ protein: 40, carbs: 50, fat: 15, calories: 500 })
  })

  it('sums macros from multiple meals', () => {
    const meals: MealSummary[] = [
      { id: 'm1', timestamp: '2026-01-20T08:00:00Z', timing: 'BREAKFAST', items: [],
        totals: { protein: 30, carbs: 40, fat: 10, calories: 370 } },
      { id: 'm2', timestamp: '2026-01-20T12:00:00Z', timing: 'LUNCH', items: [],
        totals: { protein: 45, carbs: 60, fat: 20, calories: 600 } },
      { id: 'm3', timestamp: '2026-01-20T18:00:00Z', timing: 'DINNER', items: [],
        totals: { protein: 50, carbs: 70, fat: 25, calories: 710 } }
    ]
    const result = aggregateMacros(meals)
    expect(result).toEqual({ protein: 125, carbs: 170, fat: 55, calories: 1680 })
  })

  it('handles meals with zero macros', () => {
    const meals: MealSummary[] = [
      { id: 'm1', timestamp: '2026-01-20T08:00:00Z', timing: null, items: [],
        totals: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
      { id: 'm2', timestamp: '2026-01-20T12:00:00Z', timing: null, items: [],
        totals: { protein: 30, carbs: 40, fat: 10, calories: 370 } }
    ]
    const result = aggregateMacros(meals)
    expect(result).toEqual({ protein: 30, carbs: 40, fat: 10, calories: 370 })
  })
})

// ─── calculateRemaining ──────────────────────────────────────────────

describe('calculateRemaining', () => {
  const targets: MacroTargets = {
    protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10
  }

  it('returns full targets when nothing consumed', () => {
    const consumed: MacroTotals = { protein: 0, carbs: 0, fat: 0, calories: 0 }
    const result = calculateRemaining(consumed, targets)
    expect(result).toEqual({ protein: 150, carbs: 200, fat: 65, calories: 2000 })
  })

  it('calculates remaining correctly for partial consumption', () => {
    const consumed: MacroTotals = { protein: 80, carbs: 120, fat: 30, calories: 1100 }
    const result = calculateRemaining(consumed, targets)
    expect(result).toEqual({ protein: 70, carbs: 80, fat: 35, calories: 900 })
  })

  it('returns negative values when over target', () => {
    const consumed: MacroTotals = { protein: 180, carbs: 250, fat: 80, calories: 2500 }
    const result = calculateRemaining(consumed, targets)
    expect(result).toEqual({ protein: -30, carbs: -50, fat: -15, calories: -500 })
  })

  it('returns zeros when exactly at target', () => {
    const consumed: MacroTotals = { protein: 150, carbs: 200, fat: 65, calories: 2000 }
    const result = calculateRemaining(consumed, targets)
    expect(result).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 })
  })
})

// ─── calculateWeekAdherence ──────────────────────────────────────────

describe('calculateWeekAdherence', () => {
  const targets: MacroTargets = {
    protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10
  }

  it('returns behind status with 1 day elapsed when no summaries', () => {
    const result = calculateWeekAdherence([], targets)
    expect(result.days_elapsed).toBe(1)
    expect(result.actual).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 })
    expect(result.overall_status).toBe('behind')
  })

  it('calculates on-track when actual matches prorated target', () => {
    const summaries: MacroTotals[] = [
      { protein: 150, carbs: 200, fat: 65, calories: 2000 },
      { protein: 150, carbs: 200, fat: 65, calories: 2000 }
    ]
    const result = calculateWeekAdherence(summaries, targets)
    expect(result.days_elapsed).toBe(2)
    expect(result.adherence_pct.protein).toBeCloseTo(100)
    expect(result.adherence_pct.carbs).toBeCloseTo(100)
    expect(result.overall_status).toBe('on-track')
  })

  it('calculates ahead when actual exceeds prorated target beyond tolerance', () => {
    const summaries: MacroTotals[] = [
      { protein: 200, carbs: 260, fat: 85, calories: 2600 }
    ]
    const result = calculateWeekAdherence(summaries, targets)
    expect(result.overall_status).toBe('ahead')
  })

  it('calculates behind when actual is below prorated target beyond tolerance', () => {
    const summaries: MacroTotals[] = [
      { protein: 50, carbs: 60, fat: 20, calories: 600 },
      { protein: 50, carbs: 60, fat: 20, calories: 600 }
    ]
    const result = calculateWeekAdherence(summaries, targets)
    expect(result.overall_status).toBe('behind')
  })

  it('prorates targets correctly for multiple days', () => {
    const summaries: MacroTotals[] = [
      { protein: 150, carbs: 200, fat: 65, calories: 2000 },
      { protein: 150, carbs: 200, fat: 65, calories: 2000 },
      { protein: 150, carbs: 200, fat: 65, calories: 2000 }
    ]
    const result = calculateWeekAdherence(summaries, targets)
    expect(result.days_elapsed).toBe(3)
    expect(result.prorated_target).toEqual({
      protein: 450, carbs: 600, fat: 195, calories: 6000
    })
    expect(result.actual).toEqual({
      protein: 450, carbs: 600, fat: 195, calories: 6000
    })
  })

  it('handles on-track within tolerance boundary', () => {
    // 95% adherence with 10% tolerance → on-track (within 90-110%)
    const summaries: MacroTotals[] = [
      { protein: 142.5, carbs: 190, fat: 61.75, calories: 1900 }
    ]
    const result = calculateWeekAdherence(summaries, targets)
    expect(result.overall_status).toBe('on-track')
  })
})

// ─── calculateRecoveryTrend ──────────────────────────────────────────

describe('calculateRecoveryTrend', () => {
  it('returns stable for fewer than 3 scores', () => {
    expect(calculateRecoveryTrend([])).toBe('stable')
    expect(calculateRecoveryTrend([50])).toBe('stable')
    expect(calculateRecoveryTrend([50, 60])).toBe('stable')
  })

  it('returns stable when scores are flat', () => {
    expect(calculateRecoveryTrend([60, 60, 60])).toBe('stable')
    expect(calculateRecoveryTrend([60, 62, 58, 61, 59, 60])).toBe('stable')
  })

  it('returns improving when recent scores are higher', () => {
    // earlier avg = (40+45+42)/3 = 42.33, recent avg = (70+75+72)/3 = 72.33
    expect(calculateRecoveryTrend([40, 45, 42, 55, 60, 70, 75, 72])).toBe('improving')
  })

  it('returns declining when recent scores are lower', () => {
    // earlier avg = (80+75+78)/3 = 77.67, recent avg = (40+45+42)/3 = 42.33
    expect(calculateRecoveryTrend([80, 75, 78, 55, 50, 40, 45, 42])).toBe('declining')
  })

  it('returns stable when difference is within 5 points', () => {
    // earlier avg = (60+62+58)/3 = 60, recent avg = (63+65+61)/3 = 63
    expect(calculateRecoveryTrend([60, 62, 58, 63, 65, 61])).toBe('stable')
  })

  it('handles exactly 3 scores (earlier and recent overlap)', () => {
    // earlier = first 3 = [30, 40, 50], avg = 40
    // recent = last 3 = [30, 40, 50], avg = 40
    expect(calculateRecoveryTrend([30, 40, 50])).toBe('stable')
  })
})

// ─── getWeekStart ────────────────────────────────────────────────────

describe('getWeekStart', () => {
  it('returns a Monday at midnight', () => {
    const weekStart = getWeekStart()
    expect(weekStart.getDay()).toBe(1) // Monday
    expect(weekStart.getHours()).toBe(0)
    expect(weekStart.getMinutes()).toBe(0)
    expect(weekStart.getSeconds()).toBe(0)
    expect(weekStart.getMilliseconds()).toBe(0)
  })

  it('returns a date not in the future', () => {
    const weekStart = getWeekStart()
    expect(weekStart.getTime()).toBeLessThanOrEqual(Date.now())
  })
})

// ─── buildPassiveContext (integration with mocked Supabase) ──────────

describe('buildPassiveContext', () => {
  // We test the integration by mocking createServerClient
  // The utility functions are tested individually above

  vi.mock('@/app/lib/auth/supabase-server', () => ({
    createServerClient: vi.fn()
  }))

  vi.mock('@/app/lib/agents/chat-persistence', () => ({
    fetchRecentChat: vi.fn().mockResolvedValue([]),
    fetchPendingUrgentInsights: vi.fn().mockResolvedValue([])
  }))

  function createMockSupabase() {
    const chainable: Record<string, any> = {}
    // All chainable methods return `chainable` so any order works
    const self = () => chainable
    chainable.select = vi.fn(self)
    chainable.eq = vi.fn(self)
    chainable.gte = vi.fn(self)
    chainable.lt = vi.fn(self)
    chainable.is = vi.fn(self)
    chainable.order = vi.fn(self)
    chainable.limit = vi.fn(self)
    // single() is terminal — returns { data, error }
    chainable.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    // When the chain ends without single(), we need data/error via then()
    // Make chainable thenable so `await` resolves to { data: [], error: null }
    chainable.then = vi.fn((resolve: any) => resolve({ data: [], error: null }))

    return {
      from: vi.fn().mockReturnValue(chainable),
      _chain: chainable,
    }
  }

  it('returns PassiveContext with default targets when no data exists', async () => {
    const mockSupabase = createMockSupabase()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildPassiveContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildPassiveContext('user-123')

    expect(ctx.user_id).toBe('user-123')
    expect(ctx.targets.protein).toBe(150)
    expect(ctx.targets.carbs).toBe(200)
    expect(ctx.targets.fat).toBe(65)
    expect(ctx.targets.calories).toBe(2000)
    expect(ctx.targets.tolerance_pct).toBe(10)
    expect(ctx.today.meals_logged).toBe(0)
    expect(ctx.today.workouts_logged).toBe(0)
    expect(ctx.today.macros_consumed).toEqual({ protein: 0, carbs: 0, fat: 0, calories: 0 })
    expect(ctx.has_whoop).toBe(false)
    expect(ctx.current_time).toBeDefined()
    expect(ctx.day_of_week).toBeDefined()
    expect(ctx.week.days_elapsed).toBe(1)
    expect(ctx.week.overall_status).toBe('behind')
  })
})

// ─── buildTrainerContext (integration with mocked Supabase) ──────────

describe('buildTrainerContext', () => {
  function createMockSupabaseForTrainer(overrides?: {
    workouts?: any[]
    benchmarkPrs?: any[]
  }) {
    const workouts = overrides?.workouts ?? []
    const benchmarkPrs = overrides?.benchmarkPrs ?? []

    const chainable: Record<string, any> = {}
    const self = () => chainable
    chainable.select = vi.fn(self)
    chainable.eq = vi.fn(self)
    chainable.gte = vi.fn(self)
    chainable.lt = vi.fn(self)
    chainable.is = vi.fn(self)
    chainable.order = vi.fn(self)
    chainable.limit = vi.fn(self)
    chainable.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    chainable.then = vi.fn((resolve: any) => resolve({ data: [], error: null }))

    // Track which table is being queried to return appropriate data
    let currentTable = ''
    const mockFrom = vi.fn((table: string) => {
      currentTable = table
      // Create a fresh chainable for each from() call so we can customize the terminal
      const tableChain: Record<string, any> = {}
      const tableSelf = () => tableChain
      tableChain.select = vi.fn(tableSelf)
      tableChain.eq = vi.fn(tableSelf)
      tableChain.gte = vi.fn(tableSelf)
      tableChain.lt = vi.fn(tableSelf)
      tableChain.is = vi.fn(tableSelf)
      tableChain.order = vi.fn(tableSelf)
      tableChain.limit = vi.fn(tableSelf)
      tableChain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

      if (table === 'workouts') {
        tableChain.then = vi.fn((resolve: any) => resolve({ data: workouts, error: null }))
      } else if (table === 'benchmark_prs') {
        tableChain.then = vi.fn((resolve: any) => resolve({ data: benchmarkPrs, error: null }))
      } else {
        tableChain.then = vi.fn((resolve: any) => resolve({ data: [], error: null }))
      }

      return tableChain
    })

    return { from: mockFrom, _chain: chainable }
  }

  it('returns TrainerContext with empty data when no workouts or PRs exist', async () => {
    const mockSupabase = createMockSupabaseForTrainer()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    // PassiveContext fields inherited
    expect(ctx.user_id).toBe('user-456')
    expect(ctx.targets).toBeDefined()
    expect(ctx.today).toBeDefined()
    expect(ctx.week).toBeDefined()

    // Trainer-specific fields
    expect(ctx.recent_workouts).toEqual([])
    expect(ctx.benchmark_prs).toEqual([])
    expect(ctx.todays_program).toBeNull()
    expect(ctx.movement_aliases).toEqual(MOVEMENT_ALIASES)
  })

  it('includes recent workouts mapped to RecentWorkout shape', async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const mockWorkouts = [
      {
        id: 'w1',
        workout_date: today,
        input_text: '5 rounds: 10 push-ups, 15 air squats',
        blocks: [{ block_type: 'FOR_TIME', movements: [{ name: 'Push-up', reps: 10 }] }],
        primary_score: '8:30',
        rpe: 7,
        tags: ['metcon']
      }
    ]

    const mockSupabase = createMockSupabaseForTrainer({ workouts: mockWorkouts })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    expect(ctx.recent_workouts).toHaveLength(1)
    expect(ctx.recent_workouts[0]).toEqual({
      id: 'w1',
      date: today,
      input_text: '5 rounds: 10 push-ups, 15 air squats',
      blocks: [{ block_type: 'FOR_TIME', movements: [{ name: 'Push-up', reps: 10 }] }],
      primary_score: '8:30',
      rpe: 7,
      tags: ['metcon']
    })
  })

  it('includes benchmark PRs mapped to BenchmarkPR shape', async () => {
    const mockPRs = [
      {
        benchmark_name: 'Fran',
        score_value: '272',
        score_display: '4:32',
        date: '2026-01-15',
        rx_status: 'RX'
      },
      {
        benchmark_name: 'Grace',
        score_value: '195',
        score_display: '3:15',
        date: '2026-01-10',
        rx_status: 'RX'
      }
    ]

    const mockSupabase = createMockSupabaseForTrainer({ benchmarkPrs: mockPRs })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    expect(ctx.benchmark_prs).toHaveLength(2)
    expect(ctx.benchmark_prs[0]).toEqual({
      benchmark_name: 'Fran',
      score_value: 272,
      score_display: '4:32',
      date: '2026-01-15',
      rx_status: 'RX'
    })
    expect(ctx.benchmark_prs[1]).toEqual({
      benchmark_name: 'Grace',
      score_value: 195,
      score_display: '3:15',
      date: '2026-01-10',
      rx_status: 'RX'
    })
  })

  it('returns null for todays_program when GOOGLE_SHEETS_CSV_URL is not set', async () => {
    delete process.env.GOOGLE_SHEETS_CSV_URL

    const mockSupabase = createMockSupabaseForTrainer()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    expect(ctx.todays_program).toBeNull()
  })

  it('handles workout rows with null/missing optional fields gracefully', async () => {
    const mockWorkouts = [
      {
        id: 'w2',
        workout_date: '2026-01-20',
        input_text: null,
        blocks: null,
        primary_score: null,
        rpe: null,
        tags: null
      }
    ]

    const mockSupabase = createMockSupabaseForTrainer({ workouts: mockWorkouts })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    expect(ctx.recent_workouts).toHaveLength(1)
    expect(ctx.recent_workouts[0]).toEqual({
      id: 'w2',
      date: '2026-01-20',
      input_text: '',
      blocks: [],
      primary_score: null,
      rpe: null,
      tags: []
    })
  })

  it('always includes MOVEMENT_ALIASES constant', async () => {
    const mockSupabase = createMockSupabaseForTrainer()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildTrainerContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildTrainerContext('user-456')

    expect(ctx.movement_aliases).toBe(MOVEMENT_ALIASES)
    expect(ctx.movement_aliases['PU']).toBe('Pull-up')
    expect(ctx.movement_aliases['DL']).toBe('Deadlift')
    expect(ctx.movement_aliases['BS']).toBe('Back Squat')
  })
})


// ─── buildNutritionistContext (integration with mocked Supabase) ─────

describe('buildNutritionistContext', () => {
  function createMockSupabaseForNutritionist(overrides?: {
    todaysMeals?: any[]
    recentMealsWithItems?: any[]
  }) {
    const todaysMeals = overrides?.todaysMeals ?? []
    const recentMealsWithItems = overrides?.recentMealsWithItems ?? []

    const mockFrom = vi.fn((table: string) => {
      const tableChain: Record<string, any> = {}
      const tableSelf = () => tableChain
      tableChain.select = vi.fn((...args: any[]) => {
        // Track what columns are selected to differentiate meal queries
        tableChain._selectedColumns = args[0]
        return tableChain
      })
      tableChain.eq = vi.fn(tableSelf)
      tableChain.gte = vi.fn(tableSelf)
      tableChain.lt = vi.fn(tableSelf)
      tableChain.is = vi.fn(tableSelf)
      tableChain.order = vi.fn(tableSelf)
      tableChain.limit = vi.fn((...args: any[]) => {
        tableChain._limit = args[0]
        return tableChain
      })
      tableChain.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

      if (table === 'meals') {
        // Use a counter to differentiate between the different meals queries:
        // 1st call from buildPassiveContext -> fetchTodaysMeals (returns todaysMeals)
        // 2nd call from fetchTodaysMealDetails (returns todaysMeals)
        // 3rd call from fetchUserPortionHistory (returns recentMealsWithItems)
        let mealCallCount = 0
        tableChain.then = vi.fn((resolve: any) => {
          mealCallCount++
          // The portion history query uses limit(50) and only selects 'items'
          if (tableChain._limit === 50) {
            return resolve({ data: recentMealsWithItems, error: null })
          }
          return resolve({ data: todaysMeals, error: null })
        })
      } else {
        tableChain.then = vi.fn((resolve: any) => resolve({ data: [], error: null }))
      }

      return tableChain
    })

    return { from: mockFrom }
  }

  it('returns NutritionistContext with empty data when no meals exist', async () => {
    const mockSupabase = createMockSupabaseForNutritionist()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    // PassiveContext fields inherited
    expect(ctx.user_id).toBe('user-789')
    expect(ctx.targets).toBeDefined()
    expect(ctx.today).toBeDefined()
    expect(ctx.week).toBeDefined()

    // Nutritionist-specific fields
    expect(ctx.todays_meals).toEqual([])
    expect(ctx.portion_defaults).toBeDefined()
    expect(Object.keys(ctx.portion_defaults).length).toBeGreaterThan(0)
    expect(ctx.portion_defaults['chicken breast']).toBe('6 oz (170g)')
    expect(ctx.user_portion_history).toBeNull()
  })

  it('includes todays meals mapped to MealSummary shape with full item details', async () => {
    const mockMeals = [
      {
        id: 'meal-1',
        meal_timestamp: new Date().toISOString(),
        meal_timing: 'BREAKFAST',
        items: [
          { food: 'Eggs', portion: '3 large', protein: 18, carbs: 1, fat: 15, calories: 210 },
          { food: 'Toast', portion: '2 slices', protein: 6, carbs: 26, fat: 2, calories: 150 }
        ],
        total_protein: '24',
        total_carbs: '27',
        total_fat: '17',
        total_calories: '360'
      }
    ]

    const mockSupabase = createMockSupabaseForNutritionist({ todaysMeals: mockMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.todays_meals).toHaveLength(1)
    expect(ctx.todays_meals[0].id).toBe('meal-1')
    expect(ctx.todays_meals[0].timing).toBe('BREAKFAST')
    expect(ctx.todays_meals[0].items).toHaveLength(2)
    expect(ctx.todays_meals[0].items[0]).toEqual({
      food: 'Eggs', portion: '3 large', protein: 18, carbs: 1, fat: 15, calories: 210
    })
    expect(ctx.todays_meals[0].totals).toEqual({
      protein: 24, carbs: 27, fat: 17, calories: 360
    })
  })

  it('always includes PORTION_DEFAULTS constant', async () => {
    const mockSupabase = createMockSupabaseForNutritionist()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.portion_defaults).toEqual(expect.objectContaining({
      'chicken breast': '6 oz (170g)',
      'rice': '1 cup cooked (200g)',
      'salmon': '6 oz (170g)',
      'eggs': '2 large'
    }))
  })

  it('builds user_portion_history from recent meal items', async () => {
    const recentMeals = [
      {
        items: [
          { food: 'Chicken Breast', portion: '8 oz', protein: 56, carbs: 0, fat: 4, calories: 260 },
          { food: 'Rice', portion: '2 cups', protein: 8, carbs: 90, fat: 1, calories: 400 }
        ]
      },
      {
        items: [
          { food: 'Chicken Breast', portion: '6 oz', protein: 42, carbs: 0, fat: 3, calories: 195 }
        ]
      }
    ]

    const mockSupabase = createMockSupabaseForNutritionist({ recentMealsWithItems: recentMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.user_portion_history).not.toBeNull()
    // Most recent portion for each food (first occurrence wins since ordered desc)
    expect(ctx.user_portion_history!['chicken breast']).toBe('8 oz')
    expect(ctx.user_portion_history!['rice']).toBe('2 cups')
  })

  it('returns null for user_portion_history when no recent meals have items', async () => {
    const recentMeals = [
      { items: [] },
      { items: null }
    ]

    const mockSupabase = createMockSupabaseForNutritionist({ recentMealsWithItems: recentMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.user_portion_history).toBeNull()
  })

  it('handles meal items with legacy name/quantity fields', async () => {
    const mockMeals = [
      {
        id: 'meal-legacy',
        meal_timestamp: new Date().toISOString(),
        meal_timing: null,
        items: [
          { name: 'Steak', quantity: '8 oz', protein: 50, carbs: 0, fat: 20, calories: 380 }
        ],
        total_protein: '50',
        total_carbs: '0',
        total_fat: '20',
        total_calories: '380'
      }
    ]

    const mockSupabase = createMockSupabaseForNutritionist({ todaysMeals: mockMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.todays_meals[0].items[0].food).toBe('Steak')
    expect(ctx.todays_meals[0].items[0].portion).toBe('8 oz')
  })

  it('handles null meal_timing gracefully', async () => {
    const mockMeals = [
      {
        id: 'meal-no-timing',
        meal_timestamp: new Date().toISOString(),
        meal_timing: null,
        items: [],
        total_protein: '30',
        total_carbs: '40',
        total_fat: '10',
        total_calories: '370'
      }
    ]

    const mockSupabase = createMockSupabaseForNutritionist({ todaysMeals: mockMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildNutritionistContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildNutritionistContext('user-789')

    expect(ctx.todays_meals[0].timing).toBeNull()
  })
})


// ─── buildSociusContext (integration with mocked Supabase) ───────────

describe('buildSociusContext', () => {
  function createMockSupabaseForSocius(overrides?: {
    workouts?: any[]
    meals?: any[]
    prs?: any[]
    recoveries?: any[]
    sleeps?: any[]
    insights?: any[]
    whoopForAvailability?: any[]
    targets?: any[]
  }) {
    const workouts = overrides?.workouts ?? []
    const meals = overrides?.meals ?? []
    const prs = overrides?.prs ?? []
    const recoveries = overrides?.recoveries ?? []
    const sleeps = overrides?.sleeps ?? []
    const insights = overrides?.insights ?? []
    const whoopForAvailability = overrides?.whoopForAvailability ?? recoveries
    const targets = overrides?.targets ?? []

    const mockFrom = vi.fn((table: string) => {
      // Each from() call gets a fresh chain that tracks its own query params
      const params: { selectedCols: string; eqCalls: [string, any][]; hasSingle: boolean; limitVal: number | null; hasIs: boolean; hasGte: boolean } = {
        selectedCols: '',
        eqCalls: [],
        hasSingle: false,
        limitVal: null,
        hasIs: false,
        hasGte: false
      }

      const tableChain: Record<string, any> = {}
      const tableSelf = () => tableChain
      tableChain.select = vi.fn((cols: string) => { params.selectedCols = cols; return tableChain })
      tableChain.eq = vi.fn((col: string, val: any) => { params.eqCalls.push([col, val]); return tableChain })
      tableChain.gte = vi.fn(() => { params.hasGte = true; return tableChain })
      tableChain.lt = vi.fn(tableSelf)
      tableChain.is = vi.fn(() => { params.hasIs = true; return tableChain })
      tableChain.order = vi.fn(tableSelf)
      tableChain.limit = vi.fn((n: number) => { params.limitVal = n; return tableChain })
      tableChain.single = vi.fn(() => {
        params.hasSingle = true
        return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
      })

      // Resolve based on table + query shape
      tableChain.then = vi.fn((resolve: any) => {
        if (table === 'workouts') {
          // fetchTodaysWorkouts selects 'id' only; fetchThirtyDaySummary selects 'blocks, rpe'; fetchDataAvailability selects 'workout_date'
          if (params.selectedCols === 'id') return resolve({ data: [], error: null })
          return resolve({ data: workouts, error: null })
        }
        if (table === 'meals') {
          // fetchTodaysMeals selects columns with 'id, meal_timestamp, meal_timing...'
          // fetchThirtyDaySummary selects 'total_protein, total_calories, meal_timestamp'
          // fetchDataAvailability selects 'meal_timestamp'
          if (params.selectedCols.startsWith('id,') || params.selectedCols.startsWith('id, ')) {
            return resolve({ data: [], error: null })
          }
          return resolve({ data: meals, error: null })
        }
        if (table === 'benchmark_prs') {
          return resolve({ data: prs, error: null })
        }
        if (table === 'whoop_recovery') {
          // fetchLatestWhoopRecovery uses single() — handled above
          // fetchThirtyDaySummary selects 'recovery_score'
          // fetchDataAvailability selects 'id' with limit(1)
          if (params.selectedCols === 'id') return resolve({ data: whoopForAvailability, error: null })
          return resolve({ data: recoveries, error: null })
        }
        if (table === 'whoop_sleep') {
          return resolve({ data: sleeps, error: null })
        }
        if (table === 'whoop_cycles') {
          return resolve({ data: [], error: null })
        }
        if (table === 'insights') {
          // fetchPendingInsightsForContext uses .is('surfaced_at', null)
          // fetchRecentInsightsDetailed uses .gte('created_at', ...)
          if (params.hasIs) return resolve({ data: [], error: null })
          return resolve({ data: insights, error: null })
        }
        if (table === 'daily_targets') {
          // fetchDailyTargets uses single() — handled above
          // fetchDataAvailability selects 'id' with limit(1)
          if (params.selectedCols === 'id') return resolve({ data: targets, error: null })
          return resolve({ data: [], error: null })
        }
        if (table === 'daily_summaries') {
          return resolve({ data: [], error: null })
        }
        return resolve({ data: [], error: null })
      })

      return tableChain
    })

    return { from: mockFrom }
  }

  it('returns SociusContext with empty data when no records exist', async () => {
    const mockSupabase = createMockSupabaseForSocius()
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-1')

    // PassiveContext fields inherited
    expect(ctx.user_id).toBe('user-socius-1')
    expect(ctx.targets).toBeDefined()
    expect(ctx.today).toBeDefined()
    expect(ctx.week).toBeDefined()

    // Socius-specific: thirty_day_summary
    expect(ctx.thirty_day_summary).toBeDefined()
    expect(ctx.thirty_day_summary.workout_count).toBe(0)
    expect(ctx.thirty_day_summary.workout_types).toEqual({ metcon: 0, strength: 0, cardio: 0, emom: 0 })
    expect(ctx.thirty_day_summary.avg_rpe).toBeNull()
    expect(ctx.thirty_day_summary.total_meals).toBe(0)
    expect(ctx.thirty_day_summary.avg_daily_protein).toBe(0)
    expect(ctx.thirty_day_summary.avg_daily_calories).toBe(0)
    expect(ctx.thirty_day_summary.pr_count).toBe(0)
    expect(ctx.thirty_day_summary.whoop_avg_recovery).toBeNull()
    expect(ctx.thirty_day_summary.whoop_avg_sleep_score).toBeNull()

    // Socius-specific: recent_insights
    expect(ctx.recent_insights).toEqual([])

    // Socius-specific: data_availability
    expect(ctx.data_availability).toBeDefined()
    expect(ctx.data_availability.has_workouts).toBe(false)
    expect(ctx.data_availability.has_meals).toBe(false)
    expect(ctx.data_availability.has_whoop).toBe(false)
    expect(ctx.data_availability.has_targets).toBe(false)
    expect(ctx.data_availability.workout_days).toBe(0)
    expect(ctx.data_availability.meal_days).toBe(0)
  })

  it('aggregates workout types from blocks JSONB correctly', async () => {
    const mockWorkouts = [
      {
        blocks: [
          { block_type: 'AMRAP', movements: [{ name: 'Pull-up', reps: 10 }] },
          { block_type: 'STRENGTH', movements: [{ name: 'Back Squat', reps: 5 }] }
        ],
        rpe: 7
      },
      {
        blocks: [
          { block_type: 'FOR_TIME', movements: [{ name: 'Burpee', reps: 50 }] }
        ],
        rpe: 9
      },
      {
        blocks: [
          { block_type: 'EMOM', movements: [{ name: 'Clean', reps: 3 }] },
          { block_type: 'CARDIO', movements: [{ name: 'Row', distance: '2000m' }] }
        ],
        rpe: 6
      }
    ]

    const mockSupabase = createMockSupabaseForSocius({ workouts: mockWorkouts })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-2')

    expect(ctx.thirty_day_summary.workout_count).toBe(3)
    // AMRAP + FOR_TIME = 2 metcon
    expect(ctx.thirty_day_summary.workout_types.metcon).toBe(2)
    expect(ctx.thirty_day_summary.workout_types.strength).toBe(1)
    expect(ctx.thirty_day_summary.workout_types.cardio).toBe(1)
    expect(ctx.thirty_day_summary.workout_types.emom).toBe(1)
  })

  it('calculates avg RPE from workouts with RPE values', async () => {
    const mockWorkouts = [
      { blocks: [], rpe: 7 },
      { blocks: [], rpe: 9 },
      { blocks: [], rpe: null },
      { blocks: [], rpe: 8 }
    ]

    const mockSupabase = createMockSupabaseForSocius({ workouts: mockWorkouts })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-3')

    // avg of 7, 9, 8 = 8.0
    expect(ctx.thirty_day_summary.avg_rpe).toBe(8)
  })

  it('calculates avg daily protein and calories from meals', async () => {
    const mockMeals = [
      { total_protein: '40', total_calories: '500', meal_timestamp: '2026-01-20T08:00:00Z' },
      { total_protein: '50', total_calories: '700', meal_timestamp: '2026-01-20T12:00:00Z' },
      { total_protein: '45', total_calories: '600', meal_timestamp: '2026-01-21T12:00:00Z' }
    ]

    const mockSupabase = createMockSupabaseForSocius({ meals: mockMeals })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-4')

    expect(ctx.thirty_day_summary.total_meals).toBe(3)
    // 2 unique days: (40+50+45)/2 = 67.5 → 68 rounded
    expect(ctx.thirty_day_summary.avg_daily_protein).toBe(68)
    // (500+700+600)/2 = 900
    expect(ctx.thirty_day_summary.avg_daily_calories).toBe(900)
  })

  it('calculates WHOOP averages from recovery and sleep data', async () => {
    const mockRecoveries = [
      { recovery_score: '75' },
      { recovery_score: '60' },
      { recovery_score: '80' }
    ]
    const mockSleeps = [
      { sleep_score: '85' },
      { sleep_score: '70' }
    ]

    const mockSupabase = createMockSupabaseForSocius({
      recoveries: mockRecoveries,
      sleeps: mockSleeps,
      whoopForAvailability: mockRecoveries
    })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-5')

    // avg recovery: (75+60+80)/3 = 71.7
    expect(ctx.thirty_day_summary.whoop_avg_recovery).toBeCloseTo(71.7, 1)
    // avg sleep: (85+70)/2 = 77.5
    expect(ctx.thirty_day_summary.whoop_avg_sleep_score).toBe(77.5)
  })

  it('includes recent insights from the last 30 days', async () => {
    const mockInsights = [
      {
        id: 'ins-1',
        pattern_id: 'CAL_DEF',
        priority: 'urgent',
        confidence: 0.85,
        content: 'High strain with low calories',
        created_at: '2026-01-20T10:00:00Z'
      },
      {
        id: 'ins-2',
        pattern_id: 'PRO_REC',
        priority: 'informational',
        confidence: 0.7,
        content: 'Protein intake correlates with recovery',
        created_at: '2026-01-19T10:00:00Z'
      }
    ]

    const mockSupabase = createMockSupabaseForSocius({ insights: mockInsights })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-6')

    expect(ctx.recent_insights).toHaveLength(2)
    expect(ctx.recent_insights[0].id).toBe('ins-1')
    expect(ctx.recent_insights[0].pattern_id).toBe('CAL_DEF')
    expect(ctx.recent_insights[0].priority).toBe('urgent')
    expect(ctx.recent_insights[1].id).toBe('ins-2')
  })

  it('reports data availability correctly when data exists', async () => {
    const mockWorkouts = [
      { blocks: [], rpe: null, workout_date: '2026-01-20' },
      { blocks: [], rpe: null, workout_date: '2026-01-21' },
      { blocks: [], rpe: null, workout_date: '2026-01-21' }
    ]
    const mockMeals = [
      { total_protein: '30', total_calories: '400', meal_timestamp: '2026-01-20T12:00:00Z' }
    ]
    const mockTargets = [{ id: 'target-1' }]

    const mockSupabase = createMockSupabaseForSocius({
      workouts: mockWorkouts,
      meals: mockMeals,
      targets: mockTargets,
      recoveries: [{ recovery_score: '70' }],
      whoopForAvailability: [{ id: 'whoop-1' }]
    })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-7')

    expect(ctx.data_availability.has_workouts).toBe(true)
    expect(ctx.data_availability.has_meals).toBe(true)
    expect(ctx.data_availability.has_whoop).toBe(true)
    expect(ctx.data_availability.has_targets).toBe(true)
    // 2 unique workout dates
    expect(ctx.data_availability.workout_days).toBe(2)
    // 1 unique meal date
    expect(ctx.data_availability.meal_days).toBe(1)
  })

  it('handles workouts with null/empty blocks gracefully', async () => {
    const mockWorkouts = [
      { blocks: null, rpe: 5 },
      { blocks: [], rpe: null },
      { blocks: 'invalid', rpe: 8 }
    ]

    const mockSupabase = createMockSupabaseForSocius({ workouts: mockWorkouts })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-8')

    expect(ctx.thirty_day_summary.workout_count).toBe(3)
    expect(ctx.thirty_day_summary.workout_types).toEqual({ metcon: 0, strength: 0, cardio: 0, emom: 0 })
    // avg RPE of 5 and 8 = 6.5
    expect(ctx.thirty_day_summary.avg_rpe).toBe(6.5)
  })

  it('counts PR records from the last 30 days', async () => {
    const mockPRs = [
      { id: 'pr-1' },
      { id: 'pr-2' },
      { id: 'pr-3' }
    ]

    const mockSupabase = createMockSupabaseForSocius({ prs: mockPRs })
    const { createServerClient } = await import('@/app/lib/auth/supabase-server')
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

    const { buildSociusContext } = await import('@/app/lib/agents/context-builder')
    const ctx = await buildSociusContext('user-socius-9')

    expect(ctx.thirty_day_summary.pr_count).toBe(3)
  })
})
