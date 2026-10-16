import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as propose } from '@/app/api/coach/reviewed/proposals/route'
import { POST as accept } from '@/app/api/coach/reviewed/proposals/[id]/accept/route'
import { POST as recordSet } from '@/app/api/coach/reviewed/sessions/[id]/sets/route'
import { POST as complete } from '@/app/api/coach/reviewed/sessions/[id]/complete/route'
import { GET as readSession } from '@/app/api/coach/reviewed/sessions/[id]/route'
import { POST as resolve } from '@/app/api/coach/reviewed/sessions/[id]/resolve/route'
import { POST as resolveProposal } from '@/app/api/coach/reviewed/programs/[id]/resolve/route'
import { GET as listProposals } from '@/app/api/coach/reviewed/proposals/route'
import { GET as readProposal } from '@/app/api/coach/reviewed/proposals/[id]/route'

const { auth, rpc, service } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), service: vi.fn() }))
vi.mock('@/app/lib/auth/supabase-server', () => ({ createServerClient: async () => ({ auth: { getUser: auth }, rpc }), createServiceRoleClient: service }))
const owner = '11111111-1111-4111-8111-111111111111'
const resourceId = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ data: { user: { id: owner } }, error: null })
  rpc.mockResolvedValue({ data: null, error: null }) // Authenticated resource is outside the pilot.
})
function expectScopeOnly(kind: 'program' | 'proposal' | 'session') {
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_supervised_resource_scope', { p_kind: kind, p_id: resourceId })
  expect(service).not.toHaveBeenCalled()
}
describe('deployed reviewed route composition remains gated', () => {
  it.each([[listProposals, 'program'], [readProposal, 'proposal']] as const)('keeps nonpilot proposal reads disabled', async (get, kind) => {
    const response = await get(new Request('http://localhost?programId=22222222-2222-4222-8222-222222222222'),
      { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) })
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ kind: 'disabled' })
    expectScopeOnly(kind)
  })
  it('keeps nonpilot session readback gated after scope lookup', async () => {
    const response = await readSession(new Request('http://localhost'), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) })
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ kind: 'disabled' })
    expectScopeOnly('session')
  })
  it.each([['propose', propose], ['accept', accept], ['recordSet', recordSet], ['complete', complete], ['resolve', resolve], ['resolveProposal', resolveProposal]] as const)(
    '%s rejects injected capability flags before protected calls', async (name, post) => {
      const response = await post(new Request('http://localhost/api/coach/reviewed?enabled=true', {
        method: 'POST', body: JSON.stringify({ enabled: true, initialDosePolicy: true }),
      }), { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) })
      expect(response.status).toBe(name === 'propose' ? 409 : 400)
      expect(await response.json()).toMatchObject({ kind: name === 'propose' ? 'disabled' : 'invalid_request' })
      expect(rpc).not.toHaveBeenCalled(); expect(service).not.toHaveBeenCalled()
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    })
  it.each([
    ['accept', accept, 'proposal', {}],
    ['recordSet', recordSet, 'session', { report: {} }],
    ['complete', complete, 'session', { completion: {} }],
    ['resolve', resolve, 'session', { operation: 'set', payload: {} }],
    ['resolveProposal', resolveProposal, 'program', { operation: 'accept', identity: { proposalId: resourceId, planVersionId: resourceId } }],
  ] as const)('%s query flag cannot enable a valid nonpilot envelope', async (_name, post, kind, fields) => {
    const response = await post(new Request('http://localhost/api/coach/reviewed?enabled=true', {
      method: 'POST', body: JSON.stringify({ expectedUserId: owner, requestId: 'nonpilot-test-request', ...fields }),
    }), { params: Promise.resolve({ id: resourceId }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ kind: 'disabled' })
    expectScopeOnly(kind)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('authenticates on the real route before disclosing gated state', async () => {
    auth.mockResolvedValue({ data: { user: null }, error: null })
    const response = await propose(new Request('http://localhost', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401); expect(rpc).not.toHaveBeenCalled(); expect(service).not.toHaveBeenCalled()
  })
})
