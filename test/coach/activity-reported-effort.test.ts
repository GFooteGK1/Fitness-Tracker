import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PGlite } from '@electric-sql/pglite'
import { createActivityRecordTool } from '@/app/lib/coach/activity-record-tools'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { mcpActivityFixture, mcpOwnerClient } from '../database/mcp-activity-fixture'

const owner = '11111111-1111-4111-8111-111111111111'
const entityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = '22222222-2222-4222-8222-222222222222'
const policy = { clientId: 'synthetic-client', issuer: 'https://auth.invalid', resource: 'https://socius.invalid/api/mcp' }
function tool(db: SupabaseClient, subject = owner) {
  return createActivityRecordTool(async () => ({ db, principal: {
    ...policy, subject, role: 'authenticated', expiresAt: Date.now() + 60000,
  } }), policy, 'get_activity_record')
}
const source = (id = entityId, revision = 1) => ({ kind: 'saved_revision', entityId: id, revision, field: 'reported_rpe' })
const metadata = (status: string, value: number | null, origin: unknown = source()) => ({
  status, value, source: origin, interpretation: 'retained_report_only',
})

/** Filters and projections execute; bypass mode injects inconsistent adapter responses. */
function mockRead(options: { canonical?: Record<string, any>; revisions?: Record<string, any>[]; bypass?: boolean } = {}) {
  const canonical = options.canonical ?? { id: entityId, user_id: owner, capture_revision: 1, rpe: null,
    workout_date: '2026-10-20', created_at: '2026-10-20T12:00:00Z', blocks: [], notes: 'Canonical note' }
  const revision: Record<string, any> = { user_id: owner, entity_kind: 'workout', original_entity_id: entityId, revision: 1,
    event_at: '2026-10-20T23:40:00-05:00', event_precision: 'timestamp', captured_at: '2026-10-22T12:00:00Z', deleted: false,
    record: { id: entityId, user_id: owner, capture_revision: 1, reported_rpe: 7.5, secret: 'unrelated snapshot content' } }
  const rows: Record<string, Array<Record<string, any>>> = { workouts: [canonical], meals: [canonical], activity_revisions: options.revisions ?? [revision] }
  const traces: Array<{ table: string; columns: string; filters: Array<[string, unknown]> }> = []
  const writes = vi.fn(() => { throw new Error('Read must not write') })
  const db = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: owner } }, error: null })) }, rpc: writes,
    from: (table: keyof typeof rows) => {
      const trace = { table, columns: '', filters: [] as Array<[string, unknown]> }; traces.push(trace)
      const query = {
        select: (columns: string) => { trace.columns = columns; return query },
        eq: (key: string, value: unknown) => { trace.filters.push([key, value]); return query },
        insert: writes, update: writes, delete: writes, upsert: writes,
        maybeSingle: async () => {
          const row = rows[table].find(item => options.bypass || trace.filters.every(([key, value]) =>
            typeof item[key] === 'string' && typeof value === 'string' ? item[key].toLowerCase() === value.toLowerCase() : item[key] === value))
          return { data: row ? Object.fromEntries(trace.columns.split(',').filter(key => Object.hasOwn(row, key))
            .map(key => [key, structuredClone(row[key])])) : null, error: null }
        },
      }
      return query
    },
  }
  return { db: db as unknown as SupabaseClient, traces, writes, canonical, revision }
}
async function read(client: ReturnType<typeof mockRead>, kind: 'workout' | 'meal' = 'workout', id = entityId) {
  const result = await tool(client.db).call({ kind, entityId: id })
  expect(client.writes).not.toHaveBeenCalled()
  expect(JSON.parse(result.content[0].text).activity).toEqual(result.structuredContent.activity)
  return result.structuredContent.activity as any
}

