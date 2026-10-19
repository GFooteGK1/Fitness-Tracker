'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { compressImage } from '@/app/lib/imageUtils'

/** Capture utility only. No embedded coaching conversation or mandatory meal review. */
export function NutritionPhotoPilot() {
  const { user } = useAuth()
  const currentOwner = useRef(user?.id)
  currentOwner.current = user?.id
  const [photo,setPhoto] = useState<File|null>(null), [context,setContext] = useState('')
  const [approved,setApproved] = useState(false), [busy,setBusy] = useState(false), [message,setMessage] = useState('')
  const [pending,setPending] = useState<string|null>(null)
  const [terminal,setTerminal] = useState(false)
  const [resumeReady,setResumeReady] = useState(false)
  useEffect(()=>{setPhoto(null);setContext('');setApproved(false);setPending(null);setMessage('');setBusy(false);setTerminal(false);setResumeReady(false)},[user?.id])
  async function capture() {
    if (!photo || !approved || busy || pending) return
    setBusy(true)
    const id = crypto.randomUUID()
    const owner = user?.id
    let dispatched = false
    // Keep the stable ID visible even when the response is lost. This utility
    // does not persist selected photos or a background queue in the browser.
    setPending(id)
    try {
      if (!user) { setPending(null); throw new Error('Sign in to the original account.') }
      const compressed = await compressImage(photo,1,1200)
      const selected = await (await fetch(compressed.compressedDataUrl)).blob()
      if (currentOwner.current !== owner) return
      const form = new FormData()
      form.set('photo',selected,'selected.jpg'); form.set('requestId',id); form.set('expectedOwner',user.id)
      form.set('capturedAt',new Date().toISOString()); form.set('context',context)
      form.set('consent','selected-photo-openai-autolog-v1')
      dispatched = true
      const response = await fetch('/api/meals/photo-pilot',{method:'POST',body:form})
      const result = await response.json()
      if (currentOwner.current !== owner) return
      setTerminal(response.ok && ['saved','rejected'].includes(result.capture?.state))
      setResumeReady(response.ok && result.capture?.state==='estimated')
      if (response.status===422) setPending(null)
      setMessage(response.ok ? `Capture ${result.capture.id}: ${result.capture.state}. ${result.next}` : `${result.error} Keep capture ID ${id}.`)
    } catch { if (currentOwner.current === owner) {
      if (!dispatched) { setPending(null);setMessage('Photo was not submitted. Choose a readable photo and try again.') }
      else setMessage(`Capture outcome is unconfirmed. Keep ID ${id} and check its status before another submission.`)
    } }
    finally { if (currentOwner.current === owner) setBusy(false) }
  }
  async function status() {
    if (!pending) return
    const owner = user?.id
    setBusy(true)
    try {
      const response = await fetch('/api/meals/photo-pilot?captureId='+encodeURIComponent(pending))
      const result = await response.json()
      if (currentOwner.current !== owner) return
      setTerminal(response.ok && ['saved','rejected'].includes(result.capture?.state))
      setResumeReady(response.ok && result.capture?.state==='estimated')
      setMessage(response.ok ? `Capture ${pending}: ${result.capture.state}. ${result.label}` : `${result.error} Keep ID ${pending}.`)
    } catch { if (currentOwner.current === owner) setMessage(`Status unavailable. Keep ID ${pending}.`) }
    finally { if (currentOwner.current === owner) setBusy(false) }
  }
  async function resume() {
    if (!pending || busy || !resumeReady || !user) return
    const owner=user.id;setBusy(true)
    try {
      const response=await fetch('/api/meals/photo-pilot',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({captureId:pending,expectedOwner:owner})})
      const result=await response.json()
      if (currentOwner.current!==owner) return
      setTerminal(response.ok && result.capture?.state==='saved');setResumeReady(false)
      setMessage(response.ok ? `Capture ${pending}: ${result.capture.state}. ${result.next}` : `${result.error} Check original capture ${pending}.`)
    } catch { if(currentOwner.current===owner)setMessage(`Completion is unconfirmed. Check original capture ${pending}.`) }
    finally { if(currentOwner.current===owner)setBusy(false) }
  }
  return <main className="mx-auto max-w-lg space-y-4 p-4 text-base">
    <h1 className="text-xl font-semibold">Log a food photo estimate</h1>
    <p>Selecting a photo sends it to OpenAI for screening and estimation, privately retains a normalized copy, and automatically logs a qualifying estimate as unreviewed. Portions and consumption are uncertain. Refine later in your chosen LLM.</p>
    <label className="block">Food photo<input key={pending ?? 'new'} className="block min-h-[44px] text-base" type="file" accept="image/jpeg,image/png" capture="environment" disabled={!!pending || busy} onChange={e=>setPhoto(e.target.files?.[0]??null)}/></label>
    <label className="block">Optional portion, ingredients or consumption context<textarea className="block w-full text-base" maxLength={1000} disabled={!!pending || busy} value={context} onChange={e=>setContext(e.target.value)}/></label>
    <label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" checked={approved} disabled={!!pending || busy} onChange={e=>setApproved(e.target.checked)}/>I approve this selected photo’s private retention, OpenAI processing and automatic estimated entry.</label>
    <button className="min-h-[44px] rounded bg-blue-700 px-4 text-white disabled:opacity-50" disabled={!photo||!approved||busy||!!pending} onClick={capture}>{busy?'Working…':'Save estimated meal'}</button>
    {pending && <p>Capture ID: <code className="break-all">{pending}</code></p>}
    {pending && <button className="min-h-[44px] px-4 underline" disabled={busy} onClick={status}>Check original capture</button>}
    {resumeReady && <button className="min-h-[44px] px-4 underline" disabled={busy} onClick={resume}>Finish original saved estimate</button>}
    {terminal && <button className="min-h-[44px] px-4 underline" disabled={busy} onClick={()=>{setPending(null);setPhoto(null);setApproved(false);setContext('');setTerminal(false);setMessage('')}}>Choose another photo</button>}
    <p role="status" aria-live="polite">{message}</p>
  </main>
}
