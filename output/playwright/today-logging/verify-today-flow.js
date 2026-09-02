async (page) => {
  const origin = 'http://127.0.0.1:3010'
  const userId = '99999999-9999-4999-8999-999999999999'
  const sessionId = '11111111-1111-4111-8111-111111111111'
  const workoutId = '33333333-3333-4333-8333-333333333333'
  const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5OTk5OS05OTk5LTQ5OTktODk5OS05OTk5OTk5OTk5OTkiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6ImxvY2FsLWJyb3dzZXJAdGVzdC5pbnZhbGlkIiwiZXhwIjo0MTAyNDQ0ODAwfQ.signature'
  const responseHeaders = { 'Content-Type': 'application/json' }
  const requestBodies = []
  const consoleErrors = []

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const prescription = {
    schemaVersion: 1,
    format: 'complete_programming_v0_3',
    kernelVersion: '0.3.0',
    policyVersion: '0.3.0',
    evidenceReferenceVersion: '0.3.0',
    movementCatalogVersion: '0.2.0',
    weekNumber: 1,
    day: 'tuesday',
    sessionId,
    domain: 'strength',
    title: 'Lower body strength quality',
    intent: 'Build repeatable squat strength without grinding reps.',
    scheduledMinutes: 60,
    blocks: [{
      id: 'priority-strength',
      role: 'priority_adaptation',
      coverageRequirementIds: ['strength:squat'],
      intent: 'Accumulate technically consistent strength work.',
      instructions: 'Use the accepted load range and preserve two reps in reserve.',
      estimatedMinutes: 45,
      exercises: [{
        movementId: 'barbell_back_squat',
        movementName: 'Barbell back squat',
        role: 'primary',
        coverageRequirementIds: ['strength:squat'],
        intent: 'Build bilateral knee-dominant strength.',
        dose: {
          kind: 'sets_reps',
          sets: { min: 4, max: 4 },
          repetitions: { min: 5, max: 5 }
        },
        executionTarget: { kind: 'rir', range: { min: 2, max: 3 } },
        restSeconds: { min: 120, max: 180 },
        successCondition: 'All repetitions stay controlled and repeatable.',
        stopCondition: 'Stop the set if position or rep speed materially changes.',
        substitutionMovementIds: [],
        substitutionGuidance: 'Use an accepted squat variation only when the planned movement is unavailable.',
        selectionReasons: ['Matches the accepted strength emphasis.'],
        estimatedMinutes: 45,
        fatigueCost: 'high',
        evidenceRuleIds: ['strength-quality'],
        policyVersion: '0.3.0'
      }]
    }]
  }

  const plannedSession = {
    id: sessionId,
    weekNumber: 1,
    sessionIndex: 1,
    scheduledDate: '2026-09-01',
    prescription,
    status: 'planned',
    completionContractVersion: null,
    completedWorkoutId: null,
    scheduledMeasurements: [{
      id: 'scheduled:strength:week-1',
      weekNumber: 1,
      scheduledOn: '2026-09-01',
      assessmentDefinition: { id: 'strength.repetition_max', version: '1.0.0' },
      protocol: { id: 'strength-repetition-max-standard', version: '1.0.0' },
      metricId: 'strength.load',
      semanticRole: 'direct_outcome'
    }]
  }

  const programBase = {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Repeatable strength block',
    goalSummary: 'Build repeatable strength while preserving movement quality.',
    startDate: '2026-08-31',
    endDate: '2026-10-25',
    activePlanVersionId: '44444444-4444-4444-8444-444444444444',
    planVersion: 1,
    currentWeek: 1,
    currentWeekRole: 'establish',
    referenceVersion: '0.3.0',
    policyVersion: '0.3.0',
    weeks: [{
      week: 1,
      role: 'establish',
      intent: 'Establish repeatable baseline work and collect compatible evidence.',
      reviewRequired: false
    }],
    sessionCheckins: [],
    currentWeekReview: null
  }

  const plannedContext = {
    generatedAt: '2026-09-01T13:00:00.000Z',
    storageAvailable: true,
    doctrineVersion: '0.1.0',
    policyVersion: '0.3.0',
    assessments: [],
    memories: [],
    activeProgram: { ...programBase, upcomingSessions: [plannedSession] }
  }
  const completedContext = {
    ...plannedContext,
    generatedAt: '2026-09-01T14:00:00.000Z',
    activeProgram: {
      ...programBase,
      upcomingSessions: [{
        ...plannedSession,
        status: 'completed',
        completionContractVersion: 2,
        completedWorkoutId: workoutId
      }],
      sessionCheckins: [{
        id: '55555555-5555-4555-8555-555555555555',
        prescribedSessionId: sessionId,
        outcome: 'as_planned',
        sessionRpe: 8,
        energy: 'okay',
        pain: 'none',
        note: null,
        occurredAt: '2026-09-01T14:00:00.000Z'
      }]
    }
  }

  await page.route('https://placeholder.supabase.co/**', async route => {
    const requestUrl = route.request().url()
    if (requestUrl.includes('/rest/v1/user_profiles')) {
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          user_id: userId,
          fitness_goals: ['Build repeatable strength'],
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
        body: JSON.stringify({
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'local-browser@test.invalid'
        })
      })
      return
    }
    await route.fulfill({ status: 404, headers: responseHeaders, body: '{}' })
  })

  await page.route(`${origin}/api/whoop/initialize`, route => route.fulfill({
    status: 200,
    headers: responseHeaders,
    body: JSON.stringify({ initialized: false })
  }))
  await page.route(`${origin}/api/coach`, route => route.fulfill({
    status: 200,
    headers: responseHeaders,
    body: JSON.stringify({ context: plannedContext })
  }))
  await page.route(new RegExp(`${origin}/api/coach/sessions/.+/complete$`), async route => {
    requestBodies.push(route.request().postData() || '')
    if (requestBodies.length === 1) {
      await route.abort('connectionfailed')
      return
    }
    await route.fulfill({
      status: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        result: {
          prescribed_session_id: sessionId,
          checkin_id: '55555555-5555-4555-8555-555555555555',
          status: 'completed',
          workout_id: workoutId,
          completion_contract_version: 2,
          replayed: true
        },
        context: completedContext
      })
    })
  })

  await page.goto(`${origin}/auth/signin`)
  await page.evaluate(({ accessToken }) => {
    const value = JSON.stringify([accessToken, 'local-refresh-token', null, null, null])
    document.cookie = `sb-placeholder-auth-token=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
  }, { accessToken })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/program`)
  await page.getByRole('heading', { name: 'Lower body strength quality' }).waitFor()
  await page.getByRole('heading', { name: 'Measure today' }).waitFor()

  const todayCard = page.getByRole('heading', { name: 'Lower body strength quality' }).locator('xpath=ancestor::section[1]')
  const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  const targetIssues390 = await todayCard.evaluate(section => {
    return Array.from(section.querySelectorAll('button, a, select, input:not([type="checkbox"]), textarea, summary'))
      .filter(element => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width < 44 || rect.height < 44)
      })
      .map(element => {
        const rect = element.getBoundingClientRect()
        return `${element.tagName.toLowerCase()}:${element.getAttribute('aria-label') || element.textContent?.trim()}:${Math.round(rect.width)}x${Math.round(rect.height)}`
      })
  })
  await page.screenshot({ path: 'output/playwright/today-logging/today-390-before.png', fullPage: true })

  await page.setViewportSize({ width: 320, height: 844 })
  const overflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  await page.screenshot({ path: 'output/playwright/today-logging/today-320-before.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('button', { name: 'Readiness 1' }).focus()
  await page.keyboard.press('Tab')
  const focusedReadiness = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  if (focusedReadiness !== 'Readiness 2') {
    throw new Error(`Readiness keyboard order is incorrect: ${focusedReadiness}`)
  }
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Readiness 2' }).waitFor()
  await page.getByText('Protect the training target.', { exact: false }).waitFor()
  await page.getByLabel('Pain signal').selectOption('mild')
  await page.getByLabel('Constraint or change').fill('Left knee feels stiff during warm-up.')
  await page.getByRole('spinbutton', { name: 'Completed load', exact: true }).fill('225')
  await page.getByLabel('Repetition maximum repetitions').selectOption('3')
  await page.getByRole('button', { name: 'Finish or skip session' }).click()
  await page.getByLabel('Confirm completed prescribed work').check()
  await page.getByLabel('Session RPE').fill('8')
  await page.getByLabel('Duration in minutes').fill('58')
  await page.getByRole('button', { name: 'Save session once' }).click()

  await page.getByText('The save response was interrupted.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Retry same entry' }).click()
  await page.getByRole('heading', { name: 'Session saved' }).waitFor()
  await page.getByText('Canonical workout linked').waitFor()
  await page.getByText(workoutId, { exact: true }).waitFor()
  await page.screenshot({ path: 'output/playwright/today-logging/today-390-saved.png', fullPage: true })

  const sameRetryBody = requestBodies.length === 2 && requestBodies[0] === requestBodies[1]
  const firstBody = JSON.parse(requestBodies[0])
  const expectedNetworkErrorOnly = consoleErrors.every(message => (
    message.includes('ERR_CONNECTION_FAILED') || message.includes('Failed to load resource')
  ))

  if (overflow390 || overflow320) throw new Error('Today layout has horizontal overflow')
  if (targetIssues390.length > 0) throw new Error(`Today controls below 44px: ${targetIssues390.join(', ')}`)
  if (!sameRetryBody) throw new Error('Retry payload changed after interrupted response')
  if (firstBody.contractVersion !== 2) throw new Error('Today did not submit completion contract v2')
  if (firstBody.performedWork?.mode !== 'as_prescribed') throw new Error('Today did not use as-prescribed completion mode')
  if (firstBody.observations?.length !== 2) throw new Error('Today did not submit readiness plus scheduled measurement')
  if (!expectedNetworkErrorOnly) throw new Error(`Unexpected console errors: ${consoleErrors.join(' | ')}`)

  return {
    viewportChecks: { overflow390, overflow320, targetIssues390, focusedReadiness },
    retry: {
      requests: requestBodies.length,
      exactPayloadReused: sameRetryBody,
      idempotencyKey: firstBody.idempotencyKey,
      contractVersion: firstBody.contractVersion
    },
    evidence: {
      observationCount: firstBody.observations.length,
      metricIds: firstBody.observations.map(item => item.metric.metricId),
      performedWorkMode: firstBody.performedWork.mode
    },
    terminal: { workoutId },
    consoleErrors
  }
}
