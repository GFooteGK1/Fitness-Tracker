import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createCoachingContextMcpServer } from '../../app/lib/coach/coaching-context-mcp'
import type { AuthorizeContextRequest, VerifiedContextPrincipal } from '../../app/lib/coach/coaching-context-tool'
import { contextClient, contextNow, contextOwner } from '../fixtures/coaching-context'

const policy = { clientId: 'synthetic-client', issuer: 'https://synthetic-auth.invalid', resource: 'https://synthetic.invalid/api/mcp', resourceMetadataUrl: 'https://synthetic.invalid/.well-known/oauth-protected-resource/api/mcp' }
const principal = (): VerifiedContextPrincipal => ({ ...policy, subject: contextOwner, role: 'authenticated', expiresAt: Date.parse(contextNow) + 60_000 })

async function localMcp(authorize: AuthorizeContextRequest, jsonResponse = true, writesEnabled = false) {
  const mcp = createCoachingContextMcpServer(authorize, policy, { writesEnabled })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'synthetic-session', enableJsonResponse: jsonResponse })
  await mcp.connect(transport)
  let origin = ''
  const http = createServer((request, response) => {
    if (request.url !== '/mcp' || request.headers.host !== new URL(origin).host || request.headers.origin) {
      response.writeHead(403); response.end(); return
    }
    void transport.handleRequest(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve) })
  const address = http.address()
  if (!address || typeof address === 'string') throw new Error('Loopback test listener unavailable')
  origin = `http://127.0.0.1:${address.port}`
  const wire: Array<{ method: string | undefined; contentType: string | null }> = []
  const clientTransport = new StreamableHTTPClientTransport(new URL('/mcp', origin), {
    fetch: async (input, init) => {
      if (new URL(input).origin !== origin) throw new Error('External request blocked')
      const message = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      const response = await fetch(input, init)
      wire.push({ method: message?.method, contentType: response.headers.get('content-type') })
      return response
    },
  })
  const client = new Client({ name: 'synthetic-context-test', version: '1.0.0' })
  return { client, clientTransport, wire, origin,
    close: async () => { await client.close(); await mcp.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())) } }
}

