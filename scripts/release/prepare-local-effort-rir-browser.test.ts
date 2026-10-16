/** Prepares a mechanical next-week browser registry from retained local evidence.
 * Training tables are read-only here. The only network mutations are bounded
 * local Auth login issuance/verification for the already existing test athlete.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describe, it } from 'vitest'
import { effortWorkInput, effortWorkPlan } from '../../test/fixtures/reviewed-effort-work'
import { doseContentHash } from '@/app/lib/coach/initial-dose-policy'
import { fetchReviewedDoseContext } from '@/app/lib/coach/reviewed-dose-context-server'
import { fetchReviewedProposalState } from '@/app/lib/coach/reviewed-proposal-state-server'
import { fetchReviewedSessionState } from '@/app/lib/coach/reviewed-session-state-server'
import { prepareReviewedWeekProposalRegistration } from '@/app/lib/coach/reviewed-proposal-registration'
import { buildReviewedRollingWeeklyPlan } from '@/app/lib/coach/rolling-weekly-plan'
import { formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'

describe.skipIf(process.env.SOCIUS_LOCAL_EFFORT_BROWSER_PREPARE !== 'true')('prepare retained effort/RIR browser fixture', () => {
  it('pins a separate next-week mechanical registry without creating training records', async () => {
    const runId = process.env.SOCIUS_LOCAL_EFFORT_BROWSER_RUN
    const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
    const sourceRun = '33fd868d-2c74-4e9b-a393-b523a629aa4d'
    if (!runId || !uuid.test(runId)) throw new Error('Explicit new browser fixture UUID required')
    const sourceDirectory = `output/app-quality-release/reviewed-effort-rir-${sourceRun}`
    const sourceBytes = readFileSync(`${sourceDirectory}/receipt.json`), source = JSON.parse(sourceBytes.toString())
    if (source.runId !== sourceRun || source.status !== 'passed' || source.target !== 'http://127.0.0.1:55321'
      || !uuid.test(source.programId) || !uuid.test(source.issued?.planVersionId) || !uuid.test(source.issued?.proposalId)
      || !uuid.test(source.sessionId) || !uuid.test(source.completed?.result?.workout_id)
      || source.users?.length !== 2 || source.users.map((user: { actor: string }) => user.actor).sort().join(',') !== 'athlete,foreign'
      || source.users.some((user: { id: string }) => !uuid.test(user.id)) || source.users[0].id === source.users[1].id) throw new Error('Unverified retained effort lifecycle')
    const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
    const dbUrl = new URL(status.DB_URL)
    if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Nonlocal target denied')
    const directory = `output/app-quality-release/reviewed-effort-browser-${runId}`
    if (existsSync(directory)) throw new Error('Fixture directory exists; inspect retained evidence instead of retrying')
    mkdirSync(directory)
    const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
    const checks: string[] = [], authRequests: Array<Record<string, unknown>> = []
    const receipt: Record<string, unknown> = { runId, sourceRun, status: 'running', target: status.API_URL,
      sourceReceiptSha256: sha(sourceBytes), checks, authRequests,
      purpose: 'Mechanical next-week browser transport fixture; no new athlete prescription approval' }
    const save = () => writeFileSync(`${directory}/receipt.json`, JSON.stringify(receipt, null, 2))
    const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(message); save() }
    const same = (a: unknown, b: unknown) => doseContentHash(a) === doseContentHash(b)
    const localFetch: typeof fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.origin !== status.API_URL) throw new Error('Nonlocal request denied')
      return fetch(input, { ...init, redirect: 'error' })
    }
    const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } }
    save()
    try {
      const athlete = source.users.find((user: { actor: string }) => user.actor === 'athlete')
      const email = `effort-rir-${sourceRun}-athlete@sociusfit-local.invalid`
      const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options)
      const identity = await service.auth.admin.getUserById(athlete.id)
      check(!identity.error && identity.data.user?.id === athlete.id && identity.data.user.email === email, 'Original synthetic athlete identity verified')
      authRequests.push({ action: 'generate_local_login', userId: athlete.id, email, disposition: 'pending' }); save()
      const link = await service.auth.admin.generateLink({ type: 'magiclink', email })
      authRequests[0].disposition = link.error ? 'inspect_required' : 'response_received'; save()
      check(!link.error && link.data.user?.id === athlete.id && link.data.properties, 'Local login issued for original athlete only')
      if (link.error || !link.data.properties) throw new Error('Retained local login unavailable')
      const owner = createClient(status.API_URL, status.ANON_KEY, options)
      authRequests.push({ action: 'verify_local_login', userId: athlete.id, disposition: 'pending' }); save()
      const auth = await owner.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
      authRequests[1].disposition = auth.error ? 'inspect_required' : 'response_received'; save()
      check(!auth.error && auth.data.user?.id === athlete.id, 'Original athlete authenticated without creating identities')
      const baseId = source.issued.planVersionId as string, programId = source.programId as string
      const accepted = await fetchReviewedProposalState(owner, athlete.id, source.issued.proposalId)
      check(accepted?.status === 'accepted' && accepted.planVersionId === baseId && accepted.activePlanVersionId === baseId
        && same(accepted.plan, effortWorkPlan()), 'Original exact effort week remains accepted and active')
      const completed = await fetchReviewedSessionState(owner, athlete.id, source.sessionId)
      check(completed?.status === 'completed' && !completed.writable && same(completed.prescription, effortWorkPlan().scheduledSessions[0].prescription)
        && completed.reports.length === 3 && completed.reports.some(row => row.report.rir === 1.5 && row.report.rpe?.value === 7)
        && completed.reports.some(row => row.report.status === 'not_performed' && row.report.rir === null), 'Completed source session retains independent RIR and omitted work')
      const ownedCounts = async () => {
        const tables = ['training_programs', 'training_plan_versions', 'adaptation_proposals', 'prescribed_sessions', 'coach_reviewed_set_reports', 'workouts']
        const entries = await Promise.all(tables.map(async table => {
          const result = await owner.from(table).select('id', { count: 'exact', head: true }).eq('user_id', athlete.id)
          if (result.error || !Number.isSafeInteger(result.count)) throw new Error(`Owned ${table} count unavailable`)
          return [table, result.count] as const
        }))
        return Object.fromEntries(entries)
      }
      const countsBefore = await ownedCounts()
      const scope = { programId, basePlanVersionId: baseId,
        historyThrough: formatUTCAsLocalDateWithOffset(new Date().toISOString(), 300), historyDays: 90, tzOffset: 300 }
      const current = await fetchReviewedDoseContext(owner, scope)
      check(current.userId === athlete.id && current.binding.history.workouts.some(row => row.id === source.completed.result.workout_id), 'Fresh owned source includes the retained completed workout')
      const next = effortWorkInput()
      next.input.windowStart = next.input.context.profile.startDate = '2026-08-10'
      next.input.sequenceNumber = 2
      next.registry[0].recipe.profileHash = doseContentHash(next.input.context.profile)
      next.registry[0].contentHash = doseContentHash(next.registry[0].recipe)
      const target = buildReviewedRollingWeeklyPlan(next.input, next.registry)
      check(target.kind === 'reviewed_candidate', 'Fixed next-week mechanical recipe compiles without changing prescribed dose')
      if (target.kind !== 'reviewed_candidate') throw new Error(target.reasons.join('; '))
      const { profile: _profile, ...context } = next.input.context; void _profile
      const entry: TrustedReviewedWeekRegistration = { id: `effort-browser-next-week-${runId}`, userId: athlete.id, scope,
        contextHash: current.contextHash, transition: 'next_week', compilation: { ...next.input, context }, reviewedWeeks: next.registry }
      const prepared = await prepareReviewedWeekProposalRegistration(owner, entry.id, [entry])
      check(prepared.kind === 'prepared_registration', 'Fresh authenticated source prepares an adjacent-week packet')
      if (prepared.kind !== 'prepared_registration') throw new Error(prepared.reasons.join('; '))
      check(same(prepared.packet.intent.reviewed_week, target.plan), 'Prepared packet preserves exact next-week mechanical content')
      const sourceReadAgain = await fetchReviewedDoseContext(owner, scope)
      check(sourceReadAgain.contextHash === current.contextHash && same(await ownedCounts(), countsBefore), 'Preparation leaves source binding and owned training row counts unchanged')
      const registryBytes = JSON.stringify([entry], null, 2)
      const provenance = { sourceRun, sourceReceiptSha256: sha(sourceBytes), sourceProgramId: programId, sourcePlanVersionId: baseId,
        sourceProposalId: source.issued.proposalId, completedSessionId: source.sessionId, completedWorkoutId: source.completed.result.workout_id,
        sourceContextHash: current.contextHash, sourceBindingHash: doseContentHash(current.binding),
        basePlanHash: doseContentHash(accepted!.plan), targetPlanHash: doseContentHash(target.plan),
        baseProfileHash: doseContentHash(current.profile), targetProfileHash: doseContentHash(next.input.context.profile),
        recipeContentHash: next.registry[0].contentHash, packetFingerprint: prepared.fingerprint, countsBefore }
      const fixture = { runId, programId, baseId, authSourceRun: sourceRun,
        users: source.users.map((user: { actor: string; id: string }) => ({ actor: user.actor, id: user.id })),
        registrySha256: sha(registryBytes), registryHash: doseContentHash([entry]), ...provenance }
      const fixtureBytes = JSON.stringify(fixture, null, 2), packetBytes = JSON.stringify(prepared, null, 2)
      writeFileSync(`${directory}/registry.json`, registryBytes)
      writeFileSync(`${directory}/fixture.json`, fixtureBytes)
      writeFileSync(`${directory}/packet.json`, packetBytes)
      Object.assign(receipt, { status: 'passed', registrySha256: sha(registryBytes), fixtureSha256: sha(fixtureBytes), packetSha256: sha(packetBytes),
        ...provenance, finishedAt: new Date().toISOString() }); save()
      console.log(JSON.stringify({ runId, sourceRun, checks: checks.length, status: receipt.status, fixture: `${directory}/fixture.json` }))
    } catch (error) {
      receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message : 'Unknown local preparation failure'; save(); throw error
    }
  }, 30000)
})
