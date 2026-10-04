/** Opt-in loopback-only registration/acceptance proof. Retains synthetic evidence. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describe, it } from 'vitest'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { buildReviewedRollingWeeklyPlan, buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { prepareReviewedWeekProposalRegistration } from '@/app/lib/coach/reviewed-proposal-registration'
import { createReviewedWeekProposalIssuer } from '@/app/lib/coach/reviewed-proposal-issuer-server'
import { createReviewedHttpHandlers } from '@/app/lib/coach/reviewed-http-server'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedSetReport } from '../../test/fixtures/reviewed-set-report'
import { reviewedCompletion } from '../../test/fixtures/reviewed-completion'

describe.skipIf(process.env.SOCIUS_LOCAL_REVIEWED_PROPOSAL_TEST !== 'true')('local reviewed proposal transactions', () => {
  it('binds private issuance, exact retry and current-source acceptance', async () => {
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Refusing non-local target')
    const runId = randomUUID(), checks: string[] = [], directory = `output/app-quality-release/reviewed-proposal-${runId}`
    mkdirSync(directory)
    const receipt: Record<string, unknown> = { runId, startedAt: new Date().toISOString(), checks, status: 'running', target: status.API_URL }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(label); save() }
    const awaitCapturedTime = async (capturedAt: string) => {
      const delay = Date.parse(capturedAt) - Date.now() + 100
      check(Number.isFinite(delay) && delay < 5000, 'Local fixture clock skew is bounded below five seconds')
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    }
    const options = { auth: { persistSession: false, autoRefreshToken: false } }
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
    const owner = createClient(status.API_URL, status.ANON_KEY, options), foreign = createClient(status.API_URL, status.ANON_KEY, options)
    const createdPrograms: string[] = []; receipt.programIds = createdPrograms
    try {
      const users: string[] = []; receipt.syntheticUserIds = users
      for (const [index, client] of [owner, foreign].entries()) {
        const email = `reviewed-proposal-${runId}-${index}@sociusfit-local.invalid`, password = randomUUID() + randomUUID()
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        check(!created.error && created.data.user?.id, `Synthetic user ${index} created`)
        users.push(created.data.user!.id)
        const auth = await client.auth.signInWithPassword({ email, password })
        check(!auth.error && auth.data.user?.id === users[index], `Synthetic user ${index} authenticated`)
      }
      const userId = users[0]
      const profile = await owner.from('user_profiles').upsert({ user_id: userId, fitness_goals: ['performance'],
        body_metrics: { age: 35, height_cm: 175, weight_kg: 75 }, preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } })
      check(!profile.error, 'Synthetic profile exists')
      const initialized = await owner.rpc('get_coach_context_revision')
      check(!initialized.error, 'Revision initialized before source reads')
      const seed = async (legacySignals = false, begun: boolean | 'started-only' = false) => {
        const reviewed = reviewedRollingWeek(), baseInput = structuredClone(reviewed.input)
        baseInput.context.scheduleId = 'base'
        const base = buildReviewedRollingWeeklyPlan(baseInput, reviewed.registry)
        if (base.kind !== 'reviewed_candidate') throw new Error('Invalid base fixture')
        const legacy = legacySignals ? buildRollingWeeklyPlan({ source: 'initial', windowStart: base.plan.windowStart,
          profile: base.plan.profileSnapshot, direction: base.plan.directionSnapshot }) : null
        if (legacy && legacy.kind !== 'weekly_plan') throw new Error('Expected standard signal fixture')
        const basePlan = legacy ?? base.plan
        const programId = randomUUID(), baseId = randomUUID(); createdPrograms.push(programId); save()
        let write = await admin.from('training_programs').insert({ id: programId, user_id: userId, title: 'Local reviewed proposal',
          goal_summary: 'Synthetic reviewed week', start_date: base.plan.windowStart, end_date: base.plan.windowEnd, status: 'draft', program_mode: 'rolling_weekly' })
        check(!write.error, `Program seed (${write.error?.code ?? 'ok'})`)
        const intent = legacy ? buildStoredRollingWeeklyIntent(legacy, buildAdaptivePlanContract(legacy.profileSnapshot, [legacy]))
          : { format: 'reviewed_weekly_intent_v0_1', horizon_weeks: 1, reviewed_week: base.plan }
        write = await admin.from('training_plan_versions').insert({ id: baseId, user_id: userId, program_id: programId, version: 1,
          status: 'accepted', accepted_at: new Date().toISOString(), reference_version: 'local-test', policy_version: 'initial-dose-0.2.0',
          plan_mode: 'rolling_weekly', window_start: base.plan.windowStart, window_end: base.plan.windowEnd, sequence_number: 1, intent, input_snapshot: {} })
        check(!write.error, `Accepted base seed (${write.error?.code ?? 'ok'})`)
        write = await admin.from('training_programs').update({ status: 'active', active_plan_version_id: baseId }).eq('id', programId)
        check(!write.error, 'Base pointer established')
        const ids = basePlan.scheduledSessions.map(() => randomUUID())
        write = await admin.from('prescribed_sessions').insert(basePlan.scheduledSessions.map((slot, index) => ({
          id: ids[index], user_id: userId, program_id: programId, plan_version_id: baseId, week_number: 1,
          session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription })))
        check(!write.error, 'Base sessions seeded exactly')
        const savedSets: Array<{ p_session_id: string; p_request_id: string; p_report: ReturnType<typeof reviewedSetReport> }> = []
        let savedCompletion: { p_session_id: string; p_request_id: string; p_request: ReturnType<typeof reviewedCompletion> } | null = null
        let completedWorkoutId: string | null = null
        if (begun) {
          for (const index of (begun === 'started-only' ? [3] : [0, 3])) {
            const activity = base.plan.scheduledSessions[index].prescription.content.steps.find(step => step.kind === 'activity')!
            const args = { p_session_id: ids[index], p_request_id: randomUUID(),
              p_report: { ...reviewedSetReport(activity.id), performedAt: new Date().toISOString() } }
            const saved = await owner.rpc('record_reviewed_session_set', args)
            check(!saved.error, `Canonical pre-swap set ${index} saved`); savedSets.push(args)
            if (index === 0) {
              savedCompletion = { p_session_id: ids[index], p_request_id: randomUUID(), p_request: {
                ...reviewedCompletion([saved.data[0].id]), occurredAt: new Date().toISOString(),
                workoutDate: formatUTCAsLocalDateWithOffset(args.p_report.performedAt, 300) } }
              const completed = await owner.rpc('complete_reviewed_session', savedCompletion)
              check(!completed.error, `Canonical pre-swap completion (${completed.error?.code ?? 'ok'})`)
              await awaitCapturedTime(completed.data.receipt.capturedAt)
              const row = await owner.from('prescribed_sessions').select('completed_workout_id').eq('id', ids[index]).single()
              completedWorkoutId = row.data!.completed_workout_id
            }
          }
        }
        const scope = { programId, basePlanVersionId: baseId, historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300), historyDays: 28, tzOffset: 300 }
        const source = await fetchReviewedDoseContext(owner, scope)
        const { profile: _profile, ...context } = reviewed.input.context; void _profile
        const registry = [{ id: 'synthetic-reviewed-swap', userId, scope, contextHash: source.contextHash,
          compilation: { ...reviewed.input, context }, reviewedWeeks: reviewed.registry }]
        const prepared = await prepareReviewedWeekProposalRegistration(owner, registry[0].id, registry)
        check(prepared.kind === 'prepared_registration', 'Fresh owned week packet prepared')
        if (prepared.kind !== 'prepared_registration') throw new Error('No prepared packet')
        const registrationId = randomUUID(), key = randomUUID()
        const args = { p_id: registrationId, p_packet: prepared.packet, p_fingerprint: prepared.fingerprint }
        const signalSession = legacy?.scheduledSessions.flatMap((slot, index) => slot.prescription.blocks.flatMap(block =>
          block.exercises.map((_, exerciseIndex) => ({ sessionId: ids[index], exerciseId: `${block.id}:${exerciseIndex}` }))))[0]
        return { base, programId, baseId, ids, intent, prepared, registrationId, key, args, signalSession, savedSets, savedCompletion, completedWorkoutId, registry }
      }
      const successful = await seed()
      const denied = await owner.rpc('register_reviewed_week_proposal', successful.args)
      check(Boolean(denied.error), 'Athlete cannot register numerical authority')
      const hidden = await owner.from('coach_reviewed_proposal_registrations').select('id')
      check(Boolean(hidden.error), 'Private registry is not readable by athlete')
      const registered = await admin.rpc('register_reviewed_week_proposal', successful.args)
      check(!registered.error, `Service registration (${registered.error?.code ?? 'ok'})`)
      const packet = successful.prepared.packet, week = packet.intent.reviewed_week
      const bypass = await owner.rpc('create_initial_rolling_weekly_proposal', {
        p_title: week.title, p_goal_summary: week.profileSnapshot.athleteGoalSummary, p_window_start: week.windowStart,
        p_goal_target_date: week.directionSnapshot.goalTargetDate, p_direction: week.directionSnapshot,
        p_reference_version: packet.movementCatalogVersion, p_policy_version: packet.policyVersion, p_intent: packet.intent,
        p_input_snapshot: packet.inputSnapshot, p_sessions: packet.sessions,
        p_rationale: { reviewedRegistrationId: successful.registrationId }, p_input_fingerprint: successful.prepared.fingerprint,
        p_idempotency_key: randomUUID(),
      })
      check(bypass.error?.code === '55000', 'Legacy caller-content RPC cannot use a copied registration ID')
      const again = await admin.rpc('register_reviewed_week_proposal', successful.args)
      check(!again.error && doseContentHash(again.data) === doseContentHash(registered.data), 'Registration response-loss retry preserves reserved identities')
      const modified = structuredClone(successful.args); modified.p_packet.intent.reviewed_week.title += ' changed'
      check(Boolean((await admin.rpc('register_reviewed_week_proposal', modified)).error), 'Same registration ID with different content rejected')
      const omitted = structuredClone(successful.args); omitted.p_id = randomUUID(); omitted.p_packet.sessions.pop()
      omitted.p_fingerprint = doseContentHash(omitted.p_packet)
      check((await admin.rpc('register_reviewed_week_proposal', omitted)).error?.code === '22023', 'Incomplete registration session manifest rejected')
      const createArgs = { p_registration_id: successful.registrationId, p_idempotency_key: successful.key }
      check(Boolean((await foreign.rpc('create_registered_reviewed_week_proposal', createArgs)).error), 'Foreign issuance denied')
      const issued = await Promise.all([owner.rpc('create_registered_reviewed_week_proposal', createArgs), owner.rpc('create_registered_reviewed_week_proposal', createArgs)])
      check(issued.every(row => !row.error), `Concurrent exact issuance (${issued.map(row => row.error?.code ?? 'ok').join(',')})`)
      check(issued.every(row => row.data.proposalId === registered.data.proposalId)
        && issued.filter(row => row.data.replayed === false).length === 1, 'Concurrent issuance creates one proposal')
      check(Boolean((await owner.rpc('create_registered_reviewed_week_proposal', { ...createArgs, p_idempotency_key: randomUUID() })).error), 'Registration cannot be issued with a second request key')
      const coexist = await owner.from('training_plan_versions').select('id,status').eq('program_id', successful.programId)
      check(!coexist.error && coexist.data?.length === 2 && coexist.data.some(row => row.status === 'accepted') && coexist.data.some(row => row.status === 'proposed'),
        'Accepted base and proposed same-week swap coexist unchanged')
      const acceptArgs = { p_proposal_id: registered.data.proposalId, p_idempotency_key: successful.key }
      check(Boolean((await foreign.rpc('accept_adaptation_proposal', acceptArgs)).error), 'Foreign acceptance denied')
      const accepted = await Promise.all([owner.rpc('accept_adaptation_proposal', acceptArgs), owner.rpc('accept_adaptation_proposal', acceptArgs)])
      check(accepted.every(row => !row.error && row.data[0].active_plan_version_id === registered.data.planVersionId),
        `Concurrent acceptance/replay (${accepted.map(row => row.error?.code ?? 'ok').join(',')})`)
      const after = await owner.from('training_plan_versions').select('id,status,intent').eq('program_id', successful.programId)
      check(!after.error && after.data?.find(row => row.id === successful.baseId)?.status === 'superseded'
        && doseContentHash(after.data?.find(row => row.id === successful.baseId)?.intent) === doseContentHash(successful.intent)
        && doseContentHash(after.data?.find(row => row.id === registered.data.planVersionId)?.intent) === doseContentHash(successful.prepared.packet.intent),
      'Acceptance preserves old content and exact new intent')
      // A new source row changes the revision but accepted replay stays a readback.
      const newSession = await owner.from('coach_effective_prescribed_sessions').select('id,prescription').eq('plan_version_id', registered.data.planVersionId).order('session_index').limit(1).single()
      const activity = newSession.data!.prescription.content.steps.find((step: { kind: string }) => step.kind === 'activity')
      const set = { ...reviewedSetReport(activity.id), performedAt: new Date().toISOString() }
      const recorded = await owner.rpc('record_reviewed_session_set', { p_session_id: newSession.data!.id, p_request_id: randomUUID(), p_report: set })
      check(!recorded.error, 'New accepted source work recorded')
      check(!(await owner.rpc('accept_adaptation_proposal', acceptArgs)).error, 'Accepted replay survives later source revision')

      for (const scenario of ['started', 'tampered', 'manifest', 'revision', 'clock', 'deadline'] as const) {
        const fixture = await seed()
        if (scenario === 'deadline') {
          fixture.args.p_packet.source.validBefore = '2020-01-01T00:00:00.000Z'
          fixture.args.p_fingerprint = doseContentHash(fixture.args.p_packet)
        }
        if (scenario === 'clock') {
          fixture.args.p_packet.source.validBefore = new Date(Date.now() + 1500).toISOString()
          fixture.args.p_fingerprint = doseContentHash(fixture.args.p_packet)
        }
        const registration = await admin.rpc('register_reviewed_week_proposal', fixture.args)
        check(!registration.error, `${scenario}: registered`)
        const creation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: fixture.registrationId, p_idempotency_key: fixture.key })
        if (scenario === 'deadline') {
          check(Boolean(creation.error), 'Expired source cannot issue proposal')
          const plans = await owner.from('training_plan_versions').select('id').eq('program_id', fixture.programId)
          check(!plans.error && plans.data?.length === 1, 'Failed issuance rolls back target plan and sessions')
          continue
        }
        check(!creation.error, `${scenario}: proposal issued`)
        if (scenario === 'started') {
          const act = fixture.base.plan.scheduledSessions[0].prescription.content.steps.find(step => step.kind === 'activity')!
          const row = await owner.rpc('record_reviewed_session_set', { p_session_id: fixture.ids[0], p_request_id: randomUUID(),
            p_report: { ...reviewedSetReport(act.id), performedAt: new Date().toISOString() } })
          check(!row.error, 'Base work begins after proposal')
        } else if (scenario === 'tampered') {
          const changed = structuredClone(fixture.prepared.packet.intent)
          changed.reviewed_week.title += ' unregistered change'
          const altered = await admin.from('training_plan_versions').update({ intent: changed }).eq('id', registration.data.planVersionId)
          check(!altered.error, 'Synthetic proposed content altered for exact-envelope counterfactual')
        } else if (scenario === 'manifest') {
          const duplicated = await admin.from('prescribed_sessions').insert({ ...fixture.prepared.packet.sessions[1],
            user_id: userId, program_id: fixture.programId, plan_version_id: registration.data.planVersionId })
          check(duplicated.error?.code === '23505', 'Duplicate proposed child rejected by existing uniqueness')
          const accepted = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: fixture.key })
          check(!accepted.error, 'Rejected duplicate leaves complete proposal acceptable')
          continue
        } else if (scenario === 'revision') {
          const corrected = await owner.rpc('record_reviewed_session_set', { p_session_id: newSession.data!.id, p_request_id: randomUUID(),
            p_report: { ...set, revision: 2, repetitions: 5 } })
          check(!corrected.error, 'Outside base-plan source correction advances revision')
        } else if (scenario === 'clock') {
          // The Podman clock can lead or lag the host within the fixture's five-second bound.
          const delay = Date.parse(fixture.args.p_packet.source.validBefore) - Date.now() + 5000
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
        }
        const rejected = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: fixture.key })
        check(Boolean(rejected.error), `${scenario}: acceptance denied`)
        if (scenario === 'clock' || scenario === 'revision') check(rejected.error?.code === '40001', `${scenario}: explicit freshness conflict`)
        const pointer = await owner.from('training_programs').select('active_plan_version_id').eq('id', fixture.programId).single()
        const base = await owner.from('training_plan_versions').select('status,intent').eq('id', fixture.baseId).single()
        check(!pointer.error && pointer.data?.active_plan_version_id === fixture.baseId && base.data?.status === 'accepted'
          && doseContentHash(base.data.intent) === doseContentHash(fixture.intent), `${scenario}: failed acceptance rolls back all transitions`)
      }
      for (const raced of [false, true]) {
        const fixture = await seed(true)
        const registration = await admin.rpc('register_reviewed_week_proposal', fixture.args)
        check(!registration.error, 'Legacy-source registration stored')
        const creation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: fixture.registrationId, p_idempotency_key: fixture.key })
        check(!creation.error, `Legacy-source proposal (${creation.error?.code ?? 'ok'})`)
        const signal = () => owner.rpc('record_coach_session_signal', { p_session_id: fixture.signalSession!.sessionId,
          p_request_id: randomUUID(), p_signal: { schemaVersion: 1, exerciseId: fixture.signalSession!.exerciseId,
            ratingScope: 'hardest_set', workStatus: 'changed', actualReps: 5, completedWorkingSets: 1 } })
        const accept = () => owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: fixture.key })
        if (!raced) {
          check(!(await signal()).error, 'Legacy actual signal stored while session remains planned')
          check(Boolean((await accept()).error), 'Existing legacy actual signal blocks replacement')
          const stillPlanned = await owner.from('prescribed_sessions').select('status').eq('id', fixture.signalSession!.sessionId).single()
          check(stillPlanned.data?.status === 'planned', 'Signal guard does not depend on terminal status')
        } else {
          const [written, accepted] = await Promise.all([signal(), accept()])
          check(Boolean(written.error) || Boolean(accepted.error), 'Racing signal and acceptance cannot both commit')
          const pointer = await owner.from('training_programs').select('active_plan_version_id').eq('id', fixture.programId).single()
          check(!pointer.error && pointer.data?.active_plan_version_id === (accepted.error ? fixture.baseId : registration.data.planVersionId),
            'Signal/accept race preserves the winning active plan')
        }
      }
      const carried = await seed(false, true)
      let registration = await admin.rpc('register_reviewed_week_proposal', carried.args)
      check(!registration.error, 'Begun-week source registered')
      let creation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: carried.registrationId, p_idempotency_key: carried.key })
      check(!creation.error, `Begun-week proposal (${creation.error?.code ?? 'ok'})`)
      let acceptance = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: carried.key })
      check(!acceptance.error, `Begun-week acceptance (${acceptance.error?.code ?? 'ok'})`)
      const firstTarget = registration.data.planVersionId
      const mapped = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', firstTarget).order('session_index')
      check(!mapped.error && mapped.data?.length === 5, 'Complete accepted effective week has five slots')
      check(mapped.data![0].id === carried.ids[0] && mapped.data![3].id === carried.ids[3]
        && mapped.data![0].completed_workout_id === carried.completedWorkoutId && mapped.data![0].status === 'completed',
      'Completed Monday and begun Friday retain original identities and actuals')
      const physical = await owner.from('prescribed_sessions').select('id').eq('plan_version_id', firstTarget)
      check(!physical.error && physical.data?.length === 2, 'Only the two moved unstarted sessions create new execution rows')
      check(!(await owner.rpc('record_reviewed_session_set', carried.savedSets[0])).error, 'Original set receipt replays after replacement')
      check(!(await owner.rpc('complete_reviewed_session', carried.savedCompletion!)).error, 'Original completion receipt replays after replacement')
      const hiddenSlots = await foreign.from('coach_effective_prescribed_sessions').select('id').eq('plan_version_id', firstTarget)
      check(!hiddenSlots.error && hiddenSlots.data?.length === 0, 'Foreign user cannot read carried execution')
      const forbidden = await owner.from('coach_reviewed_execution_slots').update({ session_index: 7 }).eq('plan_version_id', firstTarget)
      check(Boolean(forbidden.error), 'Athlete cannot alter execution mapping')
      const moreArgs = { ...carried.savedSets[1], p_request_id: randomUUID(), p_report: { ...carried.savedSets[1].p_report, setNumber: 2 } }
      const more = await owner.rpc('record_reviewed_session_set', moreArgs)
      check(!more.error, `Continue carried root after original plan superseded (${more.error?.code ?? 'ok'})`)
      const sets = await owner.from('coach_reviewed_set_reports').select('id,plan_version_id').eq('prescribed_session_id', carried.ids[3])
      check(!sets.error && sets.data?.length === 2 && sets.data.every(row => row.plan_version_id === carried.baseId), 'All carried actual sets keep original plan and session identity')
      const completionArgs = { p_session_id: carried.ids[3], p_request_id: randomUUID(), p_request: {
        ...reviewedCompletion(sets.data!.map(row => row.id)), occurredAt: new Date().toISOString(),
        workoutDate: formatUTCAsLocalDateWithOffset(moreArgs.p_report.performedAt, 300) } }
      const completedCarried = await owner.rpc('complete_reviewed_session', completionArgs)
      check(!completedCarried.error, 'Carried session completes atomically through new active week')
      await awaitCapturedTime(completedCarried.data.receipt.capturedAt)
      const updated = await owner.from('coach_effective_prescribed_sessions').select('status,completed_workout_id').eq('plan_version_id', firstTarget).eq('id', carried.ids[3]).single()
      check(!updated.error && updated.data?.status === 'completed' && updated.data.completed_workout_id, 'Effective week reflects canonical completion')
      const checkins = await owner.from('coach_checkins').select('id,plan_version_id').eq('prescribed_session_id', carried.ids[3])
      check(!checkins.error && checkins.data?.length === 1 && checkins.data[0].plan_version_id === carried.baseId, 'Completion has one original-root checkin')
      // Repeated replacement must point straight to original roots, without an alias chain.
      const reviewed = reviewedRollingWeek(), scope = { ...carried.prepared.packet.source.binding.scope, basePlanVersionId: firstTarget }
      const source = await fetchReviewedDoseContext(owner, scope)
      const { profile: _profile, ...context } = reviewed.input.context; void _profile
      const registry = [{ id: 'repeat-swap', userId, scope, contextHash: source.contextHash,
        compilation: { ...reviewed.input, context }, reviewedWeeks: reviewed.registry }]
      const prepared = await prepareReviewedWeekProposalRegistration(owner, registry[0].id, registry)
      check(prepared.kind === 'prepared_registration', 'Complete carried source can prepare a repeated replacement')
      if (prepared.kind !== 'prepared_registration') throw new Error('No repeated packet')
      const nextId = randomUUID(), nextKey = randomUUID()
      registration = await admin.rpc('register_reviewed_week_proposal', { p_id: nextId, p_packet: prepared.packet, p_fingerprint: prepared.fingerprint })
      check(!registration.error, 'Repeated replacement registered')
      creation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: nextId, p_idempotency_key: nextKey })
      check(!creation.error, `Repeated replacement issued (${creation.error?.code ?? 'ok'})`)
      acceptance = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: nextKey })
      check(!acceptance.error, `Repeated replacement accepted (${acceptance.error?.code ?? 'ok'})`)
      const repeated = await owner.from('coach_effective_prescribed_sessions').select('id,execution_plan_version_id').eq('plan_version_id', registration.data.planVersionId).order('session_index')
      check(!repeated.error && doseContentHash(repeated.data?.map(row => row.id)) === doseContentHash(mapped.data!.map(row => row.id)), 'Repeated replacement retains every canonical root')
      check(repeated.data![0].execution_plan_version_id === carried.baseId, 'Original execution plan survives multiple replacements')
      check(!(await owner.rpc('complete_reviewed_session', completionArgs)).error, 'Carried completion receipt replays across repeated replacements')
      const activeId = registration.data.planVersionId
      const nextSourceScope = { ...scope, basePlanVersionId: activeId }
      const nextSource = await fetchReviewedDoseContext(owner, nextSourceScope)
      const future = reviewedRollingWeek()
      future.input.windowStart = future.input.context.profile.startDate = '2026-08-10'
      future.input.sequenceNumber = 2
      // Synthetic transport variant only; does not assert a new human coaching review.
      future.registry[0].recipe.profileHash = doseContentHash(future.input.context.profile)
      future.registry[0].contentHash = doseContentHash(future.registry[0].recipe)
      const { profile: _futureProfile, ...futureContext } = future.input.context; void _futureProfile
      const nextRegistry = [{ id: 'next-week-local', userId, scope: nextSourceScope, contextHash: nextSource.contextHash,
        transition: 'next_week' as const, compilation: { ...future.input, context: futureContext }, reviewedWeeks: future.registry }]
      const nextPrepared = await prepareReviewedWeekProposalRegistration(owner, nextRegistry[0].id, nextRegistry)
      check(nextPrepared.kind === 'prepared_registration', 'Explicit next-week dated review prepared')
      if (nextPrepared.kind !== 'prepared_registration') throw new Error('No next-week packet')
      check(nextPrepared.packet.inputSnapshot.reviewedExecutionContinuity.priorExecution?.filter(row => row.disposition === 'completed').length === 2,
        'Next-week packet preserves two prior completed dispositions')
      check(nextPrepared.packet.inputSnapshot.reviewedExecutionContinuity.priorExecution?.filter(row => row.disposition === 'unreported').length === 3,
        'Missing prior reports remain unreported, not fabricated completions/skips')
      for (const failure of ['sequence', 'window', 'profile', 'history', 'reuse_root', 'implicit'] as const) {
        const invalid = structuredClone(nextPrepared.packet)
        if (failure === 'sequence') invalid.intent.reviewed_week.sequenceNumber = 3
        if (failure === 'window') invalid.intent.reviewed_week.windowEnd = '2026-08-23'
        if (failure === 'profile') invalid.intent.reviewed_week.profileSnapshot.sessionAvailability[0].minutes--
        if (failure === 'history') invalid.inputSnapshot.reviewedExecutionContinuity.priorExecution![1].disposition = 'completed'
        if (failure === 'reuse_root') invalid.inputSnapshot.reviewedExecutionContinuity.slots[0] = { sessionIndex: 1, executionSessionId: carried.ids[0], executionPlanVersionId: carried.baseId }
        if (failure === 'implicit') invalid.inputSnapshot.reviewedWeekTransition.kind = 'same_week'
        const badId = randomUUID()
        const stored = await admin.rpc('register_reviewed_week_proposal', { p_id: badId, p_packet: invalid, p_fingerprint: doseContentHash(invalid) })
        check(!stored.error, `${failure}: synthetic invalid transition registered for SQL counterfactual`)
        const denied = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: badId, p_idempotency_key: randomUUID() })
        check(Boolean(denied.error), `${failure}: invalid next-week issuance rejected`)
      }
      const historyBefore = await owner.from('prescribed_sessions').select('*').eq('program_id', carried.programId).order('id')
      const advanceId = randomUUID(), advanceKey = randomUUID()
      registration = await admin.rpc('register_reviewed_week_proposal', { p_id: advanceId, p_packet: nextPrepared.packet, p_fingerprint: nextPrepared.fingerprint })
      check(!registration.error, 'Adjacent-week registration saved')
      creation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: advanceId, p_idempotency_key: advanceKey })
      check(!creation.error, `Adjacent-week proposal issued (${creation.error?.code ?? 'ok'})`)
      acceptance = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: registration.data.proposalId, p_idempotency_key: advanceKey })
      check(!acceptance.error, `Adjacent-week accepted (${acceptance.error?.code ?? 'ok'})`)
      const historyAfter = await owner.from('prescribed_sessions').select('*').eq('program_id', carried.programId).order('id')
      const oldIds = new Set(historyBefore.data!.map(row => row.id))
      check(!historyAfter.error && doseContentHash(historyAfter.data!.filter(row => oldIds.has(row.id))) === doseContentHash(historyBefore.data),
        'Advancement preserves every original execution row byte-for-byte')
      const nextRows = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', registration.data.planVersionId).order('session_index')
      check(!nextRows.error && nextRows.data?.length === 5 && nextRows.data.every(row => !oldIds.has(row.id) && row.execution_plan_version_id === registration.data.planVersionId
        && row.status === 'planned' && row.completed_workout_id === null), 'New dated exposures have independent empty execution identities')
      const acceptedProgram = await owner.from('training_programs').select('start_date,end_date,active_plan_version_id').eq('id', carried.programId).single()
      check(!acceptedProgram.error && acceptedProgram.data?.start_date === '2026-08-10' && acceptedProgram.data.end_date === '2026-08-16', 'Active program window advances atomically')
      const priorPlan = await owner.from('training_plan_versions').select('status,intent').eq('id', activeId).single()
      check(!priorPlan.error && priorPlan.data?.status === 'superseded' && priorPlan.data.intent.reviewed_week.profileSnapshot.startDate === '2026-08-03',
        'Prior accepted profile retains its original training dates')
      check(!(await owner.rpc('complete_reviewed_session', completionArgs)).error, 'Previous-week completion receipt still replays after advancement')
      const freshScope = { ...nextSourceScope, basePlanVersionId: registration.data.planVersionId }
      const fresh = await fetchReviewedDoseContext(owner, freshScope)
      check(fresh.profile.startDate === '2026-08-10' && fresh.binding.executionSlots.length === 5,
        'New week has complete authenticated source/profile readback')
      // One open report is sufficient; do not seed a duplicate same-day completed
      // workout on this athlete, which correctly makes performed history ambiguous.
      const begun = await seed(false, 'started-only')
      const forgedAdvance = structuredClone(nextPrepared.packet)
      forgedAdvance.source = begun.prepared.packet.source
      forgedAdvance.inputSnapshot.contextRevision = forgedAdvance.source.binding.revision
      forgedAdvance.inputSnapshot.reviewedSourceHash = forgedAdvance.source.contextHash
      forgedAdvance.inputSnapshot.setupMemoryBindings = forgedAdvance.source.binding.setup
      forgedAdvance.inputSnapshot.reviewedWeekTransition.basePlanVersionId = begun.baseId
      const continuity = forgedAdvance.inputSnapshot.reviewedExecutionContinuity
      continuity.basePlanVersionId = begun.baseId
      continuity.sourceSlotsHash = doseContentHash(forgedAdvance.source.binding.executionSlots)
      continuity.priorExecution = forgedAdvance.source.binding.executionSlots.map(slot => ({ executionSessionId: slot.executionSessionId,
        disposition: slot.status === 'planned' ? 'unreported' : slot.status }))
      const forgedId = randomUUID()
      check(!(await admin.rpc('register_reviewed_week_proposal', { p_id: forgedId, p_packet: forgedAdvance, p_fingerprint: doseContentHash(forgedAdvance) })).error,
        'Counterfactual next-week authority registered against fresh begun source')
      const begunDenied = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: forgedId, p_idempotency_key: randomUUID() })
      check(begunDenied.error?.code === '55000' && begunDenied.error.message.includes('Resolve begun execution'),
        'SQL independently rejects advancing an unresolved started session even with a fresh source binding')
      // Source writes on any program invalidate unaccepted proposals; refresh before racing.
      const raceSource = await fetchReviewedDoseContext(owner, freshScope)
      future.input.windowStart = future.input.context.profile.startDate = '2026-08-17'
      future.input.sequenceNumber = 3
      future.registry[0].recipe.profileHash = doseContentHash(future.input.context.profile)
      future.registry[0].contentHash = doseContentHash(future.registry[0].recipe)
      const raceEntry = { ...nextRegistry[0], scope: freshScope, contextHash: raceSource.contextHash,
        compilation: { ...future.input, context: futureContext }, reviewedWeeks: future.registry }
      const racePrepared = await prepareReviewedWeekProposalRegistration(owner, raceEntry.id, [raceEntry])
      check(racePrepared.kind === 'prepared_registration', 'Fresh week-three registration prepared for source-write race')
      if (racePrepared.kind !== 'prepared_registration') throw new Error('Missing race packet')
      const raceId = randomUUID(), raceKey = randomUUID()
      const raceRegistration = await admin.rpc('register_reviewed_week_proposal', { p_id: raceId, p_packet: racePrepared.packet, p_fingerprint: racePrepared.fingerprint })
      check(!raceRegistration.error, 'Next-week race registration saved')
      const raceCreation = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: raceId, p_idempotency_key: raceKey })
      check(!raceCreation.error, 'Next-week race proposal issued')
      const raceActivity = nextRows.data![0].prescription.content.steps.find((step: { kind: string }) => step.kind === 'activity')
      const [raceSet, raceAcceptance] = await Promise.all([
        owner.rpc('record_reviewed_session_set', { p_session_id: nextRows.data![0].id, p_request_id: randomUUID(), p_report: { ...reviewedSetReport(raceActivity.id), performedAt: new Date().toISOString() } }),
        owner.rpc('accept_adaptation_proposal', { p_proposal_id: raceRegistration.data.proposalId, p_idempotency_key: raceKey }),
      ])
      check(Boolean(raceSet.error) || Boolean(raceAcceptance.error), 'Next-week acceptance and a newly started old-week session cannot both commit')
      const racePointer = await owner.from('training_programs').select('active_plan_version_id').eq('id', carried.programId).single()
      check(!racePointer.error && racePointer.data?.active_plan_version_id === (raceAcceptance.error ? freshScope.basePlanVersionId : raceRegistration.data.planVersionId),
        'Next-week source race preserves the winning active pointer')
      // Exercise the application seam against real Auth/PostgREST, preserving
      // committed results while deliberately dropping one response at transport.
      const anonymous = createClient(status.API_URL, status.ANON_KEY, options)
      check(Boolean((await anonymous.rpc('get_reviewed_week_registration', { p_registration_id: successful.registrationId })).error),
        'Anonymous registration recovery denied')
      check((await foreign.rpc('get_reviewed_week_registration', { p_registration_id: successful.registrationId })).data === null,
        'Foreign registration metadata hidden')
      check(Boolean((await admin.rpc('get_reviewed_week_registration', { p_registration_id: successful.registrationId })).error),
        'Service role cannot call authenticated recovery RPC')
      const ownMetadata = await owner.rpc('get_reviewed_week_registration', { p_registration_id: successful.registrationId })
      check(!ownMetadata.error && Object.keys(ownMetadata.data).sort().join(',') === 'planVersionId,programId,proposalId,registrationId,reviewId,userId',
        'Owned recovery exposes only reserved identity metadata')
      for (const loss of ['none', 'registration', 'issuance'] as const) {
        const fixture = await seed(), request = { reviewId: fixture.registry[0].id, registrationId: fixture.registrationId, requestId: fixture.key }
        let dropped = false, serviceCalls = 0
        const wrap = (client: typeof owner, at: string) => new Proxy(client, { get(target, property) {
          if (property !== 'rpc') return Reflect.get(target, property, target)
          return async (name: string, args: Record<string, unknown>) => {
            const response = await target.rpc(name, args)
            if (name === at && !dropped && !response.error) { dropped = true; throw new Error('Synthetic committed response loss') }
            return response
          }
        } })
        const service = loss === 'registration' ? wrap(admin, 'register_reviewed_week_proposal') : admin
        const user = loss === 'issuance' ? wrap(owner, 'create_registered_reviewed_week_proposal') : owner
        const issuer = createReviewedWeekProposalIssuer({ registry: fixture.registry, enabled: () => true,
          createServiceClient: () => { serviceCalls++; return service } })
        const first = await issuer(user, request)
        check(first.kind === (loss === 'none' ? 'issued' : 'retry_required'), `Server ${loss} first result retains operation semantics`)
        if (loss !== 'none') check(dropped && 'request' in first && JSON.stringify(first.request) === JSON.stringify(request),
          `Server ${loss} loss retains exact request identity`)
        // Recovery deliberately has no recipe registry and cannot rebuild/re-register.
        const recovery = createReviewedWeekProposalIssuer({ registry: [], enabled: () => true,
          createServiceClient: () => { throw new Error('Recovery must not require service authority') } })
        const recovered = await recovery(owner, request)
        check(recovered.kind === 'issued', `Server ${loss} recovers persisted registration with no registry`)
        if (recovered.kind !== 'issued') throw new Error('Missing issuance result')
        const proposals = await owner.from('adaptation_proposals').select('id').eq('program_id', fixture.programId)
        check(!proposals.error && proposals.data?.length === 1 && proposals.data[0].id === recovered.proposalId && serviceCalls === 1,
          `Server ${loss} creates one proposal and registers once`)
        const accepted = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: recovered.proposalId, p_idempotency_key: request.requestId })
        check(!accepted.error, `Server ${loss} issued proposal accepts under existing freshness guard`)
        const replay = await recovery(owner, request)
        check(replay.kind === 'issued' && replay.replayed && replay.proposalId === recovered.proposalId,
          `Server ${loss} issuance replay survives changed accepted base`)
        const foreignResult = await recovery(foreign, request)
        check(foreignResult.kind !== 'issued', `Server ${loss} foreign owner cannot recover`)
        const changedReview = await recovery(owner, { ...request, reviewId: 'different-review' })
        check(changedReview.kind === 'retry_required', `Server ${loss} changed review identity cannot reuse registration`)
        const changedKey = await recovery(owner, { ...request, requestId: randomUUID() })
        check(changedKey.kind === 'request_conflict', `Server ${loss} changed request key cannot reissue registration`)
      }
      const concurrent = await seed(), concurrentRequest = { reviewId: concurrent.registry[0].id, registrationId: concurrent.registrationId, requestId: concurrent.key }
      const concurrentIssuer = createReviewedWeekProposalIssuer({ registry: concurrent.registry, enabled: () => true, createServiceClient: () => admin })
      const parallel = await Promise.all([concurrentIssuer(owner, concurrentRequest), concurrentIssuer(owner, concurrentRequest)])
      check(parallel.some(result => result.kind === 'issued'), 'Concurrent server issuance has a successful caller')
      const recoveredParallel = await concurrentIssuer(owner, concurrentRequest)
      check(recoveredParallel.kind === 'issued' && recoveredParallel.replayed, 'Concurrent server issuance recovers one original proposal')
      const concurrentRows = await owner.from('adaptation_proposals').select('id').eq('program_id', concurrent.programId)
      check(!concurrentRows.error && concurrentRows.data?.length === 1, 'Concurrent server issuance cannot duplicate proposals')
      const staleServer = await seed(), staleRequest = { reviewId: staleServer.registry[0].id, registrationId: staleServer.registrationId, requestId: staleServer.key }
      check(!(await admin.rpc('register_reviewed_week_proposal', staleServer.args)).error, 'Server stale-source counterfactual registered')
      const staleActivity = staleServer.base.plan.scheduledSessions[0].prescription.content.steps.find(step => step.kind === 'activity')!
      const staleSet = await owner.rpc('record_reviewed_session_set', { p_session_id: staleServer.ids[0], p_request_id: randomUUID(),
        p_report: { ...reviewedSetReport(staleActivity.id), performedAt: new Date().toISOString() } })
      check(!staleSet.error, 'Source changes after server registration')
      const staleIssuer = createReviewedWeekProposalIssuer({ registry: [], enabled: () => true,
        createServiceClient: () => { throw new Error('No re-registration of stale source') } })
      const staleResult = await staleIssuer(owner, staleRequest)
      check(staleResult.kind === 'review_required', 'Server distinguishes confirmed stale source from uncertain response loss')
      const staleProposals = await owner.from('adaptation_proposals').select('id').eq('program_id', staleServer.programId)
      check(!staleProposals.error && staleProposals.data?.length === 0, 'Rejected stale server issuance creates no proposal')
      // Prepare fixture authority before completing further same-day synthetic
      // sessions. These requests exercise storage, not new evidence compilation.
      const issueResolutionArgs = (f: Awaited<ReturnType<typeof seed>>) => ({ p_program_id: f.programId, p_operation: 'issue', p_request_id: f.key,
        p_identity: { reviewId: f.registry[0].id, registrationId: f.registrationId } })
      const resolveProposal = (args: Record<string, unknown>) => owner.rpc('resolve_reviewed_proposal_request', args)
      const closedBeforeRegister = await seed(), absentArgs = issueResolutionArgs(closedBeforeRegister)
      const absentClosed = await resolveProposal(absentArgs)
      check(!absentClosed.error && absentClosed.data.disposition === 'closed' && absentClosed.data.proposalId === null, 'Unregistered issuance closes permanently')
      const absentReplay = await resolveProposal(absentArgs)
      check(!absentReplay.error && doseContentHash(absentReplay.data) === doseContentHash(absentClosed.data), 'Issue closure exact replay preserves immutable receipt')
      check(Boolean((await resolveProposal({ ...absentArgs, p_identity: { ...absentArgs.p_identity, reviewId: 'wrong-review' } })).error), 'Closed issue rejects changed identity')
      check((await admin.rpc('register_reviewed_week_proposal', closedBeforeRegister.args)).error?.code === '55000', 'Late registration cannot reopen closed issuance')
      for (const client of [foreign, anonymous, admin]) {
        check(Boolean((await client.rpc('resolve_reviewed_proposal_request', absentArgs)).error), 'Foreign anonymous and service resolution denied')
      }
      check(Boolean((await owner.from('coach_reviewed_proposal_resolutions').select('*')).error), 'Resolution table is private to owned RPC')
      // A new registration does not bypass the original closed request key.
      const alternateId = randomUUID(), alternate = await admin.rpc('register_reviewed_week_proposal', { ...closedBeforeRegister.args, p_id: alternateId })
      check(!alternate.error, 'Independent registration can retain reviewed authority')
      check((await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: alternateId,
        p_idempotency_key: closedBeforeRegister.key })).error?.code === '55000', 'Closed request key fences an alternate registration')
      const alternateRows = await owner.from('training_plan_versions').select('id').eq('program_id', closedBeforeRegister.programId)
      check(!alternateRows.error && alternateRows.data?.length === 1, 'Fenced alternate issuance rolls back its proposed plan')

      const registeredOnly = await seed()
      check(!(await admin.rpc('register_reviewed_week_proposal', registeredOnly.args)).error, 'Pre-issuance closure fixture registered')
      const registeredClosed = await resolveProposal(issueResolutionArgs(registeredOnly))
      check(!registeredClosed.error && registeredClosed.data.disposition === 'closed', 'Registered but unissued request closes')
      check(!(await admin.rpc('register_reviewed_week_proposal', registeredOnly.args)).error, 'Closed saved registration can replay metadata without issuing authority')
      check(!(await admin.rpc('register_reviewed_week_proposal', registeredOnly.args)).error, 'Closed saved registration can replay metadata without issuing authority')
      for (const key of [registeredOnly.key, randomUUID()]) {
        check((await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: registeredOnly.registrationId,
          p_idempotency_key: key })).error?.code === '55000', 'Closed registration fences original and alternate issuance keys')
      }
      const noPartial = await owner.from('training_plan_versions').select('id').eq('program_id', registeredOnly.programId)
      check(!noPartial.error && noPartial.data?.length === 1, 'Closed registration leaves no tentative target plan')

      for (const expired of [false, true]) {
        const f = await seed(), reg = await admin.rpc('register_reviewed_week_proposal', f.args)
        check(!reg.error, 'Close proposal fixture registered')
        const issued = await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: f.registrationId, p_idempotency_key: f.key })
        check(!issued.error, 'Close proposal fixture issued')
        const savedIssue = await resolveProposal(issueResolutionArgs(f))
        check(!savedIssue.error && savedIssue.data.disposition === 'saved' && savedIssue.data.proposalId === reg.data.proposalId, 'Resolver recovers issuance without closing saved proposal')
        const proposalBefore = await owner.from('adaptation_proposals').select('rationale').eq('id', reg.data.proposalId).single()
        const slotsBefore = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', reg.data.planVersionId).order('session_index')
        if (expired) {
          // Match existing expiry transition: retained rejected target and expired proposal.
          check(!(await admin.from('training_plan_versions').update({ status: 'rejected' }).eq('id', reg.data.planVersionId)).error, 'Expired fixture target retained rejected')
          const expiration = await admin.from('adaptation_proposals').update({ status: 'expired', decided_at: new Date().toISOString() }).eq('id', reg.data.proposalId)
          check(!expiration.error, `Expired fixture proposal retained (${expiration.error?.code ?? 'ok'}: ${expiration.error?.message ?? 'ok'})`)
        }
        const args = { p_program_id: f.programId, p_operation: 'accept', p_request_id: f.key,
          p_identity: { proposalId: reg.data.proposalId, planVersionId: reg.data.planVersionId } }
        const localHttp = createReviewedHttpHandlers({ createUserClient: async () => owner, enabled: () => true, issue: async () => { throw new Error('Unused issuer') } })
        const detail = await localHttp.readProposal(new Request('http://127.0.0.1'), reg.data.proposalId)
        check(detail.status === 200 && (await detail.json()).proposal.status === (expired ? 'expired' : 'proposed'), 'HTTP reads proposed and expired reviewed detail')
        check(Boolean((await resolveProposal({ ...args, p_request_id: randomUUID() })).error), 'Acceptance closure rejects wrong original key')
        const closeResponse = await localHttp.resolveProposal(new Request('http://127.0.0.1', { method: 'POST', body: JSON.stringify({
          expectedUserId: userId, operation: 'accept', requestId: f.key, identity: args.p_identity,
        }) }), f.programId.toUpperCase())
        const closeResult = await closeResponse.json(), closed = { data: closeResult.resolution }
        check(closeResponse.status === 200 && closeResult.kind === 'resolved' && closed.data.disposition === 'closed',
          `HTTP unaccepted ${expired ? 'expired' : 'proposed'} proposal safely closed`)
        const replay = await resolveProposal(args)
        check(!replay.error && doseContentHash(replay.data) === doseContentHash(closed.data), 'Acceptance closure response-loss replay exact')
        const late = await owner.rpc('accept_adaptation_proposal', { p_proposal_id: reg.data.proposalId, p_idempotency_key: f.key })
        check(Boolean(late.error), 'Late acceptance cannot apply a closed proposal')
        const proposalAfter = await owner.from('adaptation_proposals').select('rationale,status').eq('id', reg.data.proposalId).single()
        const slotsAfter = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', reg.data.planVersionId).order('session_index')
        const pointer = await owner.from('training_programs').select('active_plan_version_id').eq('id', f.programId).single()
        check(!proposalBefore.error && !proposalAfter.error && proposalAfter.data?.status === 'rejected'
          && doseContentHash(proposalBefore.data?.rationale) === doseContentHash(proposalAfter.data?.rationale), 'Closure retains original reviewed rationale')
        check(!slotsBefore.error && !slotsAfter.error && slotsBefore.data?.length === 5
          && doseContentHash(slotsBefore.data) === doseContentHash(slotsAfter.data), 'Closure retains all target slots and prescriptions')
        check(!pointer.error && pointer.data?.active_plan_version_id === f.baseId, 'Closure leaves accepted base active')
      }
      const oldMetadata = await owner.rpc('get_reviewed_week_registration', { p_registration_id: carried.registrationId })
      check(!oldMetadata.error, 'Historical accepted registration recoverable')
      const historicalArgs = { p_program_id: carried.programId, p_operation: 'accept', p_request_id: carried.key,
        p_identity: { proposalId: oldMetadata.data.proposalId, planVersionId: firstTarget } }
      const historical = await resolveProposal(historicalArgs)
      check(!historical.error && historical.data.disposition === 'saved' && historical.data.planVersionId === firstTarget
        && historical.data.activePlanVersionId !== firstTarget, 'Historical accepted week recovered separately from current active pointer')

      // Exercise both deterministic orders above and overlapping transactions here.
      for (const operation of ['register', 'issue', 'accept'] as const) {
        const f = await seed(); let ids: { proposalId: string; planVersionId: string } | null = null
        if (operation !== 'register') {
          const reg = await admin.rpc('register_reviewed_week_proposal', f.args)
          check(!reg.error, 'Race fixture registration succeeds'); ids = reg.data
        }
        if (operation === 'accept') {
          check(!(await owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: f.registrationId, p_idempotency_key: f.key })).error,
            'Acceptance race fixture issued')
        }
        const args = operation === 'accept' ? { p_program_id: f.programId, p_operation: 'accept', p_request_id: f.key,
          p_identity: { proposalId: ids!.proposalId, planVersionId: ids!.planVersionId } } : issueResolutionArgs(f)
        const writer = () => operation === 'register' ? admin.rpc('register_reviewed_week_proposal', f.args)
          : operation === 'issue' ? owner.rpc('create_registered_reviewed_week_proposal', { p_registration_id: f.registrationId, p_idempotency_key: f.key })
            : owner.rpc('accept_adaptation_proposal', { p_proposal_id: ids!.proposalId, p_idempotency_key: f.key })
        const [write, resolve] = await Promise.all([writer(), resolveProposal(args)])
        check(!write.error || ['55000', '55P03', '40001'].includes(write.error.code), `${operation} race writer yields only a known resolution outcome (${write.error?.code ?? 'ok'})`)
        check(!resolve.error || resolve.error.code === '55P03', `${operation} race resolver yields saved/closed or bounded lock retry`)
        const recovered = await resolveProposal(args)
        check(!recovered.error, `${operation} race exact resolution recovers`)
        if (recovered.data.disposition === 'closed') {
          const lateWrite = await writer()
          if (operation === 'register' && !write.error) {
            check(!lateWrite.error && doseContentHash(lateWrite.data) === doseContentHash(write.data), 'Closed saved registration preserves exact metadata replay')
          } else {
            check(Boolean(lateWrite.error), `${operation} race closed result fences every later original write`)
          }
          if (operation === 'register') {
            check(Boolean((await owner.rpc('create_registered_reviewed_week_proposal', {
              p_registration_id: f.registrationId, p_idempotency_key: f.key,
            })).error), 'Register race closure fences issuance even when saved metadata can replay')
            const plans = await owner.from('training_plan_versions').select('id').eq('program_id', f.programId)
            check(!plans.error && plans.data?.length === 1, 'Register race closure creates no proposed plan')
          }
        } else {
          check(operation !== 'register' && !write.error, `${operation} race saved result matches committed original`)
        }
      }
      const resolutionFixture = await seed(), resolutionRaces = [await seed(), await seed()]
      const httpFixture = await seed(), httpRequest = { expectedUserId: userId, reviewId: httpFixture.registry[0].id,
        registrationId: httpFixture.registrationId, requestId: httpFixture.key }
      const httpIssuer = createReviewedWeekProposalIssuer({ registry: httpFixture.registry, enabled: () => true, createServiceClient: () => admin })
      const http = createReviewedHttpHandlers({ createUserClient: async () => owner, enabled: () => true, issue: httpIssuer, registry: httpFixture.registry })
      const httpBody = (body: unknown) => new Request('http://127.0.0.1/api/coach/reviewed', { method: 'POST', body: JSON.stringify(body) })
      const proposedResponse = await http.propose(httpBody(httpRequest)), proposed = await proposedResponse.json()
      check(proposedResponse.status === 200 && proposed.kind === 'issued', 'HTTP handler issues server-owned reviewed proposal through real database')
      const proposalIndexResponse = await http.listProposals(new Request(`http://127.0.0.1/api/coach/reviewed/proposals?programId=${httpFixture.programId}`))
      const proposalIndex = await proposalIndexResponse.json()
      check(proposalIndexResponse.status === 200 && proposalIndex.index.reviews.length === 1
        && proposalIndex.index.reviews[0].reviewId === httpFixture.registry[0].id
        && proposalIndex.index.proposals[0].proposalId === proposed.proposalId, 'Owned discovery exposes server review ID and persisted proposal')
      const proposalDetailResponse = await http.readProposal(new Request('http://127.0.0.1'), proposed.proposalId), proposalDetail = await proposalDetailResponse.json()
      check(proposalDetailResponse.status === 200 && proposalDetail.proposal.acceptanceAvailable
        && proposalDetail.proposal.plan.scheduledSessions.length === 5 && proposalDetail.proposal.baseWeek.plan.scheduledSessions.length === 5
        && proposalDetail.proposal.requestId === httpFixture.key, 'Full verified proposed and base weeks read back with original acceptance identity')
      const acceptBody = { expectedUserId: userId, requestId: httpFixture.key }
      const acceptedResponse = await http.accept(httpBody(acceptBody), proposed.proposalId)
      const acceptedHttp = await acceptedResponse.json()
      check(acceptedResponse.status === 200 && acceptedHttp.kind === 'accepted'
        && acceptedHttp.accepted.active_plan_version_id === proposed.planVersionId, 'HTTP acceptance preserves actual SQL receipt columns')
      const acceptedReplay = await http.accept(httpBody(acceptBody), proposed.proposalId)
      check(acceptedReplay.status === 200, 'HTTP acceptance exact replay succeeds')
      const acceptedDetailResponse = await http.readProposal(new Request('http://127.0.0.1'), proposed.proposalId), acceptedDetail = await acceptedDetailResponse.json()
      check(acceptedDetailResponse.status === 200 && acceptedDetail.proposal.status === 'accepted' && !acceptedDetail.proposal.acceptanceAvailable
        && acceptedDetail.proposal.activePlanVersionId === proposed.planVersionId, 'Accepted proposal survives reload without granting another acceptance')
      const activeRows = await owner.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', proposed.planVersionId).order('session_index')
      check(!activeRows.error && activeRows.data?.length === 5, 'HTTP accepted proposal has five mapped sessions')
      const httpSession = activeRows.data![0], httpActivity = httpSession.prescription.content.steps.find((step: { kind: string }) => step.kind === 'activity')
      const actual = { ...reviewedSetReport(httpActivity.id), performedAt: new Date().toISOString(), repetitions: 2, load: null, rpe: null, restAfterSeconds: null }
      const actualBody = { expectedUserId: userId, requestId: randomUUID(), report: actual }
      let dropSetResponse = true
      const lossClient = new Proxy(owner, { get(target, property) {
        if (property !== 'rpc') return Reflect.get(target, property, target)
        return async (name: string, args: Record<string, unknown>) => {
          const result = await target.rpc(name, args)
          if (name === 'record_reviewed_session_set' && dropSetResponse && !result.error) {
            dropSetResponse = false; throw new Error('Synthetic HTTP set response loss')
          }
          return result
        }
      } })
      const httpLoss = createReviewedHttpHandlers({ createUserClient: async () => lossClient, enabled: () => true, issue: httpIssuer })
      const uncertainSet = await httpLoss.recordSet(httpBody(actualBody), httpSession.id)
      check(uncertainSet.status === 503 && !dropSetResponse, 'HTTP set result is uncertain after a real committed response is dropped')
      const recoveredSetResponse = await http.recordSet(httpBody(actualBody), httpSession.id), recoveredSet = await recoveredSetResponse.json()
      check(recoveredSetResponse.status === 200 && recoveredSet.setReport.replayed, 'HTTP exact set retry recovers committed row')
      const correctedBody = { ...actualBody, requestId: randomUUID(), report: { ...actual, revision: 2, repetitions: 3, rpe: { value: 7, scale: 'rir_based' } } }
      const correctionResponse = await http.recordSet(httpBody(correctedBody), httpSession.id), correction = await correctionResponse.json()
      check(correctionResponse.status === 200 && correction.setReport.id !== recoveredSet.setReport.id, 'HTTP actual correction appends a new immutable revision')
      const actualRows = await owner.from('coach_reviewed_set_reports').select('id,report').eq('prescribed_session_id', httpSession.id).order('revision')
      check(!actualRows.error && actualRows.data?.length === 2 && actualRows.data[0].report.repetitions === 2
        && actualRows.data[1].report.repetitions === 3 && actualRows.data.every(row => row.report.load === null && row.report.restAfterSeconds === null),
        'HTTP actuals preserve both revisions and unknown load/rest')
      const stateResponse = await http.readSession(new Request('http://127.0.0.1'), httpSession.id.toUpperCase()), sessionState = await stateResponse.json()
      check(stateResponse.status === 200 && sessionState.kind === 'session' && sessionState.session.writable
        && sessionState.session.sessionId === httpSession.id && sessionState.session.executionPlanVersionId === httpSession.execution_plan_version_id,
        'Owned HTTP readback resolves canonical active execution including uppercase path')
      check(sessionState.session.reports.length === 2 && sessionState.session.latestReportIds.length === 1
        && sessionState.session.latestReportIds[0] === correction.setReport.id && sessionState.session.reports[0].report.repetitions === 2,
        'Owned HTTP readback retains correction history and exact latest completion manifest')
      const completion = { ...reviewedCompletion([correction.setReport.id]), occurredAt: new Date().toISOString(),
        workoutDate: formatUTCAsLocalDateWithOffset(actual.performedAt, 300) }
      const completionBody = { expectedUserId: userId, requestId: randomUUID(), completion }
      const staleHttp = await http.complete(httpBody({ ...completionBody, requestId: randomUUID(),
        completion: { ...completion, setReportIds: [recoveredSet.setReport.id] } }), httpSession.id)
      check(staleHttp.status === 409, 'HTTP completion rejects stale set-revision manifest')
      const completedResponse = await http.complete(httpBody(completionBody), httpSession.id), completedHttp = await completedResponse.json()
      check(completedResponse.status === 200 && completedHttp.kind === 'saved' && completedHttp.receipt.userId === userId,
        'HTTP completion returns owned canonical capture receipt')
      const completionReplayResponse = await http.complete(httpBody(completionBody), httpSession.id.toUpperCase()), completionReplay = await completionReplayResponse.json()
      check(completionReplayResponse.status === 200 && completionReplay.result.replayed
        && completionReplay.result.workout_id === completedHttp.result.workout_id, 'HTTP uppercase-path completion retry preserves canonical workout identity')
      check((await http.recordSet(httpBody(correctedBody), httpSession.id)).status === 200, 'HTTP set replay remains available after terminal completion')
      const terminalResponse = await http.readSession(new Request('http://127.0.0.1'), httpSession.id), terminalState = await terminalResponse.json()
      check(terminalResponse.status === 200 && terminalState.session.status === 'completed' && !terminalState.session.writable
        && terminalState.session.reports.length === 2, 'Terminal HTTP readback retains complete actuals without granting new writes')
      const foreignHttp = createReviewedHttpHandlers({ createUserClient: async () => foreign, enabled: () => true, issue: httpIssuer })
      check((await foreignHttp.readProposal(new Request('http://127.0.0.1'), proposed.proposalId)).status === 404, 'Foreign proposal readback hidden')
      check((await foreignHttp.listProposals(new Request(`http://127.0.0.1?programId=${httpFixture.programId}`))).status === 404, 'Foreign proposal discovery hidden')
      check((await foreignHttp.readSession(new Request('http://127.0.0.1'), httpSession.id)).status === 404,
        'Foreign HTTP readback reveals no prescription or actual reports')
      check((await foreignHttp.recordSet(httpBody({ ...actualBody, expectedUserId: users[1] }), httpSession.id)).status === 404,
        'HTTP foreign session mutation denied by real owner-scoped SQL')
      check((await foreignHttp.complete(httpBody(completionBody), httpSession.id)).status === 409,
        'HTTP stale-account completion is rejected before mutation')
      const resolveBody = (operation: 'set' | 'complete', requestId: string, payload: unknown) => ({ expectedUserId: userId, operation, requestId, payload })
      const savedResolutionResponse = await http.resolve(httpBody(resolveBody('set', actualBody.requestId, actual)), httpSession.id)
      const savedResolution = await savedResolutionResponse.json()
      check(savedResolutionResponse.status === 200 && savedResolution.resolution.disposition === 'saved'
        && savedResolution.resolution.result.id === recoveredSet.setReport.id, 'Resolution recovers original set even after correction and completion')
      const completedResolutionResponse = await http.resolve(httpBody(resolveBody('complete', completionBody.requestId, completion)), httpSession.id)
      const completedResolution = await completedResolutionResponse.json()
      check(completedResolutionResponse.status === 200 && completedResolution.resolution.disposition === 'saved'
        && completedResolution.resolution.result.result.workout_id === completedHttp.result.workout_id, 'Resolution recovers original completed workout receipt')
      check((await http.resolve(httpBody(resolveBody('set', actualBody.requestId, { ...actual, repetitions: 99 })), httpSession.id)).status === 409,
        'Resolution rejects changed payload against saved set')
      await awaitCapturedTime(completedHttp.receipt.capturedAt)
      const resolveSession = resolutionFixture.ids[0], otherSession = resolutionFixture.ids[1]
      const resolutionActivity = resolutionFixture.base.plan.scheduledSessions[0].prescription.content.steps.find(step => step.kind === 'activity')!
      const candidate = { ...reviewedSetReport(resolutionActivity.id), performedAt: new Date().toISOString() }, blockedKey = randomUUID()
      const resolutionRequest = resolveBody('set', blockedKey, candidate)
      const fenceResponse = await http.resolve(httpBody(resolutionRequest), resolveSession), fence = await fenceResponse.json()
      check(fenceResponse.status === 200 && fence.resolution.disposition === 'no_write', 'Absent set resolves to persistent no-write fence')
      const fenceReplay = await (await http.resolve(httpBody(resolutionRequest), resolveSession)).json()
      check(fenceReplay.resolution.resolutionId === fence.resolution.resolutionId && fenceReplay.resolution.resolvedAt === fence.resolution.resolvedAt,
        'Lost no-write response recovers original immutable resolution identity')
      const blockedSet = await owner.rpc('record_reviewed_session_set', { p_session_id: resolveSession, p_request_id: blockedKey, p_report: candidate })
      check(blockedSet.error?.code === '55000' && blockedSet.error.message.includes('resolved without a write'), 'Late original set is fenced after resolution')
      const blockedSetRows = await owner.from('coach_reviewed_set_reports').select('id').eq('request_id', blockedKey)
      check(!blockedSetRows.error && blockedSetRows.data?.length === 0, 'No report survives fenced set attempt')
      check((await http.resolve(httpBody({ ...resolutionRequest, payload: { ...candidate, repetitions: 99 } }), resolveSession)).status === 409,
        'Fence recovery rejects altered payload')
      check((await http.resolve(httpBody(resolutionRequest), otherSession)).status === 409, 'Fence identity cannot migrate to another owned session')
      const malformedKey = randomUUID()
      check((await http.resolve(httpBody(resolveBody('set', malformedKey, { malformed: true })), resolveSession)).status === 200,
        'Rejected malformed original payload can be safely fenced without becoming a valid set')
      check((await foreignHttp.resolve(httpBody({ ...resolutionRequest, expectedUserId: users[1] }), resolveSession)).status === 404,
        'Foreign resolution cannot recover or fence another owner session')
      const resolveArgs = { p_session_id: resolveSession, p_operation: 'set', p_request_id: randomUUID(), p_payload: candidate }
      check(Boolean((await anonymous.rpc('resolve_reviewed_session_request', resolveArgs)).error), 'Anonymous resolution denied')
      check(Boolean((await admin.rpc('resolve_reviewed_session_request', resolveArgs)).error), 'Service-role resolution denied')
      check(Boolean((await owner.from('coach_reviewed_request_resolutions').select('*')).error), 'Resolution table is not directly readable')
      // A deliberate replacement uses a fresh key only after the old key is fenced.
      const replacementKey = randomUUID(), replacement = await owner.rpc('record_reviewed_session_set', {
        p_session_id: resolveSession, p_request_id: replacementKey, p_report: candidate })
      check(!replacement.error && replacement.data?.length === 1, 'A new deliberate set request can save after resolution')
      const blockedCompletionKey = randomUUID(), completedCandidate = { ...reviewedCompletion([replacement.data![0].id]), occurredAt: new Date().toISOString(),
        workoutDate: formatUTCAsLocalDateWithOffset(candidate.performedAt, 300) }
      const completionFence = await http.resolve(httpBody(resolveBody('complete', blockedCompletionKey, completedCandidate)), resolveSession)
      check(completionFence.status === 200 && (await completionFence.json()).resolution.disposition === 'no_write', 'Absent completion receives atomic no-write fence')
      const workoutsBefore = await owner.from('workouts').select('id', { count: 'exact', head: true })
      const blockedCompletion = await owner.rpc('complete_reviewed_session', { p_session_id: resolveSession, p_request_id: blockedCompletionKey, p_request: completedCandidate })
      check(blockedCompletion.error?.code === '55000' && blockedCompletion.error.message.includes('resolved without a write'), 'Delayed completion cannot pass the fence')
      const workoutsAfter = await owner.from('workouts').select('id', { count: 'exact', head: true })
      const rootAfter = await owner.from('prescribed_sessions').select('status').eq('id', resolveSession).single()
      check(!workoutsBefore.error && !workoutsAfter.error && workoutsBefore.count === workoutsAfter.count && rootAfter.data?.status === 'planned',
        'Completion fence rolls back tentative workout and leaves session uncompleted')
      const completionAfterFence = await owner.rpc('complete_reviewed_session', { p_session_id: resolveSession, p_request_id: randomUUID(), p_request: completedCandidate })
      check(!completionAfterFence.error, 'Deliberate fresh completion saves after prior fence')
      await awaitCapturedTime(completionAfterFence.data.receipt.capturedAt)
      const skippedKey = randomUUID(), skipCandidate = { ...reviewedCompletion([], 'skipped'), occurredAt: new Date().toISOString(),
        workoutDate: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300) }
      const skipped = await owner.rpc('complete_reviewed_session', { p_session_id: otherSession, p_request_id: skippedKey, p_request: skipCandidate })
      check(!skipped.error, 'Skipped session saved for resolution recovery')
      const skippedResolve = await http.resolve(httpBody(resolveBody('complete', skippedKey, skipCandidate)), otherSession), skippedResult = await skippedResolve.json()
      check(skippedResolve.status === 200 && skippedResult.resolution.disposition === 'saved' && skippedResult.resolution.result.receipt === null
        && skippedResult.resolution.result.result.session_status === 'skipped', 'Skipped completion resolves saved with no workout receipt')
      // Both operations race against resolution under the same locks. Whichever
      // wins determines whether recovery returns saved or permanently no_write.
      for (const [index, operation] of (['set', 'complete'] as const).entries()) {
        const raceFixture = resolutionRaces[index], sessionId = raceFixture.ids[0], key = randomUUID()
        const activity = raceFixture.base.plan.scheduledSessions[0].prescription.content.steps.find(step => step.kind === 'activity')!
        const payload = operation === 'set' ? { ...reviewedSetReport(activity.id), performedAt: new Date().toISOString() } : skipCandidate
        const writer = () => owner.rpc(operation === 'set' ? 'record_reviewed_session_set' : 'complete_reviewed_session', {
          p_session_id: sessionId, p_request_id: key, ...(operation === 'set' ? { p_report: payload } : { p_request: payload }) })
        const resolver = () => owner.rpc('resolve_reviewed_session_request', { p_session_id: sessionId, p_operation: operation, p_request_id: key, p_payload: payload })
        const [write, resolve] = await Promise.all([writer(), resolver()])
        check(!resolve.error && ['saved', 'no_write'].includes(resolve.data?.disposition), `${operation} race resolves a definite disposition`)
        check(resolve.data.disposition === 'saved' ? !write.error : Boolean(write.error), `${operation} race cannot report no-write and commit the original`)
        const again = await resolver(), late = await writer()
        check(!again.error && again.data.disposition === resolve.data.disposition, `${operation} race resolution remains stable`)
        check(resolve.data.disposition === 'saved' ? !late.error : late.error?.code === '55000', `${operation} late retry respects the winning disposition`)
      }
      // activity_mutations correctly denies direct service-role INSERT. Exercise
      // a supported, authenticated non-completion mutation through its RPC.
      const originalWorkout = await owner.from('workouts').select('workout_date,input_text,blocks').eq('id', completedHttp.result.workout_id).single()
      check(!originalWorkout.error, 'Original synthetic workout read for amendment regression')
      const unrelated = await owner.rpc('amend_program_execution', { p_entity_id: completedHttp.result.workout_id, p_expected_revision: 1,
        p_request_id: randomUUID(), p_record: { ...originalWorkout.data, notes: 'Synthetic unrelated amendment regression' },
        p_blocks: [{}], p_provenance: completedHttp.receipt.provenance })
      check(!unrelated.error && unrelated.data?.revision === 2, `New completion guard preserves unrelated activity mutation (${unrelated.error?.code ?? 'ok'})`)
      receipt.status = 'passed'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ receipt: `${directory}/receipt.json`, checks: checks.length, status: 'passed' }))
    } catch (error) {
      receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message : 'Unknown local failure'; save(); throw error
    }
  }, 60000)
})
