import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const mealId = '66666666-6666-4666-8666-666666666666'
const email = 'capture-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }, fields: { macros: { origin: 'model_estimated', reviewState: 'unreviewed', sourceReferences: [] } } }
const receipt = { schemaVersion: 2, userId: owner, requestId: 'request-original', requestKey: 'quick-meal:request-original', operationId: 'op', entityKind: 'meal', entityId: mealId, revision: 1, eventAt: '2026-09-17T12:00:00Z', capturedAt: '2026-09-17T12:00:00Z', inputMethod: 'template', state: 'saved', provenance, recommendationId: null }
async function setup(page: Page) {
  await page.context().addCookies([{ name: 'sb-placeholder-auth-token', value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])), url: origin, sameSite: 'Lax' }])
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin === 'https://placeholder.supabase.co') {
      if (url.pathname === '/auth/v1/user') return json(route, { id: owner, aud: 'authenticated', role: 'authenticated', email })
      if (url.pathname === '/rest/v1/user_profiles') return json(route, { user_id: owner, fitness_goals: ['Strength'], activity_level: 'moderately_active', body_metrics: { age: 40, weight_kg: 85, height_cm: 180 }, preferences: { units: 'imperial' }, medical_conditions: [] })
      return json(route, [])
    }
    if (url.origin === origin) {
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
      if (url.pathname === '/api/meals/common') return json(route, { meals: [{ sourceMealId: mealId, signature: 'eggs', title: 'Eggs', totals: { calories: 140, protein: 12 }, timesLogged: 2 }] })
      if (url.pathname === '/api/targets') return json(route, { targetProtein: 150, targetCarbs: 200, targetFat: 65, targetCalories: 2000 })
      if (url.pathname === '/api/whoop/data') return json(route, { recovery: null })
      if (url.pathname === '/api/whoop/sync') return json(route, { isConnected: false })
      if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
      if (url.pathname === '/api/meals/daily') return json(route, { meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 }, adherence: { overallScore: 0 } })
    }
    return route.abort('blockedbyclient')
  })
}

test('synthetic meal copy receipt and latest-revision correction on mobile', async ({ page }) => {
  await setup(page)
  let correction: any
  await page.route(`${origin}/api/meals/quick-log`, route => {
    const body = route.request().postDataJSON()
    expect(body.expectedUserId).toBe(owner); expect(body.requestId).toBeTruthy()
    return json(route, { mealId, receipt, receipts: [receipt] })
  })
  const meal = { id: mealId, userId: owner, captureRevision: 2, captureProvenance: provenance, mealTimestamp: '2026-09-17T12:00:00Z', items: [{ food: 'Eggs', portion: '2 eggs', protein: 12, carbs: 1, fat: 10, calories: 140 }], totalProtein: 12, totalCarbs: 1, totalFat: 10, totalCalories: 140, needsReview: true, manualOverride: false }
  await page.route(`${origin}/api/meals/${mealId}`, route => {
    if (route.request().method() === 'GET') return json(route, { meal })
    correction = route.request().postDataJSON()
    return json(route, { meal: { ...meal, items: correction.items, captureRevision: 3 }, receipt: { ...receipt, revision: 3 } })
  })
  await page.goto('/food-progress?view=camera&input=recent')
  await page.getByRole('button', { name: 'Log Eggs', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Save receipt' }).getByText('Meal saved', { exact: true })).toBeVisible()
  await expect(page.getByText('Estimated · review available', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Review or correct' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Meal' })).toBeVisible()
  await page.getByPlaceholder('e.g., 6 oz, 1 cup, 150g').fill('3 eggs')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByRole('heading', { name: 'Edit Meal' })).toHaveCount(0)
  expect(correction.expectedRevision).toBe(2); expect(correction.expectedUserId).toBe(owner); expect(correction.requestId).toBeTruthy()
  expect(correction.items[0].portion).toBe('3 eggs')
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false) }
  await page.screenshot({ path: 'output/playwright/capture-receipts/w2-receipt-mobile.png', fullPage: true })
})

