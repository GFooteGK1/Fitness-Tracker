// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { programReturnPath, signInProgramDestination } from '@/app/lib/auth/program-return'

const mocks = vi.hoisted(() => ({ push: vi.fn(), signIn: vi.fn(), auth: {
  user: null as null | { id: string }, loading: false, hasCompletedOnboarding: true, profileStatus: 'ready'
} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ ...mocks.auth, signIn: mocks.signIn }) }))
vi.mock('@/app/components/auth/AuthLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import SignInPage from '@/app/auth/signin/page'
import SignInForm from '@/app/components/auth/SignInForm'

describe('programming sign-in resume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks.auth, { user: null, loading: false, hasCompletedOnboarding: true, profileStatus: 'ready' })
    window.history.replaceState({}, '', '/')
  })
  afterEach(cleanup)
  it.each(['/program', '/program/first-reviewed', '/program/supervised', '/program/reviewed/plans/00000000-0000-4000-8000-000000000001', '/program/reviewed/00000000-0000-4000-8000-000000000001', '/program/first-reviewed?recommendationId=abc#setup'])(
    'preserves the explicit programming path %s', path => expect(programReturnPath(path)).toBe(path))
  it.each([null, '', 'https://evil.example/program', '//evil.example/program', '/\\evil.example/program', '/programming',
    '/auth/signin', '/dashboard', '/program/reviewed', '/program/reviewed/a/b', '/program/reviewed/plans', '/program/reviewed/program-1', '/program/../auth/signin', '/program/%2e%2e/first-reviewed', '/program/%2Ffirst-reviewed',
    '/program/first-reviewed\n', '/program/first-reviewed/../supervised', '/program/first-reviewed:evil', '/program//supervised', '/program/' + 'a'.repeat(1024)])(
    'rejects an unsafe or unlisted target %s', path => {
      expect(programReturnPath(path)).toBeNull()
      expect(signInProgramDestination(`?returnTo=${encodeURIComponent(path ?? '')}`)).toBe('/dashboard')
    })
  it('captures a protected programming destination without rendering private content', () => {
    window.history.replaceState({}, '', '/program/first-reviewed?recommendationId=abc')
    render(<ProtectedRoute><p>Private program</p></ProtectedRoute>)
    expect(screen.queryByText('Private program')).toBeNull()
    expect(mocks.push).toHaveBeenCalledWith('/auth/signin?returnTo=%2Fprogram%2Ffirst-reviewed%3FrecommendationId%3Dabc')
  })
  it('keeps unrelated protected pages on the default sign-in path', () => {
    window.history.replaceState({}, '', '/dashboard')
    render(<ProtectedRoute><p>Private</p></ProtectedRoute>)
    expect(mocks.push).toHaveBeenCalledWith('/auth/signin')
  })
  it.each(['ready', 'error'])('resumes the page once authenticated with profile status %s', profileStatus => {
    window.history.replaceState({}, '', '/auth/signin?returnTo=%2Fprogram%2Ffirst-reviewed')
    Object.assign(mocks.auth, { user: { id: 'athlete-1' }, profileStatus })
    render(<SignInPage />)
    expect(mocks.push).toHaveBeenCalledWith('/program/first-reviewed')
  })
  it('waits for profile state and gives onboarding precedence over resume', () => {
    window.history.replaceState({}, '', '/auth/signin?returnTo=%2Fprogram%2Ffirst-reviewed')
    Object.assign(mocks.auth, { user: { id: 'athlete-1' }, profileStatus: 'loading', hasCompletedOnboarding: false })
    const { rerender } = render(<SignInPage />)
    expect(mocks.push).not.toHaveBeenCalled()
    mocks.auth.profileStatus = 'ready'
    rerender(<SignInPage />)
    expect(mocks.push).toHaveBeenCalledWith('/onboarding')
    expect(mocks.push).not.toHaveBeenCalledWith('/program/first-reviewed')
  })
  it('does not race the page redirect when the form finishes signing in', async () => {
    mocks.signIn.mockResolvedValue(undefined)
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'athlete@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only-password' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }).closest('form')!)
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledOnce())
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
