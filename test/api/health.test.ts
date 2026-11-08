import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatWithOptions } from 'node:util'

const timestamp = '2026-11-08T12:34:56.789Z'
const privateValues = {
  message: 'SYNTHETIC_PRIVATE_PROVIDER_MESSAGE',
  code: 'SYNTHETIC_PRIVATE_PROVIDER_CODE',
  details: 'SYNTHETIC_PRIVATE_QUERY_DETAILS',
  hint: 'SYNTHETIC_PRIVATE_PROVIDER_HINT',
  cause: 'SYNTHETIC_PRIVATE_CAUSE',
  stack: 'SYNTHETIC_PRIVATE_STACK',
  url: 'https://synthetic-private-project.invalid',
  identifier: 'SYNTHETIC_PRIVATE_RECORD_IDENTIFIER',
  key: 'SYNTHETIC_PRIVATE_ENVIRONMENT_KEY',
}

function privateError(): Error {
  return Object.assign(new Error(privateValues.message), {
    ...privateValues,
    cause: new Error(privateValues.cause),
  })
}

let logs: string[]
let limit: ReturnType<typeof vi.fn>
let select: ReturnType<typeof vi.fn>
let from: ReturnType<typeof vi.fn>
let createServerClient: ReturnType<typeof vi.fn>
let imported: ReturnType<typeof vi.fn<() => { createServerClient: typeof createServerClient }>>

async function response() {
  const { GET } = await import('@/app/api/health/route')
  return GET()
}

async function publicBody(result: Response) {
  const text = await result.text()
  const complete = JSON.stringify([...result.headers]) + text + logs.join('\n')
  for (const value of Object.values(privateValues)) expect(complete).not.toContain(value)
  return JSON.parse(text)
}

function healthy(database = 'connected', auth = 'configured') {
  return { status: 'healthy', timestamp, version: '1.0.0', environment: 'test', services: { database, auth } }
}

function assertProbe() {
  expect(imported).toHaveBeenCalledTimes(1)
  expect(createServerClient).toHaveBeenCalledExactlyOnceWith()
  expect(from).toHaveBeenCalledExactlyOnceWith('user_profiles')
  expect(select).toHaveBeenCalledExactlyOnceWith('count')
  expect(limit).toHaveBeenCalledExactlyOnceWith(1)
  expect(fetch).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(timestamp))
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', privateValues.url)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', privateValues.key)
  vi.stubGlobal('fetch', vi.fn(() => { throw privateError() }))
  logs = []
  for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      logs.push(formatWithOptions({ depth: 8, customInspect: false }, ...args))
    })
  }
  limit = vi.fn().mockResolvedValue({ error: null })
  select = vi.fn(() => ({ limit }))
  from = vi.fn(() => ({ select }))
  createServerClient = vi.fn().mockResolvedValue({ from })
  imported = vi.fn(() => ({ createServerClient }))
  vi.doMock('@/app/lib/auth/supabase-server', imported)
})

afterEach(() => {
  vi.doUnmock('@/app/lib/auth/supabase-server')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('public health response', () => {
  it('preserves exact healthy body and bounded read-only probe', async () => {
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy())
    assertProbe()
  })

  it.each([
    [undefined, undefined, 'missing_config'],
    ['', '', 'missing_config'],
    [privateValues.url, undefined, 'missing_config'],
    [undefined, privateValues.key, 'missing_config'],
    [privateValues.url, privateValues.key, 'configured'],
  ])('preserves configuration classification without exposing values: %s / %s', async (url, key, auth) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', key)
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy('connected', auth))
    assertProbe()
  })

  it.each([undefined, ''])('preserves development fallback for NODE_ENV %s', async value => {
    vi.stubEnv('NODE_ENV', value)
    expect(await publicBody(await response())).toEqual({ ...healthy(), environment: 'development' })
  })

  it('sanitizes a returned provider error with all private diagnostic fields', async () => {
    limit.mockResolvedValue({ error: privateValues, data: [{ identifier: privateValues.identifier }] })
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy('error: Database unavailable'))
    assertProbe()
  })

  it.each(['import', 'client', 'from', 'select', 'limit'] as const)('sanitizes an Error thrown at %s', async stage => {
    const failure = privateError()
    if (stage === 'import') imported.mockImplementation(() => { throw failure })
    if (stage === 'client') createServerClient.mockRejectedValue(failure)
    if (stage === 'from') from.mockImplementation(() => { throw failure })
    if (stage === 'select') select.mockImplementation(() => { throw failure })
    if (stage === 'limit') limit.mockRejectedValue(failure)
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy('error: Database unavailable'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([privateValues, privateValues.message, null, undefined])('sanitizes non-Error query rejection %j', async failure => {
    limit.mockRejectedValue(failure)
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy('error: Database unavailable'))
    assertProbe()
  })

  it('sanitizes a transport rejection without a live request', async () => {
    limit.mockImplementation(() => fetch(privateValues.url))
    const result = await response()
    expect(result.status).toBe(200)
    expect(await publicBody(result)).toEqual(healthy('error: Database unavailable'))
    expect(fetch).toHaveBeenCalledExactlyOnceWith(privateValues.url)
  })

  it.each(['error', 'object', 'string'] as const)('sanitizes outer %s failure and preserves unhealthy/500 shape', async kind => {
    const failure = kind === 'error' ? privateError() : kind === 'object' ? privateValues : privateValues.message
    vi.spyOn(Date.prototype, 'toISOString').mockImplementationOnce(() => { throw failure })
    const result = await response()
    expect(result.status).toBe(500)
    expect(await publicBody(result)).toEqual({ status: 'unhealthy', error: 'Health check failed', timestamp })
    expect(imported).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['healthy', 'database', 'outer'] as const)('marks %s responses private/no-store', async state => {
    if (state === 'database') limit.mockResolvedValue({ error: privateValues })
    if (state === 'outer') vi.spyOn(Date.prototype, 'toISOString').mockImplementationOnce(() => { throw privateError() })
    const result = await response()
    expect(result.headers.get('cache-control')).toBe('private, no-store')
  })
})
