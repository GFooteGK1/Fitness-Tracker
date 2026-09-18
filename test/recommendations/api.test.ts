import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { getRecommendationView } from '@/app/lib/recommendations/service'
import { GET } from '@/app/api/recommendations/route'
import { POST } from '@/app/api/recommendations/refresh/route'
import { recommendationEvent } from '@/app/lib/recommendations/api'
import { POST as coveragePost } from '@/app/api/recommendations/coverage/route'
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/app/lib/recommendations/service', () => ({ getRecommendationView: vi.fn() }))
const db = { auth: { getUser: vi.fn() }, rpc: vi.fn() }
const request = (query = 'tzOffset=300&expectedUserId=user-1') => new NextRequest(`http://localhost/api/recommendations?${query}`)
beforeEach(() => { vi.resetAllMocks(); vi.mocked(createServerClient).mockResolvedValue(db as never); db.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }); vi.mocked(getRecommendationView).mockResolvedValue({ status: 'ready', coverage: null, recommendations: [], outcomes: [], refreshState: { pending: false, sourceRevision: 1, responseRevision: 0 } }) })
describe('recommendation API fences', () => {
  it('requires authentication and expected account identity before analysis', async () => {
    expect((await GET(request('tzOffset=300&expectedUserId=other'))).status).toBe(403)
    expect((await GET(request('tzOffset=300'))).status).toBe(403)
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); expect((await GET(request())).status).toBe(401)
    expect(getRecommendationView).not.toHaveBeenCalled()
  })
  it.each(['', 'tzOffset=', 'tzOffset=NaN', 'tzOffset=1.1', 'tzOffset=9999'])('rejects invalid date scope %s', async query => {
    expect((await GET(request(`${query}&expectedUserId=user-1`))).status).toBe(422); expect(getRecommendationView).not.toHaveBeenCalled()
  })
  it('GET reads and POST requests one explicit refresh', async () => {
    const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store'); expect(getRecommendationView).toHaveBeenLastCalledWith(db, 'user-1', 300, false)
    expect((await POST(request())).status).toBe(200); expect(getRecommendationView).toHaveBeenLastCalledWith(db, 'user-1', 300, true)
  })
  it('returns unavailable without fabricating a successful empty ready state', async () => {
    vi.mocked(getRecommendationView).mockRejectedValue(new Error('storage failure'))
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ status: 'unavailable', recommendations: [] })
  })
  it('keeps display acknowledgement and explicit response as separate owned RPCs', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'event-1' }, error: null })
    const body = { expectedUserId: 'user-1', requestId: 'response:1234', tzOffset: 300, response: 'done_reported' }
    const make = (value = body) => new NextRequest('http://localhost/api/recommendations/id/response', { method: 'POST', body: JSON.stringify(value) })
    const id = '11111111-1111-4111-8111-111111111111'
    expect((await recommendationEvent(make(), id, 'shown')).status).toBe(200)
    expect(db.rpc).toHaveBeenLastCalledWith('acknowledge_recommendation_shown', expect.objectContaining({ p_recommendation_id: id, p_request_id: body.requestId, p_timezone_offset: 300, p_runtime_fingerprint: expect.any(String) }))
    expect((await recommendationEvent(make(), id, 'response')).status).toBe(200)
    expect(db.rpc).toHaveBeenLastCalledWith('respond_recommendation', expect.objectContaining({ p_recommendation_id: id, p_request_id: body.requestId, p_response: 'done_reported', p_defer_until: null, p_timezone_offset: 300, p_runtime_fingerprint: expect.any(String) }))
    expect(db.rpc.mock.calls.every(([name]) => !String(name).includes('completion'))).toBe(true)
    db.rpc.mockClear(); expect((await recommendationEvent(make({ ...body, expectedUserId: 'other' }), id, 'response')).status).toBe(403); expect(db.rpc).not.toHaveBeenCalled()
  })
  it('returns conflict on stale response and never changes the request identity itself', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '40001' } })
    const response = await recommendationEvent(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ expectedUserId: 'user-1', requestId: 'response:1234', tzOffset: 300, response: 'deferred', deferUntil: '2026-09-18T00:00:00.000Z' }) }), '11111111-1111-4111-8111-111111111111', 'response')
    expect(response.status).toBe(409); expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({ noWriteConfirmed: false, refreshRequired: false })
  })
  it('allows current-action recovery only for an exact post-replay stale rejection', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'Recommendation is no longer current' } })
    const response = await recommendationEvent(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ expectedUserId: 'user-1', requestId: 'response:1234', tzOffset: 300, response: 'done_reported' }) }), '11111111-1111-4111-8111-111111111111', 'response')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ noWriteConfirmed: true, refreshRequired: true })
  })
  it('records explicit coverage separately from Done and fences the source revision', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'coverage-1' }, error: null })
    const body = { expectedUserId: 'user-1', requestId: 'coverage:1234', domain: 'nutrition', tzOffset: 300, expectedSourceRevision: 7, localDate: '2026-09-17', coverageThrough: '2026-09-17T18:00:00.000Z', status: 'partial' }
    const response = await coveragePost(new NextRequest('http://localhost/api/recommendations/coverage', { method: 'POST', body: JSON.stringify(body) }))
    expect(response.status).toBe(200); expect(db.rpc).toHaveBeenCalledWith('confirm_logging_coverage', expect.objectContaining({ p_status: 'partial', p_expected_source_revision: 7, p_timezone_offset: 300 }))
  })
  it.each([
    ['Coverage sources changed', '40001', true],
    ['Invalid bounded coverage confirmation', '22023', true],
    ['Coverage replay payload changed', '22023', false],
    ['could not serialize access', '40001', false],
  ])('classifies coverage recovery for %s without inventing proof', async (message, code, confirmed) => {
    db.rpc.mockResolvedValue({ data: null, error: { code, message } })
    const body = { expectedUserId: 'user-1', requestId: 'coverage:1234', domain: 'nutrition', tzOffset: 300, expectedSourceRevision: 7, localDate: '2026-09-17', coverageThrough: '2026-09-17T18:00:00.000Z', status: 'partial' }
    const response = await coveragePost(new NextRequest('http://localhost/api/recommendations/coverage', { method: 'POST', body: JSON.stringify(body) }))
    expect(await response.json()).toMatchObject({ noWriteConfirmed: confirmed, refreshRequired: confirmed })
  })
})

