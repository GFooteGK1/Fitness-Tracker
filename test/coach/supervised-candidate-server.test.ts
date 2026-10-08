import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { effortWorkInput } from '../fixtures/reviewed-effort-work'
import { seedSupervisedWeek } from '@/app/lib/coach/supervised-draft-editor'

vi.mock('@/app/lib/coach/reviewed-dose-context-server', () => ({ fetchReviewedDoseContext: vi.fn() }))
const fetchSource = vi.mocked(fetchReviewedDoseContext)
const athlete = '00000000-0000-4000-8000-000000000001', program = '00000000-0000-4000-8000-000000000002'
const baseId = '00000000-0000-4000-8000-000000000003', candidateId = '00000000-0000-4000-8000-000000000004'
const enrollmentId = '00000000-0000-4000-8000-000000000005'

function setup() {
  const base = reviewedRollingWeek(), proposed = effortWorkInput(), recipe = proposed.registry[0].recipe
  const source = {
    userId: athlete, asOf: new Date().toISOString(), contextHash: 'a'.repeat(64), profile: base.plan.profileSnapshot,
    binding: { userId: athlete, revision: 3, scope: { programId: program, basePlanVersionId: baseId,
      historyDays: 28, historyThrough: '2026-09-29', tzOffset: 300 }, memories: [], setup: [],
      base: { program: { id: program }, plan: { intent: base.intent } },
      executionSlots: base.plan.scheduledSessions.map((slot, i) => ({ userId: athlete, programId: program, planVersionId: baseId,
        sessionIndex: i + 1, scheduledDate: slot.scheduledDate, prescription: slot.prescription,
        executionSessionId: `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`,
        executionPlanVersionId: baseId, status: 'planned', completedWorkoutId: null, completionContractVersion: null, hasReports: false })) },
    performed: { records: [] }, limitations: ['Older history remains unknown'] }
  fetchSource.mockResolvedValue(source as unknown as Awaited<ReturnType<typeof fetchReviewedDoseContext>>)
  const auth = vi.fn(async () => ({ data: { user: { id: athlete } }, error: null }))
  const revision = { select: () => revision, eq: () => revision, limit: async () => ({ data: [{ user_id: athlete, revision: 3 }], error: null }) }
  const rpc = vi.fn()
  const db = { auth: { getUser: auth }, from: vi.fn(() => revision), rpc } as unknown as SupabaseClient
  const draft = { candidateId, enrollmentId, programId: program, basePlanVersionId: baseId,
    historyDays: 28, tzOffset: 300, transition: 'next_week' as const, windowStart: '2026-08-10', sequenceNumber: 2,
    recipe: { sessions: recipe.sessions, baseSchedule: recipe.baseSchedule, schedules: recipe.schedules,
      protocols: recipe.protocols, instructions: recipe.instructions, limitations: recipe.limitations },
    scheduleId: proposed.input.context.scheduleId, rationale: 'Proposed effort-led work for complete coach review.' }
  return { db, draft, source, rpc, auth }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-29T20:00:00Z')); vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('supervised candidate server preparation', () => {
  it('recompiles an editable seed of the actual accepted week without dropping content or protocols', async () => {
    const h = setup(), base = reviewedRollingWeek().plan, seed = seedSupervisedWeek(base, 'next_week')!
    const prepared = await prepareSupervisedCandidate(h.db, { ...h.draft, ...seed })
    expect(prepared.kind).toBe('prepared_candidate')
    if (prepared.kind !== 'prepared_candidate') return
    expect(prepared.reviewPacket.week.scheduledSessions.map(s => s.prescription.content)).toEqual(base.scheduledSessions.map(s => s.prescription.content))
    expect(prepared.reviewPacket.week.scheduledSessions.flatMap(s => s.prescription.protocols)).toEqual(base.scheduledSessions.flatMap(s => s.prescription.protocols))
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('compiles full proposed work against owned source without registering or approving it', async () => {
    const h = setup(), result = await prepareSupervisedCandidate(h.db, h.draft)
    expect(result.kind).toBe('prepared_candidate')
    if (result.kind !== 'prepared_candidate') return
    expect(result.numericRuntimeEligible).toBe(false)
    expect(result.privatePacket.userId).toBe(athlete)
    expect(result.privatePacket.inputSnapshot.supervisedCandidateDraft).toEqual(h.draft)
    expect(result.privatePacket.inputSnapshot.supervisedCandidateDraft).not.toBe(h.draft)
    expect(result.reviewPacket).not.toHaveProperty('supervisedCandidateDraft')
    expect(result.privatePacket.source.contextHash).toBe(h.source.contextHash)
    expect(result.reviewPacket.week.scheduledSessions[0].prescription.schemaVersion).toBe(3)
    expect(result.reviewPacket.baseWeek).toEqual(reviewedRollingWeek().plan)
    expect(result.reviewPacket.evidenceSource).toMatchObject({ sourceHash: h.source.contextHash, revision: 3 })
    expect(result.reviewPacket.limitations).toContain('Unapproved proposed work; no programming authority or athlete acceptance.')
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it.each(['userId', 'reviewerId', 'contextHash', 'approved', 'privatePacket'])('refuses caller authority field %s before source reads', async field => {
    const h = setup()
    expect(await prepareSupervisedCandidate(h.db, { ...h.draft, [field]: athlete })).toEqual({ kind: 'invalid_request' })
    expect(fetchSource).not.toHaveBeenCalled()
  })

  it('does not accept recipe-level review claims', async () => {
    const h = setup()
    expect(await prepareSupervisedCandidate(h.db, { ...h.draft, recipe: { ...h.draft.recipe, review: { id: 'forged' } } }))
      .toEqual({ kind: 'invalid_request' })
  })

  it('refuses stale source instead of rebinding the candidate', async () => {
    const h = setup()
    fetchSource.mockResolvedValueOnce(h.source as never).mockResolvedValue({ ...h.source, contextHash: 'b'.repeat(64) } as never)
    expect(await prepareSupervisedCandidate(h.db, h.draft)).toMatchObject({ kind: 'review_required' })
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('does not invent an accepted base or reconcile a nonadjacent week', async () => {
    const h = setup()
    expect(await prepareSupervisedCandidate(h.db, { ...h.draft, windowStart: '2026-08-17' })).toMatchObject({ kind: 'review_required' })
    h.source.binding.base.plan.intent = {} as never
    expect(await prepareSupervisedCandidate(h.db, h.draft)).toMatchObject({ kind: 'review_required' })
  })

  it('does not broaden available equipment to make proposed work compile', async () => {
    const h = setup()
    h.source.profile.equipment.resolvedIds = ['bodyweight']
    expect(await prepareSupervisedCandidate(h.db, h.draft)).toMatchObject({ kind: 'review_required' })
  })

  it('does not conceal excess performed evidence behind a truncated review packet', async () => {
    const h = setup()
    h.source.performed.records = Array.from({ length: 65 }, () => ({})) as never
    expect(await prepareSupervisedCandidate(h.db, h.draft)).toMatchObject({ kind: 'review_required',
      reasons: [expect.stringContaining('not silently truncated')] })
  })

  it('explicitly accounts for removed accepted work in a proposed complete week', async () => {
    const h = setup(), removed = h.draft.recipe.sessions.pop()!
    h.draft.recipe.protocols = h.draft.recipe.protocols.filter(p => p.sessionId !== removed.id)
    for (const schedule of [h.draft.recipe.baseSchedule, ...h.draft.recipe.schedules.map(s => s.days)]) {
      for (const day of Object.keys(schedule) as Array<keyof typeof schedule>) if (schedule[day] === removed.id) schedule[day] = null
    }
    const result = await prepareSupervisedCandidate(h.db, h.draft)
    expect(result.kind).toBe('prepared_candidate')
    if (result.kind !== 'prepared_candidate') return
    expect(result.reviewPacket.changes).toContainEqual({ kind: 'removed', sessionIds: [removed.id],
      summary: expect.stringContaining('removed from proposed week') })
    expect(result.reviewPacket.reviewMode).toBe('manual_complete_week')
  })

  it('keeps structured actual RIR independent and excludes raw session narratives', async () => {
    const h = setup()
    h.source.performed.records = [{ sourceId: 'performed-1', date: '2026-09-28', movementId: 'barbell_back_squat',
      role: 'working', basis: 'reported', completionState: 'not_independently_verified', quantities: { sets: 1, repetitions: 24 },
      effort: { value: 7, scope: 'set' }, equipment: { handle: 'high' }, protocol: { id: 'changed-setup' },
      unilateralConvention: 'per_side', setEvidence: { rir: 0, note: 'PRIVATE NARRATIVE', restAfterSeconds: 180,
        stopped: true, symptoms: 'Hamstring tightness', velocity: { method: 'mean_concentric', device: 'reported-device' } },
      sessionEffort: { value: null, status: 'unknown' }, limitations: ['Comparable setup unconfirmed'] }] as never
    const result = await prepareSupervisedCandidate(h.db, h.draft)
    expect(result.kind).toBe('prepared_candidate')
    if (result.kind !== 'prepared_candidate') return
    const summary = JSON.parse(result.reviewPacket.evidence[0].summary)
    expect(summary.setEvidence.rir).toBe(0); expect(summary.effort.value).toBe(7)
    expect(summary.setEvidence).toMatchObject({ stopped: true, symptoms: 'Hamstring tightness', restAfterSeconds: 180,
      hasAdditionalNote: true, velocity: { method: 'mean_concentric' } })
    expect(summary).toMatchObject({ equipment: { handle: 'high' }, protocol: { id: 'changed-setup' }, unilateralConvention: 'per_side' })
    expect(JSON.stringify(result.reviewPacket)).not.toContain('PRIVATE NARRATIVE')
    expect(JSON.stringify(result.reviewPacket)).not.toContain('memories')
  })
})
