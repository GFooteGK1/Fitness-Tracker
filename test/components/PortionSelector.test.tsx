// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    expect(screen.getByText(/An estimate from your photo/i)).toBeInTheDocument()
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

describe('PortionSelector', () => {
  it('shows estimated totals and preserves the original items when accepted', () => {
    const items = [{ food: 'Chicken', portion: '1 serving', protein: 30, carbs: 0, fat: 5, calories: 165 }, { food: 'Rice', portion: '1 serving', protein: 4, carbs: 45, fat: 0, calories: 196 }]
    const onConfirm = vi.fn()
    render(<PortionSelector items={items} onConfirm={onConfirm} onSkip={vi.fn()} />)
    const nutrition = within(screen.getByLabelText('Estimated nutrition'))
    expect(nutrition.getByText('361')).toBeInTheDocument()
    expect(nutrition.getByText('34g')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use these estimates' }))
    expect(onConfirm).toHaveBeenCalledWith(items)
  })
  it('prevents accepting unfinished item edits and warns that totals have not been refined yet', () => {
    render(<PortionSelector items={[{ food: 'Chicken', portion: '1 serving', protein: 30, carbs: 0, fat: 5, calories: 165 }]} onConfirm={vi.fn()} onSkip={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Chicken' }))
    expect(screen.getByRole('button', { name: 'Use these estimates' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Food Name'), { target: { value: 'Turkey' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save item changes' }))
    expect(screen.getByText('Nutrition will update after you apply corrections.')).toBeInTheDocument()
  })
})


describe('whole-meal portions', () => {
  it('previews a multiplier without changing the source items or compounding selections', () => {
    const onConfirm = vi.fn()
    render(<PortionSelector items={items} onConfirm={onConfirm} onSkip={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '2×' }))
    fireEvent.click(screen.getByRole('button', { name: 'Half' }))
    expect(within(screen.getByLabelText('Estimated nutrition')).getByText('90')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrections' }))
    expect(onConfirm).toHaveBeenCalledWith(items, 0.5)
    expect(items[0].calories).toBe(180)
  })
})
