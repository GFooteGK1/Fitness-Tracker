/** Explicit opt-in integration; creates only fresh synthetic fixtures on fixed loopback targets. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { fetchReviewedDoseContext, compileAuthenticatedReviewedSession } from '@/app/lib/coach/reviewed-dose-context-server'
import { buildRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import { buildStoredRollingWeeklyIntent } from '@/app/lib/coach/rolling-weekly-api'
import { buildAdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import { reviewedBenchExample } from '../../test/fixtures/reviewed-bench-session'
import { reviewedRollingWeek } from '../../test/fixtures/reviewed-rolling-week'
import { compileAuthenticatedReviewedWeek } from '@/app/lib/coach/reviewed-week-context-server'
import { prepareReviewedWeekProposalRegistration } from '@/app/lib/coach/reviewed-proposal-registration'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { reviewedSetReport } from '../../test/fixtures/reviewed-set-report'
import { reviewedCompletion } from '../../test/fixtures/reviewed-completion'
import { syntheticReviewedSessionActuals } from '../../test/fixtures/reviewed-session-actuals'
import { buildPerformedWorkContext } from '@/app/lib/coach/performed-work-context'
import { resolveReviewedMovementId } from '@/app/lib/coach/reviewed-movement-eligibility'

describe.skipIf(process.env.SOCIUS_LOCAL_REVIEWED_DOSE_TEST !== 'true')('real local reviewed-dose source integration', () => {
  it.each(['session', 'week', 'full-week'] as const)('%s: authenticates, isolates owners, compiles offline, detects corrections and preserves the accepted plan', async mode => {
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    if (status.API_URL !== 'http://127.0.0.1:55321') throw new Error('Refusing non-local API')
    const dbUrl = new URL(status.DB_URL)
    if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Refusing non-local database')
    const runId = randomUUID(), checks: string[] = []
    const directory = `output/app-quality-release/reviewed-dose-${runId}`
    mkdirSync(directory)
    const receipt: Record<string, unknown> = { runId, mode, startedAt: new Date().toISOString(), checks, target: status.API_URL, status: 'running' }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(label); save() }
    const options = { auth: { persistSession: false, autoRefreshToken: false } }
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
    const owner = createClient(status.API_URL, status.ANON_KEY, options)
    const other = createClient(status.API_URL, status.ANON_KEY, options)
    try {
      const userIds: string[] = []
      for (const [index, client] of [owner, other].entries()) {
        const email = `reviewed-dose-${runId}-${index}@sociusfit-local.invalid`, password = randomUUID() + randomUUID()
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        check(!created.error && created.data.user?.id, `Synthetic user ${index} created`)
        const id = created.data.user!.id; userIds.push(id); receipt.syntheticUserIds = [...userIds]; save()
        const signedIn = await client.auth.signInWithPassword({ email, password })
        check(!signedIn.error && signedIn.data.user?.id === id, `Synthetic user ${index} authenticated`)
      }
      const userId = userIds[0], programId = randomUUID(), planId = randomUUID()
      const provision = await owner.from('user_profiles').upsert({ user_id: userId, fitness_goals: ['performance'],
        body_metrics: { age: 35, height_cm: 175, weight_kg: 75 }, preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } })
      check(!provision.error, `Synthetic owner profile (${provision.error?.code ?? 'ok'})`)
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const response = await owner.rpc(name, args)
        check(!response.error, `Local ${name} (${response.error?.code ?? 'ok'})`)
        return response.data
      }
      const awaitCapturedTime = async (capturedAt: string) => {
        const delay = Date.parse(capturedAt) - Date.now() + 100
        check(Number.isFinite(delay) && delay < 5000, 'Local fixture clock skew is bounded below five seconds')
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
      }
      Object.assign(receipt, { programId, planId }); save()
      const fixture = reviewedBenchExample()
      const profile = { ...fixture.profile, startDate: '2026-09-21' }
      const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile,
        direction: buildRollingTrainingDirection(profile, { hypothesis: 'Repeatable moderate exposures support strength development.', goalTargetDate: '2027-04-01' }) })
      if (plan.kind !== 'weekly_plan') throw new Error('Expected weekly fixture')
      const reviewed = mode !== 'session' ? reviewedRollingWeek() : null
      const seedPlan = reviewed?.plan ?? plan
      const intent = reviewed?.intent ?? buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))
      // Admin only seeds a fresh synthetic accepted base; acceptance workflow is not under test here.
      let result = await admin.from('training_programs').insert({ id: programId, user_id: userId, title: 'Synthetic reviewed-dose integration',
        goal_summary: 'Strength test fixture', start_date: seedPlan.windowStart, end_date: seedPlan.windowEnd, status: 'draft', program_mode: 'rolling_weekly' })
      check(!result.error, `Synthetic program seed (${result.error?.code ?? 'ok'})`)
      result = await admin.from('training_plan_versions').insert({ id: planId, user_id: userId, program_id: programId, version: 1,
        status: 'accepted', accepted_at: new Date().toISOString(), reference_version: 'local-test', policy_version: plan.policyVersion,
        plan_mode: 'rolling_weekly', window_start: seedPlan.windowStart, window_end: seedPlan.windowEnd, sequence_number: 1, intent, input_snapshot: {} })
      check(!result.error, `Synthetic accepted base seed (${result.error?.code ?? 'ok'})`)
      result = await admin.from('training_programs').update({ status: 'active', active_plan_version_id: planId }).eq('id', programId).eq('user_id', userId)
      check(!result.error, `Synthetic active pointer seed (${result.error?.code ?? 'ok'})`)
      const reviewedSessionIds = seedPlan.scheduledSessions.map(() => randomUUID())
      {
        result = await admin.from('prescribed_sessions').insert(seedPlan.scheduledSessions.map((slot, index) => ({
          id: reviewedSessionIds[index], user_id: userId, program_id: programId, plan_version_id: planId,
          week_number: 1, session_index: index + 1, scheduled_date: slot.scheduledDate, prescription: slot.prescription,
        })))
        check(!result.error, `Complete reviewed sessions stored against exact parent (${result.error?.code ?? 'ok'})`)
        receipt.reviewedSessionIds = reviewedSessionIds; save()
      }
      const today = formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300)
      const work = { workout_date: formatUTCAsLocalDateWithOffset(new Date(Date.now() - 86400000).toISOString(), 300),
        input_text: 'Synthetic bench 165 lb 3x6, actual set RPE 7/7/7, 180 second rests.', notes: 'Crisp, normal recovery, no pain.',
        blocks: [{ block_type: 'STRENGTH', role: 'priority_adaptation', movements: [{ name: 'Barbell bench press', sets: 3, reps: 6, load: 165, unit: 'lb', effort: [7, 7, 7] }] }] }
      const provenance = captureProvenance('workout', 'athlete_reported', 'athlete_confirmed')
      const loggingKey = randomUUID(); receipt.loggingKey = loggingKey; save()
      const request = await rpc('begin_logging_request', { p_key: loggingKey, p_fingerprint: 'a'.repeat(64) })
      const items = await rpc('freeze_logging_request_items', { p_request_id: request.id,
        p_items: [{ sourceItemId: 'reviewed-source', kind: 'workout', record: work, blocks: [{}], provenance, inputMethod: 'text', eventAt: work.workout_date }] })
      const captureReceipt = await rpc('commit_logging_request_item', { p_item_id: items[0].id })
      await awaitCapturedTime(captureReceipt.capturedAt)
      const logged = await owner.from('workouts').select('id').eq('user_id', userId).single()
      check(!logged.error && logged.data?.id, 'Canonical synthetic workout exists')
      const workoutId = logged.data!.id; receipt.workoutId = workoutId; save()
      const scope = { programId, basePlanVersionId: planId, historyThrough: today, historyDays: 28, tzOffset: 300 }
      const first = await fetchReviewedDoseContext(owner, scope)
      check(first.userId === userId && first.performed.records.length === 1, 'Real authenticated owned history read')
      const repeated = await fetchReviewedDoseContext(owner, scope)
      check(first.contextHash === repeated.contextHash, 'Repeated read stable without context writes')
      check(first.binding.revision === repeated.binding.revision, 'Read-only adapter did not advance context revision')
      const { profile: _profile, ...compilation } = fixture; void _profile
      const registry = [{ userId, scope, contextHash: first.contextHash, compilation }]
      const { profile: _weekProfile, ...weekContext } = reviewed?.input.context ?? { profile }; void _weekProfile
      const weekRegistry = reviewed ? [{ id: 'developmental-swap', userId, scope, contextHash: first.contextHash,
        compilation: { ...reviewed.input, context: weekContext as Omit<typeof reviewed.input.context, 'profile'> }, reviewedWeeks: reviewed.registry }] : []
      const compile = (client: typeof owner) => reviewed
        ? compileAuthenticatedReviewedWeek(client, 'developmental-swap', weekRegistry)
        : compileAuthenticatedReviewedSession(client, 'C2-R', registry)
      const compiled = await compile(owner)
      check((compiled.kind === 'compiled' && !compiled.session.numericRuntimeEligible && !compiled.session.persistable)
        || (compiled.kind === 'reviewed_candidate' && !compiled.numericRuntimeEligible && !compiled.persistable), 'Owned registered recipe compiles offline only')
      if (reviewed) {
        check(compiled.kind === 'reviewed_candidate' && doseContentHash(compiled.plan) === doseContentHash(reviewed.plan),
          'Entire reviewed week preserves preparation, doses, protocols, timing, dates and spacing')
        const afterCompile = await fetchReviewedDoseContext(owner, scope)
        check(afterCompile.contextHash === first.contextHash && afterCompile.binding.revision === first.binding.revision,
          'Whole-week compilation changes no source state or revision')
        const prepared = await prepareReviewedWeekProposalRegistration(owner, 'developmental-swap', weekRegistry)
        check(prepared.kind === 'prepared_registration' && !prepared.persistable && !prepared.numericRuntimeEligible,
          'Real owned reviewed registration packet prepares without persistence or activation')
        if (prepared.kind !== 'prepared_registration') throw new Error('Expected prepared registration')
        check(doseContentHash(prepared.packet.intent.reviewed_week) === doseContentHash(reviewed.plan)
          && prepared.packet.sessions.length === reviewed.plan.scheduledSessions.length
          && prepared.packet.source.binding.revision === first.binding.revision
          && prepared.fingerprint === doseContentHash(prepared.packet),
        'Prepared packet retains complete plan, exact source revision and content fingerprint')
        check((await prepareReviewedWeekProposalRegistration(other, 'developmental-swap', weekRegistry)).kind === 'review_required',
          'Foreign owner cannot prepare another athlete registration')
      }
      const foreign = await other.from('training_plan_versions').select('id').eq('id', planId)
      check(!foreign.error && foreign.data?.length === 0, 'Real RLS hides the foreign accepted plan')
      const denied = await compile(other)
      check(denied.kind === 'review_required', 'Other authenticated owner cannot use registration')
      if (reviewed && mode !== 'full-week') {
        const prescription = reviewed.plan.scheduledSessions[1].prescription
        const activity = prescription.content.steps.find(step => step.kind === 'activity' && step.role === 'working')!
        const set = { ...reviewedSetReport(activity.id), performedAt: new Date().toISOString() }, setKey = randomUUID()
        const args = { p_session_id: reviewedSessionIds[1], p_request_id: setKey, p_report: set }
        const captured = await rpc('record_reviewed_session_set', args)
        const replay = await rpc('record_reviewed_session_set', args)
        check(captured[0].id === replay[0].id && replay[0].replayed, 'Lost-response set retry returns same receipt')
        const afterSet = await fetchReviewedDoseContext(owner, scope)
        check(afterSet.binding.revision > first.binding.revision && afterSet.binding.setReports.length === 1,
          'Real set capture advances revision and enters reviewed source packet')
        check((await compile(owner)).kind === 'review_required', 'New set actuals invalidate prior reviewed week')
        const correction = { ...set, revision: 2, repetitions: 5, rpe: { value: 8, scale: 'rir_based' } }
        await rpc('record_reviewed_session_set', { ...args, p_request_id: randomUUID(), p_report: correction })
        const reports = await owner.from('coach_reviewed_set_reports').select('report,prescription_snapshot,activity_snapshot').order('revision')
        check(!reports.error && reports.data?.length === 2 && doseContentHash(reports.data[0].report) === doseContentHash(set)
          && doseContentHash(reports.data[1].report) === doseContentHash(correction)
          && reports.data.every(row => doseContentHash(row.prescription_snapshot) === doseContentHash(prescription)
            && doseContentHash(row.activity_snapshot) === doseContentHash(activity)), 'Set correction appends actuals and preserves full accepted snapshots')
        const foreignReports = await other.from('coach_reviewed_set_reports').select('id').eq('user_id', userId)
        check(!foreignReports.error && foreignReports.data?.length === 0, 'Real RLS hides set reports from other athlete')
        const forbidden = await other.rpc('record_reviewed_session_set', { ...args, p_request_id: randomUUID() })
        check(forbidden.error?.code === 'P0002', 'Foreign athlete cannot capture a set against owned session')
        const conflict = await owner.rpc('record_reviewed_session_set', { ...args, p_request_id: randomUUID() })
        check(conflict.error?.code === '40001', 'Stale correction revision cannot overwrite a newer set')
        const competing = await Promise.all([randomUUID(), randomUUID()].map(key => owner.rpc('record_reviewed_session_set', {
          ...args, p_request_id: key, p_report: { ...set, setNumber: 2 },
        })))
        check(competing.filter(value => !value.error).length === 1 && competing.filter(value => value.error?.code === '40001').length === 1,
          'Concurrent different-key writers produce one set revision and one conflict')
        const concurrentArgs = { ...args, p_request_id: randomUUID(), p_report: { ...set, setNumber: 3 } }
        const duplicates = await Promise.all([owner.rpc('record_reviewed_session_set', concurrentArgs), owner.rpc('record_reviewed_session_set', concurrentArgs)])
        check(duplicates.every(value => !value.error) && duplicates[0].data[0].id === duplicates[1].data[0].id
          && duplicates.filter(value => value.data[0].replayed).length === 1, 'Concurrent identical retries return one saved receipt')
        const latest = await owner.from('coach_reviewed_set_reports').select('id,report').eq('prescribed_session_id', args.p_session_id)
        check(!latest.error && latest.data?.length === 4, 'Completion reads all original and correction reports')
        const ids = latest.data!.filter(row => row.report.setNumber !== 1 || row.report.revision === 2).map(row => row.id)
        const completion = { ...reviewedCompletion(ids), occurredAt: new Date().toISOString(), workoutDate: today }
        const stale = await owner.rpc('complete_reviewed_session', { p_session_id: args.p_session_id, p_request_id: randomUUID(),
          p_request: { ...completion, setReportIds: [captured[0].id] } })
        check(stale.error?.code === '40001', 'Completion rejects superseded or incomplete set manifest')
        const completionArgs = { p_session_id: args.p_session_id, p_request_id: randomUUID(), p_request: completion }
        const completed = await Promise.all([owner.rpc('complete_reviewed_session', completionArgs), owner.rpc('complete_reviewed_session', completionArgs)])
        check(completed.every(value => !value.error) && completed[0].data.result.workout_id === completed[1].data.result.workout_id
          && completed.filter(value => value.data.result.replayed).length === 1, 'Concurrent completion retries save exactly one workout and receipt')
        const completedId = completed[0].data.result.workout_id
        receipt.completedWorkoutId = completedId; save()
        await awaitCapturedTime(completed[0].data.receipt.capturedAt)
        const completedWork = await owner.from('workouts').select('blocks').eq('id', completedId).single()
        const movements = completedWork.data?.blocks.flatMap((block: { movements: Record<string, unknown>[] }) => block.movements)
        check(!completedWork.error && movements?.length === 3 && movements[0].reps === 5 && movements[0].setReportRevision === 2
          && movements.every((movement: Record<string, unknown>) => movement.restAfterSeconds === 180), 'Canonical workout preserves three latest actual sets and rest')
        const afterCompletion = await fetchReviewedDoseContext(owner, scope)
        check(afterCompletion.performed.records.filter(row => row.workoutId === completedId).length === 3
          && afterCompletion.performed.records.filter(row => row.workoutId === completedId).every(row => row.basis === 'reported_work'),
          'Real authenticated factual reader consumes completion actuals without copying targets')
        const postTerminal = await owner.rpc('record_reviewed_session_set', { ...args, p_request_id: randomUUID(), p_report: { ...set, setNumber: 4 } })
        check(postTerminal.error?.code === '55000', 'Completed session rejects new actual sets')
        // A simultaneous set and completion must serialize on the session row.
        const raceSession = reviewedSessionIds[0]
        const raceActivity = reviewed.plan.scheduledSessions[0].prescription.content.steps.find(step => step.kind === 'activity' && step.role === 'working')!
        const raceReport = { ...set, activityId: raceActivity.id }
        const raceFirst = await rpc('record_reviewed_session_set', { p_session_id: raceSession, p_request_id: randomUUID(), p_report: raceReport })
        const raceRequest = { ...reviewedCompletion([raceFirst[0].id]), occurredAt: new Date().toISOString(), workoutDate: today }
        const race = await Promise.all([
          owner.rpc('complete_reviewed_session', { p_session_id: raceSession, p_request_id: randomUUID(), p_request: raceRequest }),
          owner.rpc('record_reviewed_session_set', { p_session_id: raceSession, p_request_id: randomUUID(), p_report: { ...raceReport, setNumber: 2 } }),
        ])
        check((!race[0].error && race[1].error?.code === '55000') || (race[0].error?.code === '40001' && !race[1].error),
          'Completion versus new-set race preserves either terminal state or a manifest conflict')
      }
      if (reviewed && mode === 'full-week') {
        const expected = new Map<string, ReturnType<typeof syntheticReviewedSessionActuals>[number]>()
        const completedIds: string[] = []
        for (const [index, slot] of reviewed.plan.scheduledSessions.entries()) {
          const occurredAt = new Date(Date.now() - (6 - index) * 86400000).toISOString()
          const reports = syntheticReviewedSessionActuals(slot.prescription, new Date(Date.parse(occurredAt) - 60000).toISOString())
          const ids: string[] = []
          for (const report of reports) {
            const captured = await owner.rpc('record_reviewed_session_set', { p_session_id: reviewedSessionIds[index], p_request_id: randomUUID(), p_report: report })
            if (captured.error) throw new Error(`Full-session set capture: ${captured.error.code}`)
            ids.push(captured.data[0].id); expected.set(captured.data[0].id, report)
          }
          // Revise a real set before completion, retaining the old immutable row.
          const correction = { ...reports[0], revision: 2, rpe: null, restAfterSeconds: 113 }
          const changed = await rpc('record_reviewed_session_set', { p_session_id: reviewedSessionIds[index], p_request_id: randomUUID(), p_report: correction })
          expected.delete(ids[0]); ids[0] = changed[0].id; expected.set(ids[0], correction)
          const completion = { ...reviewedCompletion(ids), occurredAt, workoutDate: formatUTCAsLocalDateWithOffset(reports[0].performedAt, 300) }
          const completed = await rpc('complete_reviewed_session', { p_session_id: reviewedSessionIds[index], p_request_id: randomUUID(), p_request: completion })
          completedIds.push(completed.result.workout_id)
          await awaitCapturedTime(completed.receipt.capturedAt)
          check(ids.length === reports.length, `Full session ${slot.prescription.sessionId}: ${ids.length} current reports completed`)
        }
        const full = await fetchReviewedDoseContext(owner, scope)
        const actuals = full.performed.records.filter(row => completedIds.includes(row.workoutId))
        const actualIds = actuals.map(row => row.setEvidence?.reportId)
        check(full.performed.coverage.complete && actuals.length === expected.size && full.performed.coverage.omitted.length === 0
          && new Set(actualIds).size === expected.size && doseContentHash([...actualIds].sort()) === doseContentHash([...expected.keys()].sort()),
          'All actual sets across all five sessions reach the deterministic compiler without truncation')
        check(actuals.every(row => {
          const evidence = row.setEvidence, report = evidence && expected.get(String(evidence.reportId))
          if (!report || row.basis !== 'reported_work') return false
          const source = full.binding.setReports.find(source => source.id === evidence!.reportId)
          const activity = source?.activity_snapshot as { protocolId: string | null; movementId: string } | undefined
          if (!activity || doseContentHash(row.protocol) !== doseContentHash({ prescribedProtocolId: activity.protocolId, actualSetup: 'unknown' })) return false
          if (row.movementId === null || row.movementId !== resolveReviewedMovementId(activity.movementId) || row.recordedName !== activity.movementId) return false
          return doseContentHash(evidence) === doseContentHash({ reportId: evidence!.reportId, revision: report.revision, setNumber: report.setNumber,
            performedAt: report.performedAt, durationSeconds: report.durationSeconds, distanceMetres: report.distanceMetres,
            restAfterSeconds: report.restAfterSeconds, velocity: report.velocity, stopped: report.stopped, symptoms: report.symptoms, note: report.note })
            && doseContentHash(row.effort) === doseContentHash(report.rpe)
            && doseContentHash(row.unilateralConvention) === doseContentHash({ side: report.side, loadConvention: report.load?.convention ?? null })
            && (report.repetitions === null ? row.quantities.repetitions.kind === 'unknown' : row.quantities.repetitions.kind === 'exact' && row.quantities.repetitions.value === report.repetitions)
            && (report.load === null ? row.quantities.load.kind === 'unknown' : row.quantities.load.kind === 'exact' && row.quantities.load.value === report.load.value && row.quantities.loadUnit === report.load.unit)
        }), 'Every actual rep/load/RPE/rest/sensor/side/symptom/revision matches its explicit source report')
        const prompt = buildPerformedWorkContext({ ...full.binding.history, asOf: full.asOf })
        check(prompt.status === 'partial' && prompt.coverage.omitted.some(row => row.reason === 'record_budget'),
          'The same full history exceeds the chat budget without blocking internal evidence')
        const rebound = [{ ...weekRegistry[0], contextHash: full.contextHash }]
        const afterWork = await compileAuthenticatedReviewedWeek(owner, 'developmental-swap', rebound)
        check(afterWork.kind === 'reviewed_candidate' && !afterWork.numericRuntimeEligible,
          'Fresh server registration compiles the complete reviewed week after full evidence readback')
        receipt.fullSessionEvidence = { sessions: completedIds.length, reports: expected.size, characters: full.performed.coverage.usedRecordCharacters }
        const amendedId = completedIds[0]
        const original = await owner.from('workouts').select('workout_date,input_text,blocks').eq('id', amendedId).single()
        check(!original.error, 'Read completed-session snapshot for correction')
        const amendedBlocks = structuredClone(original.data!.blocks)
        amendedBlocks[0].movements[0].note = 'Synthetic corrected actual after completion.'
        await rpc('amend_program_execution', { p_entity_id: amendedId, p_expected_revision: 1, p_request_id: randomUUID(),
          p_record: { ...original.data!, blocks: amendedBlocks }, p_blocks: amendedBlocks.map(() => ({})), p_provenance: captureProvenance('workout', 'athlete_reported', 'corrected') })
        check((await compileAuthenticatedReviewedWeek(owner, 'developmental-swap', rebound)).kind === 'review_required',
          'Completed-session amendment invalidates its prior trusted registration')
      }
      const amendmentKey = randomUUID(); receipt.amendmentKey = amendmentKey; save()
      const amendmentReceipt = await rpc('amend_logged_activity', { p_kind: 'workout', p_entity_id: workoutId, p_expected_revision: 1, p_request_id: amendmentKey,
        p_record: { ...work, notes: 'Synthetic correction: stopped for discomfort.' }, p_blocks: [{}], p_provenance: provenance })
      await awaitCapturedTime(amendmentReceipt.capturedAt)
      if (mode !== 'full-week') {
        const current = await fetchReviewedDoseContext(owner, scope)
        check(current.binding.revision > first.binding.revision && current.contextHash !== first.contextHash, 'Real correction trigger advances revision and changes binding')
      }
      check((await compile(owner)).kind === 'review_required', 'Old registration rejected after correction')
      if (reviewed) check((await prepareReviewedWeekProposalRegistration(owner, 'developmental-swap', weekRegistry)).kind === 'review_required',
        'Canonical correction invalidates prepared registration authority')
      const saved = await owner.from('training_plan_versions').select('intent').eq('id', planId).single()
      check(!saved.error && JSON.stringify(saved.data?.intent) === JSON.stringify(first.binding.base.plan.intent), 'Accepted original plan remains unchanged')
      receipt.status = 'passed'; receipt.finishedAt = new Date().toISOString(); save()
      console.log(JSON.stringify({ receipt: `${directory}/receipt.json`, checks: checks.length, status: 'passed' }))
    } catch (error) {
      receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message : 'Unknown local integration failure'; save()
      throw error
    }
  }, 60000)
})
