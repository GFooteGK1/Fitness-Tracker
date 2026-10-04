import { describe, expect, it, vi } from 'vitest'
import * as sessionCompiler from '@/app/lib/coach/offline-reviewed-session'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reconcileReviewedDoseWeek, readReviewedDoseWeekSummary } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import { reviewedSessionActivities } from '@/app/lib/coach/reviewed-session-contract'
import { reviewedC2rWeek } from '../fixtures/reviewed-c2r-week'

export function c2rReconciliationInput() {
  const week = reviewedC2rWeek()
  return { owner: 'athlete', contextHash: 'a'.repeat(64), basePlanVersionId: 'base-plan',
    base: week.base, target: week.target, registration: week.reconciliation }
}
describe('reviewed C2-R complete-week reconciliation', () => {
  it('keeps saved historical rationale readable when current eligibility changes', () => {
    const input = c2rReconciliationInput(), result = reconcileReviewedDoseWeek(input)
    if (result.kind !== 'reconciled') throw new Error(result.reasons.join('; '))
    const compiler = vi.spyOn(sessionCompiler, 'compileOfflineReviewedSession').mockReturnValue({ kind: 'review_required', reasons: ['Current eligibility changed'] })
    try {
      expect(reconcileReviewedDoseWeek(input).kind).toBe('review_required')
      expect(readReviewedDoseWeekSummary(result.receipt, input)).toEqual(result.receipt.summary)
    } finally { compiler.mockRestore() }
  })
  it.each(['2026-08-10', '2026-09-25'])('rejects same-day or later factual exposure on %s', date => {
    const input = c2rReconciliationInput()
    input.registration.link.factualSources[0].workoutDate = date
    input.registration.linkHash = doseContentHash(input.registration.link)
    expect(reconcileReviewedDoseWeek(input)).toMatchObject({ kind: 'review_required', reasons: ['Dated factual source must precede the trial'] })
  })
  it('preserves historical unknowns, reviewed preparation, conditional timing and the exact trial', () => {
    const input = c2rReconciliationInput(), before = structuredClone(input)
    expect(doseContentHash(input.base)).toBe('cdbd6c67c8745567335a768a43a0651d9eaeb271683e2b59cf412fdb35cc6b55')
    expect(doseContentHash(input.target)).toBe('a3a7610d195c26bb5414ddd190dda1f193ee61bd3e82ba8994b839d8bdff57f2')
    const result = reconcileReviewedDoseWeek(input)
    expect(result.kind).toBe('reconciled')
    if (result.kind !== 'reconciled') throw new Error(result.reasons.join('; '))
    expect(input).toEqual(before)
    expect(result.receipt.option.before.targetRpe).toBeNull()
    expect(result.receipt.summary.historical).toContain('prior prescribed RPE unknown')
    expect(result.receipt.summary.base).toContain('165 lb total')
    expect(result.receipt.summary.proposed).toContain('170 lb total')
    expect(result.receipt.summary.observedSets).toHaveLength(3)
    expect(result.receipt.conditionalTiming).toBe(true)
    expect(input.target.scheduledSessions.map(slot => slot.prescription.estimatedSeconds)).toEqual([2601, 2955, 3122])
    expect(readReviewedDoseWeekSummary(result.receipt, input)).toEqual(result.receipt.summary)
  })
  it.each(['owner', 'context', 'base', 'summary', 'facts'])('rejects altered saved %s receipt', change => {
    const input = c2rReconciliationInput(), result = reconcileReviewedDoseWeek(input)
    if (result.kind !== 'reconciled') throw new Error(result.reasons.join('; '))
    if (change === 'owner') result.receipt.owner = 'other'
    if (change === 'context') result.receipt.contextHash = 'b'.repeat(64)
    if (change === 'base') result.receipt.basePlanVersionId = 'other'
    if (change === 'summary') result.receipt.summary.historical = 'Invented history'
    if (change === 'facts') result.receipt.registration.compilation.input.facts!.pain = true
    expect(() => readReviewedDoseWeekSummary(result.receipt, input)).toThrow()
  })
  it.each(['load', 'units', 'per_side', 'preparation', 'order', 'equipment', 'protocol', 'surrounding', 'facts', 'source', 'review', 'hash'])('rejects %s drift without inventing a correction', change => {
    const input = c2rReconciliationInput(), registration = input.registration
    const activities = reviewedSessionActivities(input.target.scheduledSessions[0].prescription.content)
    const work = activities.find(activity => activity.id === 'bench-work')!
    if (change === 'load' && work.load.kind === 'external') work.load.value = 175
    if (change === 'units' && work.load.kind === 'external') work.load.unit = 'kg'
    if (change === 'per_side' && work.work.kind === 'repetitions') work.work.sides = 2
    if (change === 'preparation') activities[0].effort = { kind: 'rpe', min: 9, max: 9 }
    if (change === 'order') input.target.scheduledSessions[0].prescription.content.steps.reverse()
    if (change === 'equipment') registration.link.identity.requiredEquipment = ['bodyweight']
    if (change === 'protocol') registration.link.identity.protocolId = 'other-bench'
    if (change === 'surrounding') activities.find(activity => activity.id === 'row')!.sets = 4
    if (change === 'facts') registration.compilation.input.facts!.pain = true
    if (change === 'source') registration.compilation.input.currentSources[0].revision++
    if (change === 'review') registration.link.review = structuredClone(registration.compilation.registry[0].option.review)
    // Rebind transport hashes so semantic guards, not merely old hashes, must reject.
    registration.link.targetPlanHash = doseContentHash(input.target)
    registration.linkHash = change === 'hash' ? 'b'.repeat(64) : doseContentHash(registration.link)
    expect(reconcileReviewedDoseWeek(input).kind).toBe('review_required')
  })
})
