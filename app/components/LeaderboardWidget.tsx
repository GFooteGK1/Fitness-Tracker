'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import { LeaderboardWidgetData } from '@/app/lib/types/leaderboard'

export default function LeaderboardWidget() {
  const { user } = useAuth()
  const [widget, setWidget] = useState<LeaderboardWidgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchWidget()
  }, [user])

  async function fetchWidget() {
    try {
      const res = await fetch('/api/leaderboard/widget')
      const data = await res.json()
      if (res.ok) {
        setWidget(data.widget)
      }
    } catch {
      // Widget is non-critical, fail silently
    } finally {
      setLoading(false)
    }
  }

  if (loading || !widget) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          🏆 Leaderboard
        </h2>
        <Link
          href="/leaderboards"
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          View All
        </Link>
      </div>
      <Link
        href={`/leaderboards/${widget.group_id}`}
        className="block hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-3 -mx-3 transition-colors"
      >
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          {widget.group_name}
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              #{widget.rank}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
              of {widget.total_members}
            </span>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {widget.exercise}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {widget.value_display}
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
