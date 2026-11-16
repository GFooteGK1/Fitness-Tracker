import { afterEach, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { retainLocalQwikArtifact } from '@/app/lib/coach/qwik-exact-capture'
import { withVerifiedPrivateQwikOriginals, type PrivateQwikExecutorLease, type PrivateQwikExecutorPool,
  type PrivateQwikOwnerTransactionConfig, type PrivateQwikVerifiedAuth } from '@/app/lib/coach/qwik-private-owner-transaction'
import type { createPrivateQwikOriginalClient } from '@/app/lib/coach/qwik-private-original'
import { qwikPrivateFixture, seedPrivateOwner } from './qwik-private-fixture'

type Client = ReturnType<typeof createPrivateQwikOriginalClient>
const role = 'qwik_private_test_executor'
const cfg: PrivateQwikOwnerTransactionConfig = { executorRole: role, quotaBytes: 20000000,
  operationTimeoutMs: 10000, cleanupTimeoutMs: 1000, statementTimeoutMs: 3000 }
const gate = <T = void>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const arrive = (barrier: Promise<unknown>, operation: Promise<unknown>) => Promise.race([barrier,
  operation.then(() => { throw new Error('Synthetic operation settled before its required barrier') })])
const auth = (id: string): PrivateQwikVerifiedAuth => ({ getUser: async () => ({ data: { user: { id } }, error: null }) })
let db: PGlite, pool: FixturePool, owner: string, other: string, store: string

/** Actual disposable SQL with a modeled exclusive driver lease. This is not a
 * native driver ReadyForQuery, network login, JWT or Supavisor qualification. */
class FixturePool implements PrivateQwikExecutorPool {
  calls: string[] = []; leases: FixtureLease[] = []; active?: FixtureLease
  releaseCount = 0; discardCount = 0
  afterSql?: (sql: string, result: { rows: any[] }) => Promise<void>
  beforeSql?: (sql: string) => Promise<void>
  beforeDiscard?: () => Promise<void>
  constructor(readonly database: PGlite) {}
  async acquire() {
    if (this.active || this.database.closed) throw new Error('Synthetic busy/closed pool')
    const lease = new FixtureLease(this); this.active = lease; this.leases.push(lease); return lease
  }
}
class FixtureLease implements PrivateQwikExecutorLease {
  readonly identity = {}; ended = false; failed = false
  constructor(readonly pool: FixturePool) {}
  transactionState() {
    if (this.ended || this.pool.database.closed) return 'unknown' as const
    return this.pool.database.isInTransaction() ? this.failed ? 'failed' as const : 'active' as const : 'idle' as const
  }
  async query<T>(sql: string, params: unknown[]) {
    if (this.ended || this.pool.active !== this) throw new Error('Synthetic retired generation')
    this.pool.calls.push(sql)
    await this.pool.beforeSql?.(sql)
    let result: { rows: T[] }
    try { result = await this.pool.database.query<T>(sql, params) }
    catch (error) { this.failed = true; throw error }
    if (/^(ROLLBACK|COMMIT)$/.test(sql)) this.failed = false
    await this.pool.afterSql?.(sql, result)
    return result
  }
  async release() {
    if (this.ended || this.pool.active !== this) throw new Error('Synthetic retired generation')
    this.ended = true; this.pool.active = undefined; this.pool.releaseCount++
  }
  async discard() {
    this.pool.discardCount++
    if (this.ended || this.pool.active !== this) throw new Error('Synthetic retired generation cannot close another owner')
    this.ended = true; this.pool.active = undefined
    await this.pool.beforeDiscard?.()
    if (!this.pool.database.closed) await this.pool.database.close()
  }
}
async function openExecutor(database: PGlite) {
  await database.exec('RESET ROLE')
  await database.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)")
  await database.exec('SET SESSION AUTHORIZATION qwik_private_test_executor')
}
beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'socius-qwik-owner-lease-')); store = join(root, 'store')
  db = await qwikPrivateFixture({ dataDir: store }); owner = randomUUID(); other = randomUUID()
  await seedPrivateOwner(db, owner); await seedPrivateOwner(db, other)
  await db.exec(`RESET ROLE;
    CREATE FUNCTION public.qwik_fixture_counts(p_owner uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
     IF p_owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Synthetic owner only' USING ERRCODE='42501'; END IF;
     RETURN jsonb_build_object(
      'artifacts',(SELECT count(*) FROM qwik_private.artifacts WHERE user_id=p_owner),
      'markers',(SELECT count(*) FROM qwik_private.commit_receipts WHERE user_id=p_owner),
      'ledgers',(SELECT count(*) FROM public.logging_requests WHERE user_id=p_owner AND request_key LIKE 'qwik-private:%'),
      'workouts',(SELECT count(*) FROM public.workouts WHERE user_id=p_owner)); END $$;
    REVOKE ALL ON FUNCTION public.qwik_fixture_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION public.qwik_fixture_counts(uuid) TO qwik_private_test_executor;`)
  await openExecutor(db); pool = new FixturePool(db)
}, 30000)
afterEach(async () => { if (db && !db.closed) await db.close() })
const within = <T>(id: string, callback: (client: Client) => Promise<T>, options = {}, settings = cfg, selectedPool: PrivateQwikExecutorPool = pool) =>
  withVerifiedPrivateQwikOriginals(auth(id), selectedPool, settings, callback, options)
