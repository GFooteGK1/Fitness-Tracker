import { createPrivateQwikOriginalClient, type PrivateQwikSql } from './qwik-private-original'

type Client = ReturnType<typeof createPrivateQwikOriginalClient>
type Phase = 'authority' | 'lease' | 'setup' | 'callback' | 'commit' | 'reset' | 'release'
type Outcome = 'not_started' | 'rolled_back' | 'committed' | 'unknown'
type Cleanup = 'none' | 'released' | 'discarded' | 'uncertain'
type Fault = 'denied' | 'configuration' | 'dirty' | 'provider' | 'cancelled' | 'deadline' | 'unsettled' | 'duplicate_lease'

/** Stable classifications only: no source bytes, tokens or provider diagnostics. */
export class PrivateQwikOwnerTransactionError extends Error {
  constructor(readonly phase: Phase, readonly outcome: Outcome, readonly cleanup: Cleanup, readonly fault: Fault) {
    super('Private owner transaction unavailable')
    this.name = 'PrivateQwikOwnerTransactionError'
  }
}

/** Trusted SERVER ports, not request data. getUser must verify the authenticated
 * principal (e.g. the existing Supabase server getUser), not decode an unverified
 * JWT or accept an owner supplied in a body. No runtime provider is wired here. */
export interface PrivateQwikVerifiedAuth {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
}
export interface PrivateQwikExecutorLease extends PrivateQwikSql {
  /** Stable exclusive LEASE-GENERATION identity, including aliases. A new
   * healthy lease on the same physical connection has a new generation. */
  readonly identity: object
  /** Driver protocol status, not an optimistic boolean invented by the caller. */
  transactionState(): 'idle' | 'active' | 'failed' | 'unknown'
  /** All methods must be generation-fenced by the driver. A retired handle may
   * not query/release/close a connection already assigned to another owner. */
  release(): Promise<void>
  /** Poison this generation, close only if still owned, and settle its queries. */
  discard(): Promise<void>
}
export interface PrivateQwikExecutorPool {
  /** Exclusive lease; cancellation must not return it for healthy reuse. */
  acquire(signal: AbortSignal): Promise<PrivateQwikExecutorLease>
}
export interface PrivateQwikOwnerTransactionConfig {
  executorRole: string
  quotaBytes: number
  operationTimeoutMs: number
  cleanupTimeoutMs: number
  statementTimeoutMs: number
}

const owned = new WeakSet<object>()
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
class Stop extends Error { constructor(readonly fault: 'cancelled' | 'deadline') { super(fault) } }
function bounded<T>(start: () => Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (fn: () => void) => { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); fn() }
    const abort = () => finish(() => reject(signal?.reason instanceof Stop ? signal.reason : new Stop('cancelled')))
    if (signal?.aborted) { abort(); return }
    const left = deadline - performance.now()
    if (left <= 0) { finish(() => reject(new Stop('deadline'))); return }
    // Check BEFORE dispatch, especially COMMIT. A Promise argument would have
    // already sent SQL by the time its deadline/cancellation was examined.
    signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(() => reject(new Stop('deadline'))), left)
    try { start().then(value => finish(() => resolve(value)), error => finish(() => reject(error))) }
    catch (error) { finish(() => reject(error)) }
  })
}

type Context = { pid: number; role: string; login: string; owner: string | null;
  legacy_empty: boolean; aggregate_empty: boolean; legacy_matches: boolean; aggregate_matches: boolean }
const contextSql = `SELECT pg_backend_pid() pid,current_user::text role,session_user::text login,
 auth.uid()::text owner,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NULL legacy_empty,
 nullif(current_setting('request.jwt.claims',true),'') IS NULL aggregate_empty,
 nullif(current_setting('request.jwt.claim.sub',true),'') IS NOT DISTINCT FROM $1::text legacy_matches,
 CASE WHEN nullif(current_setting('request.jwt.claims',true),'') IS NULL THEN $1::text IS NULL
 ELSE (current_setting('request.jwt.claims',true)::jsonb->>'sub') IS NOT DISTINCT FROM $1::text END aggregate_matches`

/** INACTIVE: one verified request, one exclusive connection, one transaction.
 * Direct-login executor semantics are prepared here; actual Supavisor/driver
 * behavior needs its own qualification. Database statement_timeout does not
 * bound arbitrary synchronous JS/native code. Pool discard/cancellation remains
 * a trusted driver contract and cannot be certified by a TypeScript interface. */
