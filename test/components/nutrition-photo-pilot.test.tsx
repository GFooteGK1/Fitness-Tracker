// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
const auth=vi.hoisted(()=>({user:{id:'synthetic-owner'} as {id:string}|null}))
vi.mock('@/app/lib/auth/AuthContext',()=>({useAuth:()=>auth}))
vi.mock('@/app/lib/imageUtils',()=>({compressImage:vi.fn(async()=>({compressedDataUrl:'data:image/jpeg;base64,Zm9vZA=='}))}))
import {NutritionPhotoPilot} from '@/app/components/capture/NutritionPhotoPilot'
let fetcher:ReturnType<typeof vi.fn>
beforeEach(()=>{
  auth.user={id:'synthetic-owner'}
  fetcher=vi.fn(async(url:string)=>url.startsWith('data:')?new Response(new Blob(['synthetic'])):new Response(JSON.stringify({capture:{id:'synthetic-capture',state:'saved'},next:'Optional refinement in your chosen LLM.'})))
  vi.stubGlobal('fetch',fetcher)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires selected-photo consent and reports automatic unreviewed logging without a second confirmation',async()=>{
  render(<NutritionPhotoPilot/>)
  const save=screen.getByRole('button',{name:'Save estimated meal'});expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Food photo'),{target:{files:[new File(['synthetic'],'food.png',{type:'image/png'})]}})
  expect(save).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(save)
  await screen.findByText(/Optional refinement in your chosen LLM/)
  const request=fetcher.mock.calls.find(([url])=>url==='/api/meals/photo-pilot')![1].body as FormData
  expect(request.get('consent')).toBe('selected-photo-openai-autolog-v1');expect(request.get('expectedOwner')).toBe('synthetic-owner')
  expect(screen.getByRole('button',{name:'Choose another photo'})).toBeEnabled()
  expect(screen.queryByRole('button',{name:'Accept meal'})).not.toBeInTheDocument()
})
it('keeps the original ID and only offers status after an uncertain response',async()=>{
  fetcher.mockImplementation(async(url:string)=>{if(url.startsWith('data:'))return new Response(new Blob(['synthetic']));throw new Error('lost')})
  render(<NutritionPhotoPilot/>);fireEvent.change(screen.getByLabelText('Food photo'),{target:{files:[new File(['synthetic'],'food.png',{type:'image/png'})]}})
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save estimated meal'}))
  await screen.findByText(/Capture outcome is unconfirmed/)
  expect(screen.getByRole('button',{name:'Save estimated meal'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Check original capture'})).toBeEnabled()
  expect(screen.queryByRole('button',{name:'Choose another photo'})).not.toBeInTheDocument()
})
it('finishes an already persisted estimate through database-only recovery rather than another photo submission',async()=>{
  fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.startsWith('data:')?new Response(new Blob(['synthetic'])):new Response(JSON.stringify({capture:{id:'synthetic-capture',state:options?.method==='PATCH'?'saved':'estimated'},next:'Optional refinement in your chosen LLM.'})))
  render(<NutritionPhotoPilot/>);fireEvent.change(screen.getByLabelText('Food photo'),{target:{files:[new File(['synthetic'],'food.png',{type:'image/png'})]}})
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save estimated meal'}))
  fireEvent.click(await screen.findByRole('button',{name:'Finish original saved estimate'}))
  await screen.findByRole('button',{name:'Choose another photo'})
  const calls=fetcher.mock.calls.filter(([url])=>url==='/api/meals/photo-pilot')
  expect(calls.map(([,options])=>options.method)).toEqual(['POST','PATCH'])
  expect(JSON.parse(calls[1][1].body).expectedOwner).toBe('synthetic-owner')
})
it('discards account-bound UI state when the signed-in owner changes',async()=>{
  const view=render(<NutritionPhotoPilot/>);fireEvent.change(screen.getByLabelText('Food photo'),{target:{files:[new File(['synthetic'],'food.png',{type:'image/png'})]}})
  fireEvent.click(screen.getByRole('checkbox'));auth.user={id:'other-owner'};view.rerender(<NutritionPhotoPilot/>)
  await waitFor(()=>expect(screen.getByRole('checkbox')).not.toBeChecked());expect(screen.getByRole('button',{name:'Save estimated meal'})).toBeDisabled()
})