async function input(id = owner, key = randomUUID()) {
  const original = new TextEncoder().encode(JSON.stringify([{ synthetic: randomUUID(), unknown: '001.20', signed: -0.7, absent: null }]))
  return { requestId: key, artifact: await retainLocalQwikArtifact(original, id, 'synthetic.json'),
    retention: { mode: 'finite_until' as const, expiresAt: new Date(Date.now() + 3600000).toISOString() } }
}
async function clean() {
  expect(db.isInTransaction()).toBe(false)
  const row = (await db.query<any>(`SELECT current_user::text role,session_user::text login,auth.uid() owner,
    nullif(current_setting('request.jwt.claim.sub',true),'') legacy,
    nullif(current_setting('request.jwt.claims',true),'') aggregate`)).rows[0]
  expect(row).toEqual({ role, login: role, owner: null, legacy: null, aggregate: null })
}
async function counts(id: string) {
  await db.exec('BEGIN')
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [id, JSON.stringify({ sub: id })])
    return (await db.query<any>('SELECT public.qwik_fixture_counts($1) value', [id])).rows[0].value
  } finally { await db.exec('ROLLBACK') }
}
async function reopen() {
  expect(db.closed).toBe(true); db = new PGlite(store); await db.waitReady; await openExecutor(db); pool = new FixturePool(db)
}

it('A2 commits exact bytes as A then reuses the same physical SQL connection for B without owner leakage', async () => {
  const a = await input(), b = await input(other), pid = (await db.query<any>('SELECT pg_backend_pid() pid')).rows[0].pid
  const first = await within(owner, client => client.persist(a)); await clean()
  const second = await within(other, async client => {
    expect((await client.readOriginal(String(first.receipt.artifactId))).state).toBe('missing_or_unauthorized')
    return client.persist(b)
  }); await clean()
  expect(first.receipt.userId).toBe(owner); expect(second.receipt.userId).toBe(other)
  const read = await within(owner, client => client.readOriginal(String(first.receipt.artifactId)))
  expect(read.state).toBe('available'); if (read.state !== 'available') throw new Error('Missing synthetic original')
  expect(Buffer.compare(read.originalBytes, a.artifact.bytes)).toBe(0)
  expect((await db.query<any>('SELECT pg_backend_pid() pid')).rows[0].pid).toBe(pid)
  expect(await counts(owner)).toEqual({ artifacts: 1, markers: 1, ledgers: 1, workouts: 0 })
  expect(await counts(other)).toEqual({ artifacts: 1, markers: 1, ledgers: 1, workouts: 0 })
}, 15000)

it('A3 rolls back an actual private write on callback failure before clean A-to-B reuse', async () => {
  const a = await input(), b = await input(other)
  await expect(within(owner, async client => { await client.persist(a); throw new Error('Synthetic callback diagnostic must not escape') }))
    .rejects.toMatchObject({ phase: 'callback', outcome: 'rolled_back', cleanup: 'released' })
  await clean(); expect(await counts(owner)).toEqual({ artifacts: 0, markers: 0, ledgers: 0, workouts: 0 })
  expect((await within(owner, client => client.recover(a.requestId))).state).toBe('unconfirmed')
  expect((await within(other, client => client.persist(b))).receipt.userId).toBe(other); await clean()
}, 15000)

