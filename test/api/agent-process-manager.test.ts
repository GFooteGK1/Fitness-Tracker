import { loggingRpc } from '../helpers/logging-rpc'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}))

vi.mock('@/app/lib/agents/classifier', () => ({
  classifyInput: vi.fn()
}))

vi.mock('@/app/lib/agents/context-builder', () => ({
  buildTrainerContext: vi.fn(),
  buildNutritionistContext: vi.fn(),
  buildSociusContext: vi.fn(),
  invalidatePassiveCache: vi.fn()
}))

vi.mock('@/app/lib/agents/trainer-agent', () => ({
  callTrainerAgent: vi.fn(),
  persistWorkout: vi.fn(),
  persistNewPRs: vi.fn()
}))

vi.mock('@/app/lib/agents/nutritionist-agent', () => ({
  callNutritionistAgent: vi.fn(),
  persistMeal: vi.fn()
}))

vi.mock('@/app/lib/agents/socius-agent', () => ({
  callSociusAgent: vi.fn(),
  persistInsights: vi.fn()
}))

vi.mock('@/app/lib/agents/socius-background', () => ({
  triggerSociusBackground: vi.fn()
}))

import { POST } from '@/app/api/agent/process/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { classifyInput } from '@/app/lib/agents/classifier'
import { buildNutritionistContext, buildSociusContext, buildTrainerContext } from '@/app/lib/agents/context-builder'
import { callNutritionistAgent } from '@/app/lib/agents/nutritionist-agent'
import { callSociusAgent } from '@/app/lib/agents/socius-agent'
import { callTrainerAgent } from '@/app/lib/agents/trainer-agent'

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/agent/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'request-123456', submittedAt: '2026-09-04T12:00:00Z', ...(body as object) })
  })
}

function createSupabaseMock() {
  return {
    rpc: loggingRpc('saved-1'),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
      })
    },
    from: vi.fn((table: string) => {
      if (table === 'insights') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          update: vi.fn().mockReturnThis()
        }
      }

      if (table === 'chat_messages') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null })
        }
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null })
      }
    })
  }
}

