// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'
import type { projectTodayRecovery } from '../../app/lib/coach/recovery-today-app'
import type { TodayWorkoutRecommendation } from '../../app/lib/coach/today-workout-recommendation'

const date = '2026-11-20'
const readAt = '2026-11-20T11:40:00.000Z'
const draftAcknowledgement = 'Draft requested. If no draft appears, ask “Draft today’s session” in SociusFit chat.'
const retiredControls = ['ask', 'activity-ask', 'workout-log', 'chat-prompt', 'copy-prompt', 'meal-chat-copy',
  'recommendation-result', 'recommendation-title', 'saved-guidance-title']

const lastWorkout = {
  status: 'available',
  date: '2026-11-19',
  timing: 'date_only',
  sessionRpe: 7,
  movements: [
    { name: 'Easy cycle', measurements: ['5 min'], phase: 'warmup' },
    { name: 'Front squat', measurements: ['3 sets × 5 reps'] },
  ],
}
const recovery = { status: 'saved', recoveryScore: 79, sleepPerformance: 82, strainScore: 6 } as const
const initialRecommendation: TodayWorkoutRecommendation = {
  status: 'recommended', source: 'saved_recommendation', title: 'Keep today easy',
  reason: 'Your saved review calls for recovery.',
  sessions: [{ title: 'Aerobic session', focus: 'Easy pace', status: 'planned', details: ['Bike · 20 min'] }],
}

