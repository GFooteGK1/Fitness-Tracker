'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import {
  GroupDetail,
  RankingEntry,
  RankingMetric,
  RankingPeriod,
  GroupExercise,
  PrivacyLevel
} from '@/app/lib/types/leaderboard'

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' }
]

const METRICS: { value: RankingMetric; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'reps', label: 'Reps' },
  { value: 'volume', label: 'Volume' },
  { value: 'time', label: 'Time' }
]

const PRIVACY_OPTIONS: { value: PrivacyLevel; label: string; desc: string }[] = [
  { value: 'all', label: 'Share All', desc: 'All workouts visible to group' },
  { value: 'benchmarks', label: 'Benchmarks Only', desc: 'Only named WODs and lifts' },
  { value: 'manual', label: 'Manual', desc: 'Nothing shared automatically' }
]

export default function LeaderboardDetailPage() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const groupId = params.id as string

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [exercises, setExercises] = useState<GroupExercise[]>([])
  const [rankings, setRankings] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [rankingsLoading, setRankingsLoading] = useState(false)
  const [error, setError] = useState('')
  const [exercise, setExercise] = useState('')
  const [period, setPeriod] = useState<RankingPeriod>('all')
  const [metric, setMetric] = useState<RankingMetric>('weight')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('all')
  const [displayName, setDisplayName] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  useEffect(() => {
    if (user && groupId) {
      fetchGroup()
      fetchExercises()
    }
  }, [user, groupId])

  const fetchRankings = useCallback(async (ex: string, p: RankingPeriod, m: RankingMetric) => {
    if (!ex) return
    setRankingsLoading(true)
    try {
      const res = await fetch(
        `/api/leaderboard/groups/${groupId}/rankings?exercise=${encodeURIComponent(ex)}&period=${p}&metric=${m}`
      )
      const data = await res.json()
      if (res.ok) {
        setRankings(data.rankings || [])
      } else {
        setError(data.error || 'Failed to load rankings')
      }
    } catch {
      setError('Failed to load rankings')
    } finally {
      setRankingsLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    if (exercise) {
      fetchRankings(exercise, period, metric)
    }
  }, [exercise, period, metric, fetchRankings])

  async function fetchGroup() {
    try {
      setLoading(true)
      const res = await fetch(`/api/leaderboard/groups/${groupId}`)
      const data = await res.json()
      if (res.ok) {
        setGroup(data)
        // Find current user's membership for privacy settings
        const myMembership = data.members?.find((m: { user_id: string }) => m.user_id === user?.id)
        if (myMembership) {
          setDisplayName(myMembership.display_name || '')
        }
      } else {
        setError(data.error || 'Failed to load group')
      }
    } catch {
      setError('Failed to load group')
    } finally {
      setLoading(false)
    }
  }

  async function fetchExercises() {
    try {
      const res = await fetch(`/api/leaderboard/groups/${groupId}/exercises`)
      const data = await res.json()
      if (res.ok && data.exercises?.length > 0) {
        setExercises(data.exercises)
        // Auto-select the most popular exercise
        setExercise(data.exercises[0].name)
      }
    } catch {
      // Non-critical, ignore
    }
  }

  async function copyInviteCode() {
    if (!group) return
    const inviteUrl = `${window.location.origin}/leaderboards/join?code=${group.invite_code}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: copy just the code
      await navigator.clipboard.writeText(group.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/leaderboard/groups/${groupId}/privacy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy_level: privacyLevel, display_name: displayName })
      })
      if (res.ok) {
        setShowSettings(false)
        fetchGroup()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to save settings')
      }
    } catch {
      setError('Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleLeave() {
    try {
      const res = await fetch(`/api/leaderboard/groups/${groupId}/leave`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/leaderboards')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to leave group')
      }
    } catch {
      setError('Failed to leave group')
    }
    setShowLeaveConfirm(false)
  }

  return (
    <ProtectedRoute>
      <div>
        {/* Back link */}
        <Link
          href="/leaderboards"
          className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Leaderboards
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {group && !loading && (
          <>
            {/* Group Header */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{group.name}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMembers(!showMembers)}
                    className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Members
                  </button>
                  <button
                    onClick={copyInviteCode}
                    className="px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Share Invite'}
                  </button>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Settings
                  </button>
                </div>
              </div>

              {/* Invite Code Display */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Invite Code:</span>
                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono tracking-widest text-gray-800 dark:text-gray-200">
                  {group.invite_code}
                </code>
              </div>

              {/* Members Panel */}
              {showMembers && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Members</h3>
                  <div className="space-y-2">
                    {group.members?.map(member => (
                      <div key={member.user_id} className="flex items-center justify-between py-1">
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {member.display_name}
                          {member.is_creator && (
                            <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                              Creator
                            </span>
                          )}
                          {member.user_id === user?.id && (
                            <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                              You
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings Panel */}
              {showSettings && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      maxLength={50}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Privacy — What Workouts to Share
                    </label>
                    <div className="space-y-2">
                      {PRIVACY_OPTIONS.map(opt => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            privacyLevel === opt.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        >
                          <input
                            type="radio"
                            name="privacy"
                            checked={privacyLevel === opt.value}
                            onChange={() => setPrivacyLevel(opt.value)}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {savingSettings ? 'Saving...' : 'Save Settings'}
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(true)}
                      className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors"
                    >
                      Leave Group
                    </button>
                  </div>
                </div>
              )}

              {/* Leave confirmation */}
              {showLeaveConfirm && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                    Are you sure you want to leave this group? Your rankings will be removed.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleLeave}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Leave Group
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 mb-6 space-y-4">
              {/* Exercise selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Exercise / WOD
                </label>
                <select
                  value={exercise}
                  onChange={e => setExercise(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {exercises.length === 0 && (
                    <option value="">No exercises logged yet</option>
                  )}
                  {exercises.map(ex => (
                    <option key={ex.name} value={ex.name}>
                      {ex.name} ({ex.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Period Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Period</label>
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        period === p.value
                          ? 'bg-blue-600 dark:bg-blue-700 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Metric</label>
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                  {METRICS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setMetric(m.value)}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        metric === m.value
                          ? 'bg-blue-600 dark:bg-blue-700 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rankings */}
            {rankingsLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
              </div>
            )}

            {!rankingsLoading && rankings.length === 0 && exercise && (
              <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-3">🏋️</div>
                <p className="text-gray-500 dark:text-gray-400">
                  No rankings yet for {exercise}. Log some workouts to get on the board!
                </p>
              </div>
            )}

            {!rankingsLoading && rankings.length > 0 && (
              <div className="space-y-3">
                {/* Podium — Top 3 */}
                {rankings.length >= 1 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-center items-end gap-4 mb-6">
                      {/* 2nd Place */}
                      {rankings.length >= 2 && (
                        <PodiumSpot
                          entry={rankings.find(r => r.rank === 2)!}
                          medal="🥈"
                          height="h-20"
                          bgColor="bg-gray-100 dark:bg-gray-700"
                          borderColor="border-gray-300 dark:border-gray-600"
                        />
                      )}
                      {/* 1st Place */}
                      <PodiumSpot
                        entry={rankings[0]}
                        medal="🥇"
                        height="h-28"
                        bgColor="bg-yellow-50 dark:bg-yellow-900/20"
                        borderColor="border-yellow-300 dark:border-yellow-700"
                      />
                      {/* 3rd Place */}
                      {rankings.length >= 3 && (
                        <PodiumSpot
                          entry={rankings.find(r => r.rank === 3)!}
                          medal="🥉"
                          height="h-16"
                          bgColor="bg-orange-50 dark:bg-orange-900/20"
                          borderColor="border-orange-300 dark:border-orange-800"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Full Rankings Table */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <th className="px-4 py-3 w-12">#</th>
                        <th className="px-4 py-3">Athlete</th>
                        <th className="px-4 py-3 text-right">Score</th>
                        <th className="px-4 py-3 text-right hidden sm:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {rankings.map((entry, i) => (
                        <tr
                          key={`${entry.user_id}-${i}`}
                          className={`${
                            entry.is_current_user
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : ''
                          } hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                        >
                          <td className="px-4 py-3">
                            <span className={`text-sm font-bold ${
                              entry.rank === 1 ? 'text-yellow-600 dark:text-yellow-400' :
                              entry.rank === 2 ? 'text-gray-500 dark:text-gray-400' :
                              entry.rank === 3 ? 'text-orange-600 dark:text-orange-400' :
                              'text-gray-400 dark:text-gray-500'
                            }`}>
                              {entry.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${
                              entry.is_current_user
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {entry.user_display_name}
                              {entry.is_current_user && (
                                <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">(you)</span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {entry.value_display}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(entry.date_achieved).toLocaleDateString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  )
}

function PodiumSpot({
  entry,
  medal,
  height,
  bgColor,
  borderColor
}: {
  entry: RankingEntry
  medal: string
  height: string
  bgColor: string
  borderColor: string
}) {
  if (!entry) return null

  return (
    <div className="flex flex-col items-center w-28">
      <div className="text-2xl mb-1">{medal}</div>
      <div className={`text-xs font-medium text-center mb-2 ${
        entry.is_current_user ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
      } truncate w-full`}>
        {entry.user_display_name}
      </div>
      <div className={`${height} w-full ${bgColor} rounded-t-lg border-2 ${borderColor} flex items-center justify-center`}>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{entry.value_display}</span>
      </div>
    </div>
  )
}