it('A4 rolls back controlled cancellation after real SQL progress and leaves B a clean connection', async () => {
  const a = await input(), b = await input(other), cancel = new AbortController()
  await expect(within(owner, async client => { await client.persist(a); cancel.abort(); return 'cancelled' }, { signal: cancel.signal }))
    .rejects.toMatchObject({ outcome: 'rolled_back', cleanup: 'released', fault: 'cancelled' })
  await clean(); expect(await counts(owner)).toMatchObject({ artifacts: 0, markers: 0, ledgers: 0 })
  expect((await within(other, client => client.persist(b))).receipt.userId).toBe(other)
  await clean()
}, 15000)

it('A5 rejects absent expired malformed and error-plus-user authority before acquiring any lease', async () => {
  const errors: unknown[] = []
  for (const authority of [
    null, { data: { user: { id: {toString:()=>owner} } }, error:null },
    { data: { user: null }, error: null }, { data: { user: { id: owner } }, error: new Error('Synthetic expired session') },
    { data: { user: { id: 'invalid' } }, error: null }, { data: { user: { id: owner } }, error: { message: 'Synthetic provider secret' } },
  ]) {
    try { await withVerifiedPrivateQwikOriginals({ getUser: async () => authority as any }, pool, cfg, async () => 'invalid') }
    catch (error) { errors.push(error) }
  }
  expect(errors).toHaveLength(6); expect(pool.leases).toHaveLength(0); expect(pool.calls).toEqual([])
  for (const error of errors) {
    expect(error).toMatchObject({ phase: 'authority', outcome: 'not_started', cleanup: 'none', fault:'denied' })
    expect(String(error)).not.toMatch(/expired session|provider secret/)
  }
}, 15000)

it('A5 freezes verified subject and trusted settings while acquisition is deferred', async () => {
  const entered = gate(), release = gate(), a = await input(), principal = { data: { user: { id: owner } }, error: null }
  const mutable = { ...cfg }, delayed: PrivateQwikExecutorPool = { acquire: async () => { entered.resolve(); await release.promise; return pool.acquire() } }
  const operation = withVerifiedPrivateQwikOriginals({ getUser: async () => principal }, delayed, mutable, client => client.persist(a))
  await arrive(entered.promise, operation); principal.data.user.id = other; mutable.executorRole = 'authenticated'; mutable.quotaBytes = 2; release.resolve()
  expect((await operation).receipt.userId).toBe(owner); await clean()
  expect(await counts(other)).toMatchObject({ artifacts: 0, markers: 0 })
}, 15000)

it('A6 retires the typed client before another owner can reuse its connection', async () => {
  let captured!: Client
  await within(owner, async client => { captured = client; expect(Object.keys(client).sort()).toEqual(['deleteOriginal','persist','readClaims','readOriginal','recover']); return 'done' })
  const a = await input(), b = await input(other), before = pool.calls.length
  await expect(captured.persist(a)).rejects.toThrow(); expect(pool.calls).toHaveLength(before)
  await within(other, async client => { await expect(captured.recover(a.requestId)).rejects.toThrow(); return client.persist(b) })
  expect(await counts(owner)).toMatchObject({ artifacts: 0, markers: 0 }); await clean()
}, 15000)

it('A6 discards unfinished fire-and-forget work without committing or issuing rollback over an active raw query', async () => {
  const progressed = gate(), finish = gate(), a = await input(); let detached!: Promise<unknown>
  pool.afterSql = async sql => { if (sql.includes('persist_original')) { progressed.resolve(); await finish.promise } }
  pool.beforeDiscard = async () => { finish.resolve() }
  const operation = within(owner, async client => { detached = client.persist(a); void detached.catch(() => {}); return 'unsettled' }, {}, { ...cfg, cleanupTimeoutMs: 1000 })
  await arrive(progressed.promise, operation)
  await expect(operation).rejects.toMatchObject({ fault: 'unsettled', outcome: 'unknown', cleanup: 'discarded' })
  await detached.catch(() => {}); expect(pool.calls).not.toContain('COMMIT'); expect(pool.calls).not.toContain('ROLLBACK')
  expect(pool.discardCount).toBe(1); await reopen()
  expect((await within(owner, client => client.recover(a.requestId))).state).toBe('unconfirmed')
  expect(await counts(owner)).toMatchObject({ artifacts: 0, markers: 0, ledgers: 0 })
}, 15000)

