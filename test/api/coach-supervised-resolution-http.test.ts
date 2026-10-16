import { describe,it,expect,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedReviewHttp } from '@/app/lib/coach/supervised-review-http'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pending = { schemaVersion:1,userId:id(1),programId:id(2),operation:'issue',body:{ expectedUserId:id(1),programId:id(2),candidateId:id(3),requestId:id(4) } }
function harness() {
  const auth = vi.fn().mockResolvedValue({ data:{ user:{ id:id(1) } },error:null }), rpc = vi.fn()
  const db = { auth:{ getUser:auth },rpc } as unknown as SupabaseClient
  const read = vi.fn(),submit = vi.fn(),decide = vi.fn()
  const http = createSupervisedReviewHttp({ createUserClient:async () => db,review:{ read,submit,decide },enabled:() => false })
  const req = (q: unknown = { expectedUserId:id(1),pending }) => new Request('http://localhost/api/coach/supervised/resolve',{ method:'POST',body:JSON.stringify(q) })
  return { http,auth,rpc,submit,decide,req }
}
describe('supervised exact request resolution HTTP',() => {
  it.each(['resolve','resolution'] as const)('%s is actor-bound and available while fresh writes are off',async operation => {
    const h = harness(),resolution = { schemaVersion:1,request:pending,disposition:'no_write',resolutionId:id(5),resolvedAt:'2026-10-03T13:50:00Z' }
    h.rpc.mockResolvedValue({ data:resolution,error:null })
    const response = await h.http[operation](h.req())
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ kind:'resolved',resolution })
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith(operation === 'resolve' ? 'resolve_supervised_request' : 'get_supervised_request_resolution',{ p_request:pending })
    expect(h.submit).not.toHaveBeenCalled();expect(h.decide).not.toHaveBeenCalled()
  })
  it('authenticates before forwarding a request and rejects mismatched/extra fields',async () => {
    const h = harness()
    expect((await h.http.resolve(h.req({ expectedUserId:id(8),pending }))).status).toBe(409)
    expect((await h.http.resolve(h.req({ expectedUserId:id(1),pending,approved:true }))).status).toBe(400)
    h.auth.mockResolvedValue({ data:{ user:null },error:null })
    expect((await h.http.resolve(h.req())).status).toBe(401);expect(h.rpc).not.toHaveBeenCalled()
  })
  it('withholds switched-account receipts and unknown SQL failures',async () => {
    const h = harness();h.rpc.mockResolvedValue({ data:{ schemaVersion:1,request:pending,disposition:'not_found' },error:null })
    h.auth.mockResolvedValueOnce({ data:{ user:{ id:id(1) } },error:null }).mockResolvedValueOnce({ data:{ user:{ id:id(1) } },error:null })
      .mockResolvedValueOnce({ data:{ user:{ id:id(9) } },error:null })
    expect((await h.http.resolve(h.req())).status).toBe(409)
    h.auth.mockResolvedValue({ data:{ user:{ id:id(1) } },error:null });h.rpc.mockResolvedValue({ data:null,error:{ code:'55P03' } })
    expect((await h.http.resolve(h.req())).status).toBe(503)
    expect(h.rpc).toHaveBeenCalledTimes(2)
  })
})
