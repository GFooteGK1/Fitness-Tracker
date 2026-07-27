import { describe, expect, it } from 'vitest'
import {
  COACH_REFERENCE_MANIFEST,
  getCoachReference
} from '@/app/lib/coach/reference'

describe('coach reference manifest', () => {
  it('publishes the complete versioned twelve-domain doctrine', () => {
    expect(COACH_REFERENCE_MANIFEST.doctrineVersion).toBe('0.1.0')
    expect(COACH_REFERENCE_MANIFEST.schemaVersion).toBe(1)
    expect(COACH_REFERENCE_MANIFEST.domains).toHaveLength(12)
    expect(new Set(COACH_REFERENCE_MANIFEST.domains.map(domain => domain.id)).size).toBe(12)
    expect(COACH_REFERENCE_MANIFEST.domains.map(domain => domain.id)).toEqual([
      'assessment',
      'strength',
      'hypertrophy',
      'power_explosiveness',
      'speed_agility',
      'aerobic',
      'anaerobic',
      'nutrition',
      'resilience',
      'recovery',
      'movement_skill',
      'adherence'
    ])
  })

  it('returns only valid requested domains and removes duplicates', () => {
    const reference = getCoachReference([
      'strength',
      'not-a-domain',
      'hypertrophy',
      'strength'
    ])

    expect(reference.domainIndex).toHaveLength(12)
    expect(reference.domains.map(domain => domain.id)).toEqual([
      'strength',
      'hypertrophy'
    ])
  })

  it('bounds detailed retrieval to four domains per tool call', () => {
    const reference = getCoachReference([
      'assessment',
      'strength',
      'hypertrophy',
      'power_explosiveness',
      'aerobic'
    ])

    expect(reference.domains).toHaveLength(4)
    expect(reference.truncated).toBe(true)
  })
})
