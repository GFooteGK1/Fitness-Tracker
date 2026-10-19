import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CoachingContextError, contextObject } from '../coach/coaching-context'
import type { AuthorizedContextRequest, ContextToolPolicy } from '../coach/coaching-context-tool'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export interface CoachingOAuthConfig extends ContextToolPolicy {
  origin: string
  supabaseUrl: string
  publicKey: string
  redirectUri: string
  resourceMetadataUrl: string
}
const unavailable = () => new CoachingContextError(503, 'Socius connection is not configured')
const unauthorized = () => new CoachingContextError(401, 'Socius connection authorization required')
export type CoachingOAuthDiscovery = Pick<CoachingOAuthConfig, 'origin' | 'supabaseUrl' | 'issuer' | 'resource' | 'resourceMetadataUrl'>

/** Public protocol discovery needs no client credential or callback. This avoids
 * a setup cycle: the host can display its actual callback before client creation.
 * Missing full configuration still prevents every authenticated data request.
 */
export function coachingOAuthDiscovery(env: Record<string, string | undefined> = process.env): CoachingOAuthDiscovery {
  if (env.SOCIUS_MCP_ENABLED !== 'true') throw unavailable()
  try {
    const origin = new URL(env.SOCIUS_MCP_ORIGIN ?? ''), supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || supabase.origin !== 'https://auolnfwetmfcwhtvakzy.supabase.co' || supabase.username || supabase.password || supabase.pathname !== '/' || supabase.search || supabase.hash) throw unavailable()
    return { origin: origin.origin, supabaseUrl: supabase.origin, issuer: `${supabase.origin}/auth/v1`,
      resource: `${origin.origin}/api/mcp`, resourceMetadataUrl: `${origin.origin}/.well-known/oauth-protected-resource/api/mcp` }
  } catch { throw unavailable() }
}

/** Disabled by default. Only nonsecret connection identifiers belong here. */
export function coachingOAuthConfig(env: Record<string, string | undefined> = process.env): CoachingOAuthConfig {
  const discovery = coachingOAuthDiscovery(env)
  try {
    const redirect = new URL(env.SOCIUS_MCP_REDIRECT_URI ?? '')
    const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const clientId = env.SOCIUS_MCP_CLIENT_ID ?? ''
    if (!uuid.test(clientId) || !publicKey || publicKey.startsWith('sb_secret_')
      || redirect.origin !== 'https://chatgpt.com' || redirect.username || redirect.password || redirect.search || redirect.hash
      || !/^\/(connector_platform_oauth_redirect|connector\/oauth\/[A-Za-z0-9_-]+)$/.test(redirect.pathname)) throw unavailable()
    if (!publicKey.startsWith('sb_publishable_')) {
      const payload = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString())
      if (payload.role !== 'anon') throw unavailable()
    }
    return { ...discovery, publicKey, clientId, redirectUri: redirect.href }
  } catch { throw unavailable() }
}

export function bearerUserClient(token: string, config: CoachingOAuthConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.publicKey, { global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export interface CoachingBearerDependencies {
  client: (token: string, config: CoachingOAuthConfig) => SupabaseClient
  fetch: typeof fetch
}

/** getClaims verifies the signature; these comparisons enforce this connection's
 * issuer/resource/client/owner policy. No decoded or user_metadata claim is trusted.
 * A provider grant read catches revocation while a signed access token is unexpired.
 */
export async function authorizeCoachingBearer(request: Request, config: CoachingOAuthConfig,
  dependencies: CoachingBearerDependencies = { client: bearerUserClient, fetch }): Promise<AuthorizedContextRequest> {
  const header = request.headers.get('authorization') ?? ''
  if (header.length > 16_384 || !/^Bearer [A-Za-z0-9_.~-]+$/.test(header)) throw unauthorized()
  const token = header.slice(7)
  try {
    const db = dependencies.client(token, config)
    // Verify the signature first; enforce expiry explicitly below so an expired
    // signed token receives an auth challenge rather than an outage response.
    const verified = await db.auth.getClaims(token, { allowExpired: true })
    if (verified.error || !verified.data) throw unauthorized()
    const claims = verified.data.claims
    const now = Date.now() / 1000
    const audience = typeof claims.aud === 'string' ? [claims.aud] : claims.aud
    if (claims.iss !== config.issuer || !Array.isArray(audience) || !audience.includes(config.resource)
      || audience.some(value => typeof value !== 'string') || claims.client_id !== config.clientId
      || claims.role !== 'authenticated' || claims.scope !== 'email' || claims.is_anonymous === true || !uuid.test(claims.sub)
      || !Number.isFinite(claims.exp) || claims.exp <= now
      || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now))
      || (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat > now + 60))) throw unauthorized()
    const owner = await db.auth.getUser(token)
    if (owner.error || !owner.data.user || owner.data.user.id !== claims.sub || owner.data.user.is_anonymous) throw unauthorized()
    // These SDK OAuth methods require a browser/cookie session. The bearer-only
    // client therefore uses the same documented grant GET endpoint directly,
    // without inventing a refresh token or fabricating a stored SDK session.
    const response = await dependencies.fetch(`${config.issuer}/user/oauth/grants`, {
      headers: { Authorization: `Bearer ${token}`, apikey: config.publicKey },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 401 || response.status === 403) throw unauthorized()
    if (!response.ok) throw new CoachingContextError(503, 'Socius authorization is unavailable')
    const grants: unknown = await response.json()
    if (!Array.isArray(grants)) throw new CoachingContextError(503, 'Socius authorization is unavailable')
    if (!grants.some(grant => contextObject(grant) && contextObject(grant.client) && grant.client.id === config.clientId
      && Array.isArray(grant.scopes) && grant.scopes.length === 1 && grant.scopes[0] === 'email')) throw unauthorized()
    return { db, principal: { subject: claims.sub, clientId: config.clientId, issuer: config.issuer,
      resource: config.resource, expiresAt: claims.exp * 1000, role: 'authenticated' } }
  } catch (error) {
    if (error instanceof CoachingContextError) throw error
    throw new CoachingContextError(503, 'Socius authorization is unavailable')
  }
}

export const coachingPrivateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie', 'Referrer-Policy': 'no-referrer' }
export function coachingOAuthError(error: unknown, config?: Pick<CoachingOAuthConfig, 'resourceMetadataUrl'>) {
  const status = error instanceof CoachingContextError ? error.status : 503
  return Response.json({ error: error instanceof CoachingContextError ? error.message : 'Socius connection is unavailable' }, {
    status, headers: { ...coachingPrivateHeaders, ...(status === 401 && config ? {
      'WWW-Authenticate': `Bearer resource_metadata="${config.resourceMetadataUrl}", error="invalid_token", error_description="Sign in to Socius"`,
    } : {}) },
  })
}
