import { coachingOAuthDiscovery, coachingOAuthError } from '@/app/lib/auth/coaching-oauth'

export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const config = coachingOAuthDiscovery()
    return Response.json({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: ['email'],
      bearer_methods_supported: ['header'] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return coachingOAuthError(error) }
}