export async function withVerifiedPrivateQwikOriginals<T>(
  auth: PrivateQwikVerifiedAuth, pool: PrivateQwikExecutorPool,
  configuration: PrivateQwikOwnerTransactionConfig, run: (client: Client) => Promise<T>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const cfg = Object.freeze({ ...configuration })
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(cfg.executorRole)
    || ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'supabase_admin'].includes(cfg.executorRole)
    || !Number.isSafeInteger(cfg.quotaBytes) || cfg.quotaBytes < 2
    || ![cfg.operationTimeoutMs, cfg.cleanupTimeoutMs, cfg.statementTimeoutMs].every(n => Number.isSafeInteger(n) && n > 0)
    || cfg.operationTimeoutMs > 30000 || cfg.cleanupTimeoutMs > 5000 || cfg.statementTimeoutMs > cfg.operationTimeoutMs) {
    throw new PrivateQwikOwnerTransactionError('authority', 'not_started', 'none', 'configuration')
  }
  const deadline = performance.now() + cfg.operationTimeoutMs
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(new Stop('deadline')), cfg.operationTimeoutMs)
  const abort = () => controller.abort(new Stop('cancelled'))
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort(new Stop('cancelled'))
  let phase: Phase = 'authority', outcome: Outcome = 'not_started', cleanup: Cleanup = 'none'
  let lease: PrivateQwikExecutorLease | undefined, active = false, transaction = false, registered = false
  let commitSent = false, discardWork: Promise<void> | undefined
  let fault: Fault = 'provider'
  const pending = new Set<Promise<unknown>>()
  const rawPending = new Set<Promise<unknown>>()
  function dispatch<R>(statement: string, params: unknown[]) {
    const work = lease!.query<R>(statement, params); rawPending.add(work)
    void work.then(() => rawPending.delete(work), () => rawPending.delete(work))
    return work
  }
  const query = <R>(statement: string, params: unknown[], until = deadline, signal: AbortSignal | null = controller.signal) =>
    bounded(() => dispatch<R>(statement, params), until, signal ?? undefined)
  const discard = (until: number) => bounded(() => {
    if (!discardWork) {
      try { discardWork = Promise.resolve(lease!.discard()) }
      catch (error) { discardWork = Promise.reject(error) }
    }
    return discardWork
  }, until)
  const stop = () => {
    if (!active || controller.signal.aborted) throw controller.signal.reason instanceof Stop ? controller.signal.reason : new Stop('cancelled')
  }
  try {
    const verified = await bounded(() => auth.getUser(), deadline, controller.signal)
    const subject = verified?.data?.user?.id
    if (!verified || verified.error || typeof subject !== 'string' || !uuid.test(subject)) { fault = 'denied'; throw new Error('authority') }
    const owner = subject.toLowerCase() // Freeze before lease resolution.
    phase = 'lease'
    let acquisition: Promise<PrivateQwikExecutorLease> | undefined
    try { lease = await bounded(() => { acquisition = pool.acquire(controller.signal); return acquisition }, deadline, controller.signal) }
    catch (error) {
      // A late lease is never used for SQL or returned as healthy. No guessed
      // cleanup of another operation's active connection is permitted.
      if (error instanceof Stop && acquisition) {
        cleanup = 'uncertain'
        void acquisition?.then(async late => {
          if (!owned.has(late.identity)) await bounded(() => late.discard(), performance.now() + cfg.cleanupTimeoutMs)
        }).catch(() => { /* no healthy-release claim for an unqualified driver */ })
      }
      throw error
    }
    if (!lease.identity || typeof lease.identity !== 'object') {
      fault = 'dirty'; cleanup = 'uncertain'; lease = undefined; throw new Error('lease')
    }
    if (owned.has(lease.identity)) {
      fault = 'duplicate_lease'; lease = undefined; throw new Error('lease')
    }
    owned.add(lease.identity); registered = true
    if (lease.transactionState() !== 'idle') { fault = 'dirty'; throw new Error('lease') }
    phase = 'setup'
    await query('BEGIN', []); transaction = true
    const inspect = async (expected: string | null) => {
      const rows = (await query<Context>(contextSql, [expected])).rows
      if (rows.length !== 1 || !Number.isSafeInteger(rows[0].pid) || rows[0].pid <= 0
        || rows[0].role !== cfg.executorRole || rows[0].login !== cfg.executorRole
        || rows[0].owner !== expected || !rows[0].legacy_matches || !rows[0].aggregate_matches
        || expected === null && (!rows[0].legacy_empty || !rows[0].aggregate_empty)) {
        fault = 'dirty'; throw new Error('context')
      }
      return rows[0].pid
    }
    const pid = await inspect(null)
    await query(`SELECT set_config('role',$1,true),set_config('request.jwt.claim.sub',$2,true),
      set_config('request.jwt.claims',jsonb_build_object('sub',$2::text)::text,true),set_config('statement_timeout',$3,true)`,
    [cfg.executorRole, owner, String(cfg.statementTimeoutMs)])
    if (await inspect(owner) !== pid || lease.transactionState() !== 'active') { fault = 'dirty'; throw new Error('context') }
    active = true; phase = 'callback'
    const sql: PrivateQwikSql = { query: async <R>(statement: string, params: unknown[]) => {
      stop()
      const result = await query<R>(statement, params)
      stop(); return result
    } }
    const raw = createPrivateQwikOriginalClient(sql, owner, { quotaBytes: cfg.quotaBytes })
    function track<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
      return (...args) => {
        try { stop() } catch (error) { return Promise.reject(error) }
        const task = fn(...args); pending.add(task)
        void task.then(() => pending.delete(task), () => pending.delete(task))
        return task
      }
    }
    const client: Client = { readOriginal: track(raw.readOriginal), persist: track(raw.persist), recover: track(raw.recover),
      deleteOriginal: track(raw.deleteOriginal), readClaims: track(raw.readClaims) }
    const result = await bounded(() => Promise.resolve().then(() => run(client)), deadline, controller.signal)
    if (pending.size) { fault = 'unsettled'; throw new Error('pending') }
    stop(); active = false
    if (await inspect(owner) !== pid || lease.transactionState() !== 'active') { fault = 'dirty'; throw new Error('context') }
    phase = 'commit'
    await bounded(() => { commitSent = true; outcome = 'unknown'; return dispatch('COMMIT', []) }, deadline, controller.signal)
    transaction = false; outcome = 'committed'; phase = 'reset'
    if (lease.transactionState() !== 'idle') { fault = 'dirty'; throw new Error('reset') }
    await inspect(null)
    phase = 'release'; await bounded(() => lease!.release(), deadline, controller.signal); cleanup = 'released'
    return result
  } catch (error) {
    active = false
    if (error instanceof Stop) fault = error.fault
    const cleanupDeadline = performance.now() + cfg.cleanupTimeoutMs
    const rollbackDeadline = performance.now() + cfg.cleanupTimeoutMs / 2
    if (lease) {
      try {
        if (transaction && !commitSent && phase !== 'setup') {
          // All non-discard cleanup shares the first half; closing a stalled
          // generation still has its own allowance after ANY cleanup phase.
          await bounded(() => Promise.allSettled([...pending, ...rawPending]), rollbackDeadline)
          await query('ROLLBACK', [], rollbackDeadline, null); transaction = false; outcome = 'rolled_back'
          const reset = (await query<Context>(contextSql, [null], rollbackDeadline, null)).rows
          if (lease.transactionState() !== 'idle' || reset.length !== 1 || reset[0].owner !== null
            || !reset[0].legacy_empty || !reset[0].aggregate_empty || !reset[0].legacy_matches || !reset[0].aggregate_matches
            || reset[0].role !== cfg.executorRole || reset[0].login !== cfg.executorRole) throw new Error('reset')
          await bounded(() => lease!.release(), rollbackDeadline); cleanup = 'released'
        } else {
          await discard(cleanupDeadline); cleanup = 'discarded'
        }
      } catch {
        if (transaction) outcome = 'unknown'
        if (discardWork) cleanup = 'uncertain' // Never retry an uncertain discard.
        else try { await discard(cleanupDeadline); cleanup = 'discarded' }
        catch { cleanup = 'uncertain' }
      }
    }
    throw new PrivateQwikOwnerTransactionError(phase, outcome, cleanup, fault)
  } finally {
    active = false; clearTimeout(timeout); options.signal?.removeEventListener('abort', abort)
    if (registered && lease) owned.delete(lease.identity)
  }
}
