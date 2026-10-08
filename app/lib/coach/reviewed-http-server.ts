import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseReviewedSetReport } from './reviewed-set-report'
import type { createReviewedWeekProposalIssuer } from './reviewed-proposal-issuer-server'
import { fetchReviewedSessionState } from './reviewed-session-state-server'
import { parseReviewedRequestResolution } from './reviewed-request-resolution'
import { fetchReviewedProposalIndex, fetchReviewedProposalState } from './reviewed-proposal-state-server'
import type { TrustedReviewedWeekRegistration } from './reviewed-week-context-server'
import { parseProposalResolutionIdentity, parseReviewedProposalResolution } from './reviewed-proposal-resolution'
import type { SupervisedScopedAccess, SupervisedResourceScope } from './supervised-resource-access'
import { recoverReviewedSupervisedRequest } from './reviewed-supervised-recovery'

type Issuer = ReturnType<typeof createReviewedWeekProposalIssuer>
type Operation = 'proposal' | 'accept' | 'set' | 'complete' | 'resolve' | 'proposal_resolve'
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => k in v)
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const retry = () => reply({ kind: 'retry_required', error: 'The result could not be confirmed. Keep the original request and retry it.' }, 503)

/** Server composition, never client-provided capabilities or database clients.
 * Protected RPCs retain freshness, owner, exact-replay and complete-manifest rules.
 * No active-state preflight may prevent recovery of an already committed request.
 */
