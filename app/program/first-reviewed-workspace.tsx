'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import { getTimezoneOffset } from '@/app/lib/timezone-utils'
import { parseFirstReviewProgramsPage,parseFirstReviewProgramWorkspace,parseFirstReviewSnapshotsPage,
  type FirstReviewProgramsPage,type FirstReviewProgramWorkspace,type FirstReviewSnapshotsPage } from '@/app/lib/coach/first-reviewed-workspace-contract'
import { parseFirstReviewedSetupSeed,type FirstReviewedSetupSeed } from '@/app/lib/coach/first-reviewed-setup-contract'
import { parseFirstReviewedProfileSnapshot,parseFirstReviewedProfileReceipt,type FirstReviewedProfileSnapshot,type FirstReviewedProfileReceipt } from '@/app/lib/coach/first-reviewed-profile-contract'
import { parseFirstReviewedDraft,parseFirstReviewedCandidateReview,type FirstReviewedDraft,type FirstReviewedCandidateReview } from '@/app/lib/coach/first-reviewed-contract'
import { parseFirstReviewedRequestResolution,type FirstReviewedPending } from '@/app/lib/coach/first-reviewed-request-resolution'
import { readFirstReviewedPending,listFirstReviewedPendingPrograms,runFirstReviewedBrowserAction } from '@/app/lib/coach/first-reviewed-pending'
import { parseFirstReviewedPreview } from '@/app/lib/coach/first-reviewed-preview'
import { seedFirstReviewedWeek,type FirstReviewedWeekSeed } from '@/app/lib/coach/first-reviewed-draft-editor'
import { FIRST_REVIEW_SETUP_KEYS,firstReviewSetupEdits,parseFirstReviewSetupEditorSeed,parseFirstReviewSetupRequest,
  type FirstReviewSetupEditorSeed,type FirstReviewSetupContents,type FirstReviewSetupRequest } from '@/app/lib/coach/first-reviewed-setup-request'
import { readFirstReviewSetupPending,listFirstReviewSetupPendingPrograms,runFirstReviewSetupBrowserAction } from '@/app/lib/coach/first-reviewed-setup-pending'
import { validReviewedSetupEdit } from '@/app/lib/coach/reviewed-setup-memory'
import { ReviewedSetupEditor } from './reviewed-setup-editor'
import { SupervisedWeekEditor } from './supervised-week-editor'
import { ReviewedWeekView } from './reviewed-session-card'

const action='app-secondary min-h-11 rounded-lg border px-4 py-2 text-base disabled:opacity-50'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const label=(v:string)=>v==='rir'?'Reps in reserve':v==='rpe'?'RPE':v.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')
const errorText=(v:unknown)=>v instanceof Error?v.message:'This result could not be verified. Recover a saved request before another action.'
const hidden=new Set(['id','userId','user_id','memoryId','snapshotId','kernelVersion','schemaVersion','hash','contentHash','sourceHash'])
const savedPrograms=(actor:string)=>[...new Set([...listFirstReviewedPendingPrograms(localStorage,actor),...listFirstReviewSetupPendingPrograms(localStorage,actor)])].sort()
/** Structured attributed facts and legacy prescriptions; never raw JSON or inferred performance. */
function ContextFacts({value}:{value:unknown}){
  if(value===null||value===undefined)return <span>Not reported</span>
  if(Array.isArray(value))return value.length?<ul className="ml-4 list-disc">{value.map((v,i)=><li key={i}><ContextFacts value={v}/></li>)}</ul>:<span>None recorded</span>
  if(record(value))return <dl className="space-y-1">{Object.entries(value).filter(([k])=>!hidden.has(k)).map(([k,v])=><div key={k} className="border-l pl-3"><dt className="font-medium capitalize">{label(k)}</dt><dd><ContextFacts value={v}/></dd></div>)}</dl>
  return <span>{typeof value==='boolean'?value?'Yes':'No':String(value)}</span>
}