describe('/api/agent/process Manager integration', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(createServerClient).mockResolvedValue(createSupabaseMock() as never)

    vi.mocked(buildSociusContext).mockResolvedValue({
      user_id: 'user-123',
      targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
      today: {
        meals_logged: 0,
        macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        macros_remaining: { protein: 150, carbs: 200, fat: 65, calories: 2000 },
        workouts_logged: 0,
        latest_whoop_recovery: null,
        latest_whoop_strain: null
      },
      week: {
        days_elapsed: 1,
        actual: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        prorated_target: { protein: 150, carbs: 200, fat: 65, calories: 2000 },
        adherence_pct: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        overall_status: 'behind'
      },
      recent_chat: [],
      pending_insights: [],
      current_time: '7:00 AM',
      day_of_week: 'Sunday',
      current_date: '2026-05-31',
      has_whoop: false,
      thirty_day_summary: {
        workout_count: 0,
        workout_types: { metcon: 0, strength: 0, cardio: 0, emom: 0 },
        avg_rpe: null,
        total_meals: 0,
        avg_daily_protein: 0,
        avg_daily_calories: 0,
        pr_count: 0,
        whoop_avg_recovery: null,
        whoop_avg_sleep_score: null
      },
      recent_insights: [],
      data_availability: {
        has_workouts: false,
        has_meals: false,
        has_whoop: false,
        has_targets: false,
        workout_days: 0,
        meal_days: 0
      }
    })

    vi.mocked(buildTrainerContext).mockResolvedValue({} as never)
    vi.mocked(buildNutritionistContext).mockResolvedValue({} as never)
    vi.mocked(callSociusAgent).mockResolvedValue({
      message: 'Socius context checked.',
      insights: [],
      data_points: {},
      confidence: 0.8
    })
    vi.mocked(callTrainerAgent).mockResolvedValue({
      message: 'Trainer received programming request.',
      confidence: 0.8
    })
    vi.mocked(callNutritionistAgent).mockResolvedValue({
      message: 'Nutritionist received programming request.',
      remaining_budget: { protein: 0, carbs: 0, fat: 0, calories: 0 },
      week_status: {
        days_elapsed: 1,
        actual: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        prorated_target: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        adherence_pct: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        overall_status: 'on-track'
      },
      confidence: 0.8
    })
  })

  it('passes the Manager-selected programming window into buildSociusContext', async () => {
    vi.mocked(classifyInput).mockResolvedValue({
      input_type: 'question',
      domains: ['trainer'],
      confidence: 0.9,
      context: {
        has_portions: false,
        has_score: false,
        is_benchmark: false
      }
    })

    const response = await POST(createMockRequest({
      content: 'Program tomorrow based on my recovery',
      input_mode: 'text',
      tz_offset: -360
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.manager_decision.intent).toBe('programming_request')
    expect(body.manager_decision.context_request.recent_recovery_days).toBe(30)
    expect(buildSociusContext).toHaveBeenCalledWith('user-123', -360, 30, true)
    expect(callSociusAgent).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
      'Program tomorrow based on my recovery',
      expect.any(Object),
      'user-123'
    )
  })

  it.each([
    "Draft today's session",
    'What should I train today?',
    'What does training look like today?',
    'Please, adjust today’s session.',
  ])('answers a standalone pilot request with one direct handoff: %s', async content => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', 'user-123')
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    const supabase = createSupabaseMock()
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)

    const response = await POST(createMockRequest({ content, input_mode: 'text' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.messages).toEqual([{ role: 'socius', domain: 'socius', content: expect.stringContaining('Draft today’s session') }])
    expect(body.classification.input_type).toBe('question')
    expect(body.manager_decision).toMatchObject({ intent: 'ask_question', agents: [], context_request: { recent_training_days: 0 } })
    expect(classifyInput).not.toHaveBeenCalled()
    expect(buildSociusContext).not.toHaveBeenCalled()
    expect(buildTrainerContext).not.toHaveBeenCalled()
    expect(buildNutritionistContext).not.toHaveBeenCalled()
    expect(callSociusAgent).not.toHaveBeenCalled()
    expect(callTrainerAgent).not.toHaveBeenCalled()
    expect(callNutritionistAgent).not.toHaveBeenCalled()
    expect(supabase.from.mock.calls).toEqual([['chat_messages']])
    expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual(['begin_logging_request', 'finish_logging_request'])
  })

  it('replays the pilot handoff without adding another history entry', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', 'user-123')
    const supabase = createSupabaseMock()
    const originalRpc = loggingRpc()
    let storedResponse: unknown
    supabase.rpc.mockImplementation(async (name, args) => {
      if (name === 'begin_logging_request' && storedResponse) {
        return { data: { status: 'complete', http_status: 200, response: storedResponse }, error: null }
      }
      if (name === 'finish_logging_request') storedResponse = args.p_response
      return originalRpc(name, args)
    })
    vi.mocked(createServerClient).mockResolvedValue(supabase as never)
    const request = { content: 'What should I train today?', input_mode: 'text' }

    const first = await POST(createMockRequest(request))
    const replay = await POST(createMockRequest(request))

    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(await first.json())
    expect(supabase.from.mock.calls).toEqual([['chat_messages']])
    expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual(['begin_logging_request', 'finish_logging_request', 'begin_logging_request'])
  })

  it.each([
    { pilot: 'different-user', content: 'What should I train today?', input_mode: 'text' },
    { pilot: 'user-123', content: 'What should I do today?', input_mode: 'text' },
    { pilot: 'user-123', content: 'What workouts did I do today?', input_mode: 'text' },
    { pilot: 'user-123', content: 'Build me a week', input_mode: 'text' },
    { pilot: 'user-123', content: 'Log my run and tell me what should I do today?', input_mode: 'text' },
    { pilot: 'user-123', content: 'What should I do today?', input_mode: 'photo' },
  ])('preserves the original routing for $content ($pilot, $input_mode)', async ({ pilot, content, input_mode }) => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', pilot)
    vi.mocked(classifyInput).mockResolvedValue({
      input_type: 'question', domains: ['socius'], confidence: 0.9,
      context: { has_portions: false, has_score: false, is_benchmark: false },
    })

    const response = await POST(createMockRequest({ content, input_mode }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(classifyInput).toHaveBeenCalledWith(content, input_mode)
    expect(callSociusAgent).toHaveBeenCalledOnce()
    expect(body.messages[0].content).toBe('Socius context checked.')
  })
})