it('A6 refuses a dirty lease without beginning or committing its pre-existing transaction', async () => {
  await db.exec('BEGIN')
  await expect(within(owner, async () => 'invalid')).rejects.toMatchObject({ phase: 'lease', fault: 'dirty', cleanup: 'discarded' })
  expect(pool.calls).toEqual([]); expect(pool.discardCount).toBe(1); expect(db.closed).toBe(true)
}, 15000)

it('A6 rejects a duplicate active generation without cleaning up the first owner lease', async () => {
  const a = await input(), duplicate: PrivateQwikExecutorPool = { acquire: async () => pool.active! }
  const result = await within(owner, async client => {
    await expect(within(other, async () => 'invalid', {}, cfg, duplicate)).rejects.toMatchObject({ fault: 'duplicate_lease', cleanup: 'none' })
    expect(pool.discardCount).toBe(0); expect(pool.releaseCount).toBe(0)
    return client.persist(a)
  })
  expect(result.receipt.userId).toBe(owner); expect(pool.releaseCount).toBe(1); await clean()
}, 15000)

it('A7 reconciles a lost actual commit response on a fresh connection with the original request identity', async () => {
  const a = await input(); let once = true
  pool.afterSql = async sql => { if (sql === 'COMMIT' && once) { once = false; throw new Error('Synthetic commit acknowledgement lost') } }
  await expect(within(owner, client => client.persist(a))).rejects.toMatchObject({ phase: 'commit', outcome: 'unknown', cleanup: 'discarded' })
  expect(pool.calls.filter(sql => sql === 'COMMIT')).toHaveLength(1); expect(pool.calls).not.toContain('ROLLBACK')
  await reopen()
  const recovered = await within(owner, client => client.recover(a.requestId))
  expect(recovered.state).toBe('saved'); if (recovered.state !== 'saved') throw new Error('Missing synthetic receipt')
  expect(recovered.receipt.sha256).toBe(a.artifact.sha256)
  expect((await within(owner, client => client.persist(a))).receipt).toEqual(recovered.receipt)
  const changed = await input(owner, a.requestId)
  await expect(within(owner, client => client.persist(changed))).rejects.toMatchObject({ outcome: 'rolled_back' })
  expect(await counts(owner)).toEqual({ artifacts: 1, markers: 1, ledgers: 1, workouts: 0 }); await clean()
}, 15000)

it('A8 dispatches no commit when cancellation arrives immediately after the final context check', async () => {
  const a = await input(), cancel = new AbortController(); let ownerChecks = 0
  pool.afterSql = async (sql, result) => {
    if (sql.includes('legacy_matches') && result.rows[0]?.owner === owner && ++ownerChecks === 2) cancel.abort()
  }
  await expect(within(owner, client => client.persist(a), { signal: cancel.signal })).rejects.toMatchObject({ outcome: 'rolled_back' })
  expect(pool.calls).not.toContain('COMMIT'); expect(await counts(owner)).toMatchObject({ artifacts: 0, markers: 0, ledgers: 0 }); await clean()
}, 15000)

it('A8 attempts an uncertain discard only once and never reports a dirty generation healthy', async () => {
  const a = await input(); let discardCalls = 0
  pool.afterSql = async sql => { if (sql === 'COMMIT') throw new Error('Synthetic commit transport loss') }
  const originalAcquire = pool.acquire.bind(pool)
  const broken: PrivateQwikExecutorPool = { acquire: async () => {
    const lease = await originalAcquire(); lease.discard = async () => { discardCalls++; throw new Error('Synthetic close failure') }; return lease
  } }
  await expect(within(owner, client => client.persist(a), {}, cfg, broken)).rejects.toMatchObject({ outcome: 'unknown', cleanup: 'uncertain' })
  expect(discardCalls).toBe(1); expect(pool.releaseCount).toBe(0)
  // The fixture remains owned; afterEach closes it, not a production process.
}, 15000)

