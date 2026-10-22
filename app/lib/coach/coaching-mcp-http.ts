import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createCoachingContextMcpServer } from './coaching-context-mcp'
import { authorizeCoachingBearer, coachingOAuthError, coachingPrivateHeaders, type CoachingBearerDependencies, type CoachingOAuthConfig } from '../auth/coaching-oauth'
import { CoachingContextError } from './coaching-context'

/** Stateless, owner-bound per request. The SDK owns the protocol; no refresh,
 * OAuth grant or host operation is exposed by this route. Domain writes are
 * separately default-off and use the same request-local owner authorization.
 */
export async function handleCoachingMcp(request: Request, config: CoachingOAuthConfig, dependencies?: CoachingBearerDependencies) {
  try {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...coachingPrivateHeaders, Allow: 'POST' } })
    if (new URL(request.url).origin !== config.origin || (request.headers.has('origin') && request.headers.get('origin') !== config.origin)) {
      throw new CoachingContextError(400, 'Unexpected connection origin')
    }
    const authorized = await authorizeCoachingBearer(request, config, dependencies)
    const server = createCoachingContextMcpServer(async () => authorized, config)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65_536 })
    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request)
      for (const [key, value] of Object.entries(coachingPrivateHeaders)) response.headers.set(key, value)
      return response
    } finally { await server.close() }
  } catch (error) { return coachingOAuthError(error, config) }
}
