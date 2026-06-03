import { describe, it, expect, vi } from 'vitest'
import {
  parseSociusResponse,
  persistInsights
} from '@/app/lib/agents/socius-agent'
import type {
  SociusContext,
  SociusResponse,
  RecentInsight,
  PatternId,
  InsightPriority
} from '@/app/lib/agents/types'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeValidSociusJSON(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    message: 'Your training volume has been solid this month with 18 workouts. Protein intake is averaging 142g daily, slightly below your 150g target. Recovery scores have been trending upward over the past week.',
    insights: [
      {
        id: 'insight-1',
        pattern_id: 'NUT_PERF',
        priority: 'informational',
        confidence: 0.75,
        content: 'Your protein intake correlates with better recovery scores — days with 150g+ protein show 8% higher next-day recovery.',
        created_at: '2026-01-20T12:00:00Z'
      }
    ],
    data_points: {
      'workout_count_30d': '18',
      'avg_daily_protein': '142g',
      'protein_target': '150g',
      'recovery_trend': 'upward'
    },
    confidence: 0.85,
    ...overrides,
  })
}

function makeInsight(overrides?: Partial<RecentInsight>): RecentInsight {
  return {
    id: 'insight-test-1',
    pattern_id: 'CAL_DEF',
    priority: 'urgent',
    confidence: 0.8,
    content: 'Caloric deficit detected on a high-strain day.',
    created_at: '2026-01-20T12:00:00Z',
    ...overrides,
  }
}

// ─── parseSociusResponse ─────────────────────────────────────────────

