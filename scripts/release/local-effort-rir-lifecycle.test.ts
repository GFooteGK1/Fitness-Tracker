/** Explicit opt-in Auth/PostgREST proof on the retained loopback stack only.
 * Every intended identity/payload is retained before its mutation. Failed runs
 * stop for inspection; this runner never reseeds or automatically resumes them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { effortWorkInput, effortWorkPlan } from '../../test/fixtures/reviewed-effort-work'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { reviewedSetReport } from '../../test/fixtures/reviewed-set-report'
import { reviewedCompletion } from '../../test/fixtures/reviewed-completion'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { prepareReviewedWeekProposalRegistration } from '@/app/lib/coach/reviewed-proposal-registration'
import { createReviewedWeekProposalIssuer } from '@/app/lib/coach/reviewed-proposal-issuer-server'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'

describe.skipIf(process.env.SOCIUS_LOCAL_EFFORT_RIR_TEST !== 'true')('real local effort/RIR lifecycle', () => {
  it('preserves exact prescriptions, independent actuals, omissions, ownership and request recovery', async () => {
    const runId = process.env.SOCIUS_LOCAL_EFFORT_RIR_RUN
    if (!runId || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(runId)) throw new Error('Explicit run UUID required')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Nonlocal target denied')
    const directory = `output/app-quality-release/reviewed-effort-rir-${runId}`
    if (existsSync(directory)) throw new Error('Run already exists; inspect retained requests instead of reseeding')
    mkdirSync(directory)
    const base = reviewedRollingWeek(), target = effortWorkPlan(), compiled = effortWorkInput()
    const users = ['athlete', 'foreign'].map(actor => ({ actor, id: randomUUID(), email: `effort-rir-${runId}-${actor}@sociusfit-local.invalid` }))
    const programId = randomUUID(), baseId = randomUUID()
    const baseSessionIds = base.plan.scheduledSessions.map(() => randomUUID())
    const proposalRequest = { reviewId: `effort-rir-${runId}`, registrationId: randomUUID(), requestId: randomUUID() }
    const keys = Object.fromEntries(['original', 'correction', 'omitted', 'invalidOmitted', 'foreignSet', 'neverWritten', 'complete'].map(key => [key, randomUUID()]))
    const checks: string[] = [], journal: Array<Record<string, unknown>> = []
    const receipt: Record<string, unknown> = { runId, target: status.API_URL, status: 'running',
      purpose: 'Mechanical integration fixture; no athlete prescription approval or runtime activation',
      users, programId, baseId, baseSessionIds, proposalRequest, keys, checks, journal }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(message); save() }
    const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
    const before = (name: string, payload: unknown) => {
      const entry: Record<string, unknown> = { name, payload, disposition: 'pending', attemptedAt: new Date().toISOString() }
      journal.push(entry); save(); return entry
    }
    const after = (entry: Record<string, unknown>, error: { code?: string; message?: string } | null, data?: unknown) => {
      // A transport failure is never evidence that a write did not happen.
      entry.disposition = error ? 'inspect_required' : 'response_received'
      if (error) entry.error = { code: error.code ?? null, message: error.message ?? 'Unspecified failure' }
      else if (data !== undefined) entry.result = data
      save()
    }
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== status.API_URL) throw new Error('Nonlocal request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }
    const client = (service = false) => createClient(status.API_URL, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
    const service = client(true), actors = new Map<string, SupabaseClient>()
    save()
    try {
      for (const user of users) {
        const password = randomUUID() + randomUUID()
        const event = before('create_synthetic_identity', user)
        const made = await service.auth.admin.createUser({ id: user.id, email: user.email, password, email_confirm: true })
        after(event, made.error, { id: made.data.user?.id ?? null })
        check(!made.error && made.data.user?.id === user.id, `Synthetic ${user.actor} identity matches retained ID`)
        const owner = client(), auth = await owner.auth.signInWithPassword({ email: user.email, password })
        check(!auth.error && auth.data.user?.id === user.id, `Synthetic ${user.actor} authenticated`)
        actors.set(user.actor, owner)
      }
      const owner = actors.get('athlete')!, foreign = actors.get('foreign')!, userId = users[0].id
      const write = async (name: string, payload: unknown, call: () => PromiseLike<{ error: { code?: string; message?: string } | null; data?: unknown }>) => {
        const event = before(name, payload), result = await call(); after(event, result.error, result.data)
        check(!result.error, `${name} succeeds (${result.error?.code ?? 'ok'})`); return result.data
      }
      const profile = { user_id: userId, fitness_goals: ['performance'], body_metrics: { age: 35, height_cm: 175, weight_kg: 75 },
        preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } }
      await write('Synthetic profile provision', profile, () => owner.from('user_profiles').upsert(profile))
      await write('Synthetic revision initialization', {}, () => owner.rpc('get_coach_context_revision'))
      const program = { id: programId, user_id: userId, title: 'Mechanical effort/RIR integration', goal_summary: 'Not a coaching review',
        start_date: base.plan.windowStart, end_date: base.plan.windowEnd, status: 'draft', program_mode: 'rolling_weekly' }
      await write('Synthetic program seed', program, () => service.from('training_programs').insert(program))
      const plan = { id: baseId, program_id: programId, user_id: userId, version: 1, status: 'accepted', accepted_at: new Date().toISOString(),
        reference_version: 'local-effort-rir-test', policy_version: 'initial-dose-0.2.0', plan_mode: 'rolling_weekly',
        window_start: base.plan.windowStart, window_end: base.plan.windowEnd, sequence_number: 1, intent: base.intent, input_snapshot: {} }
      await write('Synthetic base seed', plan, () => service.from('training_plan_versions').insert(plan))
      await write('Synthetic base activation', { programId, baseId }, () => service.from('training_programs')
        .update({ status: 'active', active_plan_version_id: baseId }).eq('id', programId).eq('user_id', userId))
      const sessions = base.plan.scheduledSessions.map((slot, index) => ({ id: baseSessionIds[index], user_id: userId, program_id: programId,
        plan_version_id: baseId, week_number: 1, session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription }))
      await write('Synthetic base sessions seed', sessions, () => service.from('prescribed_sessions').insert(sessions))
      const scope = { programId, basePlanVersionId: baseId, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 0), historyDays: 28, tzOffset: 0 }
      const source = await fetchReviewedDoseContext(owner, scope)
      check(source.userId === userId && source.binding.history.workouts.length === 0, 'Authenticated source reader preserves empty history as unknown older history')
      const { profile: _profile, ...context } = compiled.input.context; void _profile
      const entry: TrustedReviewedWeekRegistration = { id: proposalRequest.reviewId, userId, scope, contextHash: source.contextHash,
        compilation: { ...compiled.input, context }, reviewedWeeks: compiled.registry }
      writeFileSync(`${directory}/registry.json`, JSON.stringify([entry], null, 2))
      const prepared = await prepareReviewedWeekProposalRegistration(owner, entry.id, [entry])
      check(prepared.kind === 'prepared_registration', 'Authenticated reader prepares exact schema3 mechanical week')
      if (prepared.kind !== 'prepared_registration') throw new Error(prepared.reasons.join('; '))
      writeFileSync(`${directory}/packet.json`, JSON.stringify(prepared, null, 2))
      const issue = createReviewedWeekProposalIssuer({ registry: [entry], enabled: () => true, createServiceClient: () => service })
      const issueEvent = before('issue_reviewed_week', proposalRequest), issued = await issue(owner, proposalRequest)
      issueEvent.result = issued; issueEvent.disposition = issued.kind === 'issued' ? 'response_received' : 'inspect_required'; save()
      check(issued.kind === 'issued', 'Real issuer saves schema3 mechanical proposal')
      if (issued.kind !== 'issued') throw new Error(issued.kind)
      receipt.issued = issued; save()
      const replayEvent = before('replay_confirmed_issuance', proposalRequest), replay = await issue(owner, proposalRequest)
      replayEvent.result = replay; replayEvent.disposition = replay.kind === 'issued' ? 'response_received' : 'inspect_required'; save()
      check(replay.kind === 'issued' && replay.replayed && replay.proposalId === issued.proposalId && replay.planVersionId === issued.planVersionId, 'Confirmed issuance replay retains original identities')
      const rpc = async (db: SupabaseClient, name: string, args: Record<string, unknown>) => {
        const event = before(name, args), result = await db.rpc(name, args); after(event, result.error, result.data); return result
      }
      const foreignRegistration = await foreign.rpc('get_reviewed_week_registration', { p_registration_id: proposalRequest.registrationId })
      check(!foreignRegistration.error && foreignRegistration.data === null, 'Foreign registration read reveals nothing')
      check(await fetchReviewedProposalState(foreign, users[1].id, issued.proposalId) === null, 'Foreign proposal read reveals nothing')
      const acceptArgs = { p_proposal_id: issued.proposalId, p_idempotency_key: proposalRequest.requestId }
      check((await rpc(foreign, 'accept_adaptation_proposal', acceptArgs)).error?.code === 'P0002', 'Foreign acceptance denied')
      const accepted = await rpc(owner, 'accept_adaptation_proposal', acceptArgs)
      check(!accepted.error, 'Schema3 mechanical proposal accepted by owner')
      const acceptReplay = await rpc(owner, 'accept_adaptation_proposal', acceptArgs)
      check(!acceptReplay.error && same(accepted.data, acceptReplay.data), 'Confirmed acceptance replay returns original result')
      const saved = await fetchReviewedProposalState(owner, userId, issued.proposalId)
      check(saved?.status === 'accepted' && same(saved.plan, target), 'Authenticated adapter returns exact accepted complete week')
      const baseRead = await owner.from('training_plan_versions').select('intent').eq('id', baseId).single()
      check(!baseRead.error && same(baseRead.data?.intent, base.intent), 'Original base prescription remains unchanged')
      const effective = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', issued.planVersionId).order('session_index')
      check(!effective.error && same(effective.data?.map(row => row.prescription), target.scheduledSessions.map(slot => slot.prescription)), 'Effective sessions retain exact effort targets and optional timing')
      const sessionId = effective.data![0].id as string; receipt.sessionId = sessionId; save()
      const initial = await fetchReviewedSessionState(owner, userId, sessionId)
      check(initial?.writable && initial.prescription.schemaVersion === 3 && initial.reports.length === 0, 'Session adapter exposes writable schema3 with no invented actuals')
      const first = { ...reviewedSetReport('required-work'), schemaVersion: 2 as const, repetitions: 24, rir: 2.5, load: null }
      const setArgs = (key: string, report: unknown) => ({ p_session_id: sessionId, p_request_id: key, p_report: report })
      const firstSaved = await rpc(owner, 'record_reviewed_session_set', setArgs(keys.original, first))
      check(!firstSaved.error && firstSaved.data?.length === 1, 'Actual RIR2.5 and RPE7 saved independently')
      const firstId = firstSaved.data[0].id as string
      const setReplay = await rpc(owner, 'record_reviewed_session_set', setArgs(keys.original, first))
      check(!setReplay.error && setReplay.data?.[0].id === firstId && setReplay.data[0].replayed, 'Confirmed set replay returns original report')
      const resolutionArgs = (operation: string, key: string, payload: unknown) => ({ p_session_id: sessionId, p_operation: operation, p_request_id: key, p_payload: payload })
      const recovered = await rpc(owner, 'resolve_reviewed_session_request', resolutionArgs('set', keys.original, first))
      check(!recovered.error && recovered.data?.disposition === 'saved' && same(recovered.data.payload, first) && recovered.data.result.id === firstId, 'Saved request recovery preserves original independent RIR')
      check((await rpc(owner, 'resolve_reviewed_session_request', resolutionArgs('set', keys.original, { ...first, rir: 4 }))).error?.code === '22023', 'Changed RIR under saved request identity rejected')
      check((await rpc(foreign, 'record_reviewed_session_set', setArgs(keys.foreignSet, first))).error?.code === 'P0002', 'Foreign set write denied')
      check((await rpc(foreign, 'resolve_reviewed_session_request', resolutionArgs('set', keys.original, first))).error?.code === 'P0002', 'Foreign set recovery denied')
      const hidden = await foreign.from('coach_reviewed_set_reports').select('id').eq('prescribed_session_id', sessionId)
      check(!hidden.error && hidden.data?.length === 0, 'RLS hides owned actual reports from foreign identity')
      const never = { ...first, setNumber: 2 }
      const noWrite = await rpc(owner, 'resolve_reviewed_session_request', resolutionArgs('set', keys.neverWritten, never))
      check(!noWrite.error && noWrite.data?.disposition === 'no_write', 'Unsaved request receives explicit no-write resolution')
      check((await rpc(owner, 'record_reviewed_session_set', setArgs(keys.neverWritten, never))).error?.code === '55000', 'No-write resolution fences a late original write')
      const correction = { ...first, revision: 2, rir: 1.5 }
      const corrected = await rpc(owner, 'record_reviewed_session_set', setArgs(keys.correction, correction))
      check(!corrected.error && corrected.data?.[0].id !== firstId, 'RIR correction appends a distinct historical report')
      const omitted = { ...first, activityId: 'optional-work', side: 'left' as const, status: 'not_performed' as const,
        repetitions: null, rir: null, rpe: null, restAfterSeconds: null }
      check((await rpc(owner, 'record_reviewed_session_set', setArgs(keys.invalidOmitted, { ...omitted, rir: 2 }))).error?.code === '22023', 'Skipped optional work rejects invented RIR')
      const skipped = await rpc(owner, 'record_reviewed_session_set', setArgs(keys.omitted, omitted))
      check(!skipped.error && skipped.data?.[0].id, 'Skipped optional work saved with unknown actuals')
      const correctedId = corrected.data[0].id as string, skippedId = skipped.data[0].id as string
      const state = await fetchReviewedSessionState(owner, userId, sessionId)
      check(state?.reports.length === 3 && same(state.reports.find(row => row.id === firstId)?.report, first)
        && same(state.reports.find(row => row.id === correctedId)?.report, correction)
        && same(state.reports.find(row => row.id === skippedId)?.report, omitted)
        && same(state.latestReportIds, [correctedId, skippedId].sort()), 'Authenticated state preserves history and exact current completion manifest')
      const completion = reviewedCompletion([correctedId, skippedId])
      const completeArgs = { p_session_id: sessionId, p_request_id: keys.complete, p_request: completion }
      check((await rpc(foreign, 'complete_reviewed_session', completeArgs)).error?.code === 'P0002', 'Foreign session completion denied')
      const completed = await rpc(owner, 'complete_reviewed_session', completeArgs)
      check(!completed.error && completed.data?.result.workout_id && !completed.data.result.replayed, 'Owner completes schema3 session once')
      receipt.completed = completed.data; save()
      const completionReplay = await rpc(owner, 'complete_reviewed_session', completeArgs)
      check(!completionReplay.error && completionReplay.data.result.replayed
        && completionReplay.data.result.workout_id === completed.data.result.workout_id, 'Confirmed completion replay retains original workout')
      const resolvedCompletion = await rpc(owner, 'resolve_reviewed_session_request', resolutionArgs('complete', keys.complete, completion))
      check(!resolvedCompletion.error && resolvedCompletion.data.disposition === 'saved' && same(resolvedCompletion.data.payload, completion)
        && resolvedCompletion.data.result.result.workout_id === completed.data.result.workout_id, 'Completion recovery returns original saved request and workout')
      const workout = await owner.from('workouts').select('id,blocks').eq('id', completed.data.result.workout_id).single()
      check(!workout.error && workout.data?.blocks.every((block: { block_type: string }) => block.block_type === 'STRENGTH'), 'Effort-led sets project to strength work')
      const actuals = workout.data!.blocks.flatMap((block: { movements: Array<Record<string, unknown>> }) => block.movements)
      const actual = actuals.find((row: Record<string, unknown>) => row.setReportId === correctedId)
      const skip = actuals.find((row: Record<string, unknown>) => row.setReportId === skippedId)
      check(actual?.rir === 1.5 && actual.reps === 24 && actual.sets === 1 && actual.completed === true && same(actual.effort, first.rpe), 'Completed workout retains corrected RIR independently of unchanged RPE')
      check(skip?.rir === null && skip.reps === null && skip.effort === null && skip.sets === 0 && skip.completed === false
        && actuals.reduce((sum: number, row: { sets: number }) => sum + row.sets, 0) === 1, 'Skipped optional work contributes zero performed volume')
      const workouts = await owner.from('workouts').select('id', { count: 'exact' }).eq('user_id', userId)
      check(!workouts.error && workouts.count === 1, 'Replay and recovery produce exactly one owned workout')
      const finalState = await fetchReviewedSessionState(owner, userId, sessionId)
      check(finalState?.status === 'completed' && !finalState.writable && same(finalState.prescription, target.scheduledSessions[0].prescription), 'Completed readback retains original schema3 prescription and becomes nonwritable')
      receipt.status = 'passed'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ runId, checks: checks.length, status: receipt.status, receipt: `${directory}/receipt.json` }))
    } catch (error) {
      receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message : 'Unknown local failure'; save(); throw error
    }
  }, 120000)
})
