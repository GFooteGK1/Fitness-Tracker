/** Fresh Auth/PostgREST readback of the actual browser lifecycle. No training writes. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'

describe.skipIf(process.env.SOCIUS_LOCAL_EFFORT_NEXT_READBACK !== 'true')('browser effort/RIR readback', () => {
  it('verifies saved UI prescription, actual correction, omissions and ownership', async () => {
    const id = process.env.SOCIUS_LOCAL_EFFORT_NEXT_RUN
    const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
    if (!id || !uuid.test(id)) throw new Error('Explicit runtime UUID required')
    const directory = `output/app-quality-release/reviewed-next-${id}`
    const runtime = JSON.parse(readFileSync(`${directory}/receipt.json`, 'utf8'))
    if (runtime.id !== id || runtime.sourceKind !== 'effort-rir' || !uuid.test(runtime.sourceRun) || runtime.phase !== 'enabled_copy') throw new Error('Wrong effort runtime')
    const sourceDirectory = `output/app-quality-release/reviewed-effort-browser-${runtime.sourceRun}`
    const fixtureBytes = readFileSync(`${sourceDirectory}/fixture.json`), fixture = JSON.parse(fixtureBytes.toString())
    const registryBytes = readFileSync(`${sourceDirectory}/registry.json`), packetBytes = readFileSync(`${sourceDirectory}/packet.json`)
    const proof = JSON.parse(readFileSync(`${sourceDirectory}/receipt.json`, 'utf8')), packet = JSON.parse(packetBytes.toString())
    const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
    if (fixture.runId !== runtime.sourceRun || proof.runId !== fixture.runId || proof.status !== 'passed'
      || !uuid.test(fixture.authSourceRun) || fixture.authSourceRun !== fixture.sourceRun
      || sha(registryBytes) !== fixture.registrySha256 || sha(registryBytes) !== proof.registrySha256
      || sha(fixtureBytes) !== proof.fixtureSha256 || sha(packetBytes) !== proof.packetSha256
      || packet.kind !== 'prepared_registration' || packet.fingerprint !== fixture.packetFingerprint) throw new Error('Prepared browser fixture changed')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const db = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || db.hostname !== '127.0.0.1' || db.port !== '55322') throw new Error('Nonlocal target denied')
    const path = `${directory}/effort-readback.json`
    if (existsSync(path)) throw new Error('Readback receipt already exists; inspect before another login attempt')
    const checks: string[] = [], authRequests: Array<Record<string, unknown>> = []
    const evidence: Record<string, unknown> = { id, sourceRun: runtime.sourceRun, authSourceRun: fixture.authSourceRun,
      fixtureSha256: sha(fixtureBytes), checks, authRequests, status: 'running' }
    const save = () => writeFileSync(path, JSON.stringify(evidence, null, 2))
    const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(message); save() }
    const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
    const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: ((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== status.API_URL) throw new Error('Nonlocal request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }) as typeof fetch } }
    const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
    const login = async (actor: string) => {
      const expected = fixture.users.find((user: { actor: string; id: string }) => user.actor === actor)
      if (!expected || !uuid.test(expected.id)) throw new Error('Missing retained actor')
      const email = `effort-rir-${fixture.authSourceRun}-${actor}@sociusfit-local.invalid`
      const found = await service.auth.admin.getUserById(expected.id)
      check(!found.error && found.data.user?.id === expected.id && found.data.user.email === email, `Exact ${actor} identity verified`)
      const issue: Record<string, unknown> = { actor, userId: expected.id, action: 'generate_local_login', disposition: 'pending' }
      authRequests.push(issue); save()
      const link = await service.auth.admin.generateLink({ type: 'magiclink', email })
      issue.disposition = link.error ? 'inspect_required' : 'response_received'; save()
      if (link.error || !link.data.properties || link.data.user.id !== expected.id) throw new Error('Retained local login unavailable')
      const owner = createClient(status.API_URL, status.ANON_KEY, options)
      const verification: Record<string, unknown> = { actor, userId: expected.id, action: 'verify_local_login', disposition: 'pending' }
      authRequests.push(verification); save()
      const auth = await owner.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
      verification.disposition = auth.error ? 'inspect_required' : 'response_received'; save()
      check(!auth.error && auth.data.user?.id === expected.id, `${actor} freshly authenticated`)
      return { owner, id: expected.id as string }
    }
    save()
    try {
      const athlete = await login('athlete'), foreign = await login('foreign')
      const rows = await athlete.owner.from('adaptation_proposals').select('id').eq('program_id', fixture.programId)
      check(!rows.error && rows.data?.length === 2, 'Browser added exactly one proposal to the retained successful lifecycle')
      const candidates = rows.data!.filter(row => row.id !== fixture.sourceProposalId)
      check(candidates.length === 1, 'New browser proposal identity is distinct from preserved source proposal')
      const proposalId = candidates[0].id
      const saved = await fetchReviewedProposalState(athlete.owner, athlete.id, proposalId)
      check(saved?.status === 'accepted' && saved.planVersionId === saved.activePlanVersionId && !saved.acceptanceAvailable, 'Browser next-week acceptance remains active on fresh authentication')
      check(same(saved?.plan, packet.packet.intent.reviewed_week) && saved?.plan.sequenceNumber === 2
        && saved.plan.windowStart === '2026-08-10', 'Browser accepted exact pinned schema3 next week')
      const base = await athlete.owner.from('training_plan_versions').select('intent').eq('id', fixture.baseId).single()
      check(!base.error && doseContentHash(base.data?.intent.reviewed_week) === fixture.basePlanHash, 'Browser left original completed week unchanged')
      const effective = await athlete.owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', saved!.planVersionId).order('session_index')
      check(!effective.error && same(effective.data?.map(row => row.prescription), packet.packet.intent.reviewed_week.scheduledSessions.map((slot: { prescription: unknown }) => slot.prescription)), 'Every effective session preserves the complete pinned prescription')
      const sessionId = effective.data![0].id as string
      const session = await fetchReviewedSessionState(athlete.owner, athlete.id, sessionId)
      check(session?.status === 'completed' && !session.writable && session.prescription.schemaVersion === 3, 'Browser-completed schema3 session reads as immutable')
      const reports = session!.reports
      const first = reports.find(row => row.report.activityId === 'required-work' && row.report.setNumber === 1 && row.report.revision === 1)
      const corrected = reports.find(row => row.report.activityId === 'required-work' && row.report.setNumber === 1 && row.report.revision === 2)
      const skipped = reports.find(row => row.report.activityId === 'optional-work' && row.report.side === 'left' && row.report.status === 'not_performed')
      check(reports.length === 3 && first?.report.schemaVersion === 2 && first.report.repetitions === 24 && first.report.rir === 2.5 && first.report.rpe?.value === 7,
        'Browser saved actual reps24 RIR2.5 and RPE7 independently')
      check(corrected?.report.schemaVersion === 2 && corrected.report.rir === 1.5 && corrected.report.rpe?.value === 7
        && corrected.report.repetitions === 24 && corrected.id !== first?.id, 'Browser correction changed RIR while preserving original history and RPE')
      check(skipped?.report.rir === null && skipped.report.rpe === null && skipped.report.repetitions === null
        && same(session!.latestReportIds, [corrected!.id, skipped!.id].sort()), 'Browser omission preserved unknown actuals and exact latest manifest')
      const workouts = await athlete.owner.from('workouts').select('id,blocks').eq('user_id', athlete.id)
      check(!workouts.error && workouts.data?.length === 2, 'One browser completion adds exactly one workout')
      const newWork = workouts.data!.filter(row => row.id !== fixture.completedWorkoutId)
      check(newWork.length === 1, 'Original completed workout is retained alongside new browser workout')
      const actuals = newWork[0].blocks.flatMap((block: { movements: Array<Record<string, unknown>> }) => block.movements)
      const actual = actuals.find((row: Record<string, unknown>) => row.setReportId === corrected!.id)
      const omitted = actuals.find((row: Record<string, unknown>) => row.setReportId === skipped!.id)
      check(actual?.rir === 1.5 && actual.reps === 24 && actual.sets === 1 && same(actual.effort, corrected!.report.rpe), 'Browser workout preserves corrected actual RIR and independent RPE')
      check(omitted?.rir === null && omitted.reps === null && omitted.effort === null && omitted.sets === 0 && omitted.completed === false
        && actuals.reduce((sum: number, row: { sets: number }) => sum + row.sets, 0) === 1, 'Browser skipped work contributes zero completed volume')
      const original = await fetchReviewedSessionState(athlete.owner, athlete.id, fixture.completedSessionId)
      check(original?.status === 'completed' && original.reports.length === 3 && original.reports.some(row => row.report.rir === 1.5), 'Previously completed source session remains preserved')
      check(await fetchReviewedProposalState(foreign.owner, foreign.id, proposalId) === null
        && await fetchReviewedSessionState(foreign.owner, foreign.id, sessionId) === null, 'Foreign actor cannot read the browser proposal or session')
      Object.assign(evidence, { status: 'passed', proposalId, planVersionId: saved!.planVersionId, sessionId,
        workoutId: newWork[0].id, targetDigest: doseContentHash(saved!.plan), finishedAt: new Date().toISOString() }); save()
      console.log(JSON.stringify({ id, checks: checks.length, status: evidence.status, receipt: path }))
    } catch (error) { evidence.status = 'failed'; evidence.failure = error instanceof Error ? error.message : 'Unknown readback failure'; save(); throw error }
  }, 30000)
})