describe('bounded exact-revision reported effort read metadata', () => {
  it.each([0, 0.5, 7.5, 10])('retains the exact report %s without replacing canonical null', async value => {
    const fixture = mockRead(); fixture.revision.record.reported_rpe = value
    const before = structuredClone(fixture.revision)
    const result = await read(fixture)
    expect(result.reportedEffort).toEqual(metadata('reported', value))
    expect(result.record.rpe).toBeNull()
    expect(result.eventPrecision).toBe('timestamp')
    expect(result.eventAt).toBe(fixture.revision.event_at)
    expect(result.capturedAt).toBe(fixture.revision.captured_at)
    expect(result.originalTimezoneOffset).toBeNull()
    expect(JSON.stringify(result)).not.toContain('unrelated snapshot content')
    expect(fixture.revision).toEqual(before)
    expect(fixture.traces[1].filters).toEqual([
      ['user_id', owner], ['entity_kind', 'workout'], ['original_entity_id', entityId], ['revision', 1],
    ])
  })

  it('preserves conflicting canonical fractional effort without substituting either source', async () => {
    const fixture = mockRead(); fixture.canonical.rpe = 6.5
    const result = await read(fixture)
    expect(result.record.rpe).toBe(6.5)
    expect(result.reportedEffort).toEqual(metadata('reported', 7.5))
  })

  it.each(['absent', 'null'])('keeps %s reports unrecorded, without a canonical-value fallback', async state => {
    const fixture = mockRead(); fixture.canonical.rpe = 8
    if (state === 'absent') delete fixture.revision.record.reported_rpe
    else fixture.revision.record.reported_rpe = null
    expect((await read(fixture)).reportedEffort).toEqual(metadata('not_recorded', null))
  })

  it.each(['7.5', true, [], {}, -1, 10.1, NaN, Infinity])('classifies unsupported report %j without coercion or leakage', async value => {
    const fixture = mockRead(); fixture.revision.record.reported_rpe = value
    expect((await read(fixture)).reportedEffort).toEqual(metadata('unsupported', null))
  })

  it('never falls back to an older revision or canonical RPE when the exact snapshot is absent', async () => {
    const fixture = mockRead(); fixture.canonical.capture_revision = 2; fixture.canonical.rpe = 8
    const result = await read(fixture)
    expect(result.reportedEffort).toEqual(metadata('unavailable', null, null))
    expect(result.record.rpe).toBe(8)
    expect(result.eventSource).toBe('canonical_record_only')
    expect(fixture.traces).toHaveLength(2)
    expect(fixture.traces[1].filters.at(-1)).toEqual(['revision', 2])
  })

  it('uses only the exact revision when an older different report also exists', async () => {
    const initial = mockRead()
    const second = { ...structuredClone(initial.revision), revision: 2,
      record: { ...initial.revision.record, capture_revision: 2, reported_rpe: 9.25 } }
    const fixture = mockRead({ canonical: { ...initial.canonical, capture_revision: 2 }, revisions: [initial.revision, second] })
    expect((await read(fixture)).reportedEffort).toEqual(metadata('reported', 9.25, source(entityId, 2)))
  })

  it('accepts an uppercase UUID request for the same canonical identity', async () => {
    expect((await read(mockRead(), 'workout', entityId.toUpperCase())).reportedEffort).toEqual(metadata('reported', 7.5))
  })

  const corruptions: Array<[string, (fixture: ReturnType<typeof mockRead>) => void]> = [
    ['canonical id', f => { f.canonical.id = other; f.revision.original_entity_id = other; f.revision.record.id = other }],
    ['canonical owner', f => { f.canonical.user_id = other }],
    ['envelope owner', f => { f.revision.user_id = other }],
    ['envelope kind', f => { f.revision.entity_kind = 'meal' }],
    ['envelope id', f => { f.revision.original_entity_id = other }],
    ['envelope revision', f => { f.revision.revision = 2 }],
    ['deleted snapshot', f => { f.revision.deleted = true }],
    ['nested owner', f => { f.revision.record.user_id = other }],
    ['nested id', f => { f.revision.record.id = other }],
    ['nested revision', f => { f.revision.record.capture_revision = 2 }],
    ['missing nested revision', f => { delete f.revision.record.capture_revision }],
    ['null nested record', f => { f.revision.record = null }],
    ['array nested record', f => { f.revision.record = [] }],
  ]
  it.each(corruptions)('fails closed on %s even if an adapter ignores filters', async (_label, corrupt) => {
    const fixture = mockRead({ bypass: true }); corrupt(fixture)
    await expect(read(fixture)).rejects.toMatchObject({ status: 503 })
    expect(fixture.writes).not.toHaveBeenCalled()
  })

  it('keeps meal output and snapshot projection unchanged', async () => {
    const fixture = mockRead(); fixture.revision.entity_kind = 'meal'
    const result = await read(fixture, 'meal')
    expect(result).not.toHaveProperty('reportedEffort')
    expect(fixture.traces[1].columns).toBe('user_id,entity_kind,original_entity_id,revision,event_at,event_precision,captured_at,deleted')
  })
})

