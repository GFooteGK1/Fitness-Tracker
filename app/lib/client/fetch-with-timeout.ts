export class RequestTimeoutError extends Error {
  constructor(message = 'The request took too long. Please try again.') {
    super(message)
    this.name = 'RequestTimeoutError'
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 45_000
): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new RequestTimeoutError()
    throw error
  } finally {
    globalThis.clearTimeout(timer)
  }
}
