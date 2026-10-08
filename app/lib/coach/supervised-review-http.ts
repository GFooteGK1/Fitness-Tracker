/** Authenticated HTTP boundary. Private packet resolution is never exposed. */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { createSupervisedReviewService } from './supervised-review-service'
import { recoverSupervisedLifecycle } from './supervised-lifecycle-recovery'
import { listSupervisedPrograms, readSupervisedProgramWorkspace } from './supervised-workspace-reader'
import type { createSupervisedDraftReader } from './supervised-draft-server'
import type { createSupervisedWeekIssuer } from './supervised-proposal-issuer'
import { parseSupervisedDecisionReceipt } from './supervised-programming-contract'
import type { createSupervisedCandidatePreview } from './supervised-candidate-preview'
import { resolveSupervisedRequest } from './supervised-request-resolution-server'

type ReviewService = Pick<ReturnType<typeof createSupervisedReviewService>, 'read' | 'submit' | 'decide'>
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).sort().join(',') === [...fields].sort().join(',')
const reply = (body: object, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const unavailable = () => reply({ kind: 'retry_required', error: 'The result is unconfirmed. Keep the original request for recovery.' }, 503)

function publicResult<T extends { kind: string }>(value: T) {
  const status = ['candidate', 'saved', 'decided', 'recovered', 'unconfirmed', 'programs', 'workspace', 'draft', 'issued', 'preview', 'resolved'].includes(value.kind) ? 200
    : value.kind === 'invalid_request' ? 400 : value.kind === 'unauthenticated' ? 401
      : value.kind === 'not_found' ? 404 : ['retry_required', 'unavailable'].includes(value.kind) ? 503 : 409
  // The private approved-packet resolver is deliberately absent from this API.
  // Project explicitly so future service internals do not become HTTP fields.
  const visible: Record<string, unknown> = { kind: value.kind }
  for (const key of ['candidate', 'receipt', 'replayed', 'identity', 'request', 'reasons', 'page', 'userId', 'programId', 'basePlanVersionId', 'enrollmentId', 'seed', 'proposalId', 'planVersionId', 'writesEnabled', 'reviewPacket', 'resolution']) {
    if (Object.hasOwn(value, key)) visible[key] = (value as unknown as Record<string, unknown>)[key]
  }
  return reply(visible, status)
}

export function createSupervisedReviewHttp(options: {
  createUserClient: () => Promise<SupabaseClient>
  review: ReviewService
  draft?: ReturnType<typeof createSupervisedDraftReader>
  issue?: ReturnType<typeof createSupervisedWeekIssuer>
  enabled?: () => boolean
  preview?: ReturnType<typeof createSupervisedCandidatePreview>
}) {
  const authenticate = async () => {
    const db = await options.createUserClient(), auth = await db.auth.getUser()
    return auth.error || !auth.data.user ? null : { db, userId: auth.data.user.id }
  }
  const body = async (request: Request, maximum: number) => {
    const text = await request.text()
    if (new TextEncoder().encode(text).length > maximum) return { error: reply({ kind: 'invalid_request', error: 'Request is too large.' }, 413) }
    try {
      const value: unknown = JSON.parse(text)
      return record(value) ? { value } : { error: reply({ kind: 'invalid_request', error: 'Request must be an object.' }, 400) }
    } catch { return { error: reply({ kind: 'invalid_request', error: 'Request must be valid JSON.' }, 400) } }
  }
  const readCandidate = async (candidateId: string) => {
    try {
      const session = await authenticate()
      if (!session) return reply({ kind: 'unauthenticated' }, 401)
      return publicResult(await options.review.read(session.db, candidateId))
    } catch { return unavailable() }
  }
  const readDecision = async (requestId: string) => {
    try {
      const session = await authenticate()
      if (!session) return reply({ kind: 'unauthenticated' }, 401)
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId)) return reply({ kind: 'invalid_request' }, 400)
      const saved = await session.db.rpc('get_supervised_decision_receipt', { p_request_id: requestId })
      const after = await session.db.auth.getUser()
      if (after.error || after.data.user?.id !== session.userId) return reply({ kind: 'account_changed' }, 409)
      if (saved.error) return unavailable()
      if (saved.data === null) return reply({ kind: 'not_found' }, 404)
      const receipt = parseSupervisedDecisionReceipt(saved.data)
      return receipt && receipt.requestId === requestId && receipt.reviewerId === session.userId && receipt.replayed
        ? publicResult({ kind: 'decided', receipt }) : unavailable()
    } catch { return unavailable() }
  }
  const act = (operation: 'submit' | 'decide' | 'recover' | 'draft' | 'issue' | 'preview' | 'resolve' | 'resolution') => async (request: Request, programId?: string) => {
    try {
      const session = await authenticate()
      if (!session) return reply({ kind: 'unauthenticated' }, 401)
      const parsed = await body(request, operation === 'resolve' || operation === 'resolution' ? 600000 : operation === 'submit' || operation === 'preview' ? 500000 : 120000)
      if (parsed.error) return parsed.error
      const value = parsed.value!
      if (value.expectedUserId !== session.userId) return reply({ kind: 'account_changed' }, 409)
      if (operation === 'resolve' || operation === 'resolution') {
        if (!exact(value, ['expectedUserId', 'pending'])) return reply({ kind: 'invalid_request' }, 400)
        return publicResult(await resolveSupervisedRequest(session.db, value.pending, operation === 'resolve'))
      }
      if (operation === 'preview') {
        if (!exact(value, ['expectedUserId', 'draft'])) return reply({ kind: 'invalid_request' }, 400)
        return options.preview ? publicResult(await options.preview(session.db, value)) : unavailable()
      }
      if (operation === 'submit') {
        if (!exact(value, ['expectedUserId', 'draft'])) return reply({ kind: 'invalid_request' }, 400)
        return publicResult(await options.review.submit(session.db, session.userId, value.draft))
      }
      if (operation === 'draft') {
        if (!exact(value, ['expectedUserId', 'transition']) || !programId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(programId)) return reply({ kind: 'invalid_request' }, 400)
        return options.draft ? publicResult(await options.draft(session.db, { ...value, programId: programId.toLowerCase() })) : unavailable()
      }
      if (operation === 'issue') return options.issue ? publicResult(await options.issue(session.db, value)) : unavailable()
      return publicResult(operation === 'decide'
        ? await options.review.decide(session.db, value)
        : await recoverSupervisedLifecycle(session.db, value))
    } catch { return unavailable() }
  }
  const discover = async (request: Request, programId?: string) => {
    try {
      const session = await authenticate()
      if (!session) return reply({ kind: 'unauthenticated' }, 401)
      const query = new URL(request.url).searchParams, cursor = programId ? 'afterCandidateId' : 'afterProgramId'
      if ([...query.keys()].some(key => ![cursor, 'limit'].includes(key) || query.getAll(key).length !== 1)
        || (query.has('limit') && !/^[1-9][0-9]?$/.test(query.get('limit')!))) return reply({ kind: 'invalid_request' }, 400)
      const input = { expectedUserId: session.userId, [cursor]: query.get(cursor), ...(query.has('limit') ? { limit: Number(query.get('limit')) } : {}) }
      if (programId) {
        if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(programId)) return reply({ kind: 'invalid_request' }, 400)
        return publicResult({ ...await readSupervisedProgramWorkspace(session.db, { ...input, programId: programId.toLowerCase() }), writesEnabled: options.enabled?.() ?? false })
      }
      return publicResult({ ...await listSupervisedPrograms(session.db, input), writesEnabled: options.enabled?.() ?? false })
    } catch { return unavailable() }
  }
  return { readCandidate, readDecision, submit: act('submit'), decide: act('decide'), recover: act('recover'), draft: act('draft'), issue: act('issue'), preview: act('preview'),
    resolve: act('resolve'), resolution: act('resolution'),
    listPrograms: (request: Request) => discover(request), readProgram: (request: Request, id: string) => discover(request, id) }
}
