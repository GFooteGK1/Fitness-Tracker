import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds, sourceClient } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { createSupervisedCandidatePreview } from '@/app/lib/coach/supervised-candidate-preview'
import { createSupervisedReviewHttp } from '@/app/lib/coach/supervised-review-http'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'

describe('supervised candidate preview in a read-only SQL transaction', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>, enrollment: string
  const { owner, reviewer } = lifecycleIds
  beforeAll(async () => {
    f = await supervisedLifecycleFixture()
    await f.db.exec(sqlFile('supabase/migrations/20260930030000_supervised_programming_workspace.sql'))
    await f.db.exec('BEGIN'); await f.actor(); await f.scalar('SELECT get_coach_context_revision() AS value')
    enrollment = await f.enrollment(); await f.anchor(); await f.db.exec('COMMIT; RESET ROLE')
  }, 30000)
  beforeEach(async () => { await f.db.exec('BEGIN READ ONLY'); await f.actor() })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })
  it('compiles the real complete draft over HTTP without candidate, decision, registration or proposal writes', async () => {
    const draft = await f.draft(enrollment), calls: string[] = [], db = sourceClient(f.db, owner, 'authenticated', calls)
    const preview = createSupervisedCandidatePreview({ enabled: () => true })
    const review = createSupervisedReviewService({ enabled: () => true, createServiceClient: () => { throw Error('Preview cannot create privileged clients') } })
    const http = createSupervisedReviewHttp({ createUserClient: async () => db, review, preview })
    const response = await http.preview(new Request('http://localhost/api/coach/supervised/candidates/preview', {
      method: 'POST', body: JSON.stringify({ expectedUserId: owner, draft }) }))
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ kind: 'preview', identity: { candidateId: draft.candidateId, enrollmentId: enrollment, expectedUserId: owner, draftHash: doseContentHash(draft) },
      reviewPacket: { reviewMode: 'manual_complete_week' } })
    expect(result.reviewPacket.week.scheduledSessions.length).toBeGreaterThan(0)
    expect(Object.keys(result).sort()).toEqual(['identity', 'kind', 'reviewPacket'])
    expect(calls).toEqual(['get_supervised_program_workspace', 'get_supervised_program_workspace'])
    await f.db.exec('RESET ROLE')
    for (const table of ['coach_supervised_candidates', 'coach_supervised_decisions', 'coach_reviewed_proposal_registrations', 'adaptation_proposals']) {
      expect(await f.scalar(`SELECT count(*)::int AS value FROM ${table}`)).toBe(0)
    }
  })
  it('returns a correctable compiler refusal without durable request writes', async () => {
    const draft = await f.draft(enrollment); draft.recipe.sessions = []
    const result = await createSupervisedCandidatePreview({ enabled: () => true })(sourceClient(f.db, owner), { expectedUserId: owner, draft })
    expect(result).toMatchObject({ kind: 'review_required', identity: { candidateId: draft.candidateId, draftHash: doseContentHash(draft) } })
    expect(result).not.toHaveProperty('privatePacket')
  })
  it('refuses a foreign reviewer or changed enrollment before compiling owner source', async () => {
    const draft = await f.draft(enrollment), preview = createSupervisedCandidatePreview({ enabled: () => true })
    expect(await preview(sourceClient(f.db, reviewer), { expectedUserId: reviewer, draft })).toMatchObject({ kind: 'review_required' })
    expect(await preview(sourceClient(f.db, owner), { expectedUserId: owner, draft: { ...draft, enrollmentId: randomUUID() } })).toMatchObject({ kind: 'review_required' })
  })
})
