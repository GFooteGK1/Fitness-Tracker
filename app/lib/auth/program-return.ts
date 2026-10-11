/** Only programming pages may opt into sign-in resume. This grants no access. */
export function programReturnPath(value: string | null): string | null {
  if (!value || value.length > 1024 || /[\\\s]/.test(value)) return null
  try {
    const url = new URL(value, 'https://socius.invalid')
    if (!value.startsWith('/') || value.startsWith('//') || url.origin !== 'https://socius.invalid') return null
    // Reject encoded paths and dot normalization rather than accepting alternate spellings.
    const rawPath = value.split(/[?#]/)[0]
    if (rawPath !== url.pathname || rawPath.includes('%')) return null
    if (!/^\/program(?:\/(?:first-reviewed|supervised)|\/reviewed\/(?:plans\/)?[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})?$/.test(rawPath)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}

export function signInProgramDestination(search: string): string {
  return programReturnPath(new URLSearchParams(search).get('returnTo')) ?? '/dashboard'
}
