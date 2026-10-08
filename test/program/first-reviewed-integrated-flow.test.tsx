/** Node SQL engine with a disposable DOM; not real Supabase Auth or native browser locks. */
import React from 'react'
import { randomUUID, webcrypto } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FirstReviewedWorkspace } from '@/app/program/first-reviewed-workspace'
import { createFirstReviewWorkspaceHttp } from '@/app/lib/coach/first-reviewed-workspace-http'
import { createFirstReviewedSetupHttp } from '@/app/lib/coach/first-reviewed-setup-http'
import { createFirstReviewSetupActionsHttp } from '@/app/lib/coach/first-reviewed-setup-actions-http'
import { createFirstReviewedPreviewHttp } from '@/app/lib/coach/first-reviewed-preview-http'
import { createFirstReviewedHttp } from '@/app/lib/coach/first-reviewed-http'
import { createFirstReviewedProfileService } from '@/app/lib/coach/first-reviewed-profile-service'
import { createFirstReviewedReviewService } from '@/app/lib/coach/first-reviewed-review-service'
import { createFirstReviewedLifecycleService } from '@/app/lib/coach/first-reviewed-lifecycle-service'
import { readFirstReviewedPending } from '@/app/lib/coach/first-reviewed-pending'
import { lifecycleIds, sourceClient, supervisedLifecycleFixture } from '../database/supervised-lifecycle-fixture'
import { sqlFile } from '../database/fixture'
import { firstReviewLocalTarget as runtimeTarget,firstReviewSnapshotSql,firstReviewAllowedAdditionsSql,
  firstReviewIsolationPreserved,firstReviewTerminalSql,firstReviewTerminalDiagnosticsSql,firstReviewTerminalPreserved,firstReviewMutableSql,firstReviewMutablePreserved } from '../../scripts/release/first-reviewed-next-scope.mjs'

