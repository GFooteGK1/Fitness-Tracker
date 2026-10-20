import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Synthetic identity at the feature-filter boundary; the production selector is
// unchanged and is separately verified against the private, known owner vector.
const owner = process.env.WHOOP_BOUNDARY_OWNER_ID ?? '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const now = '2026-10-20T11:28:56.000Z'
const previous = '2026-10-18T22:44:23.325Z'
vi.mock('@/app/lib/whoop/timing-owner', async importOriginal => process.env.WHOOP_REAL_OWNER_SELECTOR === '1'
  ? await importOriginal()
  : { isWhoopTimingOwner: (id: unknown) => id === '11111111-1111-4111-8111-111111111111' })
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn(), createServiceRoleClient: vi.fn() }))
vi.mock('@/app/lib/whoop/encryption', () => ({ decryptTokens: vi.fn(), encryptTokens: vi.fn() }))
vi.mock('@/app/lib/whoop/api-client', () => ({ refreshAccessToken: vi.fn(), getRecovery: vi.fn(), getSleep: vi.fn(), getCycles: vi.fn(), getWorkouts: vi.fn() }))
import { GET, POST } from '@/app/api/whoop/sync-all/route'
import { POST as sessionPOST } from '@/app/api/whoop/sync/route'
import { createServerClient, createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { decryptTokens, encryptTokens } from '@/app/lib/whoop/encryption'
import * as api from '@/app/lib/whoop/api-client'
import { getOwnerCronAccessToken } from '@/app/lib/whoop/token-service'
import { incrementalOwnerCronSync } from '@/app/lib/whoop/sync-service'
import { providerPayload } from '../fixtures/whoop-provider-timing'

type Row = Record<string, any>
type Operation = { context: string; table: string; op: string; owner?: string; rows?: Row[] }
function fixture() {
  const state = {
    token: { user_id: owner, access_token_encrypted: 'cipher-old-a', refresh_token_encrypted: 'cipher-old-r', expires_at: new Date(Date.parse(now) - 1).toISOString(), scope: 'read:recovery' } as Row,
    status: { user_id: owner, last_sync_at: previous, status: 'idle', error_message: null, records_synced: { recovery: 9 }, created_at: previous, updated_at: previous } as Row | null,
    connected: [other, owner, owner], lookup: 'ok', saveError: false, saveThrow: false,
    saveGate: undefined as Promise<void> | undefined,
    saveStarted: () => {}, cookieUser: owner as string | null,
    operations: [] as Operation[], domains: [] as Operation[],
  }
  function client(context: 'trusted' | 'cookie') {
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: state.cookieUser ? { id: state.cookieUser } : null }, error: null })) },
      from(table: string) {
        if (!['whoop_tokens', 'whoop_sync_status', 'whoop_recovery', 'whoop_sleep', 'whoop_cycles', 'whoop_workouts'].includes(table)) throw Error('unexpected table')
        return {
          select(columns: string) {
            if (table === 'whoop_tokens' && columns === 'user_id') {
              state.operations.push({ context, table, op: 'connections' })
              return Promise.resolve({ data: state.connected.map(user_id => ({ user_id })), error: null })
            }
            return { eq(column: string, id: string) {
              if (column !== 'user_id') throw Error('unexpected filter')
              state.operations.push({ context, table, op: 'lookup', owner: id })
              return { async single() {
                if (context === 'cookie' && state.cookieUser !== id) return { data: null, error: { code: 'PGRST116' } }
                if (id !== owner) throw Error('foreign owner lookup')
                if (table === 'whoop_sync_status') return { data: state.status ? structuredClone(state.status) : null, error: state.status ? null : { code: 'PGRST116' } }
                if (table !== 'whoop_tokens') throw Error('unexpected read')
                if (state.lookup === 'throw') throw Error('sensitive-synthetic-error')
                if (state.lookup === 'missing') return { data: null, error: { code: 'PGRST116' } }
                if (state.lookup === 'error') return { data: null, error: { message: 'synthetic lookup failure' } }
                return { data: { ...state.token, ...(state.lookup === 'foreign' ? { user_id: other } : {}) }, error: null }
              } }
            } }
          },
          update(value: Row) {
            if (table !== 'whoop_tokens') throw Error('unexpected update')
            const filters: Record<string, string> = {}
            const chain = {
              eq(column: string, value: string) { filters[column] = value; return chain },
              select(columns: string) {
                expect(columns).toBe('user_id')
                return { async single() {
                  expect(filters.user_id).toBe(owner)
                  expect(Object.keys(filters).sort()).toEqual(['refresh_token_encrypted','user_id'])
                  state.operations.push({ context,table,op:'update',owner:filters.user_id,rows:[structuredClone(value)] })
                  state.saveStarted()
                  if (state.saveGate) await state.saveGate
                  if (state.saveThrow) throw Error('sensitive-synthetic-error')
                  if (state.saveError) return { data:null,error:{message:'synthetic persistence failure'} }
                  if (state.token.user_id !== filters.user_id || state.token.refresh_token_encrypted !== filters.refresh_token_encrypted) return {data:null,error:{code:'PGRST116'}}
                  state.token = {...state.token,...value}
                  return {data:{user_id:owner},error:null}
                } }
              },
            }
            return chain
          },
          async upsert(value: Row | Row[], options: { onConflict: string }) {
            const rows = Array.isArray(value) ? value : [value]
            if (rows.some(row => row.user_id !== owner)) throw Error('foreign owner write')
            const op = { context, table, op: 'upsert', rows: structuredClone(rows) }
            state.operations.push(op)
            if (table === 'whoop_tokens') throw Error('credential insertion forbidden')
            if (table === 'whoop_sync_status') {
              expect(options).toEqual({onConflict:'user_id'})
              state.status = { ...state.status, ...rows[0] }
            } else state.domains.push(op)
            return { error: null }
          },
          delete() {
            state.operations.push({ context, table, op: 'delete' })
            return { async eq(_column: string, id: string) {
              if (id !== owner) throw Error('foreign owner delete')
              state.token = {}; return { error: null }
            } }
          },
        }
      },
    } as unknown as SupabaseClient
  }
  const trusted = client('trusted'), cookie = client('cookie')
  vi.mocked(createServiceRoleClient).mockReturnValue(trusted)
  vi.mocked(createServerClient).mockImplementation(async () => { throw Error('cookie client forbidden for owner cron') })
  vi.mocked(decryptTokens).mockImplementation((a, r) => {
    expect([a, r]).toEqual([state.token.access_token_encrypted, state.token.refresh_token_encrypted])
    return { accessToken: a === 'cipher-new-a' ? 'synthetic-new-access' : 'synthetic-old-access', refreshToken: r === 'cipher-new-r' ? 'synthetic-new-refresh' : 'synthetic-old-refresh' }
  })
  vi.mocked(encryptTokens).mockReturnValue({ accessTokenEncrypted: 'cipher-new-a', refreshTokenEncrypted: 'cipher-new-r' })
  vi.mocked(api.refreshAccessToken).mockResolvedValue({ accessToken: 'synthetic-new-access', refreshToken: 'synthetic-new-refresh', expiresAt: new Date(Date.parse(now) + 3600000), scope: 'read:recovery read:sleep' })
  const dataFns = [api.getRecovery, api.getSleep, api.getCycles, api.getWorkouts]
  const payloads = [[providerPayload('recovery')], [providerPayload('sleep')], [providerPayload('cycle')], []]
  dataFns.forEach((fn, i) => vi.mocked(fn).mockImplementation(async (token: string) => {
    expect(token).toBe(state.token.access_token_encrypted === 'cipher-new-a' ? 'synthetic-new-access' : 'synthetic-old-access')
    return payloads[i] as never
  }))
  return { state, trusted, cookie, dataFns }
}
function request(method: 'GET' | 'POST' = 'GET', bearer = 'Bearer synthetic-secret') {
  return new NextRequest('https://example.invalid/api/whoop/sync-all?user_id='+other+'&ownerOnly=false', { method, headers: { authorization: bearer } })
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now))
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('CRON_SECRET', 'synthetic-secret')
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('real network forbidden') }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('real owner GET → sync → token boundary (synthetic DB/crypto/provider only)', () => {
  it.each([3600000, 300000, 299999, 1, 0, -1, -3600000])('handles expiry offset %i milliseconds', async offset => {
    const { state, dataFns } = fixture()
    state.token.expires_at = new Date(Date.parse(now) + offset).toISOString()
    const body = await (await GET(request())).json()
    expect(body.results).toEqual({ total: 1, successful: 1, failed: 0 })
    expect(createServerClient).not.toHaveBeenCalled()
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1)
    expect(state.operations.every(op => op.context === 'trusted')).toBe(true)
    expect(state.operations.filter(op => op.table === 'whoop_tokens' && op.op === 'lookup')).toHaveLength(1)
    expect(state.operations.some(op => op.op === 'delete')).toBe(false)
    const refreshed = offset < 300000
    expect(api.refreshAccessToken).toHaveBeenCalledTimes(refreshed ? 1 : 0)
    if (refreshed) {
      expect(api.refreshAccessToken).toHaveBeenCalledWith('synthetic-old-refresh')
      expect(encryptTokens).toHaveBeenCalledWith('synthetic-new-access', 'synthetic-new-refresh')
      expect(state.token).toMatchObject({ user_id: owner, access_token_encrypted: 'cipher-new-a', refresh_token_encrypted: 'cipher-new-r', expires_at: '2026-10-20T12:28:56.000Z', scope: 'read:recovery read:sleep' })
      expect(JSON.stringify(state.token)).not.toContain('synthetic-new-')
    } else expect(encryptTokens).not.toHaveBeenCalled()
    dataFns.forEach(fn => expect(fn).toHaveBeenCalledExactlyOnceWith(refreshed ? 'synthetic-new-access' : 'synthetic-old-access', new Date(previous), new Date(now)))
    for (const domain of ['whoop_recovery', 'whoop_sleep', 'whoop_cycles']) {
      expect(state.domains.filter(op => op.table === domain).flatMap(op => op.rows!)).toEqual([expect.objectContaining({ user_id: owner, timing_ingested_at: now, timing_mapping_version: 'whoop_timing_owner_v1', timing_provenance: expect.objectContaining({ source: 'provider_payload' }) })])
    }
    expect(state.status).toMatchObject({ last_sync_at: now, status: 'idle', error_message: null, records_synced: { recovery: 1, sleep: 1, cycles: 1, workouts: 0 } })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  it('carries the same context through the first-sync seven-day fallback', async () => {
    const { state, dataFns } = fixture(); state.status = null
    expect((await (await GET(request())).json()).results.successful).toBe(1)
    dataFns.forEach(fn => expect(fn).toHaveBeenCalledExactlyOnceWith('synthetic-new-access', new Date('2026-10-13T11:28:56.000Z'), new Date(now)))
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('awaits encrypted rotation persistence before any data fetch', async () => {
    const { state, dataFns } = fixture()
    let release!: () => void, started!: () => void
    state.saveGate = new Promise<void>(resolve => { release = resolve })
    const saveStarted = new Promise<void>(resolve => { started = resolve }); state.saveStarted = started
    const pending = GET(request()); await saveStarted
    dataFns.forEach(fn => expect(fn).not.toHaveBeenCalled())
    release(); expect((await (await pending).json()).results.successful).toBe(1)
    dataFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1))
  })
  it.each(['disconnect','replacement'])('does not undo concurrent %s while persisting rotation', async mode => {
    const {state,dataFns}=fixture()
    let release!:()=>void,started!:()=>void
    state.saveGate=new Promise<void>(resolve=>{release=resolve})
    const saveStarted=new Promise<void>(resolve=>{started=resolve});state.saveStarted=started
    const pending=GET(request());await saveStarted
    state.token=mode==='disconnect'?{}:{...state.token,refresh_token_encrypted:'cipher-concurrent-grant'}
    const concurrent=structuredClone(state.token)
    release();expect((await (await pending).json()).results.failed).toBe(1)
    expect(state.token).toEqual(concurrent);expect(api.refreshAccessToken).toHaveBeenCalledTimes(1)
    dataFns.forEach(fn=>expect(fn).not.toHaveBeenCalled())
    expect(state.operations.some(op=>op.table==='whoop_tokens'&&op.op==='upsert')).toBe(false)
  })
  it.each(['missing', 'error', 'foreign', 'lookup-throw', 'persist-throw', 'decrypt', 'expiry', 'refresh', 'encrypt', 'persist', 'rotated-expiry', 'rotated-empty'])('fails closed on %s without credential deletion or data writes', async mode => {
    const { state, dataFns } = fixture()
    if (['missing','error','foreign'].includes(mode)) state.lookup = mode
    if (mode === 'lookup-throw') state.lookup = 'throw'
    if (mode === 'persist-throw') state.saveThrow = true
    if (mode === 'decrypt') vi.mocked(decryptTokens).mockImplementation(() => { throw Error('sensitive-synthetic-error') })
    if (mode === 'expiry') state.token.expires_at = 'invalid'
    if (mode === 'refresh') vi.mocked(api.refreshAccessToken).mockRejectedValue(Error('sensitive-synthetic-error'))
    if (mode === 'encrypt') vi.mocked(encryptTokens).mockImplementation(() => { throw Error('sensitive-synthetic-error') })
    if (mode === 'persist') state.saveError = true
    if (mode === 'rotated-expiry') vi.mocked(api.refreshAccessToken).mockResolvedValue({ accessToken:'synthetic-a',refreshToken:'synthetic-r',expiresAt:new Date(now),scope:'read:recovery' })
    if (mode === 'rotated-empty') vi.mocked(api.refreshAccessToken).mockResolvedValue({ accessToken:'',refreshToken:'',expiresAt:new Date(Date.parse(now)+3600000),scope:'' })
    const before = structuredClone(state.token)
    const response = await GET(request()); const body = await response.json()
    expect(response.status).toBe(200) // Existing wrapper status is not successful ingestion.
    expect(body.results).toMatchObject({ total: 1, successful: 0, failed: 1 })
    expect(state.token).toEqual(before)
    expect(state.operations.some(op => op.op === 'delete')).toBe(false)
    expect(state.domains).toHaveLength(0); dataFns.forEach(fn => expect(fn).not.toHaveBeenCalled())
    expect(state.status).toMatchObject({ status: 'error', last_sync_at: previous, records_synced: { recovery: 9 } })
    if (['missing','error','foreign','lookup-throw','decrypt','expiry'].includes(mode)) expect(api.refreshAccessToken).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled(); expect(globalThis.fetch).not.toHaveBeenCalled()
    const logged = vi.mocked(console.error).mock.calls.flat().map(v => v instanceof Error ? v.message : String(v)).join(' ')
    expect(logged + JSON.stringify(body)).not.toContain('sensitive-synthetic-error')
  })
  it.each(['production','development'])('rejects bad bearer before any work (%s)', async environment => {
    const { state } = fixture(); vi.stubEnv('NODE_ENV', environment)
    expect((await GET(request('GET', 'Bearer wrong'))).status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled(); expect(state.operations).toEqual([])
  })
  it('rejects missing configuration before client construction', async () => {
    fixture(); vi.stubEnv('CRON_SECRET','')
    expect((await GET(request())).status).toBe(500)
    expect(createServiceRoleClient).not.toHaveBeenCalled()
  })
  it('never falls back to another connected owner', async () => {
    const { state } = fixture(); state.connected = [other]
    expect((await (await GET(request())).json()).usersSynced).toBe(0)
    expect(state.operations).toEqual([{ context:'trusted',table:'whoop_tokens',op:'connections' }])
    expect(decryptTokens).not.toHaveBeenCalled()
  })
  it('both internal owner entrypoints reject foreign identity before database access', async () => {
    const { state, trusted } = fixture()
    await expect(incrementalOwnerCronSync(other,trusted)).rejects.toThrow('Invalid owner')
    await expect(getOwnerCronAccessToken(other,trusted)).rejects.toThrow('Invalid owner')
    expect(state.operations).toEqual([])
  })
  it('leaves sync-all POST on the existing cookie token path, even with a service client', async () => {
    const { state, cookie } = fixture(); state.connected = [owner]
    vi.mocked(createServerClient).mockResolvedValue(cookie as never)
    const body = await (await POST(request('POST'))).json()
    expect(body.results).toMatchObject({ total:1,successful:0,failed:1 }) // Legacy expired-access rejection unchanged.
    expect(api.refreshAccessToken).not.toHaveBeenCalled()
    expect(state.operations.filter(op => op.table === 'whoop_tokens' && op.op === 'lookup')).toEqual([{ context:'cookie',table:'whoop_tokens',op:'lookup',owner }])
  })
  it('leaves authenticated user sync cookie-scoped and unauthorized requests rejected', async () => {
    const { state, cookie } = fixture(); vi.mocked(createServerClient).mockResolvedValue(cookie as never)
    state.cookieUser = null
    expect((await sessionPOST(request('POST'))).status).toBe(401)
    expect(createServiceRoleClient).not.toHaveBeenCalled(); expect(state.operations).toEqual([])
    state.cookieUser = owner; state.token.expires_at = new Date(Date.parse(now)+3600000).toISOString()
    expect((await sessionPOST(request('POST'))).status).toBe(200)
    expect(state.operations.every(op => op.context === 'cookie')).toBe(true)
    expect(createServiceRoleClient).not.toHaveBeenCalled(); expect(api.refreshAccessToken).not.toHaveBeenCalled()
  })
})
