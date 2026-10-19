import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertVerifiedContextPrincipal, coachingContextTool, createCoachingContextTool, type VerifiedContextPrincipal } from '../../app/lib/coach/coaching-context-tool'
import { selectOnlyClient } from '../../app/lib/coach/coaching-context-server'
import { contextClient, contextNow, contextOwner, contextRows } from '../fixtures/coaching-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

const policy = { clientId: 'synthetic-chatgpt-client', resource: 'https://synthetic.invalid/api/mcp', issuer: 'https://synthetic-auth.invalid/auth/v1' }
const principal = (): VerifiedContextPrincipal => ({ subject: contextOwner, ...policy,
  role: 'authenticated', expiresAt: Date.parse(contextNow) + 60_000 })

describe('unwired coaching MCP tool adapter with synthetic verified-identity fixtures', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(contextNow) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('advertises exactly the bounded context read and no identity/mutation input', () => {
    expect(coachingContextTool.name).toBe('get_coaching_context')
    expect(coachingContextTool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false })
    expect(Object.keys(coachingContextTool.inputSchema.properties)).toEqual(['tzOffset', 'days'])
    expect(coachingContextTool.inputSchema.additionalProperties).toBe(false)
  })

  it('returns the real reader package, saved session and compatible structured/text content without writes', async () => {
    const { db, writes, traces } = contextClient()
    const tool = createCoachingContextTool(async () => ({ principal: principal(), db }), policy)
    const result = await tool.call({ tzOffset: 0 })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    expect(result.structuredContent.context).toMatchObject({ authority: 'factual_context_only', purpose: 'today_training' })
    expect(JSON.stringify(result)).toContain('Saved easy session')
    expect(JSON.stringify(result)).not.toContain('token-id-only')
    expect(writes).not.toHaveBeenCalled()
    expect(traces.length).toBeGreaterThan(0)
    expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === contextOwner))).toBe(true)
    expect(db.auth.getUser).toHaveBeenCalledTimes(1)
  })

  it.each([
    { role: 'anon' }, { role: 'service_role' }, { clientId: 'other-client' },
    { resource: 'https://other.invalid' }, { expiresAt: Date.parse(contextNow) },
    { issuer: 'https://other-auth.invalid' }, { role: 'socius_context_reader' },
    { issuer: '' }, { subject: '' }, { expiresAt: NaN },
  ])('rejects unqualified principal %j before any database access', async patch => {
    const { db } = contextClient()
    const tool = createCoachingContextTool(async () => ({ principal: { ...principal(), ...patch }, db }), policy)
    await expect(tool.call({ tzOffset: 0 })).rejects.toMatchObject({ status: 401 })
    expect(db.auth.getUser).not.toHaveBeenCalled()
    expect(db.from).not.toHaveBeenCalled()
  })
  it('includes recent owned work through the verified MCP boundary with planning disabled', async () => {
    vi.stubEnv('COACH_HISTORY_CONTEXT_ENABLED', 'false')
    const rows = contextRows()
    rows.workouts = [{ ...workSnapshot().workouts[0], user_id: contextOwner, workout_date: '2026-10-18',
      created_at: contextNow, updated_at: contextNow }]
    const { db, writes } = contextClient(rows)
    const result = await createCoachingContextTool(async () => ({ principal: principal(), db }), policy).call({ tzOffset: 0, days: 7 })
    expect(result.structuredContent.context).toMatchObject({ performedWork: { status: 'available',
      records: [{ workoutId: 'work-1', origin: 'athlete_reported' }] } })
    expect(writes).not.toHaveBeenCalled()
  })

  it('accepts the explicitly selected normal owner role without claiming read-only credentials', () => {
    expect(() => assertVerifiedContextPrincipal(principal(), policy)).not.toThrow()
  })

  it.each([null, [], { tzOffset: '0' }, { tzOffset: 0, days: 0 }, { tzOffset: 0, days: 91 },
    { tzOffset: 0, user_id: 'other-owner' }, { tzOffset: 0, token: 'do-not-read' },
    { tzOffset: 0, url: 'https://other.invalid' }, { tzOffset: 0, sql: 'DELETE FROM workouts' },
    { tzOffset: 0, tool: 'save_workout' }])('rejects extra selectors and mutation attempts %j', async input => {
    const { db } = contextClient()
    const tool = createCoachingContextTool(async () => ({ principal: principal(), db }), policy)
    await expect(tool.call(input)).rejects.toMatchObject({ status: 400 })
    expect(db.from).not.toHaveBeenCalled()
  })

  it('rejects a mismatched database identity before any domain read', async () => {
    const { db } = contextClient()
    const tool = createCoachingContextTool(async () => ({ principal: { ...principal(), subject: 'other-owner' }, db }), policy)
    await expect(tool.call({ tzOffset: 0 })).rejects.toMatchObject({ status: 401 })
    expect(db.from).not.toHaveBeenCalled()
  })

  it('fails closed if the verifier fails and never falls back to a cookie/service client', async () => {
    const authorize = vi.fn(async () => { throw new Error('Unauthorized fixture') })
    await expect(createCoachingContextTool(authorize, policy).call({ tzOffset: 0 })).rejects.toMatchObject({ status: 503, message: 'Coaching context is unavailable' })
    expect(authorize).toHaveBeenCalledTimes(1)
  })

  it('rejects foreign-owner rows despite a defective downstream filter', async () => {
    const rows = contextRows(); rows.user_profiles[0].user_id = 'other-owner'
    const { db } = contextClient(rows, { foreignRows: true })
    const tool = createCoachingContextTool(async () => ({ principal: principal(), db }), policy)
    await expect(tool.call({ tzOffset: 0 })).rejects.toMatchObject({ status: 503 })
  })

  it.each(['insert', 'update', 'upsert', 'delete'])('blocks a direct %s capability below the reader', method => {
    const { db, writes } = contextClient()
    const query = selectOnlyClient(db).from('workouts') as unknown as Record<string, (value?: unknown) => unknown>
    expect(() => query[method]({ user_id: contextOwner })).toThrow('SELECT-only')
    expect(writes).not.toHaveBeenCalled()
  })

  it('blocks arbitrary RPC and access to database credentials', () => {
    const { db, writes } = contextClient()
    const guarded = selectOnlyClient(db)
    expect(() => guarded.rpc('save_workout')).toThrow('SELECT-only')
    expect(() => guarded.auth).toThrow('SELECT-only')
    expect(writes).not.toHaveBeenCalled()
  })
})