export function createReviewedHttpHandlers(options: {
  createUserClient: () => Promise<SupabaseClient>
  enabled: () => boolean
  issue: Issuer
  registry?: readonly TrustedReviewedWeekRegistration[]
  supervised?: SupervisedScopedAccess
}) {
  const registry = structuredClone(options.registry ?? [])
  const mutate = (operation: Operation) => async (request: Request, id?: string) => {
    try {
      const db = await options.createUserClient()
      const auth = await db.auth.getUser(), owner = auth.data.user?.id
      if (auth.error || !owner) return reply({ kind: 'unauthenticated', error: 'Unauthorized' }, 401)
      if (!options.enabled() && (!options.supervised || operation === 'proposal')) return reply({ kind: 'disabled', error: 'Reviewed programming is not enabled' }, 409)
      if (operation !== 'proposal' && (!id || !uuid.test(id))) return reply({ kind: 'invalid_request', error: 'Invalid record ID' }, 400)
      // PostgreSQL canonicalizes UUIDs. Normalize before response comparison so
      // an uppercase URL cannot make a committed completion look uncertain.
      id = id?.toLowerCase()
      let body: unknown
      try {
        const text = await request.text()
        if (new TextEncoder().encode(text).length > 120000) return reply({ kind: 'invalid_request', error: 'Request is too large' }, 413)
        body = JSON.parse(text)
      } catch { return reply({ kind: 'invalid_request', error: 'Request body must be valid JSON' }, 400) }
      if (!record(body)) return reply({ kind: 'invalid_request', error: 'Request must be an object' }, 400)
      const extra = operation === 'proposal' ? ['reviewId', 'registrationId'] : operation === 'set' ? ['report'] : operation === 'complete' ? ['completion'] : operation === 'resolve' ? ['operation', 'payload'] : operation === 'proposal_resolve' ? ['operation', 'identity'] : []
      if (!exactKeys(body, ['expectedUserId', 'requestId', ...extra]) || typeof body.requestId !== 'string'
        || body.requestId !== body.requestId.trim() || body.requestId.length < 8 || body.requestId.length > (operation === 'complete' ? 175 : 200)) {
        return reply({ kind: 'invalid_request', error: 'Invalid reviewed request envelope' }, 400)
      }
      if (body.expectedUserId !== owner) return reply({ kind: 'account_changed', error: 'Restore the original account before retrying this request.' }, 409)
      const resolutionIdentity = operation === 'proposal_resolve' ? parseProposalResolutionIdentity(body.operation, body.identity) : null
      if (operation === 'proposal_resolve' && !resolutionIdentity) return reply({ kind: 'invalid_request', error: 'Invalid proposal resolution identity' }, 400)
      if (operation === 'resolve' && ((!['set', 'complete'].includes(String(body.operation))) || !record(body.payload)
        || (body.operation === 'complete' && body.requestId.length > 175))) {
        return reply({ kind: 'invalid_request', error: 'Invalid request resolution envelope' }, 400)
      }
      let supervisedScope: SupervisedResourceScope | null = null
      if (options.supervised && operation !== 'proposal') {
        const found = await options.supervised.resolve(db, owner, operation === 'accept' ? 'proposal' : operation === 'proposal_resolve' ? 'program' : 'session', id!)
        if (found.kind === 'account_changed') return reply({ kind: 'account_changed' }, 409)
        if (found.kind === 'unavailable') return retry()
        if (found.kind === 'supervised') {
          supervisedScope = found.scope
          const saved = await recoverReviewedSupervisedRequest(db, found.scope, operation, body)
          if (saved.kind === 'saved_response') return reply(saved.response)
          if (saved.kind !== 'unconfirmed') return reply({ kind: saved.kind, requestId: body.requestId },
            saved.kind === 'invalid_request' ? 400 : saved.kind === 'retry_required' ? 503 : 409)
        }
      }
      const writeEnabled = () => supervisedScope ? options.supervised!.enabled() && supervisedScope.currentEnrollmentActive : options.enabled()
      if (!writeEnabled()) return reply({ kind: 'disabled', error: 'Reviewed programming is not enabled' }, 409)
      if (operation === 'proposal') {
        const result = await options.issue(db, { reviewId: body.reviewId, registrationId: body.registrationId, requestId: body.requestId })
        const status = result.kind === 'issued' ? 200 : result.kind === 'invalid_request' ? 400
          : result.kind === 'unauthenticated' ? 401 : result.kind === 'retry_required' ? 503 : 409
        return reply(result, status)
      }
      const report = operation === 'set' ? parseReviewedSetReport(body.report) : null
      if (operation === 'set' && !report) return reply({ kind: 'invalid_request', error: 'Invalid actual set report' }, 400)
      if (operation === 'complete' && (!record(body.completion)
        || !exactKeys(body.completion, ['contractVersion', 'status', 'feedback', 'occurredAt', 'workoutDate', 'tzOffset', 'totalDurationMinutes', 'setReportIds'])
        || body.completion.contractVersion !== 3 || !['completed', 'skipped'].includes(String(body.completion.status)))) {
        return reply({ kind: 'invalid_request', error: 'Invalid reviewed completion envelope' }, 400)
      }
      const rpcName = operation === 'set' ? 'record_reviewed_session_set' : operation === 'complete' ? 'complete_reviewed_session'
        : operation === 'resolve' ? 'resolve_reviewed_session_request' : operation === 'proposal_resolve' ? 'resolve_reviewed_proposal_request' : 'accept_adaptation_proposal'
      const args = operation === 'accept' ? { p_proposal_id: id, p_idempotency_key: body.requestId }
        : operation === 'proposal_resolve' ? { p_program_id: id, p_operation: body.operation, p_request_id: body.requestId, p_identity: resolutionIdentity }
        : { p_session_id: id, p_request_id: body.requestId, ...(operation === 'set' ? { p_report: report }
          : operation === 'resolve' ? { p_operation: body.operation, p_payload: body.payload } : { p_request: body.completion }) }
      const currentAuth = await db.auth.getUser()
      if (currentAuth.error || currentAuth.data.user?.id !== owner) return reply({ kind: 'account_changed' }, 409)
      if (!writeEnabled()) return reply({ kind: 'disabled', error: 'Reviewed programming is not enabled' }, 409)
      const { data, error } = await db.rpc(rpcName, args)
      const afterAuth = await db.auth.getUser()
      if (afterAuth.error || afterAuth.data.user?.id !== owner) return reply({ kind: 'account_changed' }, 409)
      if (error) {
        // A rejected attempt does not prove an earlier uncertain attempt failed.
        // Keep the saved request in every outcome; never instruct a new-key retry.
        if (['40001', '55000', '22023', '23505'].includes(error.code)) {
          return reply({ kind: 'review_required', requestId: body.requestId,
            error: 'The saved request was not accepted by this attempt. Keep it and review the current session or proposal.' }, 409)
        }
        if (error.code === 'P0002') return reply({ kind: 'unavailable', requestId: body.requestId, error: 'Owned record unavailable' }, 404)
        return retry()
      }
      if (operation === 'resolve') {
        const resolution = parseReviewedRequestResolution(data, { userId: owner, sessionId: id!, requestId: body.requestId,
          operation: body.operation as 'set' | 'complete', payload: body.payload })
        return resolution ? reply({ kind: 'resolved', resolution }) : retry()
      }
      if (operation === 'proposal_resolve') {
        const resolution = parseReviewedProposalResolution(data, { userId: owner, programId: id!, operation: body.operation as 'issue' | 'accept',
          requestId: body.requestId, identity: resolutionIdentity! })
        return resolution ? reply({ kind: 'resolved', resolution }) : retry()
      }
      if (operation === 'set') {
        const row = Array.isArray(data) && data.length === 1 ? data[0] : null
        if (!record(row) || typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.replayed !== 'boolean'
          || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return retry()
        return reply({ kind: 'saved', requestId: body.requestId, sessionId: id, setReport: row })
      }
      if (operation === 'complete') {
        const row = record(data) ? data.result : null, receipt = record(data) ? data.receipt : null
        if (!record(row) || row.prescribed_session_id !== id || typeof row.checkin_id !== 'string' || !uuid.test(row.checkin_id)
          || row.session_status !== (body.completion as Record<string, unknown>).status || typeof row.replayed !== 'boolean'
          || (row.session_status === 'completed' && (!record(receipt) || receipt.userId !== owner
            || receipt.requestKey !== `reviewed-completion:${body.requestId}` || receipt.entityId !== row.workout_id))) return retry()
        return reply({ kind: 'saved', requestId: body.requestId, result: row, receipt })
      }
      const row = Array.isArray(data) && data.length === 1 ? data[0] : null
      if (!record(row) || typeof row.accepted_program_id !== 'string' || !uuid.test(row.accepted_program_id)
        || typeof row.active_plan_version_id !== 'string' || !uuid.test(row.active_plan_version_id)
        || row.proposal_status !== 'accepted') return retry()
      // Refresh is separate: failure reading context cannot erase a confirmed save.
      return reply({ kind: 'accepted', requestId: body.requestId, proposalId: id, accepted: row })
    } catch { return retry() }
  }
  const readSession = async (_request: Request, id: string) => {
    try {
      const db = await options.createUserClient(), auth = await db.auth.getUser(), owner = auth.data.user?.id
      if (auth.error || !owner) return reply({ kind: 'unauthenticated', error: 'Unauthorized' }, 401)
      if (!uuid.test(id)) return reply({ kind: 'invalid_request', error: 'Invalid session ID' }, 400)
      let supervisedWritable: boolean | null = null
      if (options.supervised) {
        const found = await options.supervised.resolve(db, owner, 'session', id.toLowerCase())
        if (found.kind === 'unavailable') return retry()
        if (found.kind === 'account_changed') return reply({ kind: 'account_changed' }, 409)
        if (found.kind !== 'supervised' && !options.enabled()) return reply({ kind: 'disabled' }, 409)
        if (found.kind === 'supervised') supervisedWritable = options.supervised.enabled() && found.scope.currentEnrollmentActive
      } else if (!options.enabled()) return reply({ kind: 'disabled', error: 'Reviewed programming is not enabled' }, 409)
      const session = await fetchReviewedSessionState(db, owner, id.toLowerCase())
      if (session && supervisedWritable !== null) session.writable = session.writable && supervisedWritable && options.supervised!.enabled()
      return session ? reply({ kind: 'session', session }) : reply({ kind: 'unavailable', error: 'Owned session unavailable' }, 404)
    } catch { return reply({ kind: 'unavailable', error: 'Complete session history could not be verified. Refresh before recording more work.' }, 503) }
  }
  const readProposal = async (request: Request, id?: string) => {
    try {
      const db = await options.createUserClient(), auth = await db.auth.getUser(), owner = auth.data.user?.id
      if (auth.error || !owner) return reply({ kind: 'unauthenticated', error: 'Unauthorized' }, 401)
      const programId = new URL(request.url).searchParams.get('programId')
      if (id ? !uuid.test(id) : !programId || !uuid.test(programId)) return reply({ kind: 'invalid_request', error: 'Invalid proposal or program ID' }, 400)
      let supervisedWritable: boolean | null = null
      if (options.supervised) {
        const found = await options.supervised.resolve(db, owner, id ? 'proposal' : 'program', (id ?? programId!).toLowerCase())
        if (found.kind === 'unavailable') return retry()
        if (found.kind === 'account_changed') return reply({ kind: 'account_changed' }, 409)
        if (found.kind !== 'supervised' && !options.enabled()) return reply({ kind: 'disabled' }, 409)
        if (found.kind === 'supervised') supervisedWritable = options.supervised.enabled() && found.scope.currentEnrollmentActive
      } else if (!options.enabled()) return reply({ kind: 'disabled', error: 'Reviewed programming is not enabled' }, 409)
      const state = id ? await fetchReviewedProposalState(db, owner, id.toLowerCase())
        : await fetchReviewedProposalIndex(db, owner, programId!.toLowerCase(), registry)
      if (state && 'acceptanceAvailable' in state && supervisedWritable !== null) state.acceptanceAvailable = state.acceptanceAvailable && supervisedWritable && options.supervised!.enabled()
      return state ? reply(id ? { kind: 'proposal', proposal: state } : { kind: 'proposals', index: state })
        : reply({ kind: 'unavailable', error: 'Owned reviewed proposal or program unavailable' }, 404)
    } catch { return reply({ kind: 'unavailable', error: 'Proposal details could not be verified. Refresh before accepting.' }, 503) }
  }
  return { propose: mutate('proposal'), accept: mutate('accept'), recordSet: mutate('set'), complete: mutate('complete'), resolve: mutate('resolve'), readSession,
    readProposal, listProposals: (request: Request) => readProposal(request), resolveProposal: mutate('proposal_resolve') }
}
