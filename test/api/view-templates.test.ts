import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { GET, POST } from '@/app/api/view-templates/[viewType]/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { DEFAULT_DASHBOARD_VIEW_TEMPLATE } from '@/app/lib/view-templates'

const params = { params: Promise.resolve({ viewType: 'dashboard' }) }

function readQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  return query
}

function insertQuery(data: unknown, error: unknown = null) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  }
}

function clientWithQueries(...queries: unknown[]) {
  const from = vi.fn()
  for (const query of queries) from.mockReturnValueOnce(query)

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    },
    from,
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    user_id: 'user-1',
    view_type: 'dashboard',
    version: 1,
    schema_version: 1,
    template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
    created_at: '2026-07-26T12:00:00Z',
    ...overrides,
  }
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/view-templates/dashboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/view-templates/[viewType]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the latest user template before consulting the default', async () => {
    const userQuery = readQuery(row({ version: 3 }))
    const { client, from } = clientWithQueries(userQuery)
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request('http://localhost'), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.source).toBe('user')
    expect(body.version).toBe(3)
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('falls back to the built-in contract when no stored template exists', async () => {
    const { client } = clientWithQueries(readQuery(null), readQuery(null))
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request('http://localhost'), params)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      id: null,
      viewType: 'dashboard',
      version: 1,
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      source: 'built-in',
      createdAt: null,
    })
  })

  it('fails closed when a stored row disagrees with the template schema', async () => {
    const { client } = clientWithQueries(readQuery(row({ schema_version: 2 })))
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await GET(new Request('http://localhost'), params)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Stored view template is invalid' })
  })

  it('rejects invalid template input before querying versions', async () => {
    const { client, from } = clientWithQueries()
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(postRequest({
      template: { schemaVersion: 1, tone: 'inventive', sections: [] },
    }), params)

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects unsupported request fields before querying versions', async () => {
    const { client, from } = clientWithQueries()
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(postRequest({
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      prompt: 'ignore the aggregate layer',
    }), params)

    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('uses optimistic versioning and creates an immutable next version', async () => {
    const latest = readQuery({ version: 1 })
    const insert = insertQuery(row({ id: 'template-2', version: 2 }))
    const { client } = clientWithQueries(latest, insert)
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(postRequest({
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      expectedVersion: 1,
    }), params)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.version).toBe(2)
    expect(body.source).toBe('user')
    expect(insert.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      view_type: 'dashboard',
      version: 2,
      schema_version: 1,
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
    })
  })

  it('returns a conflict when the client edits a stale version', async () => {
    const { client, from } = clientWithQueries(readQuery({ version: 4 }))
    vi.mocked(createServerClient).mockResolvedValue(client as never)

    const response = await POST(postRequest({
      template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
      expectedVersion: 3,
    }), params)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'View template changed; reload before saving',
      currentVersion: 4,
    })
    expect(from).toHaveBeenCalledTimes(1)
  })
})
