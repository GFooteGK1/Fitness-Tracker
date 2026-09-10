'use client'

import React, { useEffect, useRef } from 'react'
import Link from 'next/link'
import { type PRResult, formatPRValue } from '@/app/lib/pr-detection'

interface PRNotificationProps {
  prs: PRResult[]
  onDismiss: () => void
}

const labels = { weight: 'Max weight', reps: 'Repetitions', time: 'Time', volume: 'Session volume' }

export default function PRNotification({ prs, onDismiss }: PRNotificationProps) {
  const records = prs.filter(pr => pr.isPR && pr.previousBest > 0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const startY = useRef<number | null>(null)
  useEffect(() => {
    if (!records.length) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [records.length])
  if (!records.length) return null

  return <section role="region" aria-label="Workout records" className="app-panel fixed inset-x-3 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 mx-auto max-h-[65dvh] max-w-lg overflow-y-auto p-5 shadow-xl"
    onKeyDown={event => { if (event.key === 'Escape') onDismiss() }}
    onTouchStart={event => { startY.current = event.touches[0]?.clientY ?? null }}
    onTouchEnd={event => { if (startY.current !== null && event.changedTouches[0]?.clientY - startY.current > 70) onDismiss(); startY.current = null }}>
    <div className="flex items-center justify-between gap-3">
      <div><p className="app-eyebrow">Progress worth noticing</p><h2 className="mt-1 text-xl font-semibold">{records.length === 1 ? 'A new personal record' : `${records.length} new personal records`}</h2></div>
      <button ref={closeRef} type="button" aria-label="Close records" onClick={onDismiss} className="app-secondary min-w-11">×</button>
    </div>
    <ul className="mt-4 divide-y divide-[var(--line)]">
      {records.map((pr, index) => <li key={`${pr.exercise}-${pr.prType}-${index}`} className="py-3">
        <p className="font-semibold">{pr.exercise}</p>
        <p className="app-muted text-sm">{labels[pr.prType]}</p>
        <p className="app-muted mt-1 text-sm">{formatPRValue(pr.prType, pr.previousBest)} → <span className="font-semibold text-[var(--accent)]">{formatPRValue(pr.prType, pr.newRecord)}</span></p>
        <p className="mt-1 text-sm">{pr.improvement}</p>
      </li>)}
    </ul>
    <Link href="/pr-history" onClick={onDismiss} className="app-secondary mt-3 w-full">View records</Link>
  </section>
}