const { owner, reviewer, program, base } = lifecycleIds
const origin = 'http://localhost'
describe('consecutive first-reviewed root / HTTP / SQL workflow (synthetic Auth)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  let dom: { window: Window & typeof globalThis }
  let ui: typeof import('@testing-library/react')
  let actor = owner, enabled = true, active = 0
  const requests: { actor: string; path: string; method: string; body: unknown; status: number }[] = []
  let loseAcceptance = true
  const designationId=randomUUID()
  // Translate only the fixed runtime IDs to this disposable fixture. Production
  // helpers expose no target override and still enforce their fixed local IDs.
  const testSql=(sql:string)=>Object.entries({ownerId:owner,reviewerId:reviewer,foreignId:lifecycleIds.foreign,programId:program,baseId:base})
    .reduce((text,[key,value])=>text.replaceAll(runtimeTarget[key as keyof typeof runtimeTarget],value),sql)
  const runtimeFixture={designationId}
  async function sqlResult(sql:string){const result=await f.db.exec(testSql(sql));return Object.values(result.flatMap(r=>r.rows)[0])[0]}
  beforeAll(async () => {
    // Boot the Node WASM engine before installing a DOM. No retained DB or login.
    f = await supervisedLifecycleFixture(true, true, true)
    for (const file of ['20261003150403_supervised_issue_closure_preflight.sql',
      '20261005120000_first_reviewed_designation.sql', '20261005130000_first_reviewed_candidates.sql',
      '20261005155602_first_reviewed_acceptance.sql', '20261005172408_first_reviewed_workspace.sql',
      '20261005192643_first_reviewed_setup_requests.sql']) await f.db.exec(sqlFile(`supabase/migrations/${file}`))
    await f.db.exec(`RESET ROLE; ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN deleted_at timestamptz;
      UPDATE auth.users SET email=id::text || '@sociusfit-local.invalid';`)
    await f.db.exec('BEGIN')
    await f.actor(owner)
    await f.scalar("SELECT to_jsonb(r) AS value FROM confirm_coach_memory('primary_goal','goal',$1,$2,1,'disposable-prior-goal') r",
      [JSON.stringify({goal:'Develop general strength.',primaryDomain:'strength',secondaryGoals:[]}),JSON.stringify({source:'first_reviewed_setup',confirmedBy:'athlete'})])
    await f.actor(owner, 'service_role')
    await f.scalar('SELECT version_first_review_designation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',
      [designationId, program, owner, base, reviewer, 0, '2026-10-05', true,
        new Date(Date.now() + 3600000).toISOString(), 'Synthetic integrated workflow only'])
    const { JSDOM } = await vi.importActual<{ JSDOM: new (html: string, options: { url: string }) => typeof dom }>('jsdom')
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: origin })
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement',
      'HTMLSelectElement', 'HTMLTextAreaElement', 'Node', 'Event', 'MouseEvent'] as const) vi.stubGlobal(key, dom.window[key])
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: async (name: string, _options: LockOptions, run: (lock: Lock) => Promise<unknown>) => run({ name, mode: 'exclusive' } as Lock),
    } })
    // screen must bind after this DOM exists. Hooks are managed explicitly here.
    ui = await import('@testing-library/react/pure')
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url), request = new Request(new URL(path, origin), init)
      const requestActor = actor, body = init?.body ? JSON.parse(String(init.body)) : null
      const options = { createUserClient: async () => sourceClient(f.db, requestActor), enabled: () => enabled }
      const privateDb = sourceClient(f.db, owner, 'service_role')
      const profiles = createFirstReviewedProfileService({ enabled: options.enabled, createServiceClient: () => privateDb })
      const review = createFirstReviewedReviewService({ enabled: options.enabled, createServiceClient: () => privateDb })
      const life = createFirstReviewedLifecycleService({ enabled: options.enabled, createServiceClient: () => privateDb, review })
      const http = createFirstReviewedHttp({ ...options, profiles, review, life })
      const workspace = createFirstReviewWorkspaceHttp(options), setup = createFirstReviewSetupActionsHttp(options)
      active++
      try {
        let response: Response
        const pathname = new URL(request.url).pathname, prefix = '/api/coach/first-reviewed'
        if (pathname === `${prefix}/programs`) response = await workspace.listPrograms(request)
        else if (pathname === `${prefix}/programs/${program}`) response = await workspace.readProgram(request, program)
        else if (pathname === `${prefix}/programs/${program}/profiles`) response = await workspace.listSnapshots(request, program)
        else if (pathname === `${prefix}/programs/${program}/setup-editor`) response = await setup.read(request, program)
        else if (pathname === `${prefix}/programs/${program}/setup`) response = await createFirstReviewedSetupHttp(options).read(request, program)
        else if (pathname === `${prefix}/setup`) response = await setup.save(request)
        else if (pathname === `${prefix}/setup/resolution`) response = await setup.resolve(request)
        else if (pathname === `${prefix}/setup/resolve`) response = await setup.close(request)
        else if (pathname === `${prefix}/preview`) response = await createFirstReviewedPreviewHttp(options).preview(request)
        else if (pathname === `${prefix}/resolution`) response = await http.resolution(request)
        else if (pathname === `${prefix}/resolve`) response = await http.resolve(request)
        else if (pathname === prefix) response = await http.execute(request)
        else if (pathname.startsWith(`${prefix}/candidates/`)) response = await http.readCandidate(pathname.split('/').at(-1)!)
        else if (pathname.startsWith(`${prefix}/profiles/`)) response = await http.readSnapshot(pathname.split('/').at(-1)!)
        else throw Error(`Unmapped integration request ${path}`)
        requests.push({ actor: requestActor, path, method: request.method, body, status: response.status })
        if (pathname === prefix && body?.operation === 'accept' && response.ok && loseAcceptance) {
          // Cross a genuine SQL transaction boundary before withholding the reply.
          // The next getter runs in a new transaction on this disposable engine.
          await f.db.exec('RESET ROLE; COMMIT; BEGIN')
          loseAcceptance = false
          throw Error('Acceptance response lost after SQL commit')
        }
        return response
      } finally { active-- }
    })
  }, 30000)
  afterAll(async () => {
    ui?.cleanup()
    dom?.window.close()
    vi.unstubAllGlobals()
    if (f) { await f.db.exec('ROLLBACK; RESET ROLE'); await f.db.close() }
  })
  async function idle() { await ui.waitFor(() => expect(active).toBe(0)) }
  async function click(name: string | RegExp) {
    const button = await ui.screen.findByRole('button', { name })
    await ui.waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    ui.fireEvent.click(button)
    await idle()
  }
  function fill(label: string, value: string | number, index?: number) {
    ui.fireEvent.change(index === undefined ? ui.screen.getByLabelText(label) : ui.screen.getAllByLabelText(label)[index], { target: { value: String(value) } })
  }
  async function count(table: string) {
    await idle(); await f.db.exec('RESET ROLE')
    return f.scalar<number>(`SELECT count(*)::int AS value FROM ${table}`)
  }
  it('creates/corrects setup, completes acceptance/recovery and verifies all-table runtime preservation', async () => {
    await f.db.exec('RESET ROLE; COMMIT')
    const tables=await f.scalar<string[]>("SELECT jsonb_agg(c.relname ORDER BY c.relname) AS value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")
    const memoryIds=await f.scalar<string[]>("SELECT coalesce(jsonb_agg(id),'[]') AS value FROM coach_memories WHERE user_id=$1 AND status='confirmed' AND memory_key IN ('primary_goal','training_schedule','available_equipment','training_constraints')",[owner])
    const baseline=await sqlResult(firstReviewSnapshotSql(tables,memoryIds))
    const mutableBefore=await sqlResult(firstReviewMutableSql(runtimeFixture,memoryIds))
    await f.db.exec('BEGIN')
    const old = await f.scalar('SELECT to_jsonb(v)-\'status\' AS value FROM training_plan_versions v WHERE id=$1', [base])
    const oldExecution = await f.scalar('SELECT supervised_static_execution($1,$2,$3) AS value', [owner, program, base])
    let view = ui.render(<FirstReviewedWorkspace userId={owner} />)
    await click('Review or update current setup')
    await ui.screen.findByLabelText('Your goal')
    fill('Your goal', 'Develop strength with two explicitly available sessions.')
    fill('Primary fitness component', 'strength'); fill('Training experience', 'consistent')
    for (const day of ['monday', 'wednesday']) {
      ui.fireEvent.click(ui.screen.getByLabelText(day)); fill(`Minutes on ${day}`, 60)
    }
    fill('Your equipment and training space', 'Barbell, plates, flat bench and rack safeties in a gym.')
    for (const id of ['barbell', 'bench', 'rack', 'bodyweight']) ui.fireEvent.click(ui.screen.getByLabelText(id))
    await click('Confirm and save these setup declarations')
    await ui.screen.findByText(/exact setup declarations were saved and verified/)
    expect(await count('coach_first_review_profile_snapshots')).toBe(0)
    await click('Read current saved setup'); await click('Load fresh training facts')
    await click('Confirm these exact current facts')
    await ui.screen.findByText('This factual snapshot is explicitly confirmed.')
    await click('Start a blank reviewed week')
    fill('New session day', 'monday'); await click('Create session')
    fill('Session focus', 'Synthetic bench force work')
    fill('Session instructions', 'Mechanical full-flow test; no personal suitability or performed work implied.')
    fill('Preparation window seconds', 300); fill('Preparation instructions', 'Rehearse the bench movement at an easy effort.')
    fill('logging seconds', 60)
    for (let i = 0; i < 2; i++) {
      fill('Movement', 'barbell_bench_press', i)
      for (const id of ['barbell', 'bench', 'rack']) ui.fireEvent.click(ui.screen.getAllByLabelText(id)[i])
      fill('Sets', i === 0 ? 1 : 2, i); fill('Minimum repetitions', i === 0 ? 5 : 3, i); fill('Maximum repetitions', i === 0 ? 5 : 3, i)
      fill('Estimated seconds per repetition (time planning only)', 3, i)
      fill('How to choose the weight', 'Use a familiar synthetic test load at the prescribed RPE; record actual load separately.', i)
      fill('Minimum RPE', i === 0 ? 3 : 6, i); fill('Maximum RPE', i === 0 ? 4 : 7, i)
      fill('Rest between sets (seconds)', i === 0 ? 0 : 120, i); fill('Rest after this movement (seconds)', i === 0 ? 60 : 0, i)
      fill('Movement instructions', 'Controlled mechanics; stop for symptoms or loss of intended quality.', i)
    }
    fill('Week instructions', 'Synthetic integrated flow only; unavailable training history remains unknown.')
    fill('Limitations and questions for review', 'No athlete performance improvement or adherence is asserted.')
    fill('Why this week fits the goal and current evidence', 'Explicit strength goal and confirmed equipment; mechanical interface qualification only.')
    await click('Compile and preview the complete week')
    await ui.screen.findByText('Preview does not establish reviewer approval or athlete acceptance.')
    expect(await count('coach_first_review_candidates')).toBe(0)
    await click('Save this exact candidate for review')
    await ui.screen.findByRole('region', { name: '4 Designated reviewer decision' })
    expect(ui.screen.queryByRole('button', { name: 'Approve this exact week' })).toBeNull()
    expect(await count('coach_first_review_acceptances')).toBe(0)
    view.unmount(); actor = reviewer
    view = ui.render(<FirstReviewedWorkspace userId={reviewer} />)
    await click(/Review complete week from/)
    ui.fireEvent.click(ui.screen.getByLabelText('I reviewed the complete week, previous plan, facts and limitations.'))
    await click('Approve this exact week')
    expect(ui.screen.queryByRole('button', { name: 'Create the athlete proposal' })).toBeNull()
    expect(await count('coach_first_review_acceptances')).toBe(0)
    view.unmount(); actor = owner
    view = ui.render(<FirstReviewedWorkspace userId={owner} />)
    await click(/Review complete week from/); await click('Create the athlete proposal')
    await ui.screen.findByRole('region', { name: '6 Separate athlete acceptance' })
    expect(await count('coach_first_review_acceptances')).toBe(0)
    ui.fireEvent.click(ui.screen.getByLabelText('I reviewed this complete proposed week and want to accept it.'))
    await click('Accept this exact week')
    await ui.screen.findByText('Acceptance response lost after SQL commit')
    const pending = readFirstReviewedPending(localStorage, owner, program)!
    expect(pending?.operation).toBe('accept')
    expect(await count('coach_first_review_acceptances')).toBe(1)
    const recoveryStart = requests.length
    view.unmount(); enabled = false
    view = ui.render(<FirstReviewedWorkspace userId={owner} />)
    await click('Check the original saved result')
    await ui.screen.findByText('This exact week is accepted on your existing program. Previous history is preserved.')
    expect(readFirstReviewedPending(localStorage, owner, program)).toBeNull()
    expect(requests.slice(recoveryStart).filter(r => r.method === 'POST')).toEqual([
      { actor: owner, path: '/api/coach/first-reviewed/resolution', method: 'POST', body: pending, status: 200 },
    ])
    await idle(); await f.db.exec('RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE')
    expect(await f.scalar('SELECT to_jsonb(v)-\'status\' AS value FROM training_plan_versions v WHERE id=$1', [base])).toEqual(old)
    expect(await f.scalar('SELECT supervised_static_execution($1,$2,$3) AS value', [owner, program, base])).toEqual(oldExecution)
    expect(await count('training_programs')).toBe(1)
    expect(await count('training_plan_versions')).toBe(2)
    for (const table of ['coach_supervised_programs', 'coach_supervised_initial_bases', 'coach_first_review_acceptances']) expect(await count(table)).toBe(1)
    expect(await count('coach_supervised_enrollments')).toBe(0)
    const writes = requests.filter(r => r.path === '/api/coach/first-reviewed')
    expect(writes.map(r => (r.body as { operation: string }).operation)).toEqual(['prepare_profile', 'confirm_profile', 'submit', 'decide', 'issue', 'accept'])
    expect(writes.find(r => (r.body as { operation: string }).operation === 'decide')?.actor).toBe(reviewer)
    expect(writes.filter(r => (r.body as { operation: string }).operation !== 'decide').every(r => r.actor === owner)).toBe(true)
    expect(requests.every(r => r.status === 200), JSON.stringify(requests.filter(r => r.status !== 200))).toBe(true)
    view.unmount()
    await idle();await f.db.exec('RESET ROLE; COMMIT')
    const final=await sqlResult(firstReviewSnapshotSql(tables,memoryIds))
    const allowed=await sqlResult(firstReviewAllowedAdditionsSql(tables,runtimeFixture))
    const hist=(v:unknown)=>v as Record<string,Record<string,number>>
    const beforeRows=hist(baseline),afterRows=hist(final),allowedRows=hist(allowed)
    const differences=Object.entries(afterRows).flatMap(([table,rows])=>[
      ...Object.entries(beforeRows[table]).filter(([hash,n])=>(rows[hash]??0)<n).map(([hash])=>({table,hash,kind:'old_changed'})),
      ...Object.entries(rows).filter(([hash,n])=>n-(beforeRows[table][hash]??0)>(allowedRows[table]?.[hash]??0)).map(([hash])=>({table,hash,kind:'unexpected_addition'})),
    ])
    expect(firstReviewIsolationPreserved(baseline,final,allowed),JSON.stringify(differences)).toBe(true)
    const terminalDiagnostics=await sqlResult(firstReviewTerminalDiagnosticsSql(runtimeFixture,mutableBefore))
    expect(await sqlResult(firstReviewTerminalSql(runtimeFixture,mutableBefore)),JSON.stringify(terminalDiagnostics)).toBe(true)
    expect(firstReviewTerminalPreserved(terminalDiagnostics)).toBe(true)
    const mutableAfter=await sqlResult(firstReviewMutableSql(runtimeFixture,memoryIds))
    expect(firstReviewMutablePreserved(mutableBefore,mutableAfter)).toBe(true)
    // These are deliberate disposable corruptions, never retained-stack actions.
    const programClock=await f.scalar<string>('SELECT updated_at::text AS value FROM training_programs WHERE id=$1',[program])
    await f.db.exec('ALTER TABLE training_programs DISABLE TRIGGER set_training_programs_updated_at')
    for(const clock of ["now()+interval '1 day'","'2000-01-01'::timestamptz"]) {
      await f.db.exec(`UPDATE training_programs SET updated_at=${clock} WHERE id='${program}'`)
      expect(await sqlResult(firstReviewTerminalSql(runtimeFixture,mutableBefore))).toBe(false)
      expect(firstReviewTerminalPreserved(await sqlResult(firstReviewTerminalDiagnosticsSql(runtimeFixture,mutableBefore)))).toBe(false)
    }
    await f.db.query('UPDATE training_programs SET updated_at=$1 WHERE id=$2',[programClock,program])
    await f.db.exec('ALTER TABLE training_programs ENABLE TRIGGER set_training_programs_updated_at')
    expect(await sqlResult(firstReviewTerminalSql(runtimeFixture,mutableBefore))).toBe(true)
    const memoryClock=await f.scalar<string>('SELECT updated_at::text AS value FROM coach_memories WHERE id=$1',[memoryIds[0]])
    await f.db.query("UPDATE coach_memories SET status='withdrawn' WHERE id=$1",[memoryIds[0]])
    expect(firstReviewMutablePreserved(mutableBefore,await sqlResult(firstReviewMutableSql(runtimeFixture,memoryIds)))).toBe(false)
    await f.db.exec('ALTER TABLE coach_memories DISABLE TRIGGER set_coach_memories_updated_at')
    await f.db.query("UPDATE coach_memories SET status='superseded',updated_at=$2 WHERE id=$1",[memoryIds[0],memoryClock])
    await f.db.exec('ALTER TABLE coach_memories ENABLE TRIGGER set_coach_memories_updated_at')
    expect(firstReviewMutablePreserved(mutableBefore,await sqlResult(firstReviewMutableSql(runtimeFixture,memoryIds)))).toBe(true)
    await f.db.query('UPDATE coach_context_revisions SET revision=0 WHERE user_id=$1',[owner])
    expect(firstReviewMutablePreserved(mutableBefore,await sqlResult(firstReviewMutableSql(runtimeFixture,memoryIds)))).toBe(false)
    await f.db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[randomUUID(),'unrelated@sociusfit-local.invalid'])
    expect(firstReviewIsolationPreserved(baseline,await sqlResult(firstReviewSnapshotSql(tables,memoryIds)),allowed)).toBe(false)
  }, 30000)
})
