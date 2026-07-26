// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import PortionSelector from '@/app/components/PortionSelector'
import type { FoodItem } from '@/app/lib/types/food-tracking'

const items: FoodItem[] = [{
  food: 'Grilled chicken',
  portion: '1 piece',
  protein: 35,
  carbs: 0,
  fat: 4,
  calories: 180,
}]

describe('PortionSelector estimate review', () => {
  it('labels photo macros as estimates and offers an explicit review choice', () => {
    render(
      <PortionSelector
        items={items}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(screen.getByText('Photo estimate')).toBeInTheDocument()
    expect(screen.getByText(/Macros from a photo can be rough/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use these estimates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip review' })).toBeInTheDocument()
  })

  it('passes a corrected food name into the confirmation flow', () => {
    const onConfirm = vi.fn()
    render(
      <PortionSelector
        items={items}
        onConfirm={onConfirm}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Grilled chicken' }))
    fireEvent.change(screen.getByLabelText('Food Name'), {
      target: { value: 'Roasted chicken breast' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save item changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrections' }))

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ food: 'Roasted chicken breast' }),
    ])
  })
})
