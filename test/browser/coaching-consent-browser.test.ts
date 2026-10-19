// Real Chromium form navigations, using production handlers and synthetic auth only.
// All browser DNS resolves to a loopback TLS fixture, including redirected requests
// that Playwright routing may not intercept. No host session or provider is used.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser, type BrowserContext } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '../../app/lib/auth/supabase-server'
import { GET, POST } from '../../app/oauth/consent/route'

const origin = 'https://socius.synthetic.invalid'
const external = 'https://external.synthetic.invalid'
const attacker = 'https://attacker.synthetic.invalid'
const canary = 'https://unhandled.synthetic.invalid/probe'
const authorizationId = 'abcdefghijklmnopqrstuvwxyz234567'
const consentUrl = `${origin}/oauth/consent?authorization_id=${authorizationId}`
const callback = 'https://chatgpt.com/connector/oauth/synthetic-callback'
const owner = '10000000-0000-4000-8000-000000000001'
const clientId = '20000000-0000-4000-8000-000000000001'
let browser: Browser
let loopback: Server
let networkBoundaryVerified = false
let receiveLoopback: (request: IncomingMessage, response: ServerResponse) => void = (request, response) => {
  const isCanary = `https://${request.headers.host}${request.url}` === canary
  response.writeHead(isCanary ? 418 : 403, { 'Content-Type': 'text/html' }).end(isCanary ? 'Synthetic loopback only' : 'Blocked by synthetic fixture')
}
let contexts: BrowserContext[] = []
const observations: { options: object; requests: object[]; unexpected: string[]; browserErrors: string[] }[] = []

beforeAll(async () => {
  const [key, cert] = await Promise.all(['synthetic-key.pem', 'synthetic-cert.pem'].map(name =>
    readFile(new URL(`../fixtures/coaching-consent-tls/${name}`, import.meta.url))))
  loopback = createServer({ key, cert }, (request, response) => receiveLoopback(request, response))
  await new Promise<void>((resolve, reject) => { loopback.once('error', reject); loopback.listen(0, '127.0.0.1', resolve) })
  const port = (loopback.address() as AddressInfo).port
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', `--host-resolver-rules=MAP * 127.0.0.1:${port}`] })
  // Fail the entire suite before any callback test if DNS/proxy containment is
  // not effective. A failure here cannot fall through into external navigation.
  const probe = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true })
  try {
    const page = await probe.newPage()
    const response = await page.goto(canary, { timeout: 5000 })
    expect(response?.status()).toBe(418)
    expect(await page.locator('body').innerText()).toBe('Synthetic loopback only')
    networkBoundaryVerified = true
  } finally { await probe.close() }
}, 30_000)
afterAll(async () => {
  await browser?.close()
  if (loopback) await new Promise<void>(resolve => loopback.close(() => resolve()))
  if (process.env.SOCIUS_CONSENT_BROWSER_RECEIPT) await writeFile(process.env.SOCIUS_CONSENT_BROWSER_RECEIPT,
    JSON.stringify({ browser: browser?.version(), syntheticOnly: true, networkBoundaryVerified, observations: observations.map(item => ({
      options: Object.fromEntries(Object.entries(item.options).map(([key, value]) => [key, key === 'existingRedirect' ? 'synthetic response supplied' : value])),
      requests: item.requests.map(value => {
        const request = value as { url: string; method: string; origin?: string; referer?: string; status: number }
        const url = new URL(request.url)
        return { ...request, url: url.origin + url.pathname, queryKeys: [...url.searchParams.keys()],
          referer: request.referer ? new URL(request.referer).origin + new URL(request.referer).pathname : undefined }
      }), unexpected: item.unexpected, browserErrors: item.browserErrors.map(message => ({ formActionViolation: message.includes('form-action') })),
    })) }, null, 2) + '\n')
})
beforeEach(() => {
  for (const [key, value] of Object.entries({ SOCIUS_MCP_ENABLED: 'true', SOCIUS_MCP_ORIGIN: origin,
    SOCIUS_MCP_CLIENT_ID: clientId, SOCIUS_MCP_REDIRECT_URI: callback,
    NEXT_PUBLIC_SUPABASE_URL: 'https://auolnfwetmfcwhtvakzy.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' })) vi.stubEnv(key, value)
  vi.clearAllMocks()
})
afterEach(async () => {
  await Promise.all(contexts.map(context => context.close())); contexts = []
  vi.unstubAllEnvs(); vi.restoreAllMocks()
})

