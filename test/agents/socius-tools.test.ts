import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeToolCall } from '@/app/lib/agents/tools/executor'
import { SOCIUS_TOOLS } from '@/app/lib/agents/tools/definitions'

function createDailyContextSupabaseMock() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn()
  }

  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({
    data: [
      {
        date: '2026-05-30',
        workout_count: 1,
        workout_summary: 'Strength + short metcon',
        strength_blocks: 1,
        metcon_blocks: 1,
        cardio_blocks: 0,
        avg_rpe: 8,
        total_protein: 155,
        total_carbs: 240,
        total_fat: 70,
        total_calories: 2210,
        protein_pct_target: 1.03,
        calorie_pct_target: 1.01,
        recovery_score: 72,
        hrv_rmssd_milli: 58,
        resting_heart_rate: 48,
        sleep_score: 84,
        sleep_efficiency_pct: 91,
        strain: 13.4
      }
    ],
    error: null
  })

  return {
    supabase: {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient,
    query
  }
}

function createAssessmentSupabaseMock() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn()
  }

  query.insert.mockReturnValue(query)
  query.select.mockReturnValue(query)
  query.single.mockResolvedValue({ data: { id: 'assessment-1' }, error: null })

  return {
    supabase: {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient,
    query
  }
}

describe('Socius retrieval tools', () => {
  it('exposes readiness, athlete state, and bounded doctrine retrieval', () => {
    expect(SOCIUS_TOOLS.map(tool => tool.name)).toEqual([
      'get_programming_readiness',
      'get_coach_state',
      'get_coach_reference',
      'record_strength_assessment',
      'confirm_coach_memory'
    ])
  })

  it('returns compact programming readiness context from daily_agent_context', async () => {
    const { supabase, query } = createDailyContextSupabaseMock()

    const result = await executeToolCall(
      'get_programming_readiness',
      { days: 14 },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('daily_agent_context')
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-123')
    expect(query.limit).toHaveBeenCalledWith(14)
    expect(result.data?.context).toMatchObject({
      summary: {
        day_count: 1,
        workout_days: 1,
        nutrition_days: 1,
        recovery_days: 1,
        avg_recovery: 72,
        avg_sleep_score: 84,
        avg_strain: 13.4
      },
      days: [
        expect.objectContaining({
          date: '2026-05-30',
          workout_summary: 'Strength + short metcon',
          total_protein: 155,
          recovery_score: 72
        })
      ]
    })
  })

  it('bounds requested days to the 90-day context cap', async () => {
    const { supabase, query } = createDailyContextSupabaseMock()

    const result = await executeToolCall(
      'get_programming_readiness',
      { days: 365 },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(query.limit).toHaveBeenCalledWith(90)
  })

  it('returns only requested valid doctrine domains', async () => {
    const { supabase } = createDailyContextSupabaseMock()

    const result = await executeToolCall(
      'get_coach_reference',
      { domains: ['strength', 'not-a-domain', 'recovery'] },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(result.data?.reference).toMatchObject({
      doctrineVersion: '0.1.0',
      domains: [
        { id: 'strength' },
        { id: 'recovery' }
      ]
    })
  })

  it('derives and stores a labeled estimated 1RM from a confirmed 5RM', async () => {
    const { supabase, query } = createAssessmentSupabaseMock()

    const result = await executeToolCall(
      'record_strength_assessment',
      {
        movement: 'Back Squat',
        load: 100,
        unit: 'kg',
        reps: 5,
        assessed_on: '2026-07-25',
        is_true_rep_max: true,
        athlete_confidence: 0.9,
        idempotency_key: 'assessment-confirmation-20260725'
      },
      'user-123',
      supabase
    )

    expect(result.success).toBe(true)
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-123',
      idempotency_key: 'assessment-confirmation-20260725',
      input_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      estimated_1rm: 116.7,
      estimate_kind: 'estimated_1rm',
      calculator_version: 'epley-general-v1'
    }))
    expect(result.data?.assessment).toMatchObject({
      estimatedOneRepMax: 116.7,
      estimateKind: 'estimated_1rm'
    })
  })

  it('deduplicates a retried assessment with the same idempotency key and payload', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn()
    }
    query.insert.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.single.mockImplementation(async () => {
      const inserted = query.insert.mock.calls[0][0] as { input_fingerprint: string }
      query.limit.mockResolvedValue({
        data: [{ id: 'assessment-1', input_fingerprint: inserted.input_fingerprint }],
        error: null
      })
      return { data: null, error: { code: '23505', message: 'duplicate' } }
    })
    const supabase = {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient

    const result = await executeToolCall(
      'record_strength_assessment',
      {
        movement: 'Back Squat',
        load: 100,
        unit: 'kg',
        reps: 5,
        assessed_on: '2026-07-25',
        is_true_rep_max: true,
        athlete_confidence: 0.9,
        idempotency_key: 'assessment-confirmation-20260725'
      },
      'user-123',
      supabase
    )

    expect(result).toMatchObject({
      success: true,
      data: { assessment_id: 'assessment-1', deduplicated: true }
    })
  })

  it('rejects an assessment idempotency key reused for different data', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn()
    }
    query.insert.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate' }
    })
    query.limit.mockResolvedValue({
      data: [{ id: 'assessment-1', input_fingerprint: '0'.repeat(64) }],
      error: null
    })
    const supabase = {
      from: vi.fn().mockReturnValue(query)
    } as unknown as SupabaseClient

    const result = await executeToolCall(
      'record_strength_assessment',
      {
        movement: 'Back Squat',
        load: 100,
        unit: 'kg',
        reps: 5,
        assessed_on: '2026-07-25',
        is_true_rep_max: true,
        athlete_confidence: 0.9,
        idempotency_key: 'assessment-confirmation-20260725'
      },
      'user-123',
      supabase
    )

    expect(result).toEqual({
      success: false,
      error: 'Assessment idempotency key was already used for different data'
    })
  })

  it('confirms coach memory through the atomic versioning RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ memory_id: 'memory-1', memory_version: 2 }],
      error: null
    })
    const supabase = { rpc } as unknown as SupabaseClient

    const result = await executeToolCall(
      'confirm_coach_memory',
      {
        memory_key: 'primary_goal',
        kind: 'goal',
        content: { goal: 'Build strength without losing speed' },
        confidence: 1,
        idempotency_key: 'goal-confirmation-20260727'
      },
      'user-123',
      supabase
    )

    expect(result).toMatchObject({
      success: true,
      data: { memory_id: 'memory-1', memory_version: 2 }
    })
    expect(rpc).toHaveBeenCalledWith('confirm_coach_memory', expect.objectContaining({
      p_memory_key: 'primary_goal',
      p_kind: 'goal',
      p_idempotency_key: 'goal-confirmation-20260727'
    }))
  })
})
