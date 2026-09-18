import { describe, expect, it } from 'vitest'
import { validateSessionSignal, signalRequiresActualWork, summarizeSignalWork, type SessionSignalInput } from '@/app/lib/coach/session-signals'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

const prescription = buildCompleteEightWeekPlan(GOLDEN_PROGRAMMING_PROFILES[0].profile).weeks[0].sessions[0]
const signal: SessionSignalInput = { schemaVersion: 1, exerciseId: `${prescription.blocks[0].id}:0`, ratingScope: 'hardest_set', workStatus: 'unsure' }

describe('data-only exercise feedback', () => {
  it('keeps missing values unknown and hardest-set effort separate from actual work', () => {
    expect(validateSessionSignal(signal)).toEqual({ ok: true, value: signal })
    const effort = { ...signal, rpe: 7.5, rpeScale: 'effort_0_10' as const }
    expect(signalRequiresActualWork(effort)).toBe(false)
    expect(validateSessionSignal(effort)).toEqual({ ok: true, value: effort })
  })
  it.each([
    { exerciseId: 'x'.repeat(201) }, { rpeScale: 'effort_0_10' }, { actualLoadUnit: 'lb' },
    { actualReps: 3.5 }, { actualLoad: 100 }, { requestedLoad: 110 }, { stop: 'false' },
    { rpe: 7.5 }, { completedWorkingSets: 101 }, { schemaVersion: 2 }
  ])('rejects invalid or unsupported fields %j', change => {
    expect(validateSessionSignal({ ...signal, ...change }).ok).toBe(false)
  })
  it('summarizes only reported scope and quantities without inventing other sets', () => {
    const report = { ...signal, rpe: 8, rpeScale: 'rir_based' as const, actualReps: 6, actualLoad: 80, actualLoadUnit: 'kg' as const }
    const summary = summarizeSignalWork([{ id: '1', prescribedSessionId: 'session', signal: report, createdAt: '2026-09-17T18:00:00Z', policyVersion: 'session-capture-1' }], prescription)
    expect(summary).toContain('Hardest set: 6 reps; Hardest set: 80 kg')
    expect(summary).not.toMatch(/work sets|RIR|Session RPE/)
    expect(signalRequiresActualWork(report)).toBe(true)
  })
})
