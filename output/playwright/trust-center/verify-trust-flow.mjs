async (page) => {
  const origin = 'http://127.0.0.1:3010'
  const userId = '99999999-9999-4999-8999-999999999999'
  const memoryId = '21111111-1111-4111-8111-111111111111'
  const importId = '31111111-1111-4111-8111-111111111111'
  const proposalId = '41111111-1111-4111-8111-111111111111'
  const groupId = '71111111-1111-4111-8111-111111111111'
  const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5OTk5OS05OTk5LTQ5OTktODk5OS05OTk5OTk5OTk5OTkiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6ImxvY2FsLWJyb3dzZXJAdGVzdC5pbnZhbGlkIiwiZXhwIjo0MTAyNDQ0ODAwfQ.signature'
  const responseHeaders = { 'Content-Type': 'application/json' }
  const trustRequestBodies = []
  const importRequestBodies = []
  const consoleErrors = []

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const coachContext = {
    generatedAt: '2026-09-01T18:00:00.000Z',
    storageAvailable: true,
    doctrineVersion: '0.1.0',
    policyVersion: '0.3.0',
    assessments: [],
    memories: [],
    activeProgram: null
  }
  const trust = {
    generatedAt: '2026-09-01T18:00:00.000Z',
    available: true,
    unavailableReason: null,
    memories: [{
      id: memoryId,
      memoryKey: 'primary_goal',
      kind: 'goal',
      version: 1,
      summary: 'Build useful strength',
      content: { goal: 'Build useful strength', primaryDomain: 'strength', secondaryGoals: [] },
      source: 'Confirmed in Program setup',
      confidence: 1,
      confirmedAt: '2026-08-01T12:00:00.000Z',
      lastReviewedAt: null,
      reviewAfter: '2026-11-01T12:00:00.000Z',
      freshness: 'current'
    }],
    imports: [{
      id: importId,
      sourceSystem: 'qwik_vbt',
      fileName: 'qwik.json',
      fileHashPrefix: 'aaaaaaaaaaaa',
      parserVersion: 'qwik-import-0.1.0',
      capturedAt: '2026-08-31T12:01:00.000Z',
      sourceExportedAt: '2026-08-31T12:00:00.000Z',
      warningCount: 1,
      rawStoragePolicy: 'user_retained_not_uploaded',
      canConfirm: true,
      blockingReason: null,
      groups: [{
        id: groupId,
        status: 'incomplete',
        sourceRecordId: 'set-1',
        sourceExercise: 'Squat',
        observedAt: '2026-08-31T12:00:00.000Z',
        mappingStatus: 'ambiguous',
        canonicalMovementId: null,
        canonicalMovementName: null,
        candidates: [{ id: 'barbell_back_squat', name: 'Barbell back squat' }],
        protocol: 'qwik-video-vbt-fixed-load',
        comparabilityKey: null,
        comparison: {},
        values: [
          { metricId: 'strength.load', semanticRole: 'training_signal', value: 100, unit: 'kg', ordinal: 0 },
          { metricId: 'strength.repetitions', semanticRole: 'training_signal', value: 3, unit: 'repetitions', ordinal: 0 },
          { metricId: 'bar.mean_velocity', semanticRole: 'direct_outcome', value: 0.58, unit: 'm_per_s', ordinal: 0 }
        ]
      }]
    }],
    goals: [{
      id: 'goal-1', statement: 'Build useful strength', priority: 'primary', target: null,
      startsOn: '2026-08-01', endsOn: '2026-09-25'
    }],
    qualities: [{ id: 'quality-1', goalId: 'goal-1', qualityId: 'maximal_strength', state: 'development' }],
    signalSummary: [{ semanticRole: 'direct_outcome', count: 2, latestObservedAt: '2026-08-31T12:00:00.000Z' }],
    proposals: [{
      id: proposalId,
      createdAt: '2026-09-01T12:00:00.000Z',
      action: 'reallocate_emphasis',
      trend: 'stable',
      evidenceStatus: 'supported',
      confidence: 0.82,
      includedCount: 2,
      excludedCount: 1,
      explanation: ['Repeated compatible direct outcomes improved.'],
      excludedReasons: ['incompatible_comparability_series'],
      automaticActivation: false
    }]
  }

  await page.route('https://placeholder.supabase.co/**', async route => {
    const requestUrl = route.request().url()
    if (requestUrl.includes('/rest/v1/user_profiles')) {
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          user_id: userId,
          fitness_goals: ['Build useful strength'],
          activity_level: 'moderately_active',
          body_metrics: { height_cm: 180, weight_kg: 85, age: 40 },
          preferences: { units: 'imperial', notifications: true, privacy_level: 'private' },
          medical_conditions: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        })
      })
      return
    }
    if (requestUrl.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        body: JSON.stringify({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'local-browser@test.invalid' })
      })
      return
    }
    await route.fulfill({ status: 404, headers: responseHeaders, body: '{}' })
  })

  await page.route(`${origin}/api/whoop/initialize`, route => route.fulfill({
    status: 200, headers: responseHeaders, body: JSON.stringify({ initialized: false })
  }))
  await page.route(`${origin}/api/coach`, route => route.fulfill({
    status: 200, headers: responseHeaders, body: JSON.stringify({ context: coachContext })
  }))
  await page.route(`${origin}/api/coach/imports/qwik`, async route => {
    const body = route.request().postData() || ''
    importRequestBodies.push(body)
    if (importRequestBodies.length === 1) {
      await route.abort('connectionfailed')
      return
    }
    await route.fulfill({
      status: 201,
      headers: responseHeaders,
      body: JSON.stringify({
        result: { import_id: importId, disposition: 'recorded', observation_group_count: 3, review_required: true },
        review: { setCount: 3, warningCount: 1 },
        evidenceStatus: 'pending_review',
        adaptationEligible: false
      })
    })
  })
  await page.route(`${origin}/api/coach/trust`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, headers: responseHeaders, body: JSON.stringify({ trust }) })
      return
    }
    const body = route.request().postData() || ''
    trustRequestBodies.push(body)
    if (trustRequestBodies.length === 1) {
      await route.abort('connectionfailed')
      return
    }
    await route.fulfill({ status: 200, headers: responseHeaders, body: JSON.stringify({ saved: true, trust }) })
  })

  await page.goto(`${origin}/auth/signin`)
  await page.evaluate(({ accessToken }) => {
    const value = JSON.stringify([accessToken, 'local-refresh-token', null, null, null])
    document.cookie = `sb-placeholder-auth-token=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
  }, { accessToken })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${origin}/program`)
  await page.getByRole('heading', { name: 'What Coach Knows', exact: true }).waitFor()
  await page.getByText('Repeated compatible direct outcomes improved.').waitFor()
  await page.getByText('Excluded because: Incompatible Comparability Series.').waitFor()
  await page.screenshot({ path: 'output/playwright/trust-center/trust-1280.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Choose Qwik JSON').setInputFiles('C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/adaptive-programming-layered-storage/test/fixtures/qwik/qwik-vbt-json-1.10.json')
  await page.getByRole('heading', { name: 'Normalized preview' }).waitFor()
  await page.getByText('3 sets · 5 velocity readings', { exact: false }).waitFor()
  await page.getByText('Original JSON and bar-path arrays stay on this device', { exact: false }).waitFor()
  await page.screenshot({ path: 'output/playwright/trust-center/trust-qwik-preview-390.png', fullPage: true })

  const trustSection = page.getByRole('heading', { name: 'What Coach knows and why it matters', exact: false }).locator('xpath=ancestor::section[1]')
  const mobile390 = await trustSection.evaluate(section => {
    const controls = Array.from(section.querySelectorAll('button, a, select, input, textarea'))
      .filter(element => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width < 44 || rect.height < 44)
      })
      .map(element => {
        const rect = element.getBoundingClientRect()
        return `${element.tagName.toLowerCase()}:${element.getAttribute('aria-label') || element.textContent?.trim()}:${Math.round(rect.width)}x${Math.round(rect.height)}`
      })
    const undersizedText = Array.from(section.querySelectorAll('input, select, textarea'))
      .filter(element => Number.parseFloat(window.getComputedStyle(element).fontSize) < 16)
      .map(element => `${element.tagName.toLowerCase()}:${window.getComputedStyle(element).fontSize}`)
    return { overflow: section.scrollWidth > section.clientWidth, controls, undersizedText }
  })
  await page.screenshot({ path: 'output/playwright/trust-center/trust-390.png', fullPage: true })

  await page.setViewportSize({ width: 320, height: 844 })
  const overflow320 = await trustSection.evaluate(section => section.scrollWidth > section.clientWidth)
  await page.screenshot({ path: 'output/playwright/trust-center/trust-320.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('button', { name: 'Save for review' }).click()
  await page.getByText('The normalized preview is still here; retry uses the same save key.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Retry same import' }).click()
  await page.getByText('Qwik measurements saved for your review.', { exact: false }).waitFor()
  await page.getByText('qwik.json', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'Still correct' }).focus()
  await page.keyboard.press('Tab')
  const nextFocused = await page.evaluate(() => document.activeElement?.textContent?.trim())
  if (nextFocused !== 'Correct') throw new Error(`Memory keyboard order is incorrect: ${nextFocused}`)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Space')
  await page.getByText('Your entry is still here; retry uses the same save key.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Still correct' }).click()
  await page.getByText('Coach memory reaffirmed.').waitFor()

  const movementSelect = page.getByRole('combobox', { name: 'Choose the movement' })
  const confirmImport = page.getByRole('button', { name: 'Confirm import' })
  if (!(await confirmImport.isDisabled())) throw new Error('Qwik import was confirmable before mapping selection')
  await movementSelect.selectOption('barbell_back_squat')
  if (await confirmImport.isDisabled()) throw new Error('Qwik import stayed disabled after an explicit supported mapping')

  await page.getByRole('button', { name: 'Reject proposal' }).click()
  const confirmReject = page.getByRole('button', { name: 'Confirm rejection' })
  if (!(await confirmReject.isDisabled())) throw new Error('Proposal rejection was available before a reason')
  await page.getByRole('textbox', { name: 'Why are you rejecting this change?' }).fill('Keep the current emphasis for now')
  if (await confirmReject.isDisabled()) throw new Error('Proposal rejection stayed disabled after a reason')

  const sameTrustRetryBody = trustRequestBodies.length === 2 && trustRequestBodies[0] === trustRequestBodies[1]
  const trustRetryBody = JSON.parse(trustRequestBodies[0])
  const sameImportRetryBody = importRequestBodies.length === 2 && importRequestBodies[0] === importRequestBodies[1]
  const importRetryBody = JSON.parse(importRequestBodies[0])
  const importBodyText = importRequestBodies[0]
  const importPrivacySafe = !/rawText|export_format_version|"barPath":|bar_path/.test(importBodyText)
  const expectedNetworkErrorOnly = consoleErrors.every(message => (
    message.includes('ERR_CONNECTION_FAILED') || message.includes('Failed to load resource')
  ))
  if (mobile390.overflow || overflow320) throw new Error('Trust center has horizontal overflow')
  if (mobile390.controls.length > 0) throw new Error(`Trust controls below 44px: ${mobile390.controls.join(', ')}`)
  if (mobile390.undersizedText.length > 0) throw new Error(`Trust inputs below 16px: ${mobile390.undersizedText.join(', ')}`)
  if (!sameTrustRetryBody) throw new Error('Trust retry payload or idempotency key changed')
  if (trustRetryBody.action !== 'reaffirm_memory') throw new Error('Unexpected trust retry action')
  if (!sameImportRetryBody) throw new Error('Qwik retry payload or idempotency key changed')
  if (!importPrivacySafe || importRetryBody.action !== 'save_for_review') throw new Error('Qwik request crossed the raw-data privacy boundary')
  if (!expectedNetworkErrorOnly) throw new Error(`Unexpected console errors: ${consoleErrors.join(' | ')}`)

  return {
    viewports: { mobile390, overflow320 },
    keyboard: { nextFocused },
    retry: { requests: trustRequestBodies.length, exactPayloadReused: sameTrustRetryBody, idempotencyKey: trustRetryBody.idempotencyKey },
    qwikImport: { requests: importRequestBodies.length, exactPayloadReused: sameImportRetryBody, privacySafe: importPrivacySafe, idempotencyKey: importRetryBody.idempotencyKey },
    mapping: { explicitSelectionRequired: true, selectedMovement: await movementSelect.inputValue() },
    rejection: { reasonRequired: true, secondSubmitEnabled: !(await confirmReject.isDisabled()) },
    explanation: { rationaleVisible: true, exclusionReasonVisible: true },
    consoleErrors
  }
}