describe('parseSociusResponse', () => {
  it('parses valid JSON with insights and data_points', () => {
    const raw = makeValidSociusJSON()
    const result = parseSociusResponse(raw)

    expect(result.message).toContain('training volume')
    expect(result.insights).toHaveLength(1)
    expect(result.insights![0].pattern_id).toBe('NUT_PERF')
    expect(result.insights![0].priority).toBe('informational')
    expect(result.insights![0].confidence).toBe(0.75)
    expect(result.data_points).toBeDefined()
    expect(result.data_points!['workout_count_30d']).toBe('18')
    expect(result.confidence).toBe(0.85)
  })

  it('parses conversational response without insights', () => {
    const raw = JSON.stringify({
      message: 'You have been consistent this week. Keep it up!',
      insights: [],
      data_points: {},
      confidence: 0.9,
    })

    const result = parseSociusResponse(raw)
    expect(result.message).toContain('consistent')
    expect(result.insights).toHaveLength(0)
    expect(result.data_points).toEqual({})
    expect(result.confidence).toBe(0.9)
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n' + makeValidSociusJSON() + '\n```'
    const result = parseSociusResponse(raw)
    expect(result.message).toContain('training volume')
    expect(result.insights).toHaveLength(1)
  })

  it('strips plain code fences', () => {
    const raw = '```\n' + JSON.stringify({ message: 'test', insights: [], data_points: {}, confidence: 0.7 }) + '\n```'
    const result = parseSociusResponse(raw)
    expect(result.message).toBe('test')
  })

  it('handles malformed JSON gracefully', () => {
    const raw = 'This is not JSON, just a conversational response about fitness trends.'
    const result = parseSociusResponse(raw)
    expect(result.message).toBe(raw)
    expect(result.insights).toEqual([])
    expect(result.data_points).toEqual({})
    expect(result.confidence).toBe(0.3)
  })

  it('handles empty string', () => {
    const result = parseSociusResponse('')
    expect(result.message).toBeTruthy()
    expect(result.confidence).toBe(0.3)
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = JSON.stringify({ message: 'test', confidence: 1.5, insights: [], data_points: {} })
    const result = parseSociusResponse(raw)
    expect(result.confidence).toBe(1)

    const raw2 = JSON.stringify({ message: 'test', confidence: -0.5, insights: [], data_points: {} })
    const result2 = parseSociusResponse(raw2)
    expect(result2.confidence).toBe(0)
  })

  it('defaults confidence to 0.5 when missing', () => {
    const raw = JSON.stringify({ message: 'test', insights: [], data_points: {} })
    const result = parseSociusResponse(raw)
    expect(result.confidence).toBe(0.5)
  })

  it('defaults message when missing', () => {
    const raw = JSON.stringify({ confidence: 0.8, insights: [], data_points: {} })
    const result = parseSociusResponse(raw)
    expect(result.message).toBe('Here is my analysis.')
  })
})

// ─── Insight normalization ───────────────────────────────────────────

describe('insight normalization', () => {
  it('filters out insights with invalid pattern_id', () => {
    const raw = JSON.stringify({
      message: 'Analysis complete.',
      insights: [
        { pattern_id: 'INVALID_PATTERN', priority: 'notable', confidence: 0.8, content: 'Some insight' },
        { pattern_id: 'CAL_DEF', priority: 'urgent', confidence: 0.9, content: 'Valid insight' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights).toHaveLength(1)
    expect(result.insights![0].pattern_id).toBe('CAL_DEF')
  })

  it('defaults invalid priority to informational', () => {
    const raw = JSON.stringify({
      message: 'Analysis.',
      insights: [
        { pattern_id: 'OVER_TRN', priority: 'CRITICAL', confidence: 0.7, content: 'Overtraining detected' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights![0].priority).toBe('informational')
  })

  it('clamps insight confidence to [0, 1]', () => {
    const raw = JSON.stringify({
      message: 'Analysis.',
      insights: [
        { pattern_id: 'PRO_REC', priority: 'notable', confidence: 1.5, content: 'Protein recovery link' },
        { pattern_id: 'HRV_TREND', priority: 'notable', confidence: -0.3, content: 'HRV trending down' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights![0].confidence).toBe(1)
    expect(result.insights![1].confidence).toBe(0)
  })

  it('filters out insights with empty content', () => {
    const raw = JSON.stringify({
      message: 'Analysis.',
      insights: [
        { pattern_id: 'CAL_DEF', priority: 'urgent', confidence: 0.9, content: '' },
        { pattern_id: 'CON_PROG', priority: 'informational', confidence: 0.7, content: 'Good progress' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights).toHaveLength(1)
    expect(result.insights![0].pattern_id).toBe('CON_PROG')
  })

  it('generates UUID for insights missing id', () => {
    const raw = JSON.stringify({
      message: 'Analysis.',
      insights: [
        { pattern_id: 'SLEEP_PERF', priority: 'notable', confidence: 0.7, content: 'Sleep affecting performance' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights![0].id).toBeTruthy()
    expect(typeof result.insights![0].id).toBe('string')
  })

  it('generates timestamp for insights missing created_at', () => {
    const raw = JSON.stringify({
      message: 'Analysis.',
      insights: [
        { id: 'test-id', pattern_id: 'HYDRA', priority: 'informational', confidence: 0.6, content: 'Hydration pattern' },
      ],
      data_points: {},
      confidence: 0.8,
    })

    const result = parseSociusResponse(raw)
    expect(result.insights![0].created_at).toBeTruthy()
  })

  it('handles all valid pattern IDs', () => {
    const validPatterns: PatternId[] = [
      'CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC',
      'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG'
    ]

    for (const patternId of validPatterns) {
      const raw = JSON.stringify({
        message: 'test',
        insights: [{ pattern_id: patternId, priority: 'informational', confidence: 0.7, content: `Pattern ${patternId}` }],
        data_points: {},
        confidence: 0.8,
      })
      const result = parseSociusResponse(raw)
      expect(result.insights).toHaveLength(1)
      expect(result.insights![0].pattern_id).toBe(patternId)
    }
  })

  it('handles all valid priority levels', () => {
    const validPriorities: InsightPriority[] = ['urgent', 'notable', 'informational']

    for (const priority of validPriorities) {
      const raw = JSON.stringify({
        message: 'test',
        insights: [{ pattern_id: 'CAL_DEF', priority, confidence: 0.7, content: `Priority ${priority}` }],
        data_points: {},
        confidence: 0.8,
      })
      const result = parseSociusResponse(raw)
      expect(result.insights![0].priority).toBe(priority)
    }
  })
})

// ─── data_points normalization ───────────────────────────────────────

describe('data_points normalization', () => {
  it('preserves valid data_points object', () => {
    const raw = JSON.stringify({
      message: 'test',
      insights: [],
      data_points: { key1: 'value1', key2: 42 },
      confidence: 0.8,
    })
    const result = parseSociusResponse(raw)
    expect(result.data_points).toEqual({ key1: 'value1', key2: 42 })
  })

  it('defaults to empty object when data_points is null', () => {
    const raw = JSON.stringify({
      message: 'test',
      insights: [],
      data_points: null,
      confidence: 0.8,
    })
    const result = parseSociusResponse(raw)
    expect(result.data_points).toEqual({})
  })

  it('defaults to empty object when data_points is an array', () => {
    const raw = JSON.stringify({
      message: 'test',
      insights: [],
      data_points: ['not', 'an', 'object'],
      confidence: 0.8,
    })
    const result = parseSociusResponse(raw)
    expect(result.data_points).toEqual({})
  })

  it('defaults to empty object when data_points is missing', () => {
    const raw = JSON.stringify({
      message: 'test',
      insights: [],
      confidence: 0.8,
    })
    const result = parseSociusResponse(raw)
    expect(result.data_points).toEqual({})
  })
})

// ─── persistInsights ─────────────────────────────────────────────────

describe('persistInsights', () => {
  function createMockSupabase() {
    const insertFn = vi.fn().mockResolvedValue({ error: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'insights') {
        return { insert: insertFn }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    return {
      supabase: { from: fromFn } as unknown as import('@supabase/supabase-js').SupabaseClient,
      fromFn,
      insertFn,
    }
  }

  it('persists insights above confidence threshold', async () => {
    const { supabase, fromFn, insertFn } = createMockSupabase()
    const insights: RecentInsight[] = [
      makeInsight({ confidence: 0.8, pattern_id: 'CAL_DEF', priority: 'urgent' }),
    ]

    await persistInsights(insights, 'user-1', supabase)
    expect(fromFn).toHaveBeenCalledWith('insights')
    expect(insertFn).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        pattern_id: 'CAL_DEF',
        priority: 'urgent',
        confidence: 0.8,
        data_context: {},
      })
    ])
  })

  it('filters out insights below confidence threshold (0.6)', async () => {
    const { supabase, insertFn } = createMockSupabase()
    const insights: RecentInsight[] = [
      makeInsight({ confidence: 0.5 }),
      makeInsight({ confidence: 0.3 }),
    ]

    await persistInsights(insights, 'user-1', supabase)
    expect(insertFn).not.toHaveBeenCalled()
  })

  it('only persists insights above threshold in mixed set', async () => {
    const { supabase, insertFn } = createMockSupabase()
    const insights: RecentInsight[] = [
      makeInsight({ id: 'low', confidence: 0.4, pattern_id: 'HYDRA' }),
      makeInsight({ id: 'high', confidence: 0.9, pattern_id: 'OVER_TRN' }),
      makeInsight({ id: 'borderline', confidence: 0.6, pattern_id: 'CON_PROG' }),
    ]

    await persistInsights(insights, 'user-1', supabase)
    expect(insertFn).toHaveBeenCalledWith([
      expect.objectContaining({ pattern_id: 'OVER_TRN', confidence: 0.9 })
    ])
  })

  it('does nothing when insights array is empty', async () => {
    const { supabase, insertFn } = createMockSupabase()
    await persistInsights([], 'user-1', supabase)
    expect(insertFn).not.toHaveBeenCalled()
  })

  it('handles DB insert error gracefully', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    const fromFn = vi.fn().mockReturnValue({ insert: insertFn })
    const supabase = { from: fromFn } as unknown as import('@supabase/supabase-js').SupabaseClient

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const insights: RecentInsight[] = [makeInsight({ confidence: 0.9 })]

    await persistInsights(insights, 'user-1', supabase)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to persist insights:', expect.any(Object))
    consoleSpy.mockRestore()
  })
})
