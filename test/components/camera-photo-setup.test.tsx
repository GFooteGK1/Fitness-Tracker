// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraPhotoSetup } from '@/app/components/capture/CameraPhotoSetup'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { assertCaptureOwner } from '@/app/lib/client/logging-request'
vi.mock('@/app/lib/auth/AuthContext',()=>({useAuth:vi.fn()}))
vi.mock('@/app/lib/client/logging-request',()=>({assertCaptureOwner:vi.fn()}))
let owner='owner-a', calls:ReturnType<typeof vi.fn>
beforeEach(()=> {
 owner='owner-a';vi.mocked(useAuth).mockImplementation(()=>({user:{id:owner}} as never));vi.mocked(assertCaptureOwner).mockResolvedValue(undefined)
 calls=vi.fn(async(_url:string,options?:RequestInit)=>new Response(JSON.stringify(options?.method==='POST'?{userId:owner,token:'private-device-token'}:options?.method==='DELETE'?{userId:owner,revoked:true}:{userId:owner,devices:[]})))
 vi.stubGlobal('fetch',calls)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks()})
describe('camera cloud setup consent and account fencing',()=> {
 it('requires specific cloud consent, issues once, and reveals token only after owner-confirmed success',async()=> {
  render(<CameraPhotoSetup/>);const create=screen.getByRole('button',{name:'Create private pairing'})
  expect(create).toBeDisabled();expect(screen.getByText(/including non-food or sensitive photos/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(create);fireEvent.click(create)
  await waitFor(()=>expect(screen.getByLabelText('Private pairing token')).toHaveValue('private-device-token'))
  expect(calls.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
  expect(JSON.parse(calls.mock.calls.find(c=>c[1]?.method==='POST')![1].body as string)).toEqual({expectedUserId:'owner-a',consentPolicy:'camera-cloud-v1'})
 })
 it('does not show a late pairing secret after switching accounts',async()=> {
  let release!:(r:Response)=>void
  calls.mockImplementation(async(_url:string,options?:RequestInit)=>options?.method==='POST'?new Promise<Response>(r=>{release=r}):new Response(JSON.stringify({userId:owner,devices:[]})))
  const view=render(<CameraPhotoSetup/>);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Create private pairing'}))
  await waitFor(()=>expect(release).toBeTypeOf('function'));owner='owner-b';view.rerender(<CameraPhotoSetup/>);
  release(new Response(JSON.stringify({userId:'owner-a',token:'private-device-token'})))
  await waitFor(()=>expect(screen.queryByLabelText('Private pairing token')).not.toBeInTheDocument())
 })
 it('revokes all devices with the current owner identity',async()=> {
  render(<CameraPhotoSetup/>);fireEvent.click(screen.getByRole('button',{name:'Disable all camera devices'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('disabled'))
  const request=calls.mock.calls.find(c=>c[1]?.method==='DELETE')![1]
  expect(JSON.parse(request.body as string)).toEqual({expectedUserId:owner,deviceId:null})
 })
})
