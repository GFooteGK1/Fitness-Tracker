/**
 * DayCard Component Tests
 * 
 * Tests for the DayCard component that displays individual day nutrition data
 * within the horizontal scroll daily breakdown.
 * 
 * **Property 9: Day Card Content Completeness**
 * *For any* day with logged data, the rendered day card SHALL contain:
 * day name, date number, adherence score badge, and all four macro values
 * (protein, carbs, fat, calories).
 * 
 * **Validates: Requirements 2.2, 2.3, 2.5, 2.6, 2.7**
 */

// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DayCard from '@/app/components/DayCard'
import { DailyAdherenceScore } from '@/app/lib/adherence-calculator'

/**
 * Creates a Date object at noon local time to avoid timezone issues
 * This ensures the date is consistent regardless of timezone
 */
function createLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0) // month is 0-indexed
}

/**
 * Creates mock DailyAdherenceScore data for testing
 * Note: date is now a string in YYYY-MM-DD format for API consistency
 */
function createMockDayData(overrides: Partial<{
  date: Date | string
  overallScore: number
  protein: number
  carbs: number
  fat: number
  calories: number
}>): DailyAdherenceScore {
  const {
    date = createLocalDate(2025, 1, 15),
    overallScore = 92,
    protein = 142,
    carbs = 180,
    fat = 52,
    calories = 1850
  } = overrides

  // Convert Date to YYYY-MM-DD string format
  const dateStr = date instanceof Date 
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : date

  return {
    date: dateStr,
    adherenceStatus: {
      proteinAdherence: 95,
      carbsAdherence: 90,
      fatAdherence: 88,
      caloriesAdherence: 94,
      overallScore,
      withinTolerance: overallScore >= 95
    },
    dailyTotals: {
      protein,
      carbs,
      fat,
      calories
    }
  }
}

