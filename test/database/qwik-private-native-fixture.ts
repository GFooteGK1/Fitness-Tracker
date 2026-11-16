/** Test-only native PostgreSQL transport. No DSN, installation, live role or
 * provider client. The caller must separately qualify all emitted race evidence. */
import { PGlite } from '@electric-sql/pglite'
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { qwikPrivateFixture } from './qwik-private-fixture'

export const nativeEligible = process.platform === 'linux' && process.env.GITHUB_ACTIONS === 'true'
  && process.env.SOCIUS_QWIK_NATIVE_POSTGRES === 'true'
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

/** Record and FORWARD the actual maintained fixture, including its intentional
 * repeated recommendation migration. Restore interception before closing every
 * observed preparer, also if a migration throws. No SQL is rewritten. */
export async function collectPrivateNativePlan() {
  const prototype = PGlite.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'exec')
  const original = prototype.exec
  const statements: string[] = [], engines = new Set<PGlite>()
  let failure: unknown, failed = false, embeddedServerVersion = ''
  const closeFailures: unknown[] = []
  Object.defineProperty(prototype, 'exec', { configurable: true, writable: true,
    value: function (this: PGlite, ...args: Parameters<PGlite['exec']>) {
      engines.add(this); statements.push(args[0])
      return original.apply(this, args)
    } })
  try {
    const preparer = await qwikPrivateFixture()
    embeddedServerVersion = (await preparer.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version
  }
  catch (error) { failed = true; failure = error }
  finally {
    if (descriptor) Object.defineProperty(prototype, 'exec', descriptor)
    else delete (prototype as unknown as { exec?: unknown }).exec
    for (const engine of engines) {
      try { await engine.close() } catch (error) { closeFailures.push(error) }
    }
  }
  if (failed) {
    if (closeFailures.length) throw new AggregateError([failure, ...closeFailures], 'SQL preparation and owned close failed')
    throw failure
  }
  if (closeFailures.length) throw new Error('Synthetic SQL preparer failed to close', { cause: closeFailures[0] })
  if (!engines.size || !statements.length) throw new Error('No maintained fixture SQL was recorded')
  return { statements, sha256: digest(JSON.stringify(statements)), closedPreparers: engines.size, embeddedServerVersion }
}

/** Single-pass placeholders, never rescanning replacement strings ($1/$10).
 * Values come only from hand-authored synthetic fixture helpers. */
export function nativeSql(sql: string, params: unknown[] = []): string {
  const literal = (value: unknown): string => {
    if (value === null) return 'NULL'
    if (value instanceof Uint8Array) return `decode('${Buffer.from(value).toString('hex')}','hex')`
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('Unsafe synthetic SQL number')
      return String(value)
    }
    if (typeof value === 'string') {
      if (value.includes('\0')) throw new Error('NUL in synthetic SQL string')
      return "'" + value.replaceAll("'", "''") + "'"
    }
    if (value && typeof value === 'object') return literal(JSON.stringify(value)) + '::jsonb'
    throw new Error('Unsupported synthetic SQL parameter')
  }
  return sql.replace(/\$(\d+)\b/g, (_match, index: string) => {
    const position = Number(index) - 1
    if (!Number.isSafeInteger(position) || position < 0 || position >= params.length) throw new Error('Missing synthetic SQL parameter')
    return literal(params[position])
  })
}

export class NativeSqlError extends Error {
  readonly sqlState: string | undefined
  constructor(readonly exitCode: number | null, stderr: string) {
    const line = stderr.split('\n').find(value => /(?:ERROR|FATAL):/.test(value)) ?? 'Native child closed without a result'
    super('Synthetic PostgreSQL: ' + line.slice(0, 250))
    this.sqlState = /(?:ERROR|FATAL):\s+([A-Z0-9]{5}):/.exec(line)?.[1]
  }
}

type Pending = { start: string; end: string; started: boolean; lines: string[];
  resolve: (lines: string[]) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }
