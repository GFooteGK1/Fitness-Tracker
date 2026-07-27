import { describe, expect, it, vi } from 'vitest'
import {
  getDashboardNarrative,
  type DashboardNarrativeStore,
} from '@/app/lib/dashboard-narrative-service'
import { DEFAULT_DASHBOARD_VIEW_TEMPLATE } from '@/app/lib/view-templates'

const facts = {
  localDate: '2026-07-27',
  days: [{
    date: '2026-07-27',
    workoutCount: 1,
    strengthBlocks: 1,
    metconBlocks: 0,
    cardioBlocks: 0,
    avgRpe: 7,
    mealCount: 2,
    totalProtein: 120,
    totalCarbs: 160,
    totalFat: 50,
    totalCalories: 1570,
    proteinPctTarget: 67,
    caloriePctTarget: 67,
    recoveryScore: 71,
    sleepScore: 84,
    strain: 8.2,
  }],
  personalRecords: [],
}

const composition = {
  headline: 'A steady day',
  summary: 'Recovery is 71% and protein is 120g.',
  highlights: [{ section: 'recovery' as const, text: 'Recovery is 71%.' }],
}

function makeStore(overrides: Partial<DashboardNarrativeStore> = {}): DashboardNarrativeStore {
  return {
    getTemplate: vi.fn().mockResolvedValue({
      version: 1,
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
    }),
    getFacts: vi.fn().mockResolvedValue(facts),
    getCached: vi.fn().mockResolvedValue(null),
    saveCached: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('getDashboardNarrative', () => {
  it('returns a user-scoped daily cache hit without calling the model', async () => {
    const store = makeStore({
      getCached: vi.fn().mockResolvedValue({
        composition,
        generatedAt: '2026-07-27T12:00:00.000Z',
      }),
    })
    const complete = vi.fn()

    const result = await getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store, complete,
    })

    expect(result).toEqual(expect.objectContaining({ cached: true, composition }))
    expect(complete).not.toHaveBeenCalled()
  })

  it('generates and caches a validated composition on a cache miss', async () => {
    const store = makeStore()
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify(composition),
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })

    const result = await getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store, complete,
      now: () => new Date('2026-07-27T14:00:00.000Z'),
    })

    expect(result).toEqual(expect.objectContaining({ cached: false, composition }))
    expect(store.saveCached).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      localDate: '2026-07-27',
      templateVersion: 1,
      composition,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    }))
  })

  it('does not call the model when the template disables narrative or facts are empty', async () => {
    const disabled = makeStore({
      getTemplate: vi.fn().mockResolvedValue({
        version: 2,
        template: { ...DEFAULT_DASHBOARD_VIEW_TEMPLATE, showNarrative: false },
      }),
    })
    const complete = vi.fn()

    expect(await getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store: disabled, complete,
    })).toEqual({ status: 'disabled', composition: null })

    const empty = makeStore({
      getFacts: vi.fn().mockResolvedValue({
        localDate: '2026-07-27', days: [], personalRecords: [],
      }),
    })
    expect(await getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store: empty, complete,
    })).toEqual({ status: 'empty', composition: null })
    expect(complete).not.toHaveBeenCalled()
  })

  it('does not call the model when every data-bearing section is hidden', async () => {
    const store = makeStore({
      getTemplate: vi.fn().mockResolvedValue({
        version: 2,
        template: {
          ...DEFAULT_DASHBOARD_VIEW_TEMPLATE,
          sections: DEFAULT_DASHBOARD_VIEW_TEMPLATE.sections.map(section => ({
            ...section,
            visible: false,
          })),
        },
      }),
    })
    const complete = vi.fn()

    expect(await getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store, complete,
    })).toEqual({ status: 'empty', composition: null })
    expect(complete).not.toHaveBeenCalled()
  })

  it('fails closed when the model invents a number', async () => {
    const store = makeStore()
    const complete = vi.fn().mockResolvedValue({
      text: JSON.stringify({ ...composition, summary: 'Recovery is 99%.' }),
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })

    await expect(getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store, complete,
    })).rejects.toThrow('invalid dashboard narrative')
    expect(store.saveCached).not.toHaveBeenCalled()
  })

  it('reports an exhausted output budget before parsing truncated JSON', async () => {
    const store = makeStore()
    const complete = vi.fn().mockResolvedValue({
      text: '{"headline":"truncated',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      stopReason: 'max_tokens',
    })

    await expect(getDashboardNarrative({
      userId: 'user-1', localDate: '2026-07-27', store, complete,
    })).rejects.toThrow('output token limit')
    expect(store.saveCached).not.toHaveBeenCalled()
  })
})
