/**
 * Property-Based Tests for Insight Sorting
 *
 * Feature: agent-system, Property 24: Insight sorting
 *
 * *For any* set of insights, the Insights tab display order SHALL sort by
 * priority (urgent > notable > informational) first, then by `created_at`
 * descending within the same priority level.
 *
 * **Validates: Requirements 8.8**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { sortInsights } from '@/app/v2/components/BottomNav'
import type { RecentInsight, InsightPriority, PatternId } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

const PRIORITIES: InsightPriority[] = ['urgent', 'notable', 'informational']
const PRIORITY_RANK: Record<InsightPriority, number> = { urgent: 0, notable: 1, informational: 2 }

const PATTERN_IDS: PatternId[] = [
  'CAL_DEF', 'OVER_TRN', 'NUT_PERF', 'REC_VOL', 'PRO_REC',
  'SLEEP_PERF', 'HRV_TREND', 'STRAIN_NUT', 'HYDRA', 'CON_PROG',
]

// ─── Arbitraries ─────────────────────────────────────────────────────

const arbPriority = fc.constantFrom<InsightPriority>(...PRIORITIES)
const arbPatternId = fc.constantFrom<PatternId>(...PATTERN_IDS)

const arbRecentInsight: fc.Arbitrary<RecentInsight> = fc.record({
  id: fc.uuid(),
  pattern_id: arbPatternId,
  priority: arbPriority,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  created_at: fc.date({
    min: new Date('2020-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  }).map((d) => d.toISOString()),
})

const arbInsightArray = fc.array(arbRecentInsight, { minLength: 0, maxLength: 30 })

// ─── Property Tests ──────────────────────────────────────────────────

describe('Insight Sorting Properties (Property 24)', () => {

  /**
   * Property 24a: All urgent insights come before all notable insights,
   * and all notable insights come before all informational insights.
   */
  test.prop([arbInsightArray], propertyConfig)(
    'Property 24: urgent < notable < informational in sort order',
    (insights) => {
      const sorted = sortInsights(insights)

      for (let i = 1; i < sorted.length; i++) {
        const prevRank = PRIORITY_RANK[sorted[i - 1].priority]
        const currRank = PRIORITY_RANK[sorted[i].priority]
        expect(prevRank).toBeLessThanOrEqual(currRank)
      }
    },
  )

  /**
   * Property 24b: Within the same priority level, insights are sorted
   * by created_at descending (newest first).
   */
  test.prop([arbInsightArray], propertyConfig)(
    'Property 24: same-priority insights sorted by created_at descending',
    (insights) => {
      const sorted = sortInsights(insights)

      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].priority === sorted[i].priority) {
          const prevTime = new Date(sorted[i - 1].created_at).getTime()
          const currTime = new Date(sorted[i].created_at).getTime()
          expect(prevTime).toBeGreaterThanOrEqual(currTime)
        }
      }
    },
  )

  /**
   * Property 24c: Sorted array has the same length as the input.
   */
  test.prop([arbInsightArray], propertyConfig)(
    'Property 24: sort preserves array length',
    (insights) => {
      const sorted = sortInsights(insights)
      expect(sorted).toHaveLength(insights.length)
    },
  )

  /**
   * Property 24d: Sorted array contains the same elements as the input
   * (no elements lost or added).
   */
  test.prop([arbInsightArray], propertyConfig)(
    'Property 24: sort preserves all elements (same ids)',
    (insights) => {
      const sorted = sortInsights(insights)
      const inputIds = insights.map((i) => i.id).sort()
      const sortedIds = sorted.map((i) => i.id).sort()
      expect(sortedIds).toEqual(inputIds)
    },
  )
})
