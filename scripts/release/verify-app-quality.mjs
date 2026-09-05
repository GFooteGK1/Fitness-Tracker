/**
 * Authenticated deployed-API canary. RUN ONLY with release authorization.
 * Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_BASE_URL.
 * Optional: VERCEL_AUTOMATION_BYPASS_SECRET, CANARY_PHOTO_PATH,
 * CANARY_AGENT_LOG=1 (real agent inference and its background analysis).
 * Creates only this run's synthetic users; finally deletes their exact IDs/data.
 * Never prints credentials, session cookies, request content, or raw API errors.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

class CanaryFailure extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status }
}
const emit = (status, fields = {}) => console.log(JSON.stringify({ status, ...fields }))
const check = (condition, code, status) => { if (!condition) throw new CanaryFailure(code, status) }
const required = name => { const value = process.env[name]; check(Boolean(value), `missing_${name}`); return value }
const resultData = (result, code) => { check(!result.error, code, result.status); return result.data }
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const createdIds = new Set()
const observedWorkoutIds = new Set()
const tables = [
  'block_scores', 'benchmark_prs', 'chat_messages', 'insights',
  'coach_strength_assessments', 'coach_memories', 'workouts', 'meals',
  'logging_requests', 'daily_targets', 'user_profiles'
]
let admin
let anonKey
let supabaseUrl
let appBase
let phase = 'configuration'

// Mirrors installed auth-helpers-shared stringifySupabaseSession/createChunks.
// Chunk raw JSON first, then URL-encode each cookie value, as the cookie adapter does.
function sessionCookie(session) {
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  const raw = JSON.stringify([
    session.access_token, session.refresh_token,
    session.provider_token, session.provider_refresh_token, session.user?.factors ?? null
  ])
  const chunks = raw.match(/.{1,3180}/g) ?? []
  return chunks.map((chunk, index) => `${key}${chunks.length === 1 ? '' : `.${index}`}=${encodeURIComponent(chunk)}`).join('; ')
}

async function actor(tag, suffix) {
  const password = randomBytes(32).toString('base64url')
  const email = `app-quality-${tag}-${suffix}@example.invalid`
  const result = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { release_canary: 'app-quality', canary_run: tag }
  })
  const user = resultData(result, `create_${suffix}`)?.user
  check(user?.id, `create_${suffix}_missing_id`)
  // Record immediately so every later failure still cleans up this exact user.
  createdIds.add(user.id)
  emit('synthetic_user_created', { userId: user.id })
  const client = createClient(supabaseUrl, anonKey, { auth: authOptions })
  const signedIn = resultData(await client.auth.signInWithPassword({ email, password }), `signin_${suffix}`)
  check(signedIn?.session && signedIn.user?.id === user.id, `signin_${suffix}_identity`)
  return { id: user.id, client, cookie: sessionCookie(signedIn.session) }
}

async function api(who, path, body, method = 'POST') {
  const headers = { Cookie: who.cookie, Accept: 'application/json' }
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const multipart = body instanceof FormData
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  const response = await fetch(new URL(path, appBase), {
    method, headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(180_000)
  })
  let data
  try { data = await response.json() } catch { throw new CanaryFailure('api_non_json', response.status) }
  return { status: response.status, data }
}

async function count(client, table, userId) {
  const result = await client.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
  resultData(result, `count_${table}`)
  check(Number.isInteger(result.count), `count_${table}_missing`)
  return result.count
}
async function counts(who) {
  const result = {}
  for (const table of ['meals', 'workouts', 'block_scores', 'logging_requests']) result[table] = await count(admin, table, who.id)
  return result
}
async function receipt(who, key) {
  const row = resultData(await admin.from('logging_requests').select('id,status,response,entities').eq('user_id', who.id).eq('request_key', key).single(), 'receipt_read')
  check(row?.status === 'complete', 'receipt_not_complete')
  return row
}
async function verifyWorkout(who, id, date) {
  const row = resultData(await admin.from('workouts').select('id,user_id,workout_date,blocks').eq('id', id).eq('user_id', who.id).single(), 'workout_read')
  check(row?.workout_date === date && Array.isArray(row.blocks) && row.blocks.length > 0, 'workout_date_or_blocks')
  observedWorkoutIds.add(id)
  const blocks = resultData(await admin.from('block_scores').select('id,user_id,workout_id').eq('workout_id', id), 'block_read')
  check(blocks.length === row.blocks.length && blocks.every(block => block.user_id === who.id), 'block_count_or_owner')
  return blocks.length
}

async function mealText(a, b, submittedAt) {
  phase = 'meal_text'
  const body = { requestId: randomUUID(), submittedAt, expectedUserId: a.id,
    timestamp: '2026-09-03T17:00:00.000Z', text: 'One medium banana and one cup of plain nonfat Greek yogurt.' }
  const before = await counts(a)
  const first = await api(a, '/api/meals/parse-text', body)
  check(first.status === 200 && first.data.mealId, 'meal_first', first.status)
  const second = await api(a, '/api/meals/parse-text', body)
  check(second.status === 200 && isDeepStrictEqual(first.data, second.data), 'meal_replay', second.status)
  const row = resultData(await admin.from('meals').select('id,user_id,meal_timestamp,photo_url').eq('id', first.data.mealId).eq('user_id', a.id).single(), 'meal_read')
  check(Date.parse(row.meal_timestamp) === Date.parse(body.timestamp) && row.photo_url === null, 'meal_date_or_photo')
  const changed = await api(a, '/api/meals/parse-text', { ...body, text: 'Two bananas.' })
  check(changed.status === 409, 'meal_fingerprint_conflict', changed.status)
  const wrongAccount = await api(b, '/api/meals/parse-text', body)
  check(wrongAccount.status === 403, 'meal_account_guard', wrongAccount.status)
  const after = await counts(a)
  check(after.meals === before.meals + 1 && after.logging_requests === before.logging_requests + 1, 'meal_duplicate')
  const savedReceipt = await receipt(a, `meal-text:${body.requestId}`)
  check(savedReceipt.entities.some(entity => entity.id === row.id && entity.kind === 'meal'), 'meal_receipt_entity')
  emit('meal_text_passed', { mealId: row.id, receiptId: savedReceipt.id, counts: after })
  return savedReceipt
}
async function workoutText(a, b, submittedAt) {
  phase = 'workout_text'
  const body = { requestId: randomUUID(), submittedAt, expectedUserId: a.id, date: '2026-09-03',
    text: 'Completed 3 sets of 5 back squats at 135 lb. Session RPE 6. One strength block.' }
  const before = await counts(a)
  const first = await api(a, '/api/parse-workout', body)
  check(first.status === 200 && first.data.workoutId, 'workout_first', first.status)
  const second = await api(a, '/api/parse-workout', body)
  check(second.status === 200 && isDeepStrictEqual(first.data, second.data), 'workout_replay', second.status)
  const blockCount = await verifyWorkout(a, first.data.workoutId, body.date)
  const changed = await api(a, '/api/parse-workout', { ...body, date: '2026-09-02' })
  check(changed.status === 409, 'workout_fingerprint_conflict', changed.status)
  const wrongAccount = await api(b, '/api/parse-workout', body)
  check(wrongAccount.status === 403, 'workout_account_guard', wrongAccount.status)
  const after = await counts(a)
  check(after.workouts === before.workouts + 1 && after.block_scores === before.block_scores + blockCount && after.logging_requests === before.logging_requests + 1, 'workout_duplicate')
  await receipt(a, `workout-text:${body.requestId}`)
  emit('workout_text_passed', { workoutId: first.data.workoutId, counts: after })
}

async function photo(a, b) {
  if (!process.env.CANARY_PHOTO_PATH) { emit('photo_skipped'); return }
  phase = 'photo'
  const bytes = await readFile(process.env.CANARY_PHOTO_PATH)
  const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(process.env.CANARY_PHOTO_PATH).toLowerCase()]
  check(type && bytes.length >= 1000 && bytes.length <= 10 * 1024 * 1024, 'photo_fixture_invalid')
  const requestId = randomUUID()
  const timestamp = '2026-09-03T18:00:00.000Z'
  const form = (time = timestamp) => {
    const result = new FormData()
    result.set('photo', new Blob([bytes], { type }), `synthetic-meal${extname(process.env.CANARY_PHOTO_PATH)}`)
    result.set('timestamp', time); result.set('requestId', requestId); result.set('expectedUserId', a.id)
    return result
  }
  const before = await counts(a)
  const first = await api(a, '/api/meals/upload', form())
  check(first.status === 200 && first.data.mealId && first.data.analysisStatus === 'complete', 'photo_first', first.status)
  const second = await api(a, '/api/meals/upload', form())
  // First photo response omits receipt metadata; compare the original analysis and ID.
  check(second.status === 200 && second.data.mealId === first.data.mealId && isDeepStrictEqual(second.data.analysis, first.data.analysis), 'photo_replay', second.status)
  const changed = await api(a, '/api/meals/upload', form('2026-09-02T18:00:00.000Z'))
  check(changed.status === 409, 'photo_fingerprint_conflict', changed.status)
  const wrongAccount = await api(b, '/api/meals/upload', form())
  check(wrongAccount.status === 403, 'photo_account_guard', wrongAccount.status)
  const row = resultData(await admin.from('meals').select('meal_timestamp,photo_url').eq('id', first.data.mealId).eq('user_id', a.id).single(), 'photo_meal_read')
  check(Date.parse(row.meal_timestamp) === Date.parse(timestamp) && row.photo_url === null, 'photo_date_or_retention')
  const after = await counts(a)
  check(after.meals === before.meals + 1 && after.logging_requests === before.logging_requests + 1, 'photo_duplicate')
  emit('photo_passed', { mealId: first.data.mealId, counts: after })
}

async function agent(a, submittedAt) {
  if (process.env.CANARY_AGENT_LOG !== '1') { emit('agent_log_skipped'); return }
  phase = 'agent_log'
  const body = { requestId: randomUUID(), submittedAt, expectedUserId: a.id, input_mode: 'text', tz_offset: -300,
    content: 'Log exactly one completed workout dated 2026-09-03: 20 minutes of easy stationary cycling, RPE 3. Do not record a PR, assessment, memory, or create a program.' }
  const before = await counts(a)
  const first = await api(a, '/api/agent/process', body)
  check(first.status === 200, 'agent_first', first.status)
  const second = await api(a, '/api/agent/process', body)
  check(second.status === 200 && isDeepStrictEqual(first.data, second.data), 'agent_replay', second.status)
  const savedReceipt = await receipt(a, `agent:${body.requestId}`)
  const entities = savedReceipt.entities.filter(entity => entity.kind === 'workout')
  check(entities.length === 1, 'agent_workout_receipt')
  const blockCount = await verifyWorkout(a, entities[0].id, '2026-09-03')
  const after = await counts(a)
  check(after.workouts === before.workouts + 1 && after.block_scores === before.block_scores + blockCount, 'agent_duplicate')
  emit('agent_log_passed', { workoutId: entities[0].id, counts: after })
}

async function isolation(a, b, savedReceipt) {
  phase = 'tenant_isolation'
  for (const table of ['logging_requests', 'meals', 'workouts', 'block_scores']) {
    check(await count(b.client, table, a.id) === 0, `tenant_read_${table}`)
  }
  // A completed receipt would reject every caller. Probe an actively processing
  // A-owned receipt, then prove A can finish it while B cannot.
  const probe = resultData(await a.client.rpc('begin_logging_request', {
    p_key: `canary-isolation:${randomUUID()}`, p_fingerprint: 'a'.repeat(64)
  }), 'tenant_probe_begin')
  check(probe?.claimed && probe.status === 'processing', 'tenant_probe_not_processing')
  const before = resultData(await admin.from('logging_requests').select('*').eq('id', probe.id).single(), 'receipt_before_isolation')
  const denied = await b.client.rpc('finish_logging_request', { p_id: probe.id, p_response: { canary: true }, p_status: 200 })
  check(Boolean(denied.error), 'tenant_finish_allowed')
  const after = resultData(await admin.from('logging_requests').select('*').eq('id', probe.id).single(), 'receipt_after_isolation')
  check(isDeepStrictEqual(before, after), 'tenant_receipt_changed')
  resultData(await a.client.rpc('finish_logging_request', { p_id: probe.id, p_response: { canary: true }, p_status: 200 }), 'owner_finish_denied')
  for (const table of ['meals', 'workouts', 'logging_requests']) check(await count(admin, table, b.id) === 0, `wrong_account_created_${table}`)
  emit('tenant_isolation_passed', { userId: b.id, receiptId: savedReceipt.id, count: 0 })
}

async function cleanup() {
  if (!admin || !createdIds.size) return
  const failures = []
  // Only exact IDs returned by createUser in this process are ever used as delete filters.
  for (const id of createdIds) {
    for (const table of tables) {
      try {
        const result = await admin.from(table).delete().eq('user_id', id)
        if (result.error) failures.push(`delete_${table}`)
      } catch { failures.push(`delete_${table}_transport`) }
    }
    try {
      const removed = await admin.auth.admin.deleteUser(id)
      if (removed.error) failures.push('delete_auth_user')
    } catch { failures.push('delete_auth_user_transport') }
    for (const table of tables) {
      try { if (await count(admin, table, id) !== 0) failures.push(`remaining_${table}`) } catch { failures.push(`verify_${table}`) }
    }
    try {
      const authRead = await admin.auth.admin.getUserById(id)
      if (!authRead.error || authRead.data?.user || !['user_not_found', '404'].includes(String(authRead.error.code ?? authRead.error.status))) failures.push('verify_auth_absent')
    } catch { failures.push('verify_auth_absent_transport') }
    emit('synthetic_user_cleanup_checked', { userId: id, count: failures.length })
  }
  for (const workoutId of observedWorkoutIds) {
    try {
      const result = await admin.from('block_scores').select('id', { count: 'exact', head: true }).eq('workout_id', workoutId)
      if (result.error || result.count !== 0) failures.push('orphan_blocks')
    } catch { failures.push('verify_orphan_blocks_transport') }
  }
  check(failures.length === 0, 'cleanup_incomplete')
  emit('cleanup_passed', { userCount: createdIds.size, remainingCount: 0 })
}

async function main() {
  supabaseUrl = required('SUPABASE_URL')
  anonKey = required('SUPABASE_ANON_KEY')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  appBase = new URL(required('APP_BASE_URL'))
  check(!appBase.username && !appBase.password && (appBase.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(appBase.hostname)), 'invalid_app_origin')
  admin = createClient(supabaseUrl, serviceKey, { auth: authOptions })
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`
  let passed = false
  try {
    phase = 'create_users'
    const a = await actor(tag, 'a')
    const b = await actor(tag, 'b')
    phase = 'empty_coach'
    for (const who of [a, b]) {
      const response = await api(who, '/api/coach', undefined, 'GET')
      check(response.status === 200 && response.data.context?.storageAvailable === true && response.data.context.activeProgram === null, 'empty_coach_state', response.status)
    }
    emit('empty_accepted_plan_passed', { count: 2 })
    const submittedAt = new Date().toISOString()
    const savedReceipt = await mealText(a, b, submittedAt)
    await workoutText(a, b, submittedAt)
    await photo(a, b)
    await agent(a, submittedAt)
    await isolation(a, b, savedReceipt)
    passed = true
  } finally {
    phase = passed ? 'cleanup' : phase
    await cleanup()
  }
  emit('canary_passed')
}

main().catch(error => {
  // Do not expose arbitrary SDK/fetch errors: they can contain URLs or headers.
  emit('canary_failed', { phase, code: error instanceof CanaryFailure ? error.code : 'unexpected_error', ...(error instanceof CanaryFailure && Number.isInteger(error.status) ? { httpStatus: error.status } : {}) })
  process.exitCode = 1
})
