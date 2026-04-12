'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import { LeaderboardGroup } from '@/app/lib/types/leaderboard'

export default function LeaderboardsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<LeaderboardGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) fetchGroups()
  }, [user])

  async function fetchGroups() {
    try {
      setLoading(true)
      setError('')
      const res = await fetch('/api/leaderboard/groups')
      const data = await res.json()
      if (res.ok) {
        setGroups(data.groups)
      } else {
        setError(data.error || 'Failed to load groups')
      }
    } catch {
      setError('Failed to load groups')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/leaderboard/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), display_name: createDisplayName.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        setGroups(prev => [...prev, data.group])
        setShowCreate(false)
        setCreateName('')
        setCreateDisplayName('')
      } else {
        setError(data.error || 'Failed to create group')
      }
    } catch {
      setError('Failed to create group')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return

    setSubmitting(true)
    setError('')
    try {
      // First, find the group by invite code — try all known groups, but we need to search
      // We'll use a workaround: call group list API and match, or just try to join by posting to the correct endpoint
      // Since we don't have the group ID from just the code, we need an endpoint for that
      // For now, let's search through our groups first, then try a direct lookup

      const res = await fetch('/api/leaderboard/groups/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinCode.trim(), display_name: joinDisplayName.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        await fetchGroups()
        setShowJoin(false)
        setJoinCode('')
        setJoinDisplayName('')
      } else {
        setError(data.error || 'Failed to join group')
      }
    } catch {
      setError('Failed to join group')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ProtectedRoute>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Leaderboards</h1>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false) }}
              className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Join Group
            </button>
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false) }}
              className="px-4 py-2 text-sm font-medium bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
            >
              Create Group
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Create Group Form */}
        {showCreate && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Create a New Group</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="e.g., CrossFit Iron Forge"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={createDisplayName}
                  onChange={e => setCreateDisplayName(e.target.value)}
                  placeholder="How you want to appear on the board"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting || !createName.trim()}
                  className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {submitting ? 'Creating...' : 'Create Group'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Join Group Form */}
        {showJoin && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Join a Group</h2>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g., ABCD1234"
                  maxLength={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase tracking-widest font-mono text-lg text-center"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={joinDisplayName}
                  onChange={e => setJoinDisplayName(e.target.value)}
                  placeholder="How you want to appear on the board"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting || !joinCode.trim()}
                  className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {submitting ? 'Joining...' : 'Join Group'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowJoin(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && groups.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Leaderboard Groups Yet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create a group for your box or join one with an invite code to start competing.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowJoin(true)}
                className="px-6 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Join with Code
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
              >
                Create a Group
              </button>
            </div>
          </div>
        )}

        {/* Groups List */}
        {!loading && groups.length > 0 && (
          <div className="space-y-3">
            {groups.map(group => (
              <Link
                key={group.id}
                href={`/leaderboards/${group.id}`}
                className="block bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{group.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
