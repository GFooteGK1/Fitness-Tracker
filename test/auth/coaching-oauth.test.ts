import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createHmac, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { authorizeCoachingBearer, coachingOAuthConfig, type CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'
import { handleCoachingMcp } from '../../app/lib/coach/coaching-mcp-http'
import { decideCoachingConsent, readCoachingConsent, coachingConsentRedirect, coachingConsentSuccessRedirect } from '../../app/lib/auth/coaching-consent'
import { contextClient, contextRows } from '../fixtures/coaching-context'

const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002'
const clientId = '20000000-0000-4000-8000-000000000001', authorizationId = 'abcdefghijklmnopqrstuvwxyz234567'
const config: CoachingOAuthConfig = { origin: 'https://socius.synthetic.invalid', supabaseUrl: 'https://auth.synthetic.invalid',
  issuer: 'https://auth.synthetic.invalid/auth/v1', resource: 'https://socius.synthetic.invalid/api/mcp',
  clientId, publicKey: 'sb_publishable_synthetic', redirectUri: 'https://chatgpt.com/connector/oauth/synthetic-callback',
  resourceMetadataUrl: 'https://socius.synthetic.invalid/.well-known/oauth-protected-resource/api/mcp' }
let keys: ReturnType<typeof generateKeyPairSync>
let publicJwk: Record<string, unknown>
const hmacSecret = randomBytes(32) // Ephemeral synthetic Auth-server secret, never a project credential.
beforeAll(() => {
  // Ephemeral test-only signing material; never stored or valid at a live issuer.
  keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  publicJwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'synthetic-key', alg: 'ES256', use: 'sig' }
})
function token(patch: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const message = `${encode({ alg: 'ES256', kid: 'synthetic-key', typ: 'JWT' })}.${encode({ iss: config.issuer,
    aud: config.resource, sub: owner, client_id: clientId, role: 'authenticated', scope: 'email', exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000), ...patch })}`
  return `${message}.${sign('sha256', Buffer.from(message), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}
function hmacToken(patch: Record<string, unknown> = {}, secret = hmacSecret) {
  const payload = token(patch).split('.')[1]
  const message = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${payload}`
  return `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`
}
function provider(legacyHmac = false) {
  const rows = contextRows()
  for (const records of Object.values(rows)) for (const row of records) row.user_id = owner
  const query = contextClient(rows)
  const state = { active: true, user: owner, unavailable: false, grantScopes: ['email'] }
  const calls: string[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== config.supabaseUrl) throw new Error('External network blocked')
    calls.push(url.pathname)
    if (url.pathname.endsWith('/.well-known/jwks.json')) return Response.json({ keys: legacyHmac ? [] : [publicJwk] })
    if (url.pathname.endsWith('/user/oauth/grants')) return state.unavailable ? new Response(null, { status: 503 })
      : Response.json(state.active ? [{ client: { id: clientId }, scopes: state.grantScopes }] : [])
    if (url.pathname.endsWith('/user')) {
      if (legacyHmac) {
        // Real SDK getClaims delegates HS256 verification to Auth getUser. This
        // synthetic Auth endpoint independently verifies HMAC instead of blindly
        // returning a user for any decoded token. No project secret is needed.
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        const jwt = headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
        try {
          const [header, payload, signature] = jwt.split('.')
          const actual = Buffer.from(signature, 'base64url')
          const expected = createHmac('sha256', hmacSecret).update(`${header}.${payload}`).digest()
          const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
          if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256'
            || actual.length !== expected.length || !timingSafeEqual(actual, expected) || claims.exp <= Date.now() / 1000) throw new Error('Invalid synthetic JWT')
        } catch { return Response.json({ msg: 'Invalid JWT' }, { status: 401 }) }
      }
      return Response.json({ id: state.user, email: 'synthetic@example.invalid', role: 'authenticated', aud: 'authenticated' })
    }
    throw new Error('Unexpected provider route')
  }
  const makeClient = (jwt: string) => {
    const db = createClient(config.supabaseUrl, config.publicKey, { global: { fetch: fakeFetch, headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    Object.defineProperty(db, 'from', { value: query.db.from, configurable: true, writable: true })
    return db
  }
  return { state, calls, query, dependencies: { client: makeClient, fetch: fakeFetch } }
}
const request = (jwt: string) => new Request(config.resource, { headers: { Authorization: `Bearer ${jwt}` } })

describe('owner OAuth bearer verification with real SDK JWT signatures and synthetic provider', () => {
  it('verifies signature, issuer, resource audience, client, owner and active grant', async () => {
    const fixture = provider()
    const result = await authorizeCoachingBearer(request(token()), config, fixture.dependencies)
    expect(result.principal).toMatchObject({ subject: owner, clientId, resource: config.resource, role: 'authenticated' })
    expect(fixture.calls).toContain('/auth/v1/user/oauth/grants')
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it.each([
    { iss: 'https://wrong.synthetic.invalid' }, { aud: 'authenticated' }, { aud: ['another-resource'] },
    { client_id: other }, { role: 'service_role' }, { role: 'anon' }, { is_anonymous: true },
    { exp: 1 }, { sub: 'not-an-owner-uuid' }, { nbf: 9999999999 }, { iat: 9999999999 },
    { scope: undefined }, { scope: 'openid email' }, { scope: 'profile' },
  ])('rejects signed but unauthorized claims %j before domain reads', async patch => {
    const fixture = provider()
    await expect(authorizeCoachingBearer(request(token(patch)), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('rejects tampered signature and malformed input instead of decoding claims as authorization', async () => {
    const fixture = provider(), valid = token()
    const parts = valid.split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: other, exp: 9999999999 })).toString('base64url')
    await expect(authorizeCoachingBearer(request(parts.join('.')), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    await expect(authorizeCoachingBearer(new Request(config.resource), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('rejects provider owner mismatch', async () => {
    const fixture = provider(); fixture.state.user = other
    await expect(authorizeCoachingBearer(request(token()), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects a revoked grant with the same still-unexpired signed token', async () => {
    const fixture = provider(), jwt = token()
    await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).resolves.toHaveProperty('principal')
    fixture.state.active = false
    await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('fails closed on grant-check outage', async () => {
    const fixture = provider(); fixture.state.unavailable = true
    await expect(authorizeCoachingBearer(request(token()), config, fixture.dependencies)).rejects.toMatchObject({ status: 503 })
  })
  it('runs initialized/list/call through the authenticated stateless HTTP handler and refuses reuse after revocation', async () => {
    const fixture = provider(), jwt = token()
    const transport = new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${jwt}` } },
      fetch: (input, init) => handleCoachingMcp(new Request(input, init), config, fixture.dependencies),
    })
    const client = new Client({ name: 'synthetic-owner', version: '1.0.0' })
    try {
      await client.connect(transport)
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['get_coaching_context'])
      const result = await client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      expect(result.structuredContent).toHaveProperty('context')
      fixture.state.active = false
      await expect(client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })).rejects.toThrow()
      expect(fixture.query.writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })
})

describe('access-token-only email OAuth with real SDK HS256 Auth verification fallback', () => {
  it('uses authenticated Auth verification without a JWKS key or ID token', async () => {
    const fixture = provider(true)
    const result = await authorizeCoachingBearer(request(hmacToken()), config, fixture.dependencies)
    expect(result.principal).toMatchObject({ subject: owner, clientId, resource: config.resource })
    expect(fixture.calls.filter(path => path === '/auth/v1/user')).toHaveLength(2)
    expect(fixture.calls).not.toContain('/auth/v1/.well-known/jwks.json')
    expect(fixture.calls).toContain('/auth/v1/user/oauth/grants')
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('accepts the strict resource binding alongside the preserved native audience', async () => {
    const fixture = provider(true)
    await expect(authorizeCoachingBearer(request(hmacToken({ aud: ['authenticated', config.resource] })), config, fixture.dependencies)).resolves.toHaveProperty('principal')
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it.each([
    { iss: 'https://wrong.synthetic.invalid' }, { aud: 'authenticated' }, { client_id: other },
    { sub: other }, { role: 'service_role' }, { exp: 1 }, { scope: undefined }, { scope: 'openid email' },
  ])('retains signed access-token authorization checks for %j', async patch => {
    const fixture = provider(true)
    await expect(authorizeCoachingBearer(request(hmacToken(patch)), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('rejects a wrong HMAC key and payload tampering through Auth verification', async () => {
    const fixture = provider(true), valid = hmacToken(), parts = valid.split('.')
    parts[1] = Buffer.from(JSON.stringify({ sub: other, exp: 9999999999 })).toString('base64url')
    for (const jwt of [hmacToken({}, randomBytes(32)), parts.join('.')]) {
      await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    }
    expect(fixture.calls).not.toContain('/auth/v1/user/oauth/grants')
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('refuses a broader active grant and a revoked grant with the same still-valid token', async () => {
    const fixture = provider(true), jwt = hmacToken()
    await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).resolves.toHaveProperty('principal')
    fixture.state.grantScopes = ['email', 'openid']
    await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    fixture.state.grantScopes = ['email']; fixture.state.active = false
    await expect(authorizeCoachingBearer(request(jwt), config, fixture.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(fixture.query.db.from).not.toHaveBeenCalled()
  })
  it('runs the email-scoped protocol tool with the HS256 access token', async () => {
    const fixture = provider(true), jwt = hmacToken()
    const client = new Client({ name: 'synthetic-email-owner', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${jwt}` } },
      fetch: (input, init) => handleCoachingMcp(new Request(input, init), config, fixture.dependencies),
    })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools[0]._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['email'] }])
      const result = await client.callTool({ name: 'get_coaching_context', arguments: { tzOffset: 0 } })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      expect(result.structuredContent).toHaveProperty('context')
      expect(fixture.query.writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })
})

function cookieConsent() {
  let scope = 'email', name = 'Synthetic ChatGPT'
  const approve = vi.fn(async () => ({ data: { redirect_url: `${config.redirectUri}?code=synthetic&state=synthetic` }, error: null }))
  const deny = vi.fn(async () => ({ data: { redirect_url: `${config.redirectUri}?error=access_denied&state=synthetic` }, error: null }))
  const db = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: owner, email: 'synthetic@example.invalid' } }, error: null })), oauth: {
    getAuthorizationDetails: vi.fn(async () => ({ data: { authorization_id: authorizationId, client: { id: clientId, name }, user: { id: owner }, scope }, error: null })),
    approveAuthorization: approve, denyAuthorization: deny,
  } } } as unknown as ReturnType<typeof createClient>
  return { db, approve, deny, changeScope: () => { scope = 'openid email' }, changeName: () => { name = 'Changed connection' } }
}
async function pendingConsent(db: ReturnType<typeof createClient>) {
  const consent = await readCoachingConsent(db, authorizationId, config)
  if (consent.kind !== 'pending') throw new Error('Expected pending fixture')
  return consent
}

describe('strict native success callback with bounded opaque values', () => {
  it('preserves opaque code/state without interpreting their contents', () => {
    const url = new URL(config.redirectUri)
    url.searchParams.set('code', 'opaque+/=code')
    url.searchParams.set('state', '{"not":"app metadata"} +/=opaque')
    expect(coachingConsentSuccessRedirect(url.href, config)).toBe(url.href)
  })
  it('accepts the exact byte boundaries and rejects the next byte', () => {
    const url = new URL(config.redirectUri)
    url.searchParams.set('code', 'x'.repeat(2048)); url.searchParams.set('state', 's'.repeat(4096))
    expect(coachingConsentSuccessRedirect(url.href, config)).toBe(url.href)
    for (const [key, value] of [['code', 'x'.repeat(2049)], ['state', 's'.repeat(4097)], ['state', 'é'.repeat(2049)]]) {
      const invalid = new URL(url); invalid.searchParams.set(key, value)
      expect(() => coachingConsentSuccessRedirect(invalid.href, config)).toThrow('Authorization response is unavailable')
    }
    expect(() => coachingConsentSuccessRedirect(`${config.redirectUri}?code=x&state=${'x'.repeat(8192)}`, config)).toThrow()
    // URL serialization expands raw Unicode; the outbound Location is bounded too.
    const expanding = `${config.redirectUri}?code=${'x'.repeat(2048)}&state=${'é'.repeat(2000)}`
    expect(expanding.length).toBeLessThan(8192)
    expect(new URL(expanding).href.length).toBeGreaterThan(8192)
    expect(() => coachingConsentSuccessRedirect(expanding, config)).toThrow()
  })
  it.each([
    undefined, null, {}, '', 'javascript:alert(1)',
    'https://evil.invalid/connector/oauth/synthetic-callback?code=x&state=y',
    'http://chatgpt.com/connector/oauth/synthetic-callback?code=x&state=y',
    'https://chatgpt.com:444/connector/oauth/synthetic-callback?code=x&state=y',
    'https://user@chatgpt.com/connector/oauth/synthetic-callback?code=x&state=y',
    'https://chatgpt.com/connector/oauth/synthetic-callback/../synthetic-callback?code=x&state=y',
    ...['', '?code=x', '?state=y', '?code=&state=y', '?code=x&state=', '?code=%20&state=y', '?code=x&state=%20',
      '?code=x&code=y&state=z', '?code=x&%63ode=y&state=z', '?code=x&state=y&state=z',
      '?code=x&state=y&access_token=private', '?code=x&state=y&id_token=private', '?code=x&state=y&error=denied',
      '?code=x&state=y&iss=foreign', '?code=x&state=y&next=https://evil.invalid', '?code=x&state=y#fragment', '?code=x&state=y#',
      '?code=x&state=%00', '?code=%0d%0a&state=y', '?code=x&state=y\n', '?code=x&state=y\\z',
    ].map(suffix => config.redirectUri + suffix),
  ])('rejects malformed/ambiguous or unregistered success value %#', value => {
    expect(() => coachingConsentSuccessRedirect(value, config)).toThrow('Authorization response is unavailable')
  })
})

describe('explicit owner consent decisions with no live grants', () => {
  // Trust the authenticated native response; do not invent omitted metadata.
  it('continues the native saved grant without another decision or inferred grant-list binding', async () => {
    const fixture = cookieConsent()
    const listGrants = vi.fn(async () => ({ data: [{ client: { id: clientId }, scopes: ['email'] }], error: null }))
    const revokeGrant = vi.fn()
    Object.assign(fixture.db.auth.oauth, { listGrants, revokeGrant })
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({
      data: { redirect_url: `${config.redirectUri}?code=synthetic-existing&state=synthetic` }, error: null,
    } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).resolves.toEqual({
      kind: 'redirect', redirect: `${config.redirectUri}?code=synthetic-existing&state=synthetic`,
    })
    expect(fixture.db.auth.oauth.getAuthorizationDetails).toHaveBeenCalledExactlyOnceWith(authorizationId)
    expect(listGrants).not.toHaveBeenCalled(); expect(revokeGrant).not.toHaveBeenCalled()
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each([
    { user: null, error: null }, { user: { id: owner, is_anonymous: true }, error: null },
    { user: { id: owner }, error: { message: 'synthetic-private-owner-error' } },
  ])('requires provider-authenticated nonanonymous owner before reading a saved grant %#', async state => {
    const fixture = cookieConsent()
    vi.mocked(fixture.db.auth.getUser).mockResolvedValueOnce({ data: { user: state.user }, error: state.error } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).rejects.toMatchObject({ status: 401 })
    expect(fixture.db.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
  })
  it.each(['expired', 'unknown', 'other-owner', 'unavailable'])('does not relay native provider rejection for %s', async failure => {
    const fixture = cookieConsent()
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({
      data: { redirect_url: `${config.redirectUri}?code=synthetic-private&state=synthetic-private` },
      error: { message: `synthetic-private-${failure}` },
    } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).rejects.toMatchObject({ status: 400,
      message: 'Authorization request does not match this account and connection' })
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each([{ extra: true }, { authorization_id: authorizationId }, { client: { id: clientId } }])('rejects mixed redirect-only DTO %#', async extra => {
    const fixture = cookieConsent()
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({ data: {
      redirect_url: `${config.redirectUri}?code=synthetic&state=synthetic`, ...extra,
    }, error: null } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).rejects.toMatchObject({ status: 400 })
  })
  it.each([{ client_id: other }, { scope: 'openid email' }])('opaque relay does not authorize a credential with other client/scope %#', async claims => {
    const cookie = cookieConsent(), bearer = provider()
    vi.mocked(cookie.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({
      data: { redirect_url: `${config.redirectUri}?code=synthetic&state=synthetic` }, error: null,
    } as never)
    expect((await readCoachingConsent(cookie.db, authorizationId, config)).kind).toBe('redirect')
    // No hidden metadata is inferred; the real token verifier enforces authority.
    await expect(authorizeCoachingBearer(request(token(claims)), config, bearer.dependencies)).rejects.toMatchObject({ status: 401 })
    expect(bearer.query.db.from).not.toHaveBeenCalled()
  })
  it('does not approve from an old snapshot after the provider returns only an existing-grant redirect', async () => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({
      data: { redirect_url: `${config.redirectUri}?code=synthetic-existing&state=synthetic` }, error: null,
    } as never)
    if (consent.kind !== 'pending') throw new Error('Expected pending fixture')
    await expect(decideCoachingConsent(fixture.db, new URLSearchParams({ authorization_id: authorizationId,
      decision: 'approve', snapshot: consent.snapshot }), config)).rejects.toMatchObject({ status: 409 })
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each(['30000000-0000-4000-8000-000000000001', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), '0'.repeat(32), '1'.repeat(32), '8'.repeat(32), '9'.repeat(32), '_'.repeat(32), '-'.repeat(32), ' '.repeat(32), 'é'.repeat(32)])('rejects malformed frontend authorization ID %s before reading any account', async value => {
    const fixture = cookieConsent()
    await expect(readCoachingConsent(fixture.db, value, config)).rejects.toMatchObject({ status: 400 })
    expect(fixture.db.auth.getUser).not.toHaveBeenCalled()
    expect(fixture.db.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('rejects a different provider request ID without approving', async () => {
    const fixture = cookieConsent()
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({ data: { authorization_id: authorizationId.toUpperCase(), client: { id: clientId }, user: { id: owner }, scope: 'email' }, error: null } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).rejects.toMatchObject({ status: 400 })
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('binds approval to the displayed authorization ID even when another request has the same owner, client and scope', async () => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    const changedId = 'b'.repeat(32)
    vi.mocked(fixture.db.auth.oauth.getAuthorizationDetails).mockResolvedValueOnce({ data: { authorization_id: changedId, client: { id: clientId, name: 'Synthetic ChatGPT' }, user: { id: owner }, scope: 'email' }, error: null } as never)
    await expect(decideCoachingConsent(fixture.db, new URLSearchParams({ authorization_id: changedId, decision: 'approve', snapshot: consent.snapshot }), config)).rejects.toMatchObject({ status: 409 })
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('reads exact permissions without approving or denying', async () => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    expect(consent.scopes).toEqual(['email'])
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each(['approve', 'deny'])('performs only the explicit %s decision', async decision => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    const result = await decideCoachingConsent(fixture.db, new URLSearchParams({ authorization_id: authorizationId, decision, snapshot: consent.snapshot }), config)
    expect(result).toContain(decision === 'approve' ? 'code=synthetic' : 'error=access_denied')
    expect(fixture.approve).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0)
    expect(fixture.deny).toHaveBeenCalledTimes(decision === 'deny' ? 1 : 0)
  })
  it('refuses an expanded OIDC request before submission rather than requiring a signing migration', async () => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    fixture.changeScope()
    await expect(decideCoachingConsent(fixture.db, new URLSearchParams({ authorization_id: authorizationId, decision: 'approve', snapshot: consent.snapshot }), config)).rejects.toMatchObject({ status: 400 })
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('requires a fresh review if the displayed connection details change', async () => {
    const fixture = cookieConsent(), consent = await pendingConsent(fixture.db)
    fixture.changeName()
    await expect(decideCoachingConsent(fixture.db, new URLSearchParams({ authorization_id: authorizationId, decision: 'approve', snapshot: consent.snapshot }), config)).rejects.toMatchObject({ status: 409 })
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('rejects a provider request belonging to another owner or client', async () => {
    const fixture = cookieConsent()
    await expect(readCoachingConsent(fixture.db, authorizationId, { ...config, clientId: other })).rejects.toMatchObject({ status: 400 })
    vi.mocked(fixture.db.auth.getUser).mockResolvedValueOnce({ data: { user: { id: other } }, error: null } as never)
    await expect(readCoachingConsent(fixture.db, authorizationId, config)).rejects.toMatchObject({ status: 400 })
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it.each(['https://evil.invalid/callback?code=x', `${config.redirectUri}/extra?code=x`, `${config.redirectUri}#access_token=x`, `${config.redirectUri}?access_token=x`])('rejects an unregistered or token-bearing redirect %s', value => {
    expect(() => coachingConsentRedirect(value, config)).toThrow()
  })
})

describe('disabled-by-default project and callback configuration', () => {
  const environment = { SOCIUS_MCP_ENABLED: 'true', SOCIUS_MCP_ORIGIN: config.origin, SOCIUS_MCP_CLIENT_ID: clientId,
    SOCIUS_MCP_REDIRECT_URI: config.redirectUri, NEXT_PUBLIC_SUPABASE_URL: 'https://auolnfwetmfcwhtvakzy.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: config.publicKey }
  it('requires explicit configuration and the actual selected callback', () => {
    expect(() => coachingOAuthConfig({})).toThrow('not configured')
    expect(coachingOAuthConfig(environment).resource).toBe(config.resource)
  })
  it.each([{ SOCIUS_MCP_ENABLED: 'false' }, { SOCIUS_MCP_REDIRECT_URI: '' }, { SOCIUS_MCP_REDIRECT_URI: 'https://evil.invalid/callback' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_forbidden' }])('fails closed for %j', patch => {
    expect(() => coachingOAuthConfig({ ...environment, ...patch })).toThrow('not configured')
  })
})
