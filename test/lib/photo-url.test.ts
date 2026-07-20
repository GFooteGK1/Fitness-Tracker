/**
 * Tests for the SSRF photo-host guard used by /api/meals/analyze.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isAllowedPhotoHost, resolveAnalysisUrl } from '../../app/lib/photo-url'

afterEach(() => vi.unstubAllEnvs())

describe('isAllowedPhotoHost', () => {
  it('allows the configured Supabase project host', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auolnfwetmfcwhtvakzy.supabase.co')
    expect(isAllowedPhotoHost('https://auolnfwetmfcwhtvakzy.supabase.co/storage/v1/object/sign/meal-photos/x.jpg?token=z')).toBe(true)
  })

  it('allows any *.supabase.co host as a fallback', () => {
    expect(isAllowedPhotoHost('https://otherref.supabase.co/storage/x.jpg')).toBe(true)
  })

  it('rejects arbitrary/internal hosts (SSRF targets)', () => {
    expect(isAllowedPhotoHost('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isAllowedPhotoHost('http://localhost:3000/api/secret')).toBe(false)
    expect(isAllowedPhotoHost('https://evil.example.com/x.jpg')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isAllowedPhotoHost('not a url')).toBe(false)
    expect(isAllowedPhotoHost('')).toBe(false)
  })
})

describe('resolveAnalysisUrl', () => {
  it('prefers the server-stored URL over the client URL', () => {
    expect(resolveAnalysisUrl('https://ref.supabase.co/stored.jpg', 'https://evil.com/x.jpg')).toBe(
      'https://ref.supabase.co/stored.jpg'
    )
  })

  it('falls back to an allowlisted client URL when nothing is stored', () => {
    expect(resolveAnalysisUrl(null, 'https://ref.supabase.co/client.jpg')).toBe('https://ref.supabase.co/client.jpg')
  })

  it('returns null for a non-allowlisted client URL with nothing stored', () => {
    expect(resolveAnalysisUrl(null, 'https://evil.com/x.jpg')).toBeNull()
  })

  it('returns null when there is no URL at all', () => {
    expect(resolveAnalysisUrl(null, null)).toBeNull()
  })
})
