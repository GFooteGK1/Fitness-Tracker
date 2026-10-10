import { expect, test, type Page, type Route } from '@playwright/test'

// UI/transport contract only: provider and database behavior are exercised by PGlite tests.
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const email = 'photo-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const item = { food: 'Eggs', portion: '2 eggs', protein: 12, carbs: 1, fat: 10, calories: 142 }
const draft = { id: '11111111-1111-4111-8111-111111111111', revision: 1, kind: 'meal', input_method: 'photo', normalized: { record: { meal_timestamp: '2026-10-10T12:00:00Z', items: [item] } } }

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
    if (url.origin === origin && url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
    return route.abort('blockedbyclient')
  })
  await page.goto('/capture/photos')
  await expect(page.getByRole('heading', { name: 'Review a meal photo' })).toBeVisible()
}
async function selectAndApprove(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 480
    const ctx = canvas.getContext('2d')!
    for (let y = 0; y < 480; y += 12) for (let x = 0; x < 480; x += 12) {
      ctx.fillStyle = `rgb(${x % 255},${y % 255},${(x+y) % 255})`; ctx.fillRect(x,y,12,12)
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Photo', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png,'base64') })
  await expect(page.getByRole('button', { name: 'Analyze approved photo' })).toBeDisabled()
  await expect(page.getByText(/Non-food photos reach OpenAI too/)).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Analyze approved photo' }).click()
}

test('food screening leads to a reloadable draft, correction and explicit acceptance on mobile', async ({ page }) => {
  await setup(page)
  let drafts: typeof draft[] = [], accepted = 0, uploads = 0
  await page.route(`${origin}/api/capture/drafts`, route => {
    if (route.request().method() === 'GET') return json(route, { userId: owner, drafts })
    const body = route.request().postDataJSON()
    expect(body.expectedUserId).toBe(owner); expect(body.action).toBe('commit'); expect(body.expectedRevision).toBe(2)
    accepted++; drafts = []
    return json(route, { receipt: { entityId: 'accepted-meal' }, canonicalChanged: true })
  })
  await page.route(`${origin}/api/meals/photo-drafts`, route => {
    const body = route.request().postDataBuffer()!.toString('latin1')
    expect(body).toContain('name="screeningApproved"\r\n\r\ntrue')
    expect(body).toContain('name="expectedUserId"\r\n\r\n' + owner)
    expect(body).toContain('Content-Type: image/jpeg')
    expect(body).toContain('name="requestId"')
    uploads++; drafts = [structuredClone(draft)]
    return json(route, { draft, state: 'draft', canonicalChanged: false })
  })
  await page.route(`${origin}/api/meals/photo-drafts/${draft.id}`, route => {
    const body = route.request().postDataJSON()
    expect(body.expectedRevision).toBe(1); expect(body.items[0].portion).toBe('3 eggs')
    drafts = [{ ...draft, revision: 2, normalized: { record: { ...draft.normalized.record, items: body.items } } }]
    return json(route, { draft: drafts[0] })
  })
  await selectAndApprove(page)
  await expect(page.getByRole('status')).toHaveText('Estimate saved for review. Nutrition totals have not changed.')
  expect(accepted).toBe(0)
  await page.reload()
  await expect(page.getByText('Eggs · 2 eggs')).toBeVisible()
  await page.getByRole('button', { name: 'Correct estimate' }).click()
  await page.getByLabel('Portion (include units)').fill('3 eggs')
  await page.getByRole('button', { name: 'Save corrections' }).click()
  await expect(page.getByText('Eggs · 3 eggs')).toBeVisible()
  await page.screenshot({ path: 'output/playwright/photo-screening/food-draft-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Accept meal' }).click()
  await expect(page.getByRole('status')).toHaveText('Meal accepted and added to nutrition totals.')
  expect(accepted).toBe(1); expect(uploads).toBe(1)
})

for (const outcome of ['non_food','review_required']) test(`${outcome} stops with manual guidance and no acceptance`, async ({ page }) => {
  await setup(page)
  let uploads = 0
  await page.route(`${origin}/api/meals/photo-drafts`, route => { uploads++; return json(route, { state: 'screened', outcome, canonicalChanged: false }) })
  await selectAndApprove(page)
  await expect(page.getByRole('status')).toContainText(outcome === 'non_food' ? 'No food was detected.' : 'could not be confidently screened as food')
  await expect(page.getByRole('button', { name: 'Accept meal' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Enter a meal manually' })).toHaveAttribute('href','/food-progress?view=camera')
  await expect(page.getByRole('button', { name: 'Analyze approved photo' })).toBeDisabled()
  await expect(page.getByLabel('Photo', { exact: true })).toHaveValue('')
  for (const width of [320,390]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false) }
  await page.screenshot({ path: `output/playwright/photo-screening/${outcome}-mobile.png`, fullPage: true })
  expect(uploads).toBe(1)
})
