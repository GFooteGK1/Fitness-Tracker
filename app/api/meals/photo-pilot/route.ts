import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { capturePilotPhoto, pilotIdentity, PhotoPilotError, resumePilotCapture, type PilotCapture } from '@/app/lib/nutrition/photo-pilot'
import { nutritionPhotoPilotEnabled } from '@/app/lib/nutrition/photo-pilot-policy'

export const runtime = 'nodejs'
export const maxDuration = 120
const respond = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const paused = () => respond({ error: 'Nutrition photo pilot is awaiting activation approval.' },409)
const statusColumns = 'id,user_id,state,captured_at,received_at,updated_at,meal_id,photo_stored_at,estimated_at,saved_at'
const fail = (error: unknown) => respond({ error: error instanceof PhotoPilotError ? error.message : 'Capture is unavailable. Keep the original request ID.' }, error instanceof PhotoPilotError ? error.status : 503)
const visibleCapture = (capture: PilotCapture) => ({ id:capture.id,state:capture.state,mealId:capture.meal_id ?? null,
  capturedAt:capture.captured_at,receivedAt:capture.received_at,updatedAt:capture.updated_at })

async function boundedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader()
  if (!reader) throw new PhotoPilotError(422,'A request body is required.')
  const chunks: Uint8Array[] = []; let length = 0
  const deadline = Date.now()+15_000
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const {value,done} = await Promise.race([reader.read(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new PhotoPilotError(408,'Upload timed out.')),Math.max(0,deadline-Date.now()))
      })]).finally(()=>clearTimeout(timer))
      if (done) break
      length+=value.length
      if (length>maximum) throw new PhotoPilotError(413,'Request is too large.')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch(error) { await reader.cancel(); throw error }
  finally { reader.releaseLock() }
}

export async function GET(request: Request) {
  if (!nutritionPhotoPilotEnabled()) return paused()
  try {
    const db = await createServerClient(), owner = await pilotIdentity(db)
    const params = new URL(request.url).searchParams, id = params.get('captureId')
    if ([...params.keys()].some(k => k !== 'captureId') || !id || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)) return respond({ error: 'A capture UUID is required.' },422)
    const { data,error } = await db.from('nutrition_photo_captures').select(statusColumns).eq('user_id',owner).eq('id',id).maybeSingle()
    if (error) return respond({ error: 'Capture status is unavailable; absence has not been established.' },503)
    if (!data || data.user_id !== owner) return respond({ error: 'Capture unavailable for this account.' },404)
    const { user_id: _, ...capture } = data
    return respond({ capture, label: 'Estimated and unreviewed; photo presence does not prove consumption.' })
  } catch(error) { return fail(error) }
}

export async function POST(request: Request) {
  if (!nutritionPhotoPilotEnabled()) return paused()
  try {
    const db = await createServerClient()
    await pilotIdentity(db)
    // Bound the entire multipart stream before parsing; not just photo.size or
    // the untrusted Content-Length header. No raw media is logged.
    const body = await boundedBody(request,1024*1024+8192)
    const form = await new Request(request.url,{ method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body }).formData()
    if ([...form.keys()].some(k => !['photo','capturedAt','requestId','expectedOwner','context','consent'].includes(k))
      || [...new Set(form.keys())].some(k => form.getAll(k).length!==1)) return respond({ error: 'Unsupported photo metadata.' },422)
    const photo = form.get('photo')
    if (!(photo instanceof File)) return respond({ error: 'Choose a photo.' },422)
    const capture = await capturePilotPhoto(db,{ expectedOwner: String(form.get('expectedOwner') ?? ''), requestId: String(form.get('requestId') ?? ''),
      capturedAt: String(form.get('capturedAt') ?? ''), context: String(form.get('context') ?? ''), consent: String(form.get('consent') ?? ''),
      bytes: new Uint8Array(await photo.arrayBuffer()),mediaType:photo.type })
    // Internal ledger payloads/object paths are not a response contract.
    return respond({ capture: visibleCapture(capture),
      label:'Estimated and unreviewed; photo presence does not prove consumption.',
      next: capture.state==='saved' ? 'Optional refinement in your chosen LLM.' : 'Retrieve this capture ID. Do not create another ID to retry an uncertain estimate.' })
  } catch(error) { return fail(error) }
}

/** Explicit recovery completes only a persisted estimate. No image or provider
 * path is reachable; GET remains a read. The SQL commit replays an existing receipt. */
export async function PATCH(request: Request) {
  if (!nutritionPhotoPilotEnabled()) return paused()
  try {
    const db=await createServerClient();await pilotIdentity(db)
    const body=JSON.parse((await boundedBody(request,1024)).toString('utf8'))
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['captureId','expectedOwner'].includes(k))
      || typeof body.captureId!=='string' || typeof body.expectedOwner!=='string') return respond({error:'An original capture ID and expected account are required.'},422)
    const capture=await resumePilotCapture(db,body.captureId,body.expectedOwner)
    return respond({capture:visibleCapture(capture),label:'Estimated and unreviewed.',next:'Optional refinement in your chosen LLM.'})
  } catch(error) { return fail(error) }
}