it('A4 never rolls back over an unsettled raw query after cancellation and fences it before B reuse', async () => {
  const a = await input(), b = await input(other), progressed=gate(), finish=gate(), cancel=new AbortController()
  pool.afterSql=async sql=>{if(sql.includes('persist_original')){progressed.resolve();await finish.promise}}
  pool.beforeDiscard=async()=>{finish.resolve()}
  const operation=within(owner,client=>client.persist(a),{signal:cancel.signal})
  await arrive(progressed.promise,operation); cancel.abort()
  await expect(operation).rejects.toMatchObject({fault:'cancelled',outcome:'unknown',cleanup:'discarded'})
  expect(pool.calls).not.toContain('ROLLBACK');expect(pool.calls).not.toContain('COMMIT');expect(pool.discardCount).toBe(1)
  await reopen();expect((await within(owner,client=>client.recover(a.requestId))).state).toBe('unconfirmed')
  expect((await within(other,client=>client.persist(b))).receipt.userId).toBe(other);await clean()
},15000)

it('A6 fences a released generation when its late release error arrives after B acquires the physical connection', async () => {
  const a=await input(),b=await input(other),entered=gate(),finish=gate();let next!:Promise<unknown>
  const originalAcquire=pool.acquire.bind(pool);let first=true
  const handoff:PrivateQwikExecutorPool={acquire:async()=>{
    const lease=await originalAcquire()
    if(first){first=false;const release=lease.release.bind(lease);lease.release=async()=>{
      await release();next=within(other,async client=>{entered.resolve();await finish.promise;return client.persist(b)})
      void next.catch(()=>{});await entered.promise;throw new Error('Synthetic late release failure after handoff')
    }}return lease
  }}
  await expect(within(owner,client=>client.persist(a),{},cfg,handoff)).rejects.toMatchObject({phase:'release',outcome:'committed',cleanup:'uncertain'})
  expect(db.closed).toBe(false);expect(pool.active?.ended).toBe(false);finish.resolve();await next;await clean()
  expect(await counts(owner)).toMatchObject({artifacts:1,markers:1});expect(await counts(other)).toMatchObject({artifacts:1,markers:1})
},15000)

it('A8 discards failed setup and failed rollback without healthy release or residual committed rows', async () => {
  for(const boundary of ['BEGIN','ROLLBACK']){
    const a=await input();pool.beforeSql=async sql=>{if(sql===boundary)throw new Error('Synthetic cleanup boundary failure')}
    await expect(within(owner,async client=>{await client.persist(a);throw new Error('Synthetic callback failure')}))
      .rejects.toMatchObject({cleanup:'discarded',outcome:boundary==='BEGIN'?'not_started':'unknown'})
    expect(pool.releaseCount).toBe(0);expect(pool.discardCount).toBe(1);await reopen()
    expect(await counts(owner)).toMatchObject({artifacts:0,markers:0,ledgers:0});await clean()
  }
},15000)

it('A8 rolls back an actual SQL error and reserves discard time when rollback acknowledgement stalls', async () => {
  const a=await input(),b=await input(other)
  pool.beforeSql=async sql=>{if(sql.includes('persist_original'))await db.query('SELECT 1/0')}
  await expect(within(owner,client=>client.persist(a))).rejects.toMatchObject({outcome:'rolled_back',cleanup:'released'})
  await clean();expect(await counts(owner)).toMatchObject({artifacts:0,markers:0})
  pool.beforeSql=undefined;const progressed=gate(),finish=gate()
  pool.afterSql=async sql=>{if(sql==='ROLLBACK'){progressed.resolve();await finish.promise}}
  pool.beforeDiscard=async()=>{finish.resolve()}
  const operation=within(other,async client=>{await client.persist(b);throw new Error('Synthetic callback failure')})
  await arrive(progressed.promise,operation);await expect(operation).rejects.toMatchObject({outcome:'unknown',cleanup:'discarded'})
  expect(pool.discardCount).toBe(1);await reopen();expect(await counts(other)).toMatchObject({artifacts:0,markers:0});await clean()
},15000)
