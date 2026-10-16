/** Opt-in, fixed loopback transport qualification. No hosted targets or global policy. */
import { createServer, type IncomingMessage } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupervisedReviewService } from '@/app/lib/coach/supervised-review-service'
import { createSupervisedReviewHttp } from '@/app/lib/coach/supervised-review-http'
import { createSupervisedDraftReader } from '@/app/lib/coach/supervised-draft-server'
import { createSupervisedCandidatePreview } from '@/app/lib/coach/supervised-candidate-preview'
import { createSupervisedWeekIssuer } from '@/app/lib/coach/supervised-proposal-issuer'
import { createReviewedHttpHandlers } from '@/app/lib/coach/reviewed-http-server'
import { createReviewedWeekProposalIssuer } from '@/app/lib/coach/reviewed-proposal-issuer-server'
import { resolveSupervisedResource } from '@/app/lib/coach/supervised-resource-access'
import { personalizedCoachingCapabilities } from '@/app/lib/personalized-coaching-capabilities'
import { isolatedBrowserRequest, type BrowserResource } from './supervised-browser-scope'
import { localFinalization, LocalRequestDrain, type LocalFinalization } from './supervised-browser-finalization'

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
async function main() {
  const runId = process.argv[2], sourceRun = 'f0d5bb72-36aa-49d6-8d7c-5a8214e6176d'
  if (process.env.SOCIUS_LOCAL_SUPERVISED_BROWSER !== 'true' || process.argv.length !== 3 || !uuid(runId)) throw Error('Explicit local opt-in and fresh UUID required')
  if (personalizedCoachingCapabilities().initialDosePolicy !== false) throw Error('Global numerical policy must remain disabled')
  const buildDirectory = 'output/playwright/supervised-browser-build'
  const manifest = JSON.parse(readFileSync(`${buildDirectory}/manifest.json`, 'utf8'))
  for (const [path, hash] of Object.entries(manifest.source)) if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw Error('Source changed since qualification build')
  for (const [name, hash] of Object.entries(manifest.output)) if (!['bundle.js', 'server.cjs', 'style.css'].includes(name)
    || createHash('sha256').update(readFileSync(`${buildDirectory}/${name}`)).digest('hex') !== hash) throw Error('Qualification build mismatch')
  const origin = 'http://127.0.0.1:3013', target = 'supabase_db_sociusfit-programming-local'
  const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8')), dbUrl = new URL(status.DB_URL)
  if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw Error('Nonlocal target denied')
  if (existsSync('output/app-quality-release/local-supabase/supabase/.temp/project-ref')
    || !/^project_id = "sociusfit-programming-local"\s*$/m.test(readFileSync('output/app-quality-release/local-supabase/supabase/config.toml', 'utf8'))) throw Error('Unexpected linked target')
  const podman = 'output/app-quality-release/tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe'
  const inspect = spawnSync(podman, ['--connection', 'sociusfit-local', 'inspect', target], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  if (inspect.status !== 0) throw Error('Local container readback failed')
  const container = JSON.parse(inspect.stdout)[0]
  if (container.Config.Labels['com.supabase.cli.project'] !== 'sociusfit-programming-local' || container.State.Running !== true) throw Error('Local container mismatch')
  const source = JSON.parse(readFileSync(`output/app-quality-release/supervised-auth-${sourceRun}/receipt.json`, 'utf8'))
  if (source.runId !== sourceRun || source.status !== 'passed' || source.target !== status.API_URL || source.cycles?.length !== 2
    || !uuid(source.programId) || source.users?.map((u: any) => u.actor).sort().join(',') !== 'athlete,foreign,reviewer') throw Error('Verified synthetic source required')
  const directory = `output/playwright/supervised-browser-${runId}`
  mkdirSync(directory) // Existing/uncertain runs cannot be reseeded or resumed.
  const journal: Array<Record<string, unknown>> = [], checks: string[] = []
  const programId = randomUUID(), baseId = randomUUID(), enrollmentId = randomUUID()
  const sourceOwnerId = source.users.find((user: any) => user.actor === 'athlete')!.id
  const freshAthlete = { actor: 'athlete', id: randomUUID(), email: `supervised-browser-${runId}-athlete@sociusfit-local.invalid` }
  const users = source.users.map((user: any) => user.actor === 'athlete' ? freshAthlete : user)
  const receipt: Record<string, any> = { runId, sourceRun, origin, target: status.API_URL, status: 'preparing', programId, baseId, enrollmentId,
    globalNumericalPolicy: false, users, build: manifest, checks, journal, qualification: 'Actual components/handlers, real Auth/PostgREST. Fresh synthetic athlete avoids cross-run history ambiguity. Test login shell; not full Next Auth or athlete suitability proof.' }
  const save = () => writeFileSync(`${directory}/server-receipt.json`, JSON.stringify(receipt, null, 2))
  const check = (ok: unknown, label: string) => { if (!ok) throw Error(label); checks.push(label); save() }
  const attempt = async <T>(name: string, payload: unknown, operation: () => PromiseLike<T>) => {
    const e: Record<string, unknown> = { name, payload, attemptedAt: new Date().toISOString(), disposition: 'pending' }
    journal.push(e); save()
    try { const result = await operation(); e.disposition = 'response_received'; e.result = result; save(); return result }
    catch { e.disposition = 'inspect_required'; save(); throw Error('Inspect retained local request before continuing') }
  }
  const localFetch: typeof fetch = (input, init) => {
    const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (u.origin !== status.API_URL) throw Error('Nonlocal database request denied')
    return fetch(input, { ...init, redirect: 'error' })
  }
  const client = (service = false) => createClient(status.API_URL, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
  const admin = client(true), actors = new Map<string, { id: string; email: string }>()
  // Full read-only SQL digests avoid PostgREST row caps and deliberately denied
  // service-role SELECT on set reports. No ACL change or raw record export.
  const tables = ['training_programs', 'training_plan_versions', 'prescribed_sessions', 'workouts', 'coach_reviewed_set_reports'] as const
  const prior = new Map<string, Map<string, string>>()
  const readDigests = () => {
    const query = `SELECT jsonb_object_agg(table_name, rows) FROM (${tables.map(table =>
      `SELECT '${table}' AS table_name, coalesce(jsonb_object_agg(id::text,md5(to_jsonb(x)::text)),'{}'::jsonb) AS rows FROM public.${table} x`).join(' UNION ALL ')}) snapshots;`
    const r = spawnSync(podman, ['--connection', 'sociusfit-local', 'exec', target, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query],
      { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 })
    if (r.status !== 0) throw Error('Fixed local read-only SQL digest query failed')
    const result = JSON.parse(r.stdout)
    if (Object.keys(result).sort().join(',') !== [...tables].sort().join(',')) throw Error('Digest tables mismatch')
    for (const table of tables) if (!result[table] || typeof result[table] !== 'object' || Array.isArray(result[table])
      || !Object.entries(result[table]).every(([id, hash]) => uuid(id) && typeof hash === 'string' && /^[a-f0-9]{32}$/.test(hash))) throw Error('Invalid prior-row digests')
    return result as Record<string, Record<string, string>>
  }
  const snapshot = async () => {
    const values = readDigests()
    const bytes = JSON.stringify({ runId, programId, target: status.API_URL, tables: values })
    writeFileSync(`${directory}/prior-row-digests.json`, bytes, { flag: 'wx' })
    receipt.priorSnapshotSha256 = createHash('sha256').update(bytes).digest('hex'); save()
    for (const table of tables) prior.set(table, new Map(Object.entries(values[table])))
  }
  const verifyPrior = async () => {
    const records = []
    const values = readDigests()
    for (const [table, priorRows] of prior) {
      const current = new Map(Object.entries(values[table]))
      records.push({ table, priorCount: priorRows.size, preserved: [...priorRows].every(([id, hash]) => current.get(id) === hash) })
    }
    receipt.preservation = records; save()
    return records.every(r => r.preserved)
  }
  const signIn = async (actor: string) => {
    const identity = actors.get(actor)
    if (!identity) throw Error('Unknown fixed actor')
    let tokenHash = ''
    const issued = await attempt('issue_existing_local_login', { actor, userId: identity.id }, async () => {
      const r = await admin.auth.admin.generateLink({ type: 'magiclink', email: identity.email })
      tokenHash = r.data.properties?.hashed_token ?? ''
      return { userId: r.data.user?.id, error: r.error?.code ?? null }
    })
    if (issued.error || issued.userId !== identity.id || !tokenHash) throw Error('Fixed local login not issued')
    const db = client()
    const verified = await attempt('verify_existing_local_login', { actor, userId: identity.id }, async () => {
      const r = await db.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
      return { userId: r.data.user?.id, error: r.error?.code ?? null }
    })
    if (verified.error || verified.userId !== identity.id) throw Error('Fixed local login not verified')
    return db // No raw Auth token/link/password enters receipt or browser.
  }
  const write = async (name: string, payload: unknown, operation: () => PromiseLike<{ error: { code?: string } | null }>) => {
    const result = await attempt(name, payload, async () => { const r = await operation(); return { error: r.error?.code ?? null } })
    check(!result.error, `${name} confirmed`)
  }
  save()
  try {
    // A later build must not replace the code/assets behind retained evidence.
    mkdirSync(`${directory}/build`)
    for (const name of ['bundle.js', 'server.cjs', 'style.css']) {
      const bytes = readFileSync(`${buildDirectory}/${name}`)
      if (createHash('sha256').update(bytes).digest('hex') !== manifest.output[name]) throw Error('Build changed before retained snapshot')
      writeFileSync(`${directory}/build/${name}`, bytes, { flag: 'wx' })
    }
    writeFileSync(`${directory}/build/manifest.json`, JSON.stringify(manifest), { flag: 'wx' })
    receipt.retainedBuild = `${directory}/build`; save()
    for (const user of source.users) {
      if (!uuid(user.id) || typeof user.email !== 'string' || !user.email.endsWith('@sociusfit-local.invalid')) throw Error('Invalid fixed synthetic actor')
      const r = await admin.auth.admin.getUserById(user.id)
      check(!r.error && r.data.user?.id === user.id && r.data.user.email === user.email, `${user.actor} source identity confirmed`)
      actors.set(user.actor, { id: user.id, email: user.email })
    }
    await snapshot()
    const sourceProgram = await admin.from('training_programs').select('active_plan_version_id').eq('id', source.programId).eq('user_id', sourceOwnerId).single()
    check(!sourceProgram.error, 'Verified source ownership')
    const base = await admin.from('training_plan_versions').select('window_start,window_end,sequence_number,intent').eq('id', sourceProgram.data!.active_plan_version_id).eq('user_id', sourceOwnerId).eq('program_id', source.programId).eq('status', 'accepted').single()
    check(!base.error && base.data?.intent?.format === 'reviewed_weekly_intent_v0_1', 'Exact accepted mechanical source')
    receipt.sourceBaseId = sourceProgram.data!.active_plan_version_id; save()
    const profile = await admin.from('user_profiles').select('fitness_goals,body_metrics,preferences').eq('user_id', sourceOwnerId).single()
    check(!profile.error && profile.data, 'Verified synthetic source profile')
    const created = await attempt('create_isolated_local_athlete', freshAthlete, async () => {
      const r = await admin.auth.admin.createUser({ id: freshAthlete.id, email: freshAthlete.email, password: randomUUID() + randomUUID(), email_confirm: true })
      return { userId: r.data.user?.id, error: r.error?.code ?? null }
    })
    check(!created.error && created.userId === freshAthlete.id, 'Fresh synthetic athlete confirmed')
    actors.set('athlete', { id: freshAthlete.id, email: freshAthlete.email })
    const owner = await signIn('athlete'), ownerId = freshAthlete.id, reviewerId = actors.get('reviewer')!.id
    const profileSeed = { user_id: ownerId, ...profile.data! }
    await write('isolated_profile_seed', profileSeed, () => owner.from('user_profiles').insert(profileSeed))
    await write('isolated_context_revision', { userId: ownerId }, () => owner.rpc('get_coach_context_revision', {}))
    const program = { id: programId, user_id: ownerId, title: 'Isolated supervised browser qualification', goal_summary: 'Mechanical fixture only; athlete suitability unconfirmed', start_date: base.data!.window_start, end_date: base.data!.window_end, status: 'draft', program_mode: 'rolling_weekly' }
    await write('isolated_program_seed', program, () => admin.from('training_programs').insert(program))
    const plan = { id: baseId, program_id: programId, user_id: ownerId, version: 1, status: 'accepted', accepted_at: new Date().toISOString(), reference_version: 'local-supervised-browser', policy_version: 'initial-dose-0.2.0', plan_mode: 'rolling_weekly', window_start: base.data!.window_start, window_end: base.data!.window_end, sequence_number: base.data!.sequence_number, intent: base.data!.intent, input_snapshot: {} }
    await write('isolated_base_seed', plan, () => admin.from('training_plan_versions').insert(plan))
    await write('isolated_base_activate', { programId, baseId }, () => admin.from('training_programs').update({ status: 'active', active_plan_version_id: baseId }).eq('id', programId).eq('user_id', ownerId))
    const slots = base.data!.intent.reviewed_week.scheduledSessions.map((s: any, index: number) => ({ id: randomUUID(), user_id: ownerId, program_id: programId, plan_version_id: baseId, week_number: 1, session_index: index + 1, scheduled_date: s.scheduledDate, prescription: s.prescription }))
    await write('isolated_session_seed', slots, () => admin.from('prescribed_sessions').insert(slots))
    const enrollment = { p_id: enrollmentId, p_program_id: programId, p_user_id: ownerId, p_reviewer_id: reviewerId, p_expected_version: 0, p_enabled: true, p_expires_at: new Date(Date.now() + 6 * 3600000).toISOString(), p_operations: ['same_week', 'next_week'], p_operator_ref: `local-browser:${runId}` }
    await write('isolated_enrollment', enrollment, () => admin.rpc('version_supervised_enrollment', enrollment))
    const anchor = { p_program_id: programId, p_plan_version_id: baseId, p_operator_ref: `local-browser:${runId}` }
    await write('isolated_base_anchor', anchor, () => admin.rpc('provision_supervised_initial_base', anchor))
    check(await verifyPrior(), 'All preexisting core rows unchanged by fixture setup')
    const options = { enabled: () => true, createServiceClient: () => admin }, review = createSupervisedReviewService(options)
    const sessions = new Map<string, { actor: string; userId: string; db: SupabaseClient }>()
    const json = (body: unknown, code = 200, headers: Record<string, string> = {}) => Response.json(body, { status: code, headers: { 'Cache-Control': 'private, no-store', ...headers } })
    const body = async (req: IncomingMessage) => {
      const chunks: Buffer[] = []; let length = 0
      for await (const chunk of req) { length += chunk.length; if (length > 600000) throw Error('Body too large'); chunks.push(Buffer.from(chunk)) }
      return Buffer.concat(chunks).toString('utf8')
    }
    let stopping = false
    const requests = new LocalRequestDrain()
    const server = createServer(async (req, res) => {
      const release = requests.admit()
      if (!release) { res.writeHead(503); res.end('Qualification finalizing; do not resend'); return }
      try {
      let response: Response
      const method = req.method ?? 'GET', url = new URL(req.url ?? '/', origin)
      try {
        if (stopping) response = json({ error: 'Qualification finalizing; do not resend' }, 503)
        else if (req.headers.host !== '127.0.0.1:3013' || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
          || !['GET', 'POST'].includes(method) || (method === 'POST' && req.headers.origin !== origin)) response = json({ error: 'Exact loopback origin required' }, 403)
        else {
          const sid = /(?:^|;\s*)supervised_test=([a-f0-9-]+)/.exec(req.headers.cookie ?? '')?.[1], session = sid ? sessions.get(sid) : undefined
          const raw = method === 'POST' ? await body(req) : ''
          if (url.pathname === '/__test/login' && method === 'POST') {
            const value = JSON.parse(raw), actor = value.actor
            if (Object.keys(value).join(',') !== 'actor' || !actors.has(actor)) response = json({ error: 'Unknown fixed actor' }, 400)
            else {
              const db = await signIn(actor), token = randomUUID()
              if (sid) sessions.delete(sid)
              sessions.set(token, { actor, userId: actors.get(actor)!.id, db })
              response = json({ signedIn: true }, 200, { 'Set-Cookie': `supervised_test=${token}; HttpOnly; SameSite=Strict; Path=/` })
            }
          } else if (url.pathname === '/__test/logout' && method === 'POST') {
            if (sid) sessions.delete(sid)
            response = json({ signedOut: true }, 200, { 'Set-Cookie': 'supervised_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' })
          } else if (url.pathname === '/__test/state' && method === 'GET') {
            if (!session) response = json({ userId: null })
            else {
              const r = await session.db.from('training_programs').select('active_plan_version_id').eq('id', programId).eq('user_id', session.userId).maybeSingle()
              if (r.error) throw Error('Owned program readback failed')
              let plan: unknown = null, rows: any[] = []
              if (r.data) {
                const p = await session.db.from('training_plan_versions').select('intent').eq('id', r.data.active_plan_version_id).eq('user_id', session.userId).single()
                const s = await session.db.from('coach_effective_prescribed_sessions').select('id,prescription').eq('plan_version_id', r.data.active_plan_version_id).order('session_index')
                if (p.error || s.error) throw Error('Owned accepted plan unavailable')
                plan = p.data.intent.reviewed_week; rows = s.data
              }
              response = json({ actor: session.actor, userId: session.userId, programId, activePlanVersionId: r.data?.active_plan_version_id ?? null,
                plan, sessionLinks: Object.fromEntries(rows.map(row => [row.prescription.sessionId, row.id])) })
            }
          } else if (url.pathname.startsWith('/api/coach/')) {
            const db = session?.db ?? client(), request = new Request(url, { method, ...(method === 'POST' ? { body: raw, headers: { 'Content-Type': 'application/json' } } : {}) })
            const supervised = createSupervisedReviewHttp({ ...options, review, createUserClient: async () => db,
              draft: createSupervisedDraftReader(options), preview: createSupervisedCandidatePreview(options), issue: createSupervisedWeekIssuer({ ...options, review }) })
            const reviewed = createReviewedHttpHandlers({ createUserClient: async () => db, enabled: () => false, registry: [],
              issue: createReviewedWeekProposalIssuer({ ...options, enabled: () => false, registry: [] }), supervised: { enabled: options.enabled, resolve: resolveSupervisedResource } })
            const dispatch = async () => {
              const lookup = async (kind: BrowserResource, id: string): Promise<string | null> => {
                if (kind === 'decision') {
                  const d = await db.rpc('get_supervised_decision_receipt', { p_request_id: id })
                  if (d.error) throw Error('Fixture decision mapping unavailable')
                  if (d.data) return lookup('candidate', d.data.candidateId)
                  const intended = journal.find(e => {
                    const p = e.payload as any
                    return p?.path === '/api/coach/supervised/decisions' && p.actor === session?.actor
                      && p.body?.expectedUserId === session?.userId && p.body?.requestId === id
                  })?.payload as any
                  return intended ? lookup('candidate', intended.body.candidateId) : null
                }
                if (kind === 'candidate') {
                  const c = await db.rpc('get_supervised_candidate', { p_id: id })
                  if (c.error) throw Error('Fixture candidate mapping unavailable')
                  if (c.data) return c.data.programId
                  const intended = journal.find(e => {
                    const p = e.payload as any, draft = p?.body?.draft
                    return p?.path === '/api/coach/supervised/candidates' && draft?.candidateId === id
                      && draft.programId === programId && draft.enrollmentId === enrollmentId
                  })?.payload as any
                  return intended ? programId : null
                }
                const table = { proposal: 'adaptation_proposals', session: 'prescribed_sessions', plan: 'training_plan_versions' }[kind]
                const r = await admin.from(table).select('program_id').eq('id', id).maybeSingle()
                if (r.error) throw Error('Fixture resource mapping unavailable')
                return r.data?.program_id ?? null
              }
              if (!await isolatedBrowserRequest(method, url, raw ? JSON.parse(raw) : null, { programId, enrollmentId }, lookup)) return json({ error: 'Outside isolated qualification fixture' }, 404)
              const p = url.pathname, s = p.match(/^\/api\/coach\/supervised\/(programs|candidates|decisions)\/([a-f0-9-]+)(?:\/(draft))?$/)
              if (p === '/api/coach/supervised/programs' && method === 'GET') {
                // Read the actual scoped handler, then expose only this fixture's
                // summary. Never discover the reused actors' other programs.
                const r = await supervised.readProgram(new Request(`${origin}/api/coach/supervised/programs/${programId}`), programId), value = await r.json()
                if (value.kind === 'unauthenticated') return json(value, r.status)
                if (!['workspace', 'not_found'].includes(value.kind)) return json(value, r.status)
                return json({ kind: 'programs', writesEnabled: true, page: { schemaVersion: 1, actorId: session!.userId,
                  programs: value.kind === 'workspace' ? [value.page.program] : [], nextAfterProgramId: null } })
              }
              if (s && method === 'GET' && !s[3]) return s[1] === 'programs' ? supervised.readProgram(request, s[2]) : s[1] === 'candidates' ? supervised.readCandidate(s[2]) : supervised.readDecision(s[2])
              if (s?.[1] === 'programs' && s[3] === 'draft' && method === 'POST') return supervised.draft(request, s[2])
              const actions: Record<string, (r: Request) => Promise<Response>> = {
                '/api/coach/supervised/candidates': supervised.submit, '/api/coach/supervised/candidates/preview': supervised.preview,
                '/api/coach/supervised/decisions': supervised.decide, '/api/coach/supervised/issue': supervised.issue,
                '/api/coach/supervised/recover': supervised.recover, '/api/coach/supervised/resolve': supervised.resolve, '/api/coach/supervised/resolution': supervised.resolution }
              if (method === 'POST' && actions[p]) return actions[p](request)
              const r = p.match(/^\/api\/coach\/reviewed\/(sessions|proposals|programs)\/([a-f0-9-]+)(?:\/(sets|complete|resolve|accept))?$/)
              if (p === '/api/coach/reviewed/proposals') return method === 'GET' ? reviewed.listProposals(request) : reviewed.propose(request)
              if (!r) return json({ error: 'Not found' }, 404)
              const [, group, id, action] = r
              if (method === 'GET' && !action) return group === 'sessions' ? reviewed.readSession(request, id) : group === 'proposals' ? reviewed.readProposal(request, id) : json({ error: 'Not found' }, 404)
              if (method !== 'POST') return json({ error: 'Method unavailable' }, 405)
              return group === 'sessions' && action === 'sets' ? reviewed.recordSet(request, id)
                : group === 'sessions' && action === 'complete' ? reviewed.complete(request, id)
                  : group === 'sessions' && action === 'resolve' ? reviewed.resolve(request, id)
                    : group === 'proposals' && action === 'accept' ? reviewed.accept(request, id)
                      : group === 'programs' && action === 'resolve' ? reviewed.resolveProposal(request, id) : json({ error: 'Not found' }, 404)
            }
            response = await attempt('browser_http', { method, path: url.pathname + url.search, actor: session?.actor ?? null, body: raw ? JSON.parse(raw) : null }, async () => {
              const r = await dispatch(), result = await r.clone().json()
              return { status: r.status, result }
            }).then(r => json(r.result, r.status))
          } else if (method === 'GET' && ['/bundle.js', '/style.css'].includes(url.pathname)) response = new Response(readFileSync(`${directory}/build${url.pathname}`), { headers: { 'Content-Type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css', 'Cache-Control': 'no-store' } })
          else if (method === 'GET' && (url.pathname === '/' || url.pathname === '/program' || url.pathname === '/program/supervised' || /^\/program\/reviewed\/(?:plans\/)?[a-f0-9-]+$/.test(url.pathname))) response = new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local supervised qualification</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } })
          else response = json({ error: 'Not found' }, 404)
        }
      } catch { response = json({ error: 'Local request unconfirmed. Inspect retained journal; do not resend automatically.' }, 500) }
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
      } finally { release() }
    })
    server.listen(3013, '127.0.0.1', () => { receipt.status = 'listening'; save(); console.log(JSON.stringify({ origin, runId, programId, receipt: `${directory}/server-receipt.json` })) })
    server.on('error', () => { receipt.status = 'listen_failed'; save(); process.exitCode = 1 })
    const stop = (request?: LocalFinalization) => {
      if (stopping) return
      stopping = true; clearInterval(finalizationTimer)
      const handlersDrained = requests.begin()
      receipt.status = 'finalizing'; receipt.finalizationRequest = request ?? { operation: 'signal' }; save()
      server.close(() => { void handlersDrained.then(async () => {
        if (!journal.every(entry => entry.disposition === 'response_received')) throw Error('Request journal requires inspection')
        return verifyPrior()
      }).then(ok => {
        receipt.priorRowsPreserved = ok; receipt.status = ok ? 'stopped' : 'preservation_failed'
        receipt.finishedAt = new Date().toISOString(); save(); process.exit(ok ? 0 : 1)
      }).catch(() => { receipt.status = 'readback_required'; save(); process.exit(1) }) })
    }
    const finalizationTimer = setInterval(() => {
      const path = `${directory}/finalize.json`
      if (!existsSync(path)) return
      try {
        const request = localFinalization(JSON.parse(readFileSync(path, 'utf8')), runId, programId)
        if (request) stop(request)
      } catch { /* Partial/invalid marker cannot terminate or claim verification. */ }
    }, 500)
    process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop())
  } catch (error) { receipt.status = 'inspect_required'; receipt.failure = error instanceof Error ? error.message : 'Local preparation failure'; save(); throw Error('Local preparation incomplete. Preserve the run and inspect before a new attempt.') }
}
void main().catch(() => { console.error('Supervised browser harness stopped. Inspect retained receipt; no automatic retry.'); process.exitCode = 1 })