test('native IndexedDB retains photo bytes/time/identity across reload and fences account replay', async ({ page }) => {
  await setup(page)
  await page.goto('/auth/signin')
  const compiled = ts.transpileModule(readFileSync('app/lib/offline-queue.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const install = async () => page.evaluate(source => {
    const w = window as any
    w.captureOwner = 'athlete-a'; w.uploads = []
    const exports: any = {}
    const require = (id: string) => id.includes('supabase') ? { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: w.captureOwner } } }) } }) }
      : id.includes('capture-uncertainty') ? { markCaptureCertainty: () => {} }
      : id.includes('recommendations') ? { recommendationOrigin: () => undefined, refreshAfterCanonicalSave: () => {}, hasConfirmedCapture: () => false }
      : id.includes('fetch-with-timeout') ? { fetchWithTimeout: async (_url: string, init: RequestInit) => { if (init.method === 'GET') return new Response(JSON.stringify({ state: 'save_unconfirmed', retryAllowed: false, receipts: [] })); if (w.loseResponse) throw new Error('response lost'); const form = init.body as FormData; w.uploads.push({ id: form.get('requestId'), timestamp: form.get('timestamp'), owner: form.get('expectedUserId'), bytes: await (form.get('photo') as Blob).text() }); return new Response(JSON.stringify({ mealId: 'saved', receipt: { entityId: 'saved' } })) } }
      : { default: {}, useAuth: () => ({ user: null }) }
    new Function('exports', 'require', source)(exports, require)
    w.queueModule = exports
  }, compiled)
  await install()
  const requestId = await page.evaluate(async () => {
    const q = (window as any).queueModule.offlineQueue
    q.setOwner('athlete-a')
    return q.enqueue({ type: 'photo_upload', userId: 'athlete-a', data: { file: new File(['photo bytes'], 'meal.jpg', { type: 'image/jpeg' }), timestamp: '2026-09-17T23:59:00Z' }, maxRetries: 3, priority: 'high' })
  })
  await page.reload(); await install()
  await page.evaluate(async () => { const w = window as any; w.captureOwner = 'athlete-b'; w.queueModule.offlineQueue.setOwner('athlete-b'); await w.queueModule.offlineQueue.processQueue() })
  expect(await page.evaluate(() => (window as any).uploads.length)).toBe(0)
  await page.evaluate(async () => { const w = window as any; w.captureOwner = 'athlete-a'; w.queueModule.offlineQueue.setOwner('athlete-a'); await w.queueModule.offlineQueue.processQueue() })
  expect(await page.evaluate(() => (window as any).uploads)).toEqual([{ id: requestId, timestamp: '2026-09-17T23:59:00Z', owner: 'athlete-a', bytes: 'photo bytes' }])
  const stored = await page.evaluate(id => { const operation = (window as any).queueModule.offlineQueue.getOperation(id); return { status: operation.status, hasBytes: !!operation.data.file } }, requestId)
  expect(stored).toEqual({ status: 'completed', hasBytes: false })
  const unresolved = await page.evaluate(async () => {
    const w = window as any, q = w.queueModule.offlineQueue
    w.loseResponse = true
    const id = await q.enqueue({ type: 'photo_upload', userId: 'athlete-a', data: { file: new File(['uncertain photo'], 'uncertain.jpg'), timestamp: '2026-09-17T23:59:00Z' }, maxRetries: 1, priority: 'high' })
    await q.processQueue()
    let error = ''
    try { await q.dequeue(id) } catch (caught) { error = (caught as Error).message }
    return { error, retained: !!q.getOperation(id), bytes: await q.getOperation(id).data.file.text() }
  })
  expect(unresolved.retained).toBe(true)
  expect(unresolved.bytes).toBe('uncertain photo')
  expect(unresolved.error).toContain('pending item')
})
