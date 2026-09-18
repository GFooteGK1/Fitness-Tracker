import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { beginRequest, finishRequest, loggingContext, validRequestId, validRecommendationId } from '@/app/lib/logging/server'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  const { data, error: readError } = await supabase.from('activity_drafts').select('*').eq('user_id', user.id).eq('status','draft')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30)
  return readError ? NextResponse.json({ error: 'Drafts unavailable' }, { status: 503, headers }) : NextResponse.json({ userId: user.id, drafts: data ?? [] }, { headers })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  if (!personalizedCoachingCapabilities().captureReceiptsV2) return NextResponse.json({ error: 'Draft saving is paused.' }, { status: 409, headers })
  const input = await request.json().catch(() => null)
  if (!input || input.expectedUserId !== user.id) return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403, headers })
  if (!['commit','discard'].includes(input.action) || !validRequestId(input.requestId) || typeof input.draftId !== 'string'
    || !/^[0-9a-f-]{36}$/i.test(input.draftId) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) return NextResponse.json({ error: 'A draft and expected revision are required.' }, { status: 422, headers })
  if(input.recommendationId != null && !validRecommendationId(input.recommendationId))return NextResponse.json({error:'Invalid recommendation origin.'},{status:422,headers})
  const claim = await beginRequest(supabase, `draft:${input.requestId}`, JSON.stringify(input))
  if (claim.response) return claim.response
  return loggingContext.run({ id: claim.id!, userId: user.id, writeAttempted: input.action === 'commit' }, async () => {
    const { data, error: mutationError } = input.action === 'commit'
      ? await supabase.rpc('commit_activity_draft', { p_draft_id: input.draftId, p_expected_revision: input.expectedRevision, p_request_id: claim.id, ...(input.recommendationId?{p_recommendation_id:input.recommendationId}:{}) })
      : await supabase.rpc('save_activity_draft', { p_draft_id: input.draftId, p_expected_revision: input.expectedRevision, p_request_id: claim.id, p_operation: null, p_discard: true })
    if (mutationError) return NextResponse.json({ error: 'The draft action could not be confirmed. Retry the same request.', state: 'save_unconfirmed' }, { status: 503, headers })
    if (input.action === 'commit') loggingContext.getStore()!.receipts = [data]
    return finishRequest(supabase, claim.id!, NextResponse.json({ success: true, ...(input.action === 'commit' ? { receipt: data } : { draft: data }) }, { headers }))
  })
}
