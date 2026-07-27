import { describe, expect, it } from 'vitest'
import {
  buildDashboardNarrativeRequest,
  createDashboardFactsFingerprint,
  createDashboardTemplateFingerprint,
  parseDashboardNarrative,
  type DashboardNarrativeFacts,
} from '@/app/lib/dashboard-narrative'
import { DEFAULT_DASHBOARD_VIEW_TEMPLATE } from '@/app/lib/view-templates'

const facts: DashboardNarrativeFacts = {
  localDate: '2026-07-27',
  days: [{
    date: '2026-07-27',
    workoutCount: 1,
    strengthBlocks: 2,
    metconBlocks: 0,
    cardioBlocks: 0,
    avgRpe: 7.5,
    mealCount: 3,
    totalProtein: 142,
    totalCarbs: 210,
    totalFat: 61,
    totalCalories: 1957,
    proteinPctTarget: 79,
    caloriePctTarget: 83,
    recoveryScore: 72,
    sleepScore: 88,
    strain: 9.4,
  }],
  personalRecords: [{
    exercise: 'Back Squat',
    prType: 'weight',
    value: 315,
    achievedAt: '2026-07-26',
  }],
}

describe('dashboard narrative contract', () => {
  it('creates the same fingerprint for equivalent key order and changes on new facts', () => {
    const reordered = {
      personalRecords: facts.personalRecords,
      days: facts.days,
      localDate: facts.localDate,
    } as DashboardNarrativeFacts

    expect(createDashboardFactsFingerprint(facts)).toBe(
      createDashboardFactsFingerprint(reordered),
    )
    expect(createDashboardFactsFingerprint({
      ...facts,
      days: [{ ...facts.days[0], mealCount: 4 }],
    })).not.toBe(createDashboardFactsFingerprint(facts))
  })

  it('changes cache identity when same-version template content changes', () => {
    expect(createDashboardTemplateFingerprint({
      ...DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      tone: 'coaching',
    })).not.toBe(createDashboardTemplateFingerprint(DEFAULT_DASHBOARD_VIEW_TEMPLATE))
  })

  it('builds a bounded JSON request that treats computed facts as immutable data', () => {
    const request = buildDashboardNarrativeRequest(
      DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      facts,
    )

    expect(request.purpose).toBe('query')
    expect(request.responseFormat).toBe('json')
    expect(request.maxTokens).toBeLessThanOrEqual(500)
    expect(request.system).toContain('never calculate')
    expect(request.system).toContain('untrusted data')
    expect(request.messages[0].content).toContain('"totalProtein":142')
  })

  it('accepts concise highlights tied to visible sections', () => {
    const parsed = parseDashboardNarrative(JSON.stringify({
      headline: 'Recovery supports a focused training day',
      summary: 'Recovery is 72%. Protein is at 142g so far.',
      highlights: [
        { section: 'recovery', text: 'Recovery is 72% with sleep at 88%.' },
        { section: 'nutrition', text: 'Protein is 142g so far.' },
      ],
    }), DEFAULT_DASHBOARD_VIEW_TEMPLATE, facts)

    expect(parsed).toEqual(expect.objectContaining({
      headline: 'Recovery supports a focused training day',
    }))
  })

  it('rejects hidden sections, unsupported fields, and numbers not present in facts', () => {
    const hiddenNutrition = {
      ...DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      sections: DEFAULT_DASHBOARD_VIEW_TEMPLATE.sections.map(section => (
        section.id === 'nutrition' ? { ...section, visible: false } : section
      )),
    }

    expect(parseDashboardNarrative(JSON.stringify({
      headline: 'Today',
      summary: 'Protein is 142g.',
      highlights: [{ section: 'nutrition', text: 'Protein is 142g.' }],
    }), hiddenNutrition, facts)).toBeNull()

    const request = buildDashboardNarrativeRequest(hiddenNutrition, facts)
    expect(request.messages[0].content).not.toContain('"totalProtein":142')
    expect(parseDashboardNarrative(JSON.stringify({
      headline: 'Today',
      summary: 'Protein is 142g.',
      highlights: [],
    }), hiddenNutrition, facts)).toBeNull()

    expect(parseDashboardNarrative(JSON.stringify({
      headline: 'Today',
      summary: 'Recovery is 99%.',
      highlights: [],
      recommendation: 'Go hard',
    }), DEFAULT_DASHBOARD_VIEW_TEMPLATE, facts)).toBeNull()

    expect(parseDashboardNarrative(JSON.stringify({
      headline: 'Today',
      summary: 'Recovery is 99%.',
      highlights: [],
    }), DEFAULT_DASHBOARD_VIEW_TEMPLATE, facts)).toBeNull()

    expect(parseDashboardNarrative(JSON.stringify({
      headline: 'Three priorities today',
      summary: 'Recovery is 72%.',
      highlights: [],
    }), DEFAULT_DASHBOARD_VIEW_TEMPLATE, facts)).toBeNull()
  })
})
