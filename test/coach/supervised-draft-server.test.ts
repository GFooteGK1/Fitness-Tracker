import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedDraftReader } from '@/app/lib/coach/supervised-draft-server'
import { readSupervisedProgramWorkspace } from '@/app/lib/coach/supervised-workspace-reader'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
vi.mock('@/app/lib/coach/supervised-workspace-reader', () => ({ readSupervisedProgramWorkspace: vi.fn() }))
const read = vi.mocked(readSupervisedProgramWorkspace)
const [owner, programId, baseId, enrollmentId, reviewer] = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
const request = { expectedUserId: owner, programId, transition: 'next_week' }
function setup() {
  const scope = { role: 'athlete', athleteId: owner, acceptedBaseId: baseId,
    latestEnrollment: { enrollmentId, enabled: true, expiresAt: new Date(Date.now() + 3600000).toISOString(), operations: ['same_week', 'next_week'] } }
  read.mockImplementation(async () => ({ kind: 'workspace', page: { program: structuredClone(scope) } }) as never)
  const row = { id: baseId, user_id: owner, program_id: programId, status: 'accepted', intent: reviewedRollingWeek().intent }
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: row, error: null })) }
  const auth = vi.fn(async () => ({ data: { user: { id: owner } }, error: null }))
  const from = vi.fn(() => query), db = { from, auth: { getUser: auth } } as unknown as SupabaseClient
  const state = { enabled: true }, seed = createSupervisedDraftReader({ enabled: () => state.enabled })
  return { seed, db, state, scope, row, query, auth, from }
}
beforeEach(() => vi.clearAllMocks())
describe('owned supervised draft reader', () => {
  it('reads the exact owned accepted base and returns unapproved work only', async () => {
    const h = setup(), result = await h.seed(h.db, request)
    expect(result).toMatchObject({ kind: 'draft', userId: owner, programId, basePlanVersionId: baseId, enrollmentId,
      seed: { transition: 'next_week', windowStart: '2026-08-10' } })
    expect(h.query.eq.mock.calls).toEqual([['id', baseId], ['user_id', owner], ['program_id', programId]])
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('does not expose owner source to an assigned reviewer', async () => {
    const h = setup(); h.scope.role = 'reviewer'; h.scope.athleteId = reviewer
    expect(await h.seed(h.db, request)).toEqual({ kind: 'unavailable' })
    expect(h.from).not.toHaveBeenCalled()
  })
  it.each(['disabled', 'expired', 'unsupported'])('requires live enrollment for %s', async kind => {
    const h = setup()
    if (kind === 'disabled') h.scope.latestEnrollment.enabled = false
    if (kind === 'expired') h.scope.latestEnrollment.expiresAt = '2020-01-01T00:00:00Z'
    if (kind === 'unsupported') h.scope.latestEnrollment.operations = ['same_week']
    expect(await h.seed(h.db, request)).toMatchObject({ kind: 'review_required' })
    expect(h.from).not.toHaveBeenCalled()
  })
  it('withholds a base superseded during its read', async () => {
    const h = setup()
    h.query.maybeSingle.mockImplementation(async () => { h.scope.acceptedBaseId = reviewer; return { data: h.row, error: null } })
    expect(await h.seed(h.db, request)).toMatchObject({ kind: 'review_required' })
  })
  it('withholds an account-switched response', async () => {
    const h = setup()
    h.query.maybeSingle.mockImplementation(async () => { h.auth.mockResolvedValue({ data: { user: { id: reviewer } }, error: null }); return { data: h.row, error: null } })
    expect(await h.seed(h.db, request)).toEqual({ kind: 'account_changed' })
  })
  it('does not read source while server policy is disabled', async () => {
    const h = setup(); h.state.enabled = false
    expect(await h.seed(h.db, request)).toEqual({ kind: 'disabled' }); expect(read).not.toHaveBeenCalled()
  })

  it('refuses unavailable draft readiness without fetching an archived or unanchored base', async () => {
    const h = setup(); h.scope.acceptedBaseId = null as never
    expect(await h.seed(h.db, request)).toMatchObject({ kind: 'review_required' })
    expect(h.from).not.toHaveBeenCalled()
  })
})
