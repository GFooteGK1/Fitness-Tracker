import type { SupabaseClient } from '@supabase/supabase-js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createCoachingContextMcpServer } from './coaching-context-mcp'
import { authorizeCoachingBearer, coachingOAuthError, coachingPrivateHeaders, type CoachingBearerDependencies, type CoachingOAuthConfig } from '../auth/coaching-oauth'
import { createServiceRoleClient } from '../auth/supabase-server'
import { CoachingContextError } from './coaching-context'
import { isSociusTodayPilotOwner } from './socius-today-pilot'

export type CoachingMcpDependencies = CoachingBearerDependencies & { createDraftStorageClient?: () => SupabaseClient }

/** Stateless, owner-bound per request. The SDK owns the protocol; no refresh,
 * OAuth grant or host operation is exposed by this route. Domain writes are
 * separately default-off and use the same request-local owner authorization.
 */
export async function handleCoachingMcp(request: Request, config: CoachingOAuthConfig, dependencies?: CoachingMcpDependencies) {
  try {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...coachingPrivateHeaders, Allow: 'POST' } })
    if (new URL(request.url).origin !== config.origin || (request.headers.has('origin') && request.headers.get('origin') !== config.origin)) {
      throw new CoachingContextError(400, 'Unexpected connection origin')
    }
    const authorized = await authorizeCoachingBearer(request, config, dependencies)
    const pilotOwner = isSociusTodayPilotOwner(authorized.principal.subject)
    const activityEnabled = pilotOwner && process.env.SOCIUS_MCP_ACTIVITY_UI_ENABLED === 'true'
    const coachingRequirementsEnabled = pilotOwner && process.env.SOCIUS_MCP_COACHING_REQUIREMENTS_ENABLED === 'true'
    const createDraftStorageClient = dependencies?.createDraftStorageClient
      ?? (process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceRoleClient : undefined)
    const server = createCoachingContextMcpServer(async () => authorized, config, {
      todayEnabled: pilotOwner, activityEnabled, coachingRequirementsEnabled, createDraftStorageClient,
    })
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65_536 })
    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request)
      for (const [key, value] of Object.entries(coachingPrivateHeaders)) response.headers.set(key, value)
      return response
    } finally { await server.close() }
  } catch (error) { return coachingOAuthError(error, config) }
}
