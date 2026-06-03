'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'

export default function JoinLeaderboardPage() {
  return (
    <Suspense fallback={<JoinLeaderboardLoading />}>
      <JoinLeaderboardContent />
    </Suspense>
  )
}

function JoinLeaderboardLoading() {
  return (
    <ProtectedRoute>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
          Join a Leaderboard
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
          Loading...
        </div>
      </div>
    </ProtectedRoute>
  )
}

function JoinLeaderboardContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const codeFromUrl = searchParams.get('code') || ''

  const [inviteCode, setInviteCode] = useState(codeFromUrl)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ groupName: string; groupId: string } | null>(null)

  useEffect(() => {
    if (codeFromUrl) {
      setInviteCode(codeFromUrl.toUpperCase())
    }
  }, [codeFromUrl])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/leaderboard/groups/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_code: inviteCode.trim(),
          display_name: displayName.trim()
        })
      })
      const data = await res.json()

      if (res.ok) {
        setSuccess({ groupName: data.group.name, groupId: data.group.id })
      } else {
        setError(data.error || 'Failed to join group')
      }
    } catch {
      setError('Failed to join group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">
          Join a Leaderboard
        </h1>

        {success ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
              You&apos;re in!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You&apos;ve joined <span className="font-semibold">{success.groupName}</span>. Time to compete!
            </p>
            <button
              onClick={() => router.push(`/leaderboards/${success.groupId}`)}
              className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
            >
              View Leaderboard
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  maxLength={8}
                  className="w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase tracking-widest font-mono text-xl text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="How you want to appear on the board"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !inviteCode.trim()}
                className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 font-medium"
              >
                {loading ? 'Joining...' : 'Join Group'}
              </button>
            </form>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