async function fixture(options: { baseline?: boolean; selfOnlyCsp?: boolean; hostile?: 'foreign' | 'opaque'; existingRedirect?: string;
  relayReferrerControl?: boolean; ownerStatus?: 'signed-out' | 'anonymous' | 'expired'; nativeFailure?: string;
  pendingClient?: string; pendingScope?: string; mixed?: boolean } = {}) {
  if (!networkBoundaryVerified) throw new Error('Loopback network boundary has not been verified')
  const approve = vi.fn(async () => ({ data: { redirect_url: `${callback}?code=synthetic&state=synthetic` }, error: null }))
  const deny = vi.fn(async () => ({ data: { redirect_url: `${callback}?error=access_denied&state=synthetic` }, error: null }))
  const getUser = vi.fn(async () => ({ data: { user: options.ownerStatus === 'signed-out' ? null
    : { id: owner, email: 'synthetic@example.invalid', is_anonymous: options.ownerStatus === 'anonymous' } },
  error: options.ownerStatus === 'expired' ? { message: 'synthetic-private-error' } : null }))
  const getAuthorizationDetails = vi.fn(async () => ({ data: options.existingRedirect
    ? { redirect_url: options.existingRedirect, ...(options.mixed ? { extra: true } : {}) }
    : { authorization_id: authorizationId, redirect_uri: callback,
      client: { id: options.pendingClient ?? clientId, name: 'Synthetic pilot' }, user: { id: owner }, scope: options.pendingScope ?? 'email' },
  error: options.nativeFailure ? { message: 'synthetic-private-error' } : null }))
  vi.mocked(createServerClient).mockResolvedValue({ auth: { getUser, oauth: {
    getAuthorizationDetails, approveAuthorization: approve, denyAuthorization: deny,
  } } } as never)
  // This trust exception belongs only to this fresh synthetic loopback context.
  const context = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true }); contexts.push(context)
  const requests: { url: string; method: string; origin?: string; referer?: string; status: number }[] = []
  const unexpected: string[] = []
  const browserErrors: string[] = []
  observations.push({ options, requests, unexpected, browserErrors })
  receiveLoopback = (incoming, response) => {
    const url = new URL(incoming.url ?? '/', `https://${incoming.headers.host}`)
    const isCallback = url.origin === new URL(callback).origin && url.pathname === new URL(callback).pathname
    const isLanding = url.origin === external && url.pathname === '/landing'
    const isCanary = url.href === canary
    const status = isCanary ? 418 : isCallback || isLanding ? 200 : 403
    if (!isCanary && !isCallback && !isLanding) unexpected.push(`${incoming.method} ${url.origin}${url.pathname}`)
    requests.push({ url: url.href, method: incoming.method ?? 'GET', origin: incoming.headers.origin,
      referer: incoming.headers.referer, status })
    response.writeHead(status, { 'Content-Type': 'text/html' })
      .end(isCanary ? '<!doctype html><title>Loopback isolation</title>Synthetic loopback only' : '<!doctype html><title>Synthetic destination</title><p>Served by loopback TLS fixture</p>')
  }
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url()), headers = await incoming.allHeaders()
    let response: Response
    if (url.origin === origin && url.pathname === '/oauth/consent') {
      const request = new Request(incoming.url(), { method: incoming.method(), headers,
        ...(incoming.method() === 'POST' ? { body: incoming.postData() ?? '' } : {}) })
      response = incoming.method() === 'POST' ? await POST(request) : await GET(request)
      if (options.relayReferrerControl && incoming.method() === 'GET' && response.status === 303) {
        response.headers.set('Referrer-Policy', 'unsafe-url') // Known-bad relay control.
      }
      if (options.baseline && incoming.method() === 'GET' && response.status === 200) {
        // Known-bad control: only restore the original document policy.
        response.headers.set('Referrer-Policy', 'no-referrer')
      }
      if (options.selfOnlyCsp && incoming.method() === 'GET' && response.status === 200) {
        response.headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      }
    } else if (url.origin === attacker && url.pathname === '/start') {
      response = new Response(`<!doctype html><a href="${consentUrl}">Connect synthetic app</a>`, {
        headers: { 'Content-Type': 'text/html', 'Referrer-Policy': 'unsafe-url' },
      })
    } else if (url.origin === attacker && options.hostile) {
      const review = await GET(new Request(consentUrl))
      const html = (await review.text()).replace('action="/oauth/consent"', `action="${origin}/oauth/consent"`)
      response = new Response(html, { headers: { 'Content-Type': 'text/html', 'Referrer-Policy': 'strict-origin',
        ...(options.hostile === 'opaque' ? { 'Content-Security-Policy': 'sandbox allow-forms' } : {}) } })
      // Discard only synthetic preparation reads; hostile POST must do zero auth work.
      vi.mocked(createServerClient).mockClear(); getUser.mockClear(); getAuthorizationDetails.mockClear()
    } else if ((url.origin === external && url.pathname === '/landing') || incoming.url().startsWith(`${callback}?`) || incoming.url() === canary) {
      // Exercise real headers at the loopback receiver rather than fulfilling
      // external navigations in Playwright. The resolver/proxy flags contain it.
      await route.continue(); return
    } else {
      unexpected.push(`${incoming.method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient'); return
    }
    requests.push({ url: incoming.url(), method: incoming.method(), origin: headers.origin, referer: headers.referer, status: response.status })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(3000); page.setDefaultNavigationTimeout(3000)
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  return { page, requests, unexpected, browserErrors, approve, deny, getUser, getAuthorizationDetails }
}

describe('real browser consent form Origin and referrer boundary', () => {
  it('completes the native saved-grant GET continuation with no external Referer, body disclosure or new decision', async () => {
    const redirect = `${callback}?code=synthetic-existing&state=opaque-host-state`
    const f = await fixture({ existingRedirect: redirect })
    const source = `${attacker}/start?private=synthetic-source-private`
    await f.page.goto(source)
    await f.page.getByRole('link', { name: 'Connect synthetic app' }).click()
    await f.page.waitForURL(redirect)
    expect(f.requests.find(request => request.url === consentUrl)).toMatchObject({ status: 303, referer: source })
    const outgoing = f.requests.filter(request => new URL(request.url).origin === new URL(callback).origin)
    expect(outgoing).toHaveLength(1); expect(outgoing[0]).toMatchObject({ url: redirect, method: 'GET', status: 200 })
    expect(outgoing[0].referer).toBeUndefined()
    expect(await f.page.evaluate(() => document.referrer)).toBe('')
    expect(await f.page.locator('body').innerText()).not.toContain('synthetic-existing')
    expect(f.getUser).toHaveBeenCalledTimes(1); expect(f.getAuthorizationDetails).toHaveBeenCalledExactlyOnceWith(authorizationId)
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(f.requests.filter(request => request.method === 'POST')).toEqual([])
    expect(f.unexpected).toEqual([])
  })
  it('detects a known-bad relay policy leaking the referring document to the external callback', async () => {
    const f = await fixture({ existingRedirect: `${callback}?code=synthetic-existing&state=opaque-host-state`, relayReferrerControl: true })
    const source = `${attacker}/start?private=synthetic-source-private`
    await f.page.goto(source)
    await f.page.getByRole('link', { name: 'Connect synthetic app' }).click()
    await f.page.waitForURL(`${callback}?**`)
    expect(f.requests.find(request => request.url.startsWith(`${callback}?`))?.referer).toBe(source)
    expect(f.unexpected).toEqual([])
  })
  it.each([
    `${external}/landing?code=synthetic-existing&state=synthetic`,
    `${callback}?code=synthetic-existing`,
    `${callback}?code=synthetic-existing&state=x&state=y`,
    `${callback}?code=synthetic-existing&state=x#access_token=synthetic-token`,
  ])('fails closed on an invalid native existing-grant response without navigation or code disclosure %#', async existingRedirect => {
    const f = await fixture({ existingRedirect })
    const response = await f.page.goto(consentUrl)
    expect(response?.status()).toBe(503)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
    const body = await f.page.locator('body').innerText()
    expect(body).toContain('Authorization response is unavailable')
    expect(body).not.toContain('synthetic-existing'); expect(body).not.toContain(existingRedirect)
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0]).toMatchObject({ url: consentUrl, status: 503 })
    expect(f.getUser).toHaveBeenCalledTimes(1); expect(f.getAuthorizationDetails).toHaveBeenCalledTimes(1)
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(await f.page.getByRole('button').count()).toBe(0)
    expect(f.unexpected).toEqual([])
  })
  it.each(['signed-out', 'anonymous', 'expired'] as const)('requires authenticated nonanonymous owner before saved-grant continuation: %s', async ownerStatus => {
    const f = await fixture({ ownerStatus, existingRedirect: `${callback}?code=synthetic-existing&state=x` })
    const response = await f.page.goto(consentUrl)
    expect(response?.status()).toBe(401)
    expect(await f.page.locator('body').innerText()).not.toContain('synthetic-existing')
    expect(f.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(f.requests).toHaveLength(1)
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
  })
  it.each([
    { nativeFailure: 'expired' }, { nativeFailure: 'unknown' }, { nativeFailure: 'other-owner' },
    { pendingClient: '20000000-0000-4000-8000-000000000002' }, { pendingScope: 'openid email' },
    { existingRedirect: `${callback}?code=synthetic-existing&state=x`, mixed: true },
  ])('does no outward navigation on provider/pending authorization rejection %#', async options => {
    const f = await fixture(options)
    const response = await f.page.goto(consentUrl)
    expect(response?.status()).toBe(400)
    expect(await f.page.locator('body').innerText()).not.toContain('synthetic-existing')
    expect(f.requests).toHaveLength(1); expect(f.unexpected).toEqual([])
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
  })
  it('contains an unhandled synthetic host at loopback with no external resolver or proxy', async () => {
    const f = await fixture()
    const response = await f.page.goto(canary)
    expect(response?.status()).toBe(418)
    expect(await f.page.locator('body').innerText()).toBe('Synthetic loopback only')
    expect(f.requests).toMatchObject([{ url: canary, status: 418 }])
    expect(f.unexpected).toEqual([])
  })
  it.each(['approve', 'deny'] as const)('ordinary %s uses canonical Origin, revalidates and redirects without external Referer', async decision => {
    const f = await fixture()
    const response = await f.page.goto(consentUrl)
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    await f.page.getByRole('button', { name: decision === 'approve' ? 'Allow this connection' : 'Decline', exact: true }).click()
    await f.page.waitForLoadState()
    const post = f.requests.find(request => request.method === 'POST')
    expect(post).toMatchObject({ origin, status: 303, referer: consentUrl })
    expect(response?.headers()['referrer-policy']).toBe('same-origin')
    await f.page.waitForURL(`${callback}?**`)
    expect(f[decision]).toHaveBeenCalledExactlyOnceWith(authorizationId, { skipBrowserRedirect: true })
    expect(f[decision === 'approve' ? 'deny' : 'approve']).not.toHaveBeenCalled()
    expect(f.getUser).toHaveBeenCalledTimes(2); expect(f.getAuthorizationDetails).toHaveBeenCalledTimes(2)
    const outgoing = f.requests.filter(request => new URL(request.url).origin !== origin)
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0].referer).toBeUndefined()
    expect(JSON.stringify(outgoing)).not.toContain(authorizationId)
    expect(await f.page.evaluate(() => document.referrer)).toBe('')
    expect(f.unexpected).toEqual([])
  })

  it('reproduces the original no-referrer form failure with a literal null Origin and no approval', async () => {
    const f = await fixture({ baseline: true })
    await f.page.goto(consentUrl)
    vi.mocked(createServerClient).mockClear(); f.getUser.mockClear(); f.getAuthorizationDetails.mockClear()
    await f.page.getByRole('button', { name: 'Allow this connection', exact: true }).click()
    await f.page.waitForURL(`${origin}/oauth/consent`)
    expect(f.requests.find(request => request.method === 'POST')).toMatchObject({ origin: 'null', status: 400 })
    expect(await f.page.locator('body').innerText()).toContain('Invalid consent origin or form')
    expect(createServerClient).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled()
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(f.unexpected).toEqual([])
  })

  it.each(['foreign', 'opaque'] as const)('rejects an actual %s browser form before cookie or provider access', async hostile => {
    const f = await fixture({ hostile })
    await f.page.goto(`${attacker}/form`)
    await f.page.getByRole('button', { name: 'Allow this connection', exact: true }).click()
    await f.page.waitForURL(`${origin}/oauth/consent`)
    expect(f.requests.find(request => request.method === 'POST')).toMatchObject({ origin: hostile === 'opaque' ? 'null' : attacker, status: 400 })
    expect(createServerClient).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled()
    expect(f.getAuthorizationDetails).not.toHaveBeenCalled()
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(f.unexpected).toEqual([])
  })

  it('omits the full Referer on direct external navigation from the canonical consent document', async () => {
    const f = await fixture()
    await f.page.goto(consentUrl)
    // Test-only link exercises browser navigation without changing production HTML.
    await f.page.evaluate(href => { const link = document.createElement('a'); link.href = href; link.textContent = 'Synthetic external link'; document.body.append(link) }, `${external}/landing`)
    await f.page.getByRole('link', { name: 'Synthetic external link' }).click()
    await f.page.waitForURL(`${external}/landing`)
    const outgoing = f.requests.filter(request => new URL(request.url).origin !== origin)
    expect(outgoing).toHaveLength(1); expect(outgoing[0].referer).toBeUndefined()
    expect(JSON.stringify(outgoing)).not.toContain(authorizationId)
    expect(await f.page.evaluate(() => document.referrer)).toBe('')
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(f.unexpected).toEqual([])
  })

  it('blocks a different external form target before transmitting the synthetic form', async () => {
    const f = await fixture()
    await f.page.goto(consentUrl)
    await f.page.locator('form').evaluate((form, href) => form.setAttribute('action', href), `${external}/landing`)
    await Promise.all([
      f.page.waitForEvent('console', { predicate: message => message.type() === 'error' && message.text().includes('form-action') }),
      f.page.getByRole('button', { name: 'Allow this connection', exact: true }).click({ noWaitAfter: true }),
    ])
    expect(f.requests.filter(request => request.method === 'POST' || new URL(request.url).origin !== origin)).toEqual([])
    expect(f.approve).not.toHaveBeenCalled(); expect(f.deny).not.toHaveBeenCalled()
    expect(f.unexpected).toEqual([])
  })

  it('detects the old self-only CSP blocking the legitimate 303 callback after a valid POST', async () => {
    const f = await fixture({ selfOnlyCsp: true })
    await f.page.goto(consentUrl)
    await Promise.all([
      f.page.waitForEvent('console', { predicate: message => message.type() === 'error' && message.text().includes('form-action') }),
      f.page.getByRole('button', { name: 'Allow this connection', exact: true }).click({ noWaitAfter: true }),
    ])
    expect(f.requests.find(request => request.method === 'POST')).toMatchObject({ origin, status: 303 })
    expect(f.approve).toHaveBeenCalledTimes(1)
    expect(f.requests.filter(request => new URL(request.url).origin !== origin)).toEqual([])
    expect(f.unexpected).toEqual([])
  })
})
