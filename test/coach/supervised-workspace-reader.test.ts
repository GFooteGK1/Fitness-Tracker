import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listSupervisedPrograms, readSupervisedProgramWorkspace, parseSupervisedProgramsPage, parseSupervisedProgramWorkspace,
  type SupervisedProgramsPage, type SupervisedProgramWorkspace } from '@/app/lib/coach/supervised-workspace-reader'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture() {
  const program = { programId: id(10), title: 'Mechanical week', athleteId: id(1), role: 'athlete' as const, acceptedBaseId: id(11),
    latestEnrollment: { enrollmentId: id(20), version: 2, reviewerId: id(2), enabled: true,
      expiresAt: '2099-01-01T00:00:00Z', operations: ['same_week' as const, 'next_week' as const] } }
  const page: SupervisedProgramsPage = { schemaVersion: 1, actorId: id(1), programs: [program], nextAfterProgramId: null }
  const workspace: SupervisedProgramWorkspace = { schemaVersion: 1, actorId: id(1), program, candidates: [{ candidateId: id(30),
    enrollmentId: id(20), enrollmentVersion: 2, reviewerId: id(2), transition: 'same_week', createdAt: '2026-09-29T20:00:00Z',
    decision: 'pending', proposalId: null, proposalStatus: null, planVersionId: null }], nextAfterCandidateId: null }
  return { page, workspace }
}
function client(data: unknown) {
  const state = { actor: id(1), error: false, accountChange: false }
  const rpc = vi.fn(async () => { if (state.accountChange) state.actor = id(3); return { data, error: state.error ? { code: '55000' } : null } })
  const db = { auth: { getUser: async () => ({ data: { user: { id: state.actor } }, error: null }) }, rpc } as unknown as SupabaseClient
  return { db, rpc, state }
}
describe('supervised workspace bounded reader', () => {
  it('reads a bounded list and scoped workspace through authenticated getters only', async () => {
    const f = fixture(), list = client(f.page), scoped = client(f.workspace)
    expect(await listSupervisedPrograms(list.db, { expectedUserId: id(1) })).toEqual({ kind: 'programs', page: f.page })
    expect(list.rpc).toHaveBeenCalledWith('list_supervised_programs', { p_after_program_id: null, p_limit: 20 })
    expect(await readSupervisedProgramWorkspace(scoped.db, { expectedUserId: id(1), programId: id(10), limit: 1 })).toEqual({ kind: 'workspace', page: f.workspace })
    expect(scoped.rpc).toHaveBeenCalledWith('get_supervised_program_workspace', { p_program_id: id(10), p_after_candidate_id: null, p_limit: 1 })
  })
  it('preserves disabled owner navigation without a write-enable switch', () => {
    const f = fixture(); f.page.programs[0].latestEnrollment.enabled = false
    expect(parseSupervisedProgramsPage(f.page, id(1))).toEqual(f.page)
  })
  it('accepts only reviewer projections without the private accepted base', () => {
    const f = fixture(); f.workspace.actorId = id(2); f.workspace.program.role = 'reviewer'; f.workspace.program.acceptedBaseId = null
    expect(parseSupervisedProgramWorkspace(f.workspace, id(2), id(10))).toEqual(f.workspace)
    f.workspace.program.acceptedBaseId = id(11)
    expect(parseSupervisedProgramWorkspace(f.workspace, id(2), id(10))).toBeNull()
  })
  it.each(['privatePacket', 'reviewPacket', 'profile', 'operator_ref'])('rejects extra projected field %s', key => {
    const f = fixture(); Object.assign(f.workspace.candidates[0], { [key]: {} })
    expect(parseSupervisedProgramWorkspace(f.workspace, id(1), id(10))).toBeNull()
    Object.assign(f.page.programs[0].latestEnrollment, { [key]: {} })
    expect(parseSupervisedProgramsPage(f.page, id(1))).toBeNull()
  })
  it('rejects wrong actor, program, original enrollment, and inconsistent proposal linkage', () => {
    const f = fixture()
    expect(parseSupervisedProgramsPage(f.page, id(3))).toBeNull()
    expect(parseSupervisedProgramWorkspace(f.workspace, id(1), id(99))).toBeNull()
    f.workspace.candidates[0].proposalId = id(40)
    expect(parseSupervisedProgramWorkspace(f.workspace, id(1), id(10))).toBeNull()
    f.workspace.candidates[0].proposalId = null
    f.workspace.actorId = id(2); f.workspace.program.role = 'reviewer'; f.workspace.program.acceptedBaseId = null
    f.workspace.candidates[0].enrollmentId = id(19); f.workspace.candidates[0].enrollmentVersion = 1
    expect(parseSupervisedProgramWorkspace(f.workspace, id(2), id(10))).toBeNull()
  })
  it('rejects overfull, duplicated, unordered, backwards and false-continuation pages', () => {
    const f = fixture()
    f.page.nextAfterProgramId = id(10)
    expect(parseSupervisedProgramsPage(f.page, id(1), null, 1)).toEqual(f.page)
    expect(parseSupervisedProgramsPage(f.page, id(1), null, 2)).toBeNull()
    expect(parseSupervisedProgramsPage(f.page, id(1), id(10), 1)).toBeNull()
    f.page.programs.push(structuredClone(f.page.programs[0]))
    expect(parseSupervisedProgramsPage(f.page, id(1), null, 1)).toBeNull()
    expect(parseSupervisedProgramsPage(f.page, id(1), null, 2)).toBeNull()
    f.page.programs[1].programId = id(9)
    expect(parseSupervisedProgramsPage(f.page, id(1), null, 2)).toBeNull()
  })
  it.each([0, 51, 1.5, null, '20'])('rejects invalid explicit limit %s before RPC', async limit => {
    const h = client(fixture().page)
    expect(await listSupervisedPrograms(h.db, { expectedUserId: id(1), limit })).toEqual({ kind: 'invalid_request' })
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('rejects malformed cursors and unrecognized input keys before RPC', async () => {
    const h = client(fixture().page)
    expect(await listSupervisedPrograms(h.db, { expectedUserId: id(1), afterProgramId: 'all' })).toEqual({ kind: 'invalid_request' })
    expect(await readSupervisedProgramWorkspace(h.db, { expectedUserId: id(1), programId: id(10), source: {} })).toEqual({ kind: 'invalid_request' })
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('checks auth again after the read and refuses error results', async () => {
    const h = client(fixture().page); h.state.accountChange = true
    expect(await listSupervisedPrograms(h.db, { expectedUserId: id(1) })).toEqual({ kind: 'account_changed' })
    h.state.accountChange = false; h.state.actor = id(1); h.state.error = true
    expect(await listSupervisedPrograms(h.db, { expectedUserId: id(1) })).toEqual({ kind: 'unavailable' })
  })
  it('distinguishes an unavailable response from a scoped not-found result', async () => {
    const h = client(null)
    expect(await listSupervisedPrograms(h.db, { expectedUserId: id(1) })).toEqual({ kind: 'unavailable' })
    expect(await readSupervisedProgramWorkspace(h.db, { expectedUserId: id(1), programId: id(10) })).toEqual({ kind: 'not_found' })
  })
})
