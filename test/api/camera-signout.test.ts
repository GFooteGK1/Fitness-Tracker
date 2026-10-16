import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/auth/signout/route'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import type { NextRequest } from 'next/server'
vi.mock('@/app/lib/auth/supabase-server',()=>({createServerClient:vi.fn()}))
const signOut=vi.fn(), rpc=vi.fn()
beforeEach(()=> {
 vi.clearAllMocks();signOut.mockResolvedValue({error:null})
 vi.mocked(createServerClient).mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null}),signOut},rpc} as never)
})
describe('server signout revokes camera capabilities first',()=> {
 it.each(['transport','PGRST202','42883'])('keeps session when revoke is unconfirmed: %s',async code=> {
  rpc.mockResolvedValue({data:null,error:{code}})
  expect((await POST(new Request('https://localhost/api/auth/signout',{method:'POST'}) as NextRequest)).status).toBe(503)
  expect(signOut).not.toHaveBeenCalled()
 })
 it('destroys session only after a confirmed revocation',async()=> {
  rpc.mockResolvedValue({data:{revoked:true},error:null})
  expect((await POST(new Request('https://localhost/api/auth/signout',{method:'POST'}) as NextRequest)).status).toBe(200)
  expect(rpc).toHaveBeenCalledWith('camera_photo_device_control',{p_action:'revoke_all',p_id:null})
  expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
 })
})
