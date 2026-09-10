import Link from 'next/link'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { AppIcon } from '@/app/components/AppIcon'

export default function CapturePage() {
  return <ProtectedRoute><div className="mx-auto max-w-xl space-y-6">
    <header><p className="app-eyebrow">Make it a quick one</p><h1 className="app-title">What would you like to log?</h1><p className="app-muted mt-2">Start with what you know. Add details where they matter.</p></header>
    <Link href="/program" className="app-panel flex items-center gap-4 p-5"><AppIcon name="plan" /><div><h2 className="font-semibold">Today’s planned workout</h2><p className="app-muted mt-1 text-sm">Confirm your session or record changes.</p></div><span className="ml-auto" aria-hidden="true">→</span></Link>
    <Link href="/log" className="app-panel flex items-center gap-4 p-5"><AppIcon name="workout" /><div><h2 className="font-semibold">Another workout</h2><p className="app-muted mt-1 text-sm">Use a photo, voice, or text.</p></div><span className="ml-auto" aria-hidden="true">→</span></Link>
    <Link href="/food-progress?view=camera" className="app-panel flex items-center gap-4 p-5"><AppIcon name="food" /><div><h2 className="font-semibold">A meal</h2><p className="app-muted mt-1 text-sm">Photo, voice, text, or a recent meal.</p></div><span className="ml-auto" aria-hidden="true">→</span></Link>
    <Link href="/templates" className="app-secondary w-full">Browse workout templates</Link>
  </div></ProtectedRoute>
}
