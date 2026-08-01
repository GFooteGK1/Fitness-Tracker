import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, RequestTimeoutError } from '@/app/lib/client/fetch-with-timeout'

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts a stalled request at the configured deadline', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchWithTimeout('/slow', {}, 1_000)
    const rejection = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError)

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection
    expect(fetchMock).toHaveBeenCalledWith('/slow', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
  })
})
