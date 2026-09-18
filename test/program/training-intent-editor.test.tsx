// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
vi.mock('@/app/lib/auth/supabase',()=>({createClient:vi.fn()}))
import { createClient } from '@/app/lib/auth/supabase'
import { TrainingIntentPanel, PlanningIntentEditor } from '@/app/program/training-intent-editor'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
const snapshot={schemaVersion:1,memoryId:'11111111-1111-4111-8111-111111111111',memoryVersion:1,content:intent()}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status})
const fetch=vi.fn()
let changed: (event:string,session:any)=>void
beforeEach(()=>{sessionStorage.clear();fetch.mockReset();vi.stubGlobal('fetch',(url: string, init?: RequestInit)=>url.startsWith('/api/recommendations/refresh') ? Promise.resolve(response({status:'disabled',recommendations:[],refreshState:null})) : fetch(url,init));vi.mocked(createClient).mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner-1'}}}),onAuthStateChange:vi.fn(callback=>{changed=callback;return {data:{subscription:{unsubscribe:vi.fn()}}}})}} as never)})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('intent confirmation recovery and separation',()=>{
 it('recovers the exact request after a lost response and reload',async()=>{
  fetch.mockResolvedValueOnce(response({enabled:true,snapshot})).mockRejectedValueOnce(new Error('lost response'))
  const view=render(<TrainingIntentPanel />)
  fireEvent.click(await screen.findByRole('button',{name:'Confirm corrected outcomes'}))
  await screen.findByRole('button',{name:'Retry the same confirmation'})
  const frozen=fetch.mock.calls[1][1].body
  expect(JSON.parse(frozen).expectedUserId).toBe('owner-1')
  view.unmount()
  fetch.mockResolvedValueOnce(response({enabled:true,snapshot})).mockResolvedValueOnce(response({saved:true})).mockResolvedValueOnce(response({enabled:true,snapshot}))
  render(<TrainingIntentPanel />)
  fireEvent.click(await screen.findByRole('button',{name:'Retry the same confirmation'}))
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(5))
  expect(fetch.mock.calls[3][1].body).toBe(frozen)
  await screen.findByText('Outcomes confirmed. Your accepted plan is unchanged.')
  expect(sessionStorage.getItem('training-intent-pending:owner-1')).toBeNull()
 })
 it('fences late save results when the account switches',async()=>{
  let resolve!: (value:Response)=>void
  fetch.mockResolvedValueOnce(response({enabled:true,snapshot})).mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r}))
  render(<TrainingIntentPanel />)
  fireEvent.click(await screen.findByRole('button',{name:'Confirm corrected outcomes'}))
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  await act(async()=>{changed('SIGNED_IN',{user:{id:'owner-2'}});resolve(response({saved:true}))})
  expect(screen.queryByText('Outcomes confirmed. Your accepted plan is unchanged.')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Outcome 1 statement')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
 })
 it('retains one to eight same-domain outcomes and makes priority an explicit choice',()=>{
  const values=intent(...Array.from({length:8},(_,i)=>runningOutcome(`goal:${i}`,1000+i)))
  const change=vi.fn();render(<PlanningIntentEditor value={values} onChange={change}/>)
  expect(screen.getAllByRole('textbox',{name:/Outcome .* statement/})).toHaveLength(8)
  expect(screen.queryByRole('button',{name:'Add another outcome'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('I confirm these outcomes are ordered from most to least important'))
  expect(change.mock.calls[0][0].priorityOrder).toEqual(values.outcomes.map(o=>o.goal.id))
 })
})
