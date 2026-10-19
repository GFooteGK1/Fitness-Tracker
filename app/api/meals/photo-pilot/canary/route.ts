import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { canaryIdentity, captureFixedPhotoCanary, PhotoPilotError } from '@/app/lib/nutrition/photo-pilot'
import { nutritionPhotoCanaryEnabled, nutritionPhotoCanaryDispatchEnabled, PHOTO_CANARY_CONSENT, PHOTO_CANARY_ID } from '@/app/lib/nutrition/photo-pilot-canary-policy'

export const runtime = 'nodejs'
export const maxDuration = 120
const headers = { 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" }
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers })
const paused = () => json({ error: 'The fixed reference canary is paused.' },409)
const fail = (error: unknown) => json({ error: error instanceof PhotoPilotError ? error.message : 'Canary outcome unavailable. Keep the original reference ID.' },error instanceof PhotoPilotError ? error.status : 503)
const exactUrl = (request: Request) => new URL(request.url).search === ''
const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!))

/** A route response bypasses React layouts/AuthProvider entirely. This GET never
 * uploads, estimates, settles, syncs WHOOP, or creates an athlete/profile row. */
export async function GET(request: Request) {
  if (!nutritionPhotoCanaryEnabled()) return paused()
  try {
    if (!exactUrl(request)) throw new PhotoPilotError(422,'This reference accepts no query overrides.')
    const db = await createServerClient(), owner = await canaryIdentity(db)
    const {data,error} = await db.from('nutrition_photo_captures').select('id,user_id,state,meal_id,updated_at')
      .eq('user_id',owner).eq('id',PHOTO_CANARY_ID).maybeSingle()
    if (error) throw new PhotoPilotError(503,'Reference status unavailable; absence has not been established.')
    if (data && (data.user_id !== owner || data.id !== PHOTO_CANARY_ID || data.meal_id)) throw new PhotoPilotError(409,'Reference isolation could not be confirmed.')
    const status = data ? `${data.state}; last updated ${data.updated_at}` : 'Not staged'
    return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Socius reference canary</title><main><h1>Fixed reference canary</h1><p>Synthetic plate illustration. Not consumed; never saved as a meal.</p><p>${escape(status)}</p><p>${nutritionPhotoCanaryDispatchEnabled() ? 'One screening and conditional estimation attempt; up to $0.85 reserved within the existing $1/$5 limits. No retry.' : 'Storage preparation only. Paid dispatch remains paused for boundary verification.'}</p><p>The private reference and audit records are retained. An uncertain result must not be retried with a new ID.</p><form method="post" action="/api/meals/photo-pilot/canary"><input type="hidden" name="consent" value="${PHOTO_CANARY_CONSENT}"><button type="submit" style="min-height:44px;font-size:16px">Continue with this fixed reference</button></form></main></html>`,
      {headers:{...headers,'Content-Type':'text/html; charset=utf-8'}})
  } catch(error) { return fail(error) }
}

async function consentBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new PhotoPilotError(422,'The fixed reference consent is required.')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const bytes = await Promise.race([ (async()=>{
      const chunks: Uint8Array[] = []; let length = 0
      while (true) {
        const {done,value} = await reader.read()
        if (done) return Buffer.concat(chunks).toString('utf8')
        length += value.length
        if (length > 128) throw new PhotoPilotError(413,'Reference consent is too large.')
        chunks.push(value)
      }
    })(), new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PhotoPilotError(408,'Reference consent timed out.')),5_000)}) ])
    const form = new URLSearchParams(bytes)
    if ([...form].length !== 1 || form.get('consent') !== PHOTO_CANARY_CONSENT) throw new PhotoPilotError(422,'Only the fixed reference consent is accepted.')
  } finally { clearTimeout(timer); await reader.cancel(); reader.releaseLock() }
}

export async function POST(request: Request) {
  if (!nutritionPhotoCanaryEnabled()) return paused()
  try {
    if (!exactUrl(request) || request.headers.get('origin') !== new URL(request.url).origin
      || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded')
      throw new PhotoPilotError(422,'Use the same-origin fixed reference form.')
    const db = await createServerClient()
    await canaryIdentity(db)
    await consentBody(request)
    const capture = await captureFixedPhotoCanary(db)
    if (capture.id !== PHOTO_CANARY_ID || capture.meal_id || capture.receipt) throw new PhotoPilotError(409,'Reference isolation could not be confirmed.')
    return json({capture:{id:capture.id,state:capture.state,mealId:null,updatedAt:capture.updated_at},
      label:'Synthetic canary, not consumed. Staging status alone does not qualify billing, accuracy or production activation.'})
  } catch(error) { return fail(error) }
}
