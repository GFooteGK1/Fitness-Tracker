import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { resolveSupervisedResource } from '@/app/lib/coach/supervised-resource-access'

describe('exact supervised HTTP resource scope', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program, base } = lifecycleIds
  beforeAll(async () => { f = await supervisedLifecycleFixture(); await f.db.exec(sqlFile('supabase/migrations/20260930040000_supervised_resource_scope.sql')) }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN'); await f.actor(); await f.scalar('SELECT get_coach_context_revision() AS value') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  const resolve = (actor: string, kind: 'session' | 'program' | 'proposal', id: string) => resolveSupervisedResource(sourceClient(f.db, actor), actor, kind, id)
  it('classifies only owned permanent lineage and reveals no reviewer or foreign resource linkage', async () => {
    const session = await f.session()
    expect(await resolve(owner, 'program', program)).toEqual({ kind: 'not_supervised' })
    expect(await resolve(owner, 'session', session.id)).toEqual({ kind: 'not_supervised' })
    await f.enrollment(); await f.anchor()
    expect(await resolve(owner, 'session', session.id)).toMatchObject({ kind: 'supervised', scope: { resourceKind: 'session', resourceId: session.id, programId: program, planVersionId: base, userId: owner, currentEnrollmentActive: true } })
    for (const actor of [reviewer, foreign]) expect(await resolve(actor, 'session', session.id)).toEqual({ kind: 'not_supervised' })
    expect(await resolve(owner, 'session', randomUUID())).toEqual({ kind: 'not_supervised' })
  })
  it('preserves original proposal and session identity after supersession, revocation and pause', async () => {
    const enrollment = await f.enrollment(); await f.anchor()
    const first = await f.prepare(enrollment); await f.register(first); const proposal = await f.issue(first); await f.accept(proposal)
    const session = await f.session()
    const second = await f.prepare(enrollment, 'next_week'); await f.register(second); const next = await f.issue(second); await f.accept(next)
    await f.enrollment(false); await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true')
    expect(await resolve(owner, 'program', program)).toMatchObject({ kind: 'supervised', scope: { planVersionId: next.planVersionId } })
    expect(await resolve(owner, 'proposal', proposal.proposalId)).toMatchObject({ kind: 'supervised', scope: { planVersionId: proposal.planVersionId, currentEnrollmentActive: false } })
    expect(await resolve(owner, 'session', session.id)).toMatchObject({ kind: 'supervised', scope: { planVersionId: proposal.planVersionId } })
  })
  it('protects RPC ACL and rejects unknown kinds', async () => {
    const owned = sourceClient(f.db, owner), service = sourceClient(f.db, owner, 'service_role')
    expect((await owned.rpc('get_supervised_resource_scope', { p_kind: 'profile', p_id: program })).error).toMatchObject({ code: '22023' })
    expect((await service.rpc('get_supervised_resource_scope', { p_kind: 'program', p_id: program })).error).toMatchObject({ code: '42501' })
    await f.db.exec('RESET ROLE')
    expect(await f.scalar("SELECT has_function_privilege('anon','get_supervised_resource_scope(text,uuid)','EXECUTE') AS value")).toBe(false)
  })
})