export function FirstReviewedWorkspace({userId}:{userId:string}){
  return <FirstReviewedActorWorkspace key={userId} userId={userId}/>
}
function FirstReviewedActorWorkspace({userId}:{userId:string}){
  const [programs,setPrograms]=useState<FirstReviewProgramsPage|null>(null),[selected,setSelected]=useState<string|null>(null)
  const [workspace,setWorkspace]=useState<FirstReviewProgramWorkspace|null>(null),[snapshots,setSnapshots]=useState<FirstReviewSnapshotsPage|null>(null)
  const [setup,setSetup]=useState<FirstReviewedSetupSeed|null>(null),[setupGap,setSetupGap]=useState<string|null>(null)
  const [setupEditor,setSetupEditor]=useState<FirstReviewSetupEditorSeed|null>(null),[setupEdits,setSetupEdits]=useState<FirstReviewSetupContents|null>(null)
  const [setupPending,setSetupPending]=useState<FirstReviewSetupRequest|null>(null)
  const [snapshot,setSnapshot]=useState<FirstReviewedProfileSnapshot|null>(null),[confirmation,setConfirmation]=useState<FirstReviewedProfileReceipt|null>(null)
  const [draft,setDraft]=useState<FirstReviewedWeekSeed|null>(null),[rationale,setRationale]=useState('')
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof parseFirstReviewedPreview>>>(null)
  const [candidate,setCandidate]=useState<FirstReviewedCandidateReview|null>(null),[reviewed,setReviewed]=useState(false),[acceptReviewed,setAcceptReviewed]=useState(false)
  const [pending,setPending]=useState<FirstReviewedPending|null>(null),[recoveryPrograms,setRecoveryPrograms]=useState<string[]>([]),[storageReady,setStorageReady]=useState(false)
  const [busy,setBusy]=useState(false),[writesEnabled,setWritesEnabled]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null)
  const actor=useRef<string|null>(userId),scope=useRef<string|null>(selected),epoch=useRef(0),working=useRef(false)
  actor.current=userId;scope.current=selected
  const current=useCallback((program:string,token:number)=>actor.current===userId&&scope.current===program&&epoch.current===token,[userId])
  const json=async(response:Response)=>{const value:unknown=await response.json();if(!record(value))throw Error('The response could not be read.');return value}
  const select=(id:string)=>{scope.current=id;epoch.current++;setSelected(id)}

  const readWorkspace=useCallback(async(program:string,after:string|null=null)=>{
    const token=epoch.current
    setWritesEnabled(false)
    const response=await fetch(`/api/coach/first-reviewed/programs/${program}${after?`?afterCandidateId=${after}`:''}`,{cache:'no-store'}),body=await json(response)
    const page=parseFirstReviewProgramWorkspace(body.page,userId,program,after)
    if(!current(program,token))return null
    if(!response.ok||body.kind!=='workspace'||!page||typeof body.writesEnabled!=='boolean')throw Error('Current review scope is unavailable. Saved requests can still be recovered.')
    setWorkspace(previous=>after&&previous?{...page,candidates:[...previous.candidates,...page.candidates]}:page);setWritesEnabled(body.writesEnabled)
    return page
  },[userId,current])
  const readSnapshots=useCallback(async(program:string,after:string|null=null)=>{
    const token=epoch.current,response=await fetch(`/api/coach/first-reviewed/programs/${program}/profiles${after?`?afterSnapshotId=${after}`:''}`,{cache:'no-store'}),body=await json(response)
    const page=parseFirstReviewSnapshotsPage(body.page,userId,program,after)
    if(!current(program,token))return
    if(!response.ok||body.kind!=='snapshots'||!page)throw Error('Saved context could not be read.')
    setSnapshots(previous=>after&&previous?{...page,snapshots:[...previous.snapshots,...page.snapshots]}:page)
  },[userId,current])
  async function loadMorePrograms(){
    const after=programs?.nextAfterProgramId;if(!after)return
    const response=await fetch(`/api/coach/first-reviewed/programs?afterProgramId=${after}`,{cache:'no-store'}),body=await json(response)
    if(actor.current!==userId)return
    const page=parseFirstReviewProgramsPage(body.page,userId,after)
    if(!response.ok||body.kind!=='programs'||!page)throw Error('More review programs could not be read.')
    setPrograms(previous=>previous?.nextAfterProgramId===after?{...page,programs:[...previous.programs,...page.programs]}:previous)
  }
  useEffect(()=>{
    let disposed=false
    actor.current=userId
    void(async()=>{try{
      const saved=savedPrograms(userId)
      // Local recovery cannot depend on current discovery being available.
      if(disposed||actor.current!==userId)return
      setRecoveryPrograms(saved);if(saved[0])setSelected(saved[0])
      const response=await fetch('/api/coach/first-reviewed/programs',{cache:'no-store'}),body=await json(response)
      const page=parseFirstReviewProgramsPage(body.page,userId)
      if(disposed||actor.current!==userId)return
      if(!response.ok||body.kind!=='programs'||!page)throw Error('Your review programs could not be read.')
      setPrograms(page);setSelected(previous=>previous??page.programs[0]?.programId??null)
    }catch(e){if(!disposed&&actor.current===userId)setError(errorText(e))}})()
    return()=>{disposed=true;actor.current=null}
  },[userId])
  useEffect(()=>{
    epoch.current++;setWorkspace(null);setSnapshots(null);setSetup(null);setSetupGap(null);setSnapshot(null);setConfirmation(null);setDraft(null);setPreview(null);setCandidate(null)
    setSetupEditor(null);setSetupEdits(null);setSetupPending(null);setPending(null)
    setReviewed(false);setAcceptReviewed(false);setWritesEnabled(false);setStorageReady(false);setNotice(null)
    if(!selected)return
    try{setPending(readFirstReviewedPending(localStorage,userId,selected));setSetupPending(readFirstReviewSetupPending(localStorage,userId,selected));setStorageReady(true)}catch(e){setError(errorText(e));return}
    void readWorkspace(selected).then(page=>{if(page?.program.role==='athlete')return readSnapshots(selected)}).catch(e=>{if(scope.current===selected&&actor.current===userId)setError(errorText(e))})
  },[userId,selected,readWorkspace,readSnapshots])
  async function perform(task:()=>Promise<void>){
    if(working.current)return
    const program=selected,token=epoch.current;working.current=true;setBusy(true);setError(null);setNotice(null)
    try{await task()}catch(e){if(actor.current===userId&&epoch.current===token&&(!program||current(program,token)))setError(errorText(e))}
    finally{working.current=false;if(actor.current===userId)setBusy(false)}
  }
  async function loadSetup(){
    if(!selected)return
    const program=selected,token=epoch.current;setSetup(null);setSetupGap(null);setSnapshot(null);setConfirmation(null);setDraft(null);setPreview(null)
    const response=await fetch(`/api/coach/first-reviewed/programs/${program}/setup?historyDays=90&tzOffset=${getTimezoneOffset()}`,{cache:'no-store'}),body=await json(response)
    if(!current(program,token))return
    if(body.kind==='setup_required'){setSetupGap('Current setup needs correction before factual confirmation.');return}
    if(body.kind==='review_required'){setSetupGap('A current designated reviewer is required before this transition.');return}
    const seed=parseFirstReviewedSetupSeed(body.seed,userId,program)
    if(!response.ok||body.kind!=='setup'||!seed)throw Error('Current setup could not be verified.')
    setSetup(seed)
  }
  function invalidatePreparedContext(){setSetup(null);setSnapshot(null);setConfirmation(null);setDraft(null);setPreview(null);setCandidate(null);setReviewed(false);setAcceptReviewed(false)}
  async function loadSetupEditor(){
    if(!selected)return
    const program=selected,token=epoch.current;setSetupEditor(null);setSetupEdits(null);invalidatePreparedContext()
    const response=await fetch(`/api/coach/first-reviewed/programs/${program}/setup-editor`,{cache:'no-store'}),body=await json(response)
    if(!current(program,token))return
    const seed=parseFirstReviewSetupEditorSeed(body.seed,userId,program)
    if(!response.ok||body.kind!=='setup_editor'||!seed||typeof body.writesEnabled!=='boolean')throw Error('Current setup declarations could not be read. Current review scope may need configuration.')
    setWritesEnabled(body.writesEnabled);setSetupEditor(seed);setSetupEdits(firstReviewSetupEdits(seed))
  }
  async function sendSetup(request:FirstReviewSetupRequest,mode:'send'|'recover'|'close'){
    const program=request.programId,token=epoch.current
    try{
      const resolution=await runFirstReviewSetupBrowserAction(localStorage,request,()=>current(program,token)?userId:null,mode)
      if(!current(program,token))return
      setSetupPending(null);setSetupEditor(null);setSetupEdits(null);invalidatePreparedContext();setWritesEnabled(false)
      setNotice(resolution.disposition==='saved'?'The exact setup declarations were saved and verified. Load fresh facts before preparing a week.':'The original setup request is permanently closed without a write. Read current declarations before a new action.')
      await readWorkspace(program)
      // A historical receipt proves that save, not current authority or freshness.
    }finally{if(current(program,token)){
      try{setSetupPending(readFirstReviewSetupPending(localStorage,userId,program));setPending(readFirstReviewedPending(localStorage,userId,program));setRecoveryPrograms(savedPrograms(userId))}
      catch(e){setStorageReady(false);setError(errorText(e))}
    }}
  }
  function saveSetup(){
    if(!setupEditor||!setupEdits)return Promise.resolve()
    const q=parseFirstReviewSetupRequest({schemaVersion:1,expectedUserId:userId,programId:setupEditor.programId,designationId:setupEditor.designationId,
      designationVersion:setupEditor.designationVersion,basePlanVersionId:setupEditor.basePlanVersionId,requestId:crypto.randomUUID(),
      expectedDeclarations:setupEditor.declarations,contents:setupEdits})
    if(!q)throw Error('Complete the explicit setup choices before saving.')
    return sendSetup(q,'send')
  }
  async function loadSnapshot(id:string,confirmationId:string|null=null){
    if(!selected)return
    const program=selected,token=epoch.current,response=await fetch(`/api/coach/first-reviewed/profiles/${id}`,{cache:'no-store'}),body=await json(response)
    const value=parseFirstReviewedProfileSnapshot(body.snapshot)
    if(!current(program,token))return
    if(!response.ok||body.kind!=='snapshot'||!value||value.snapshotId!==id||value.userId!==userId||value.programId!==program)throw Error('Saved context is unavailable.')
    setSnapshot(value);setConfirmation(null);setDraft(null);setPreview(null)
    if(confirmationId){
      const request:FirstReviewedPending={schemaVersion:1,userId,programId:program,operation:'confirm_profile',body:{expectedUserId:userId,snapshotId:id,
        requestId:confirmationId,contentHash:value.contentHash,sourceHash:value.sourceHash,profileHash:value.profileHash}}
      const recovered=await fetch('/api/coach/first-reviewed/resolution',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}),raw=await json(recovered)
      if(!current(program,token))return
      const resolution=raw.kind==='resolved'?parseFirstReviewedRequestResolution(raw.resolution,request):null
      const receipt=resolution?.disposition==='saved'?parseFirstReviewedProfileReceipt(resolution.result):null
      if(!recovered.ok||!receipt)throw Error('The original context confirmation could not be verified.')
      setConfirmation(receipt)
    }
  }
  async function loadCandidate(id:string){
    if(!selected)return
    const program=selected,token=epoch.current;setCandidate(null);setReviewed(false);setAcceptReviewed(false)
    const response=await fetch(`/api/coach/first-reviewed/candidates/${id}`,{cache:'no-store'}),body=await json(response),value=parseFirstReviewedCandidateReview(body.candidate)
    if(!current(program,token))return
    if(!response.ok||body.kind!=='candidate'||!value||value.candidateId!==id||value.programId!==program||![value.userId,value.reviewerId].includes(userId))throw Error('The complete candidate is unavailable.')
    setCandidate(value)
  }
  async function send(request:FirstReviewedPending,mode:'send'|'recover'|'close'){
    const program=request.programId,token=epoch.current
    try{
      const resolution=await runFirstReviewedBrowserAction(localStorage,request,()=>current(program,token)?userId:null,mode)
      if(!current(program,token))return
      setPending(null);setWritesEnabled(false)
      if(resolution.disposition==='saved'){
        if(request.operation==='prepare_profile'){const value=parseFirstReviewedProfileSnapshot(resolution.result);if(!value)throw Error('Saved context could not be read.');setSnapshot(value);setConfirmation(null);setDraft(null);setPreview(null)}
        if(request.operation==='confirm_profile'){const value=parseFirstReviewedProfileReceipt(resolution.result);if(!value)throw Error('Context confirmation could not be read.');
          if(snapshot?.snapshotId!==value.snapshotId)await loadSnapshot(value.snapshotId)
          if(!current(program,token))return
          setConfirmation(value)}
        if(request.operation==='submit'){const value=parseFirstReviewedCandidateReview(resolution.result);if(!value)throw Error('Saved candidate could not be read.');setCandidate(value);setReviewed(false);setAcceptReviewed(false)}
        setNotice(request.operation==='accept'?'This exact week is accepted on your existing program. Previous history is preserved.':'The exact result was verified and retained.')
      }else{setNotice('The original request is permanently closed without a write. You can prepare a new action.');setPreview(null)}
      await readWorkspace(program)
      if(workspace?.program.role==='athlete')await readSnapshots(program)
    }finally{if(current(program,token)){
      try{setPending(readFirstReviewedPending(localStorage,userId,program));setSetupPending(readFirstReviewSetupPending(localStorage,userId,program));setRecoveryPrograms(savedPrograms(userId))}
      catch(e){setStorageReady(false);setError(errorText(e))}
    }}
  }
  function buildDraft():FirstReviewedDraft|null {
    const p=workspace?.program,d=p?.latestDesignation
    if(!p||!d||!snapshot||!confirmation||!draft||confirmation.snapshotId!==snapshot.snapshotId||snapshot.designationId!==d.designationId)return null
    return parseFirstReviewedDraft({candidateId:crypto.randomUUID(),designationId:d.designationId,programId:p.programId,basePlanVersionId:d.basePlanVersionId,
      profileSnapshotId:snapshot.snapshotId,profileConfirmationRequestId:confirmation.requestId,historyDays:snapshot.historyDays,tzOffset:snapshot.tzOffset,
      windowStart:d.targetWindowStart,sequenceNumber:draft.sequenceNumber,confirmedTargetProfile:snapshot.projection.profile,confirmedTargetProfileHash:snapshot.profileHash,
      recipe:draft.recipe,scheduleId:draft.scheduleId,rationale})
  }
  async function previewDraft(){
    if(!selected)return
    const program=selected,token=epoch.current,value=buildDraft();setPreview(null)
    if(!value)throw Error('Complete preparation, working sets, effort, rest, timing and rationale before preview.')
    const response=await fetch('/api/coach/first-reviewed/preview',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUserId:userId,draft:value})}),body=await json(response)
    const parsed=response.ok?await parseFirstReviewedPreview(body,value):null
    if(!current(program,token))return
    if(!parsed)throw Error(typeof body.error==='string'?body.error:'The complete preview could not be verified.')
    setPreview(parsed)
  }
  const p=workspace?.program,d=p?.latestDesignation,summary=workspace?.candidates.find(c=>c.candidateId===candidate?.candidateId)
  const freshScope=!!(p?.reviewAvailable&&d?.enabled&&Date.parse(d.expiresAt)>Date.now())
  const retained=!!pending||!!setupPending
  const unavailable=busy||!storageReady||retained||!writesEnabled||!freshScope
  const owner=p?.role==='athlete'&&p.athleteId===userId
  const contextCurrent=!!(snapshot&&confirmation&&d&&snapshot.designationId===d.designationId&&snapshot.basePlanVersionId===d.basePlanVersionId
    &&confirmation.snapshotId===snapshot.snapshotId&&Date.parse(snapshot.validBefore)>Date.now())
  const boundCandidate=!!(candidate&&d&&candidate.designationId===d.designationId&&candidate.designationVersion===d.version&&candidate.basePlanVersionId===d.basePlanVersionId)
  return <section className="mx-auto max-w-5xl space-y-6 p-4 text-base">
    <h1 className="text-2xl font-bold">First reviewed week</h1>
    <p>Confirm current context, review the complete week, then separately accept it. A gap between weeks does not establish completed or skipped training.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!programs&&!error&&<p role="status">Loading your programs…</p>}
    {(programs||recoveryPrograms.length>0)&&<label className="block">Program<select className="min-h-11 w-full rounded border p-2 text-base" disabled={busy} value={selected??''} onChange={e=>select(e.target.value)}>
      <option value="">Choose a program</option>{programs?.programs.map(v=><option key={v.programId} value={v.programId}>{v.title} · {v.role}</option>)}
      {recoveryPrograms.filter(id=>!programs?.programs.some(v=>v.programId===id)).map(id=><option key={id} value={id}>Saved request outside current review scope</option>)}
    </select></label>}
    {programs?.nextAfterProgramId&&<button className={action} disabled={busy} onClick={()=>void perform(loadMorePrograms)}>More review programs</button>}
    {programs?.programs.length===0&&recoveryPrograms.length===0&&<p>No eligible programs are available. Existing program history has not been changed.</p>}
    {pending&&<section aria-label="Interrupted request" className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">Recover the interrupted request</h2>
      <p>The exact {label(pending.operation)} request is retained. An absent result does not authorize a resend.</p>
      <button className={action} disabled={busy||!storageReady} onClick={()=>void perform(()=>send(pending,'recover'))}>Check the original saved result</button>
      <button className={action} disabled={busy||!storageReady} onClick={()=>void perform(()=>send(pending,'close'))}>Close the original request if no write was saved</button>
    </section>}
    {setupPending&&<section aria-label="Recover interrupted setup save" className="space-y-3 rounded-lg border p-4"><h2 className="text-xl font-bold">Recover interrupted setup save</h2>
      <p>Your exact setup declarations are retained. An absent result does not authorize a resend.</p>
      <button className={action} disabled={busy||!storageReady} onClick={()=>void perform(()=>sendSetup(setupPending,'recover'))}>Check the original setup result</button>
      <button className={action} disabled={busy||!storageReady} onClick={()=>void perform(()=>sendSetup(setupPending,'close'))}>Close the original setup request if no write was saved</button>
    </section>}
    {p&&!freshScope&&<p role="status">Current reviewer scope is not configured, expired or revoked. Historical results remain separate from authority for a new week.</p>}
    {p&&<button className={action} disabled={busy} onClick={()=>void perform(async()=>{await readWorkspace(p.programId);if(owner)await readSnapshots(p.programId)})}>Refresh current scope and history</button>}
    {owner&&<section aria-label="1 Confirm current setup" className="space-y-3"><h2 className="text-xl font-bold">1. Confirm current setup</h2>
      <button className={action} disabled={busy||retained||!storageReady||!freshScope||!!setupEditor} onClick={()=>void perform(loadSetup)}>Read current saved setup</button>
      <button className={action} disabled={busy||retained||!storageReady} onClick={()=>void perform(loadSetupEditor)}>Review or update current setup</button>
      {setupGap&&<p role="status">{setupGap}</p>}
      <p>Use your saved daily availability, equipment and constraints. Training facts are loaded separately; an empty declaration seed does not mean no training occurred.</p>
      {setupEditor&&setupEdits&&<section aria-label="Edit current setup" className="space-y-4 rounded-lg border p-4">
        <p>Confirm your current goal, daily time, equipment and constraints together. State any restrictions or questions; leave constraints empty only if none apply. This saves declarations, not performed training or a reviewed prescription.</p>
        {FIRST_REVIEW_SETUP_KEYS.map(key=><section key={key} className="space-y-2"><h3 className="text-lg font-semibold capitalize">{label(key)}</h3>
          <ReviewedSetupEditor memoryKey={key} value={setupEdits[key]} disabled={unavailable} onChange={value=>{setSetupEdits({...setupEdits,[key]:value});invalidatePreparedContext()}}/>
        </section>)}
        <button className={action} disabled={unavailable||!FIRST_REVIEW_SETUP_KEYS.every(key=>validReviewedSetupEdit(key,setupEdits[key]))}
          onClick={()=>void perform(saveSetup)}>Confirm and save these setup declarations</button>
        <button className={action} disabled={busy||retained} onClick={()=>{setSetupEditor(null);setSetupEdits(null);invalidatePreparedContext();setNotice('Unsaved setup edits were discarded. Read current saved setup before continuing.')}}>Cancel setup editing</button>
      </section>}
      {setup&&<><ContextFacts value={{goal:setup.targetSetup.athleteGoalSummary,primary:setup.targetSetup.primaryGoal,secondary:setup.targetSetup.secondaryGoals,
        dailyAvailability:setup.targetSetup.sessionAvailability,equipment:setup.targetSetup.equipment,constraints:setup.targetSetup.explicitConstraints,clarification:setup.targetSetup.unresolvedConstraintNote,targetWeek:setup.windowStart}}/>
        <button className={action} disabled={unavailable} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:setup.programId,operation:'prepare_profile',body:{expectedUserId:userId,
          request:{snapshotId:crypto.randomUUID(),designationId:setup.designationId,programId:setup.programId,basePlanVersionId:setup.basePlanVersionId,historyDays:setup.historyDays,
            tzOffset:setup.tzOffset,windowStart:setup.windowStart,targetSetup:setup.targetSetup}}},'send'))}>Load fresh training facts</button></>}
    </section>}
    {owner&&snapshots&&<details><summary className="min-h-11 cursor-pointer py-3">Saved context history</summary>{snapshots.snapshots.map(s=><button key={s.snapshotId} className={action} disabled={busy||retained}
      onClick={()=>void perform(()=>loadSnapshot(s.snapshotId,s.confirmationRequestId))}>Review context from {s.createdAt} · {s.confirmedAt?'confirmed':'unconfirmed'}</button>)}
      {snapshots.nextAfterSnapshotId&&<button className={action} disabled={busy} onClick={()=>void perform(()=>readSnapshots(snapshots.programId,snapshots.nextAfterSnapshotId))}>More saved context</button>}</details>}
    {owner&&snapshot&&<section aria-label="2 Confirm fresh facts" className="space-y-3"><h2 className="text-xl font-bold">2. Confirm fresh facts</h2>
      <p>Read through {snapshot.historyThrough}; {snapshot.historyDays} days requested. Older or unreported training remains unknown. Confirming facts does not approve or accept a week.</p>
      <ContextFacts value={snapshot.projection}/>
      {!confirmation&&<button className={action} disabled={unavailable||Date.parse(snapshot.validBefore)<=Date.now()||snapshot.designationId!==d?.designationId} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:snapshot.programId,operation:'confirm_profile',
        body:{expectedUserId:userId,snapshotId:snapshot.snapshotId,requestId:crypto.randomUUID(),contentHash:snapshot.contentHash,sourceHash:snapshot.sourceHash,profileHash:snapshot.profileHash}},'send'))}>Confirm these exact current facts</button>}
      {confirmation&&<p role="status">This factual snapshot is explicitly confirmed.</p>}
    </section>}
    {owner&&contextCurrent&&p&&<section aria-label="3 Prepare complete week" className="space-y-3"><h2 className="text-xl font-bold">3. Prepare the complete week</h2>
      {!draft&&<button className={action} disabled={unavailable} onClick={()=>{setDraft(seedFirstReviewedWeek(p,userId));setPreview(null);setRationale('')}}>Start a blank reviewed week</button>}
      {draft&&<><SupervisedWeekEditor value={draft} disabled={unavailable} onChange={value=>{setDraft(value);setPreview(null)}}/>
        <label className="block">Why this week fits the goal and current evidence<textarea className="min-h-11 w-full rounded border p-2 text-base" maxLength={4000} disabled={unavailable} value={rationale} onChange={e=>{setRationale(e.target.value);setPreview(null)}}/></label>
        <button className={action} disabled={unavailable} onClick={()=>void perform(previewDraft)}>Compile and preview the complete week</button></>}
      {preview&&<><ReviewedWeekView value={preview.packet.week} showLogging={false}/><p>Preview does not establish reviewer approval or athlete acceptance.</p>
        <button className={action} disabled={unavailable} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:preview.draft.programId,operation:'submit',body:{expectedUserId:userId,draft:preview.draft}},'send'))}>Save this exact candidate for review</button></>}
    </section>}
    {workspace&&<section aria-label="Candidate history" className="space-y-3"><h2 className="text-xl font-bold">Candidate history</h2>
      {workspace.candidates.map(c=><button className={action} disabled={busy||retained} key={c.candidateId} onClick={()=>void perform(()=>loadCandidate(c.candidateId))}>Review complete week from {c.createdAt} · {c.proposalStatus??c.decision}</button>)}
      {!workspace.candidates.length&&<p>No reviewed candidate has been saved.</p>}
      {workspace.nextAfterCandidateId&&<button className={action} disabled={busy} onClick={()=>void perform(async()=>{await readWorkspace(workspace.program.programId,workspace.nextAfterCandidateId)})}>More candidates</button>}
    </section>}
    {candidate&&<section aria-label="4 Designated reviewer decision" className="space-y-3"><h2 className="text-xl font-bold">4. Designated reviewer decision</h2>
      <p>{candidate.reviewPacket.rationale}</p><details><summary className="min-h-11 cursor-pointer py-3">Previous accepted legacy week</summary><ContextFacts value={candidate.reviewPacket.legacyBase}/></details>
      <ReviewedWeekView value={candidate.reviewPacket.week} showLogging={false}/>
      <details><summary className="min-h-11 cursor-pointer py-3">Current facts, evidence and uncertainty</summary><ContextFacts value={{facts:candidate.reviewPacket.profileFacts,evidence:candidate.reviewPacket.evidence,limitations:candidate.reviewPacket.limitations}}/></details>
      {candidate.reviewerId===userId&&d?.reviewerId===userId&&summary?.decision==='pending'&&boundCandidate&&<>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={unavailable} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the complete week, previous plan, facts and limitations.</label>
        {(['approve','reject'] as const).map(decision=><button className={action} key={decision} disabled={unavailable||!reviewed} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:candidate.programId,operation:'decide',body:{expectedUserId:userId,
          candidateId:candidate.candidateId,designationId:candidate.designationId,requestId:crypto.randomUUID(),decision,contentHash:candidate.contentHash,sourceHash:candidate.sourceHash}},'send'))}>{decision==='approve'?'Approve this exact week':'Reject this candidate'}</button>)}
      </>}
      {owner&&summary?.decision==='approve'&&boundCandidate&&<section aria-label="5 Issue athlete proposal" className="space-y-3"><h2 className="text-xl font-bold">5. Issue athlete proposal</h2>
        {!summary.proposalId&&<button className={action} disabled={unavailable} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:candidate.programId,operation:'issue',body:{expectedUserId:userId,programId:candidate.programId,candidateId:candidate.candidateId,requestId:crypto.randomUUID()}},'send'))}>Create the athlete proposal</button>}
        {summary.proposalStatus==='proposed'&&summary.proposalId&&summary.planVersionId&&summary.proposalRequestId&&<section aria-label="6 Separate athlete acceptance" className="space-y-3"><h2 className="text-xl font-bold">6. Separate athlete acceptance</h2>
          <p>The complete week above is the exact proposal. Reviewer approval does not accept it for you.</p>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={unavailable} checked={acceptReviewed} onChange={e=>setAcceptReviewed(e.target.checked)}/>I reviewed this complete proposed week and want to accept it.</label>
          <button className={action} disabled={unavailable||!acceptReviewed} onClick={()=>void perform(()=>send({schemaVersion:1,userId,programId:candidate.programId,operation:'accept',body:{expectedUserId:userId,programId:candidate.programId,candidateId:candidate.candidateId,
            proposalId:summary.proposalId!,planVersionId:summary.planVersionId!,requestId:summary.proposalRequestId!,contentHash:candidate.contentHash,sourceHash:candidate.sourceHash}},'send'))}>Accept this exact week</button>
        </section>}
      </section>}
      {summary?.proposalStatus==='accepted'&&<p role="status">This exact week is accepted. Your prior program history remains preserved.</p>}
    </section>}
  </section>
}
