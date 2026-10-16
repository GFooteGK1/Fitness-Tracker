import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { prepareSupervisedCandidate } from '@/app/lib/coach/supervised-candidate-server'
import type { SupervisedPending } from '@/app/lib/coach/supervised-pending'
import { performSupervisedPending, saveSupervisedPending, readSupervisedPending } from '@/app/lib/coach/supervised-pending'
import { resolveSupervisedRequest } from '@/app/lib/coach/supervised-request-resolution-server'

describe('durable supervised request resolution', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  const { owner, reviewer, foreign, program } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture()
    await f.db.exec(sqlFile('supabase/migrations/20261003134727_supervised_request_resolution.sql'))
    await f.db.exec(sqlFile('supabase/migrations/20261003150403_supervised_issue_closure_preflight.sql'))
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN'); await f.actor(); await f.scalar('SELECT get_coach_context_revision() AS value') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  const request = (operation: SupervisedPending['operation'], body: unknown, actor = owner) => ({ schemaVersion: 1, userId: actor, programId: program, operation, body })
  async function resolve(q: unknown, close = true) {
    return f.scalar<any>(`SELECT ${close ? 'resolve_supervised_request' : 'get_supervised_request_resolution'}($1) AS value`, [JSON.stringify(q)])
  }
  async function rejected(call: () => Promise<unknown>, code: string) {
    await f.db.exec('SAVEPOINT expected_rejection')
    try { await expect(call()).rejects.toMatchObject({ code }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
  }
  async function prepared() {
    const e = await f.enrollment(); await f.anchor()
    const draft = await f.draft(e)
    const p = await prepareSupervisedCandidate(sourceClient(f.db, owner), draft)
    if (p.kind !== 'prepared_candidate') throw new Error(JSON.stringify(p))
    return { draft, p }
  }
  async function submit(h: Awaited<ReturnType<typeof prepared>>) {
    await f.actor(owner, 'service_role')
    return f.scalar<any>('SELECT submit_supervised_candidate($1,$2,$3,$4) AS value', [h.draft.candidateId, h.draft.enrollmentId,
      JSON.stringify(h.p.privatePacket), JSON.stringify(h.p.reviewPacket)])
  }
  function decision(c: any) { return { expectedUserId: reviewer, candidateId: c.candidateId, requestId: randomUUID(), decision: 'approve',
    enrollmentId: c.enrollmentId, contentHash: c.contentHash, sourceHash: c.sourceHash } }
  async function decide(q: ReturnType<typeof decision>) {
    await f.actor(reviewer)
    return f.scalar('SELECT decide_supervised_candidate($1,$2,$3,$4,$5,$6) AS value', [q.candidateId,q.requestId,q.decision,q.contentHash,q.sourceHash,q.enrollmentId])
  }
  it('read-only absence preserves identity; closure fences a delayed original submission', async () => {
    const h = await prepared(), q = request('submit', { expectedUserId: owner, draft: h.draft })
    await f.actor()
    expect((await resolve(q, false)).disposition).toBe('not_found')
    const closed = await resolve(q)
    expect(closed.disposition).toBe('no_write')
    expect(await resolve(q, false)).toEqual(closed)
    await rejected(() => submit(h), '55000')
    await f.actor(); expect(await resolve(q)).toEqual(closed)
    const changed = structuredClone(q); (changed.body as any).draft.rationale = 'Changed'
    await rejected(() => resolve(changed), '22023')
  })
  it('saved submission wins after revocation and compares the entire original draft', async () => {
    const h = await prepared(); await submit(h); await f.enrollment(false)
    const q = request('submit', { expectedUserId: owner, draft: h.draft }); await f.actor()
    const saved = await resolve(q)
    expect(saved.disposition).toBe('saved'); expect(saved.result.candidate.candidateId).toBe(h.draft.candidateId)
    const changed = structuredClone(q); (changed.body as any).draft.rationale = 'Changed'
    await rejected(() => resolve(changed), '22023')
  })
  it('closed decision remains readable after revocation and blocks a delayed decision', async () => {
    const h = await prepared(), c = await submit(h), body = decision(c), q = request('decide', body, reviewer)
    await f.enrollment(false); await f.actor(reviewer)
    const closed = await resolve(q); expect(closed.disposition).toBe('no_write')
    expect(await resolve(q, false)).toEqual(closed)
    await rejected(() => decide(body), '55000')
    const changed = { ...q, body: { ...body, decision: 'reject' } }
    await rejected(() => resolve(changed), '22023')
  })
  it('saved decision wins after revocation without disclosing candidate source', async () => {
    const h = await prepared(), c = await submit(h), body = decision(c), q = request('decide', body, reviewer)
    await decide(body); await f.enrollment(false); await f.actor(reviewer)
    const saved = await resolve(q)
    expect(saved.disposition).toBe('saved'); expect(saved.result.receipt.requestId).toBe(body.requestId)
    expect(saved.result).not.toHaveProperty('privatePacket')
    await rejected(() => resolve({ ...q, body: { ...body, decision: 'reject' } }), '22023')
  })
  it('issue closure fences later registration as well as issuance under any key', async () => {
    const e = await f.enrollment(); await f.anchor(); const c = await f.prepare(e)
    const q = request('issue', { expectedUserId: owner, programId: program, candidateId: c.candidateId, requestId: randomUUID() })
    await f.actor(); const closed = await resolve(q)
    expect(closed.disposition).toBe('no_write'); expect(await resolve(q,false)).toEqual(closed)
    await rejected(() => f.register(c), '55000')
  })
  it('registered unsaved issuance closes durably; saved issuance wins after revocation', async () => {
    const e = await f.enrollment(); await f.anchor(); const c = await f.prepare(e); await f.register(c)
    const body = { expectedUserId: owner, programId: program, candidateId: c.candidateId, requestId: randomUUID() }
    await f.actor(); expect((await resolve(request('issue',body))).disposition).toBe('no_write')
    await rejected(() => f.issue(c,body.requestId), '55000')
    await rejected(() => f.issue(c,randomUUID()), '55000')
  })
  it('saved issued proposal survives disablement and returns exact identity', async () => {
    const e = await f.enrollment(); await f.anchor(); const c = await f.prepare(e); await f.register(c); const issued = await f.issue(c)
    await f.enrollment(false); await f.actor()
    const q = request('issue', { expectedUserId: owner, programId: program, candidateId: c.candidateId, requestId: issued.key })
    const saved = await resolve(q)
    expect(saved.disposition).toBe('saved'); expect(saved.result.proposalId).toBe(issued.proposalId)
    expect((await resolve(q,false)).result).toEqual({ kind:'issued',request:q.body,proposalId:issued.proposalId,
      planVersionId:issued.planVersionId,programId:program,replayed:true })
    const data = new Map<string,string>(), store = { getItem:(key: string) => data.get(key) ?? null,
      setItem:(key: string,value: string) => { data.set(key,value) },removeItem:(key: string) => { data.delete(key) } }
    const pending = saveSupervisedPending(store,q as SupervisedPending)
    const result = await performSupervisedPending(store,pending,() => owner,'resolution',async () =>
      Response.json(await resolveSupervisedRequest(sourceClient(f.db,owner),pending,false)))
    expect(result.disposition).toBe('saved');expect(readSupervisedPending(store,owner,program)).toBeNull()
  })
  it('rejects a closed issuance before an unrelated pending week can mask its closure',async()=>{
    const e=await f.enrollment();await f.anchor()
    const pending=await f.prepare(e);await f.register(pending);await f.issue(pending)
    const closed=await f.prepare(e);await f.register(closed)
    const body={expectedUserId:owner,programId:program,candidateId:closed.candidateId,requestId:randomUUID()}
    await f.actor();expect((await resolve(request('issue',body))).disposition).toBe('no_write')
    // Without the early fence this hits the pending-window unique index23505
    // before the closed-proposal INSERT trigger can return the intended55000.
    await rejected(()=>f.issue(closed,body.requestId),'55000')
    await rejected(()=>f.issue(closed,randomUUID()),'55000')
    expect(await f.scalar('SELECT count(*) AS value FROM training_plan_versions WHERE status=\'proposed\'')).toBe(1)
    expect(await f.scalar('SELECT count(*) AS value FROM adaptation_proposals')).toBe(1)
    await f.actor();expect((await resolve(request('issue',body),false)).disposition).toBe('no_write')
  })
  it('denies foreign actors, mismatched programs and direct table writes', async () => {
    const h = await prepared(), q = request('submit', { expectedUserId: owner, draft: h.draft })
    await f.actor(foreign)
    await rejected(() => resolve(q), '22023')
    await rejected(() => resolve({ ...q, userId: foreign, body: { expectedUserId: foreign, draft: h.draft } }), 'P0002')
    await f.actor()
    await rejected(() => f.scalar('SELECT count(*) AS value FROM coach_supervised_request_resolutions'), '42501')
    await rejected(() => resolve({ ...q, programId: randomUUID() }), 'P0002')
  })
  it('a closure getter is read-only and recovery works while coaching writes are paused', async () => {
    const h = await prepared(), q = request('submit', { expectedUserId:owner,draft:h.draft })
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true WHERE singleton')
    await f.actor(); const closed = await resolve(q)
    expect(closed.disposition).toBe('no_write')
    await f.db.exec('SET TRANSACTION READ ONLY')
    expect(await resolve(q,false)).toEqual(closed)
  })
  it('authenticated callers cannot invoke the renamed decision writer or private helper', async () => {
    const h = await prepared(), c = await submit(h), body = decision(c); await f.actor(reviewer)
    await rejected(() => f.scalar('SELECT decide_supervised_candidate_before_resolution($1,$2,$3,$4,$5,$6) AS value',
      [body.candidateId,body.requestId,body.decision,body.contentHash,body.sourceHash,body.enrollmentId]),'42501')
    await rejected(() => f.scalar('SELECT supervised_request_resolution_result($1,true) AS value',[JSON.stringify(request('decide',body,reviewer))]),'42501')
  })
  it('privileged alternate candidate insert cannot bypass the submit fence', async () => {
    const h = await prepared(), q = request('submit',{ expectedUserId:owner,draft:h.draft })
    await f.actor();await resolve(q);await f.db.exec('RESET ROLE')
    await rejected(() => f.scalar(`INSERT INTO coach_supervised_candidates(id,enrollment_id,user_id,program_id,base_plan_version_id,
      private_packet,review_packet,content_hash,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id AS value`,
    [h.draft.candidateId,h.draft.enrollmentId,owner,program,h.draft.basePlanVersionId,JSON.stringify(h.p.privatePacket),JSON.stringify(h.p.reviewPacket),'a'.repeat(64),'b'.repeat(64)]),'55000')
  })
  it('decision closure during pause blocks alternate inserts and cannot be modified', async () => {
    const h = await prepared(), c = await submit(h), body = decision(c), q = request('decide',body,reviewer)
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=true WHERE singleton');await f.actor(reviewer)
    expect((await resolve(q)).disposition).toBe('no_write')
    await f.db.exec('RESET ROLE; UPDATE coaching_write_control SET paused=false WHERE singleton')
    await rejected(() => f.scalar(`INSERT INTO coach_supervised_decisions(candidate_id,request_id,reviewer_id,decision,enrollment_id,content_hash,source_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id AS value`,[body.candidateId,body.requestId,reviewer,body.decision,body.enrollmentId,body.contentHash,body.sourceHash]),'55000')
    await rejected(() => f.scalar("UPDATE coach_supervised_request_resolutions SET request='{}' RETURNING id AS value"),'55000')
  })
})
