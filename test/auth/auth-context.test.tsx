// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateClient,
  mockSessionSyncService,
  mockSessionCleanupService,
  mockAuthErrorLogger,
  mockRouterPush,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockSessionSyncService: {
    initialize: vi.fn(),
    onSessionChange: vi.fn(),
    cleanup: vi.fn(),
    broadcastSessionChange: vi.fn(),
  },
  mockSessionCleanupService: {
    signOut: vi.fn(),
  },
  mockAuthErrorLogger: {
    logTokenOperationFailure: vi.fn(),
    logSignOutFailure: vi.fn(),
  },
  mockRouterPush: vi.fn(),
}))

vi.mock('@/app/lib/auth/supabase', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/app/lib/auth/session-sync-service', () => ({
  sessionSyncService: mockSessionSyncService,
}))

vi.mock('@/app/lib/auth/session-cleanup-service', () => ({
  sessionCleanupService: mockSessionCleanupService,
}))

vi.mock('@/app/lib/auth/auth-error-logger', () => ({
  authErrorLogger: mockAuthErrorLogger,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}))

import { AuthProvider, useAuth } from '@/app/lib/auth/AuthContext'
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'

const mockUser = { id: 'user-123', email: 'greg@example.com' }

const completeProfileRow = {
  user_id: mockUser.id,
  fitness_goals: ['performance'],
  activity_level: 'moderately_active',
  body_metrics: {
    height_cm: 183,
    weight_kg: 88,
    age: 40,
  },
  preferences: {
    units: 'metric',
    notifications: true,
    privacy_level: 'private',
  },
  medical_conditions: [],
  created_at: '2026-06-15T00:00:00Z',
  updated_at: '2026-06-15T00:00:00Z',
}

function AuthProbe() {
  const { loading, user, hasCompletedOnboarding, whoopConnected, profileStatus } = useAuth()

  return (
    <div>
      <div data-testid="auth-loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user-id">{user?.id ?? 'none'}</div>
      <div data-testid="onboarding">{hasCompletedOnboarding ? 'complete' : 'incomplete'}</div>
      <div data-testid="whoop">{whoopConnected ? 'connected' : 'not-connected'}</div>
      <div data-testid="profile-status">{profileStatus}</div>
    </div>
  )
}

function OnboardingProtectedProbe() {
  return (
    <ProtectedRoute requireOnboarding>
      <div data-testid="nutrition-route">nutrition-open</div>
    </ProtectedRoute>
  )
}

function ProfileUpdateProbe() {
  const { updateProfile } = useAuth()

  return (
    <button onClick={() => void updateProfile({ bodyMetrics: { height_cm: 183 } })}>
      Update Profile
    </button>
  )
}

function createSupabaseMock(profileResult: Promise<{ data: typeof completeProfileRow | null; error: null }> = Promise.resolve({
  data: completeProfileRow,
  error: null,
})) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: mockUser,
          },
        },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'user_profiles') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }).mockImplementation(() => profileResult),
          }),
        }),
      }
    }),
  }
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionSyncService.onSessionChange.mockReturnValue(undefined)
    mockCreateClient.mockReturnValue(createSupabaseMock())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('unblocks auth-gated pages even when WHOOP initialization is still pending', async () => {
    const pendingWhoopInitialize = new Promise<Response>(() => {})
    const mockFetch = vi.fn(() => pendingWhoopInitialize)
    vi.stubGlobal('fetch', mockFetch)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('user-id')).toHaveTextContent(mockUser.id)
    expect(screen.getByTestId('onboarding')).toHaveTextContent('complete')
    expect(screen.getByTestId('whoop')).toHaveTextContent('not-connected')
    expect(screen.getByTestId('profile-status')).toHaveTextContent('ready')
    expect(mockFetch).toHaveBeenCalledWith('/api/whoop/initialize', { method: 'POST' })
  })

  it('unblocks onboarding-gated nutrition routes when profile loading times out', async () => {
    const pendingProfile = new Promise<{ data: typeof completeProfileRow | null; error: null }>(() => {})
    mockCreateClient.mockReturnValue(createSupabaseMock(pendingProfile))
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/whoop/initialize') {
        return Promise.resolve(new Response(JSON.stringify({ initialized: false }), { status: 200 }))
      }

      if (url === '/api/profile') {
        return Promise.resolve(new Response(JSON.stringify({ profile: completeProfileRow }), { status: 200 }))
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })
    vi.stubGlobal('fetch', mockFetch)

    render(
      <AuthProvider>
        <AuthProbe />
        <OnboardingProtectedProbe />
        <ProfileUpdateProbe />
      </AuthProvider>
    )

    expect(screen.getByTestId('auth-loading')).toHaveTextContent('loading')

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    }, { timeout: 1000 })

    expect(screen.getByTestId('profile-status')).toHaveTextContent('error')
    expect(screen.getByTestId('nutrition-route')).toHaveTextContent('nutrition-open')
    expect(mockRouterPush).not.toHaveBeenCalledWith('/onboarding')

    fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }))

    await waitFor(() => {
      expect(screen.getByTestId('profile-status')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('onboarding')).toHaveTextContent('complete')
    expect(mockFetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PUT' }))
  })
})
