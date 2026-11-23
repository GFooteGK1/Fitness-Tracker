import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { handleCoachingMcp } from '../../app/lib/coach/coaching-mcp-http'
import type { CoachingBearerDependencies, CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'
import { contextClient, contextRows, type ContextRows } from '../fixtures/coaching-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const now = '2026-10-19T00:13:53.447Z'
const config: CoachingOAuthConfig = {
  origin: 'https://socius.synthetic.invalid',
  supabaseUrl: 'https://auth.synthetic.invalid',
  issuer: 'https://auth.synthetic.invalid/auth/v1',
  resource: 'https://socius.synthetic.invalid/api/mcp',
  clientId: '20000000-0000-4000-8000-000000000001',
  publicKey: 'sb_publishable_synthetic',
  redirectUri: 'https://chatgpt.com/connector/oauth/synthetic-callback',
  resourceMetadataUrl: 'https://socius.synthetic.invalid/.well-known/oauth-protected-resource/api/mcp',
}
const resourceUri = 'ui://socius/today-v14.html'
const legacyResourceUris = [
  'ui://socius/today.html', 'ui://socius/today-v2.html', 'ui://socius/today-v4.html',
  'ui://socius/today-v5.html', 'ui://socius/today-v6.html', 'ui://socius/today-v7.html',
  'ui://socius/today-v8.html', 'ui://socius/today-v9.html', 'ui://socius/today-v10.html', 'ui://socius/today-v11.html',
  'ui://socius/today-v12.html', 'ui://socius/today-v13.html',
]
const activityUri = 'ui://socius/activity.html'
const draftUri = 'ui://socius/session-draft-v2.html'
const title = 'Saved easy session'
const today = (args: Record<string, unknown>) => ({ name: 'open_socius_today', arguments: args })
const typical = { stress: 'usual', fatigue: 'usual', sleep: 'usual' }
const legacyAnswers = { ...typical, soreness: 'higher', motivation: 'usual' }
const answers = { stress: 2, fatigue: 4, sleep: 5, soreness: 1, motivation: 5 }
const shadows = { stress: 'higher', fatigue: 'lower', sleep: 'better', soreness: 'higher', motivation: 'higher' }
const storedRatings = { ...shadows, stress_rating: 2, fatigue_rating: 4, sleep_rating: 5, soreness_rating: 1, motivation_rating: 5 }
const localDate = '2026-10-18'
const saveName = 'save_socius_today_check_in'
const saveArguments = { date: localDate, tzOffset: 360, checkIn: answers }
const saveCall = (overrides: Record<string, unknown> = {}) => ({ name: saveName, arguments: { ...saveArguments, ...overrides } })
const checkInTable = 'coach_daily_checkins'

function checkInStorage(records: ContextRows[string] = []) {
  const mismatches = { value: { soreness_rating: 2 }, owner: { user_id: other }, date: { local_date: '2026-10-17' } }
  const storage = { records, failure: null as 'database' | keyof typeof mismatches | null }
  const upsert = vi.fn((row: Record<string, unknown>, options: { onConflict: string }) => {
    expect(options.onConflict).toBe('user_id,local_date')
    return {
      select: (columns: string) => ({
        single: async () => {
          if (storage.failure === 'database') return { data: null, error: { message: 'private check-in storage detail' } }
          const index = records.findIndex(record => record.user_id === row.user_id && record.local_date === row.local_date)
          if (index === -1) records.push({ ...row })
          else {
            const existing = records[index]
            const fields = Object.keys(answers)
            const changesLegacy = !Object.hasOwn(row, 'stress_rating') && fields.some(field => row[field] !== existing[field])
            const cleared = changesLegacy ? Object.fromEntries(fields.map(field => [`${field}_rating`, null])) : {}
            records[index] = { ...existing, ...row, ...cleared }
          }
          const saved = records[index === -1 ? records.length - 1 : index]
          const selected = Object.fromEntries(columns.split(',').map(column => column.trim()).map(column => [column, saved[column]]))
          if (storage.failure) Object.assign(selected, mismatches[storage.failure])
          return { data: selected, error: null }
        },
      }),
    }
  })
  return { storage, upsert }
}

async function connect(subject = owner, setup?: (rows: ContextRows) => void, checkIns?: ReturnType<typeof checkInStorage>) {
  const rows = contextRows()
  rows.workouts = [{ ...workSnapshot().workouts[0], id: 'owner-saved-workout', workout_date: '2026-10-18',
    execution_status: 'completed', rpe: 7.5,
    created_at: '2026-10-18T10:00:00.000Z', updated_at: '2026-10-18T10:00:00.000Z',
    notes: 'private workout notes', input_text: 'private workout attachment' }]
  setup?.(rows)
  for (const records of Object.values(rows)) for (const row of records) row.user_id = subject
  if (checkIns) rows[checkInTable] = checkIns.storage.records
  const fixture = contextClient(rows)
  if (checkIns) {
    const from = vi.mocked(fixture.db.from)
    const original = from.getMockImplementation()!
    from.mockImplementation(table => {
      const query = original(table)
      return table === checkInTable ? Object.assign(query, { upsert: checkIns.upsert }) : query
    })
  }

  // Mock the provider SDK boundary. The mounted handler still checks the claims,
  // current Auth user, and live OAuth session on every protocol request.
  const session = { active: true, authSubject: subject }
  Object.assign(fixture.db.auth, {
    getClaims: async () => ({ data: { claims: {
      iss: config.issuer, aud: config.resource, client_id: config.clientId, sub: subject,
      role: 'authenticated', scope: 'email', session_id: '30000000-0000-4000-8000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 600,
    } }, error: null }),
    getUser: async () => ({ data: { user: { id: session.authSubject } }, error: null }),
  })
  const dependencies: CoachingBearerDependencies = {
    client: () => fixture.db,
    fetch: async (input, init) => {
      expect(String(input)).toBe(`${config.issuer}/oauth/userinfo`)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-token')
      return session.active ? Response.json({ sub: subject }) : new Response(null, { status: 403 })
    },
  }
  const request = (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handleCoachingMcp(new Request(input, init), config, dependencies)
  async function openClient() {
    const client = new Client({ name: 'synthetic-today-client', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: 'Bearer synthetic-token' } },
      fetch: request,
    }))
    return client
  }
  return { ...fixture, client: await openClient(), openClient, request, rows, session }
}

