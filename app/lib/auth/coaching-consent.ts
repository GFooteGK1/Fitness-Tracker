import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CoachingContextError, contextObject } from '../coach/coaching-context'
import type { CoachingOAuthConfig } from './coaching-oauth'

// Auth v2.197.0 uses lowercase unpadded base32 SecureAlphanumeric(32) here;
// its separate internal record/owner/client IDs remain UUIDs.
const authorizationIdPattern = /^[a-z2-7]{32}$/
const scopesAllowed = new Set(['email'])
const existingSiteOrigin = 'https://fitness-tracker-gregs-projects-98860c8b.vercel.app'

/** Preserve the existing global Auth Site URL without reviewing an account on
 * its alias. Only the known alias can hand this opaque request ID to the trusted
 * configured origin; query input can never select a redirect destination. */
export function coachingConsentRequest(requestUrl: string, origin: string) {
  const url = new URL(requestUrl), params = url.searchParams
  const authorizationId = params.get('authorization_id') ?? ''
  if (url.username || url.password || url.hash || url.pathname !== '/oauth/consent'
    || [...params.keys()].some(key => key !== 'authorization_id')
    || params.getAll('authorization_id').length !== 1 || !authorizationIdPattern.test(authorizationId)) {
    throw new CoachingContextError(400, 'Invalid authorization request')
  }
  if (url.origin !== origin && url.origin !== existingSiteOrigin) throw new CoachingContextError(400, 'Invalid consent origin')
  if (url.origin === origin) return { authorizationId, redirect: undefined }
  const redirect = new URL('/oauth/consent', origin)
  redirect.searchParams.set('authorization_id', authorizationId)
  return { authorizationId, redirect: redirect.href }
}

export async function readCoachingConsent(db: SupabaseClient, authorizationId: string, config: CoachingOAuthConfig) {
  if (!authorizationIdPattern.test(authorizationId)) throw new CoachingContextError(400, 'Invalid authorization request')
  const owner = await db.auth.getUser()
  if (owner.error || !owner.data.user || owner.data.user.is_anonymous) throw new CoachingContextError(401, 'Sign in to Socius to review this connection')
  const result = await db.auth.oauth.getAuthorizationDetails(authorizationId)
  const details = result.data
  // Native Auth validates this owner's saved consent against the stored request.
  // Its documented existing-consent result has no pending metadata to recheck.
  // Trust that provider decision, not inferred client/scope/resource fields;
  // the host exchanges its code and MCP independently authorizes every data read.
  if (!result.error && contextObject(details) && Object.keys(details).length === 1
    && typeof details.redirect_url === 'string') {
    return { kind: 'redirect' as const, redirect: coachingConsentSuccessRedirect(details.redirect_url, config) }
  }
  if (result.error || !details || details.authorization_id !== authorizationId || details.client?.id !== config.clientId
    || details.user?.id !== owner.data.user.id || typeof details.scope !== 'string' || 'redirect_url' in details) {
    throw new CoachingContextError(400, 'Authorization request does not match this account and connection')
  }
  const scopes = [...new Set(details.scope.split(/\s+/).filter(Boolean))].sort()
  if (!scopes.includes('email') || scopes.some(scope => !scopesAllowed.has(scope))) throw new CoachingContextError(400, 'Unexpected connection permissions')
  const snapshot = createHash('sha256').update(JSON.stringify({ authorizationId, owner: owner.data.user.id,
    client: details.client.id, name: details.client.name, scopes, redirect: config.redirectUri })).digest('hex')
  return { kind: 'pending' as const, authorizationId, owner: owner.data.user.id, account: owner.data.user.email ?? 'Signed-in Socius account',
    clientName: details.client.name, scopes, snapshot }
}

/** Pilot success response, not a request-metadata attestation. Keep opaque values
 * opaque and out of HTML/logs. Bounds are local failclosed limits, not OAuth maxima.
 * Native Auth 2.197 emits only code/state for this callback (no issuer parameter).
 */
export function coachingConsentSuccessRedirect(value: unknown, config: CoachingOAuthConfig): string {
  const unavailable = () => new CoachingContextError(503, 'Authorization response is unavailable')
  if (typeof value !== 'string' || value.length > 8192 || !value.startsWith(`${config.redirectUri}?`)
    || /[\u0000-\u0020\u007f\\#]/.test(value)) throw unavailable()
  const redirect = coachingConsentRedirect(value, config), params = new URL(redirect).searchParams
  if (redirect.length > 8192 || [...params.keys()].some(key => !['code', 'state'].includes(key))
    || params.getAll('code').length !== 1 || params.getAll('state').length !== 1) throw unavailable()
  for (const [key, limit] of [['code', 2048], ['state', 4096]] as const) {
    const opaque = params.get(key) ?? ''
    if (!opaque.trim() || Buffer.byteLength(opaque, 'utf8') > limit || /[\u0000-\u001f\u007f]/.test(opaque)) throw unavailable()
  }
  return redirect
}

export function coachingConsentRedirect(value: unknown, config: CoachingOAuthConfig): string {
  if (typeof value !== 'string') throw new CoachingContextError(503, 'Authorization response is unavailable')
  try {
    const target = new URL(value), expected = new URL(config.redirectUri)
    if (target.origin !== expected.origin || target.pathname !== expected.pathname || target.username || target.password || target.hash
      || [...target.searchParams.keys()].some(key => !['code', 'state', 'iss', 'error', 'error_description', 'error_uri'].includes(key))) throw new Error()
    return target.href
  } catch { throw new CoachingContextError(503, 'Authorization response is unavailable') }
}

/** Only an explicit same-origin POST reaches this function through the route.
 * Re-read the account, client and exact displayed scope binding before deciding.
 */
export async function decideCoachingConsent(db: SupabaseClient, form: URLSearchParams, config: CoachingOAuthConfig) {
  if ([...form.keys()].some(key => !['authorization_id', 'decision', 'snapshot'].includes(key) || form.getAll(key).length !== 1)) {
    throw new CoachingContextError(400, 'Invalid consent decision')
  }
  const decision = form.get('decision')
  if (!['approve', 'deny'].includes(decision ?? '')) throw new CoachingContextError(400, 'Choose allow or decline')
  const consent = await readCoachingConsent(db, form.get('authorization_id') ?? '', config)
  if (consent.kind !== 'pending') throw new CoachingContextError(409, 'Connection already processed; start a fresh connection')
  if (form.get('snapshot') !== consent.snapshot) throw new CoachingContextError(409, 'Connection details changed; review again')
  const result = decision === 'approve'
    ? await db.auth.oauth.approveAuthorization(consent.authorizationId, { skipBrowserRedirect: true })
    : await db.auth.oauth.denyAuthorization(consent.authorizationId, { skipBrowserRedirect: true })
  if (result.error || !contextObject(result.data)) throw new CoachingContextError(503, 'Consent decision could not be completed')
  return decision === 'approve' ? coachingConsentSuccessRedirect(result.data.redirect_url, config) : coachingConsentRedirect(result.data.redirect_url, config)
}

export function escapeConsentHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!) }
