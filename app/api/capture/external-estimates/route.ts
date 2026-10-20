import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server'
import { ExternalEstimateError, EXTERNAL_ESTIMATE_MAX_BYTES, externalEstimateFingerprint, parseExternalImport } from '@/app/lib/nutrition/external-estimate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const respond = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
// Separate authority: camera-cloud-v1 tokens never enter this import lane.
async function authorize(request: Request) {
  if (process.env.EXTERNAL_ESTIMATE_IMPORT_ENABLED !== 'true') return { response: respond({ error: 'External estimate import is inactive.' }, 409) }
  const match = request.headers.get('authorization')?.match(/^Bearer external-estimate-v1\.([a-f0-9-]{36})\.([a-f0-9]{64})$/)
  if (!match || !uuid.test(match[1])) return { response: respond({ error: 'Unauthorized estimate import.' }, 401) }
  const tokenHash = createHash('sha256').update(match[0].slice(7)).digest('hex')
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db.rpc('external_estimate_request', { p_hash: tokenHash, p_action: 'check' })
    if (error || data?.deviceId !== match[1] || data?.scope !== 'external-estimate-v1') return { response: respond({ error: 'Unauthorized estimate import.' }, error?.code === '42501' ? 401 : 503) }
    return { db, tokenHash }
  } catch { return { response: respond({ error: 'Estimate authorization unavailable.' }, 503) } }
}
async function boundedText(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) throw new ExternalEstimateError()
  const parts: Uint8Array[] = []; let size = 0
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}) }, 10_000)
  let completed = false
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) { completed = true; break }
      size += part.value.length
      if (size > EXTERNAL_ESTIMATE_MAX_BYTES) throw new ExternalEstimateError('Estimate is too large.', 413)
      parts.push(part.value)
    }
    if (timedOut) throw new ExternalEstimateError('Estimate upload timed out.', 408)
    if (size === 0) throw new ExternalEstimateError()
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))
  } catch (error) {
    if (error instanceof ExternalEstimateError) throw error
    throw new ExternalEstimateError('Estimate body could not be read.')
  } finally {
    clearTimeout(timer)
    if (!completed) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
const rpcFailure = (code?: string) => respond({ error: code === '42501' ? 'Unauthorized estimate import.' : code === '22023' ? 'Estimate conflicts with its original capture or contract.' : 'Import is unconfirmed. Check the original capture ID.',
  state: code === '22023' || code === '42501' ? 'rejected' : 'save_unconfirmed' }, code === '42501' ? 401 : code === '22023' ? 409 : 503)
export async function POST(request: Request) {
  const auth = await authorize(request)
  if (auth.response) return auth.response
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return respond({ error: 'A JSON estimate is required.' }, 415)
  let payload
  try { payload = parseExternalImport(await boundedText(request)) }
  catch (error) { return respond({ error: error instanceof ExternalEstimateError ? error.message : 'Invalid estimate.' }, error instanceof ExternalEstimateError ? error.status : 422) }
  try {
    const { data, error } = await auth.db!.rpc('external_estimate_request', { p_hash: auth.tokenHash, p_action: 'import', p_id: payload.capture.requestId,
      p_payload: payload, p_fingerprint: externalEstimateFingerprint(payload) })
    if (error) return rpcFailure(error.code)
    if (!data || data.requestId !== payload.capture.requestId || data.state !== 'estimated_unreviewed' || data.canonicalChanged !== false) return rpcFailure()
    return respond(data)
  } catch { return rpcFailure() }
}
export async function GET(request: Request) {
  const auth = await authorize(request)
  if (auth.response) return auth.response
  const params = new URL(request.url).searchParams, id = params.get('requestId')
  if (!id || !uuid.test(id) || [...params.keys()].length !== 1) return respond({ error: 'One original capture UUID is required.' }, 422)
  try {
    const { data, error } = await auth.db!.rpc('external_estimate_request', { p_hash: auth.tokenHash, p_action: 'status', p_id: id })
    return error || !data ? rpcFailure(error?.code) : respond(data)
  } catch { return rpcFailure() }
}
