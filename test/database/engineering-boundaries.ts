import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recommendationFixture } from './recommendation-fixture'
import { sqlFile } from './fixture'
import type { EngineeringRule, FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { recommendationScope, fetchRecommendationContext } from '@/app/lib/recommendations/context'
import { evaluateRules, fingerprint } from '@/app/lib/recommendations/rules'
import { evaluateRecommendationOutcome } from '@/app/lib/recommendations/outcomes'
import { rankCandidates } from '@/app/lib/recommendations/rank'
import type { RecommendationDecision, RecommendationSnapshot, RefreshClaim, StoredRecommendation } from '@/app/lib/recommendations/contracts'
import { captureProvenance, type CaptureOperation } from '@/app/lib/capture/contracts'
import { freezeCapture, commitCaptureItem, commitCaptureBundle } from '@/app/lib/capture/service'
import { readCaptureRequest } from '@/app/lib/capture/reconciliation'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'

type Facts = Record<string, FixtureValue>
export interface EngineeringBoundaryActual {
  decision: 'action' | 'collect_signal' | 'abstain'
  state: 'ready' | 'pending'
  recommendation: RecommendationDecision | null
  fixtureFactsUnchanged: boolean
  predicates: Record<string, any>
  limitations: string[]
}
export const ENGINEERING_BOUNDARY_VERSION = 'engineering-sql-boundaries-1-exposed'
const identifier = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Invalid fixture SQL identifier'); return `"${name}"` }
const number = (facts: Facts, key: string) => { if (typeof facts[key] !== 'number' || !Number.isFinite(facts[key])) throw Error(`Missing numeric fact ${key}`); return facts[key] }
function validateBoundaryFacts(rule: EngineeringRule, facts: Facts) {
  const require = (value: boolean, message: string) => { if (!value) throw Error(`Unsupported boundary facts: ${message}`) }
  const keys = (allowed: string[]) => require(Object.keys(facts).every(key => allowed.includes(key)), 'unmapped material field')
  const strings = (...names: string[]) => names.forEach(name => require(typeof facts[name] === 'string' && String(facts[name]).length > 0, name))
  for (const [key, value] of Object.entries(facts)) if (/Revision$/.test(key)) require(typeof value === 'number' && Number.isInteger(value) && value >= 0, key)
  if (rule === 'accepted_plan') {
    const plan = ['planId', 'planStatus', 'sessionStatus']
    if (facts.lifecycle !== 'superseded') { strings('planId'); require(facts.planStatus === 'accepted' && facts.sessionStatus === 'planned', 'accepted planned session required') }
    if ('workerLeaseToken' in facts) {
      keys([...plan, 'workerLeaseToken', 'currentLeaseToken', 'sourceRevision', 'workerSourceRevision', 'responseRevision', 'workerResponseRevision'])
      strings('workerLeaseToken', 'currentLeaseToken')
    } else if ('currentResponseRevision' in facts) {
      keys([...plan, 'workerResponseRevision', 'currentResponseRevision', 'sourceRevision', 'workerSourceRevision', 'leaseMatches'])
      require(facts.leaseMatches === true, 'matching lease required for isolated response fence')
      require(number(facts, 'currentResponseRevision') === number(facts, 'workerResponseRevision') + 1, 'one actual racing response')
      const delta = number(facts, 'sourceRevision') - number(facts, 'workerSourceRevision')
      require(delta >= 0 && delta <= 20, 'bounded forward source changes')
    } else if ('capturedCapabilitiesVersion' in facts) {
      keys([...plan, 'capturedCapabilitiesVersion', 'currentCapabilitiesVersion', 'sourceRevision', 'workerSourceRevision', 'recommendationsEnabled'])
      strings('capturedCapabilitiesVersion', 'currentCapabilitiesVersion')
      require(facts.recommendationsEnabled === true, 'enabled capability runtime-fingerprint boundary')
      require(facts.sourceRevision === facts.workerSourceRevision, 'unchanged source for isolated runtime fence')
    } else {
      keys(['decisionId', 'lifecycle', 'followUpDue', 'outcomeObservationId', 'outcomeComparable', 'canonicalOriginDecisionId', 'overlappingActionIds'])
      strings('decisionId', 'outcomeObservationId', 'canonicalOriginDecisionId')
      require(facts.lifecycle === 'superseded' && facts.followUpDue === true, 'superseded due follow-up')
      require(typeof facts.outcomeComparable === 'boolean' && facts.canonicalOriginDecisionId === facts.decisionId, 'owned origin and explicit comparability')
      require(Array.isArray(facts.overlappingActionIds) && facts.overlappingActionIds.length === 1 && typeof facts.overlappingActionIds[0] === 'string' && facts.overlappingActionIds[0] !== facts.decisionId, 'one distinct overlapping action')
    }
  } else if (rule === 'logged_nutrition') {
    strings('targetId'); require(facts.targetConfirmed === true && facts.coverage === 'unknown', 'confirmed target and unknown coverage')
    require(number(facts, 'targetCalories') >= 0, 'nonnegative target')
    if ('authorizedChildIds' in facts) {
      keys(['targetId', 'targetConfirmed', 'targetCalories', 'authorizedChildIds', 'canonicalChildIds', 'childCalories', 'otherCalories', 'samePayload', 'coverage'])
      require(Array.isArray(facts.authorizedChildIds) && facts.authorizedChildIds.length > 0 && facts.authorizedChildIds.length <= 20 && facts.authorizedChildIds.every(id => typeof id === 'string' && id.length > 0) && new Set(facts.authorizedChildIds).size === facts.authorizedChildIds.length, 'distinct authorized occurrences')
      require(Array.isArray(facts.canonicalChildIds) && facts.canonicalChildIds.every(id => (facts.authorizedChildIds as FixtureValue[]).includes(id)) && new Set(facts.canonicalChildIds).size === facts.canonicalChildIds.length, 'unique canonical subset')
      require(facts.samePayload === true && number(facts, 'childCalories') >= 0 && number(facts, 'otherCalories') >= 0, 'identical nonnegative child payload')
    } else {
      keys(['targetId', 'targetConfirmed', 'targetCalories', 'loggedCalories', 'decisionLocalDate', 'currentLocalDate', 'sourceRevision', 'decisionSourceRevision', 'coverage'])
      strings('decisionLocalDate', 'currentLocalDate')
      require(/^\d{4}-\d{2}-\d{2}$/.test(String(facts.decisionLocalDate)) && /^\d{4}-\d{2}-\d{2}$/.test(String(facts.currentLocalDate)), 'ISO local dates')
      require(facts.sourceRevision === facts.decisionSourceRevision && number(facts, 'loggedCalories') >= 0, 'unchanged source for isolated day boundary')
    }
  } else throw Error('Unsupported SQL boundary rule')
}

/** Actual SQL transport only; no rule eligibility or rows are mocked. */
function transport(db: PGlite, owner: string, role: 'authenticated' | 'service_role') {
  let queue = Promise.resolve<unknown>(null)
  const execute = (sql: string, params: unknown[]) => {
    const result = queue.then(() => db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`)
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner])
      return (await tx.query(sql, params)).rows
    }))
    queue = result.catch(() => null)
    return result.then(rows => ({ data: JSON.parse(JSON.stringify(rows)), error: null })).catch(error => ({ data: null, error: { code: error.code, message: error.message } }))
  }
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const pairs = Object.entries(args), r = await execute(`SELECT ${identifier(name)}(${pairs.map(([k], i) => `${identifier(k)}=>$${i + 1}`).join(',')}) value`, pairs.map(([, v]) => v))
      return { ...r, data: r.data?.[0]?.value ?? null }
    },
    from: (table: string) => {
      const params: unknown[] = [], where: string[] = []
      let fields = '*', order = '', limit = '', single = false
      const q: any = {
        select: (v: string) => { fields = v === '*' ? '*' : v.split(',').map(identifier).join(','); return q },
        order: (v: string, options?: { ascending?: boolean }) => { order = ` ORDER BY ${identifier(v)} ${options?.ascending === false ? 'DESC' : 'ASC'}`; return q },
        limit: (v: number) => { limit = ` LIMIT ${v}`; return q },
        maybeSingle: () => { single = true; return q },
        // PostgreSQL JSON preserves DATE as YYYY-MM-DD, as PostgREST does;
        // PGlite's direct DATE decoder would otherwise turn it into a JS Date.
        then: (resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) => execute(`SELECT to_jsonb(fixture_row) value FROM (SELECT ${fields} FROM ${identifier(table)}${where.length ? ' WHERE ' + where.join(' AND ') : ''}${order}${limit}) fixture_row`, params).then(r => { const rows = r.data?.map((row: { value: unknown }) => row.value) ?? null; return resolve({ ...r, data: single ? rows?.[0] ?? null : rows }) }, reject)
      }
      for (const [name, op] of [['eq', '='], ['gte', '>='], ['lte', '<=']] as const) q[name] = (key: string, value: unknown) => { params.push(value); where.push(`${identifier(key)}${op}$${params.length}`); return q }
      q.in = (key: string, value: unknown[]) => { params.push(value); where.push(`${identifier(key)}=ANY($${params.length})`); return q }
      return q
    }
  } as unknown as SupabaseClient
}
async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.rpc(name, args)
  if (result.error) throw Object.assign(Error(result.error.message), result.error)
  return result.data
}
async function setup(plan: boolean) {
  const db = await recommendationFixture(), scope = recommendationScope(0)
  await db.exec('ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY; CREATE POLICY target_owner ON daily_targets TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid()); GRANT SELECT,INSERT,UPDATE ON daily_targets TO authenticated;')
  let owner: string = randomUUID(), session: string | null = null, planId: string | null = null
  if (plan) {
    const seed = sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql').split('SET LOCAL ROLE authenticated;')[0]
      .replaceAll(', TRUE)', ', FALSE)').replaceAll('CURRENT_DATE,', 'CURRENT_DATE + 7,')
      .replaceAll('CURRENT_DATE - 2,', 'CURRENT_DATE,').replaceAll('CURRENT_DATE - 1,', 'CURRENT_DATE,')
    await db.exec(seed + ' COMMIT;')
    const setting = async (key: string) => (await db.query<{ v: string }>('SELECT current_setting($1) v', ['atomic_completion_test.' + key])).rows[0].v
    owner = await setting('user_1'); session = await setting('session_as_prescribed'); planId = await setting('plan_1')
    // Dates are staged before inserting immutable accepted prescriptions. A
    // second planned session supplies the explicit overlapping-action case.
  } else await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
  const user = transport(db, owner, 'authenticated'), service = transport(db, owner, 'service_role')
  const claim = (runtime = scope.runtimeFingerprint): Promise<RefreshClaim> => rpc(service, 'claim_recommendation_refresh', { p_user_id: owner, p_runtime_fingerprint: runtime, p_local_date: scope.localDate, p_timezone_offset: 0 })
  const read = (runtime = scope.runtimeFingerprint): Promise<RecommendationSnapshot> => rpc(service, 'read_recommendations', { p_user_id: owner, p_runtime_fingerprint: runtime, p_local_date: scope.localDate, p_timezone_offset: 0 })
  const selected = async (c: RefreshClaim, runtime = scope.runtimeFingerprint) => {
    const context = await fetchRecommendationContext(user, owner, c, { ...scope, now: new Date().toISOString(), runtimeFingerprint: runtime })
    const candidates = rankCandidates(evaluateRules(context), [], context.now)
    const candidate = candidates.find(c => c.decision.outcome?.sourceId === session) ?? candidates[0]
    if (!candidate) throw Error(`Materialized facts did not produce a rule candidate: ${JSON.stringify({ plan: context.plan, sessions: context.sessions, localDate: context.localDate })}`)
    return candidate.decision
  }
  const publish = (c: RefreshClaim, d: RecommendationDecision) => rpc(service, 'publish_recommendations', { p_user_id: owner, p_lease_token: c.leaseToken, p_source_revision: c.sourceRevision, p_response_revision: c.responseRevision, p_runtime_fingerprint: d.runtimeFingerprint, p_local_date: d.localDate, p_timezone_offset: d.tzOffset, p_decisions: [d], p_next_due_at: null })
  const state = async () => (await db.query<any>('SELECT * FROM recommendation_refresh_state WHERE user_id=$1', [owner])).rows[0]
  const stageCounters = async (source: number, response: number) => {
    await read()
    await db.query('UPDATE recommendation_refresh_state SET source_revision=$2,response_revision=$3,processed_source_revision=-1,processed_response_revision=-1 WHERE user_id=$1', [owner, source, response])
  }
  return { db, owner, session, planId, scope, user, service, claim, selected, publish, read, state, stageCounters }
}
type Environment = Awaited<ReturnType<typeof setup>>
function mealOperation(id: string, calories: number, at: string): CaptureOperation {
  return { sourceItemId: id, kind: 'meal', inputMethod: 'manual', eventAt: at, record: { meal_timestamp: at, items: [{ food: 'Synthetic meal', portion: 'one occurrence', protein: 0, carbs: 0, fat: 0, calories }] }, blocks: [], provenance: captureProvenance('meal', 'athlete_reported', 'athlete_confirmed', []) }
}
async function saveMeals(f: Environment, operations: CaptureOperation[], key = randomUUID()) {
  const request = await rpc(f.user, 'begin_logging_request', { p_key: key, p_fingerprint: fingerprint(operations) })
  const children = await freezeCapture(f.user, request.id, operations)
  return { request, children, key }
}
async function populateNutrition(f: Environment, facts: Facts, calories: number) {
  if (facts.targetConfirmed !== true) throw Error('Boundary scenario requires a confirmed target')
  await f.db.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,0,0,0,$2)', [f.owner, number(facts, 'targetCalories')])
  const other = await saveMeals(f, [mealOperation('other', calories, f.scope.now)])
  await commitCaptureItem(f.user, other.children[0].id)
}
function visible(snapshot: RecommendationSnapshot, onlyId?: string) {
  const row = snapshot.recommendations.find(r => !onlyId || r.id === onlyId)
  return { decision: row?.decision.kind ?? 'abstain' as const, recommendation: row?.decision ?? null, state: snapshot.refreshState.pending ? 'pending' as const : 'ready' as const }
}

/** Original heldout is exposed engineering development now. Facts alone choose
 * source/transition materialization; expected labels never enter this function. */
export async function executeEngineeringBoundaryFacts(rule: EngineeringRule, athlete: string, facts: Facts): Promise<EngineeringBoundaryActual> {
  validateBoundaryFacts(rule, facts)
  const original = JSON.stringify(facts), f = await setup(rule === 'accepted_plan')
  const limitations = ['Synthetic actual PostgreSQL/app execution, not hosted or qualified-coach evidence.', 'Symbolic fixture identities map to isolated owner UUIDs. Fixture dates map to the real database day while preserving day differences.', 'Initial audit counters and elapsed lease/day/deadline clock state are staged as fixture prehistory; publication, responses, source writes and outcomes execute actual RPCs.']
  let predicates: Record<string, any> = { numericPolicyEligible: personalizedCoachingCapabilities().initialDosePolicy, athlete, sourceIdentityMap: { ...(facts.planId ? { [String(facts.planId)]: f.planId } : {}), ...(facts.targetId ? { [String(facts.targetId)]: f.owner } : {}) } }, result: ReturnType<typeof visible>
  try {
    if (rule === 'logged_nutrition' && Array.isArray(facts.authorizedChildIds)) {
      await populateNutrition(f, facts, number(facts, 'otherCalories'))
      const operations = facts.authorizedChildIds.map(id => mealOperation(String(id), number(facts, 'childCalories'), f.scope.now))
      const bundle = await saveMeals(f, operations), canonicalIds = facts.canonicalChildIds as string[]
      if (canonicalIds.some(id => !operations.some(p => p.sourceItemId === id))) throw Error('Canonical child not authorized')
      for (const child of bundle.children) if (canonicalIds.includes(child.source_item_id)) await commitCaptureItem(f.user, child.id)
      const reconciled = await readCaptureRequest(f.user, f.owner, bundle.key)
      if (!reconciled) throw Error('Frozen ledger missing')
      const retryCalls: string[] = []
      const blockedPending = { rpc: async (_name: string, args: { p_item_id: string }) => { retryCalls.push(args.p_item_id); throw Error('Unresolved child deliberately remains pending') } } as unknown as SupabaseClient
      const retried = await commitCaptureBundle(blockedPending, bundle.request.id, reconciled.items)
      const c = await f.claim(), d = await f.selected(c); await f.publish(c, d)
      const snapshot = await f.read(), canonical = (await f.db.query<any>('SELECT count(*)::integer count,sum(total_calories)::float8 calories FROM meals WHERE user_id=$1', [f.owner])).rows[0]
      predicates = { ...predicates, canonical, authorized: bundle.children.map(c => c.source_item_id), committed: reconciled.items.filter(c => c.status === 'committed').map(c => c.source_item_id), pending: reconciled.items.filter(c => c.status === 'pending').map(c => c.source_item_id), retried, retryCalls, committedOperationIds: reconciled.receipts.map(r => r.operationId), distinctCanonicalIds: reconciled.receipts.map(r => r.entityId), originalChildren: bundle.children.map(c => c.id), sameNormalizedPayload: operations.every(p => JSON.stringify({ ...p, sourceItemId: null }) === JSON.stringify({ ...operations[0], sourceItemId: null })) }
      result = visible(snapshot)
    } else if (rule === 'logged_nutrition' && typeof facts.decisionLocalDate === 'string') {
      await populateNutrition(f, facts, number(facts, 'loggedCalories'))
      await f.stageCounters(number(facts, 'decisionSourceRevision'), 0)
      const c = await f.claim(), d = await f.selected(c), published = (await f.publish(c, d)).recommendations[0]
      const days = (Date.parse(String(facts.currentLocalDate)) - Date.parse(facts.decisionLocalDate)) / 86_400_000
      if (!Number.isInteger(days) || days < 0) throw Error('Invalid fixture day relationship')
      if (days) await f.db.query(`UPDATE recommendations SET local_date=local_date-$2::integer,valid_until=valid_until-make_interval(days=>$2::integer),decision=jsonb_set(jsonb_set(decision,'{localDate}',to_jsonb((local_date-$2::integer)::text)),'{validUntil}',to_jsonb((valid_until-make_interval(days=>$2::integer))::text)) WHERE id=$1`, [published.id, days])
      if (days) await f.db.query(`UPDATE recommendation_refresh_state SET processed_context=jsonb_set(processed_context,'{localDate}',to_jsonb(($2::date-$3::integer)::text)) WHERE user_id=$1`, [f.owner, f.scope.localDate, days])
      const snapshot = await f.read(), stored = (await f.db.query<any>('SELECT local_date,valid_until FROM recommendations WHERE id=$1', [published.id])).rows[0]
      predicates = { ...predicates, dayDifference: days, unchangedSource: (await f.state()).source_revision === number(facts, 'sourceRevision'), stored, currentDate: f.scope.localDate, originalReason: d.reason, validThroughLocalMidnight: Date.parse(d.validUntil) <= Date.parse(f.scope.validUntil), visibleIds: snapshot.recommendations.map(r => r.id) }
      result = visible(snapshot)
    } else if (typeof facts.workerLeaseToken === 'string') {
      await f.stageCounters(number(facts, 'sourceRevision'), number(facts, 'responseRevision'))
      const old = await f.claim(), draft = await f.selected(old)
      await f.db.query("UPDATE recommendation_refresh_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [f.owner])
      const current = await f.claim()
      const worker = { ...old, leaseToken: facts.workerLeaseToken === facts.currentLeaseToken ? current.leaseToken : old.leaseToken, sourceRevision: number(facts, 'workerSourceRevision'), responseRevision: number(facts, 'workerResponseRevision') }
      let error: string | null = null
      try { await f.publish(worker, { ...draft, sourceRevision: worker.sourceRevision, responseRevision: worker.responseRevision }) } catch (e) { error = (e as Error).message }
      const snapshot = await f.read(), after = await f.state()
      predicates = { ...predicates, publicationError: error, sameRevisionTakeover: old.sourceRevision === current.sourceRevision, oldToken: old.leaseToken, currentToken: current.leaseToken, retainedLease: after.lease_token, workerToken: worker.leaseToken, storedPlanId: f.planId }
      result = visible(snapshot)
    } else if (typeof facts.currentResponseRevision === 'number') {
      await f.stageCounters(number(facts, 'workerSourceRevision'), number(facts, 'workerResponseRevision'))
      const initial = await f.claim(), draft = await f.selected(initial), first = (await f.publish(initial, draft)).recommendations[0]
      // Stage a pending worker at the same exact source/response revisions.
      await f.db.query('UPDATE recommendation_refresh_state SET next_due_at=clock_timestamp() WHERE user_id=$1', [f.owner])
      const worker = await f.claim()
      const response = await rpc(f.user, 'respond_recommendation', { p_recommendation_id: first.id, p_request_id: randomUUID(), p_response: 'not_applicable', p_defer_until: null, p_runtime_fingerprint: f.scope.runtimeFingerprint, p_timezone_offset: 0 })
      const delta = number(facts, 'sourceRevision') - number(facts, 'workerSourceRevision')
      // One explicit saved-target write produces one source revision. A capture
      // transaction can touch multiple consumed rows and is not a single tick.
      for (let i = 0; i < delta; i++) await f.db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated'); await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [f.owner])
        await tx.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,0,0,0,$2) ON CONFLICT(user_id) DO UPDATE SET target_calories=EXCLUDED.target_calories', [f.owner, i + 1])
      })
      let error: string | null = null
      try { await f.publish(worker, draft) } catch (e) { error = (e as Error).message }
      const snapshot = await f.read(), state = await f.state()
      if (state.response_revision !== facts.currentResponseRevision || state.source_revision !== facts.sourceRevision) throw Error('Materialized source/response revision differs from fixture premise')
      predicates = { ...predicates, publicationError: error, response, sourceRevision: state.source_revision, responseRevision: state.response_revision, workerResponseRevision: worker.responseRevision, workerSourceRevision: worker.sourceRevision, pendingSourceRevision: snapshot.refreshState.sourceRevision }
      result = visible(snapshot)
    } else if (typeof facts.capturedCapabilitiesVersion === 'string') {
      await f.stageCounters(number(facts, 'sourceRevision'), 0)
      const captured = fingerprint({ capabilitiesVersion: facts.capturedCapabilitiesVersion }), current = fingerprint({ capabilitiesVersion: facts.currentCapabilitiesVersion })
      const c = await f.claim(captured), d = await f.selected(c, captured); await f.publish(c, d)
      const before = await f.state(), snapshot = await f.read(current), after = await f.state()
      predicates = { ...predicates, capturedFingerprint: captured, currentFingerprint: current, unchangedSource: before.source_revision === after.source_revision, storedDecisionCount: (await f.db.query('SELECT id FROM recommendations WHERE user_id=$1', [f.owner])).rows.length }
      result = visible(snapshot)
    } else if (facts.lifecycle === 'superseded' && facts.followUpDue === true) {
      const c = await f.claim(), d = await f.selected(c), old: StoredRecommendation = (await f.publish(c, d)).recommendations[0]
      const feedback = { schemaVersion: 2, feedbackVersion: 2, outcome: 'as_planned', sessionRpe: null, energy: null, pain: null, note: null, provenance: { sessionRpe: { origin: 'unknown', reviewState: 'unreviewed' }, energy: { origin: 'unknown', reviewState: 'unreviewed' }, pain: { origin: 'unknown', reviewState: 'unreviewed' } } }
      const completion = await rpc(f.user, 'record_coach_session_capture', { p_session_id: f.session, p_status: 'completed', p_feedback: feedback, p_occurred_at: new Date().toISOString(), p_idempotency_key: randomUUID(), p_performed_work: { mode: 'as_prescribed', workoutDate: f.scope.localDate, inputText: null, blocks: null, totalDurationMinutes: null }, p_observations: [], p_recommendation_id: old.id })
      if (facts.outcomeComparable === false) await rpc(f.user, 'amend_program_execution', { p_entity_id: completion.receipt.entityId, p_expected_revision: 1, p_request_id: randomUUID(), p_record: { workout_date: f.scope.localDate, input_text: 'Corrected actual work', blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: 5, weight: '80 lb' }] }] }, p_blocks: [{}], p_provenance: captureProvenance('workout', 'athlete_reported', 'corrected', []) })
      // A second accepted session supplies a genuine overlapping current action.
      const nextClaim = await f.claim(), nextDecision = await f.selected(nextClaim), newer = (await f.publish(nextClaim, nextDecision)).recommendations[0]
      // Move only the deadline to emulate elapsed time; real completion follows publication.
      await f.db.query("UPDATE recommendations SET decision=jsonb_set(decision,'{outcome,dueAt}',to_jsonb(clock_timestamp()::text)) WHERE id=$1", [old.id])
      const pending = await f.read(), due = pending.dueOutcomes.find(r => r.id === old.id)
      if (!due) throw Error('Superseded due outcome disappeared')
      const outcome = await evaluateRecommendationOutcome(f.user, f.owner, due)
      const event = await rpc(f.service, 'record_recommendation_outcome', { p_user_id: f.owner, p_recommendation_id: old.id, p_request_id: `followup:${facts.decisionId}`, p_outcome: outcome })
      const snapshot = await f.read(), stored = (await f.db.query<any>('SELECT lifecycle,decision FROM recommendations WHERE id=$1', [old.id])).rows[0]
      predicates = { ...predicates, oldId: old.id, newerId: newer.id, origin: completion.receipt.recommendationId, oldLifecycle: stored.lifecycle, outcome: event.payload, outcomeEventId: event.id, hiddenOld: !snapshot.recommendations.some(r => r.id === old.id), visibleIds: snapshot.recommendations.map(r => r.id), overlapIds: [newer.id], sourceIdentityMap: { [String(facts.decisionId)]: old.id, [String(facts.outcomeObservationId)]: completion.receipt.entityId, [String((facts.overlappingActionIds as string[])[0])]: newer.id } }
      result = visible(snapshot, old.id)
    } else throw Error('Unsupported actual SQL boundary facts')
    return { ...result, predicates, fixtureFactsUnchanged: JSON.stringify(facts) === original, limitations }
  } finally { await f.db.close() }
}
