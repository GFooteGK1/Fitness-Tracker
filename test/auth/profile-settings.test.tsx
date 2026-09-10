// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { updateProfile, profile } = vi.hoisted(() => ({ updateProfile: vi.fn(), profile: { userId: 'test', fitnessGoals: ['performance'], activityLevel: 'moderately_active', bodyMetrics: { age: 30, weight_kg: 80 }, preferences: { units: 'metric', notifications: true, privacy_level: 'private' } } }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { email: 'test@example.com' }, profile, updateProfile }) }))
vi.mock('@/app/components/auth/ProtectedRoute', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/components/whoop/WhoopConnectionSettings', () => ({ WhoopConnectionSettings: () => <div>WHOOP connection</div> }))
import ProfilePage from '@/app/profile/page'

describe('profile drafts', () => {
  beforeEach(() => updateProfile.mockReset())
  afterEach(cleanup)
  it('does not save on opening or canceling and keeps one units control', () => {
    render(<ProfilePage />)
    expect(screen.queryByLabelText('Measurement units')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit measurements and units' }))
    expect(screen.getAllByLabelText('Measurement units')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: '82' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(updateProfile).not.toHaveBeenCalled()
  })
  it('retains a failed draft and can retry the exact changes', async () => {
    updateProfile.mockRejectedValueOnce(new Error('Save unavailable')).mockResolvedValueOnce(profile)
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit measurements and units' }))
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: '82' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable')
    expect(screen.getByLabelText(/Weight/)).toHaveValue(82)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes saved'))
    expect(updateProfile).toHaveBeenLastCalledWith({ bodyMetrics: { age: 30, weight_kg: 82 }, preferences: profile.preferences })
  })
})
