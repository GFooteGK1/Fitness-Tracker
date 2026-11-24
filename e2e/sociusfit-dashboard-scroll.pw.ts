import { expect, test, type Locator, type Page } from '@playwright/test'
import { sociusTodayHtml } from '../app/lib/coach/today-app-ui'

const date = '2026-11-23'
const readAt = '2026-11-23T18:00:00Z'
const finalWorkoutDetail = 'Cooldown: easy walk · 5 min'
const toolResults = {
  open_socius_today: {
    today: {
      date, readAt, sessions: [], recentWork: [],
      recovery: { status: 'saved', recoveryScore: 36, sleepPerformance: 79, strainScore: 0.5 },
      lastWorkout: {
        status: 'available', date: '2026-11-22',
        movements: [{ name: 'Front squat', measurements: ['3 sets × 5 reps'] }],
      },
    },
    checkInEnabled: true, activityEnabled: true, nutritionEnabled: true, nutritionWritesEnabled: true,
  },
  show_socius_activity: {
    activity: {
      date: '2026-11-22', timezone: 'America/Chicago',
      workouts: { status: 'available', entries: [{
        label: 'Strength session', revision: 1,
        details: [...Array.from({ length: 16 }, (_, index) => `Saved set ${index + 1} · 5 reps`), finalWorkoutDetail],
      }] },
    },
  },
  read_socius_nutrition: {
    nutrition: {
      date, readAt, timezone: 'America/Chicago', mealCount: 2, mealStatus: 'available', targetStatus: 'available',
      totals: { protein: 68, carbs: 84, fat: 31, calories: 887 },
      targets: { protein: 155, carbs: 210, fat: 70, calories: 2090 },
    },
  },
}

async function openDashboard(page: Page) {
  await page.clock.setFixedTime(new Date(readAt))
  await page.route('**/socius-test-widget', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: sociusTodayHtml,
  }))
  await page.route('**/socius-test-host', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { margin: 0; overflow: hidden; }
        iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
        #composer { position: fixed; inset: auto 0 0; height: 140px; background: #20272b; color: white; }
      </style>
      <iframe title="SociusFit" sandbox="allow-scripts" src="/socius-test-widget"></iframe>
      <div id="composer">ChatGPT follow-up composer</div>
      <script>
        const results = ${JSON.stringify(toolResults)};
        const widget = document.querySelector('iframe');
        window.addEventListener('message', event => {
          if (event.source !== widget.contentWindow || event.data?.id == null) return;
          const { id, method, params } = event.data;
          const result = method === 'ui/initialize'
            ? { hostContext: { displayMode: 'fullscreen', platform: 'mobile', theme: 'dark' } }
            : { _meta: results[params?.name] };
          widget.contentWindow.postMessage({ jsonrpc: '2.0', id, result }, '*');
        });
      </script>`,
  }))
  await page.goto('/socius-test-host')
  return page.frameLocator('iframe[title="SociusFit"]')
}

async function overComposer(page: Page, locator: Locator) {
  const composer = await page.locator('#composer').boundingBox()
  const bounds = await locator.boundingBox()
  return Boolean(composer && bounds && bounds.y >= 0 && bounds.y + bounds.height <= composer.y)
}

async function tapInPlace(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('The control has no position to tap')
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
}

async function updateComposerInset(page: Page, bottom: number) {
  await page.locator('#composer').evaluate((composer, inset) => {
    composer.style.height = `${inset}px`
    document.querySelector('iframe')?.contentWindow?.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { safeAreaInsets: { top: 0, right: 0, bottom: inset, left: 0 } },
    }, '*')
  }, bottom)
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`SociusFit at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test('all dashboard tabs can scroll their last content above the chat composer', async ({ page }) => {
      const widget = await openDashboard(page)
      const viewSwitch = widget.getByRole('navigation', { name: 'SociusFit views' })
      const scrollDown = async (lastContent: Locator) => {
        expect(await overComposer(page, lastContent)).toBe(false)
        await page.mouse.move(viewport.width / 2, viewport.height / 2)
        await page.mouse.wheel(0, 1600)
        await expect.poll(() => overComposer(page, lastContent), { timeout: 2000 }).toBe(true)
      }

      await viewSwitch.getByRole('button', { name: 'Nutrition' }).tap()
      const refresh = widget.getByRole('button', { name: 'Refresh totals' })
      await expect(refresh).toBeEnabled()
      if (viewport.width === 390) {
        await updateComposerInset(page, 224)
        await widget.getByRole('button', { name: 'Log food in chat' }).tap()
        await expect(widget.getByLabel('What did you eat? (optional)')).toBeVisible()
      }
      await scrollDown(refresh)
      await tapInPlace(page, refresh)
      await expect(widget.getByText('Nutrition totals refreshed.')).toBeVisible()

      const historyTab = viewSwitch.getByRole('button', { name: 'Training history' })
      await historyTab.tap()
      await expect(historyTab).toHaveAttribute('aria-pressed', 'true')
      await expect(widget.locator('#activity-load')).toBeEmpty()
      const lastWorkoutDetail = widget.getByText(finalWorkoutDetail, { exact: true })
      await expect(lastWorkoutDetail).toBeVisible()
      await scrollDown(lastWorkoutDetail)

      await viewSwitch.getByRole('button', { name: 'Today' }).tap()
      const lastWorkout = widget.locator('#last-workout > summary')
      await expect(lastWorkout).toBeVisible()
      await scrollDown(lastWorkout)
      await tapInPlace(page, lastWorkout)
      await expect(widget.getByText('Front squat', { exact: true })).toBeVisible()
    })
  })
}