describe('private Socius Today sidebar over authenticated stateless MCP', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', undefined)
    vi.stubEnv('SOCIUS_MCP_ACTIVITY_UI_ENABLED', undefined)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'false')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it.each([undefined, other])('hides Today from a valid connection unless the verified subject matches %s', async pilot => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', pilot)
    vi.stubEnv('SOCIUS_MCP_ACTIVITY_UI_ENABLED', 'true')
    const { client, request, db, writes } = await connect()
    try {
      expect(client.getServerCapabilities()?.resources).toBeUndefined()
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
        'get_coaching_context', 'get_coaching_reference', 'get_activity_history', 'get_activity_record', 'get_activity_write_status',
      ])
      await expect(client.callTool(today({ tzOffset: 360, user_id: pilot }))).rejects.toMatchObject({ code: -32602 })
      await expect(client.callTool(today({ tzOffset: 360, checkIn: typical }))).rejects.toMatchObject({ code: -32602 })
      await expect(client.callTool({ name: 'show_socius_activity', arguments: { date: '2026-10-18', timezone: 'America/Chicago' } }))
        .rejects.toMatchObject({ code: -32602 })
      await expect(client.callTool({ name: 'read_socius_nutrition', arguments: { timezone: 'America/Chicago' } }))
        .rejects.toMatchObject({ code: -32602 })
      for (const uri of [resourceUri, ...legacyResourceUris]) {
        const resource = await request(config.resource, {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'resources/read', params: { uri } }),
        })
        expect(await resource.json()).toMatchObject({ id: 42, error: { code: -32601 } })
      }
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('advertises the read-only app, serves static HTML and opens with empty arguments without reading domain data', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const { client, db, writes } = await connect()
    try {
      expect(client.getServerCapabilities()?.resources).toEqual({})
      expect(client.getInstructions()).toContain('use prepare_today_session_draft before authoring')
      expect(client.getInstructions()).toContain('Factual reads and general coaching references do not authorize a draft.')
      const tools = (await client.listTools()).tools
      expect(tools.find(tool => tool.name === 'get_coaching_context')?.description).toContain('factual context')
      expect(tools.find(tool => tool.name === 'prepare_today_session_draft')?.description).toContain('including on a rest day')
      expect(tools.find(tool => tool.name === 'prepare_today_session_draft')?.description).toContain('any other result or tool error')
      expect(tools).toEqual(expect.arrayContaining([expect.objectContaining({
        name: today({}).name, annotations: expect.objectContaining({ readOnlyHint: true }),
        icons: ['light', 'dark'].map(theme => ({
          src: expect.stringMatching(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/), mimeType: 'image/svg+xml', sizes: ['any'], theme,
        })),
        _meta: expect.objectContaining({
          securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
          ui: expect.objectContaining({ resourceUri }),
          'openai/ui': expect.objectContaining({ entrypoints: [{ type: 'global' }, { type: 'thread' }] }),
        }),
      })]))
      expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true)
      expect(await client.listResources()).toMatchObject({ resources: [
        { uri: resourceUri, mimeType: 'text/html;profile=mcp-app' },
        { uri: draftUri, mimeType: 'text/html;profile=mcp-app' },
      ] })
      const resource = await client.readResource({ uri: resourceUri })
      expect(resource.contents).toMatchObject([{
        uri: resourceUri, mimeType: 'text/html;profile=mcp-app', text: expect.stringContaining('id="whoop-gauges"'),
        _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
      }])
      expect(resource.contents[0]).not.toHaveProperty('_meta.ui.permissions')
      expect(JSON.stringify(resource)).not.toContain(title)
      expect(JSON.stringify(resource)).not.toContain(owner)
      for (const uri of legacyResourceUris) {
        const legacy = await client.readResource({ uri })
        expect(legacy.contents).toEqual(resource.contents.map(content => ({ ...content, uri })))
      }
      await expect(client.readResource({ uri: 'ui://socius/other.html' })).rejects.toThrow()
      await expect(client.callTool(saveCall())).rejects.toMatchObject({ code: -32602 })

      const launch = await client.callTool(today({}))
      expect(launch.isError).not.toBe(true)
      expect(launch._meta?.today).toBeUndefined()
      expect(launch._meta?.activityEnabled).toBeUndefined()
      expect(JSON.stringify(launch)).not.toContain(title)
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('exposes the same-owner Activity tool and static resource only with the Activity flag', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_ACTIVITY_UI_ENABLED', 'true')
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const { client, db, writes } = await connect()
    try {
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
        'create_workout', 'amend_workout', 'create_meal', 'amend_meal',
      ]))
      expect(tools).toContainEqual(expect.objectContaining({
        name: 'show_socius_activity', annotations: expect.objectContaining({ readOnlyHint: true }),
        _meta: expect.objectContaining({ ui: { resourceUri: activityUri, visibility: ['app', 'model'] } }),
      }))
      expect(tools).toContainEqual(expect.objectContaining({
        name: 'read_socius_nutrition', annotations: expect.objectContaining({ readOnlyHint: true }),
        _meta: expect.objectContaining({ ui: { visibility: ['app'] } }),
      }))
      expect((await client.listResources()).resources.map(({ uri }) => uri)).toEqual([resourceUri, activityUri, draftUri])
      const resource = await client.readResource({ uri: activityUri })
      expect(resource.contents).toMatchObject([{
        uri: activityUri, mimeType: 'text/html;profile=mcp-app',
        _meta: { 'openai/ui': { availableDisplayModes: ['inline'] } },
      }])
      expect(JSON.stringify(resource)).not.toContain(owner)
      expect(db.from).not.toHaveBeenCalled()
      const result = await client.callTool(today({ tzOffset: 360 }))
      expect(result._meta?.activityEnabled).toBe(true)
      expect(result._meta?.nutritionEnabled).toBe(true)
      expect(result._meta?.nutritionWritesEnabled).toBe(true)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('keeps Nutrition available with no logging action when writes are disabled', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_ACTIVITY_UI_ENABLED', 'true')
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'false')
    const { client, writes } = await connect()
    try {
      const result = await client.callTool(today({ tzOffset: 360 }))
      expect(result._meta?.nutritionEnabled).toBe(true)
      expect(result._meta?.nutritionWritesEnabled).toBeUndefined()
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('create_meal')
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('hydrates the widget with narrow saved facts for the browser-local date and keeps the model-visible result generic', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const { client, db, traces, writes, session } = await connect()
    try {
      for (const args of [{ tzOffset: 360, user_id: other }, { tzOffset: 841 }, { tzOffset: '360' }]) {
        const result = await client.callTool(today(args))
        expect(result.isError).toBe(true)
        expect(result._meta?.today).toBeUndefined()
      }
      expect(db.from).not.toHaveBeenCalled()

      const result = await client.callTool(today({ tzOffset: 360 }))
      expect(result.isError).not.toBe(true)
      const dashboard = result._meta?.today
      expect(dashboard).toMatchObject({
        date: '2026-10-18', readAt: now, sessionStatus: expect.any(String),
        sessions: [expect.objectContaining({ title })],
        workoutRecommendation: { source: 'accepted_plan', status: 'planned', title },
        lastWorkout: {
          date: '2026-10-18', sessionRpe: 7.5,
          movements: expect.arrayContaining([expect.objectContaining({ name: 'Barbell floor press' })]),
        },
        recentStatus: expect.any(String), recentWork: expect.arrayContaining([expect.any(Object)]),
        recovery: { status: 'stale', lastSyncAt: '2026-10-18T11:00:00.000Z', storedDate: '2026-10-18',
          recoveryScore: 71, sleepPerformance: 82, strainScore: 3, strainStatus: 'stale', strainStoredDate: '2026-10-18' },
      })
      expect(JSON.stringify(dashboard)).toContain('Barbell floor press')
      expect(JSON.stringify(dashboard)).not.toContain('private workout')
      expect(JSON.stringify(dashboard)).not.toContain('token-id-only')
      expect(JSON.stringify(dashboard)).not.toContain('owner-saved-workout')
      expect(JSON.stringify(dashboard)).not.toContain(owner)
      expect(dashboard).not.toHaveProperty('assessmentGuidance')
      expect(JSON.stringify({ content: result.content, structuredContent: result.structuredContent })).not.toMatch(/Saved easy session|Barbell floor press/)
      expect(traces.length).toBeGreaterThan(0)
      expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === owner))).toBe(true)

      session.active = false
      const reads = traces.length
      await expect(client.callTool(today({ tzOffset: 360 }))).rejects.toThrow()
      expect(traces).toHaveLength(reads)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('retires check-in previews and keeps Today hydration factual', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const { client, db, traces, writes } = await connect(owner, data => {
      data.whoop_recovery[0].recovery_score = 12
    })
    try {
      for (const args of [{ checkIn: typical }, { tzOffset: 360, checkIn: answers }]) {
        const result = await client.callTool(today(args))
        expect(result.isError).toBe(true)
        expect(result._meta?.today).toBeUndefined()
        expect(result.content).toEqual([{ type: 'text', text: 'Reopen Today to view your saved check-in.' }])
      }
      expect(db.from).not.toHaveBeenCalled()

      const initial = await client.callTool(today({ tzOffset: 360 }))
      expect(initial._meta?.today).toMatchObject({ checkIn: { status: 'missing' },
        sessions: [expect.objectContaining({ title, status: 'planned' })],
        recovery: { recoveryScore: 12, status: 'stale' } })
      expect(initial._meta?.today).not.toHaveProperty('assessmentGuidance')
      expect(initial.content).toEqual([{ type: 'text', text: 'SociusFit Today opened.' }])
      expect(initial.structuredContent).toBeUndefined()
      const cached = await client.callTool(today({ tzOffset: 360, checkIn: typical }))
      expect(cached._meta?.today).toMatchObject({ checkIn: { status: 'missing' }, assessmentGuidance: {
        title: 'Open the updated Today view', summary: expect.stringContaining('Reopen Today'), actions: [], reasons: [],
      } })
      expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === owner))).toBe(true)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('loads an unscheduled day without turning it into a second recommendation path', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const { client, writes } = await connect(owner, rows => {
      rows.prescribed_sessions = []
      rows.workouts = []
      rows.whoop_tokens = []
    })
    try {
      const result = await client.callTool(today({ tzOffset: 360 }))
      expect(result._meta?.today).toMatchObject({ sessions: [], recovery: { status: 'disconnected' } })
      expect(result._meta?.today).not.toHaveProperty('assessmentGuidance')
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('keeps the same local-day answers across Today, a fresh chat, and a same-day correction', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const foreign = { user_id: other, local_date: localDate, ...legacyAnswers, stress: 'higher' }
    const checkIns = checkInStorage([foreign])
    const { client, openClient, traces, writes } = await connect(owner, data => {
      data.workouts[0].workout_date = '2026-10-17'
    }, checkIns)
    try {
      const { tools } = await client.listTools()
      expect(tools).toContainEqual(expect.objectContaining({
        name: saveName, annotations: expect.objectContaining({ readOnlyHint: false }),
        _meta: expect.objectContaining({ ui: expect.objectContaining({ visibility: ['app'] }) }),
      }))
      const initial = await client.callTool(today({ tzOffset: 360 }))
      expect(initial._meta).toMatchObject({ checkInEnabled: true, today: {
        date: localDate, assessment: { status: 'missing' }, checkIn: { status: 'missing' },
      } })
      expect(checkIns.upsert).not.toHaveBeenCalled()

      const saved = await client.callTool(saveCall())
      expect(saved.isError).not.toBe(true)
      expect(saved._meta?.savedCheckIn).toEqual({ date: localDate, checkIn: answers })
      expect(saved.structuredContent).toBeUndefined()
      expect(JSON.stringify(saved.content)).not.toMatch(/soreness|motivation|10000000-0000/)
      expect(checkIns.upsert).toHaveBeenCalledTimes(1)
      expect(checkIns.upsert).toHaveBeenCalledWith({ user_id: owner, local_date: localDate, ...storedRatings }, { onConflict: 'user_id,local_date' })

      const fresh = await openClient()
      try {
        const hydrated = await fresh.callTool(today({ tzOffset: 360 }))
        expect(hydrated._meta?.today).toMatchObject({
          date: localDate, assessment: { status: 'saved', scale: '1-to-5', checkIn: answers },
          checkIn: { status: 'saved', checkIn: shadows },
          assessmentGuidance: { title: 'Check-in saved', summary: 'In SociusFit chat, ask “Draft today’s session”.', reasons: [], actions: [] },
        })
        const chatCall = { name: 'get_coaching_context', arguments: { tzOffset: 360 } }
        const context = await fresh.callTool(chatCall)
        expect(context.structuredContent).toMatchObject({ context: { localDate,
          dailyCheckIn: { status: 'saved', scale: '1-to-5', checkIn: answers },
        } })
        expect(context.structuredContent).not.toHaveProperty('context.assessmentGuidance')
        expect(JSON.stringify(context.structuredContent)).not.toContain(other)
        const legacyPreview = await fresh.callTool(today({ tzOffset: 360, checkIn: typical }))
        expect(legacyPreview._meta?.today).toMatchObject({ checkIn: { status: 'saved', checkIn: shadows },
          assessmentGuidance: { title: 'Open the updated Today view', reasons: [], actions: [] } })
        expect(checkIns.upsert).toHaveBeenCalledTimes(1)

        const correction = { ...answers, soreness: 2 }
        const corrected = await fresh.callTool(saveCall({ checkIn: correction }))
        expect(corrected._meta?.savedCheckIn).toEqual({ date: localDate, checkIn: correction })
        expect(checkIns.storage.records).toEqual([foreign, { user_id: owner, local_date: localDate, ...storedRatings, soreness_rating: 2 }])
        const readBack = await client.callTool(today({ tzOffset: 360 }))
        expect(readBack._meta?.today).toMatchObject({ assessment: { scale: '1-to-5', checkIn: correction },
          checkIn: { checkIn: shadows }, assessmentGuidance: { title: 'Check-in saved' },
        })
        const contextAfterCorrection = await fresh.callTool(chatCall)
        expect(contextAfterCorrection.structuredContent).toMatchObject({ context: { dailyCheckIn: { checkIn: correction } } })
        expect(contextAfterCorrection.structuredContent).not.toHaveProperty('context.assessmentGuidance')

        vi.setSystemTime('2026-10-19T06:00:00.000Z')
        const nextDay = await fresh.callTool(today({ tzOffset: 360 }))
        expect(nextDay._meta?.today).toMatchObject({ date: '2026-10-19', checkIn: { status: 'missing' } })
        expect(nextDay._meta?.today).not.toHaveProperty('assessmentGuidance')
        const nextDayChat = await fresh.callTool(chatCall)
        expect(nextDayChat.structuredContent).toMatchObject({ context: { localDate: '2026-10-19', dailyCheckIn: { status: 'missing' } } })
        const lateSave = await fresh.callTool(saveCall())
        expect(lateSave.isError).toBe(true)
        expect(lateSave._meta?.savedCheckIn).toBeUndefined()
        expect(checkIns.upsert).toHaveBeenCalledTimes(2)
      } finally { await fresh.close() }

      const readTraces = traces.filter(trace => trace.table === checkInTable && trace.columns)
      expect(readTraces.length).toBeGreaterThan(0)
      expect(readTraces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === owner)
        && trace.filters.some(([key]) => key === 'local_date'))).toBe(true)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('hides and rejects the save tool for a valid non-pilot account even when other writes are enabled', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const checkIns = checkInStorage([{ user_id: owner, local_date: localDate, ...legacyAnswers }])
    const { client, writes } = await connect(other, undefined, checkIns)
    try {
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toContain('create_meal')
      expect(tools.map(tool => tool.name)).not.toContain(saveName)
      await expect(client.callTool(saveCall())).rejects.toMatchObject({ code: -32602 })
      const context = await client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 360 } })
      expect(context.structuredContent).toMatchObject({ context: { dailyCheckIn: { status: 'missing' } } })
      expect(checkIns.upsert).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('reads exact historical relative answers and accepts an explicit cached-widget correction', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const checkIns = checkInStorage([{ user_id: owner, local_date: localDate, ...legacyAnswers }])
    const { client } = await connect(owner, undefined, checkIns)
    try {
      const before = await client.callTool(today({ tzOffset: 360 }))
      expect(before._meta?.today).toMatchObject({
        assessment: { status: 'saved', scale: 'relative-to-usual', checkIn: legacyAnswers },
        checkIn: { status: 'saved', checkIn: legacyAnswers },
      })
      const newSave = await client.callTool(saveCall())
      expect(newSave._meta?.savedCheckIn).toEqual({ date: localDate, checkIn: answers })
      const sameLegacySave = await client.callTool(saveCall({ checkIn: shadows }))
      expect(sameLegacySave._meta?.savedCheckIn).toEqual({ date: localDate, checkIn: shadows })
      const precise = await client.callTool(today({ tzOffset: 360 }))
      expect(precise._meta?.today).toMatchObject({ assessment: { status: 'saved', scale: '1-to-5', checkIn: answers } })
      const oldSave = await client.callTool(saveCall({ checkIn: legacyAnswers }))
      expect(oldSave._meta?.savedCheckIn).toEqual({ date: localDate, checkIn: legacyAnswers })
      const after = await client.callTool(today({ tzOffset: 360 }))
      expect(after._meta?.today).toMatchObject({
        assessment: { status: 'saved', scale: 'relative-to-usual', checkIn: legacyAnswers },
        checkIn: { status: 'saved', checkIn: legacyAnswers },
      })
      expect(checkIns.storage.records).toHaveLength(1)
    } finally { await client.close() }
  })

  it.each([
    { action: 'recover', expected: 'Review before training' },
    { action: 'unknown', expected: 'Training safety status unavailable' },
  ])('keeps an old widget handoff consistent with the $action safety state', async ({ action, expected }) => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const checkIns = checkInStorage([{ user_id: owner, local_date: localDate, ...storedRatings }])
    const { client, writes } = await connect(owner, rows => {
      rows.coach_weekly_reviews = [{ id: 'review', program_id: 'program-one', base_plan_version_id: 'accepted-one',
        review_revision: 1, action, created_at: '2026-10-18T10:00:00.000Z' }]
    }, checkIns)
    try {
      const response = await client.callTool(today({ tzOffset: 360 }))
      expect(response._meta?.today).toMatchObject({
        workoutRecommendation: { reviewBeforeTraining: true, title: expected },
        assessmentGuidance: { title: expected, actions: [], reasons: [] },
      })
      expect(JSON.stringify(response._meta?.today)).not.toContain('Draft today’s session')
      expect(writes).not.toHaveBeenCalled()
      expect(checkIns.upsert).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('rejects invalid input and a mismatched authenticated subject before writing', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const checkIns = checkInStorage()
    const { client, session, writes, db } = await connect(owner, undefined, checkIns)
    try {
      for (const invalid of [
        { user_id: other }, { date: '2026-10-19' }, { date: '2026-10-17' }, { date: '2026-02-30' },
        { tzOffset: 841 }, { tzOffset: '360' }, { checkIn: typical }, { checkIn: { ...answers, soreness: 'bad' } },
        { checkIn: { ...answers, stress: 0 } }, { checkIn: { ...answers, sleep: 6 } },
        { checkIn: { ...answers, fatigue: 4.5 } }, { checkIn: { ...answers, motivation: '5' } },
        { checkIn: { ...answers, user_id: other } },
      ]) {
        const rejected = await client.callTool(saveCall(invalid))
        expect(rejected.isError).toBe(true)
        expect(rejected._meta?.savedCheckIn).toBeUndefined()
      }
      session.authSubject = other
      await expect(client.callTool(saveCall())).rejects.toThrow()
      expect(db.from).not.toHaveBeenCalled()
      expect(checkIns.upsert).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each(['database', 'value', 'owner', 'date'] as const)('withholds a save receipt on a %s acknowledgement failure', async failure => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const checkIns = checkInStorage()
    checkIns.storage.failure = failure
    const { client, writes } = await connect(owner, undefined, checkIns)
    try {
      const result = await client.callTool(saveCall())
      expect(result.isError).toBe(true)
      expect(result._meta?.savedCheckIn).toBeUndefined()
      expect(JSON.stringify(result.content)).not.toContain('private check-in storage detail')
      const reread = await client.callTool(today({ tzOffset: 360 }))
      expect(reread._meta?.today).toMatchObject({ assessment: failure === 'database'
        ? { status: 'missing' }
        : { status: 'saved', scale: '1-to-5', checkIn: answers } })
      expect(checkIns.upsert).toHaveBeenCalledTimes(1)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })
})
