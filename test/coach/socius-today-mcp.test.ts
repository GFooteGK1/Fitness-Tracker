import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { handleCoachingMcp } from '../../app/lib/coach/coaching-mcp-http'
import type { CoachingBearerDependencies, CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'
import { contextClient, contextRows } from '../fixtures/coaching-context'
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
const resourceUri = 'ui://socius/today.html'
const title = 'Saved easy session'
const today = (args: Record<string, unknown>) => ({ name: 'open_socius_today', arguments: args })

async function connect(subject = owner) {
  const rows = contextRows()
  rows.workouts = [{ ...workSnapshot().workouts[0], id: 'owner-saved-workout', workout_date: '2026-10-18',
    created_at: '2026-10-18T10:00:00.000Z', updated_at: '2026-10-18T10:00:00.000Z',
    notes: 'private workout notes', input_text: 'private workout attachment' }]
  for (const records of Object.values(rows)) for (const row of records) row.user_id = subject
  const fixture = contextClient(rows)

  // Mock the provider SDK boundary. The mounted handler still checks the claims,
  // current Auth user, and live OAuth session on every protocol request.
  const session = { active: true }
  Object.assign(fixture.db.auth, {
    getClaims: async () => ({ data: { claims: {
      iss: config.issuer, aud: config.resource, client_id: config.clientId, sub: subject,
      role: 'authenticated', scope: 'email', session_id: '30000000-0000-4000-8000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 600,
    } }, error: null }),
    getUser: async () => ({ data: { user: { id: subject } }, error: null }),
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
  const client = new Client({ name: 'synthetic-today-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), {
    requestInit: { headers: { Authorization: 'Bearer synthetic-token' } },
    fetch: request,
  }))
  return { ...fixture, client, request, session }
}

describe('private Socius Today sidebar over authenticated stateless MCP', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', undefined)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'false')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it.each([undefined, other])('hides Today from a valid connection unless the verified subject matches %s', async pilot => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', pilot)
    const { client, request, db, writes } = await connect()
    try {
      expect(client.getServerCapabilities()?.resources).toBeUndefined()
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
        'get_coaching_context', 'get_coaching_reference', 'get_activity_record', 'get_activity_write_status',
      ])
      await expect(client.callTool(today({ tzOffset: 360, user_id: pilot }))).rejects.toMatchObject({ code: -32602 })
      const resource = await request(config.resource, {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'resources/read', params: { uri: resourceUri } }),
      })
      expect(await resource.json()).toMatchObject({ id: 42, error: { code: -32601 } })
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('advertises the read-only app, serves static HTML and opens with empty arguments without reading domain data', async () => {
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    const { client, db, writes } = await connect()
    try {
      expect(client.getServerCapabilities()?.resources).toEqual({})
      const tools = (await client.listTools()).tools
      expect(tools).toEqual(expect.arrayContaining([expect.objectContaining({
        name: today({}).name, annotations: expect.objectContaining({ readOnlyHint: true }),
        _meta: expect.objectContaining({
          securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
          ui: expect.objectContaining({ resourceUri }),
          'openai/ui': expect.objectContaining({ entrypoints: [{ type: 'global' }] }),
        }),
      })]))
      expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true)
      expect(await client.listResources()).toMatchObject({ resources: [{ uri: resourceUri, mimeType: 'text/html;profile=mcp-app' }] })
      const resource = await client.readResource({ uri: resourceUri })
      expect(resource.contents).toMatchObject([{ uri: resourceUri, mimeType: 'text/html;profile=mcp-app', text: expect.stringContaining('<html') }])
      expect(JSON.stringify(resource)).not.toContain(title)
      expect(JSON.stringify(resource)).not.toContain(owner)
      await expect(client.readResource({ uri: 'ui://socius/other.html' })).rejects.toThrow()

      const launch = await client.callTool(today({}))
      expect(launch.isError).not.toBe(true)
      expect(launch._meta?.today).toBeUndefined()
      expect(JSON.stringify(launch)).not.toContain(title)
      expect(db.from).not.toHaveBeenCalled()
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
        recentStatus: expect.any(String), recentWork: expect.arrayContaining([expect.any(Object)]),
        recovery: { status: 'stale', lastSyncAt: '2026-10-18T11:00:00.000Z', storedDate: '2026-10-18' },
      })
      expect(JSON.stringify(dashboard)).toContain('Barbell floor press')
      expect(JSON.stringify(dashboard)).not.toContain('private workout')
      expect(JSON.stringify(dashboard)).not.toContain('token-id-only')
      expect(JSON.stringify(dashboard)).not.toContain('owner-saved-workout')
      expect(JSON.stringify(dashboard)).not.toContain(owner)
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
})