describe('DayCard Component', () => {
  describe('Property 9: Day Card Content Completeness', () => {
    /**
     * Test Case 1: Day with logged data - verify all content is displayed
     * 
     * *For any* day with logged data, the rendered day card SHALL contain:
     * - Day name (e.g., "Wed")
     * - Date number (e.g., "15")
     * - Adherence score badge (e.g., "92%")
     * - All four macro values (P, C, F, Cal)
     * 
     * **Validates: Requirements 2.2, 2.3**
     */
    it('should display all required content for a day with logged data', () => {
      // January 15, 2025 is a Wednesday
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({
        date: testDate,
        overallScore: 92,
        protein: 142,
        carbs: 180,
        fat: 52,
        calories: 1850
      })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      // Verify day name is displayed
      expect(screen.getByText('Wed')).toBeInTheDocument()

      // Verify date number is displayed
      expect(screen.getByText('15')).toBeInTheDocument()

      // Verify adherence score badge is displayed
      expect(screen.getByText('92%')).toBeInTheDocument()

      // Verify all four macro values are displayed
      expect(screen.getByText('142g')).toBeInTheDocument() // Protein
      expect(screen.getByText('180g')).toBeInTheDocument() // Carbs
      expect(screen.getByText('52g')).toBeInTheDocument()  // Fat
      expect(screen.getByText('1850')).toBeInTheDocument() // Calories
    })

    /**
     * Test Case 2: No data state - verify "No data" indicator is shown
     * 
     * WHEN a day has no logged data, THE Day_Card SHALL display a muted
     * "No data" indicator without macro values.
     * 
     * **Validates: Requirement 2.5**
     */
    it('should display "No data" indicator when dayData is null', () => {
      // January 15, 2025 is a Wednesday
      const testDate = createLocalDate(2025, 1, 15)

      render(
        <DayCard
          date={testDate}
          dayData={null}
          isToday={false}
          isFuture={false}
        />
      )

      // Verify "No data" indicator is displayed
      expect(screen.getByText('No data')).toBeInTheDocument()

      // Verify day name and date are still shown
      expect(screen.getByText('Wed')).toBeInTheDocument()
      expect(screen.getByText('15')).toBeInTheDocument()

      // Verify macro values are NOT displayed
      expect(screen.queryByText(/\d+g/)).not.toBeInTheDocument()
      expect(screen.queryByText('P:')).not.toBeInTheDocument()
    })

    /**
     * Test Case 3: Future state - verify "Future" indicator is shown
     * 
     * WHEN displaying a future day, THE Day_Card SHALL display a muted
     * "Future" indicator.
     * 
     * **Validates: Requirement 2.6**
     */
    it('should display "Future" indicator for future days', () => {
      // January 20, 2025 is a Monday
      const futureDate = createLocalDate(2025, 1, 20)
      const dayData = createMockDayData({ date: futureDate })

      render(
        <DayCard
          date={futureDate}
          dayData={dayData}
          isToday={false}
          isFuture={true}
        />
      )

      // Verify "Future" indicator is displayed
      expect(screen.getByText('Future')).toBeInTheDocument()

      // Verify day name and date are still shown
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('20')).toBeInTheDocument()

      // Verify macro values are NOT displayed for future days
      expect(screen.queryByText('P:')).not.toBeInTheDocument()
      expect(screen.queryByText('C:')).not.toBeInTheDocument()
    })

    /**
     * Test Case 4: Today's card - verify visual highlight is applied
     * 
     * WHEN displaying today's Day_Card, THE Day_Card SHALL have a visual
     * highlight distinguishing it from other days.
     * 
     * **Validates: Requirement 2.7**
     */
    it('should apply visual highlight for today\'s card', () => {
      const today = new Date()
      const dayData = createMockDayData({ date: today, overallScore: 88 })

      render(
        <DayCard
          date={today}
          dayData={dayData}
          isToday={true}
          isFuture={false}
        />
      )

      // Get the button element (the card)
      const card = screen.getByRole('button')

      // Verify today's card has the blue highlight classes
      expect(card).toHaveClass('border-blue-500')
      expect(card).toHaveClass('bg-blue-50')

      // Verify the today indicator dot is present
      const todayDot = card.querySelector('.bg-blue-500.rounded-full')
      expect(todayDot).toBeInTheDocument()

      // Verify aria-label includes "(Today)"
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('(Today)'))
    })

    /**
     * Test Case 5: onClick handler - verify it's called when card is clicked
     * 
     * WHEN a user taps a Day_Card, THE Day_Card SHALL provide a 44px minimum
     * touch target for the entire card.
     * 
     * **Validates: Requirement 2.4**
     */
    it('should call onSelect handler when card is clicked', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate })
      const onSelectMock = vi.fn()

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
          onSelect={onSelectMock}
        />
      )

      // Click the card
      const card = screen.getByRole('button')
      fireEvent.click(card)

      // Verify onSelect was called
      expect(onSelectMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('Touch Target Requirements', () => {
    /**
     * Verify minimum touch target size (44px × 44px)
     * 
     * THE Weekly_Adherence_View SHALL use touch targets of minimum
     * 44px × 44px for all interactive elements.
     * 
     * **Validates: Requirement 4.1**
     */
    it('should have minimum 44px touch target', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
          onSelect={() => {}}
        />
      )

      const card = screen.getByRole('button')
      
      // Verify the card has min-h-[44px] class for touch target
      expect(card).toHaveClass('min-h-[44px]')
    })
  })

  describe('Color Coding', () => {
    /**
     * Verify color coding for different adherence scores
     * 
     * THE Weekly_Adherence_View SHALL maintain the existing color-coding system:
     * - Green ≥95%
     * - Yellow 85-94%
     * - Orange 70-84%
     * - Red <70%
     * 
     * **Validates: Requirement 3.1**
     */
    it('should apply green color for score >= 95%', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate, overallScore: 98 })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const scoreBadge = screen.getByText('98%')
      expect(scoreBadge).toHaveClass('bg-green-100')
      expect(scoreBadge).toHaveClass('text-green-700')
    })

    it('should apply yellow color for score 85-94%', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate, overallScore: 90 })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const scoreBadge = screen.getByText('90%')
      expect(scoreBadge).toHaveClass('bg-yellow-100')
      expect(scoreBadge).toHaveClass('text-yellow-700')
    })

    it('should apply orange color for score 70-84%', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate, overallScore: 75 })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const scoreBadge = screen.getByText('75%')
      expect(scoreBadge).toHaveClass('bg-orange-100')
      expect(scoreBadge).toHaveClass('text-orange-700')
    })

    it('should apply red color for score < 70%', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate, overallScore: 65 })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const scoreBadge = screen.getByText('65%')
      expect(scoreBadge).toHaveClass('bg-red-100')
      expect(scoreBadge).toHaveClass('text-red-700')
    })
  })

  describe('Accessibility', () => {
    /**
     * Verify proper aria-label for accessibility
     */
    it('should have descriptive aria-label for day with data', () => {
      // January 15, 2025 is a Wednesday
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate, overallScore: 92 })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const card = screen.getByRole('button')
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Wed 15'))
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('Score: 92%'))
    })

    it('should have descriptive aria-label for day with no data', () => {
      const testDate = createLocalDate(2025, 1, 15)

      render(
        <DayCard
          date={testDate}
          dayData={null}
          isToday={false}
          isFuture={false}
        />
      )

      const card = screen.getByRole('button')
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('No data'))
    })

    it('should have descriptive aria-label for future day', () => {
      const futureDate = createLocalDate(2025, 1, 20)

      render(
        <DayCard
          date={futureDate}
          dayData={null}
          isToday={false}
          isFuture={true}
        />
      )

      const card = screen.getByRole('button')
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('(Future)'))
    })
  })

  describe('Edge Cases', () => {
    /**
     * Test with zero macro values
     */
    it('should display zero values correctly', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({
        date: testDate,
        overallScore: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        calories: 0
      })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      // Verify zero values are displayed
      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getAllByText('0g')).toHaveLength(3) // P, C, F
      expect(screen.getByText('0')).toBeInTheDocument() // Calories (no 'g' suffix)
    })

    /**
     * Test with decimal macro values (should be rounded)
     */
    it('should round decimal macro values', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({
        date: testDate,
        overallScore: 92.7,
        protein: 142.6,
        carbs: 180.3,
        fat: 52.8,
        calories: 1850.5
      })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      // Verify values are rounded
      expect(screen.getByText('93%')).toBeInTheDocument()
      expect(screen.getByText('143g')).toBeInTheDocument()
      expect(screen.getByText('180g')).toBeInTheDocument()
      expect(screen.getByText('53g')).toBeInTheDocument()
      expect(screen.getByText('1851')).toBeInTheDocument()
    })

    /**
     * Test card without onSelect handler (should be disabled)
     */
    it('should not be clickable when onSelect is not provided', () => {
      const testDate = createLocalDate(2025, 1, 15)
      const dayData = createMockDayData({ date: testDate })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      const card = screen.getByRole('button')
      expect(card).toBeDisabled()
    })

    /**
     * Test different days of the week
     * Using dates that are verified to be correct days
     */
    it.each([
      [2025, 1, 13, 'Mon'], // January 13, 2025 is Monday
      [2025, 1, 14, 'Tue'], // January 14, 2025 is Tuesday
      [2025, 1, 15, 'Wed'], // January 15, 2025 is Wednesday
      [2025, 1, 16, 'Thu'], // January 16, 2025 is Thursday
      [2025, 1, 17, 'Fri'], // January 17, 2025 is Friday
      [2025, 1, 18, 'Sat'], // January 18, 2025 is Saturday
      [2025, 1, 19, 'Sun']  // January 19, 2025 is Sunday
    ])('should display correct day name for %d-%d-%d', (year, month, day, expectedDay) => {
      const testDate = createLocalDate(year, month, day)
      const dayData = createMockDayData({ date: testDate })

      render(
        <DayCard
          date={testDate}
          dayData={dayData}
          isToday={false}
          isFuture={false}
        />
      )

      expect(screen.getByText(expectedDay)).toBeInTheDocument()
    })
  })
})
