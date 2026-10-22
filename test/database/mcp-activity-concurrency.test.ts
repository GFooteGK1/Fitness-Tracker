import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'

const pieces = vi.hoisted(() => [] as string[])
vi.mock('@electric-sql/pglite', () => ({ PGlite: class { async exec(source: string) { pieces.push(source) } } }))
import { mcpActivityFixture, mcpOwnerClient } from './mcp-activity-fixture'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'

// Opt-in to a separately started disposable cluster only. No env files or hosted DB.
const psql = process.env.MCP_ACTIVITY_TEST_PSQL, port = Number(process.env.MCP_ACTIVITY_TEST_PORT)
const enabled = Boolean(psql && existsSync(psql) && Number.isInteger(port) && port >= 1024 && port <= 65535)
const database = `mcp_activity_test_${randomUUID().replaceAll('-', '')}`
const owner = randomUUID(), other = randomUUID()
const literal = (value: unknown): string => value === null ? 'NULL' : typeof value === 'number' ? String(value)
  : `'${(typeof value === 'string' ? value : JSON.stringify(value)).replaceAll("'", "''")}'`
function execute(source: string, db = database): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(psql!, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db,
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { windowsHide: true, env: { ...process.env, PGPASSWORD: '', PGCONNECT_TIMEOUT: '3' } })
    let output = '', error = ''
    child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { error += bytes })
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim())
      : reject(Object.assign(new Error(error), { code: /ERROR:\s+([A-Z0-9]{5}):/.exec(error)?.[1] })))
    child.stdin.on('error', reject)
    child.stdin.end(source)
  })
}
function connection(actor: string, boundary?: { wait: () => Promise<void>; marker: string }) {
  return { query: async (source: string, values: unknown[] = []) => {
    const substituted = source.replace(/\$(\d+)\b/g, (_, index) => literal(values[Number(index) - 1]))
    const mutation = boundary && /SELECT public\.(commit_logging_request_item|amend_logged_activity)\(/.test(source)
    if (mutation) await boundary.wait()
    const output = await execute(`${mutation ? `BEGIN; SET application_name=${literal(boundary.marker)};` : ''}
      SET ROLE authenticated; SET request.jwt.claim.sub=${literal(actor)};
      SELECT coalesce(json_agg(q),'[]') FROM (${substituted}) q;
      ${mutation ? 'SELECT pg_sleep(0.5); COMMIT;' : ''}`)
    return { rows: JSON.parse(output) }
  } } as unknown as PGlite
}
const policy = { clientId: 'synthetic-native', issuer: 'https://native.invalid', resource: 'https://native.invalid/mcp' }
const field = { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: ['synthetic:native'] }
const provenance = (keys: string[]) => ({ occurrence: field, fields: Object.fromEntries(keys.map(key => [key, field])) })
function tool(name: 'create_meal' | 'amend_meal' | 'create_workout' | 'amend_workout' | 'get_activity_record', actor = owner,
  boundary?: { wait: () => Promise<void>; marker: string }) {
  const db = mcpOwnerClient(connection(actor, boundary), actor).db
  return createActivityRecordTool(async () => ({ db, principal: { ...policy, subject: actor, role: 'authenticated', expiresAt: Date.now() + 60000 } }), policy, name)
}
const activity = (result: any) => result.structuredContent.activity
function barrier() {
  let arrivals = 0, release: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  return { marker: `mcp_race_${randomUUID().replaceAll('-', '')}`, wait: async () => { if (++arrivals === 2) release(); await ready } }
}
async function observeLock<T>(pending: Promise<T>, marker: string): Promise<T> {
  let done = false, observed = false
  const result = pending.finally(() => { done = true })
  for (let i = 0; i < 40 && !done; i++) {
    const output = JSON.parse(await execute(`SELECT json_build_object('waiting',count(*)) FROM pg_stat_activity WHERE application_name=${literal(marker)} AND wait_event_type='Lock';`))
    if (output.waiting > 0) { observed = true; break }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const value = await result
  expect(observed, 'A second independent backend must actually wait on the held mutation transaction').toBe(true)
  return value
}

describe.skipIf(!enabled)('MCP adapters with independent native PostgreSQL backends', () => {
  beforeAll(async () => {
    await execute(`CREATE DATABASE ${database};`, 'postgres')
    await mcpActivityFixture()
    const bootstrap = pieces.join('\n').replace('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
      () => "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    await execute(bootstrap)
    await execute(`INSERT INTO auth.users VALUES (${literal(owner)}),(${literal(other)});`)
  }, 30000)
  afterAll(async () => {
    // Do not issue DROP against any existing database. This UUID-named synthetic DB
    // stays inside the task's stopped disposable cluster for evidence inspection.
    if (enabled) expect(database).toMatch(/^mcp_activity_test_[0-9a-f]{32}$/)
  })
  it.each(['meal', 'workout'] as const)('deduplicates concurrent %s creates and permits only one competing correction', async kind => {
    const record = kind === 'meal' ? { meal_timestamp: '2026-10-20T12:00:00Z', items: [{ food: 'Synthetic', portion: '1 g', protein: 1, carbs: 2, fat: 3, calories: 39 }] }
      : { workout_date: '2026-10-20', input_text: 'Synthetic native session', blocks: [{ block_type: 'STRENGTH', segments: [{ rounds: 1, events: [{ movement_name: 'Synthetic deadlift', performed: { reps: 3, load: { value: 50, unit: 'kg' } } }] }] }] }
    const keys = kind === 'meal' ? ['meal_timestamp', 'items', 'quantities', 'macros'] : ['workout_date', 'input_text', 'blocks', 'quantities']
    const input = { requestId: randomUUID(), record, provenance: provenance(keys) }
    const createBarrier = barrier()
    const created = (await observeLock(Promise.all([tool(`create_${kind}`, owner, createBarrier).call(input), tool(`create_${kind}`, owner, createBarrier).call(input)]), createBarrier.marker)).map(activity)
    expect(created[0].receipt).toEqual(created[1].receipt)
    const entityId = created[0].receipt.entityId
    const count = JSON.parse(await execute(`SELECT json_build_object('count',count(*)) FROM ${kind === 'meal' ? 'meals' : 'workouts'} WHERE id=${literal(entityId)};`))
    expect(count.count).toBe(1)
    const changes = kind === 'meal' ? { meal_timing: 'SNACK' } : { notes: 'synthetic corrected note' }
    const correction = { entityId, expectedRevision: 1, changes, provenance: provenance(Object.keys(changes)) }
    const amendBarrier = barrier()
    const results = await observeLock(Promise.allSettled([tool(`amend_${kind}`, owner, amendBarrier).call({ ...correction, requestId: randomUUID() }), tool(`amend_${kind}`, owner, amendBarrier).call({ ...correction, requestId: randomUUID() })]), amendBarrier.marker)
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason.status).toBe(409)
    expect(activity(await tool('get_activity_record').call({ kind, entityId })).record.capture_revision).toBe(2)
    await expect(tool(`amend_${kind}`, other).call({ ...correction, expectedRevision: 2, requestId: randomUUID() })).rejects.toMatchObject({ status: 404 })
  }, 30000)
})