const usualCheckIn = { stress: 3, fatigue: 3, sleep: 3, soreness: 3, motivation: 3 }
const harderCheckIn = { stress: 5, fatigue: 1, sleep: 2, soreness: 1, motivation: 2 }
const relativeCheckIn = { stress: 'lower', fatigue: 'higher', sleep: 'worse', soreness: 'usual', motivation: 'higher' }
type CheckIn = typeof usualCheckIn
const checkInFields = Object.keys(usualCheckIn) as Array<keyof CheckIn>

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget(workoutRecommendation = initialRecommendation, browserClock?: DateConstructor, options: {
  savedCheckIn?: CheckIn
  savedRelativeCheckIn?: typeof relativeCheckIn
  oldServer?: boolean
  checkInEnabled?: boolean
  nutritionWritesEnabled?: boolean
  supportsDraft?: boolean
  supportsActiveChat?: boolean
  draftResponse?: 'reject' | 'error_result' | 'uncertain'
  hostContext?: Record<string, unknown>
} = {}) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  if (browserClock) Object.defineProperty(child, 'Date', { value: browserClock })
  const host = child.parent
  const widget = child.document
  const requests: HostRequest[] = []
  let mealCount = 0
  const savedCheckIns = new Map<string, CheckIn>()
  if (options.savedCheckIn) savedCheckIns.set(date, options.savedCheckIn)
  let nextSaveReceipt: 'lost' | 'wrong_date' | 'wrong_values' | 'transport_rejection' | 'invalid_params' | 'not_saved' | undefined
  let nextReadError = false
  let todayDate = date
  let todayRecovery: Partial<ReturnType<typeof projectTodayRecovery>> = recovery
  let holdNextToday = false
  let respondToHeldToday: (() => void) | undefined
  let holdNextSave = false
  let respondToHeldSave: (() => void) | undefined
  let holdNextDraft = false
  const heldDraftResponses: Array<() => void> = []

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    let error: { code: number; message: string } | undefined
    if (request.method === 'ui/initialize') {
      const supportsActiveChat = options.supportsActiveChat ?? !options.supportsDraft
      result = {
        hostContext: options.hostContext,
        hostCapabilities: {
          ...(options.supportsDraft ? { message: { text: {} } } : {}),
          ...(supportsActiveChat ? { experimental: { 'openai/message': {} } } : {}),
        },
      }
    } else if (request.method === 'ui/message') {
      if (options.draftResponse === 'reject') error = { code: -32000, message: 'Message sending denied' }
      else if (options.draftResponse === 'error_result') result = { isError: true }
      else result = options.draftResponse === 'uncertain' ? null : {}
    } else if (request.params?.name === 'open_socius_today') {
      const checkIn = savedCheckIns.get(todayDate)
      const legacy = todayDate === date && options.savedRelativeCheckIn
        ? { status: 'saved', checkIn: options.savedRelativeCheckIn } : { status: 'missing' }
      const assessment = checkIn ? { status: 'saved', scale: '1-to-5', checkIn }
        : legacy.status === 'saved' ? { ...legacy, scale: 'relative-to-usual' } : legacy
      if (nextReadError) {
        nextReadError = false
        result = { isError: true }
      } else {
        result = { _meta: {
          today: {
            date: todayDate, readAt, workoutRecommendation, sessions: workoutRecommendation.sessions,
            recentWork: [], lastWorkout, recovery: todayRecovery,
            ...(options.oldServer ? { checkIn: legacy } : { assessment }),
          },
          activityEnabled: true,
          nutritionEnabled: true,
          ...(options.nutritionWritesEnabled ? { nutritionWritesEnabled: true } : {}),
          checkInEnabled: options.checkInEnabled ?? true,
        } }
      }
    } else if (request.params?.name === 'save_socius_today_check_in') {
      const { date: savedDate, checkIn } = request.params.arguments as { date: string; checkIn: CheckIn }
      if (nextSaveReceipt !== 'invalid_params' && nextSaveReceipt !== 'not_saved') savedCheckIns.set(savedDate, checkIn)
      if (nextSaveReceipt === 'invalid_params') {
        error = { code: -32602, message: 'Tool arguments do not match the installed schema' }
      } else if (nextSaveReceipt === 'transport_rejection') {
        error = { code: -32000, message: 'Host could not deliver the save receipt' }
      } else {
        result = nextSaveReceipt === 'lost' || nextSaveReceipt === 'not_saved' ? { isError: true } : { _meta: { savedCheckIn: {
          date: nextSaveReceipt === 'wrong_date' ? '2026-11-19' : savedDate,
          checkIn: nextSaveReceipt === 'wrong_values' ? usualCheckIn : checkIn,
        } } }
      }
      nextSaveReceipt = undefined
    } else if (request.params?.name === 'show_socius_activity') {
      const selected = request.params.arguments as { date: string; timezone: string }
      const entries = selected.date === '2026-11-07'
        ? [{ label: 'Saved workout', revision: 2, details: ['Dumbbell row · 3 sets'] }] : []
      result = { _meta: { activity: {
        ...selected,
        workouts: { status: entries.length ? 'available' : 'no_records', entries },
        meals: { status: 'available', entries: [{ label: 'Logged lunch', revision: 1, details: ['Turkey sandwich'] }] },
      } } }
    } else if (request.params?.name === 'read_socius_nutrition') {
      result = { _meta: { nutrition: {
        date, readAt, timezone: 'UTC', mealCount,
        mealStatus: mealCount ? 'available' : 'no_records', targetStatus: 'not_configured',
        totals: { protein: mealCount * 30, carbs: 0, fat: 0, calories: mealCount * 120 },
      } } }
    }
    const respond = () => child.dispatchEvent(new MessageEvent('message', {
      source: host, data: { jsonrpc: '2.0', id: request.id, ...(error ? { error } : { result }) },
    }))
    if (holdNextToday && request.params?.name === 'open_socius_today') {
      holdNextToday = false
      respondToHeldToday = respond
    } else if (holdNextSave && request.params?.name === 'save_socius_today_check_in') {
      holdNextSave = false
      respondToHeldSave = respond
    } else if (holdNextDraft && request.method === 'ui/message') {
      holdNextDraft = false
      heldDraftResponses.push(respond)
    } else respond()
  })

  widget.open()
  widget.write(sociusTodayHtml)
  widget.close()

  return {
    widget,
    element: (id: string) => widget.getElementById(id)!,
    requests,
    updateHostContext: (params: Record<string, unknown>, source = host) => {
      child.dispatchEvent(new MessageEvent('message', {
        source, data: { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params },
      }))
    },
    setMealCount: (count: number) => { mealCount = count },
    setTodayDate: (value: string) => { todayDate = value },
    setSavedCheckIn: (checkIn: CheckIn) => { savedCheckIns.set(todayDate, checkIn) },
    setRecovery: (values: Partial<ReturnType<typeof projectTodayRecovery>>) => { todayRecovery = { ...recovery, ...values } },
    holdNextToday: () => { holdNextToday = true },
    releaseHeldToday: () => { respondToHeldToday?.() },
    holdNextSave: () => { holdNextSave = true },
    releaseHeldSave: () => { respondToHeldSave?.() },
    holdNextDraft: () => { holdNextDraft = true },
    releaseHeldDraft: () => { heldDraftResponses.shift()?.() },
    setNextSaveReceipt: (mode: typeof nextSaveReceipt) => { nextSaveReceipt = mode },
    failNextRead: () => { nextReadError = true },
  }
}

function todayClock() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 14))
  return Date
}