describe('reported effort from supported current migration fixtures', () => {
  let sql: PGlite
  beforeAll(async () => {
    sql = await mcpActivityFixture()
    await sql.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other])
    await sql.exec('SET ROLE authenticated')
    await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
  }, 30000)
  afterAll(async () => { await sql?.close() })

  it.each([
    { label: 'retained fractional', rpe: null, reported: 7.5 },
    { label: 'current zero', rpe: 0, reported: 0 },
    { label: 'current fractional', rpe: 7.5, reported: 7.5 },
  ])('reads $label without a canonical rewrite or reader writes', async sample => {
    const normalized = normalizeActivity('workout', { workout_date: '2026-10-20', input_text: 'Synthetic source', rpe: sample.rpe,
      blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Synthetic lift', reps: '5-8', weight: '80' }] }] })
    if (sample.rpe === null) normalized.record.reported_rpe = sample.reported
    const client = mcpOwnerClient(sql, owner), requestId = randomUUID()
    const request = await client.db.rpc('begin_logging_request', { p_key: `synthetic-effort:${requestId}`, p_fingerprint: 'e'.repeat(64) })
    expect(request.error).toBeNull()
    const frozen = await client.db.rpc('freeze_logging_request_items', { p_request_id: request.data.id, p_items: [{
      sourceItemId: 'synthetic:0', kind: 'workout', ...normalized,
      provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed'),
      inputMethod: 'manual', eventAt: '2026-10-20', eventPrecision: 'date',
    }] })
    expect(frozen.error).toBeNull()
    const saved = await client.db.rpc('commit_logging_request_item', { p_item_id: frozen.data[0].id })
    expect(saved.error).toBeNull()
    const id = saved.data.entityId
    const stored = async () => (await sql.query<any>(`SELECT to_jsonb(w) canonical,
      (SELECT to_jsonb(r) FROM activity_revisions r WHERE r.original_entity_id=w.id AND r.revision=1) snapshot
      FROM workouts w WHERE w.id=$1`, [id])).rows[0]
    const before = await stored(), reader = mcpOwnerClient(sql, owner)
    const response = await tool(reader.db).call({ kind: 'workout', entityId: id })
    const result = response.structuredContent.activity as any
    expect(result.reportedEffort).toEqual(metadata('reported', sample.reported, source(id)))
    expect(result.record.rpe).toBe(sample.rpe === 7.5 ? 7.5 : null)
    expect(result.record.blocks).toEqual(normalized.record.blocks)
    expect(result.eventPrecision).toBe('date')
    expect(reader.calls).toEqual([])
    expect(await stored()).toEqual(before)
    await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [other])
    await expect(tool(mcpOwnerClient(sql, other).db, other).call({ kind: 'workout', entityId: id })).rejects.toMatchObject({ status: 404 })
    await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
  })
})
