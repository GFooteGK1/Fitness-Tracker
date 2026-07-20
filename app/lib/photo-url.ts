/**
 * SSRF guard for server-side photo fetches.
 *
 * A route that fetches a caller-supplied URL must never hit an arbitrary host.
 * We allow only our own Supabase host (where meal photos live). Prefer a URL
 * the server already trusts (the stored photo_url) over anything from the client.
 */

/** True only if `url` points at our Supabase project host (or *.supabase.co). */
export function isAllowedPhotoHost(url: string): boolean {
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return false
  }
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (configured) {
    try {
      if (host === new URL(configured).host) return true
    } catch {
      // fall through to the suffix check
    }
  }
  return host.endsWith('.supabase.co')
}

/**
 * Choose the URL to fetch for analysis. Prefer the server-stored photo_url;
 * otherwise accept the client-supplied URL only if it passes the host allowlist.
 * Returns null when there is no safe URL to use.
 */
export function resolveAnalysisUrl(
  storedUrl: string | null | undefined,
  clientUrl: string | null | undefined
): string | null {
  if (storedUrl) return storedUrl
  if (clientUrl && isAllowedPhotoHost(clientUrl)) return clientUrl
  return null
}