export class NativeSession {
  readonly child: ChildProcessWithoutNullStreams
  readonly closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  pid = 0
  private ended = false
  private closing = false
  private pending: Pending | undefined
  private buffer = ''
  private stderr = ''
  constructor(bin: string, args: string[], env: NodeJS.ProcessEnv, private deadline: number) {
    this.child = spawn(join(bin, 'psql'), args, { env, stdio: 'pipe' })
    this.child.stdout.on('data', value => this.output(String(value)))
    this.child.stderr.on('data', value => {
      this.stderr += String(value)
      if (this.stderr.length > 262144) this.child.kill('SIGKILL')
    })
    this.child.on('error', error => {
      if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined }
    })
    this.child.stdin.on('error', error => {
      if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined }
    })
    this.closed = new Promise(resolve => this.child.once('close', (code, signal) => {
      this.ended = true
      if (this.pending) {
        clearTimeout(this.pending.timer)
        this.pending.reject(new NativeSqlError(code, this.stderr)); this.pending = undefined
      }
      resolve({ code, signal })
    }))
  }
  setDeadline(deadline: number) { this.deadline = deadline }
  isClosed() { return this.ended }
  private output(chunk: string) {
    this.buffer += chunk
    if (this.buffer.length > 1048576) { this.child.kill('SIGKILL'); return }
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, ''); this.buffer = this.buffer.slice(newline + 1)
      const pending = this.pending
      if (!pending) continue
      if (line === pending.start) { pending.started = true; continue }
      if (line === pending.end) {
        clearTimeout(pending.timer); this.pending = undefined; pending.resolve(pending.lines); continue
      }
      if (pending.started && line.length) pending.lines.push(line)
    }
  }
  private command(sql: string): Promise<string[]> {
    if (this.ended || this.pending) throw new Error('Unavailable or busy owned native session')
    const remaining = Math.floor(this.deadline - performance.now())
    if (remaining <= 0) throw new Error('Synthetic native case deadline exhausted')
    const token = randomUUID().replaceAll('-', ''), start = 'QWIK_BEGIN_' + token, end = 'QWIK_END_' + token
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), Math.min(8000, remaining))
      this.pending = { start, end, started: false, lines: [], resolve, reject, timer }
      this.child.stdin.write(`\\echo ${start}\n${sql}\n\\echo ${end}\n`)
    })
  }
  // PGlite exec treats its protocol boundary as end-of-input. psql needs a
  // delimiter even for maintained exec units ending in a comment/no semicolon.
  async exec(sql: string) { await this.command(sql + '\n;') }
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const statement = nativeSql(sql, params).replace(/;\s*$/, '')
    if (!/^\s*(SELECT|WITH)\b/i.test(statement)) { await this.exec(statement + ';'); return { rows: [] } }
    const lines = await this.command(`SELECT coalesce(jsonb_agg(q),'[]'::jsonb)::text FROM (${statement}) q;`)
    if (lines.length !== 1) throw new Error('Ambiguous synthetic PostgreSQL JSON framing')
    const rows: unknown = JSON.parse(lines[0])
    if (!Array.isArray(rows)) throw new Error('Invalid synthetic PostgreSQL row shape')
    return { rows: rows as T[] }
  }
  async initialize() {
    await this.exec('SET standard_conforming_strings=on;')
    this.pid = Number((await this.query<{ pid: number }>('SELECT pg_backend_pid() pid')).rows[0].pid)
    if (!Number.isSafeInteger(this.pid) || this.pid <= 0) throw new Error('Native backend PID missing')
    return this
  }
  /** Exact owned handle only. ROLLBACK/quit first, then a bounded kill fallback. */
  async close() {
    if (!this.ended && !this.closing) { this.closing = true; this.child.stdin.end('ROLLBACK;\n\\q\n') }
    const timer = setTimeout(() => { if (!this.ended) this.child.kill('SIGKILL') }, 1500)
    try { return await this.closed } finally { clearTimeout(timer) }
  }
}

