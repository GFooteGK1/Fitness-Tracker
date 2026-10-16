/** Opt-in loopback-only HTTP composition. Never imports deployed service wiring. */
import { createServer, type IncomingMessage } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createReviewedHttpHandlers } from '@/app/lib/coach/reviewed-http-server'
import { createReviewedWeekProposalIssuer } from '@/app/lib/coach/reviewed-proposal-issuer-server'
import type { TrustedReviewedWeekRegistration } from '@/app/lib/coach/reviewed-week-context-server'
import { fixedBrowserReview, seedBrowserProgram } from './reviewed-browser-fixture'

async function main() {
  if (process.env.SOCIUS_LOCAL_REVIEWED_BROWSER !== 'true') throw new Error('Local browser opt-in required')
  const status = JSON.parse(readFileSync('output/app-quality-release/local-supabase-status.private.json', 'utf8'))
  const dbUrl = new URL(status.DB_URL), origin = 'http://127.0.0.1:3012'
  if (status.API_URL !== 'http://127.0.0.1:55321' || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Refusing non-local target')
  const localFetch: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (new URL(url).origin !== status.API_URL) throw new Error('Refusing non-local database request')
    return fetch(input, { ...init, redirect: 'error' })
  }
  const client = (service = false) => createClient(status.API_URL, service ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } })
  const resumeId = process.argv[2]
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
  if (process.argv.length > 3 || (resumeId && !validId(resumeId))) throw new Error('Expected exact local run UUID')
  const admin = client(true), runId = resumeId ?? randomUUID(), directory = `output/playwright/reviewed-browser-${runId}`
  mkdirSync(directory, { recursive: true })
  const receipt: any = resumeId ? JSON.parse(readFileSync(`${directory}/server-receipt.json`, 'utf8'))
    : { runId, origin, databaseOrigin: status.API_URL, startedAt: new Date().toISOString(), status: 'starting', users: [], requests: [] }
  if (resumeId && (receipt.runId !== runId || receipt.origin !== origin || receipt.databaseOrigin !== status.API_URL
    || !validId(receipt.programId) || !validId(receipt.baseId) || !Array.isArray(receipt.requests)
    || !Array.isArray(receipt.users) || receipt.users.length !== 2
    || receipt.users.some((user: any) => !validId(user.id))
    || new Set(receipt.users.map((user: any) => user.id)).size !== 2
    || receipt.users.map((user: any) => user.actor).sort().join(',') !== 'athlete,foreign')) throw new Error('Invalid retained synthetic receipt')
  const save = () => writeFileSync(`${directory}/server-receipt.json`, JSON.stringify(receipt, null, 2))
  const actors = new Map<string, { id: string; email: string; password?: string }>()
  for (const actor of ['athlete', 'foreign']) {
    const email = `browser-${runId}-${actor}@sociusfit-local.invalid`
    if (resumeId) {
      const id = receipt.users.find((user: any) => user.actor === actor).id
      const existing = await admin.auth.admin.getUserById(id)
      if (existing.error || existing.data.user?.id !== id || existing.data.user.email !== email) throw new Error('Retained actor does not match synthetic run')
      actors.set(actor, { id, email })
    } else {
      const password = randomUUID() + randomUUID()
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error || !created.data.user) throw new Error('Synthetic user creation failed')
      actors.set(actor, { id: created.data.user.id, email, password }); receipt.users.push({ actor, id: created.data.user.id }); save()
    }
  }
  const signIn = async (credentials: { id: string; email: string; password?: string }) => {
    const db = client()
    if (credentials.password) {
      const auth = await db.auth.signInWithPassword({ email: credentials.email, password: credentials.password })
      if (auth.error || auth.data.user?.id !== credentials.id) throw new Error('Synthetic Auth failed')
    } else {
      // Recover only the verified fixed synthetic actor, without changing its
      // password or issuing email. Token material remains in server memory.
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: credentials.email })
      if (link.error || link.data.user?.id !== credentials.id || !link.data.properties?.hashed_token) throw new Error('Synthetic Auth recovery unavailable')
      const auth = await db.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token })
      if (auth.error || auth.data.user?.id !== credentials.id) throw new Error('Synthetic Auth recovery failed')
    }
    return db
  }
  const credentials = actors.get('athlete')!
  if (resumeId) {
    const owned = await admin.from('training_programs').select('id').eq('id', receipt.programId).eq('user_id', credentials.id).single()
    const base = await admin.from('training_plan_versions').select('id').eq('id', receipt.baseId).eq('program_id', receipt.programId).eq('user_id', credentials.id).single()
    if (owned.error || base.error) throw new Error('Retained fixture ownership mismatch')
  }
  const setupOwner = await signIn(credentials)
  const fixture = resumeId ? { programId: receipt.programId as string, baseId: receipt.baseId as string }
    : await seedBrowserProgram(admin, setupOwner, credentials.id)
  if (resumeId) receipt.resumedAt = [...(receipt.resumedAt ?? []), new Date().toISOString()]
  Object.assign(receipt, fixture); save()
  let registry: TrustedReviewedWeekRegistration[] = [await fixedBrowserReview(setupOwner, credentials.id, fixture.programId, 'same_week')]
  const sessions = new Map<string, { actor: string; db: SupabaseClient; userId: string }>()
  const body = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > 120000) throw new Error('Body too large'); chunks.push(Buffer.from(chunk)) }
    return Buffer.concat(chunks).toString('utf8')
  }
  const json = (value: unknown, code = 200, headers: Record<string, string> = {}) => Response.json(value, { status: code,
    headers: { 'Cache-Control': 'private, no-store', ...headers } })
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', origin), method = req.method ?? 'GET'
    let response: Response
    try {
      if (req.headers.host !== '127.0.0.1:3012' || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
        || (method !== 'GET' && req.headers.origin !== origin)) { response = json({ error: 'Loopback origin required' }, 403) }
      else {
        const sid = /(?:^|;\s*)reviewed_test=([a-f0-9-]+)/.exec(req.headers.cookie ?? '')?.[1], session = sid ? sessions.get(sid) : undefined
        const raw = method === 'POST' ? await body(req) : ''
        if (url.pathname === '/__test/login' && method === 'POST') {
          const actor = JSON.parse(raw).actor, credentials = actors.get(actor)
          if (!credentials) response = json({ error: 'Unknown synthetic actor' }, 400)
          else {
            const db = await signIn(credentials)
            const token = randomUUID(); sessions.set(token, { actor, db, userId: credentials.id })
            response = json({ signedIn: true }, 200, { 'Set-Cookie': `reviewed_test=${token}; HttpOnly; SameSite=Strict; Path=/` })
          }
        } else if (url.pathname === '/__test/logout' && method === 'POST') {
          if (sid) sessions.delete(sid)
          response = json({ signedOut: true }, 200, { 'Set-Cookie': 'reviewed_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' })
        } else if (url.pathname === '/__test/state' && method === 'GET') {
          if (!session) response = json({ userId: null })
          else {
            const programs = await session.db.from('training_programs').select('id,active_plan_version_id').eq('user_id', session.userId).eq('id', fixture.programId).maybeSingle()
            if (programs.error) throw new Error('Program readback failed')
            let plan: any = null, rows: any[] = [], proposals: any[] = [], reports: any[] = []
            if (programs.data) {
              const version = await session.db.from('training_plan_versions').select('intent').eq('id', programs.data.active_plan_version_id).single()
              const slots = await session.db.from('coach_effective_prescribed_sessions').select('*').eq('plan_version_id', programs.data.active_plan_version_id).order('session_index')
              const saved = await session.db.from('adaptation_proposals').select('id,status,idempotency_key,proposed_plan_version_id').eq('program_id', fixture.programId)
              const actuals = await session.db.from('coach_reviewed_set_reports').select('*').eq('user_id', session.userId)
              if (version.error || slots.error || saved.error || actuals.error) throw new Error('Full owned readback failed')
              plan = version.data.intent.reviewed_week; rows = slots.data; proposals = saved.data; reports = actuals.data
            }
            response = json({ userId: session.userId, actor: session.actor, programId: fixture.programId, activePlanVersionId: programs.data?.active_plan_version_id ?? null,
              plan, sessions: rows, proposals, reports, sessionLinks: Object.fromEntries(rows.map(row => [row.prescription.sessionId, row.id])) })
          }
        } else if (url.pathname === '/__test/review' && method === 'POST') {
          const transition = JSON.parse(raw).transition
          if (session?.actor !== 'athlete' || !['same_week', 'next_week'].includes(transition)) response = json({ error: 'Fixed synthetic review unavailable' }, 403)
          else { registry = [await fixedBrowserReview(session.db, session.userId, fixture.programId, transition)]; response = json({ ready: true }) }
        } else if (url.pathname.startsWith('/api/coach/reviewed/')) {
          const db = session?.db ?? client()
          const handlers = createReviewedHttpHandlers({ createUserClient: async () => db, enabled: () => true, registry,
            issue: createReviewedWeekProposalIssuer({ registry, enabled: () => true, createServiceClient: () => admin }) })
          const request = new Request(url, { method, ...(method === 'POST' ? { body: raw, headers: { 'Content-Type': 'application/json' } } : {}) })
          const match = url.pathname.match(/^\/api\/coach\/reviewed\/(sessions|proposals|programs)\/([a-f0-9-]+)(?:\/(sets|complete|resolve|accept))?$/i)
          if (url.pathname === '/api/coach/reviewed/proposals') response = method === 'GET' ? await handlers.listProposals(request) : await handlers.propose(request)
          else if (!match) response = json({ error: 'Not found' }, 404)
          else {
            const [, group, id, action] = match
            response = group === 'sessions' && method === 'GET' && !action ? await handlers.readSession(request, id)
              : group === 'proposals' && method === 'GET' && !action ? await handlers.readProposal(request, id)
                : method !== 'POST' ? json({ error: 'Method unavailable' }, 405)
                  : group === 'sessions' && action === 'sets' ? await handlers.recordSet(request, id)
                    : group === 'sessions' && action === 'complete' ? await handlers.complete(request, id)
                      : group === 'sessions' && action === 'resolve' ? await handlers.resolve(request, id)
                        : group === 'proposals' && action === 'accept' ? await handlers.accept(request, id)
                          : group === 'programs' && action === 'resolve' ? await handlers.resolveProposal(request, id) : json({ error: 'Not found' }, 404)
          }
          receipt.requests.push({ method, path: url.pathname, status: response.status, at: new Date().toISOString() }); save()
        } else if (method === 'GET' && ['/bundle.js', '/style.css'].includes(url.pathname)) {
          response = new Response(readFileSync(`output/playwright/reviewed-browser-build${url.pathname}`), { headers: { 'Content-Type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css' } })
        } else if (method === 'GET' && (url.pathname === '/' || /^\/program(?:\/reviewed\/(?:plans\/)?[a-f0-9-]+)?$/.test(url.pathname))) {
          response = new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local reviewed browser test</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>', { headers: { 'Content-Type': 'text/html' } })
        } else response = json({ error: 'Not found' }, 404)
      }
    } catch { response = json({ error: 'Local test operation failed; retained server state unchanged unless a save already committed' }, 500) }
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  })
  server.listen(3012, '127.0.0.1', () => { receipt.status = 'listening'; save(); console.log(JSON.stringify({ origin, runId, receipt: `${directory}/server-receipt.json` })) })
  server.on('error', () => { receipt.status = 'failed'; save(); process.exitCode = 1 })
  const stop = () => server.close(() => { receipt.status = 'stopped'; save(); process.exit(0) })
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
void main().catch(() => { console.error('Local browser harness failed before listening; inspect retained fixture receipts.'); process.exitCode = 1 })
