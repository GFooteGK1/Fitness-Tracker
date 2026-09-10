'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { getLocalDate } from '@/app/lib/timezone-utils'
import type { CoachRuntimeContext } from '@/app/lib/coach/types'

export function TodayPlan() {
  const { user } = useAuth()
  const [context, setContext] = useState<CoachRuntimeContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    setLoading(true)
    setContext(null)
    setError(false)
    void fetch('/api/coach', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Plan unavailable')
      const body = await response.json()
      if (!body.context) throw new Error('Plan unavailable')
      if (!controller.signal.aborted) setContext(body.context)
    }).catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [user, attempt])

  if (loading) return <section className="app-panel p-6" role="status"><p className="app-eyebrow">Today’s plan</p><p className="app-muted mt-3">Loading your accepted plan…</p></section>
  if (error || !context?.storageAvailable) return <section className="app-panel p-6"><h2 className="text-lg font-semibold">Your plan is unavailable</h2><p className="app-muted mt-2">You can still log a workout or meal.</p><button className="app-secondary mt-4" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>

  const today = getLocalDate()
  const program = context.activeProgram
  const sessions = program?.upcomingSessions.filter(session => session.scheduledDate === today) ?? []
  const session = sessions.find(item => item.status === 'planned') ?? sessions[0]
  const title = session
    ? typeof session.prescription.title === 'string' ? session.prescription.title
      : typeof session.prescription.session_title === 'string' ? session.prescription.session_title : 'Your planned session'
    : program ? 'No session scheduled today' : 'Build your training plan'
  const minutes = session?.prescription.scheduledMinutes
  return <section className="app-panel p-6 sm:p-7" aria-label="Today's plan">
    <div className="flex items-center justify-between gap-3"><p className="app-eyebrow">Today’s plan</p>{session && <span className="app-badge">{session.status === 'completed' ? 'Completed' : session.status === 'skipped' ? 'Skipped' : 'Planned'}</span>}</div>
    <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
    <p className="app-muted mt-2 text-sm">{session ? `${program?.title}${typeof minutes === 'number' ? ` · ${minutes} min` : ''}` : program ? 'Open your plan to review its dates and next steps.' : 'Set a goal and review a week that fits your life.'}</p>
    <Link href="/program" className={`${session?.status === 'planned' || !program ? 'app-primary' : 'app-secondary'} mt-5`}>{session?.status === 'planned' ? 'Open workout' : program ? 'View plan' : 'Set up my plan'}<span aria-hidden="true"> →</span></Link>
    {sessions.length > 1 && <p className="app-muted mt-3 text-sm">{sessions.length} sessions on your plan today</p>}
  </section>
}
