/**
 * W0 defect reproductions at main 61d04df9dad3dfe88a9594fff28be06a72899741.
 * Opt in with RUN_BASELINE_DEFECTS=1. These assert defects, NOT desired behavior.
 * Replace affected cases with package regression tests as fixes land. The three
 * source-inspection cases are explicitly not UI/database/end-to-end evidence.
 */
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildProgrammingProfile, validateCompleteCoachPlanningInput } from '@/app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { checkHRVTrend, checkNutritionPerformance } from '@/app/lib/agents/socius-background'
import type { SociusContext } from '@/app/lib/agents/types'
import { sendLoggingRequest } from '@/app/lib/client/logging-request'
import { fetchWithTimeout } from '@/app/lib/client/fetch-with-timeout'

vi.mock('@/app/lib/client/fetch-with-timeout', () => ({ fetchWithTimeout: vi.fn() }))

const baseline = process.env.RUN_BASELINE_DEFECTS === '1' ? describe : describe.skip
const source = (path: string) => readFileSync(path, 'utf8')

function profile(goal: string) {
  const input = validateCompleteCoachPlanningInput({
    format: 'complete_programming_intake_v0_3', primaryDomain: 'strength', goal,
    experience: 'consistent', trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60, equipment: 'Bodyweight, barbell, rack',
    resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack'], constraints: '',
    constraintKinds: [], secondaryGoals: [], startDate: '2026-09-07'
  })
  if (!input.ok) throw new Error(input.errors.join('; '))
  return buildProgrammingProfile(input.value, [])
}

// Deliberately minimal packet: detectors cannot observe performance or HRV series
// because they read only these aggregate fields. No provider/database is involved.
function detectorContext(): SociusContext {
  return {
    targets: { protein: 150, calories: 2000 },
    thirty_day_summary: {
      workout_count: 12, avg_daily_protein: 150, avg_daily_calories: 2000,
      whoop_avg_recovery: 40
    }
  } as SociusContext
}

afterEach(() => vi.unstubAllGlobals())

baseline('W0 baseline defects — never release acceptance', () => {
  it('SOURCE ONLY: completion initializes unreported feedback as RPE 7, okay energy, and no pain', () => {
    const card = source('app/program/today-session-card.tsx')
    expect(card).toContain("useState('7')")
    expect(card).toContain("useState<CoachSessionEnergy>('okay')")
    expect(card).toContain("useState<CoachSessionPain>('none')")
  })

  it('intake emits empty recent history without a missing-versus-outage distinction', () => {
    expect(profile('Bench press 225 pounds').recentTraining).toEqual({
      asOfDate: null, lookbackDays: 0, completedSessionCount: 0,
      performedMovementIds: [], doseByCoverageTarget: []
    })
  })

  it('different strength outcomes receive identical target-less assessment requirements', () => {
    const bench = buildCompleteEightWeekPlan(profile('Bench press 225 pounds')).adaptiveProgramming
    const squat = buildCompleteEightWeekPlan(profile('Back squat 315 pounds')).adaptiveProgramming
    expect(bench.goals[0].statement).not.toBe(squat.goals[0].statement)
    expect(bench.goals[0].target).toBeNull()
    expect(squat.goals[0].target).toBeNull()
    expect(bench.hypotheses[0].evidenceRequirements).toEqual(squat.hypotheses[0].evidenceRequirements)
    expect(bench.scheduledAssessments).toEqual(squat.scheduledAssessments)
  })

  it('SOURCE ONLY: dose selector receives no evidence target and picks first sorted eligible assignment', () => {
    const review = source('app/lib/coach/weekly-review.ts')
    const selector = review.slice(review.indexOf('function findDoseChange('), review.indexOf('function buildSignalRequest('))
    expect(selector).toContain("action: 'adjust_dose' | 'recover'")
    expect(selector).toContain('left.id.localeCompare(right.id)')
    expect(selector).toContain('for (const assignment of candidates)')
    expect(selector).toContain('assignmentId: assignment.id')
    expect(selector).not.toMatch(/evidence|metricId|assessmentDefinitionId/)
  })

  it('asserts a nutrition-performance link without any performance observations', () => {
    expect(checkNutritionPerformance(detectorContext())?.content).toContain('Strong nutrition-performance link')
  })

  it('asserts possible declining HRV from one aggregate recovery score without HRV observations', () => {
    expect(checkHRVTrend(detectorContext())?.content).toContain('declining HRV')
  })

  it('SOURCE ONLY: latest WHOOP recovery fetch drops the measurement date', () => {
    const builder = source('app/lib/agents/context-builder.ts')
    const recovery = builder.slice(builder.indexOf(".from('whoop_recovery')"), builder.indexOf('return { score: data.recovery_score }') + 42)
    expect(recovery).toContain(".select('recovery_score')")
    expect(recovery).toContain(".order('date', { ascending: false })")
    expect(recovery).toContain('return { score: data.recovery_score }')
  })

  it('timeout then edited payload allocates a second identity while the original is unresolved', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const stored = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key)
    })
    const fetch = vi.mocked(fetchWithTimeout)
    fetch.mockReset()
    fetch.mockRejectedValueOnce(new Error('synthetic lost response'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true }), { status: 200 }))
    const user = 'synthetic-baseline-athlete'
    await expect(sendLoggingRequest('/api/meals/parse-text', {
      method: 'POST', body: JSON.stringify({ text: 'one banana' })
    }, user)).rejects.toThrow('synthetic lost response')
    await sendLoggingRequest('/api/meals/parse-text', {
      method: 'POST', body: JSON.stringify({ text: 'two bananas' })
    }, user)
    const first = JSON.parse(String(fetch.mock.calls[0][1]?.body))
    const second = JSON.parse(String(fetch.mock.calls[1][1]?.body))
    expect(second.requestId).not.toBe(first.requestId)
    expect(first.expectedUserId).toBe(user)
    expect(stored.size).toBe(1) // unresolved first operation remains
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/meals/parse-text', '/api/meals/parse-text'])
  })
})
