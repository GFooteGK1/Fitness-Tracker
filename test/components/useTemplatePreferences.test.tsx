// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useTemplatePreferences } from '@/app/components/useTemplatePreferences'
const auth = vi.hoisted(() => ({ user: { id: 'one' } as { id: string } | null }))
vi.mock('@/app/lib/auth/AuthContext', () => ({ useAuth: () => auth }))
beforeEach(() => { localStorage.clear(); auth.user = { id: 'one' } })
it('keeps favorites and draft weights isolated across accounts', () => {
  const { result, rerender } = renderHook(() => useTemplatePreferences())
  act(() => result.current.toggleFavorite('fran'))
  act(() => result.current.rememberDraft('fran', { Thruster: '65 lb' }))
  expect(result.current.favorites).toEqual(['fran'])
  auth.user = { id: 'two' }; rerender()
  expect(result.current.favorites).toEqual([])
  expect(result.current.weights).toEqual({})
  auth.user = { id: 'one' }; rerender()
  expect(result.current.weights.fran).toEqual({ Thruster: '65 lb' })
  act(() => result.current.rememberDraft('fran', {}))
  expect(result.current.recent).toEqual(['fran'])
  expect(result.current.weights.fran).toEqual({})
})
it('tolerates corrupt optional storage without preventing template use', () => {
  localStorage.setItem('sociusfit:templates:one', '{invalid')
  const { result } = renderHook(() => useTemplatePreferences())
  expect(result.current.favorites).toEqual([])
  act(() => result.current.toggleFavorite('grace'))
  expect(result.current.favorites).toEqual(['grace'])
})
it('does not retain another account preferences on sign out', () => {
  const { result, rerender } = renderHook(() => useTemplatePreferences())
  act(() => result.current.toggleFavorite('fran'))
  auth.user = null; rerender()
  expect(result.current.favorites).toEqual([])
  act(() => result.current.toggleFavorite('grace'))
  expect(result.current.favorites).toEqual([])
})
