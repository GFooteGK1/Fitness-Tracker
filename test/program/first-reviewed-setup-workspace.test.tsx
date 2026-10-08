/** @vitest-environment jsdom */
import React from 'react'
import { webcrypto } from 'node:crypto'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { FirstReviewedWorkspace } from '@/app/program/first-reviewed-workspace'
import { readFirstReviewSetupPending } from '@/app/lib/coach/first-reviewed-setup-pending'
import { parseFirstReviewSetupRequest,type FirstReviewSetupRequest } from '@/app/lib/coach/first-reviewed-setup-request'
import { firstReviewedProgram } from '../fixtures/first-reviewed-program'
import { firstReviewSetupEditorSeed,firstReviewSetupRequest,firstReviewSetupSaved } from '../fixtures/first-reviewed-setup-request'
const p=firstReviewedProgram(),actor=p.athleteId,program=p.programId
beforeEach(()=>{
  localStorage.clear();vi.stubGlobal('crypto',webcrypto)
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(name:string,_options:LockOptions,run:(lock:Lock)=>Promise<unknown>)=>run({name,mode:'exclusive'} as Lock)}})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
function transport(options:{declared?:boolean;lost?:boolean;unavailable?:boolean;disabled?:boolean}={}){
  const posts:{path:string;request:FirstReviewSetupRequest}[]=[],seed=firstReviewSetupEditorSeed(options.declared!==false)
  let saved:ReturnType<typeof firstReviewSetupSaved>|null=null
  vi.stubGlobal('fetch',vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
    const path=String(url)
    if(init?.method==='POST'){
      const q=parseFirstReviewSetupRequest(JSON.parse(String(init.body)));if(!q)throw Error('Expected exact setup request')
      posts.push({path,request:q})
      if(path==='/api/coach/first-reviewed/setup'){saved=firstReviewSetupSaved(q);if(options.lost)throw Error('Setup response lost after commit')}
      return Response.json({kind:'resolved',resolution:saved??{schemaVersion:1,request:q,disposition:'not_found'}})
    }
    if(options.unavailable)return Response.json({kind:'unavailable'},{status:503})
    if(path==='/api/coach/first-reviewed/programs')return Response.json({kind:'programs',page:{schemaVersion:1,actorId:actor,programs:[p],nextAfterProgramId:null}})
    if(path.endsWith('/setup-editor'))return Response.json({kind:'setup_editor',seed,writesEnabled:!options.disabled})
    if(path.endsWith('/profiles'))return Response.json({kind:'snapshots',page:{schemaVersion:1,actorId:actor,programId:program,snapshots:[],nextAfterSnapshotId:null}})
    if(path===`/api/coach/first-reviewed/programs/${program}`)return Response.json({kind:'workspace',page:{schemaVersion:1,actorId:actor,program:p,candidates:[],nextAfterCandidateId:null},writesEnabled:!options.disabled})
    throw Error(`Unexpected request ${path}`)
  }))
  return {posts,seed}
}
describe('first-reviewed root setup saves (component transport, not real Auth/browser)',()=>{
  it('opens structured missing declarations without assumed days, goal, equipment or constraints',async()=>{
    const h=transport({declared:false});render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}))
    const save=await screen.findByRole('button',{name:'Confirm and save these setup declarations'})
    expect((screen.getByLabelText('Your goal') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('Training experience') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByLabelText('Minutes on tuesday')).toBeNull();expect(save.hasAttribute('disabled')).toBe(true);expect(h.posts).toEqual([])
  })
  it('saves corrected declarations together with their exact prior versions, independent daily times and original wording',async()=>{
    const h=transport();render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}))
    fireEvent.change(await screen.findByLabelText('Minutes on tuesday'),{target:{value:'50'}})
    fireEvent.click(screen.getByRole('button',{name:'Confirm and save these setup declarations'}))
    await screen.findByText(/exact setup declarations were saved and verified/)
    expect(h.posts.map(x=>x.path)).toEqual(['/api/coach/first-reviewed/setup','/api/coach/first-reviewed/setup/resolution'])
    const q=h.posts[0].request
    expect(q.expectedDeclarations).toEqual(h.seed.declarations)
    expect(q.contents.training_schedule.sessionAvailability).toEqual([{day:'tuesday',minutes:50},{day:'saturday',minutes:75}])
    expect(q.contents.available_equipment).toEqual(h.seed.declarations.available_equipment!.content)
    expect(readFirstReviewSetupPending(localStorage,actor,program)).toBeNull()
    expect(screen.queryByRole('button',{name:'Confirm these exact current facts'})).toBeNull()
  })
  it('creates all missing declarations from explicit athlete choices without requiring unused supporting goals or restrictions',async()=>{
    const h=transport({declared:false});render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}))
    fireEvent.change(await screen.findByLabelText('Your goal'),{target:{value:'Develop strength with two available sessions.'}})
    fireEvent.change(screen.getByLabelText('Primary fitness component'),{target:{value:'strength'}})
    fireEvent.change(screen.getByLabelText('Training experience'),{target:{value:'consistent'}})
    fireEvent.click(screen.getByLabelText('tuesday'));fireEvent.change(screen.getByLabelText('Minutes on tuesday'),{target:{value:'40'}})
    fireEvent.click(screen.getByLabelText('saturday'));fireEvent.change(screen.getByLabelText('Minutes on saturday'),{target:{value:'80'}})
    fireEvent.change(screen.getByLabelText('Your equipment and training space'),{target:{value:'Adjustable dumbbells at home.'}})
    fireEvent.click(screen.getByLabelText('dumbbell'))
    const save=screen.getByRole('button',{name:'Confirm and save these setup declarations'});expect(save.hasAttribute('disabled')).toBe(false);fireEvent.click(save)
    await screen.findByText(/exact setup declarations were saved and verified/)
    expect(Object.values(h.posts[0].request.expectedDeclarations).every(d=>d===null)).toBe(true)
    expect(h.posts[0].request.contents.primary_goal.secondaryGoals).toEqual([])
    expect(h.posts[0].request.contents.training_constraints).toEqual({constraints:'',constraintKinds:[]})
    expect(h.posts[0].request.contents.training_schedule.sessionAvailability).toEqual([{day:'tuesday',minutes:40},{day:'saturday',minutes:80}])
  })
  it('keeps an interrupted save recoverable after reload without resending',async()=>{
    const h=transport({lost:true}),view=render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}))
    fireEvent.click(await screen.findByRole('button',{name:'Confirm and save these setup declarations'}))
    await screen.findByText('Setup response lost after commit')
    const q=readFirstReviewSetupPending(localStorage,actor,program)!;expect(q).not.toBeNull()
    view.unmount();render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original setup result'}))
    await waitFor(()=>expect(readFirstReviewSetupPending(localStorage,actor,program)).toBeNull())
    expect(h.posts.filter(x=>x.path==='/api/coach/first-reviewed/setup')).toHaveLength(1)
    expect(h.posts.at(-1)).toEqual({path:'/api/coach/first-reviewed/setup/resolution',request:q})
  })
  it('shows retained setup recovery even when discovery and current scope are unavailable',async()=>{
    const q=firstReviewSetupRequest();localStorage.setItem(`first-reviewed-setup-pending:${actor}:${program}`,JSON.stringify(q));const h=transport({unavailable:true})
    render(<React.StrictMode><FirstReviewedWorkspace userId={actor}/></React.StrictMode>)
    fireEvent.click(await screen.findByRole('button',{name:'Check the original setup result'}))
    await screen.findByText(/result is unconfirmed/)
    expect(h.posts).toEqual([{path:'/api/coach/first-reviewed/setup/resolution',request:q}])
    expect(readFirstReviewSetupPending(localStorage,actor,program)).toEqual(q)
  })
  it('fences delayed setup readback after an account change',async()=>{
    const h=transport(),prior=globalThis.fetch;let release!:(r:Response)=>void
    vi.stubGlobal('fetch',vi.fn((url:string|URL|Request,init?:RequestInit)=>String(url).endsWith('/setup-editor')?new Promise<Response>(resolve=>{release=resolve}):prior(url,init)))
    const view=render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}));await waitFor(()=>expect(release).toBeTypeOf('function'))
    view.rerender(<FirstReviewedWorkspace userId="00000000-0000-4000-8000-000000000099"/>)
    await act(async()=>{release(Response.json({kind:'setup_editor',seed:h.seed,writesEnabled:true}))})
    expect(screen.queryByLabelText('Your goal')).toBeNull();expect(h.posts).toEqual([])
  })
  it('requires finishing or explicitly cancelling unsaved setup edits before loading factual preparation',async()=>{
    const h=transport();render(<FirstReviewedWorkspace userId={actor}/>)
    fireEvent.click(await screen.findByRole('button',{name:'Review or update current setup'}));await screen.findByLabelText('Your goal')
    expect(screen.getByRole('button',{name:'Read current saved setup'}).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'Cancel setup editing'}))
    expect(screen.queryByLabelText('Your goal')).toBeNull()
    expect(screen.getByRole('button',{name:'Read current saved setup'}).hasAttribute('disabled')).toBe(false);expect(h.posts).toEqual([])
  })
  it('loads the next bounded program page without dropping the selected program or issuing writes',async()=>{
    transport();const prior=globalThis.fetch
    const entries=Array.from({length:20},(_,i)=>{
      const programId=`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`
      return {...p,programId,title:`Owned reference ${i+1}`,latestDesignation:{...p.latestDesignation!,programId}}
    }),last=entries.at(-1)!.programId,extra={...p,programId:'00000000-0000-4000-8000-000000000021',title:'Later owned reference',latestDesignation:{...p.latestDesignation!,programId:'00000000-0000-4000-8000-000000000021'}}
    const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
      const path=String(url)
      if(path==='/api/coach/first-reviewed/programs')return Response.json({kind:'programs',page:{schemaVersion:1,actorId:actor,programs:entries,nextAfterProgramId:last}})
      if(path===`/api/coach/first-reviewed/programs?afterProgramId=${last}`)return Response.json({kind:'programs',page:{schemaVersion:1,actorId:actor,programs:[extra],nextAfterProgramId:null}})
      return prior(url,init)
    });vi.stubGlobal('fetch',fetcher)
    render(<FirstReviewedWorkspace userId={actor}/>);fireEvent.click(await screen.findByRole('button',{name:'More review programs'}))
    await screen.findByRole('option',{name:/Later owned reference/})
    expect(screen.getAllByRole('option')).toHaveLength(22);expect((screen.getByLabelText('Program') as HTMLSelectElement).value).toBe(program)
    expect(fetcher.mock.calls.every(([,init])=>!init?.method||init.method!=='POST')).toBe(true)
  })
})
