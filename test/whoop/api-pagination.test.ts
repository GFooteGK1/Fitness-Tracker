import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCycles, getRecovery, getSleep, getWorkouts } from '@/app/lib/whoop/api-client'

const start = new Date('2026-11-18T10:30:00.000Z')
const end = new Date('2026-11-21T10:30:00.000Z')
const accessToken = 'synthetic-access-token'

afterEach(() => vi.unstubAllGlobals())

describe('WHOOP collection pagination', () => {
  it.each([
    ['recovery', getRecovery, '/developer/v2/recovery'],
    ['sleep', getSleep, '/developer/v2/activity/sleep'],
    ['cycles', getCycles, '/developer/v2/cycle'],
    ['workouts', getWorkouts, '/developer/v2/activity/workout'],
  ] as const)('reads and combines every %s page within the same time range', async (_kind, getCollection, path) => {
    const cursor = 'opaque+/=& token'
    const first = { id: 'first' }
    const second = { id: 'second' }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ records: [first], next_token: cursor }))
      .mockResolvedValueOnce(Response.json({ records: [second], next_token: null }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCollection(accessToken, start, end)).resolves.toEqual([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    for (const [index, [input, request]] of fetchMock.mock.calls.entries()) {
      const url = new URL(String(input))
      expect(url.pathname).toBe(path)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        start: start.toISOString(), end: end.toISOString(), limit: '25',
        ...(index === 0 ? {} : { nextToken: cursor }),
      })
      expect(new Headers(request?.headers).get('authorization')).toBe('Bearer ' + accessToken)
    }
  })

  it('rejects a second-page failure without returning first-page records', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ records: [{ id: 'first' }], next_token: 'follow' }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getRecovery(accessToken, start, end)).rejects.toMatchObject({
      status: 429,
      message: 'Failed to fetch recovery data: 429',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a repeated cursor rather than requesting the same page indefinitely', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ records: [], next_token: 'first-cursor' }))
      .mockResolvedValueOnce(Response.json({ records: [], next_token: 'second-cursor' }))
      .mockResolvedValueOnce(Response.json({ records: [], next_token: 'first-cursor' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getWorkouts(accessToken, start, end)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('fails instead of reporting a complete batch when the provider passes the page cap', async () => {
    let page = 0
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      records: [{ id: ++page }],
      next_token: 'cursor-' + page,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCycles(accessToken, start, end)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(100)
  })

  it.each([null, undefined, ''])('accepts %j as a terminal cursor on an empty result', async next_token => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ records: [], next_token }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSleep(accessToken, start, end)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([{ records: {} }, {}, { records: [], next_token: 42 }])('rejects invalid collection data %j', async body => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(body))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSleep(accessToken, start, end)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
