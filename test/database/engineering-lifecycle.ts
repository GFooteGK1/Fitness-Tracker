import { randomUUID, createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EngineeringRule, FixtureValue } from '../fixtures/personalized-coaching/contracts'
import { recommendationFixture } from './recommendation-fixture'
import { getRecommendationView } from '@/app/lib/recommendations/service'
import { recommendationScope } from '@/app/lib/recommendations/context'
import { localDateToUTCStart } from '@/app/lib/timezone-utils'
import { captureProvenance, type CaptureOperation } from '@/app/lib/capture/contracts'
import { freezeCapture, commitCaptureItem, commitCaptureBundle, CaptureError } from '@/app/lib/capture/service'
import { readCaptureRequest } from '@/app/lib/capture/reconciliation'
import { mayPublishRecommendation, hasUnreconciledCapture } from '@/app/lib/client/capture-uncertainty'

export const ENGINEERING_LIFECYCLE_VERSION = 'engineering-sql-lifecycle-1-dev'
type Facts = Record<string, FixtureValue>
type View = Awaited<ReturnType<typeof getRecommendationView>>
export interface EngineeringLifecycleActual {
  decision: 'action' | 'collect_signal' | 'abstain'
  state: 'ready' | 'pending'
  recommendation: View['recommendations'][number]['decision'] | null
  serverState: string
  needsReconciliation: boolean
  fixtureFactsUnchanged: boolean
  predicates: Record<string, unknown>
  limitations: string[]
}
let fixture: Promise<PGlite> | undefined
let queue: Promise<unknown> = Promise.resolve()
const sqlDb = () => fixture ??= recommendationFixture().then(async db => {
  // The chain fixture extracts the historical target table without the hosted
  // grants. Supply its owner policy just as the existing SQL journey does.
  await db.exec('ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY; CREATE POLICY target_owner ON daily_targets TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid()); GRANT SELECT,INSERT,UPDATE ON daily_targets TO authenticated;')
  return db
})
export async function closeEngineeringLifecycle() { if (fixture) await (await fixture).close(); fixture = undefined; queue = Promise.resolve() }
const quote = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Unexpected SQL fixture identifier'); return `"${name}"` }
/** Query mechanics only. Actual SQL supplies all rows, functions, ownership and transaction results. */
function client(db: PGlite, owner: string, role: 'authenticated' | 'service_role'): SupabaseClient {
  const execute = (source: string, values: unknown[]) => {
    const result = queue.then(() => db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`)
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner])
      return (await tx.query(source, values)).rows
    }))
    queue = result.catch(() => undefined)
    return result.then(rows => ({ data: JSON.parse(JSON.stringify(rows)), error: null }))
      .catch(error => ({ data: null, error: { code: error.code, message: error.message } }))
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      const entries = Object.entries(args)
      const result = await execute(`SELECT public.${quote(name)}(${entries.map(([key], i) => `${quote(key)} => $${i + 1}`).join(',')}) result`, entries.map(([, value]) => value))
      return { ...result, data: result.data?.[0]?.result ?? null }
    },
    from: (table: string) => {
      let columns = '*', order = '', limit = '', single = false
      const where: string[] = [], params: unknown[] = []
      const chain: any = {
        select: (fields: string) => { columns = fields === '*' ? '*' : fields.split(',').map(quote).join(','); return chain },
        order: (field: string, options?: { ascending?: boolean }) => { order = ` ORDER BY ${quote(field)} ${options?.ascending === false ? 'DESC' : 'ASC'}`; return chain },
        limit: (n: number) => { limit = ` LIMIT ${n}`; return chain },
        maybeSingle: () => { single = true; return chain },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => execute(`SELECT ${columns} FROM public.${quote(table)}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${order}${limit}`, params).then(result => resolve({ ...result, data: single ? result.data?.[0] ?? null : result.data }), reject),
      }
      for (const [name, op] of [['eq', '='], ['gte', '>='], ['lte', '<=']] as const) chain[name] = (key: string, value: unknown) => { params.push(value); where.push(`${quote(key)} ${op} $${params.length}`); return chain }
      chain.in = (key: string, values: unknown[]) => { params.push(values); where.push(`${quote(key)}=ANY($${params.length})`); return chain }
      return chain
    },
  } as unknown as SupabaseClient
}
async function call(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await db.rpc(name, args)
  if (result.error) throw Object.assign(new Error(result.error.message), result.error)
  return result.data
}
function requiredNumber(facts: Facts, key: string): number {
  if (typeof facts[key] !== 'number' || !Number.isFinite(facts[key]) || Number(facts[key]) < 0) throw Error(`Unsupported numeric fixture fact: ${key}`)
  return Number(facts[key])
}
function currentScope(facts: Facts) {
  // Preserve the fixture's wall-clock report time without pretending PostgreSQL is
  // still on its frozen development date. Choose a valid raw offset so that the
  // report is thirty minutes in the past on the actual database day.
  const match = typeof facts.coverage === 'string' ? facts.coverage.match(/through_(\d{2}):(\d{2})/) : null
  let offset = 0
  if (match) {
    const now = new Date()
    offset = now.getUTCHours() * 60 + now.getUTCMinutes() - (Number(match[1]) * 60 + Number(match[2]) + 30)
    if (offset < -720) offset += 1440
    if (offset > 840) offset -= 1440
  }
  const scope = recommendationScope(offset)
  return { ...scope, through: match ? new Date(Date.parse(localDateToUTCStart(scope.localDate, offset)) + Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000).toISOString() : null }
}
function operation(calories: number, at: string, sourceItemId: string, photo = false): CaptureOperation {
  return { sourceItemId, kind: 'meal', inputMethod: photo ? 'photo' : 'manual', eventAt: at, blocks: [],
    record: { meal_timestamp: at, items: [{ food: 'Synthetic fixture meal', portion: 'one fixture occurrence', calories, protein: 0, carbs: 0, fat: 0 }] },
    provenance: captureProvenance('meal', photo ? 'model_estimated' : 'athlete_reported', photo ? 'unreviewed' : 'athlete_confirmed', [sourceItemId]) }
}
async function setup(athlete: string, facts: Facts) {
  const db = await sqlDb(), owner = randomUUID(), scope = currentScope(facts)
  await queue; await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
  if (facts.targetConfirmed === true) await db.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,0,0,0,$2)', [owner, requiredNumber(facts, 'targetCalories')])
  const user = client(db, owner, 'authenticated'), service = client(db, owner, 'service_role')
  const record = operation(requiredNumber(facts, typeof facts.canonicalCalories === 'number' ? 'canonicalCalories' : 'loggedCalories'), scope.now, `${athlete}:canonical`)
  const ledger = await call(user, 'begin_logging_request', { p_key: `${athlete}:canonical:${randomUUID()}`, p_fingerprint: createHash('sha256').update(JSON.stringify(record)).digest('hex') })
  const items = await freezeCapture(user, ledger.id, [record])
  let receipt = await commitCaptureItem(user, items[0].id)
  const calculationRevision = typeof facts.currentCalculationRevision === 'number' ? facts.currentCalculationRevision : 1
  for (let revision = receipt.revision; revision < calculationRevision; revision++) receipt = await call(user, 'amend_logged_activity', { p_kind: 'meal', p_entity_id: receipt.entityId, p_expected_revision: revision, p_request_id: randomUUID(), p_record: record.record, p_blocks: [], p_provenance: record.provenance })
  if (typeof facts.coverageRevision === 'number' && facts.coverageRevision !== calculationRevision) throw Error('This lifecycle fixture requires its original coverage and published calculation to share a revision')
  let view = await getRecommendationView(user, owner, scope.tzOffset, true, service)
  if (scope.through) {
    await call(user, 'confirm_logging_coverage', { p_domain: 'nutrition', p_local_date: scope.localDate, p_coverage_through: scope.through, p_status: String(facts.coverage).startsWith('complete') ? 'complete_through' : 'partial', p_request_id: randomUUID(), p_expected_source_revision: view.refreshState!.sourceRevision, p_timezone_offset: scope.tzOffset })
    view = await getRecommendationView(user, owner, scope.tzOffset, true, service)
  }
  const totals = async () => { await queue; return (await db.query<{ count: number; calories: string }>('SELECT count(*)::integer count,coalesce(sum(total_calories),0)::text calories FROM meals WHERE user_id=$1', [owner])).rows[0] }
  return { db, owner, scope, user, service, record, receipt, view, totals }
}
function readableStorage(values: Record<string, string>) { return { get length() { return Object.keys(values).length }, key: (index: number) => Object.keys(values)[index] ?? null, getItem: (key: string) => values[key] ?? null } }
function presentation(view: View, needsReconciliation: boolean) {
  const recommendation = mayPublishRecommendation({ captureNeedsReconciliation: needsReconciliation, serverStatus: view.status }) ? view.recommendations[0]?.decision ?? null : null
  return { decision: recommendation?.kind ?? 'abstain' as const, recommendation, state: needsReconciliation || view.status !== 'ready' ? 'pending' as const : 'ready' as const, serverState: view.status, needsReconciliation }
}
/** Materializes only facts, never fixture expected labels/assertions. Both uncertain
 * transport branches are executed: before commit and after a committed lost response. */
export async function executeEngineeringLifecycleFacts(rule: EngineeringRule, athlete: string, facts: Facts): Promise<EngineeringLifecycleActual> {
  if (rule !== 'logged_nutrition') throw Error('This lifecycle adapter only materializes canonical nutrition state')
  const allowed = typeof facts.currentCalculationRevision === 'number'
    ? ['targetId', 'targetConfirmed', 'targetCalories', 'loggedCalories', 'mealRevision', 'coverageRevision', 'coverage', 'currentCalculationRevision']
    : ['targetId', 'targetConfirmed', 'targetCalories', 'canonicalCalories', 'queuedEstimatedCalories', 'photoPersistence', 'coverage', 'requestId']
  const unsupported = Object.keys(facts).filter(key => !allowed.includes(key))
  if (unsupported.length || facts.targetConfirmed !== true) throw Error(`Unsupported boundary facts: lifecycle materialization requires its declared operation facts and a confirmed target; unmapped: ${unsupported.join(', ')}`)
  const before = JSON.stringify(facts), commonLimits = ['Synthetic actual SQL and application functions; not hosted/physical-device evidence.', 'Canonical dates map to the current database day. Explicit coverage wall-clock time is preserved with a valid raw timezone.', 'Unrelated required macro amounts are explicit zero fixture fields, not inferred goals.']
  if (typeof facts.currentCalculationRevision === 'number') {
    const f = await setup(athlete, facts), original = f.view.recommendations[0]
    const targetRevision = requiredNumber(facts, 'mealRevision')
    for (let revision = f.receipt.revision; revision < targetRevision; revision++) await call(f.user, 'amend_logged_activity', { p_kind: 'meal', p_entity_id: f.receipt.entityId, p_expected_revision: revision, p_request_id: randomUUID(), p_record: { ...f.record.record, input_text: `Fixture correction revision ${revision + 1}` }, p_blocks: [], p_provenance: f.record.provenance })
    const current = await getRecommendationView(f.user, f.owner, f.scope.tzOffset, false, f.service)
    const raw = (await f.db.query<any>('SELECT capture_revision FROM meals WHERE id=$1', [f.receipt.entityId])).rows[0]
    return { ...presentation(current, false), fixtureFactsUnchanged: before === JSON.stringify(facts), predicates: { currentCanonicalRevision: raw.capture_revision, originalCalculationRevision: original.decision.sources.find(source => source.table === 'meals')?.revision, coverageValid: current.coverage?.coverageValid, originalDecisionId: original.id, currentVisibleIds: current.recommendations.map(row => row.id), totals: await f.totals(), sourceChanged: current.refreshState!.sourceRevision !== f.view.refreshState!.sourceRevision, requestedCalculationRevision: facts.currentCalculationRevision, requestedCoverageRevision: facts.coverageRevision }, limitations: commonLimits }
  }
  if (facts.photoPersistence === 'queued') {
    const f = await setup(athlete, facts)
    const queued = operation(requiredNumber(facts, 'queuedEstimatedCalories'), f.scope.now, String(facts.requestId), true)
    return { ...presentation(f.view, hasUnreconciledCapture(f.owner, readableStorage({ [`offline-queued:${facts.requestId}`]: JSON.stringify(queued) }), readableStorage({}))), fixtureFactsUnchanged: before === JSON.stringify(facts), predicates: { queuedEstimate: queued.record, totals: await f.totals(), submittedPhotoRequests: (await f.db.query('SELECT id FROM logging_requests WHERE user_id=$1 AND request_key=$2', [f.owner, `photo:${facts.requestId}`])).rows.length }, limitations: [...commonLimits, 'Queued bytes never reached the server; normalized estimate remains outside the canonical write boundary.'] }
  }
  if (facts.photoPersistence !== 'save_unconfirmed') throw Error('Unsupported lifecycle fixture facts')
  const branches: Array<ReturnType<typeof presentation> & Record<string, unknown>> = []
  for (const committedBeforeLoss of [false, true]) {
    const f = await setup(athlete, facts), key = `photo:${facts.requestId}`
    const record = operation(requiredNumber(facts, 'queuedEstimatedCalories'), f.scope.now, String(facts.requestId), true)
    const ledger = await call(f.user, 'begin_logging_request', { p_key: key, p_fingerprint: createHash('sha256').update(JSON.stringify(record)).digest('hex') }), items = await freezeCapture(f.user, ledger.id, [record])
    const interrupted = { rpc: async (name: string, args: Record<string, unknown>) => { if (committedBeforeLoss) await call(f.user, name, args); throw new Error('Synthetic transport lost; commit status unknown') } } as unknown as SupabaseClient
    let uncertain = false
    try { await commitCaptureItem(interrupted, items[0].id) } catch (error) { uncertain = error instanceof CaptureError && error.uncertain }
    if (!uncertain) throw Error('Fixture transport fault failed to preserve uncertainty')
    const pendingKey = `socius-pending:${f.owner}:/api/meals/upload`, markerPrefix = `socius-capture-certainty:${f.owner}:${pendingKey}:request:`, markerKey = `${markerPrefix}${facts.requestId}`
    const markers: Record<string, string> = { [markerKey]: JSON.stringify({ state: 'uncertain', requestId: facts.requestId }) }, pending = { [pendingKey]: JSON.stringify({ requestId: facts.requestId }) }
    // A confirmed receipt from another tab/request on the same surface cannot
    // prove this original frozen request was saved.
    const otherRequestId = `${facts.requestId}:other`
    markers[`${markerPrefix}${otherRequestId}`] = JSON.stringify({ state: 'confirmed', requestId: otherRequestId })
    const otherRequestConfirmationStillPending = hasUnreconciledCapture(f.owner, readableStorage(pending), readableStorage(markers))
    const server = await getRecommendationView(f.user, f.owner, f.scope.tzOffset, false, f.service), visible = presentation(server, hasUnreconciledCapture(f.owner, readableStorage(pending), readableStorage(markers))), beforeRead = await f.totals()
    // Read the original ledger before any retry write; pending never authorizes an edited create.
    const reconciled = await readCaptureRequest(f.user, f.owner, key), afterRead = await f.totals()
    if (!reconciled || reconciled.request.id !== ledger.id) throw Error('Original request reconciliation unavailable')
    const recovery = await commitCaptureBundle(f.user, ledger.id, reconciled.items), replay = await commitCaptureBundle(f.user, ledger.id, (await readCaptureRequest(f.user, f.owner, key))!.items)
    markers[markerKey] = JSON.stringify({ state: recovery.state === 'saved' ? 'confirmed' : 'uncertain', requestId: facts.requestId })
    const afterRecovery = await f.totals(), fresh = await getRecommendationView(f.user, f.owner, f.scope.tzOffset, true, f.service)
    branches.push({ ...visible, committedBeforeLoss, beforeRead, afterRead, afterRecovery, otherRequestConfirmationStillPending, requestId: ledger.id, recoveredRequestId: recovery.requestId, originalChildId: items[0].id, recoveredOperationId: recovery.receipts[0]?.operationId, exactReceiptReplay: JSON.stringify(replay.receipts) === JSON.stringify(recovery.receipts), transportRemainsUncertain: uncertain, retryAllowedBeforeRecovery: reconciled.retryAllowed, recoveredState: recovery.state, afterRecoveryDecision: presentation(fresh, hasUnreconciledCapture(f.owner, readableStorage(pending), readableStorage(markers))), photoRequestCount: (await f.db.query<any>('SELECT count(*)::integer count FROM logging_requests WHERE user_id=$1 AND request_key=$2', [f.owner, key])).rows[0].count })
  }
  if (branches.some(branch => branch.decision !== branches[0].decision)) throw Error('Uncertain commit branches disagree about visible guidance')
  return { ...branches[0], fixtureFactsUnchanged: before === JSON.stringify(facts), predicates: { branches }, limitations: [...commonLimits, 'The pre-commit server may truthfully retain old canonical totals. The actual client publication gate withholds local guidance until original-request reconciliation.'] }
}
