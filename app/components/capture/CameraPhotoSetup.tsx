'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { assertCaptureOwner } from '@/app/lib/client/logging-request'
type Device = { id: string; admittedAt: string; expiresAt: string; revokedAt: string | null }

export function CameraPhotoSetup() {
 const { user } = useAuth(), owner = user?.id
 const session = useRef({ owner, generation: 0 })
 if (session.current.owner !== owner) session.current = { owner, generation: session.current.generation + 1 }
 const [devices, setDevices] = useState<Device[]>([]), [consent, setConsent] = useState(false)
 const [token, setToken] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
 const lock = useRef(false), [refresh, setRefresh] = useState(0)
 const [loadedOwner, setLoadedOwner] = useState(owner)
 useEffect(() => { setLoadedOwner(owner); setDevices([]); setToken(''); setConsent(false); setMessage(''); setBusy(false); lock.current = false }, [owner])
 useEffect(() => {
  let active = true
  if (owner) void fetch('/api/capture/devices', { cache: 'no-store' }).then(async r => {
   const data = await r.json(); if (!active || data.userId && data.userId !== owner) return
   if (!r.ok) { setMessage(data.error); return }; setDevices(data.devices)
  }).catch(() => { if (active) setMessage('Camera setup is unavailable.') })
  return () => { active = false }
 }, [owner, refresh])
 async function action(method: 'POST' | 'DELETE', deviceId?: string) {
  if (!owner || lock.current || method === 'POST' && !consent) return
  const generation = session.current.generation, current = () => session.current.owner === owner && session.current.generation === generation
  lock.current = true; setBusy(true); setToken(''); setMessage('')
  try {
   await assertCaptureOwner(owner); if (!current()) return
   const r = await fetch('/api/capture/devices', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUserId: owner, ...(method === 'POST' ? { consentPolicy: 'camera-cloud-v1' } : { deviceId: deviceId ?? null }) }) })
   const data = await r.json(); if (!current()) return
   if (!r.ok || data.userId !== owner) throw Error(data.error ?? 'Camera setup was not confirmed.')
   if (method === 'POST') { setToken(data.token); setConsent(false); setMessage('Copy this private pairing token into Auto Meals once. It is shown only now.') }
   else setMessage('Camera device access disabled. Already transmitted images cannot be recalled.')
   setRefresh(v => v + 1)
  } catch (e) { if (current()) setMessage(e instanceof Error ? e.message : 'Setup was not confirmed. Disable all devices before creating another pairing.') }
  finally { if (current()) { lock.current = false; setBusy(false) } }
 }
 return <section className="mx-auto max-w-xl p-4 space-y-4 text-base">
  <h1 className="text-2xl font-bold">Camera photo logging</h1>
  <p>Pair SociusFit Auto Meals once, then use its Log New Camera Photos action in Camera → Is Closed → Run Immediately.</p>
  <p>Only photos added after setup with a recorded capture time after setup are eligible. This includes new imports with a recent capture time. OpenAI receives the resized photo to screen it, including non-food or sensitive photos. Food candidates also go to the cloud provider configured for Socius macro analysis. SociusFit does not save the photo; provider retention policies apply. Drafts wait for your review. Nutrition changes only when you accept a meal.</p>
  <label className="flex gap-3 min-h-[44px] items-center"><input type="checkbox" checked={consent && loadedOwner === owner} onChange={e => setConsent(e.target.checked)} disabled={busy} />I approve automatic cloud screening of new photos and food analysis.</label>
  <button className="min-h-[44px] px-4 rounded bg-blue-600 text-white" onClick={() => void action('POST')} disabled={!owner || !consent || busy}>Create private pairing</button>
  {loadedOwner === owner && token && <div><p>Keep this token private. Paste it only into SociusFit Auto Meals.</p><textarea readOnly aria-label="Private pairing token" className="w-full text-base min-h-[88px]" value={token} /></div>}
  {loadedOwner === owner && message && <p role="status">{message}</p>}
  {loadedOwner === owner && devices.map(device => <div key={device.id} className="border p-3 rounded"><p>Device {device.id.slice(0,8)} · {device.revokedAt ? 'Disabled' : `Expires ${new Date(device.expiresAt).toLocaleString()}`}</p><button className="min-h-[44px] px-4" disabled={busy || !!device.revokedAt} onClick={() => void action('DELETE', device.id)}>Disable device</button></div>)}
  <button className="min-h-[44px] px-4 border rounded" onClick={() => void action('DELETE')} disabled={busy || !owner}>Disable all camera devices</button>
  <p>The phone processes one pending photo per invocation. Unconfirmed uploads are checked by their original identity and never automatically resent. Deferred photos need a later Camera close or a manual run. Disable also stops future dispatch; an in-flight call may finish.</p>
 </section>
}
