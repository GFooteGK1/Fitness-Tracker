/** Explicit readback of a browser-created proposal; never seeds or accepts work. */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { reviewedC2rWeek } from '../../test/fixtures/reviewed-c2r-week'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'

describe.skipIf(process.env.SOCIUS_LOCAL_C2R_NEXT_READBACK !== 'true')('browser-created C2-R readback', () => {
  it('reads exact accepted content and owner isolation without training writes', async () => {
    const id = process.env.SOCIUS_LOCAL_C2R_NEXT_RUN
    const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
    if (!id || !uuid.test(id)) throw new Error('Explicit runtime UUID required')
    const directory = `output/app-quality-release/reviewed-next-${id}`
    const runtime = JSON.parse(readFileSync(`${directory}/receipt.json`, 'utf8'))
    if (runtime.id !== id || runtime.sourceKind !== 'c2r' || !uuid.test(runtime.sourceRun) || runtime.phase !== 'enabled_copy') throw new Error('Wrong runtime')
    const sourceDirectory = `output/app-quality-release/reviewed-c2r-${runtime.sourceRun}`
    const fixture = JSON.parse(readFileSync(`${sourceDirectory}/fixture.json`, 'utf8'))
    const registry = readFileSync(`${sourceDirectory}/registry.json`)
    if (fixture.runId !== runtime.sourceRun || createHash('sha256').update(registry).digest('hex') !== fixture.registrySha256) throw new Error('Fixture changed')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const db = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || db.hostname !== '127.0.0.1' || db.port !== '55322') throw new Error('Nonlocal target')
    const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== status.API_URL) throw new Error('Nonlocal request')
      return fetch(input, { ...init, redirect: 'error' })
    }) as typeof fetch } }
    const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
    const checks: string[] = [], evidence: Record<string, unknown> = { id, sourceRun: runtime.sourceRun, checks, status: 'running' }
    const save = () => writeFileSync(`${directory}/readback.json`, JSON.stringify(evidence, null, 2))
    const check = (ok: unknown, text: string) => { if (!ok) throw new Error(text); checks.push(text); save() }
    const login = async (actor: string) => {
      const expected = fixture.users.find((user: { actor: string; id: string }) => user.actor === actor)
      if (!expected || !uuid.test(expected.id)) throw new Error('Missing retained actor')
      const email = `c2r-${runtime.sourceRun}-${actor}@sociusfit-local.invalid`
      const found = await service.auth.admin.getUserById(expected.id)
      check(!found.error && found.data.user?.email === email, `Exact ${actor} identity verified`)
      const link = await service.auth.admin.generateLink({ type: 'magiclink', email })
      if (link.error || !link.data.properties || link.data.user.id !== expected.id) throw new Error('Local login unavailable')
      const owner = createClient(status.API_URL, status.ANON_KEY, options)
      const auth = await owner.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
      check(!auth.error && auth.data.user?.id === expected.id, `${actor} authenticated`)
      return { owner, id: expected.id as string }
    }
    try {
      const athlete = await login('athlete'), foreign = await login('foreign'), week = reviewedC2rWeek()
      const proposals = await athlete.owner.from('adaptation_proposals').select('id').eq('program_id', fixture.programId)
      check(!proposals.error && proposals.data?.length === 1, 'Browser created exactly one proposal')
      const proposalId = proposals.data![0].id
      const saved = await fetchReviewedProposalState(athlete.owner, athlete.id, proposalId)
      check(saved?.status === 'accepted' && saved.activePlanVersionId === saved.planVersionId && !saved.acceptanceAvailable, 'Browser acceptance is active and immutable on fresh authenticated read')
      check(doseContentHash(saved?.plan) === doseContentHash(week.target), 'Browser accepted the exact pinned complete target week')
      check(saved?.doseDecision?.historical.includes('prior prescribed RPE unknown') && saved.doseDecision.proposed.includes('170 lb total'), 'Historical unknown effort and trial prescription remain distinct')
      const base = await athlete.owner.from('training_plan_versions').select('intent').eq('id', fixture.baseId).single()
      check(!base.error && doseContentHash(base.data.intent.reviewed_week) === doseContentHash(week.base), 'Browser acceptance left original base unchanged')
      const sessions = await athlete.owner.from('coach_effective_prescribed_sessions').select('prescription').eq('plan_version_id', saved!.planVersionId).order('session_index')
      check(!sessions.error && doseContentHash(sessions.data.map(row => row.prescription)) === doseContentHash(week.target.scheduledSessions.map(slot => slot.prescription)), 'All three effective sessions retain exact schema2 prescriptions')
      const work = await athlete.owner.from('workouts').select('id,blocks').eq('user_id', athlete.id)
      check(!work.error && work.data.length === 1 && work.data[0].blocks[0].movements[0].load === 165, 'No 170lb performance or duplicate historical workout fabricated')
      check(await fetchReviewedProposalState(foreign.owner, foreign.id, proposalId) === null, 'Foreign owner cannot read the browser-created proposal')
      Object.assign(evidence, { status: 'passed', proposalId, planVersionId: saved!.planVersionId, programId: fixture.programId,
        baseId: fixture.baseId, targetDigest: doseContentHash(saved!.plan), finishedAt: new Date().toISOString() }); save()
    } catch (error) { evidence.status = 'failed'; evidence.failure = error instanceof Error ? error.message : 'Unknown readback failure'; save(); throw error }
  }, 30000)
})