const run = promisify(execFile)
export class PrivateNativeFixture {
  admin!: NativeSession
  root = ''
  metadata: Record<string, unknown> = { schemaVersion: 1, kind: 'qwik-private-native-qualification', setupComplete: false }
  private bin = ''
  private socket = ''
  private env: NodeJS.ProcessEnv = { NODE_ENV: 'test' }
  private server: ReturnType<typeof spawn> | undefined
  private serverClosed: Promise<unknown> | undefined
  private serverEnded = false
  private serverFailed = false
  private readonly sessions = new Set<NativeSession>()
  private args() { return ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
    '-h', this.socket, '-p', '55433', '-U', 'qwik_test_admin', '-d', 'postgres'] }
  async start() {
    if (!nativeEligible || process.getuid?.() === 0) throw new Error('Native fixture requires nonroot disposable Linux CI')
    const setupDeadline = performance.now() + 25000, base = '/usr/lib/postgresql'
    const versions = existsSync(base) ? readdirSync(base).filter(value => /^\d+$/.test(value) && Number(value) >= 17)
      .sort((a, b) => a === b ? 0 : a === '17' ? -1 : b === '17' ? 1 : Number(b) - Number(a)) : []
    const found = versions.map(version => join(base, version, 'bin')).find(path => ['postgres', 'initdb', 'psql'].every(name => existsSync(join(path, name))))
    if (!found) throw new Error('Preinstalled PostgreSQL >=17 unavailable; no installation attempted')
    this.bin = realpathSync(found)
    if (!/^\/usr\/lib\/postgresql\/\d+\/bin$/.test(this.bin)) throw new Error('Unexpected native executable provenance')
    const temp = realpathSync(tmpdir())
    this.root = mkdtempSync(join(temp, 'socius-qwik-pg-'))
    if (!realpathSync(this.root).startsWith(temp + '/')) throw new Error('Native fixture escaped its temporary root')
    writeFileSync(join(this.root, 'fixture-marker.json'), JSON.stringify({ kind: 'qwik-native-disposable-v1' }), { flag: 'wx', mode: 0o600 })
    this.socket = join(this.root, 'socket'); mkdirSync(this.socket, { mode: 0o700 })
    if (Buffer.byteLength(this.socket) > 85) throw new Error('Private socket path exceeds bounded native fixture length')
    const home = join(this.root, 'home'), config = join(this.root, 'config')
    mkdirSync(home, { mode: 0o700 }); mkdirSync(config, { mode: 0o700 })
    const passfile = join(config, 'pgpass'), service = join(config, 'pg_service.conf')
    writeFileSync(passfile, '', { mode: 0o600 }); writeFileSync(service, '', { mode: 0o600 })
    this.env = { NODE_ENV: 'test', PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: this.root, HOME: home,
      PGPASSFILE: passfile, PGSERVICEFILE: service, PGSYSCONFDIR: config,
      PGSSLMODE: 'disable', PGGSSENCMODE: 'disable', PGCONNECT_TIMEOUT: '3' }
    const plan = await collectPrivateNativePlan() // Fully closed before native replay.
    writeFileSync(join(this.root, 'bootstrap.sql'), plan.statements.join('\n;\n'), { flag: 'wx', mode: 0o600 })
    const remaining = Math.floor(setupDeadline - performance.now())
    if (remaining <= 0) throw new Error('Native fixture preparation deadline exhausted')
    await run(join(this.bin, 'initdb'), ['-D', join(this.root, 'data'), '--username=qwik_test_admin', '--no-locale',
      '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject'], { env: this.env, timeout: Math.min(15000, remaining), maxBuffer: 262144 })
    this.server = spawn(join(this.bin, 'postgres'), ['-D', join(this.root, 'data'), '-k', this.socket, '-h', '', '-p', '55433', '-F'],
      { env: this.env, stdio: 'ignore' })
    this.server.on('error', () => { this.serverFailed = true })
    this.serverClosed = new Promise(resolve => this.server!.once('close', (code, signal) => { this.serverEnded = true; resolve({ code, signal }) }))
    // Native readiness observation only, bounded by the original setup envelope.
    let ready = false
    for (let attempt = 0; attempt < 100 && performance.now() < setupDeadline; attempt++) {
      try {
        const result = await run(join(this.bin, 'psql'), [...this.args(), '-c', 'SELECT 1'],
          { env: this.env, timeout: Math.min(1000, Math.max(1, setupDeadline - performance.now())), maxBuffer: 4096 })
        ready = result.stdout.trim() === '1'; if (ready) break
      } catch { if (this.serverEnded || this.serverFailed) break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    if (!ready) throw new Error('Native fixture server did not become ready')
    this.admin = await this.session(setupDeadline)
    for (const statement of plan.statements) await this.admin.exec(statement)
    const version = (await this.admin.query<{ version: string }>("SELECT current_setting('server_version') version")).rows[0]?.version
    const git = async (revision: string) => (await run('git', ['rev-parse', revision],
      { env: this.env, timeout: Math.min(2000, Math.max(1, setupDeadline - performance.now())), maxBuffer: 4096 })).stdout.trim()
    const actualHead = await git('HEAD'), actualTree = await git('HEAD^{tree}')
    if (!/^[a-f0-9]{40}$/.test(actualHead) || !/^[a-f0-9]{40}$/.test(actualTree)) throw new Error('Native checkout identity unavailable')
    const sourceFiles = ['package-lock.json', 'app/lib/coach/qwik-exact-capture.ts', 'app/lib/coach/activity-measurement-patch.ts',
      'app/lib/coach/qwik-private-original.ts', 'docs/architecture/ARCHITECTURE-MAP.md',
      'docs/migrations/qwik-private-original-preparation.sql', 'docs/plans/qwik-private-original-preparation-2026-11-16.md',
      'test/coach/rep-recording-persistence.test.ts', 'test/coach/qwik-private-durability.test.ts',
      'test/coach/qwik-private-original.test.ts', 'test/fixtures/qwik-private-fresh-reader.cjs', 'test/database/qwik-private-fixture.ts',
      'test/database/qwik-private-persistence.test.ts',
      'test/database/qwik-private-native-fixture.ts', 'test/database/qwik-private-native-fixture.test.ts',
      'test/database/qwik-private-postgres-concurrency.test.ts']
    const expected = (key: string) => /^[a-f0-9]{40}$/.test(process.env[key] ?? '') ? process.env[key] : null
    const postgresSha256 = digest(readFileSync(join(this.bin, 'postgres')))
    this.metadata = { schemaVersion: 1, kind: 'qwik-private-native-qualification', setupComplete: true, node: process.version,
      actualCheckoutHead: actualHead, actualCheckoutTree: actualTree,
      expectedPullRequestHead: expected('SOCIUS_QWIK_PR_HEAD_SHA'), expectedPullRequestBase: expected('SOCIUS_QWIK_PR_BASE_SHA'),
      sourceSHA256: Object.fromEntries(sourceFiles.map(path => [path, digest(readFileSync(path))])),
      serverVersion: version, targetMajor: 17, fallbackMajor: !String(version).startsWith('17.'),
      embeddedServerVersion: plan.embeddedServerVersion, sqlPlanSHA256: plan.sha256, statementCount: plan.statements.length,
      preparersClosed: plan.closedPreparers, engine: { bin: this.bin, postgresSha256, transport: 'private Unix socket; TCP disabled' } }
    console.info('[qwik-native-setup] ' + JSON.stringify({ version, transport: 'private Unix socket; TCP disabled',
      bin: this.bin, postgresSha256,
      bootstrapSha256: plan.sha256, statements: plan.statements.length, preparersClosed: plan.closedPreparers, coordinatorPid: this.admin.pid }))
  }
  async session(deadline: number) {
    const session = new NativeSession(this.bin, this.args(), this.env, deadline)
    this.sessions.add(session)
    try { return await session.initialize() }
    catch (error) {
      try { await session.close() } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native initialization/cleanup failed') }
      throw error
    }
  }
  async closeSessions(sessions: NativeSession[]) { await Promise.all(sessions.map(session => session.close())) }
  async close() {
    let failure: unknown
    try { await this.closeSessions([...this.sessions]) } catch (error) { failure = error }
    if (this.server && !this.serverEnded) {
      this.server.kill('SIGTERM')
      const timer = setTimeout(() => { if (!this.serverEnded) this.server!.kill('SIGKILL') }, 4000)
      try { await this.serverClosed } finally { clearTimeout(timer) }
    }
    const result = { ownedClientsClosed: [...this.sessions].every(session => session.isClosed()),
      clusterStopped: this.server ? this.serverEnded : true }
    console.info('[qwik-native-cleanup] ' + JSON.stringify(result))
    // No recursive deletion; only this CI VM's synthetic artifacts remain.
    if (failure) throw failure
    return result
  }
}

/** Only a type adapter. All exec/query operations still execute native SQL on
 * this persistent connection, preserving the maintained helper's ROLE/GUC. */
export const fixtureDb = (session: NativeSession) => session as unknown as PGlite
