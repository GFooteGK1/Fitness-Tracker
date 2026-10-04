/** Explicit opt-in real local Auth/PostgREST proof; preserves all created evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { reviewedC2rWeek, reviewedC2rWorkout } from '../../test/fixtures/reviewed-c2r-week'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { reviewedDoseWorkoutHash } from '@/app/lib/coach/reviewed-dose-week-reconciliation'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { prepareReviewedWeekProposalRegistration } from '@/app/lib/coach/reviewed-proposal-registration'
import { createReviewedWeekProposalIssuer } from '@/app/lib/coach/reviewed-proposal-issuer-server'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import { captureProvenance } from '@/app/lib/capture/contracts'

describe.skipIf(process.env.SOCIUS_LOCAL_C2R_TEST !== 'true')('real local C2-R lifecycle', () => {
  it('preserves exact reviewed basis, fences corrected source and prepares a separate Next fixture', async () => {
    const runId = process.env.SOCIUS_LOCAL_C2R_RUN
    if (!runId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId)) throw new Error('Explicit run UUID required')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Nonlocal target denied')
    const directory = `output/app-quality-release/reviewed-c2r-${runId}`
    const resumeMode = process.env.SOCIUS_LOCAL_C2R_RESUME
    if (resumeMode && !['captured-clock', 'amendment-shape'].includes(resumeMode)) throw new Error('Unknown resume mode')
    const resume = Boolean(resumeMode), resumeCorrection = resumeMode === 'amendment-shape'
    const previous = resume ? JSON.parse(readFileSync(`${directory}/receipt.json`, 'utf8')) : null
    const validId = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
    const archivePath = `${directory}/before-${resumeMode}-resume.json`
    if (resume && (previous.runId !== runId || previous.status !== 'failed' || previous.users.length !== 3
      || previous.target !== status.API_URL || previous.users.map((user: { actor: string }) => user.actor).sort().join(',') !== 'athlete,correction,foreign'
      || previous.users.some((user: { id: string }) => !validId(user.id)) || new Set(previous.users.map((user: { id: string }) => user.id)).size !== 3
      || previous.programs[0].actor !== 'athlete'
      || !validId(previous.programs[0].programId) || !validId(previous.programs[0].baseId)
      || !validId(previous.athleteWorkoutId) || existsSync(archivePath))) throw new Error('Unsupported resume checkpoint')
    if (resume && !resumeCorrection && (previous.checks.length !== 13 || previous.programs.length !== 1 || previous.successRequest || previous.correctionRequest
      || previous.failure !== 'Performed evidence retrieval is incomplete or requires review')) throw new Error('Unsupported clock resume checkpoint')
    if (resumeCorrection && (previous.checks.length !== 45 || previous.programs.length !== 2 || previous.programs[1].actor !== 'correction'
      || !validId(previous.programs[1].programId) || !validId(previous.programs[1].baseId) || !validId(previous.correctionWorkoutId)
      || !validId(previous.amendmentId) || !validId(previous.success?.proposalId) || !validId(previous.correctionProposal?.proposalId)
      || previous.failure !== 'Owned source correction saved to separate synthetic actor')) throw new Error('Unsupported amendment resume checkpoint')
    if (!resume && existsSync(directory)) throw new Error('Run already exists; inspect and resume its evidence, do not reseed')
    if (resume) writeFileSync(archivePath, JSON.stringify(previous, null, 2))
    else mkdirSync(directory)
    const checks: string[] = previous?.checks ?? [], users: Array<{ actor: string; id: string }> = previous?.users ?? [],
      programs: Array<{ programId: string; baseId: string; actor: string }> = previous?.programs ?? []
    const receipt: Record<string, unknown> = { ...previous, runId, target: status.API_URL, status: 'running', checks, users, programs }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(message); save() }
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== status.API_URL) throw new Error('Nonlocal request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }
    const client = (service = false) => createClient(status.API_URL, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
    const actors = new Map<string, SupabaseClient>()
    // Service credentials are held only in this process, never written to evidence.
    const service = client(true)
    save()
    try {
      for (const actor of ['athlete', 'correction', 'foreign']) {
        const email = `c2r-${runId}-${actor}@sociusfit-local.invalid`, password = randomUUID() + randomUUID()
        const retained = users.find(user => user.actor === actor)
        if (retained) {
          const found = await service.auth.admin.getUserById(retained.id)
          check(!found.error && found.data.user?.email === email, `Retained ${actor} identity verified`)
          const link = await service.auth.admin.generateLink({ type: 'magiclink', email })
          check(!link.error && link.data.user?.id === retained.id, `Retained ${actor} local login issued`)
          if (link.error || !link.data.properties) throw new Error('Retained local login unavailable')
          const owner = client(), auth = await owner.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
          check(!auth.error && auth.data.user?.id === retained.id, `Retained ${actor} authenticated`)
          actors.set(actor, owner); continue
        }
        if (resume) throw new Error('Retained actor missing; refusing to reseed')
        const made = await service.auth.admin.createUser({ email, password, email_confirm: true })
        check(!made.error && made.data.user?.id, `Synthetic ${actor} created (${made.error?.code ?? 'ok'})`)
        const id = made.data.user!.id; users.push({ actor, id }); save()
        const owner = client(), auth = await owner.auth.signInWithPassword({ email, password })
        check(!auth.error && auth.data.user?.id === id, `Synthetic ${actor} authenticated`); actors.set(actor, owner)
      }
      const week = reviewedC2rWeek()
      const sourceIds = new Map<string, string>()
      if (previous) sourceIds.set('athlete', previous.athleteWorkoutId)
      if (resumeCorrection) sourceIds.set('correction', previous.correctionWorkoutId)
      let reuseBase = resume
      const seed = async (actor: 'athlete' | 'correction') => {
        const owner = actors.get(actor)!, userId = users.find(user => user.actor === actor)!.id
        if (!sourceIds.has(actor)) {
          const profile = await owner.from('user_profiles').upsert({ user_id: userId, fitness_goals: ['performance'],
            body_metrics: { age: 35, height_cm: 175, weight_kg: 75 }, preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } })
          check(!profile.error, `Synthetic ${actor} profile provisioned`)
          check(!(await owner.rpc('get_coach_context_revision')).error, `Synthetic ${actor} revision initialized`)
          const sourceId = randomUUID(); sourceIds.set(actor, sourceId); receipt[`${actor}WorkoutId`] = sourceId; save()
          const source = reviewedC2rWorkout(userId), captured = new Date().toISOString()
          const inserted = await owner.from('workouts').insert({ ...source, id: sourceId, created_at: captured, updated_at: captured,
            notes: 'Synthetic C2-R: crisp reps, no pain, normal recovery, 180 second rests; older history unknown.',
            input_text: 'Bench 165 lb 3x6; actual set RPE7/7/7.', capture_provenance: captureProvenance('workout', 'athlete_reported', 'athlete_confirmed') })
          check(!inserted.error, `Synthetic ${actor} historical source saved (${inserted.error?.code ?? 'ok'})`)
          const stored = await owner.from('workouts').select('captured_at').eq('id', sourceId).single()
          const delay = Date.parse(stored.data?.captured_at) - Date.now() + 100
          check(!stored.error && Number.isFinite(delay) && delay < 5000, 'New historical source capture clock is bounded')
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
        }
        const retained = reuseBase && actor === (resumeCorrection ? 'correction' : 'athlete') ? programs[resumeCorrection ? 1 : 0] : null
        if (retained) reuseBase = false
        const programId = retained?.programId ?? randomUUID(), baseId = retained?.baseId ?? randomUUID()
        if (!retained) { programs.push({ programId, baseId, actor }); save() }
        const writes = [
          () => service.from('training_programs').insert({ id: programId, user_id: userId, title: 'Synthetic C2-R local integration',
            goal_summary: 'Exact reviewed synthetic reference', start_date: week.base.windowStart, end_date: week.base.windowEnd, status: 'draft', program_mode: 'rolling_weekly' }),
          () => service.from('training_plan_versions').insert({ id: baseId, program_id: programId, user_id: userId, version: 1, status: 'accepted', accepted_at: new Date().toISOString(),
            reference_version: 'local-c2r-test', policy_version: 'initial-dose-0.2.0', plan_mode: 'rolling_weekly', window_start: week.base.windowStart,
            window_end: week.base.windowEnd, sequence_number: 1, intent: { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: week.base }, input_snapshot: {} }),
          () => service.from('training_programs').update({ status: 'active', active_plan_version_id: baseId }).eq('id', programId).eq('user_id', userId),
          () => service.from('prescribed_sessions').insert(week.base.scheduledSessions.map((slot, index) => ({ id: randomUUID(), user_id: userId, program_id: programId,
            plan_version_id: baseId, week_number: 1, session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription }))),
        ]
        if (!retained) for (const [index, write] of writes.entries()) { const result = await write(); check(!result.error, `New ${actor} program seed ${index} (${result.error?.code ?? 'ok'})`) }
        else {
          const base = await owner.from('training_plan_versions').select('intent').eq('id', baseId).single()
          const sessions = await owner.from('prescribed_sessions').select('prescription').eq('plan_version_id', baseId).order('session_index')
          check(!base.error && doseContentHash(base.data?.intent.reviewed_week) === doseContentHash(week.base)
            && !sessions.error && doseContentHash(sessions.data?.map(row => row.prescription)) === doseContentHash(week.base.scheduledSessions.map(slot => slot.prescription)),
          'Retained base and sessions verified unchanged without reseeding')
        }
        const scope = { programId, basePlanVersionId: baseId, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300), historyDays: 90, tzOffset: 300 }
        const source = await fetchReviewedDoseContext(owner, scope)
        const row = source.binding.history.workouts.find(item => item.id === sourceIds.get(actor))
        check(row?.user_id === userId && source.binding.history.workouts.length === 1, 'Exactly one owned historical exposure retrieved')
        const reconciliation = structuredClone(week.reconciliation)
        reconciliation.link.factualSources[0] = { ...reconciliation.link.factualSources[0], workoutId: row!.id,
          workoutDate: row!.workout_date, revision: row!.capture_revision!, contentHash: reviewedDoseWorkoutHash(row!) }
        reconciliation.linkHash = doseContentHash(reconciliation.link)
        const { profile: _profile, ...context } = week.input.context; void _profile
        const entry: TrustedReviewedWeekRegistration = { id: `c2r-${programId}`, userId, scope, contextHash: source.contextHash,
          operation: 'reviewed_load_trial', doseReconciliation: reconciliation, compilation: { ...week.input, context }, reviewedWeeks: week.registry }
        const prepared = await prepareReviewedWeekProposalRegistration(owner, entry.id, [entry])
        check(prepared.kind === 'prepared_registration', `Real source reader prepares exact C2-R ${actor} packet`)
        if (prepared.kind !== 'prepared_registration') throw new Error(prepared.reasons.join('; '))
        return { owner, userId, programId, baseId, entry, prepared }
      }
      if (resumeCorrection) {
        const actor = users.find(user => user.actor === 'athlete')!, owner = actors.get('athlete')!
        const saved = await fetchReviewedProposalState(owner, actor.id, previous.success.proposalId)
        check(saved?.status === 'accepted' && doseContentHash(saved.plan) === doseContentHash(week.target), 'Prior successful acceptance remains unchanged')
        const correctionOwner = actors.get('correction')!, correctionUser = users.find(user => user.actor === 'correction')!
        const source = await correctionOwner.from('workouts').select('capture_revision,blocks').eq('id', previous.correctionWorkoutId).single()
        const mutation = await correctionOwner.from('activity_mutations').select('id').eq('user_id', correctionUser.id).eq('request_key', previous.amendmentId)
        check(!source.error && source.data.capture_revision === 1 && doseContentHash(source.data.blocks) === doseContentHash(reviewedC2rWorkout(correctionUser.id).blocks)
          && !mutation.error && mutation.data.length === 0, 'Rejected amendment confirmed unsaved before corrected submission')
      } else {
      const good = await seed('athlete')
      const issue = createReviewedWeekProposalIssuer({ registry: [good.entry], enabled: () => true, createServiceClient: () => service })
      const request = { reviewId: good.entry.id, registrationId: randomUUID(), requestId: randomUUID() }; receipt.successRequest = request; save()
      const issued = await issue(good.owner, request)
      check(issued.kind === 'issued', 'Real issuer registers and saves exact C2-R proposal')
      if (issued.kind !== 'issued') throw new Error(issued.kind)
      receipt.success = issued; save()
      const replay = await issue(good.owner, request)
      check(replay.kind === 'issued' && replay.proposalId === issued.proposalId && replay.planVersionId === issued.planVersionId, 'Exact issuance retry retains original identities')
      check(await fetchReviewedProposalState(actors.get('foreign')!, users.find(user => user.actor === 'foreign')!.id, issued.proposalId) === null, 'Foreign proposal read is denied')
      const accepted = await good.owner.rpc('accept_adaptation_proposal', { p_proposal_id: issued.proposalId, p_idempotency_key: request.requestId })
      check(!accepted.error, `Real C2-R acceptance succeeds (${accepted.error?.code ?? 'ok'})`)
      const again = await good.owner.rpc('accept_adaptation_proposal', { p_proposal_id: issued.proposalId, p_idempotency_key: request.requestId })
      check(!again.error && doseContentHash(accepted.data) === doseContentHash(again.data), 'Acceptance replay returns original result')
      const saved = await fetchReviewedProposalState(good.owner, good.userId, issued.proposalId)
      check(saved?.status === 'accepted' && doseContentHash(saved.plan) === doseContentHash(week.target), 'Exact accepted whole week reads through authenticated adapter')
      check(saved?.doseDecision?.historical.includes('prior prescribed RPE unknown') && saved.doseDecision.proposed.includes('170 lb total'), 'Historical unknown and proposed load remain distinct')
      const base = await good.owner.from('training_plan_versions').select('intent').eq('id', good.baseId).single()
      check(!base.error && doseContentHash(base.data.intent.reviewed_week) === doseContentHash(week.base), 'Original accepted base prescription unchanged')
      const sessions = await good.owner.from('coach_effective_prescribed_sessions').select('prescription').eq('plan_version_id', issued.planVersionId).order('session_index')
      check(!sessions.error && doseContentHash(sessions.data.map(row => row.prescription)) === doseContentHash(week.target.scheduledSessions.map(slot => slot.prescription)), 'Effective sessions preserve exact schema2 content')
      }
      const stale = await seed('correction'), staleRequest = resumeCorrection ? previous.correctionRequest : { reviewId: stale.entry.id, registrationId: randomUUID(), requestId: randomUUID() }
      receipt.correctionRequest = staleRequest; save()
      const staleIssue = await createReviewedWeekProposalIssuer({ registry: [stale.entry], enabled: () => true, createServiceClient: () => service })(stale.owner, staleRequest)
      check(staleIssue.kind === 'issued', 'Correction fixture proposal saved before source change')
      if (staleIssue.kind !== 'issued') throw new Error(staleIssue.kind)
      receipt.correctionProposal = staleIssue; save()
      const changed = structuredClone(reviewedC2rWorkout(stale.userId).blocks) as Array<{ block_type?: string; movements: Array<{ effort: number[] }> }>
      changed[0].block_type = 'STRENGTH'
      changed[0].movements[0].effort = [9, 9, 9]
      const amendmentId = resumeCorrection ? previous.amendmentId : randomUUID(); receipt.amendmentId = amendmentId; save()
      const correction = await stale.owner.rpc('amend_logged_activity', {
        p_kind: 'workout', p_entity_id: sourceIds.get('correction')!, p_expected_revision: 1, p_request_id: amendmentId,
        p_record: { workout_date: reviewedC2rWorkout(stale.userId).workout_date, blocks: changed,
          input_text: 'Synthetic correction: bench 165 lb 3x6; actual set RPE9/9/9.', notes: 'Corrected actual set effort.' },
        p_blocks: changed.map(() => ({})), p_provenance: captureProvenance('workout', 'athlete_reported', 'corrected'),
      })
      if (correction.error) { receipt.amendmentError = { code: correction.error.code, message: correction.error.message }; save() }
      check(!correction.error, 'Owned source correction saved to separate synthetic actor')
      receipt.amendment = correction.data; save()
      const capturedAt = Date.parse(correction.data?.capturedAt)
      const clockSkew = capturedAt - Date.now()
      check(Number.isFinite(capturedAt) && clockSkew <= 5000, 'Correction timestamp is valid within bounded local clock skew')
      if (clockSkew >= 0) await new Promise(resolve => setTimeout(resolve, clockSkew + 10))
      const blocked = await stale.owner.rpc('accept_adaptation_proposal', { p_proposal_id: staleIssue.proposalId, p_idempotency_key: staleRequest.requestId })
      check(blocked.error?.code === '40001', 'Source correction prevents stale C2-R acceptance')
      check((await prepareReviewedWeekProposalRegistration(stale.owner, stale.entry.id, [stale.entry])).kind === 'review_required', 'Corrected source does not regenerate the trial')
      const staleRead = await fetchReviewedProposalState(stale.owner, stale.userId, staleIssue.proposalId)
      check(staleRead?.acceptanceAvailable === false && staleRead.activePlanVersionId === stale.baseId && staleRead.doseDecision?.proposed.includes('170 lb total'), 'Stale historical proposal preserved while original base remains active')
      const next = await seed('athlete')
      writeFileSync(`${directory}/registry.json`, JSON.stringify([next.entry], null, 2))
      writeFileSync(`${directory}/fixture.json`, JSON.stringify({ runId, programId: next.programId, baseId: next.baseId,
        users: users.filter(user => user.actor !== 'correction'), registryHash: doseContentHash([next.entry]),
        registrySha256: createHash('sha256').update(readFileSync(`${directory}/registry.json`)).digest('hex') }, null, 2))
      check(true, 'Separate untouched Next fixture and fixed registry saved without issuing it')
      receipt.status = 'passed'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ runId, checks: checks.length, receipt: `${directory}/receipt.json`, status: receipt.status }))
    } catch (error) {
      receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message : 'Unknown local failure'; save(); throw error
    }
  }, 120000)
})
