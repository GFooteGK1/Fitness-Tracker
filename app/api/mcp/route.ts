import { coachingOAuthConfig, coachingOAuthDiscovery, coachingOAuthError } from '@/app/lib/auth/coaching-oauth'
import { handleCoachingMcp } from '@/app/lib/coach/coaching-mcp-http'
import { CoachingContextError } from '@/app/lib/coach/coaching-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const discovery = coachingOAuthDiscovery()
    if (request.method === 'POST' && !request.headers.has('authorization')) return coachingOAuthError(new CoachingContextError(401, 'Socius connection authorization required'), discovery)
    return await handleCoachingMcp(request, coachingOAuthConfig())
  }
  catch (error) { return coachingOAuthError(error) }
}
export const GET = POST
export const DELETE = POST
