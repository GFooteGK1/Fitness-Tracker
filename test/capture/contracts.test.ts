import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizedCoachOccurrences } from '@/app/lib/capture/intent'
import { captureProvenance, correctedProvenance } from '@/app/lib/capture/contracts'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { commitCaptureBundle, freezeCapture } from '@/app/lib/capture/service'
import { loggingContext, saveActivity } from '@/app/lib/logging/server'
import { executeToolCall } from '@/app/lib/agents/tools/executor'

afterEach(() => vi.unstubAllEnvs())
const meal = { meal_timestamp: '2026-09-17T12:00:00Z', items: [{ food: 'Egg', portion: '1', protein: 6, carbs: 0, fat: 5, calories: 69 }] }

describe('capture authority and source semantics', () => {
  it('freezes distinct intended occurrences even when both meals are identical', () => {
    const sources = authorizedCoachOccurrences('Log breakfast: one egg; log breakfast: one egg; log workout: squats')
    expect(sources.map(item => item.kind)).toEqual(['meal','meal','workout'])
    expect(new Set(sources.map(item => item.sourceItemId)).size).toBe(3)
    for (const question of ['How should I log my meal?', 'Preview my workout', "Do not log this meal", 'I might log my workout']) expect(authorizedCoachOccurrences(question)).toEqual([])
  })
  it('keeps corrected estimates estimated and occurrence separate from quantity review', () => {
    const original = captureProvenance('meal')
    const corrected = correctedProvenance(original, ['macros'], 'athlete-correction')
    expect(corrected.fields.macros).toMatchObject({ origin: 'model_estimated', reviewState: 'corrected' })
    expect(original.fields.macros.reviewState).toBe('unreviewed')
    expect(original.occurrence.reviewState).toBe('athlete_confirmed')
  })
  it('recomputes meal totals and rejects missing amounts without zero filling', () => {
    expect(normalizeActivity('meal', { ...meal, total_protein: 900, user_id: 'forged' }).record).toMatchObject({ total_protein: 6, total_calories: 69 })
    expect(normalizeActivity('meal', meal).record).not.toHaveProperty('user_id')
    expect(() => normalizeActivity('meal', { ...meal, items: [{ food: 'Egg', portion: '1' }] })).toThrow('Review the food')
  })
  it('does not turn a prescribed range, missing unit, or fractional effort into an exact legacy projection', () => {
    const normalized = normalizeActivity('workout', { workout_date: '2026-09-17', rpe: 7.5, blocks: [
      { block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: { min: 5, max: 8 }, weight: '100' }] }] })
    expect(normalized.record).toMatchObject({ rpe: null, reported_rpe: 7.5 })
    expect(normalized.blocks[0]).toMatchObject({ total_reps: null, tonnage_lb: null, is_pr: false })
  })
  it('does not let a model tool grant its own logging or memory authority', async () => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    const rpc = vi.fn()
    await loggingContext.run({ id: 'request', captureCollector: { operations: [], authorizedSources: new Map() } }, async () => {
      expect((await executeToolCall('log_meal', { source_item_id: 'invented' }, 'owner', { rpc } as never)).success).toBe(false)
      expect((await executeToolCall('confirm_coach_memory', { confirmed: true }, 'owner', { rpc } as never)).success).toBe(false)
    })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('collects repeated tool outputs once before any persistence, and rejects changed content for that occurrence', async () => {
    vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED', 'true')
    const collector = { operations: [] as any[], authorizedSources: new Map([['source:0', 'meal' as const]]) }
    const rpc = vi.fn()
    await loggingContext.run({ id: 'request', captureCollector: collector }, async () => {
      await saveActivity({ rpc } as never, 'meal', meal)
      await saveActivity({ rpc } as never, 'meal', meal)
      expect(collector.operations).toHaveLength(1)
      await expect(saveActivity({ rpc } as never, 'meal', { ...meal, meal_timestamp: '2026-09-18T12:00:00Z' })).rejects.toThrow('Conflicting')
    })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('returns explicit partial success without replaying an already committed child', async () => {
    const receipt = { schemaVersion: 2, entityId: 'workout', state: 'saved' }
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: 'transport' } })
    const result = await commitCaptureBundle({ rpc } as never, 'request', [
      { id: 'one', kind: 'workout', source_item_id: 'source:0', status: 'committed', receipt: receipt as never },
      { id: 'two', kind: 'meal', source_item_id: 'source:1', status: 'pending', receipt: null },
    ])
    expect(result.receipts).toEqual([receipt]); expect(result.state).toBe('save_unconfirmed')
    expect(result.unresolved).toHaveLength(1)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('commit_logging_request_item', { p_item_id: 'two' })
  })
  it('rejects duplicate source identities before freezing', async () => {
    const op = { sourceItemId: 'same', kind: 'meal', ...normalizeActivity('meal', meal), provenance: captureProvenance('meal'), inputMethod: 'text', eventAt: meal.meal_timestamp }
    const rpc = vi.fn()
    await expect(freezeCapture({ rpc } as never, 'request', [op, op] as never)).rejects.toThrow('distinct')
    expect(rpc).not.toHaveBeenCalled()
  })
})
