/** Browser-safe exact-envelope validation. A no-write receipt is durable authority
 * to release pending state; absence remains unconfirmed. */
import { stableStringify } from './rolling-weekly-contracts'
import type { SupervisedPending } from './supervised-pending'
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export type SupervisedRequestResolution = { schemaVersion: 1; request: SupervisedPending } & (
  | { disposition: 'saved'; result: Record<string, unknown> }
  | { disposition: 'no_write'; resolutionId: string; resolvedAt: string }
  | { disposition: 'not_found' })
export function parseSupervisedRequestResolution(value: unknown, request: SupervisedPending): SupervisedRequestResolution | null {
  try {
    if (!record(value) || value.schemaVersion !== 1 || stableStringify(value.request) !== stableStringify(request)) return null
    const fields = Object.keys(value).sort().join(',')
    if (value.disposition === 'not_found') return fields === 'disposition,request,schemaVersion' ? value as SupervisedRequestResolution : null
    if (value.disposition === 'saved') return fields === 'disposition,request,result,schemaVersion' && record(value.result)
      ? value as SupervisedRequestResolution : null
    return value.disposition === 'no_write' && fields === 'disposition,request,resolutionId,resolvedAt,schemaVersion'
      && uuid(value.resolutionId) && typeof value.resolvedAt === 'string' && Number.isFinite(Date.parse(value.resolvedAt))
      ? value as SupervisedRequestResolution : null
  } catch { return null }
}
