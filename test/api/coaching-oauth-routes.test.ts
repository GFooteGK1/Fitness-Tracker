import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { GET as consentGet, POST as consentPost } from '../../app/oauth/consent/route'
import { POST as mcpPost } from '../../app/api/mcp/route'
import { GET as resourceGet } from '../../app/.well-known/oauth-protected-resource/api/mcp/route'

const origin = 'https://socius.synthetic.invalid', clientId = '20000000-0000-4000-8000-000000000001'
const authorizationId = 'abcdefghijklmnopqrstuvwxyz234567', owner = '10000000-0000-4000-8000-000000000001'
const callback = 'https://chatgpt.com/connector/oauth/synthetic-callback'
const requestUrl = `${origin}/oauth/consent?authorization_id=${authorizationId}`
function cookieClient() {
  const approve = vi.fn(async () => ({ data: { redirect_url: `${callback}?code=synthetic&state=synthetic` }, error: null }))
  const deny = vi.fn(async () => ({ data: { redirect_url: `${callback}?error=access_denied&state=synthetic` }, error: null }))
  const db = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: owner, email: 'synthetic@example.invalid' } }, error: null })), oauth: {
    getAuthorizationDetails: vi.fn(async () => ({ data: { authorization_id: authorizationId, client: { id: clientId, name: '<script>private</script>' }, user: { id: owner }, scope: 'email' }, error: null })),
    approveAuthorization: approve, denyAuthorization: deny,
  } } }
  vi.mocked(createServerClient).mockResolvedValue(db as never)
  return { db, approve, deny }
}
async function form(decision = 'deny') {
  const response = await consentGet(new Request(requestUrl)), html = await response.text()
  const snapshot = html.match(/name="snapshot" value="([a-f0-9]+)"/)?.[1]
  if (!snapshot) throw new Error('Consent snapshot unavailable')
  return new URLSearchParams({ authorization_id: authorizationId, decision, snapshot })
}
beforeEach(() => {
  for (const [key, value] of Object.entries({ SOCIUS_MCP_ENABLED: 'true', SOCIUS_MCP_ORIGIN: origin, SOCIUS_MCP_CLIENT_ID: clientId,
    SOCIUS_MCP_REDIRECT_URI: callback, NEXT_PUBLIC_SUPABASE_URL: 'https://auolnfwetmfcwhtvakzy.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' })) vi.stubEnv(key, value)
  vi.clearAllMocks()
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('disabled-by-default owner OAuth routes with synthetic cookie session', () => {
  it('returns only a bodyless private no-referrer303 for an authenticated saved grant without another decision', async () => {
    const f = cookieClient(), redirect = `${callback}?code=synthetic-private-code&state=synthetic-private-state`
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
    f.db.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({ data: { redirect_url: redirect }, error: null } as never)
    const response = await consentGet(new Request(requestUrl))
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe(redirect)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('vary')).toBe('Authorization, Cookie')
    expect(f.db.auth.getUser).toHaveBeenCalledTimes(1)
    expect(f.db.auth.oauth.getAuthorizationDetails).toHaveBeenCalledExactlyOnceWith(authorizationId)
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(logs.flatMap(log => log.mock.calls)).toEqual([])
  })
  it.each([
    { redirect_url: 'https://evil.invalid/steal?code=synthetic-private-code&state=synthetic-private-state' },
    { redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state&state=duplicate` },
    { redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state#access_token=synthetic-private-token` },
    { redirect_url: `${callback}?code=synthetic-private-code` },
    { redirect_url: `${callback}?state=synthetic-private-state&access_token=synthetic-private-token` },
    { redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state`, extra: 'synthetic-private-data' },
    { authorization_id: authorizationId, client: { id: clientId }, user: { id: owner }, scope: 'email',
      redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state` },
  ])('never redirects, renders or logs a malformed/mixed saved-grant response %#', async data => {
    const f = cookieClient(), logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
    f.db.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({ data, error: null } as never)
    const response = await consentGet(new Request(requestUrl))
    expect(response.status).toBeGreaterThanOrEqual(400); expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain('synthetic-private')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(logs.flatMap(log => log.mock.calls)).toEqual([])
  })
  it.each(['expired', 'other-owner', 'invalid-request', 'provider-unavailable'])('never leaks a rejected %s provider result', async failure => {
    const f = cookieClient()
    f.db.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({
      data: { redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state` },
      error: { message: `synthetic-private-${failure}` },
    } as never)
    const response = await consentGet(new Request(requestUrl))
    expect(response.status).toBe(400); expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain('synthetic-private')
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
  })
  it.each(['approve', 'deny'])('rejects stale pending %s if provider now returns a saved-grant response', async decision => {
    const f = cookieClient(), body = await form(decision)
    f.db.auth.oauth.getAuthorizationDetails.mockResolvedValueOnce({
      data: { redirect_url: `${callback}?code=synthetic-private-code&state=synthetic-private-state` }, error: null,
    } as never)
    const response = await consentPost(new Request(`${origin}/oauth/consent`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
    expect(response.status).toBe(409); expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain('synthetic-private')
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
  })
  it('also validates a successful pending Allow return before any outward redirect', async () => {
    const f = cookieClient(), body = await form('approve')
    f.approve.mockResolvedValueOnce({ data: { redirect_url: `${callback}?code=synthetic-private-code&state=x&state=y` }, error: null })
    const response = await consentPost(new Request(`${origin}/oauth/consent`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
    expect(response.status).toBe(503); expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain('synthetic-private')
    expect(f.approve).toHaveBeenCalledTimes(1); expect(f.deny).not.toHaveBeenCalled()
  })
  it('exposes public resource metadata without credentials', async () => {
    const response = await resourceGet()
    expect(await response.json()).toEqual({ resource: `${origin}/api/mcp`, authorization_servers: ['https://auolnfwetmfcwhtvakzy.supabase.co/auth/v1'], scopes_supported: ['email'], bearer_methods_supported: ['header'] })
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('returns an OAuth challenge before any cookie or domain read when bearer is missing', async () => {
    const response = await mcpPost(new Request(`${origin}/api/mcp`, { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(`${origin}/.well-known/oauth-protected-resource/api/mcp`)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('allows only public discovery while client/callback registration is incomplete', async () => {
    vi.stubEnv('SOCIUS_MCP_CLIENT_ID', '')
    vi.stubEnv('SOCIUS_MCP_REDIRECT_URI', '')
    expect((await resourceGet()).status).toBe(200)
    expect((await mcpPost(new Request(`${origin}/api/mcp`, { method: 'POST' }))).status).toBe(401)
    expect((await mcpPost(new Request(`${origin}/api/mcp`, { method: 'POST', headers: { Authorization: 'Bearer synthetic' } }))).status).toBe(503)
    expect((await consentGet(new Request(requestUrl))).status).toBe(503)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('renders exact scopes and broader owner rights without consenting; escapes metadata and prohibits framing', async () => {
    const fixture = cookieClient(), response = await consentGet(new Request(requestUrl)), html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('<li>email</li>'); expect(html).toContain('refresh access'); expect(html).toContain('change or delete')
    expect(html).not.toContain('<li>openid</li>')
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('same-origin')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-security-policy')).toBe(`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callback}; frame-ancestors 'none'; base-uri 'none'`)
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it('denies only the selected request on explicit same-origin POST', async () => {
    const fixture = cookieClient(), body = await form()
    const response = await consentPost(new Request(`${origin}/oauth/consent`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
    expect(response.status).toBe(303); expect(response.headers.get('location')).toContain('error=access_denied')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(fixture.deny).toHaveBeenCalledTimes(1); expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('allows only the displayed and freshly revalidated request on explicit POST', async () => {
    const fixture = cookieClient(), body = await form('approve')
    const response = await consentPost(new Request(`${origin}/oauth/consent`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body }))
    expect(response.status).toBe(303); expect(response.headers.get('location')).toContain('code=synthetic')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(fixture.approve).toHaveBeenCalledTimes(1); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each([undefined, 'null', 'https://other.invalid'])('rejects missing/null/foreign Origin %s before accessing the cookie session', async value => {
    cookieClient()
    const response = await consentPost(new Request(`${origin}/oauth/consent`, { method: 'POST', headers: { ...(value ? { Origin: value } : {}), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'decision=approve' }))
    expect(response.status).toBe(400); expect(createServerClient).not.toHaveBeenCalled()
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
  it('preserves the review URL across a sign-in handoff and never approves an unauthenticated GET', async () => {
    const fixture = cookieClient()
    fixture.db.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null } as never)
    const response = await consentGet(new Request(requestUrl)), html = await response.text()
    expect(response.status).toBe(401); expect(html).toContain('target="_blank"'); expect(html).toContain(`authorization_id=${authorizationId}`)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-security-policy')).toContain("form-action 'self';")
    expect(fixture.approve).not.toHaveBeenCalled()
  })
  it('hands only the opaque authorization ID from the existing exact Site URL alias to the canonical consent origin before reading any account', async () => {
    const fixture = cookieClient()
    const response = await consentGet(new Request(`https://fitness-tracker-gregs-projects-98860c8b.vercel.app/oauth/consent?authorization_id=${authorizationId}`,
      { headers: { Host: 'evil.invalid', 'X-Forwarded-Host': 'evil.invalid' } }))
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe(requestUrl)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(createServerClient).not.toHaveBeenCalled()
    expect(fixture.db.auth.getUser).not.toHaveBeenCalled()
    expect(fixture.db.auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(fixture.approve).not.toHaveBeenCalled(); expect(fixture.deny).not.toHaveBeenCalled()
  })
  it.each([
    'https://other.invalid', 'http://fitness-tracker-gregs-projects-98860c8b.vercel.app',
    'https://fitness-tracker-gregs-projects-98860c8b.vercel.app.evil.invalid',
    'https://sub.fitness-tracker-gregs-projects-98860c8b.vercel.app',
    'https://fitness-tracker-gregs-projects-98860c8b.vercel.app:444',
  ])('rejects foreign or lookalike consent GET origin %s before account reads', async incomingOrigin => {
    cookieClient()
    const response = await consentGet(new Request(`${incomingOrigin}/oauth/consent?authorization_id=${authorizationId}`))
    expect(response.status).toBe(400); expect(response.headers.has('location')).toBe(false)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it.each([
    '', '?authorization_id=', '?authorization_id=not-an-opaque-id',
    '?authorization_id=30000000-0000-4000-8000-000000000001',
    ...['a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), '0'.repeat(32), '1'.repeat(32), '8'.repeat(32), '9'.repeat(32), '_'.repeat(32), '-'.repeat(32), ' '.repeat(32), 'é'.repeat(32)].map(value => `?authorization_id=${encodeURIComponent(value)}`),
    `?authorization_id=${authorizationId}&authorization_id=${authorizationId}`,
    `?authorization_id=${authorizationId}&%61uthorization_id=${authorizationId}`,
    ...['access_token', 'code', 'state', 'redirect_uri', 'next'].map(key => `?authorization_id=${authorizationId}&${key}=synthetic-private`),
  ])('rejects malformed or additional alias query %s without forwarding or reading it', async query => {
    cookieClient()
    const response = await consentGet(new Request(`https://fitness-tracker-gregs-projects-98860c8b.vercel.app/oauth/consent${query}`))
    expect(response.status).toBe(400); expect(response.headers.has('location')).toBe(false)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('never accepts an alias consent POST or redirects its approval decision', async () => {
    cookieClient()
    const alias = 'https://fitness-tracker-gregs-projects-98860c8b.vercel.app'
    for (const suppliedOrigin of [alias, origin]) {
      const response = await consentPost(new Request(`${alias}/oauth/consent`, { method: 'POST',
        headers: { Origin: suppliedOrigin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'decision=approve' }))
      expect(response.status).toBe(400); expect(response.headers.has('location')).toBe(false)
    }
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('keeps alias GET disabled without redirects or account reads', async () => {
    cookieClient(); vi.stubEnv('SOCIUS_MCP_ENABLED', 'false')
    const response = await consentGet(new Request(`https://fitness-tracker-gregs-projects-98860c8b.vercel.app/oauth/consent?authorization_id=${authorizationId}`))
    expect(response.status).toBe(503); expect(response.headers.has('location')).toBe(false)
    expect(createServerClient).not.toHaveBeenCalled()
  })
  it('leaves all new routes unavailable unless explicitly enabled and fully configured', async () => {
    vi.stubEnv('SOCIUS_MCP_ENABLED', 'false')
    expect((await resourceGet()).status).toBe(503)
    expect((await consentGet(new Request(requestUrl))).status).toBe(503)
    expect((await mcpPost(new Request(`${origin}/api/mcp`, { method: 'POST' }))).status).toBe(503)
    expect(createServerClient).not.toHaveBeenCalled()
  })
})
