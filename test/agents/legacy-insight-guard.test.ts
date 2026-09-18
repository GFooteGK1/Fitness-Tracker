import { afterEach, describe, expect, it, vi } from 'vitest'
import { canSurfaceLegacyInsight, filterModelConversation, RETIRED_LEGACY_INSIGHT_PATTERNS, UNSUPPORTED_INSIGHT_RESPONSE } from '@/app/lib/agents/legacy-insight-guard'
import { filterRetiredInsightMessages } from '@/app/lib/agents/legacy-insight-readers'
import { parseSociusResponse, persistInsights } from '@/app/lib/agents/socius-agent'
import { sortInsights } from '@/app/v2/components/BottomNav'
import { fetchRecentChat } from '@/app/lib/agents/chat-persistence'

afterEach(() => vi.unstubAllEnvs())

describe('permanent legacy insight guard', () => {
  it.each(RETIRED_LEGACY_INSIGHT_PATTERNS)('withholds %s even with perfect model confidence and rollout disabled', async pattern_id => {
    vi.stubEnv('RECOMMENDATIONS_ENABLED', 'false')
    const insight = { id: 'retired', pattern_id, priority: 'urgent' as const, confidence: 1, content: 'Unsupported claim', created_at: '2026-09-18T00:00:00Z' }
    expect(canSurfaceLegacyInsight(insight)).toBe(false)
    const parsed = parseSociusResponse(JSON.stringify({ message: 'Unsupported claim', insights: [insight], confidence: 1 }))
    expect(parsed.insights).toEqual([])
    expect(parsed.message).toBe(UNSUPPORTED_INSIGHT_RESPONSE)
    const from = vi.fn()
    await persistInsights([insight], 'owner', { from } as any)
    expect(from).not.toHaveBeenCalled()
    expect(sortInsights([insight])).toEqual([])
  })

  it.each(['NUT_PERF ', 'hrv_trend', ' cal_def ', 'Strain_Nut'])('does not let malformed casing or whitespace launder retired message prose: %s', pattern_id => {
    const parsed = parseSociusResponse(JSON.stringify({ message: 'Unsupported claim', insights: [{ pattern_id, content: 'Unsupported claim', confidence: 1 }], data_points: { claim: 'Unsupported claim' } }))
    expect(parsed.message).toBe(UNSUPPORTED_INSIGHT_RESPONSE)
    expect(parsed.insights).toEqual([])
    expect(parsed.data_points).toEqual({})
  })

  it('keeps retained patterns and raw facts while withholding fabricated body-mass and partial-intake insight types', () => {
    expect(canSurfaceLegacyInsight({ pattern_id: 'CON_PROG' })).toBe(true)
    expect(canSurfaceLegacyInsight({ type: 'nutrition_performance' })).toBe(false)
    expect(canSurfaceLegacyInsight({ type: 'nutrition_strain' })).toBe(false)
    expect(canSurfaceLegacyInsight({ type: 'recovery_nutrition' })).toBe(false)
    expect(canSurfaceLegacyInsight({ type: 'workout_timing' })).toBe(true)
  })

  it('keeps historical analyst replies visible but excludes unlinked analyst prose from model evidence', async () => {
    const old = { role: 'socius', content: 'Protein caused your better recovery. HRV is falling.', related_entity_type: null, related_entity_id: null }
    const user = { ...old, role: 'user' }
    const history = await filterRetiredInsightMessages({} as any, 'owner', [old, user])
    expect(history).toEqual([old, user])
    expect(filterModelConversation(history)).toEqual([user])
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: async () => ({ data: [user, old] }) }
    expect(await fetchRecentChat({ from: () => chain } as any, 'owner')).toEqual([user])
  })

  it('resolves typed historical insights by owner and preserves raw user text and ordinary messages', async () => {
    const messages = [
      { role: 'user', content: 'CAL_DEF is what the old coach said', related_entity_type: 'insight', related_entity_id: 'retired' },
      { role: 'socius', content: 'Unsupported claim', related_entity_type: 'insight', related_entity_id: 'retired' },
      { role: 'socius', content: 'Retained', related_entity_type: 'insight', related_entity_id: 'valid' },
      { role: 'trainer', content: 'Logged workout', related_entity_type: 'workout', related_entity_id: 'workout' },
      { role: 'socius', content: 'Unresolved', related_entity_type: 'insight', related_entity_id: 'missing' },
    ]
    const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain), limit: vi.fn().mockResolvedValue({ data: [{ id: 'retired', pattern_id: 'NUT_PERF' }, { id: 'valid', pattern_id: 'CON_PROG' }], error: null }) }
    const result = await filterRetiredInsightMessages({ from: () => chain } as any, 'owner', messages)
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'owner')
    expect(result).toEqual([messages[0], messages[2], messages[3]])
    chain.limit.mockResolvedValue({ data: null, error: { message: 'offline' } })
    expect(await filterRetiredInsightMessages({ from: () => chain } as any, 'owner', messages)).toEqual([messages[0], messages[3]])
    expect(messages).toHaveLength(5)
  })
})