function choose(control: HTMLSelectElement, value: string) {
  control.value = value
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillCheckIn(element: (id: string) => HTMLElement, values: CheckIn) {
  for (const field of checkInFields) choose(element('check-in-' + field) as HTMLSelectElement, String(values[field]))
}

function checkInValues(element: (id: string) => HTMLElement) {
  return checkInFields.map(field => {
    const value = (element('check-in-' + field) as HTMLSelectElement).value
    return value === '' ? null : Number(value)
  })
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SociusFit dashboard', () => {
  it('applies the host safe area and keeps it across unrelated context changes', async () => {
    const { element, widget, updateHostContext } = mountWidget(initialRecommendation, undefined, {
      hostContext: { theme: 'dark', platform: 'mobile', safeAreaInsets: { top: 30, bottom: 150 } },
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const { dataset, style } = widget.documentElement
    expect(dataset.hostPlatform).toBe('mobile')
    expect(style.getPropertyValue('--host-safe-top')).toBe('30px')
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('150px')

    updateHostContext({ theme: 'light' })
    expect(dataset.theme).toBe('light')
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('150px')

    updateHostContext({ safeAreaInsets: { bottom: 0, top: -1, left: '20px' } })
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('0px')
    expect(style.getPropertyValue('--host-safe-top')).toBe('30px')
    expect(style.getPropertyValue('--host-safe-left')).toBe('')

    updateHostContext({ safeAreaInsets: { bottom: 180 } }, widget.defaultView!)
    expect(style.getPropertyValue('--host-safe-bottom')).toBe('0px')
  })

  it('orders today’s training, WHOOP, and collapsed last workout', async () => {
    const { element } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const panels = Array.from(element('today-content').children)
    expect(panels[0].contains(element('check-in-form'))).toBe(true)
    expect(panels[1].contains(element('whoop-gauges'))).toBe(true)
    expect(panels[2]).toBe(element('last-workout'))
    expect(element('recovery-percent').textContent).toBe('79%')
    expect(element('sessions-title').textContent).toBe('Today’s training')
    expect(element('check-in-next').hidden).toBe(true)
    expect(element('check-in-instructions').textContent).toBe('Rate each from 1 (worst) to 5 (best).')
    const strain = ['1 · Very high', '2 · High', '3 · Moderate', '4 · Low', '5 · Very low']
    const ratingLabels = {
      stress: strain, fatigue: strain, soreness: strain,
      sleep: ['1 · Very poor', '2 · Poor', '3 · Fair', '4 · Good', '5 · Very good'],
      motivation: ['1 · Very low', '2 · Low', '3 · Moderate', '4 · High', '5 · Very high'],
    }
    for (const field of checkInFields) {
      const select = element('check-in-' + field) as HTMLSelectElement
      expect(select.required).toBe(true)
      expect(select.value).toBe('')
      expect(Array.from(select.options).map(option => option.value)).toEqual(['', '1', '2', '3', '4', '5'])
      expect(Array.from(select.options).slice(1).map(option => option.textContent)).toEqual(ratingLabels[field])
    }
    const acceptedPlan = element('accepted-plan-details') as HTMLDetailsElement
    expect(acceptedPlan.open).toBe(false)
    expect(acceptedPlan.textContent).toContain('Bike · 20 min')
    expect(element('saved-review').hidden).toBe(true)
    expect(acceptedPlan.querySelector('summary')?.textContent).toBe('Accepted plan for today')
    expect(acceptedPlan.textContent).not.toContain('Keep today easy')

    const workout = element('last-workout') as HTMLDetailsElement
    const summary = workout.querySelector<HTMLElement>(':scope > summary')!
    expect(summary.textContent).toContain('Last workout logged')
    expect(summary.contains(element('recent'))).toBe(false)
    expect(workout.open).toBe(false)
    summary.click()
    expect(workout.open).toBe(true)
    expect(element('workout-rpe').textContent).toContain('7 / 10')
    expect(element('recent-warmup').textContent).toContain('Easy cycle')
    expect(element('recent').textContent).toContain('Front squat')
    summary.click()
    expect(workout.open).toBe(false)
  })

  it('shows a safety review above the check-in and suppresses the draft prompt', async () => {
    const { element, requests } = mountWidget({
      status: 'recommended', source: 'saved_recommendation', title: 'Review your training before starting',
      reason: 'Your recent logs need a review.', reviewBeforeTraining: true, sessions: [],
    }, todayClock(), { savedCheckIn: usualCheckIn, supportsDraft: true })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const review = element('saved-review')
    expect(review.hidden).toBe(false)
    expect(review.compareDocumentPosition(element('check-in-form'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(element('saved-review-title').textContent).toBe('Review your training before starting')
    expect(element('saved-review-reason').textContent).toBe('Your recent logs need a review.')
    expect(element('check-in-next').hidden).toBe(true)
    expect(element('accepted-plan-details').hidden).toBe(true)
    expect(element('check-in-submit').textContent).toBe('Save check-in')
    fillCheckIn(element, harderCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('check-in-status').textContent).toBe('Check-in saved for today.'))
    expect(element('check-in-next').hidden).toBe(true)
    expect(review.hidden).toBe(false)
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it('saves once and shows the manual chat prompt on a host without standard text messaging', async () => {
    const { widget, element, requests } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const form = element('check-in-form') as HTMLFormElement
    const button = element('check-in-submit') as HTMLButtonElement
    expect(button.textContent).toBe('Save check-in')
    button.click()
    expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in')).toHaveLength(0)
    fillCheckIn(element, harderCheckIn)
    expect(form.checkValidity()).toBe(true)
    button.click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    expect(element('check-in-next').textContent).toBe('Ask “Draft today’s session” in SociusFit chat.')
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    expect(widget.activeElement).toBe(element('check-in-next'))
    expect(button.disabled).toBe(true)
    button.click()
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params)).toEqual([
      { name: 'open_socius_today', arguments: { tzOffset: expect.any(Number) } },
      { name: 'save_socius_today_check_in', arguments: { date, tzOffset: expect.any(Number), checkIn: harderCheckIn } },
    ])
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
    fillCheckIn(element, usualCheckIn)
    expect(element('check-in-next').hidden).toBe(true)
    expect(button.disabled).toBe(false)
  })

  it('sends one standard chat message after an exact save and never claims the draft is ready', async () => {
    const browserClock = todayClock()
    const tzOffset = new browserClock().getTimezoneOffset()
    const { element, requests, holdNextSave, releaseHeldSave } = mountWidget(initialRecommendation, browserClock, {
      supportsDraft: true,
    })
    const relevant = () => requests.filter(request => request.method === 'tools/call' || request.method === 'ui/message')
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    const button = element('check-in-submit') as HTMLButtonElement
    expect(button.textContent).toBe('Save check-in & draft session')
    holdNextSave()
    button.click()
    button.click()
    expect(relevant().map(request => request.params?.name)).toEqual(['open_socius_today', 'save_socius_today_check_in'])
    releaseHeldSave()
    await vi.waitFor(() => expect(element('draft-request-status').textContent)
      .toBe(draftAcknowledgement))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    expect(element('draft-manual').hidden).toBe(true)
    expect(button.disabled).toBe(true)
    button.click()
    expect(relevant().map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'tools/call', params: { name: 'open_socius_today', arguments: { tzOffset } } },
      { method: 'tools/call', params: {
        name: 'save_socius_today_check_in', arguments: { date, tzOffset, checkIn: harderCheckIn },
      } },
      { method: 'ui/message', params: { role: 'user', content: [{
        type: 'text',
        text: 'Draft today’s session. Use expectedLocalDate ' + date + ' and browser tzOffset ' + tzOffset + ' minutes (JavaScript getTimezoneOffset).',
      }] } },
    ])
  })

  it('keeps the save-and-draft action disabled until the pending draft request settles', async () => {
    const { element, requests, holdNextDraft, releaseHeldDraft } = mountWidget(initialRecommendation, todayClock(), {
      supportsDraft: true,
    })
    const saves = () => requests.filter(request => request.params?.name === 'save_socius_today_check_in')
    const drafts = () => requests.filter(request => request.method === 'ui/message')
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const button = element('check-in-submit') as HTMLButtonElement
    holdNextDraft()
    fillCheckIn(element, harderCheckIn)
    button.click()
    await vi.waitFor(() => expect(drafts()).toHaveLength(1))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    fillCheckIn(element, usualCheckIn)
    expect(button.textContent).toBe('Save check-in & draft session')
    expect(button.disabled).toBe(true)
    button.click()
    expect(saves()).toHaveLength(1)

    releaseHeldDraft()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))
    button.click()
    await vi.waitFor(() => expect(element('draft-request-status').textContent).toBe(draftAcknowledgement))
    expect(drafts()).toHaveLength(2)
    expect(saves().map(request => (request.params?.arguments as { checkIn: CheckIn }).checkIn))
      .toEqual([harderCheckIn, usualCheckIn])
  })

  it('lets a new local day submit while yesterday’s draft acknowledgement is pending', async () => {
    const {
      widget, element, requests, holdNextDraft, releaseHeldDraft, setTodayDate,
    } = mountWidget(initialRecommendation, todayClock(), { supportsDraft: true })
    const drafts = () => requests.filter(request => request.method === 'ui/message')
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const button = element('check-in-submit') as HTMLButtonElement
    holdNextDraft()
    fillCheckIn(element, harderCheckIn)
    button.click()
    await vi.waitFor(() => expect(drafts()).toHaveLength(1))

    vi.setSystemTime(new Date(2026, 10, 21, 0, 1))
    setTodayDate('2026-11-21')
    widget.defaultView!.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(element('today-date').getAttribute('datetime')).toBe('2026-11-21'))
    expect(checkInValues(element)).toEqual(checkInFields.map(() => null))
    fillCheckIn(element, usualCheckIn)
    expect(button.disabled).toBe(false)
    holdNextDraft()
    button.click()
    await vi.waitFor(() => expect(drafts()).toHaveLength(2))
    fillCheckIn(element, harderCheckIn)
    expect(button.disabled).toBe(true)
    releaseHeldDraft()
    await Promise.resolve()
    expect(button.disabled).toBe(true)
    expect(element('draft-request-status').textContent).toBe('')

    releaseHeldDraft()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(drafts()).toHaveLength(2)
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
  })

  it.each(['reject', 'error_result', 'uncertain'] as const)('keeps the saved check-in and manual fallback after %s', async mode => {
    const { element, requests } = mountWidget(initialRecommendation, todayClock(), {
      supportsDraft: true, draftResponse: mode,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('draft-request-status').textContent)
      .toBe('Could not confirm the draft request. Check SociusFit chat before asking again. '))
    expect(element('draft-manual').hidden).toBe(false)
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect((element('check-in-submit') as HTMLButtonElement).disabled).toBe(true)
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(1)
  })

  it.each(['lost', 'wrong_date', 'wrong_values', 'transport_rejection'] as const)('confirms a %s receipt from saved records without another save', async (mode) => {
    const { element, requests, setNextSaveReceipt } = mountWidget(initialRecommendation, todayClock(), { supportsDraft: true })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    setNextSaveReceipt(mode)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name)).toEqual([
      'open_socius_today', 'save_socius_today_check_in', 'open_socius_today',
    ])
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(1)
    expect(requests.findLast(request => request.method === 'tools/call')?.params?.name).toBe('open_socius_today')
    expect(requests.at(-1)?.method).toBe('ui/message')
  })

  it('hydrates the saved answers and chat prompt from the first read even when writes are disabled', async () => {
    const { element, requests } = mountWidget(initialRecommendation, undefined, {
      savedCheckIn: harderCheckIn, checkInEnabled: false, supportsDraft: true,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(element('check-in-next').hidden).toBe(false)
    expect(element('check-in-status').textContent).toBe('Check-in saved for today. Editing is currently unavailable.')
    expect((element('check-in-submit') as HTMLButtonElement).disabled).toBe(true)
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name))
      .toEqual(['open_socius_today'])
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it.each([false, true])('keeps original relative answers without assigning numbers (old server: %s)', async oldServer => {
    const { element, requests } = mountWidget(initialRecommendation, undefined, {
      savedRelativeCheckIn: relativeCheckIn, oldServer,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const previous = element('check-in-relative') as HTMLDetailsElement
    expect(previous.hidden).toBe(false)
    expect(previous.open).toBe(false)
    expect(Array.from(element('check-in-relative-answers').children).map(item => item.textContent)).toEqual([
      'Stress · Lower than usual', 'Fatigue · Higher than usual', 'Sleep · Worse than usual',
      'Soreness · Usual', 'Motivation · Higher than usual',
    ])
    expect(checkInValues(element)).toEqual([null, null, null, null, null])
    expect(element('check-in-next').hidden).toBe(false)
    const button = element('check-in-submit') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    if (oldServer) {
      expect(element('check-in-status').textContent).toBe('Previous check-in saved. 1–5 ratings are currently unavailable.')
      expect((element('check-in-fields') as HTMLFieldSetElement).disabled).toBe(true)
      button.click()
      expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name))
        .toEqual(['open_socius_today'])
    } else {
      expect(element('check-in-status').textContent).toBe('Previous check-in saved. You can enter 1–5 ratings for today.')
      fillCheckIn(element, harderCheckIn)
      expect(element('check-in-next').hidden).toBe(true)
      expect(button.disabled).toBe(false)
      button.click()
      await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
      expect(previous.hidden).toBe(true)
      expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in').map(request => request.params?.arguments))
        .toEqual([{ date, tzOffset: expect.any(Number), checkIn: harderCheckIn }])
    }
  })

  it.each([false, true])('retries only the read after a lost receipt and readback failure (answers edited: %s)', async edited => {
    const { element, requests, failNextRead, setNextSaveReceipt } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    setNextSaveReceipt('lost')
    failNextRead()
    const button = element('check-in-submit') as HTMLButtonElement
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(element('check-in-status').textContent).toBe('Could not confirm the check-in was saved. Try again to check.')
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(element('check-in-next').hidden).toBe(true)
    expect(button.textContent).toBe('Check save status')

    if (edited) {
      fillCheckIn(element, usualCheckIn)
      expect(button.textContent).toBe('Check save status')
      expect(element('check-in-status').textContent).toBe('Check the previous save before submitting new answers.')
    }
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe('Save check-in'))
    expect(element('check-in-next').hidden).toBe(edited)
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name)).toEqual([
      'open_socius_today', 'save_socius_today_check_in', 'open_socius_today', 'open_socius_today',
    ])
    if (edited) {
      expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))
      expect(element('check-in-status').textContent).toBe('Your previous check-in was saved. Save again to use your edited answers.')
      button.click()
      await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
      expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in')).toHaveLength(2)
    }
  })

  it.each([false, true])('requests a draft after a later matching readback only if answers were untouched (edited: %s)', async edited => {
    const { element, requests, failNextRead, setNextSaveReceipt } = mountWidget(initialRecommendation, todayClock(), {
      supportsDraft: true,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const button = element('check-in-submit') as HTMLButtonElement
    fillCheckIn(element, harderCheckIn)
    setNextSaveReceipt('lost')
    failNextRead()
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(button.textContent).toBe('Check save status')
    if (edited) {
      fillCheckIn(element, usualCheckIn)
      fillCheckIn(element, harderCheckIn)
    }
    button.click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in')).toHaveLength(1)
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(edited ? 0 : 1)
    expect(element('draft-manual').hidden).toBe(!edited)
  })

  it.each([
    ['invalid_params', 'The SociusFit connection rejected the check-in request. Select Refresh tools in SociusFit’s ChatGPT settings, then reopen the app and try again.'],
    ['not_saved', 'Your check-in wasn’t saved. Your answers are still here. Try saving again.'],
  ] as const)('retains the answers and can save after %s', async (mode, message) => {
    const { element, requests, setNextSaveReceipt } = mountWidget(initialRecommendation, todayClock(), { supportsDraft: true })
    const saves = () => requests.filter(request => request.params?.name === 'save_socius_today_check_in')
    const drafts = () => requests.filter(request => request.method === 'ui/message')
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const checkIn = { stress: 5, fatigue: 3, sleep: 3, soreness: 5, motivation: 4 }
    fillCheckIn(element, checkIn)
    setNextSaveReceipt(mode)
    const button = element('check-in-submit') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => expect(element('check-in-status').textContent).toBe(message))
    expect(checkInValues(element)).toEqual(Object.values(checkIn))
    expect(saves()).toHaveLength(1)
    expect(drafts()).toHaveLength(0)

    button.click()
    await vi.waitFor(() => expect(element('check-in-status').textContent).toBe('Check-in saved for today.'))
    expect(saves()).toHaveLength(2)
    expect(drafts()).toHaveLength(1)
  })

  it('preserves the draft when a newer check-in is read after a lost receipt', async () => {
    const { element, requests, setNextSaveReceipt, setSavedCheckIn } = mountWidget(initialRecommendation, todayClock(), {
      supportsDraft: true,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    setNextSaveReceipt('lost')
    const button = element('check-in-submit') as HTMLButtonElement
    button.click()
    setSavedCheckIn(usualCheckIn)

    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(button.textContent).toBe('Save check-in & draft session')
    expect(element('check-in-status').textContent).toBe('The saved answers don’t match. Save again to use these answers.')
    expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in')).toHaveLength(1)
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it.each(['background', 'different_view', 'new_day'] as const)('does not ask for a draft after a late save on %s', async mode => {
    const {
      widget, element, requests, holdNextSave, releaseHeldSave, setTodayDate,
    } = mountWidget(initialRecommendation, todayClock(), { supportsDraft: true })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    holdNextSave()
    element('check-in-submit').click()
    if (mode === 'background') {
      Object.defineProperty(widget, 'visibilityState', { value: 'hidden' })
    } else if (mode === 'different_view') {
      element('show-activity').click()
    } else {
      vi.setSystemTime(new Date(2026, 10, 21, 0, 1))
      setTodayDate('2026-11-21')
    }
    releaseHeldSave()
    if (mode === 'new_day') {
      await vi.waitFor(() => expect(element('today-date').getAttribute('datetime')).toBe('2026-11-21'))
      expect(element('check-in-next').hidden).toBe(true)
    } else {
      await vi.waitFor(() => expect(element('check-in-status').textContent).toBe('Check-in saved for today.'))
      expect(element('draft-manual').hidden).toBe(false)
    }
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it('clears the previous check-in and reads the new day when the widget regains focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59))
    const { widget, element, requests, setTodayDate } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    const workout = element('last-workout') as HTMLDetailsElement
    workout.open = true

    vi.setSystemTime(new Date(2026, 10, 21, 0, 1))
    setTodayDate('2026-11-21')
    widget.defaultView!.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(element('today-date').getAttribute('datetime')).toBe('2026-11-21'))
    expect(element('today-content').hidden).toBe(false)
    expect(element('check-in-next').hidden).toBe(true)
    expect(element('check-in-status').textContent).toBe('')
    expect(checkInValues(element)).toEqual(checkInFields.map(() => null))
    expect(workout.open).toBe(false)
    expect(requests.filter(request => request.params?.name === 'open_socius_today').at(-1)?.params?.arguments)
      .toEqual({ tzOffset: expect.any(Number) })
  })

  it('refreshes only saved WHOOP data on same-day foreground and coalesces overlapping events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 14))
    const {
      widget, element, requests, setRecovery, holdNextToday, releaseHeldToday,
    } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    const workout = element('last-workout') as HTMLDetailsElement
    const workoutRows = element('recent').firstChild
    workout.open = true
    const foreground = () => widget.defaultView!.dispatchEvent(new Event('focus'))
    const todayCalls = () => requests.filter(request => request.params?.name === 'open_socius_today')

    setRecovery({
      recoveryScore: 64, sleepScoreStatus: 'stale',
      recoveryUpdatedAt: '2026-11-20T12:30:00Z',
      sleepUpdatedAt: '2026-11-19T13:30:00Z',
      strainUpdatedAt: '2026-11-20T13:30:00Z',
      lastSyncAt: '2026-11-20T14:00:00Z',
    })
    foreground()
    expect(todayCalls()).toHaveLength(1)
    holdNextToday()
    vi.setSystemTime(new Date(2026, 10, 20, 14, 1))
    foreground()
    widget.dispatchEvent(new Event('visibilitychange'))
    expect(todayCalls()).toHaveLength(2)
    expect(element('today-content').hidden).toBe(false)
    expect(element('recovery-percent').textContent).toBe('79%')
    releaseHeldToday()

    await vi.waitFor(() => expect(element('recovery-percent').textContent).toBe('64%'))
    foreground()
    expect(todayCalls()).toHaveLength(2)
    expect(element('sleep-note').hidden).toBe(false)
    expect(element('recovery-score-note').hidden).toBe(true)
    expect(Array.from(element('recovery-dates').querySelectorAll('time')).map(time => time.dateTime)).toEqual([
      '2026-11-20T12:30:00Z', '2026-11-19T13:30:00Z', '2026-11-20T13:30:00Z', '2026-11-20T14:00:00Z',
    ])
    expect(element('check-in-next').hidden).toBe(false)
    expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))
    expect(workout.open).toBe(true)
    expect(element('recent').firstChild).toBe(workoutRows)
    expect(todayCalls().at(-1)?.params?.arguments).toEqual({ tzOffset: expect.any(Number) })
  })

  it('retains the saved check-in when a foreground WHOOP refresh finishes late', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 14))
    const { widget, element, setRecovery, holdNextToday, releaseHeldToday } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    vi.setSystemTime(new Date(2026, 10, 20, 14, 1))
    setRecovery({ recoveryScore: 65 })
    holdNextToday()
    widget.defaultView!.dispatchEvent(new Event('focus'))

    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('check-in-next').hidden).toBe(false))
    releaseHeldToday()
    await vi.waitFor(() => expect(element('recovery-percent').textContent).toBe('65%'))
    expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today.')
    expect(element('check-in-next').hidden).toBe(false)
  })

  it('shows dated workouts and refreshes Nutrition without enabling meal logging for read-only access', async () => {
    const { widget, element, requests, setMealCount } = mountWidget({
      status: 'unscheduled', source: 'accepted_plan', title: 'No workout scheduled today', reason: null, sessions: [],
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('accepted-plan-details').hidden).toBe(true)
    for (const id of retiredControls) expect(widget.getElementById(id)).toBeNull()

    expect(element('show-today').textContent).toBe('Today')
    expect(element('show-activity').textContent).toBe('Training history')
    element('show-activity').click()
    await vi.waitFor(() => expect(element('activity-card').hidden).toBe(false))
    expect(element('view-title').textContent).toBe('Training history')
    const workoutDate = element('activity-date') as HTMLInputElement
    expect(widget.querySelector('label[for="activity-date"]')?.textContent?.trim()).toBe('Workout date')
    expect(workoutDate.type).toBe('date')
    expect(workoutDate.max).toBe(date)
    expect(workoutDate.value).toBe('2026-11-19')
    expect(element('activity-workouts-note').textContent).toBe('No workouts were logged for this date.')
    element('previous-day').click()
    await vi.waitFor(() => expect(element('activity-card').hidden).toBe(false))

    workoutDate.value = '2026-11-07'
    workoutDate.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(element('activity-workouts').textContent).toContain('Dumbbell row · 3 sets'))
    expect(element('activity-card-date').getAttribute('datetime')).toBe('2026-11-07')
    expect(element('activity-workouts').textContent).toContain('Revised')
    expect(widget.getElementById('activity-meals')).toBeNull()

    workoutDate.value = '2026-11-21'
    workoutDate.dispatchEvent(new Event('change', { bubbles: true }))
    expect(element('activity-load').textContent).toBe('Choose a date on or before today.')
    expect(requests.filter(request => request.params?.name === 'show_socius_activity').map(request => request.params?.arguments))
      .toMatchObject([{ date: '2026-11-19' }, { date: '2026-11-18' }, { date: '2026-11-07' }])

    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-refresh').hidden).toBe(false))
    expect(element('nutrition-log').hidden).toBe(true)
    expect(element('nutrition-meal-count').textContent).toBe('0 saved meals')
    setMealCount(1)
    element('nutrition-refresh').click()
    await vi.waitFor(() => expect(element('nutrition-meal-count').textContent).toBe('1 saved meal'))
    expect(element('nutrition-progress').textContent).toContain('30 g logged')
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it('keeps meal details across dashboard views and requests one unsent draft in the active chat', async () => {
    const { element, requests, holdNextDraft, releaseHeldDraft } = mountWidget(initialRecommendation, undefined, {
      nutritionWritesEnabled: true, supportsDraft: true, supportsActiveChat: true,
    })
    const chatRequests = () => requests.filter(request => request.method === 'ui/message')
    await vi.waitFor(() => expect(element('show-nutrition').hidden).toBe(false))
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-log').hidden).toBe(false))
    element('nutrition-log').click()

    const panel = element('meal-chat')
    const details = element('meal-chat-details') as HTMLTextAreaElement
    const openChat = element('meal-chat-open') as HTMLButtonElement
    details.value = 'A turkey sandwich for lunch.'
    details.dispatchEvent(new Event('input', { bubbles: true }))
    expect(panel.hidden).toBe(false)
    expect(chatRequests()).toHaveLength(0)

    element('show-activity').click()
    await vi.waitFor(() => expect(element('activity-card').hidden).toBe(false))
    expect(panel.closest('[hidden]')).toBeNull()
    element('show-today').click()
    expect(panel.closest('[hidden]')).toBeNull()
    expect(details.value).toBe('A turkey sandwich for lunch.')

    holdNextDraft()
    openChat.click()
    openChat.click()
    expect(chatRequests()).toHaveLength(1)
    expect(chatRequests()[0].params).toEqual({
      role: 'user',
      content: [{ type: 'text', text: expect.stringMatching(/^I want to log food I ate\.[\s\S]*A turkey sandwich for lunch\./) }],
      _meta: { 'openai/message': { target: 'active', send: false } },
    })
    releaseHeldDraft()
    await vi.waitFor(() => expect(element('meal-chat-status').textContent).toMatch(/review, edit, and send/i))
    expect(details.readOnly).toBe(true)
    details.dispatchEvent(new Event('input', { bubbles: true }))
    openChat.click()
    expect(chatRequests()).toHaveLength(1)
    expect(panel.closest('[hidden]')).toBeNull()
    expect(requests.some(request => request.params?.name === 'create_meal')).toBe(false)
  })

  it.each([
    { mode: 'no chat capability', supportsDraft: false, supportsActiveChat: false, requests: 0 },
    { mode: 'standard text support only', supportsDraft: true, supportsActiveChat: false, requests: 0 },
    { mode: 'active routing support only', supportsDraft: false, supportsActiveChat: true, requests: 0 },
    { mode: 'host rejection', supportsDraft: true, supportsActiveChat: true, requests: 1 },
  ])('preserves the meal details and points to chat for $mode', async ({ supportsDraft, supportsActiveChat, requests: expectedRequests }) => {
    const { element, requests } = mountWidget(initialRecommendation, undefined, {
      nutritionWritesEnabled: true, supportsDraft, supportsActiveChat, draftResponse: 'reject',
    })
    await vi.waitFor(() => expect(element('show-nutrition').hidden).toBe(false))
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-log').hidden).toBe(false))
    element('nutrition-log').click()
    const details = element('meal-chat-details') as HTMLTextAreaElement
    details.value = 'One bowl of oatmeal.'
    details.dispatchEvent(new Event('input', { bubbles: true }))
    element('meal-chat-open').click()

    await vi.waitFor(() => expect(element('meal-chat-status').textContent).toMatch(/log the meal directly/i))
    expect(element('meal-chat').closest('[hidden]')).toBeNull()
    expect(details.value).toBe('One bowl of oatmeal.')
    expect(details.readOnly).toBe(expectedRequests === 1)
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(expectedRequests)
    expect(requests.some(request => request.params?.name === 'create_meal')).toBe(false)

    element('meal-chat-close').click()
    expect(element('meal-chat').hidden).toBe(true)
    element('nutrition-log').click()
    expect(details.value).toBe('')
  })
})
