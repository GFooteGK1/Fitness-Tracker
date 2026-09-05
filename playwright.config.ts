import { defineConfig } from '@playwright/test'

/** Local browser contract tests. External services are intercepted in each fixture. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'output/playwright/app-quality-results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/app-quality-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3010',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    timezoneId: 'America/Chicago',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3010',
    url: 'http://127.0.0.1:3010/auth/signin',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-browser-test-anon-key',
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }
})
