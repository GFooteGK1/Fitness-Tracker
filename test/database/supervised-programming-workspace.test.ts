import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { listSupervisedPrograms, readSupervisedProgramWorkspace } from '@/app/lib/coach/supervised-workspace-reader'

describe('supervised workspace scoped discovery SQL', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture()
    await f.db.exec(sqlFile('supabase/migrations/20260930030000_supervised_programming_workspace.sql'))
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN'); await f.actor(); await f.scalar('SELECT get_coach_context_revision() AS value') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  const list = (actor = owner, afterProgramId: string | null = null, limit = 20) => listSupervisedPrograms(sourceClient(f.db, actor), { expectedUserId: actor, afterProgramId, limit })
  const workspace = (actor = owner, afterCandidateId: string | null = null, limit = 20) => readSupervisedProgramWorkspace(sourceClient(f.db, actor), { expectedUserId: actor, programId: program, afterCandidateId, limit })
  async function ready() { const id = await f.enrollment(); await f.anchor(); return id }
  async function cloneProgram() {
    const id = randomUUID(), planId = randomUUID()
    await f.db.exec('RESET ROLE')
    await f.db.query(`INSERT INTO training_programs(id,user_id,title,goal_summary,start_date,end_date,status,program_mode)
      SELECT $1,user_id,'Second mechanical program',goal_summary,start_date,end_date,'draft',program_mode FROM training_programs WHERE id=$2`, [id, program])
    await f.db.query(`INSERT INTO training_plan_versions(id,program_id,user_id,version,status,accepted_at,reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot)
      SELECT $1,$2,user_id,1,'accepted',now(),reference_version,policy_version,plan_mode,window_start,window_end,sequence_number,intent,input_snapshot FROM training_plan_versions WHERE id=$3`, [planId, id, base])
    await f.db.query("UPDATE training_programs SET status='active',active_plan_version_id=$1 WHERE id=$2", [planId, id])
    await f.actor(owner, 'service_role')
    await f.scalar('SELECT version_supervised_enrollment($1,$2,$3,$4,0,true,$5,$6,$7) AS value',
      [randomUUID(), id, owner, reviewer, new Date(Date.now() + 3600000).toISOString(), '["same_week"]', 'local discovery fixture'])
    return id
  }
  it('returns exact owner/reviewer roles and scoped candidate decision/proposal navigation', async () => {
    const enrollment = await ready(), candidate = await f.prepare(enrollment)
    await f.register(candidate); const proposal = await f.issue(candidate); await f.accept(proposal)
    const own = await workspace(), assigned = await workspace(reviewer)
    expect(own).toMatchObject({ kind: 'workspace', page: { program: { role: 'athlete', athleteId: owner, acceptedBaseId: proposal.planVersionId },
      candidates: [{ candidateId: candidate.candidateId, enrollmentId: enrollment, reviewerId: reviewer, decision: 'approve',
        proposalId: proposal.proposalId, proposalStatus: 'accepted', planVersionId: proposal.planVersionId }] } })
    expect(assigned).toMatchObject({ kind: 'workspace', page: { program: { role: 'reviewer', acceptedBaseId: null }, candidates: [{ candidateId: candidate.candidateId }] } })
    expect(await list(foreign)).toMatchObject({ kind: 'programs', page: { programs: [], nextAfterProgramId: null } })
    expect(await workspace(foreign)).toEqual({ kind: 'not_found' })
    // The real reader's recursive exact schema rejects accidental projection of
    // source bindings, private recipes, profiles, or review packet contents.
    expect(JSON.stringify(assigned)).not.toMatch(/privatePacket|reviewPacket|inputSnapshot|contentHash|sourceHash|operator_ref/)
  })
  it('preserves owner history during revoke and pause without disclosing reviewer assignments', async () => {
    const enrollment = await ready(), candidate = await f.prepare(enrollment)
    await f.db.exec('RESET ROLE')
    const requestId = await f.scalar<string>('SELECT request_id AS value FROM coach_supervised_decisions WHERE candidate_id=$1', [candidate.candidateId])
    await f.enrollment(false)
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    expect(await workspace()).toMatchObject({ kind: 'workspace', page: { program: { latestEnrollment: { enabled: false, version: 2 } }, candidates: [{ candidateId: candidate.candidateId }] } })
    expect(await list(reviewer)).toMatchObject({ kind: 'programs', page: { programs: [] } })
    expect(await workspace(reviewer)).toEqual({ kind: 'not_found' })
    const saved = await sourceClient(f.db, reviewer).rpc('get_supervised_decision_receipt', { p_request_id: requestId })
    expect(saved.error).toBeNull(); expect(saved.data).toMatchObject({ candidateId: candidate.candidateId, replayed: true })
  })
  it('offers an editable base only for an active explicitly anchored program while retaining history', async () => {
    await f.enrollment()
    expect(await workspace()).toMatchObject({ kind: 'workspace', page: { program: { acceptedBaseId: null } } })
    await f.anchor()
    expect(await workspace()).toMatchObject({ kind: 'workspace', page: { program: { acceptedBaseId: base } } })
    await f.db.exec('RESET ROLE')
    await f.db.query("UPDATE training_programs SET status='archived' WHERE id=$1", [program])
    expect(await workspace()).toMatchObject({ kind: 'workspace', page: { program: { programId: program, acceptedBaseId: null } } })
    expect(await list()).toMatchObject({ kind: 'programs', page: { programs: [{ programId: program, acceptedBaseId: null }] } })
  })
  it('removes replaced reviewers and only shows the new reviewer candidates from their current enrollment', async () => {
    const old = await ready(), first = await f.prepare(old)
    const current = await f.enrollment(true, foreign), second = await f.prepare(current, 'same_week', false)
    expect(await list(reviewer)).toMatchObject({ kind: 'programs', page: { programs: [] } })
    expect(await workspace(reviewer)).toEqual({ kind: 'not_found' })
    const assigned = await workspace(foreign), own = await workspace()
    expect(assigned).toMatchObject({ kind: 'workspace', page: { candidates: [{ candidateId: second.candidateId, reviewerId: foreign, decision: 'pending' }] } })
    if (own.kind !== 'workspace') throw Error(JSON.stringify(own))
    expect(own.page.candidates.map(c => c.candidateId).sort()).toEqual([first.candidateId, second.candidateId].sort())
    expect(await workspace(foreign, first.candidateId)).toEqual({ kind: 'unavailable' })
  })
  it('hides expired reviewer metadata but keeps owner enrollment status', async () => {
    await ready()
    await f.enrollment(true, reviewer, new Date(Date.now() + 200).toISOString())
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(await list(reviewer)).toMatchObject({ kind: 'programs', page: { programs: [] } })
    expect(await workspace(reviewer)).toEqual({ kind: 'not_found' })
    expect(await list()).toMatchObject({ kind: 'programs', page: { programs: [{ latestEnrollment: { version: 2, enabled: true } }] } })
  })
  it('paginates program and candidate UUIDs without truncation, duplicates, or cross-scope cursors', async () => {
    const enrollment = await ready(), secondProgram = await cloneProgram()
    const first = await list(owner, null, 1)
    if (first.kind !== 'programs') throw Error(JSON.stringify(first))
    expect(first.page.nextAfterProgramId).toBe(first.page.programs[0].programId)
    const last = await list(owner, first.page.nextAfterProgramId, 1)
    if (last.kind !== 'programs') throw Error(JSON.stringify(last))
    expect(last.page.nextAfterProgramId).toBeNull()
    expect([...first.page.programs, ...last.page.programs].map(p => p.programId)).toEqual([program, secondProgram].sort())
    const candidates = [await f.prepare(enrollment, 'same_week', false), await f.prepare(enrollment, 'same_week', false)]
    const one = await workspace(owner, null, 1)
    if (one.kind !== 'workspace') throw Error(JSON.stringify(one))
    const two = await workspace(owner, one.page.nextAfterCandidateId, 1)
    if (two.kind !== 'workspace') throw Error(JSON.stringify(two))
    expect(two.page.nextAfterCandidateId).toBeNull()
    expect([...one.page.candidates, ...two.page.candidates].map(c => c.candidateId)).toEqual(candidates.map(c => c.candidateId).sort())
    expect(await list(owner, randomUUID())).toEqual({ kind: 'unavailable' })
    expect(await workspace(owner, randomUUID())).toEqual({ kind: 'unavailable' })
    const client = sourceClient(f.db, owner)
    for (const limit of [0, 51, null]) expect((await client.rpc('list_supervised_programs', { p_limit: limit })).error).toMatchObject({ code: '22023' })
    const other = await readSupervisedProgramWorkspace(client, { expectedUserId: owner, programId: secondProgram, afterCandidateId: candidates[0].candidateId })
    expect(other).toEqual({ kind: 'unavailable' })
  })
  it('denies helper, anonymous and service-role execution without broad table grants', async () => {
    await ready()
    const client = sourceClient(f.db, owner), service = sourceClient(f.db, owner, 'service_role')
    expect((await client.rpc('supervised_workspace_program', { p_program_id: program, p_actor: foreign })).error).toMatchObject({ code: '42501' })
    expect((await service.rpc('list_supervised_programs', {})).error).toMatchObject({ code: '42501' })
    await f.db.exec('RESET ROLE')
    for (const name of ['list_supervised_programs(uuid,integer)', 'get_supervised_program_workspace(uuid,uuid,integer)']) {
      expect(await f.scalar('SELECT has_function_privilege($1,$2,$3) AS value', ['anon', name, 'EXECUTE'])).toBe(false)
    }
    expect(await f.scalar("SELECT has_table_privilege('authenticated','coach_supervised_candidates','SELECT') AS value")).toBe(false)
  })
})
