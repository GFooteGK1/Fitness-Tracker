// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PrescriptionBasisDetails } from '@/app/program/prescription-basis-details'
import { buildPrescriptionBasis } from '@/app/lib/coach/prescription-basis'
import { buildFactualPlanningContext } from '@/app/lib/coach/planning-context'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'

describe('prescription basis disclosure', () => {
  it('keeps legacy accepted plans unchanged and exposes the provisional basis on demand', () => {
    const view = render(<PrescriptionBasisDetails />)
    expect(view.container).toBeEmptyDOMElement()
    const history = buildFactualPlanningContext({ userId: 'athlete', asOf: '2026-09-17T18:00:00Z', startsOn: '2026-08-21', endsOn: '2026-09-17', mode: 'current', workouts: [], available: true, complete: true })
    view.rerender(<PrescriptionBasisDetails basis={buildPrescriptionBasis(GOLDEN_PROGRAMMING_PROFILES[0].profile, history)} />)
    const summary = screen.getByText('What this plan is based on')
    expect(summary).toHaveClass('min-h-11')
    fireEvent.click(summary)
    expect(screen.getByText(/provisional starting plan/)).toBeInTheDocument()
    expect(screen.getByText(/Unlogged activity and outside training may be missing/)).toBeInTheDocument()
  })
})
