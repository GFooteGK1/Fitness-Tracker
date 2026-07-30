import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}))

import QueryPage from '@/app/query/page'

describe('legacy Query page', () => {
  beforeEach(() => {
    navigationMocks.redirect.mockReset()
  })

  it('redirects old links to the canonical Coach destination', () => {
    QueryPage()

    expect(navigationMocks.redirect).toHaveBeenCalledWith('/coach')
  })
})
