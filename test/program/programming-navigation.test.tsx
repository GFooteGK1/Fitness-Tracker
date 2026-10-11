// @vitest-environment jsdom
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProgrammingNavigation } from '@/app/program/programming-navigation'
import type { WeeklyCoachState } from '@/app/program/weekly-program-view'
afterEach(cleanup)
describe('athlete programming entry', () => {
  it.each([null, { currentWeek: { intent: { weekly_plan: {} } }, program: { id: 'program-1' } }])('offers legacy review from Plan', state => {
    render(<ProgrammingNavigation state={state as WeeklyCoachState | null} />)
    expect(screen.getByRole('link', { name: 'Review your next week' })).toHaveAttribute('href', '/program/first-reviewed')
    expect(screen.getByRole('link', { name: 'Coach workspace' })).toHaveAttribute('href', '/program/supervised')
  })
  it('keeps already reviewed programs on their existing proposal flow', () => {
    render(<ProgrammingNavigation state={{ currentWeek: { intent: { format: 'reviewed_weekly_intent_v0_1' } }, program: { id: 'program-1' } } as WeeklyCoachState} />)
    expect(screen.getByRole('link', { name: 'Review your next week' })).toHaveAttribute('href', '/program/reviewed/plans/program-1')
  })
})
