// Real Supabase SDK/session transport against a synthetic provider contract.
// This exercises bearer propagation and response handling, not hosted Auth internals.
import { describe, expect, it } from 'vitest'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readCoachingConsent } from '../../app/lib/auth/coaching-consent'
import type { CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'

const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002'
const authorizationId = 'abcdefghijklmnopqrstuvwxyz234567'
const config: CoachingOAuthConfig = { origin: 'https://socius.synthetic.invalid', supabaseUrl: 'https://auth.synthetic.invalid',
  issuer: 'https://auth.synthetic.invalid/auth/v1', resource: 'https://socius.synthetic.invalid/api/mcp',
  clientId: '20000000-0000-4000-8000-000000000001', publicKey: 'sb_publishable_synthetic',
  redirectUri: 'https://chatgpt.com/connector/oauth/synthetic-callback',
  resourceMetadataUrl: 'https://socius.synthetic.invalid/.well-known/oauth-protected-resource/api/mcp' }

async function providerSession(options: { saved?: boolean; failure?: 'expired' | 'unknown' | 'other-owner'; client?: string; scope?: string } = {}) {
  const secret = randomBytes(32)
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const signed = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, exp: Math.floor(Date.now() / 1000) + 600 })}`
  const jwt = `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`
  const calls: { path: string; owner: string }[] = []
  let rejectUser = false
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== config.supabaseUrl) throw new Error('Nonfixture network forbidden')
    const headers = new Headers(init?.headers)
    const received = headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
    let subject: string
    try {
      const [header, payload, signature] = received.split('.')
      const actual = Buffer.from(signature, 'base64url'), expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest()
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || claims.exp <= Date.now() / 1000) throw new Error()
      subject = claims.sub
    } catch { return Response.json({ msg: 'Invalid synthetic session' }, { status: 401 }) }
    calls.push({ path: url.pathname, owner: subject }) // No credential/code/state retained.
    if (url.pathname === '/auth/v1/user') return rejectUser
      ? Response.json({ msg: 'Synthetic session no longer valid' }, { status: 401 })
      : Response.json({ id: subject, email: 'synthetic@example.invalid', is_anonymous: false })
    if (url.pathname === `/auth/v1/oauth/authorizations/${authorizationId}`) {
      if (options.failure) return Response.json({ msg: `Synthetic ${options.failure}`, code: 'oauth_authorization_not_found' }, { status: 404 })
      if (options.saved) return Response.json({ redirect_url: `${config.redirectUri}?code=synthetic-once&state=opaque-host-state` })
      return Response.json({ authorization_id: authorizationId, redirect_uri: config.redirectUri,
        client: { id: options.client ?? config.clientId, name: 'Synthetic client' }, user: { id: subject }, scope: options.scope ?? 'email' })
    }
    throw new Error('Unexpected synthetic provider action')
  }
  const db = createClient(config.supabaseUrl, config.publicKey, { global: { fetch: transport },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const initialized = await db.auth.setSession({ access_token: jwt, refresh_token: 'ephemeral-synthetic-unused-refresh' })
  expect(initialized.error).toBeNull()
  calls.length = 0
  return { db, calls, expireSession: () => { rejectUser = true } }
}

describe('native consent response through authenticated SDK transport', () => {
  it('uses the same authenticated owner for user verification and saved-grant request and never decides again', async () => {
    const f = await providerSession({ saved: true })
    const result = await readCoachingConsent(f.db, authorizationId, config)
    expect(result).toEqual({ kind: 'redirect', redirect: `${config.redirectUri}?code=synthetic-once&state=opaque-host-state` })
    expect(f.calls).toEqual([{ path: '/auth/v1/user', owner }, { path: `/auth/v1/oauth/authorizations/${authorizationId}`, owner }])
  })
  it('refuses a provider-invalidated owner before requesting a saved-grant response', async () => {
    const f = await providerSession({ saved: true }); f.expireSession()
    await expect(readCoachingConsent(f.db, authorizationId, config)).rejects.toMatchObject({ status: 401 })
    expect(f.calls).toEqual([{ path: '/auth/v1/user', owner }])
  })
  it.each(['expired', 'unknown', 'other-owner'] as const)('handles native %s response without a result or decision', async failure => {
    const f = await providerSession({ failure })
    await expect(readCoachingConsent(f.db, authorizationId, config)).rejects.toMatchObject({ status: 400 })
    expect(f.calls).toHaveLength(2)
  })
  it('keeps pending owner/client/scope review semantics through actual SDK decoding', async () => {
    const f = await providerSession()
    expect(await readCoachingConsent(f.db, authorizationId, config)).toMatchObject({ kind: 'pending', owner, scopes: ['email'] })
  })
  it.each([{ client: other }, { scope: 'openid email' }, { scope: 'profile' }])('rejects different pending client/scope %#', async options => {
    const f = await providerSession(options)
    await expect(readCoachingConsent(f.db, authorizationId, config)).rejects.toMatchObject({ status: 400 })
  })
  it('does not use the native request endpoint for a malformed id', async () => {
    const f = await providerSession({ saved: true })
    await expect(readCoachingConsent(f.db, 'not-an-id', config)).rejects.toMatchObject({ status: 400 })
    expect(f.calls).toEqual([])
  })
})
