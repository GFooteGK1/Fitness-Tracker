// @vitest-environment jsdom
import { beforeEach, it, expect } from 'vitest'
import { hasUnreconciledCapture, markCaptureCertainty, mayPublishRecommendation, recoverPendingCaptures } from '@/app/lib/client/capture-uncertainty'
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
it('separates account-owned unknown saves from retained confirmed replay identities', () => {
  const key = 'socius-pending:a:/api/parse-workout'
  sessionStorage.setItem(key, '{}')
  expect(hasUnreconciledCapture('a')).toBe(true); expect(hasUnreconciledCapture('b')).toBe(false)
  markCaptureCertainty('a', key, true)
  expect(sessionStorage.getItem(key)).toBe('{}'); expect(hasUnreconciledCapture('a')).toBe(false)
  markCaptureCertainty('a', key, false)
  expect(hasUnreconciledCapture('a')).toBe(true)
})
it('blocks an attempted photo across reload storage independently of its queue bytes', () => {
  expect(hasUnreconciledCapture('a')).toBe(false) // Unattempted queued data does not set a marker.
  markCaptureCertainty('a', 'photo:request', false)
  expect(hasUnreconciledCapture('a')).toBe(true)
  markCaptureCertainty('a', 'photo:request', true)
  expect(hasUnreconciledCapture('a')).toBe(false)
})
it('fails closed when device proof cannot be read and gates otherwise-ready advice', () => {
  const storage = { get length(): number { throw new Error('unavailable') }, key: () => null, getItem: () => null }
  expect(hasUnreconciledCapture('a', storage, storage)).toBe(true)
  expect(mayPublishRecommendation({ captureNeedsReconciliation: true, serverStatus: 'ready' })).toBe(false)
  expect(mayPublishRecommendation({ captureNeedsReconciliation: false, serverStatus: 'pending' })).toBe(false)
  expect(mayPublishRecommendation({ captureNeedsReconciliation: false, serverStatus: 'ready' })).toBe(true)
})
it('restores an owned request identity after tab loss without persisting raw create text or photo bytes', () => {
  const key = 'socius-pending:a:/api/meals/parse-text'
  sessionStorage.setItem(key, JSON.stringify({ requestId: 'original-request', json: '{"text":"private raw input"}', photoHash: 'bytes-hash' }))
  markCaptureCertainty('a', key, false)
  sessionStorage.clear()
  expect(hasUnreconciledCapture('a')).toBe(true)
  recoverPendingCaptures('b'); expect(sessionStorage.length).toBe(0)
  recoverPendingCaptures('a')
  expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ requestId: 'original-request' })
  expect(JSON.stringify(localStorage)).not.toContain('private raw input')
})
it('a second tab confirming the same surface cannot clear a different unknown request', () => {
  const key = 'socius-pending:a:/api/meals/parse-text'
  sessionStorage.setItem(key, JSON.stringify({ requestId: 'request-a' })); markCaptureCertainty('a', key, false)
  sessionStorage.clear() // tab B has independent session storage, shared local markers
  sessionStorage.setItem(key, JSON.stringify({ requestId: 'request-b' })); markCaptureCertainty('a', key, false)
  markCaptureCertainty('a', key, true)
  expect(hasUnreconciledCapture('a')).toBe(true)
  recoverPendingCaptures('a')
  expect(JSON.parse(sessionStorage.getItem(`${key}:request:request-a`)!)).toEqual({ requestId: 'request-a' })
  markCaptureCertainty('a', `${key}:request:request-a`, true)
  expect(hasUnreconciledCapture('a')).toBe(false)
})
