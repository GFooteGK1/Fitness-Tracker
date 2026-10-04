import { test } from 'node:test'
import assert from 'node:assert/strict'
import { originalProbe, safeNextResult, allowedNextPath, fixedNextBody, nextSnapshotSql, provenNextProbe } from './supervised-next-scope.mjs'
import { PGlite } from '@electric-sql/pglite'
const program = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222'
const candidate = '33333333-3333-4333-8333-333333333333', session = '44444444-4444-4444-8444-444444444444'
const entry = (path, body, result) => ({ name: 'browser_http', payload: { path, method: 'POST', body }, result: { status: 200, result } })
const source = { programId: program, users: [{ actor: 'athlete', id: owner }], journal: [
  entry('/api/coach/supervised/candidates', { expectedUserId: owner, draft: { exact: 'retained' } }, { candidate: { candidateId: candidate } }),
  entry('/api/coach/supervised/issue', { expectedUserId: owner, candidateId: candidate, requestId: 'original-key' }, { proposalId: candidate }),
  entry('/api/coach/reviewed/sessions/' + session + '/sets', { expectedUserId: owner, requestId: 'report-key', report: { repetitions: 9, rir: 1.5 } }, { setReport: { id: candidate } }),
  entry('/api/coach/reviewed/sessions/' + session + '/complete', { expectedUserId: owner, requestId: 'completion-key', completion: { occurredAt: '2026-08-10T17:12:00Z' } }, { result: { prescribed_session_id: session } }),
  entry('/api/coach/reviewed/proposals/' + candidate + '/accept', { expectedUserId: owner, requestId: 'accept-key' }, { accepted: { active_plan_version_id: program } }),
] }
test('recovery controls use read-only routes and preserve exact original envelopes', () => {
  const bytes = JSON.stringify(source)
  const submit = originalProbe(source, 'submit', owner)
  assert.equal(submit.path, '/api/coach/supervised/resolution')
  assert.deepEqual(submit.body.pending.body, source.journal[0].payload.body)
  for (const operation of ['accept', 'set', 'complete']) {
    const p = originalProbe(source, operation, owner)
    assert.equal(p.path, '/api/coach/supervised/recover')
    assert.equal(p.body.operation, operation)
  }
  const next = originalProbe(source, 'new_issue', owner, session)
  assert.notEqual(next.body.requestId, 'original-key')
  assert.equal(next.body.candidateId, candidate)
  assert.equal(JSON.stringify(source), bytes)
  assert.deepEqual(originalProbe(source, 'new_issue', owner, session), next)
  assert.equal(fixedNextBody(source, next.path, next.body, session), true)
  assert.equal(fixedNextBody(source, next.path, { ...next.body, candidateId: program }, session), false)
  assert.equal(fixedNextBody(source, next.path, { ...next.body, expectedUserId: program }, session), false)
  assert.equal(fixedNextBody(source, next.path, { ...next.body, requestId: 'alternate-key' }, session), false)
  assert.equal(fixedNextBody(source, submit.path, { ...submit.body, pending: { ...submit.body.pending, programId: candidate } }, session), false)
  assert.throws(() => originalProbe(source, 'resolve', owner), /Unknown fixed/)
})
test('scope rejects write, unrelated resource and route paths', () => {
  assert.equal(allowedNextPath(source, 'GET', '/api/coach/reviewed/sessions/' + session), true)
  assert.equal(allowedNextPath(source, 'GET', '/api/coach/supervised/programs/' + program), true)
  assert.equal(allowedNextPath(source, 'POST', '/api/coach/reviewed/sessions/' + session + '/sets'), false)
  assert.equal(allowedNextPath(source, 'POST', '/api/coach/supervised/resolve'), false)
  assert.equal(allowedNextPath(source, 'GET', '/api/coach/reviewed/sessions/55555555-5555-4555-8555-555555555555'), false)
  assert.equal(allowedNextPath(source, 'POST', '/api/profile'), false)
  assert.equal(allowedNextPath(source, 'POST', '/api/whoop/disconnect'), false)
  assert.equal(allowedNextPath(source, 'GET', '/api/coach/reviewed/proposals', '?programId=' + program), true)
  for (const query of ['', '?programId=' + candidate, '?programId=' + program + '&programId=' + program, '?programId=' + program + '&other=1'])
    assert.equal(allowedNextPath(source, 'GET', '/api/coach/reviewed/proposals', query), false)
})
test('journals retain receipt identities without credentials or private packets', () => {
  const result = safeNextResult({ kind: 'resolved', access_token: 'sensitive', profile: { private: true },
    resolution: { operation: 'submit', disposition: 'saved', result: { candidate: { candidateId: candidate, privatePacket: 'private' } } } })
  assert.equal(result.resolution.candidateId, candidate)
  assert.equal(JSON.stringify(result).includes('sensitive'), false)
  assert.equal(JSON.stringify(result).includes('private'), false)
})
test('runtime denial proof rejects harness errors and unmatched inner requests', () => {
  const inner = { name: 'next_http', disposition: 'response_received', payload: { path: '/api/coach/supervised/issue', method: 'POST', requestId: 'reserved', bodySha256: 'hash' }, result: { status: 503, kind: 'retry_required' } }
  const probe = { disposition: 'response_received', payload: { innerJournalIndex: 0, intended: { ...inner.payload } }, result: { status: 200, probeStatus: 503, kind: 'retry_required' } }
  assert.equal(provenNextProbe([inner], probe, 503, 'retry_required'), true)
  for (const [status, kind] of [[403, 'outside_qualification_scope'], [500, 'inspect_required']]) {
    assert.equal(provenNextProbe([{ ...inner, result: { status, kind } }], { ...probe, result: { status: 200, probeStatus: status, kind } }, 503, 'retry_required'), false)
  }
  assert.equal(provenNextProbe([{ ...inner, payload: { ...inner.payload, bodySha256: 'other' } }], probe, 503, 'retry_required'), false)
  assert.equal(provenNextProbe([], probe, 503, 'retry_required'), false)
})
test('snapshot SQL remains read-only and records duplicate rows without changing base tables', async () => {
  const db = new PGlite()
  try {
    await db.exec("CREATE SCHEMA auth;CREATE TABLE auth.users(id text,email text,deleted_at timestamptz);CREATE TABLE public.example(value int);INSERT INTO example VALUES(1),(1),(2)")
    const sql = nextSnapshotSql(['example'])
    const results = await db.exec(sql)
    const row = results.find(r => r.rows.length)?.rows[0].jsonb_object_agg
    assert.deepEqual(Object.values(row.example).sort(), [1, 2])
    assert.deepEqual(row.auth_identity, {})
    assert.equal((await db.query('SELECT count(*) nb FROM example')).rows[0].nb, 3)
    await db.exec('BEGIN READ ONLY')
    await assert.rejects(db.exec('INSERT INTO example VALUES(4)'), error => error.code === '25006')
    await db.exec('ROLLBACK')
    for (const bad of [['x;DROP TABLE example'], ['../outside'], ['auth_identity'], ['example', 'example'], []]) assert.throws(() => nextSnapshotSql(bad), /Unexpected snapshot/)
  } finally { await db.close() }
})
