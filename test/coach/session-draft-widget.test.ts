// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionDraftHtml } from '../../app/lib/coach/session-draft-app-ui'

const draft = {
  date: '2026-11-21', title: 'Lower-body strength', objective: 'Build strength with controlled reps.', planUse: 'follow',
  goal: 'Build lower-body strength', weekReview: 'Two strength sessions per week are recorded.',
  checkInAdjustment: 'Keep a few reps in reserve today.', rationale: 'Continue the squat progression.',
  warmUp: [{ activity: 'Easy bike', dose: '5 min', effort: 'Easy', rest: 'As needed' }],
  mainWork: [{ activity: 'Front squat', dose: '3 sets of 5', effort: '3 reps in reserve', rest: '2 min' }],
  supportingWork: [], cooldown: [], scaleWhen: 'Reduce load if the warm-up feels harder than usual.',
  stopWhen: 'Stop for sharp or increasing pain.', sourceDates: ['2026-11-14', '2026-11-18'], historyComplete: true,
}

function mountDraft() {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const child = frame.contentWindow!
  const browser = child.parent
  const widget = child.document

  function deliver(result: unknown, source = browser) {
    child.dispatchEvent(new MessageEvent('message', {
      source, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result },
    }))
  }

  const post = vi.spyOn(browser, 'postMessage').mockImplementation((request: { id?: number; method: string }) => {
    if (request.method === 'ui/initialize') {
      child.dispatchEvent(new MessageEvent('message', {
        source: browser, data: { jsonrpc: '2.0', id: request.id, result: { hostContext: { theme: 'light' } } },
      }))
    }
  })
  widget.open()
  widget.write(sessionDraftHtml)
  widget.close()
  return { widget, child, deliver, post, element: (id: string) => widget.getElementById(id)! }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('SociusFit inline session draft', () => {
  it('renders the validated projection in workout order and supports adjustment in chat', () => {
    const { widget, element, deliver, post } = mountDraft()
    deliver({ _meta: { sessionDraft: draft } })

    expect(element('session-draft').hidden).toBe(false)
    expect(element('draft-status').hidden).toBe(true)
    expect(element('draft-title').textContent).toBe(draft.title)
    expect(element('plan-basis').textContent).toBe('Based on the accepted session')
    expect(element('draft-date').getAttribute('datetime')).toBe(draft.date)
    expect(element('check-in-adjustment').textContent).toBe(draft.checkInAdjustment)
    expect(widget.querySelectorAll('.phase h2')).toHaveLength(2)
    expect([...widget.querySelectorAll('.phase h3')].map(heading => heading.textContent)).toEqual(['Easy bike', 'Front squat'])
    expect([...widget.querySelectorAll('.phase dd')].map(value => value.textContent)).toContain('2 min')
    expect(element('draft-scale').textContent).toBe(draft.scaleWhen)
    expect(element('draft-stop').textContent).toBe(draft.stopWhen)
    expect(element('history-note').hidden).toBe(true)
    expect(element('draft-review').textContent).toBe(draft.weekReview)
    expect(element('source-dates').textContent).toContain('2026')
    expect(element('edit-hint').textContent).toBe('Ask in chat to adjust this draft.')
    expect(post.mock.calls.map(([message]) => message.method)).not.toContain('tools/call')
  })

  it('requires validated metadata from the host and renders submitted strings as plain text', () => {
    const { widget, child, element, deliver } = mountDraft()
    deliver({ _meta: { sessionDraft: draft } }, child)
    expect(element('session-draft').hidden).toBe(true)
    deliver({ structuredContent: { sessionDraft: draft } })
    expect(element('session-draft').hidden).toBe(true)
    expect(element('draft-status').textContent).toBe('Session draft is unavailable.')

    const title = '<img src=x onerror=alert(1)>Workout'
    deliver({ _meta: { sessionDraft: { ...draft, title, planUse: 'adjust', historyComplete: false, sourceDates: [] } } })
    expect(element('session-draft').hidden).toBe(false)
    expect(element('draft-title').textContent).toBe(title)
    expect(element('plan-basis').textContent).toBe('Proposed adjustment to the accepted session')
    expect(widget.querySelector('img')).toBeNull()
    expect(element('history-note').hidden).toBe(false)
    expect(element('source-dates-label').hidden).toBe(true)

    deliver({ _meta: { sessionDraft: { ...draft, planUse: 'approved' } } })
    expect(element('session-draft').hidden).toBe(true)
    expect(element('draft-status').hidden).toBe(false)

    deliver({ _meta: { sessionDraft: { ...draft, planUse: 'new' } } })
    expect(element('session-draft').hidden).toBe(false)
    expect(element('plan-basis').textContent).toBe('New session')

    deliver({ _meta: { sessionDraft: { ...draft, mainWork: [] } } })
    expect(element('session-draft').hidden).toBe(true)
  })

  it('renders a scheduled rest draft without exercise phases and allows light recovery detail', () => {
    const { widget, element, deliver } = mountDraft()
    const rest = { ...draft, title: 'Keep the scheduled rest day', objective: 'Recover for the next planned session.',
      dayType: 'rest', daySchedule: 'scheduled_rest', warmUp: [], mainWork: [] }
    deliver({ _meta: { sessionDraft: rest } })
    expect(element('session-draft').hidden).toBe(false)
    expect(element('draft-kind').textContent).toBe('Rest day draft')
    expect(element('plan-basis').textContent).toBe('Scheduled rest day')
    expect(element('scale-title').textContent).toBe('When to reassess')
    expect(widget.querySelectorAll('.phase')).toHaveLength(0)

    deliver({ _meta: { sessionDraft: { ...rest, mainWork: draft.mainWork } } })
    expect(element('session-draft').hidden).toBe(true)

    const walk = { activity: 'Easy walk', dose: '10 min', effort: 'Comfortable', rest: 'As needed' }
    deliver({ _meta: { sessionDraft: { ...rest, dayType: 'recovery', mainWork: [walk] } } })
    expect(element('session-draft').hidden).toBe(false)
    expect(element('draft-kind').textContent).toBe('Recovery draft')
    expect(widget.querySelector('.phase h3')?.textContent).toBe('Easy walk')
  })
})
