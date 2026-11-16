/** Qualification-only real driver, never imported by an application route.
 * Fixed owned Unix socket; no credentials/DSN/environment target fallbacks. */
import { Pool, type PoolClient } from 'pg'
import type { PrivateQwikExecutorPool, PrivateQwikExecutorLease } from '@/app/lib/coach/qwik-private-owner-transaction'
import type { PrivateNativeFixture } from './qwik-private-native-fixture'

export class QwikQualificationPool implements PrivateQwikExecutorPool {
  readonly pool: Pool
  readonly events: { event: string; pid: number; state?: string | null; code?: string }[] = []
  readonly pids: number[] = []
  acquisitions = 0
  suppressCommitAcknowledgement = false
  private readonly generations = new WeakMap<PoolClient, object>()
  private readonly clients = new Map<PoolClient, { ended: boolean; closed: Promise<void> }>()
  private readonly leased = new Set<PoolClient>()
  private failure = false
  private ended = false
  private cancel?: (pid: number) => Promise<void>
  onAcquire?: (pid: number) => void
  constructor(fixture: PrivateNativeFixture, cancel?: (pid: number) => Promise<void>) {
    this.cancel = cancel
    this.pool = new Pool({ ...fixture.executorConnection(), max: 1, idleTimeoutMillis: 0 })
    this.pool.on('connect', client => {
      let resolve!: () => void
      const entry = { ended: false, closed: new Promise<void>(r => { resolve = r }) }
      client.once('end', () => { entry.ended = true; resolve() })
      this.clients.set(client, entry)
    })
    this.pool.on('error', () => { this.failure = true })
  }
  async acquire(signal: AbortSignal): Promise<PrivateQwikExecutorLease> {
    this.acquisitions++
    const client = await this.pool.connect(), identity = {}
    this.leased.add(client); this.generations.set(client, identity)
    const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() pid')).rows[0].pid
    this.pids.push(pid)
    let retired = false, inFlight = false, cancelWork: Promise<void> | undefined
    const check = () => { if (retired || this.generations.get(client) !== identity) throw new Error('Retired synthetic lease') }
    const log = (event: string, code?: string) => this.events.push({ event, pid, state: client.getTransactionStatus(), ...(code ? { code } : {}) })
    const abort = () => {
      if (!retired && inFlight && this.generations.get(client) === identity && this.cancel && !cancelWork) {
        cancelWork = this.cancel(pid)
        void cancelWork.catch(() => { this.failure = true })
      }
    }
    signal.addEventListener('abort', abort, { once: true })
    const retire = () => {
      check(); retired = true; this.generations.delete(client); this.leased.delete(client)
      signal.removeEventListener('abort', abort)
    }
    const discard = async () => { retire(); log('discard'); client.release(true); await this.clients.get(client)!.closed }
    if (signal.aborted) { await discard(); throw new Error('Cancelled synthetic acquisition') }
    log('acquire'); this.onAcquire?.(pid)
    return {
      identity,
      transactionState: () => {
        if (retired) return 'unknown'
        const status = client.getTransactionStatus()
        return status === 'I' ? 'idle' : status === 'T' ? 'active' : status === 'E' ? 'failed' : 'unknown'
      },
      query: async <T>(sql: string, values: unknown[]) => {
        check(); inFlight = true
        try {
          const result = await client.query(sql, values)
          if (cancelWork) await cancelWork // No late cancellation can follow healthy reuse.
          log(sql === 'COMMIT' || sql === 'ROLLBACK' || sql === 'BEGIN' ? sql : 'query')
          if (sql === 'COMMIT' && this.suppressCommitAcknowledgement) {
            this.suppressCommitAcknowledgement = false
            throw new Error('Synthetic adapter-visible acknowledgement suppressed after actual COMMIT')
          }
          return { rows: result.rows as T[] }
        } catch (error) {
          if (cancelWork) await cancelWork
          const code = (error as { code?: string }).code
          if (code) {
            // ErrorResponse can reject before ReadyForQuery. A public empty
            // query is queued FIFO after it, changes no data/transaction and
            // gives an acknowledged ReadyForQuery barrier without private APIs.
            await client.query('')
            log('error-ready', code)
            if (code === '57014') this.events.push({ event: (error as Error).message === 'canceling statement due to user request'
              ? 'user-cancel' : 'other-cancel', pid, code, state: client.getTransactionStatus() })
          }
          throw error
        } finally { inFlight = false }
      },
      release: async () => {
        check()
        if (inFlight || client.getTransactionStatus() !== 'I') throw new Error('Dirty synthetic release')
        log('release'); retire(); client.release()
      },
      discard,
    }
  }
  async close() {
    if (this.ended) throw new Error('Synthetic pool already closed')
    this.ended = true
    // Only this case's known owned clients; no process discovery or global pool.
    for (const client of this.leased) { this.generations.delete(client); client.release(true) }
    this.leased.clear()
    await this.pool.end()
    await Promise.all([...this.clients.values()].map(value => value.closed))
    if (this.failure || [...this.clients.values()].some(value => !value.ended)) throw new Error('Synthetic driver cleanup incomplete')
    return { clientsClosed: true as const, pids: [...this.pids] }
  }
}
