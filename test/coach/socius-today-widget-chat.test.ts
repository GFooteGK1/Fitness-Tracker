// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'

const date = '2026-11-20'
const readAt = '2026-11-20T11:40:00.000Z'

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget({
  supportsMessages = true, supportsDraft = true, draftFailure = '', clipboardDenied = false, writesEnabled = true,
} = {}) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  const host = child.parent
  const documentInWidget = child.document
  const requests: HostRequest[] = []
  const writeText = vi.fn(async (_text: string) => {
    if (clipboardDenied) throw new Error('Clipboard blocked by host')
  })
  Object.defineProperty(child.navigator, 'clipboard', { value: { writeText } })
  let mealCount = 0

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    let error: { code: number; message: string } | undefined
    if (request.method === 'ui/initialize') {
      result = { hostCapabilities: {
        ...(supportsMessages ? { message: { text: {} } } : {}),
        experimental: supportsDraft ? { 'openai/message': {} } : {},
      } }
    } else if (request.method === 'ui/message') {
      if (draftFailure === 'rpc') error = { code: -32601, message: 'Draft unavailable' }
      else result = { isError: draftFailure === 'result' }
    } else if (request.params?.name === 'open_socius_today') {
      result = { _meta: {
        today: { date, readAt, sessions: [], recentWork: [], recovery: { status: 'unavailable' } },
        activityEnabled: true,
        nutritionEnabled: true,
        nutritionWritesEnabled: writesEnabled,
      } }
    } else if (request.params?.name === 'show_socius_activity') {
      result = { _meta: { activity: {
        ...(request.params.arguments as object),
        workouts: { status: 'no_records', entries: [] },
        meals: { status: 'no_records', entries: [] },
      } } }
    } else if (request.params?.name === 'read_socius_nutrition') {
      result = { _meta: { nutrition: {
        date, readAt, timezone: 'UTC', mealCount,
        mealStatus: mealCount ? 'available' : 'no_records', targetStatus: 'not_configured',
        totals: { protein: mealCount * 30, carbs: 0, fat: 0, calories: mealCount * 120 },
      } } }
    }
    child.dispatchEvent(new MessageEvent('message', {
      source: host, data: { jsonrpc: '2.0', id: request.id, ...(error ? { error } : { result }) },
    }))
  })

  documentInWidget.open()
  documentInWidget.write(sociusTodayHtml)
  documentInWidget.close()

  return {
    element: (id: string) => documentInWidget.getElementById(id)!,
    chatRequests: () => requests.filter(item => item.method === 'ui/message'),
    nutritionRequests: () => requests.filter(item => item.params?.name === 'read_socius_nutrition'),
    writeText,
    setMealCount: (count: number) => { mealCount = count },
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('SociusFit Today widget chat and logging', () => {
  it('prepares review and logging drafts in the active composer with explicit send', async () => {
    const { element, chatRequests } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('workout-log-area').hidden).toBe(false)
    element('ask').click()
    element('workout-log').click()
    element('show-activity').click()
    await vi.waitFor(() => expect(element('activity-ask').hidden).toBe(false))
    element('activity-ask').click()
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-log-area').hidden).toBe(false))
    element('nutrition-log').click()

    expect(chatRequests().map(({ params }) => params)).toEqual([
      'Keep this read-only', 'log a workout I completed', 'for 2026-11-19', 'log food I ate',
    ].map(text => ({
      role: 'user',
      content: [{ type: 'text', text: expect.stringContaining(text) }],
      _meta: { 'openai/message': { target: 'active', send: false } },
    })))
    await vi.waitFor(() => expect(element('chat-status').textContent).toMatch(/check the ChatGPT composer/i))
    expect(element('copy-prompt').hidden).toBe(false)
    expect(element('chat-prompt').previousElementSibling).toBe(element('nutrition-log'))
    expect(element('nutrition-content').hidden).toBe(false)
  })

  it.each([
    { supportsDraft: false, requests: 0 },
    { draftFailure: 'result', requests: 1 },
    { draftFailure: 'rpc', requests: 1 },
  ])('keeps the exact prompt copyable when a draft cannot be set ($requests requests)', async options => {
    const { element, chatRequests, writeText } = mountWidget(options)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    element('ask').click()
    await vi.waitFor(() => expect(element('chat-status').textContent).toContain('Paste the prompt into ChatGPT'))
    const prompt = element('chat-prompt-text') as HTMLTextAreaElement
    expect(prompt.hidden).toBe(false)
    expect(prompt.readOnly).toBe(true)
    expect(prompt.value).toContain('Review my workout recommendation for today')
    element('copy-prompt').click()
    expect(writeText).toHaveBeenCalledWith(prompt.value)
    await vi.waitFor(() => expect(element('copy-status').textContent).toContain('Prompt copied'))
    expect(chatRequests()).toHaveLength(options.requests)
    expect(element('today-content').hidden).toBe(false)
  })

  it('keeps the date-specific prompt selectable without host messaging or clipboard access', async () => {
    const { element, chatRequests } = mountWidget({ supportsMessages: false, clipboardDenied: true })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    element('show-activity').click()
    await vi.waitFor(() => expect(element('activity-ask').hidden).toBe(false))
    element('activity-ask').click()
    const prompt = element('chat-prompt-text') as HTMLTextAreaElement
    expect(prompt.value).toContain('2026-11-19')
    expect(prompt.value).toContain('Keep this read-only.')
    element('copy-prompt').click()
    await vi.waitFor(() => expect(element('copy-status').textContent).toContain('Copy command'))
    expect(prompt.ownerDocument.activeElement).toBe(prompt)
    expect(prompt.selectionStart).toBe(0)
    expect(prompt.selectionEnd).toBe(prompt.value.length)
    expect(chatRequests()).toHaveLength(0)
    element('previous-day').click()
    expect(element('chat-prompt').hidden).toBe(true)
    await vi.waitFor(() => expect(element('activity-ask').hidden).toBe(false))
    element('activity-ask').click()
    expect(prompt.value).toContain('2026-11-18')
  })

  it('re-reads saved nutrition totals without offering logs on a read-only connection', async () => {
    const { element, chatRequests, nutritionRequests, setMealCount } = mountWidget({ writesEnabled: false })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('workout-log-area').hidden).toBe(true)
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-refresh').hidden).toBe(false))
    expect(element('nutrition-log-area').hidden).toBe(true)
    expect(element('nutrition-meal-count').textContent).toBe('0 saved meals')

    setMealCount(1)
    element('nutrition-refresh').click()
    await vi.waitFor(() => expect(element('nutrition-meal-count').textContent).toBe('1 saved meal'))
    expect(element('nutrition-progress').textContent).toContain('30 g logged')
    expect(nutritionRequests()).toHaveLength(2)
    expect(chatRequests()).toHaveLength(0)
  })
})
