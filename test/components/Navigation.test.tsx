// @vitest-environment jsdom
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import Navigation from '@/app/components/Navigation'
const state = vi.hoisted(() => ({ pathname: '/dashboard', user: { id: 'user' } as { id: string } | null }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => ({ loading: false, user: state.user }) }))
vi.mock('@/app/components/UserMenu', () => ({ default: () => <button>User menu</button> }))
describe('Navigation', () => {
  it('provides five mobile destinations with Today selected', () => {
    state.pathname = '/dashboard'; state.user = { id: 'user' }
    render(<Navigation />)
    const nav = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
    expect(nav.getAllByRole('link').map(link => link.textContent)).toEqual(['Today', 'Plan', 'Log', 'Progress', 'Coach'])
    expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Log' })).toHaveAttribute('href', '/capture')
  })
  it('keeps Progress selected for nutrition and links to its history destination', () => {
    state.pathname = '/food-progress'; state.user = { id: 'user' }
    render(<Navigation />)
    const nav = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
    expect(nav.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/progress')
  })
  it('does not show authenticated navigation when signed out', () => {
    state.user = null
    render(<Navigation />)
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SociusFit.' })).toHaveAttribute('href', '/')
    state.user = { id: 'user' }
  })
})
