'use client'

import React from 'react'
import type { RecentInsight, InsightPriority, BenchmarkPR } from '@/app/lib/agents/types'

// ─── Tab type ────────────────────────────────────────────────────────

export type TabId = 'chat' | 'insights' | 'prs'

// ─── Insight sorting (exported for Property 24 testing) ──────────────

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  urgent: 0,
  notable: 1,
  informational: 2,
}

export function sortInsights(insights: RecentInsight[]): RecentInsight[] {
  return [...insights].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    // Same priority: newest first (descending created_at)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// ─── Priority styling ────────────────────────────────────────────────

function getPriorityStyle(priority: InsightPriority) {
  switch (priority) {
    case 'urgent':
      return { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', label: 'Urgent' }
    case 'notable':
      return { dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30', label: 'Notable' }
    case 'informational':
      return { dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', label: 'Info' }
  }
}

// ─── PR grouping helper ──────────────────────────────────────────────

function groupPRsByBenchmark(prs: BenchmarkPR[]): Record<string, BenchmarkPR[]> {
  const groups: Record<string, BenchmarkPR[]> = {}
  for (const pr of prs) {
    if (!groups[pr.benchmark_name]) {
      groups[pr.benchmark_name] = []
    }
    groups[pr.benchmark_name].push(pr)
  }
  // Sort each group by date descending (most recent first)
  for (const name of Object.keys(groups)) {
    groups[name].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
  return groups
}

// ─── Props ───────────────────────────────────────────────────────────

export interface BottomNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  insights: RecentInsight[]
  prs: BenchmarkPR[]
}

// ─── Tab config ──────────────────────────────────────────────────────

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'insights', icon: '💡', label: 'Insights' },
  { id: 'prs', icon: '🏆', label: 'PRs' },
]

// ─── Component ───────────────────────────────────────────────────────

export default function BottomNav({ activeTab, onTabChange, insights, prs }: BottomNavProps) {
  return (
    <>
      {/* Tab content: Insights or PRs */}
      {activeTab === 'insights' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4" data-testid="insights-panel">
          {insights.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <p className="text-center text-base">No insights yet. Keep logging to unlock patterns.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortInsights(insights).map((insight) => {
                const style = getPriorityStyle(insight.priority)
                return (
                  <div
                    key={insight.id}
                    className={`rounded-lg ${style.bg} p-4`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} aria-hidden="true" />
                      <span className={`text-xs font-semibold uppercase ${style.text}`}>{style.label}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                        {new Date(insight.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{insight.content}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'prs' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4" data-testid="prs-panel">
          {prs.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <p className="text-center text-base">No PRs recorded yet. Hit a benchmark workout!</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(groupPRsByBenchmark(prs)).map(([name, records]) => (
                <div key={name}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{name}</h3>
                  <div className="space-y-2">
                    {records.map((pr, idx) => (
                      <div
                        key={`${pr.benchmark_name}-${pr.date}-${idx}`}
                        className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-800 px-4 py-3"
                      >
                        <div>
                          <span className="text-base font-medium text-gray-900 dark:text-gray-100">{pr.score_display}</span>
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{pr.rx_status}</span>
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{pr.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav
        className="flex items-center justify-around bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
        aria-label="Main navigation"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-4 py-2 transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 border-t-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-400 dark:text-gray-500 border-t-2 border-transparent'
              }`}
              style={{ touchAction: 'manipulation' }}
              aria-label={`${tab.label} tab`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-lg" aria-hidden="true">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
