import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { storeRecoveryData, storeSleepData } from '@/app/lib/whoop/sync-service'
import { isWhoopTimingOwner } from '@/app/lib/whoop/timing-owner'
import { getOwnerCronAccessToken } from '@/app/lib/whoop/token-service'
import {
  parseWhoopWebhook,
  readWhoopWebhookBody,
  readWhoopWebhookRecord,
  verifyWhoopWebhook,
  whoopWebhookUserId,
} from '@/app/lib/whoop/webhook'

export const runtime = 'nodejs'

function respond(status: number) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const configuredId = process.env.WHOOP_WEBHOOK_USER_ID
  const owner = process.env.WHOOP_WEBHOOK_OWNER_ID
  if (!configuredId || !owner) return respond(404)
  const sourceId = whoopWebhookUserId(configuredId)
  const secret = process.env.WHOOP_CLIENT_SECRET
  if (!sourceId || !secret || !isWhoopTimingOwner(owner)) {
    console.warn('[WHOOP Webhook] Owner configuration unavailable')
    return respond(503)
  }

  try {
    const rawBody = await readWhoopWebhookBody(request)
    if (!rawBody) return respond(413)
    if (!verifyWhoopWebhook(request.headers, rawBody, secret)) return respond(401)
    const event = parseWhoopWebhook(rawBody)
    if (!event) return respond(400)
    if (event.user_id !== sourceId || (event.type !== 'sleep.updated' && event.type !== 'recovery.updated')) {
      return respond(204)
    }

    const db = createServiceRoleClient()
    const accessToken = await getOwnerCronAccessToken(owner, db)
    const record = await readWhoopWebhookRecord({ ...event, type: event.type }, accessToken, AbortSignal.timeout(5_000))
    const store = event.type === 'sleep.updated' ? storeSleepData : storeRecoveryData
    await store(owner, [record], db, true)
    return respond(204)
  } catch {
    // WHOOP retries failed deliveries. Do not acknowledge an unpersisted update.
    console.warn('[WHOOP Webhook] Owner update could not be processed')
    return respond(503)
  }
}
