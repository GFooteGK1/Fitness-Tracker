/**
 * Integration Tests for GET /api/adherence/weekly
 * 
 * **Property 10: API Response Completeness**
 * *For any* valid API request, the response SHALL contain: cumulative totals for all macros,
 * days elapsed count, prorated targets for all macros, adherence percentages, and deviation amounts.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the auth module before importing the route
vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { GET } from '../../app/api/adherence/weekly/route'
import { createServerClient } from '../../app/lib/auth/supabase-server'

// Helper to create a mock NextRequest for GET
function createMockRequest(weekStart: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/adherence/weekly?weekStart=${weekStart}`)
}

function createMockRequestWithTimezone(weekStart: string, tzOffset: number): NextRequest {
  return new NextRequest(`http://localhost:3000/api/adherence/weekly?weekStart=${weekStart}&tzOffset=${tzOffset}`)
}

// Helper to create a mock NextRequest without weekStart
function createMockRequestWithoutWeekStart(): NextRequest {
  return new NextRequest('http://localhost:3000/api/adherence/weekly')
}

// Mock daily targets data
const mockTargetsData = {
  user_id: 'test-user-id',
  target_protein: '150',
  target_carbs: '200',
  target_fat: '60',
  target_calories: '2000',
  tolerance_pct: '10',
  updated_at: '2025-01-20T00:00:00Z'
}

// Mock meals data (individual meal records)
const mockMealsData: Record<string, Array<{
  total_protein: string
  total_carbs: string
  total_fat: string
  total_calories: string
}>> = {
  '2025-01-20': [
    { total_protein: '50', total_carbs: '60', total_fat: '20', total_calories: '600' },
    { total_protein: '45', total_carbs: '65', total_fat: '18', total_calories: '650' },
    { total_protein: '45', total_carbs: '65', total_fat: '17', total_calories: '650' }
  ],
  '2025-01-21': [
    { total_protein: '55', total_carbs: '70', total_fat: '22', total_calories: '700' },
    { total_protein: '50', total_carbs: '70', total_fat: '21', total_calories: '700' },
    { total_protein: '55', total_carbs: '70', total_fat: '22', total_calories: '700' }
  ],
  '2025-01-22': [
    { total_protein: '50', total_carbs: '65', total_fat: '20', total_calories: '670' },
    { total_protein: '50', total_carbs: '70', total_fat: '20', total_calories: '665' },
    { total_protein: '50', total_carbs: '65', total_fat: '20', total_calories: '665' }
  ]
}

// Mock Supabase client factory for authenticated user with data
function createAuthenticatedMockSupabase(
  userId: string,
  targetsData: typeof mockTargetsData | null = mockTargetsData,
  mealsData: typeof mockMealsData | null = mockMealsData,
  targetsError: { message: string } | null = null,
  mealsError: { message: string } | null = null
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'daily_targets') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: targetsData,
            error: targetsError
          })
        }
      }
      if (table === 'meals') {
        // The API queries meals table for each day with gte/lt filters
        // We need to return appropriate data based on the date range
        let capturedStartDate: string | null = null
        
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockImplementation((_field: string, value: string) => {
            // Capture the start date from the query
            capturedStartDate = value.split('T')[0]
            return {
              lt: vi.fn().mockImplementation(() => {
                if (mealsError) {
                  return Promise.resolve({ data: null, error: mealsError })
                }
                // Return meals for the captured date
                const dayMeals = mealsData && capturedStartDate ? mealsData[capturedStartDate] || [] : []
                return Promise.resolve({ data: dayMeals, error: null })
              })
            }
          }),
          lt: vi.fn().mockReturnThis()
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    }),
  }
}

// Mock Supabase client factory for unauthenticated user
function createUnauthenticatedMockSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Unauthorized' },
      }),
    },
    from: vi.fn(),
  }
}

describe('GET /api/adherence/weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Date.now() to return a fixed date for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-23T12:00:00Z'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /**
   * Property 10: API Response Completeness
   * Test that response contains all new fields (daysElapsed, cumulativeData)
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
   */
  describe('Property 10: API Response Completeness', () => {
    it('should return daysElapsed in response', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('daysElapsed')
      expect(typeof data.daysElapsed).toBe('number')
    })

    it('should return cumulativeData in response', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('cumulativeData')
      expect(typeof data.cumulativeData).toBe('object')
    })

    it('should return cumulative totals for all macros (Requirement 6.1)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('totalProtein')
      expect(data.cumulativeData).toHaveProperty('totalCarbs')
      expect(data.cumulativeData).toHaveProperty('totalFat')
      expect(data.cumulativeData).toHaveProperty('totalCalories')
      
      // Verify they are numbers
      expect(typeof data.cumulativeData.totalProtein).toBe('number')
      expect(typeof data.cumulativeData.totalCarbs).toBe('number')
      expect(typeof data.cumulativeData.totalFat).toBe('number')
      expect(typeof data.cumulativeData.totalCalories).toBe('number')
    })

    it('should return prorated targets for all macros (Requirement 6.3)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('proratedProteinTarget')
      expect(data.cumulativeData).toHaveProperty('proratedCarbsTarget')
      expect(data.cumulativeData).toHaveProperty('proratedFatTarget')
      expect(data.cumulativeData).toHaveProperty('proratedCaloriesTarget')
      
      // Verify they are numbers
      expect(typeof data.cumulativeData.proratedProteinTarget).toBe('number')
      expect(typeof data.cumulativeData.proratedCarbsTarget).toBe('number')
      expect(typeof data.cumulativeData.proratedFatTarget).toBe('number')
      expect(typeof data.cumulativeData.proratedCaloriesTarget).toBe('number')
    })

    it('should return adherence percentages for all macros (Requirement 6.4)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('proteinAdherence')
      expect(data.cumulativeData).toHaveProperty('carbsAdherence')
      expect(data.cumulativeData).toHaveProperty('fatAdherence')
      expect(data.cumulativeData).toHaveProperty('caloriesAdherence')
      
      // Verify they are numbers
      expect(typeof data.cumulativeData.proteinAdherence).toBe('number')
      expect(typeof data.cumulativeData.carbsAdherence).toBe('number')
      expect(typeof data.cumulativeData.fatAdherence).toBe('number')
      expect(typeof data.cumulativeData.caloriesAdherence).toBe('number')
    })

    it('should return deviation amounts for all macros (Requirement 6.5)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('proteinDeviation')
      expect(data.cumulativeData).toHaveProperty('carbsDeviation')
      expect(data.cumulativeData).toHaveProperty('fatDeviation')
      expect(data.cumulativeData).toHaveProperty('caloriesDeviation')
      
      // Verify they are numbers
      expect(typeof data.cumulativeData.proteinDeviation).toBe('number')
      expect(typeof data.cumulativeData.carbsDeviation).toBe('number')
      expect(typeof data.cumulativeData.fatDeviation).toBe('number')
      expect(typeof data.cumulativeData.caloriesDeviation).toBe('number')
    })

    it('should return tolerance status for all macros', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('proteinWithinTolerance')
      expect(data.cumulativeData).toHaveProperty('carbsWithinTolerance')
      expect(data.cumulativeData).toHaveProperty('fatWithinTolerance')
      expect(data.cumulativeData).toHaveProperty('caloriesWithinTolerance')
      
      // Verify they are booleans
      expect(typeof data.cumulativeData.proteinWithinTolerance).toBe('boolean')
      expect(typeof data.cumulativeData.carbsWithinTolerance).toBe('boolean')
      expect(typeof data.cumulativeData.fatWithinTolerance).toBe('boolean')
      expect(typeof data.cumulativeData.caloriesWithinTolerance).toBe('boolean')
    })

    it('should return overall status', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.cumulativeData).toHaveProperty('overallStatus')
      expect(['on-track', 'ahead', 'behind']).toContain(data.cumulativeData.overallStatus)
    })
  })

  /**
   * Test prorated calculation with various days elapsed
   * **Validates: Requirements 6.2, 6.3**
   */
  describe('Prorated Target Calculations', () => {
    it('should calculate prorated targets based on days elapsed (Requirement 6.2)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // daysElapsed is calculated by the API based on current date
      // Verify it's a valid number between 1 and 7
      expect(data.daysElapsed).toBeGreaterThanOrEqual(1)
      expect(data.daysElapsed).toBeLessThanOrEqual(7)
      
      // Prorated targets should be daily × daysElapsed
      // Daily targets: protein=150, carbs=200, fat=60, calories=2000
      const daysElapsed = data.daysElapsed
      expect(data.cumulativeData.proratedProteinTarget).toBe(150 * daysElapsed)
      expect(data.cumulativeData.proratedCarbsTarget).toBe(200 * daysElapsed)
      expect(data.cumulativeData.proratedFatTarget).toBe(60 * daysElapsed)
      expect(data.cumulativeData.proratedCaloriesTarget).toBe(2000 * daysElapsed)
    })

    it('should calculate correct cumulative totals from daily summaries', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Sum of mock meals data:
      // Day 1 (Jan 20): protein=140, carbs=190, fat=55, calories=1900
      // Day 2 (Jan 21): protein=160, carbs=210, fat=65, calories=2100
      // Day 3 (Jan 22): protein=150, carbs=200, fat=60, calories=2000
      // Total: protein=450, carbs=600, fat=180, calories=6000
      expect(data.cumulativeData.totalProtein).toBe(450)
      expect(data.cumulativeData.totalCarbs).toBe(600)
      expect(data.cumulativeData.totalFat).toBe(180)
      expect(data.cumulativeData.totalCalories).toBe(6000)
    })

    it('should calculate correct adherence percentages based on prorated targets', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Adherence = (actual / prorated) × 100
      // Verify the calculation is correct based on actual values
      const expectedProteinAdherence = (data.cumulativeData.totalProtein / data.cumulativeData.proratedProteinTarget) * 100
      const expectedCarbsAdherence = (data.cumulativeData.totalCarbs / data.cumulativeData.proratedCarbsTarget) * 100
      const expectedFatAdherence = (data.cumulativeData.totalFat / data.cumulativeData.proratedFatTarget) * 100
      const expectedCaloriesAdherence = (data.cumulativeData.totalCalories / data.cumulativeData.proratedCaloriesTarget) * 100
      
      expect(data.cumulativeData.proteinAdherence).toBeCloseTo(expectedProteinAdherence, 5)
      expect(data.cumulativeData.carbsAdherence).toBeCloseTo(expectedCarbsAdherence, 5)
      expect(data.cumulativeData.fatAdherence).toBeCloseTo(expectedFatAdherence, 5)
      expect(data.cumulativeData.caloriesAdherence).toBeCloseTo(expectedCaloriesAdherence, 5)
    })

    it('should calculate correct deviation amounts', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Deviation = actual - prorated
      // Verify the calculation is correct based on actual values
      const expectedProteinDeviation = data.cumulativeData.totalProtein - data.cumulativeData.proratedProteinTarget
      const expectedCarbsDeviation = data.cumulativeData.totalCarbs - data.cumulativeData.proratedCarbsTarget
      const expectedFatDeviation = data.cumulativeData.totalFat - data.cumulativeData.proratedFatTarget
      const expectedCaloriesDeviation = data.cumulativeData.totalCalories - data.cumulativeData.proratedCaloriesTarget
      
      expect(data.cumulativeData.proteinDeviation).toBe(expectedProteinDeviation)
      expect(data.cumulativeData.carbsDeviation).toBe(expectedCarbsDeviation)
      expect(data.cumulativeData.fatDeviation).toBe(expectedFatDeviation)
      expect(data.cumulativeData.caloriesDeviation).toBe(expectedCaloriesDeviation)
    })

    it('should return days elapsed between 1 and 7 for current week', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.daysElapsed).toBeGreaterThanOrEqual(1)
      expect(data.daysElapsed).toBeLessThanOrEqual(7)
    })

    it('should calculate days elapsed from the caller timezone', async () => {
      vi.setSystemTime(new Date('2025-01-20T12:30:00Z'))

      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequestWithTimezone('2025-01-20', -720)
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.daysElapsed).toBe(2)
    })

    it('should cap days elapsed at 7 for past weeks', async () => {
      // Set system time to 2025-02-01 (well past the week of 2025-01-20)
      vi.setSystemTime(new Date('2025-02-01T12:00:00Z'))
      
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.daysElapsed).toBe(7)
    })
  })

  /**
   * Test empty data scenarios
   */
  describe('Empty Data Handling', () => {
    it('should handle no logged meals (empty summaries)', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id', mockTargetsData, {})
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.daysWithData).toBe(0)
      
      // Cumulative totals should be 0
      expect(data.cumulativeData.totalProtein).toBe(0)
      expect(data.cumulativeData.totalCarbs).toBe(0)
      expect(data.cumulativeData.totalFat).toBe(0)
      expect(data.cumulativeData.totalCalories).toBe(0)
      
      // Prorated targets should still be calculated
      expect(data.cumulativeData.proratedProteinTarget).toBeGreaterThan(0)
      
      // Adherence should be 0%
      expect(data.cumulativeData.proteinAdherence).toBe(0)
      
      // Status should be behind
      expect(data.cumulativeData.overallStatus).toBe('behind')
    })
  })

  /**
   * Error handling tests
   */
  describe('Error Handling', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const mockSupabase = createUnauthenticatedMockSupabase()
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 400 for missing weekStart parameter', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequestWithoutWeekStart()
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Week start date is required (YYYY-MM-DD format)')
    })

    it('should return 400 for invalid date format', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/adherence/weekly?weekStart=invalid-date')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid week start date format. Use YYYY-MM-DD')
    })

    it('should return 404 when user has no daily targets set', async () => {
      const mockSupabase = createAuthenticatedMockSupabase(
        'test-user-id',
        null,
        mockMealsData,
        { message: 'No rows found' }
      )
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Failed to fetch user targets. Please set your daily targets first.')
    })
  })

  /**
   * Test existing response fields are preserved
   */
  describe('Existing Response Fields', () => {
    it('should still return weeklyAdherence', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('weeklyAdherence')
    })

    it('should still return correctionGuidance', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('correctionGuidance')
    })

    it('should still return targets', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('targets')
    })

    it('should still return daysWithData', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('daysWithData')
      expect(data.daysWithData).toBe(3) // 3 mock summaries
    })

    it('should still return weekStart and weekEnd', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id')
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any)

      const request = createMockRequest('2025-01-20')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('weekStart')
      expect(data).toHaveProperty('weekEnd')
      expect(data.weekStart).toBe('2025-01-20')
      expect(data.weekEnd).toBe('2025-01-26')
    })
  })
})
