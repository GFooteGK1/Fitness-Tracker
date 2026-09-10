'use client'

import React from 'react'
import Link from 'next/link'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { TodayPlan } from '@/app/components/TodayPlan'
import { WhoopMetricsCard } from '@/app/components/whoop/WhoopMetricsCard'
import DashboardNarrative from '@/app/components/DashboardNarrative'
import { AppIcon } from '@/app/components/AppIcon'

export default function Dashboard() {
  return <ProtectedRoute><div className="mx-auto max-w-2xl space-y-5">
    <header className="py-2"><p className="app-eyebrow">A little context. A clear next step.</p><h1 className="app-title">Your day, at a glance.</h1></header>
    <TodayPlan />
    <section aria-labelledby="quick-log-heading" className="app-panel p-5">
      <h2 id="quick-log-heading" className="mb-4 font-semibold">Quick log</h2>
      <div className="grid grid-cols-3 gap-3">
        <Link className="app-quick-action" href="/food-progress?view=camera&input=photo"><AppIcon name="camera" />Photo<span className="app-muted text-xs">Meal</span></Link>
        <Link className="app-quick-action" href="/food-progress?view=camera&input=voice"><AppIcon name="microphone" />Speak<span className="app-muted text-xs">Meal</span></Link>
        <Link className="app-quick-action" href="/food-progress?view=camera&input=recent"><AppIcon name="recent" />Recent<span className="app-muted text-xs">Meals</span></Link>
      </div>
      <Link href="/log" className="mt-3 flex min-h-11 items-center justify-between text-sm font-medium">Log another workout <span aria-hidden="true">→</span></Link>
    </section>
    <WhoopMetricsCard compact />
    <DashboardNarrative />
    <section className="app-panel divide-y divide-[var(--line)] px-5" aria-label="Explore your progress">
      <Link className="flex min-h-16 items-center justify-between gap-3 py-4" href="/food-progress"><span>Nutrition today</span><span className="app-muted text-sm">Meals & targets →</span></Link>
      <Link className="flex min-h-16 items-center justify-between gap-3 py-4" href="/progress"><span>Your progress</span><span className="app-muted text-sm">Trends & records →</span></Link>
    </section>
  </div></ProtectedRoute>
}
