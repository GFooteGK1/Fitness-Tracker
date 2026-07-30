// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConditionalNavigation from '@/app/components/ConditionalNavigation'

const navigationMocks = vi.hoisted(() => ({
  pathname: '/dashboard',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
}))

vi.mock('@/app/components/Navigation', () => ({
  default: () => <nav>Global navigation</nav>,
}))

describe('ConditionalNavigation', () => {
  beforeEach(() => {
    navigationMocks.pathname = '/dashboard'
  })

  it.each(['/coach', '/v2'])('lets the conversational surface own navigation at %s', (pathname) => {
    navigationMocks.pathname = pathname

    render(<ConditionalNavigation><div>Conversation</div></ConditionalNavigation>)

    expect(screen.getByText('Conversation')).toBeInTheDocument()
    expect(screen.queryByText('Global navigation')).not.toBeInTheDocument()
  })

  it('retains global navigation on persistent app views', () => {
    render(<ConditionalNavigation><div>Dashboard</div></ConditionalNavigation>)

    expect(screen.getByText('Global navigation')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
