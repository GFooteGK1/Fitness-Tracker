// @vitest-environment jsdom
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import Navigation from '@/app/components/Navigation'

vi.mock('@/app/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    loading: false,
    user: { email: 'greg@example.com' },
  }),
}))

vi.mock('@/app/components/UserMenu', () => ({
  default: () => <button type="button">User menu</button>,
}))

describe('Navigation', () => {
  it('keeps the mobile shortcut row within the viewport without Board or PR links', () => {
    render(<Navigation />)

    const mobileNavigation = screen.getByRole('group', { name: 'Mobile navigation' })
    const mobileLinks = within(mobileNavigation).getAllByRole('link')

    expect(mobileNavigation).toHaveClass('grid', 'grid-cols-6')
    expect(mobileLinks.map((link) => link.textContent?.trim())).toEqual([
      '📊Dashboard',
      '💪Program',
      '📋WODs',
      '📝Log',
      '🍽️Food',
      '💬Coach',
    ])
    expect(mobileLinks[5]).toHaveAttribute('href', '/coach')
    expect(within(mobileNavigation).queryByRole('link', { name: 'Board' })).not.toBeInTheDocument()
    expect(within(mobileNavigation).queryByRole('link', { name: 'PRs' })).not.toBeInTheDocument()
  })

  it('retains leaderboard and PR access in desktop navigation', () => {
    render(<Navigation />)

    expect(screen.getAllByRole('link', { name: 'Coach' })[0]).toHaveAttribute('href', '/coach')
    expect(screen.getByRole('link', { name: 'Leaderboards' })).toHaveAttribute('href', '/leaderboards')
    expect(screen.getAllByRole('link', { name: 'PRs' })).toHaveLength(1)
  })
})
