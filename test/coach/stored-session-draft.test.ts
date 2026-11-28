import { describe, expect, it } from 'vitest'
import { readStoredSessionDraft } from '../../app/lib/coach/session-draft-tools'

const date = '2026-11-27'
const safetyBinding = 'saved-test-binding'
const draft = {
  date, dayType: 'rest', daySchedule: 'scheduled_rest', planUse: 'follow', historyComplete: true,
  title: 'Rest day', goal: 'Recover between training sessions', objective: 'Recover for planned training',
  weekReview: 'Two prior workouts are available', checkInAdjustment: 'Keep the scheduled rest day',
  rationale: 'Preserve recovery', scaleWhen: 'Stay at rest', stopWhen: 'Stop if symptoms increase',
  sourceDates: ['2026-11-25'], warmUp: [], mainWork: [], supportingWork: [], cooldown: [],
}
const legacy = { date, safetyBinding, draft }
const revision = '10000000-0000-4000-8000-000000000001'
const editFeedback = [{ text: 'Keep it a full rest day.', recordedAt: '2026-11-27T18:00:00.000Z', draftRevision: revision, previousDraftRevision: null }]

describe('stored Today session compatibility', () => {
  it('reads legacy and versioned envelopes without including the private metadata in the display', () => {
    for (const stored of [legacy, { ...legacy, revision, editFeedback }]) {
      expect(readStoredSessionDraft(stored, date, safetyBinding)).toEqual({ status: 'saved', draft })
      expect(readStoredSessionDraft(stored, date, 'new-safety-binding')).toEqual({ status: 'missing' })
    }
  })

  it('refuses unknown or invalid metadata', () => {
    for (const stored of [
      { ...legacy, unknown: true },
      { ...legacy, revision: 'invalid', editFeedback },
      { ...legacy, revision, editFeedback: [{ ...editFeedback[0], text: ' '.repeat(10) }] },
    ]) expect(readStoredSessionDraft(stored, date, safetyBinding)).toEqual({ status: 'unavailable' })
  })
})
