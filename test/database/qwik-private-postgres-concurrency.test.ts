import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrivateNativeFixture, NativeSession, fixtureDb, nativeEligible, type NativeSqlError } from './qwik-private-native-fixture'
import { privateActor, seedPrivateOwner, seedPrivateRecording, persistPrivate } from './qwik-private-fixture'
import { mcpOwnerClient } from './mcp-activity-fixture'
import { qwikArrayFixture, recordingOptions } from '../coach/rep-recording-fixture'
import { parseQwikArrayRecordings } from '@/app/lib/coach/rep-recording'
import { normalizeActivity } from '@/app/lib/capture/normalize'

type Source = Awaited<ReturnType<typeof seedPrivateRecording>> & { namespaceId: string; expiresAt: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: unknown }
const settle = <T>(promise: Promise<T>): Promise<Result<T>> => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const expiry = () => new Date(Date.now() + 3600000).toISOString()
let fixture: PrivateNativeFixture, halted = false
type Proof = { id: string; name: string; status: 'unrun' | 'passed' | 'failed'; backendPids?: number[];
  lock?: unknown; observations?: unknown; failureClass?: string; cleanupFailure?: boolean }
const proofs: Proof[] = []

describe.skipIf(!nativeEligible)('private QWIK: seven genuine independent-session PostgreSQL races', () => {
  beforeAll(async () => { fixture = new PrivateNativeFixture(); await fixture.start() }, 30000)
  afterAll(async () => {
    let cleanup = { ownedClientsClosed: false, clusterStopped: false }, failure: unknown
    try { if (fixture) cleanup = await fixture.close() } catch (error) { failure = error }
    const output = join('output', 'qwik-private-native'); mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'qualification.json'), JSON.stringify({ ...fixture?.metadata,
      cases: proofs, ...cleanup }), { flag: 'wx' })
    if (failure) throw failure
    expect(cleanup).toEqual({ ownedClientsClosed: true, clusterStopped: true })
  }, 10000)

  function race(name: string, body: (run: Race) => Promise<void>) {
    const proof: Proof = { id: name.slice(0, 2), name, status: 'unrun' }; proofs.push(proof)
    it(name, async (context: TestContext) => {
      if (halted) { context.skip(); return }
      const run = new Race(proof)
      let failure: unknown, failed = false
      try { await body(run) } catch (error) { failed = true; failure = error }
      try { await run.close() } catch (error) { proof.cleanupFailure = true; if (!failed) { failed = true; failure = error } }
      if (failed) {
        halted = true; proof.status = 'failed'; proof.failureClass = 'assertion_or_fixture'
        throw failure
      }
      proof.status = 'passed'
    }, 15000)
  }

  class Race {
    // Setup, queries and barriers consume one envelope; leave cleanup allowance.
    readonly deadline = performance.now() + 12000
    readonly sessions: NativeSession[] = []
    constructor(readonly proof: Proof) { fixture.admin.setDeadline(this.deadline) }
    async session(owner: string) {
      const session = await fixture.session(this.deadline); this.sessions.push(session)
      await session.exec('BEGIN;')
      await privateActor(fixtureDb(session), owner)
      expect(session.pid).not.toBe(fixture.admin.pid)
      return session
    }
    async close() { await fixture.closeSessions(this.sessions) }
    async barrier(a: NativeSession, b: NativeSession) {
      expect(a.pid).not.toBe(b.pid)
      await fixture.admin.exec('RESET ROLE;')
      const end = Math.min(this.deadline - 2000, performance.now() + 5000)
      while (performance.now() < end) {
        const row = (await fixture.admin.query<{ blocked: boolean; matching: boolean; resource: Record<string, unknown> | null }>(`WITH held AS (
          SELECT a.locktype,a.database,a.classid,a.objid,a.objsubid,a.mode blocker_mode,b.mode waiter_mode,
           a.granted blocker_granted,b.granted waiter_granted FROM pg_locks a JOIN pg_locks b ON a.locktype=b.locktype
           AND a.database IS NOT DISTINCT FROM b.database AND a.classid IS NOT DISTINCT FROM b.classid
           AND a.objid IS NOT DISTINCT FROM b.objid AND a.objsubid IS NOT DISTINCT FROM b.objsubid
           WHERE a.pid=$1 AND b.pid=$2 AND a.locktype='advisory' AND a.granted AND NOT b.granted)
          SELECT $1::integer=ANY(pg_blocking_pids($2::integer)) blocked,
           EXISTS(SELECT 1 FROM held) matching,(SELECT to_jsonb(h) FROM held h LIMIT 1) resource`, [a.pid, b.pid])).rows[0]
        if (row.blocked && row.matching) {
          expect(row.resource).toMatchObject({ locktype: 'advisory', blocker_granted: true, waiter_granted: false })
          this.proof.lock = { backendPids: [a.pid, b.pid, fixture.admin.pid], ...row }
          console.info('[qwik-native-lock] ' + JSON.stringify({ backendPids: [a.pid, b.pid, fixture.admin.pid], ...row }))
          return
        }
        if (b.isClosed()) throw new Error('Competing native backend closed before the causal lock barrier')
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('Native competitor did not demonstrably wait on the first owner lock')
    }
  }

  async function source(owner: string, namespaceId?: string, raw?: string): Promise<Source> {
    const db = fixtureDb(fixture.admin)
    const namespace = namespaceId ?? await seedPrivateOwner(db, owner)
    const row = await seedPrivateRecording(db, owner, raw ?? JSON.stringify(qwikArrayFixture()))
    return { ...row, namespaceId: namespace, expiresAt: expiry() }
  }
  const bound = (s: Source, key: string, extra = {}) => ({ ...s, key, revision: 1, claims: [s.claims[0]], ...extra })
  async function canonical(owner: string) {
    await fixture.admin.exec('RESET ROLE;')
    return (await fixture.admin.query('SELECT to_jsonb(w) value FROM workouts w WHERE user_id=$1 ORDER BY id', [owner])).rows
  }
  async function counts(owner: string) {
    await fixture.admin.exec('RESET ROLE;')
    return (await fixture.admin.query<{ artifacts: number; claims: number; versions: number; markers: number; ledgers: number; bytes: number }>(`SELECT
      (SELECT count(*) FROM qwik_private.artifacts WHERE user_id=$1) artifacts,
      (SELECT count(*) FROM qwik_private.source_claims WHERE user_id=$1) claims,
      (SELECT count(*) FROM qwik_private.claim_versions WHERE user_id=$1) versions,
      (SELECT count(*) FROM qwik_private.commit_receipts WHERE user_id=$1) markers,
      (SELECT count(*) FROM logging_requests WHERE user_id=$1 AND request_key LIKE 'qwik-private:%') ledgers,
      (SELECT coalesce(sum(octet_length(original_bytes)),0) FROM qwik_private.artifacts WHERE user_id=$1) bytes`, [owner])).rows[0]
  }
  async function recover(owner: string, key: string) {
    await privateActor(fixtureDb(fixture.admin), owner)
    return (await fixture.admin.query<{ receipt: unknown }>('SELECT qwik_private.read_receipt($1,$2,$3) receipt', [owner, key, 'retain'])).rows[0].receipt
  }
  async function bytes(owner: string, artifactId: unknown) {
    await privateActor(fixtureDb(fixture.admin), owner)
    return (await fixture.admin.query<{ hex: string; metadata: Record<string, unknown> }>('SELECT metadata,encode(bytes,\'hex\') hex FROM qwik_private.read_original($1,$2)', [owner, artifactId])).rows
  }
  function succeeded<T>(result: Result<T>): T { if (!result.ok) throw result.error; return result.value }
  function denied(result: Result<unknown>, code: string, message: string) {
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected native SQL denial')
    expect((result.error as NativeSqlError).sqlState).toBe(code)
    expect(String(result.error)).toContain(message)
  }
  async function commit(session: NativeSession) { await session.exec('COMMIT;'); await session.close() }
  const log = (id: string, pids: number[], state: unknown) => {
    const proof = proofs.find(value => value.id === id)!
    proof.backendPids = pids; proof.observations = state
    console.info('[qwik-native-result] ' + JSON.stringify({ id, backendPids: pids, state }))
  }

  race('R1: one namespaced source cannot register to two canonical workouts', async run => {
    const owner = randomUUID(), first = await source(owner), reexport: any = qwikArrayFixture()
    reexport[0].ignored_vendor_metadata.synthetic_reexport = 'second-file'
    const second = await source(owner, first.namespaceId, JSON.stringify(reexport))
    expect(second.sha256).not.toBe(first.sha256)
    const before = await canonical(owner), keyA = randomUUID(), keyB = randomUUID()
    const a = await run.session(owner), b = await run.session(owner)
    const winner = await persistPrivate(fixtureDb(a), owner, bound(first, keyA))
    const competing = settle(persistPrivate(fixtureDb(b), owner, bound(second, keyB)))
    await run.barrier(a, b); await commit(a)
    denied(await competing, '23505', 'Source identity already reserved'); await b.close()
    const stored = await counts(owner)
    expect(stored).toMatchObject({ artifacts: 1, claims: 1, versions: 1, markers: 1, ledgers: 1 })
    expect((await fixture.admin.query('SELECT entity_id,version FROM qwik_private.source_claims WHERE user_id=$1', [owner])).rows)
      .toEqual([{ entity_id: first.entityId, version: 1 }])
    expect(await canonical(owner)).toEqual(before); expect(await recover(owner, keyB)).toBeNull()
    expect((await bytes(owner, winner.artifactId))[0].hex).toBe(Buffer.from(first.bytes).toString('hex'))
    log('R1', [a.pid, b.pid, fixture.admin.pid], { winnerSha256: first.sha256, losingCode: '23505', stored })
  })

  race('R2: simultaneous identical requests return the same private commit identity', async run => {
    const owner = randomUUID(), s = await source(owner), key = randomUUID(), input = bound(s, key), before = await canonical(owner)
    const a = await run.session(owner), b = await run.session(owner)
    const first = await persistPrivate(fixtureDb(a), owner, input), competing = settle(persistPrivate(fixtureDb(b), owner, input))
    await run.barrier(a, b); await commit(a)
    const replay = succeeded(await competing); await commit(b)
    expect(replay).toEqual(first)
    expect(await counts(owner)).toMatchObject({ artifacts: 1, claims: 1, versions: 1, markers: 1, ledgers: 1, bytes: s.bytes.length })
    expect(await recover(owner, key)).toEqual(first); expect(await canonical(owner)).toEqual(before)
    expect((await bytes(owner, first.artifactId))[0].hex).toBe(Buffer.from(s.bytes).toString('hex'))
    log('R2', [a.pid, b.pid, fixture.admin.pid], { artifactId: first.artifactId, receiptEqual: true })
  })

  race('R3: a changed valid payload cannot reuse a concurrently completing key', async run => {
    const owner = randomUUID(); await seedPrivateOwner(fixtureDb(fixture.admin), owner)
    const before = await canonical(owner), key = randomUUID(), expiresAt = expiry()
    const one = new TextEncoder().encode('[1]'), two = new TextEncoder().encode('[2]')
    const a = await run.session(owner), b = await run.session(owner)
    const winner = await persistPrivate(fixtureDb(a), owner, { key, bytes: one, sha256: sha(one), expiresAt })
    const competing = settle(persistPrivate(fixtureDb(b), owner, { key, bytes: two, sha256: sha(two), expiresAt }))
    await run.barrier(a, b); await commit(a)
    denied(await competing, '22023', 'Request key reused for different input'); await b.close()
    expect(await counts(owner)).toMatchObject({ artifacts: 1, claims: 0, markers: 1, ledgers: 1, bytes: 3 })
    expect(await recover(owner, key)).toEqual(winner); expect(await canonical(owner)).toEqual(before)
    expect((await bytes(owner, winner.artifactId))[0].hex).toBe(Buffer.from(one).toString('hex'))
    log('R3', [a.pid, b.pid, fixture.admin.pid], { losingCode: '22023', originalUnchanged: true })
  })

  race('R4: only one correction appends a version when both expect the prior claim', async run => {
    const owner = randomUUID(), s = await source(owner)
    const original = await persistPrivate(fixtureDb(fixture.admin), owner, bound(s, randomUUID()))
    const old = (await canonical(owner))[0] as { value: Record<string, any> }
    const raw: any = JSON.parse(s.raw); raw[0].exercise_repetitions[0].concentricRepetition.average_velocity = 0.42
    const nextRaw = JSON.stringify(raw), nextBytes = new TextEncoder().encode(nextRaw)
    const recordings = await parseQwikArrayRecordings(nextRaw, recordingOptions), blocks = structuredClone(old.value.blocks)
    recordings.forEach((recording, index) => { blocks[2].segments[0].events[0].performed.sets[index + 3].velocity.recording = recording })
    await privateActor(fixtureDb(fixture.admin), owner)
    const client = mcpOwnerClient(fixtureDb(fixture.admin), owner).db
    const request = await client.rpc('begin_logging_request', { p_key: 'synthetic-native-correction:' + randomUUID(), p_fingerprint: 'd'.repeat(64) })
    expect(request.error).toBeNull()
    const normalized = normalizeActivity('workout', { ...old.value, blocks })
    const amended = await client.rpc('amend_logged_activity', { p_kind: 'workout', p_entity_id: s.entityId, p_expected_revision: 1,
      p_request_id: request.data.id, p_record: normalized.record, p_blocks: normalized.blocks, p_provenance: s.provenance })
    expect(amended.error).toBeNull(); expect(amended.data.revision).toBe(2)
    const before = await canonical(owner), keyA = randomUUID(), keyB = randomUUID()
    const next = { ...s, bytes: nextBytes, sha256: sha(nextBytes) }
    const claim = { ...s.claims[0], recording: recordings[0], expectedClaimVersion: 1, correctionReason: 'Synthetic explicit correction' }
    const a = await run.session(owner), b = await run.session(owner)
    const winner = await persistPrivate(fixtureDb(a), owner, bound(next, keyA, { revision: 2, claims: [claim] }))
    const competing = settle(persistPrivate(fixtureDb(b), owner, bound(next, keyB, { revision: 2, claims: [claim] })))
    await run.barrier(a, b); await commit(a)
    denied(await competing, '40001', 'Explicit prior version and correction reason required'); await b.close()
    expect(await counts(owner)).toMatchObject({ artifacts: 2, claims: 1, versions: 2, markers: 2, ledgers: 2 })
    await fixture.admin.exec('RESET ROLE;')
    const history = (await fixture.admin.query('SELECT version,artifact_id FROM qwik_private.claim_versions WHERE user_id=$1 ORDER BY version', [owner])).rows
    expect(history).toEqual([{ version: 1, artifact_id: original.artifactId }, { version: 2, artifact_id: winner.artifactId }])
    expect((await fixture.admin.query('SELECT version,canonical_revision,artifact_id FROM qwik_private.source_claims WHERE user_id=$1', [owner])).rows)
      .toEqual([{ version: 2, canonical_revision: 2, artifact_id: winner.artifactId }])
    expect(await recover(owner, keyB)).toBeNull(); expect(await canonical(owner)).toEqual(before)
    log('R4', [a.pid, b.pid, fixture.admin.pid], { versions: [1, 2], losingCode: '40001' })
  })

  race('R5: independent owners commit separately and cannot retrieve foreign originals', async run => {
    const owner = randomUUID(), other = randomUUID(), first = await source(owner), second = await source(other)
    const before = await canonical(owner), otherBefore = await canonical(other), key = randomUUID()
    const keys = (await fixture.admin.query<{ different: boolean }>("SELECT hashtextextended('capture-owner:'||$1::text,0)<>hashtextextended('capture-owner:'||$2::text,0) different", [owner, other])).rows[0]
    expect(keys.different).toBe(true)
    const a = await run.session(owner), b = await run.session(other)
    const one = await persistPrivate(fixtureDb(a), owner, bound(first, key))
    const two = await persistPrivate(fixtureDb(b), other, bound(second, key))
    await commit(b) // Must finish while A is still open, with no release from A.
    expect(a.isClosed()).toBe(false); expect(a.pid).not.toBe(b.pid)
    await fixture.admin.exec('RESET ROLE;')
    const held = (await fixture.admin.query<{ held: boolean }>(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity s JOIN pg_locks l ON l.pid=s.pid
      WHERE s.pid=$1 AND s.state='idle in transaction' AND l.locktype='advisory' AND l.granted) held`, [a.pid])).rows[0]
    expect(held.held).toBe(true)
    const foreign = await run.session(other)
    const deniedOwner = await settle(foreign.query('SELECT * FROM qwik_private.read_original($1,$2)', [owner, one.artifactId]))
    denied(deniedOwner, '42501', 'Unavailable owner context'); await foreign.close()
    await commit(a)
    expect(await counts(owner)).toMatchObject({ artifacts: 1, claims: 1, markers: 1, bytes: first.bytes.length })
    expect(await counts(other)).toMatchObject({ artifacts: 1, claims: 1, markers: 1, bytes: second.bytes.length })
    expect(await bytes(other, one.artifactId)).toEqual([])
    expect((await bytes(other, two.artifactId))[0].hex).toBe(Buffer.from(second.bytes).toString('hex'))
    expect(await canonical(owner)).toEqual(before); expect(await canonical(other)).toEqual(otherBefore)
    log('R5', [a.pid, b.pid, fixture.admin.pid], { independentCommitBeforeRelease: true, firstTransactionLockStillHeld: held.held, foreignCode: '42501' })
  })

  race('R6: rolling back tentative identity lets the blocked claimant commit once', async run => {
    const owner = randomUUID(), first = await source(owner), second = await source(owner, first.namespaceId)
    const before = await canonical(owner), keyA = randomUUID(), keyB = randomUUID()
    const a = await run.session(owner), b = await run.session(owner)
    await persistPrivate(fixtureDb(a), owner, bound(first, keyA)) // Tentative only.
    const competing = settle(persistPrivate(fixtureDb(b), owner, bound(second, keyB)))
    await run.barrier(a, b); await a.exec('ROLLBACK;'); await a.close()
    const winner = succeeded(await competing); await commit(b)
    expect(await counts(owner)).toMatchObject({ artifacts: 1, claims: 1, versions: 1, markers: 1, ledgers: 1 })
    expect(await recover(owner, keyA)).toBeNull(); expect(await recover(owner, keyB)).toEqual(winner)
    await fixture.admin.exec('RESET ROLE;')
    expect((await fixture.admin.query('SELECT entity_id FROM qwik_private.source_claims WHERE user_id=$1', [owner])).rows).toEqual([{ entity_id: second.entityId }])
    expect((await bytes(owner, winner.artifactId))[0].hex).toBe(Buffer.from(second.bytes).toString('hex'))
    expect(await canonical(owner)).toEqual(before)
    log('R6', [a.pid, b.pid, fixture.admin.pid], { firstRolledBack: true, winner: winner.artifactId })
  })

  race('R7: distinct originals cannot both take the final aggregate quota slot', async run => {
    const unrelated = randomUUID(), unrelatedSource = await source(unrelated)
    const unrelatedSaved = await persistPrivate(fixtureDb(fixture.admin), unrelated, bound(unrelatedSource, randomUUID()))
    const unrelatedBefore = await canonical(unrelated), unrelatedCounts = await counts(unrelated)
    const owner = randomUUID(); await seedPrivateOwner(fixtureDb(fixture.admin), owner)
    await fixture.admin.exec('RESET ROLE;')
    await fixture.admin.query('UPDATE qwik_private.owner_policies SET byte_quota=6 WHERE user_id=$1', [owner])
    await privateActor(fixtureDb(fixture.admin), owner)
    const expiresAt = expiry(), initialBytes = new TextEncoder().encode('[0]')
    const initial = await persistPrivate(fixtureDb(fixture.admin), owner, { bytes: initialBytes, sha256: sha(initialBytes), expiresAt })
    expect(await counts(owner)).toMatchObject({ artifacts: 1, bytes: 3 })
    const before = await canonical(owner), one = new TextEncoder().encode('[1]'), two = new TextEncoder().encode('[2]')
    expect(one.length).toBe(3); expect(two.length).toBe(3); expect(sha(one)).not.toBe(sha(two))
    const keyA = randomUUID(), keyB = randomUUID(), a = await run.session(owner), b = await run.session(owner)
    const winner = await persistPrivate(fixtureDb(a), owner, { key: keyA, bytes: one, sha256: sha(one), expiresAt, quota: 20000000 })
    const competing = settle(persistPrivate(fixtureDb(b), owner, { key: keyB, bytes: two, sha256: sha(two), expiresAt, quota: 20000000 }))
    await run.barrier(a, b); await commit(a)
    denied(await competing, '54000', 'Private retention quota exceeded'); await b.close()
    expect(await counts(owner)).toEqual({ artifacts: 2, claims: 0, versions: 0, markers: 2, ledgers: 2, bytes: 6 })
    expect(await recover(owner, keyB)).toBeNull(); expect(await recover(owner, keyA)).toEqual(winner)
    expect((await bytes(owner, initial.artifactId))[0].hex).toBe(Buffer.from(initialBytes).toString('hex'))
    expect(await canonical(owner)).toEqual(before)
    expect(await counts(unrelated)).toEqual(unrelatedCounts); expect(await canonical(unrelated)).toEqual(unrelatedBefore)
    expect((await bytes(unrelated, unrelatedSaved.artifactId))[0].hex).toBe(Buffer.from(unrelatedSource.bytes).toString('hex'))
    log('R7', [a.pid, b.pid, fixture.admin.pid], { storedBytes: 6, storedCap: 6, losingCode: '54000' })
  })
})