describe('official SDK MCP over loopback Streamable HTTP, synthetic owner only', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(contextNow)
    vi.stubEnv('SOCIUS_MCP_COACHING_REQUIREMENTS_ENABLED', undefined)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks() })

  it.each([true, false])('initializes, lists read-only tools and retrieves exact saved context (JSON response=%s)', async json => {
    const { db, writes, traces } = contextClient()
    const host = await localMcp(async () => ({ principal: principal(), db }), json)
    try {
      await host.client.connect(host.clientTransport)
      expect(host.client.getServerVersion()).toMatchObject({ name: 'socius-coaching-context', version: '1.0.0' })
      expect(host.clientTransport.sessionId).toBe('synthetic-session')
      const tools = await host.client.listTools()
      expect(tools.tools.map(tool => tool.name)).toEqual(['get_coaching_context', 'get_coaching_reference', 'get_activity_history', 'get_activity_record', 'get_activity_write_status'])
      expect(tools.tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true)
      expect(tools.tools[0].annotations?.readOnlyHint).toBe(true)
      // The standard SDK strips host-specific top-level extensions; its
      // preserved metadata mirror still carries the OAuth declaration.
      expect(tools.tools[0]._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['email'] }])
      const result = await host.client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })
      expect(result.isError).toBe(false)
      expect(result.structuredContent).toMatchObject({ context: { schemaVersion: 1, authority: 'factual_context_only', localDate: '2026-10-18' } })
      expect(JSON.stringify(result)).toContain('Saved easy session')
      expect(JSON.stringify(result)).not.toContain('token-id-only')
      expect(writes).not.toHaveBeenCalled()
      expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === contextOwner))).toBe(true)
      expect(host.wire.map(row => row.method)).toEqual(expect.arrayContaining(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']))
      expect(host.wire.find(row => row.method === 'tools/call')?.contentType).toContain(json ? 'application/json' : 'text/event-stream')
      expect(result.structuredContent).toMatchObject({ context: { coachingReference: { status: 'available', tool: 'get_coaching_reference' } } })
      const priorReads = traces.length
      const reference = await host.client.callTool({ name: 'get_coaching_reference', arguments: { domains: ['isometrics', 'strength'] } })
      expect(reference.isError).toBe(false)
      expect(reference.structuredContent).toMatchObject({ reference: { version: 'external-coaching-0.1.0', selectedDomains: ['strength', 'isometrics'], reference: { authority: 'general_reference_not_athlete_records' } } })
      expect(traces).toHaveLength(priorReads)
      expect(writes).not.toHaveBeenCalled()
      expect(tools.tools[1]._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['email'] }])
      for (const arguments_ of [{ version: 'unknown' }, { domains: ['strength', 'power', 'recovery', 'assessment', 'isometrics'] }, { user_id: 'foreign' }]) {
        expect((await host.client.callTool({ name: 'get_coaching_reference', arguments: arguments_ })).isError).toBe(true)
      }
      expect(traces).toHaveLength(priorReads)
    } finally { await host.close() }
  })

  it('rejects mutation tool names and arbitrary tool arguments over the protocol without domain reads', async () => {
    const { db, writes } = contextClient()
    const authorize = vi.fn(async () => ({ principal: principal(), db }))
    const host = await localMcp(authorize)
    try {
      await host.client.connect(host.clientTransport)
      await expect(host.client.callTool({ name: 'save_workout', arguments: { user_id: 'foreign' } })).rejects.toMatchObject({ code: -32602 })
      await expect(host.client.callTool({ name: 'create_workout', arguments: {} })).rejects.toMatchObject({ code: -32602 })
      expect(authorize).not.toHaveBeenCalled()
      const invalid = await host.client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0, user_id: 'foreign', sql: 'DELETE FROM workouts' } })
      expect(invalid.isError).toBe(true)
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await host.close() }
  })

  it('exposes bounded writes only after activation and validates before any domain operation', async () => {
    const { db, writes } = contextClient()
    const host = await localMcp(async () => ({ principal: principal(), db }), true, true)
    try {
      await host.client.connect(host.clientTransport)
      const listed = await host.client.listTools()
      const mutations = listed.tools.filter(tool => !tool.annotations?.readOnlyHint)
      expect(mutations.map(tool => tool.name)).toEqual(['create_workout', 'amend_workout', 'create_meal', 'amend_meal'])
      expect(mutations.every(tool => tool.annotations?.idempotentHint === true && tool.annotations?.openWorldHint === false)).toBe(true)
      expect(mutations.filter(tool => tool.name.startsWith('amend')).every(tool => tool.annotations?.destructiveHint === true)).toBe(true)
      for (const name of mutations.map(tool => tool.name)) {
        const result = await host.client.callTool({ name, arguments: { user_id: 'foreign', arbitrary_sql: 'SELECT 1' } })
        expect(result.isError).toBe(true)
      }
      expect(writes).not.toHaveBeenCalled(); expect(db.from).not.toHaveBeenCalled()
    } finally { await host.close() }
  })

  it.each([
    { writesEnabled: true, requirementsFlag: undefined },
    { writesEnabled: false, requirementsFlag: 'true' },
  ])('excludes coaching profile editing unless both flags are enabled ($writesEnabled, $requirementsFlag)', async ({ writesEnabled, requirementsFlag }) => {
    vi.stubEnv('SOCIUS_MCP_COACHING_REQUIREMENTS_ENABLED', requirementsFlag)
    const { db, writes } = contextClient()
    const authorize = vi.fn(async () => ({ principal: principal(), db }))
    const host = await localMcp(authorize, true, writesEnabled)
    try {
      await host.client.connect(host.clientTransport)
      const { tools } = await host.client.listTools()
      for (const name of ['get_coaching_profile', 'save_coaching_requirement']) {
        expect(tools.some(tool => tool.name === name)).toBe(false)
        expect(host.client.getInstructions()).not.toContain(name)
        await expect(host.client.callTool({ name, arguments: {} })).rejects.toMatchObject({ code: -32602 })
      }
      expect(authorize).not.toHaveBeenCalled()
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await host.close() }
  })

  it('publishes the owner-scoped coaching profile read and save when both flags are enabled', async () => {
    vi.stubEnv('SOCIUS_MCP_COACHING_REQUIREMENTS_ENABLED', 'true')
    const key = 'training_constraints'
    const requestId = '10000000-0000-4000-8000-000000000001'
    const memoryId = '10000000-0000-4000-8000-000000000002'
    const content = { constraints: 'Avoid overhead lifts during training.', constraintKinds: ['no_overhead'] }
    const provenance = { source: 'socius_mcp', confirmedBy: 'athlete' }
    const filters: Array<[string, unknown]> = []
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    const db = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: contextOwner } }, error: null })) },
      from: vi.fn((_table: string) => query),
      rpc: vi.fn(async () => ({ error: null, data: {
        requestId, userId: contextOwner, key, id: memoryId, version: 1, content, confirmedAt: contextNow, provenance,
      } })),
    }
    const authorize = vi.fn(async () => ({ principal: principal(), db: db as unknown as Awaited<ReturnType<AuthorizeContextRequest>>['db'] }))
    const host = await localMcp(authorize, true, true)
    try {
      await host.client.connect(host.clientTransport)
      const { tools } = await host.client.listTools()
      expect(tools.map(tool => tool.name)).toEqual([
        'get_coaching_context', 'get_coaching_reference', 'get_activity_history',
        'get_coaching_profile', 'save_coaching_requirement',
        'create_workout', 'amend_workout', 'create_meal', 'amend_meal', 'get_activity_record', 'get_activity_write_status',
      ])
      expect(tools.find(tool => tool.name === 'get_coaching_profile')).toMatchObject({
        annotations: { readOnlyHint: true }, _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['email'] }] },
      })
      expect(tools.find(tool => tool.name === 'save_coaching_requirement')).toMatchObject({
        annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
        _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['email'] }] },
      })
      const instructions = host.client.getInstructions()
      expect(instructions).toContain('ask whether to save it for future coaching unless they already explicitly asked')
      expect(instructions).toContain('One-day symptoms, hypothetical scenarios and reported facts about someone else are conversation context only')
      expect(instructions).toContain('Read get_coaching_profile before calling save_coaching_requirement')
      expect(instructions).toContain('save first and prepare a fresh draft after verified readback')
      expect(authorize).not.toHaveBeenCalled()

      for (const name of ['get_coaching_profile', 'save_coaching_requirement']) {
        const invalid = await host.client.callTool({ name, arguments: { user_id: 'foreign', sql: 'SELECT 1' } })
        expect(invalid.isError).toBe(true)
      }
      expect(db.from).not.toHaveBeenCalled()
      expect(db.rpc).not.toHaveBeenCalled()

      const profile = await host.client.callTool({ name: 'get_coaching_profile', arguments: {} })
      expect(profile.isError).toBe(false)
      expect(profile.structuredContent).toMatchObject({ profile: { [key]: { status: 'missing', value: null, expected: null } } })
      expect(db.auth.getUser).toHaveBeenCalled()
      expect(db.from.mock.calls).toEqual(Array.from({ length: 5 }, () => ['coach_memories']))
      expect(filters.filter(([column]) => column === 'user_id')).toEqual(Array.from({ length: 5 }, () => ['user_id', contextOwner]))
      expect(db.rpc).not.toHaveBeenCalled()

      const save = await host.client.callTool({ name: 'save_coaching_requirement', arguments: { requestId, key, expected: null, content } })
      expect(save.isError).toBe(false)
      expect(db.rpc).toHaveBeenCalledExactlyOnceWith('save_mcp_coaching_requirement', {
        p_request_id: requestId, p_memory_key: key, p_expected: null, p_content: content,
      })
      expect(save.structuredContent).toEqual({ saved: {
        requestId, key, id: memoryId, version: 1, value: content, confirmedAt: contextNow, provenance,
      } })
    } finally { await host.close() }
  })

  it('fails closed for expired identity on the actual tool call', async () => {
    const { db } = contextClient()
    const host = await localMcp(async () => ({ principal: { ...principal(), expiresAt: Date.parse(contextNow) }, db }))
    try {
      await host.client.connect(host.clientTransport)
      const result = await host.client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('authorization required')
      expect(result._meta?.['mcp/www_authenticate']).toEqual([expect.stringContaining(policy.resourceMetadataUrl)])
      expect(db.from).not.toHaveBeenCalled()
    } finally { await host.close() }
  })

  it('redacts unexpected verifier errors instead of returning credential-like details over MCP', async () => {
    const host = await localMcp(async () => { throw new Error('DO-NOT-EXPORT-PRIVATE-VERIFIER-DETAIL') })
    try {
      await host.client.connect(host.clientTransport)
      const result = await host.client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).not.toContain('DO-NOT-EXPORT')
      expect(JSON.stringify(result)).toContain('Coaching context is unavailable')
    } finally { await host.close() }
  })
})
