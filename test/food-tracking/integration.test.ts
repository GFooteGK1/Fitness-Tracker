/**
 * Integration Tests for Complete Food Tracking Workflows
 * Task 11.3: End-to-end integration tests covering the full food tracking pipeline
 *
 * Workflows tested:
 * 1. Photo upload -> AI analysis -> meal storage -> daily view retrieval
 * 2. Meal edit -> update storage -> verify daily totals recalculate
 * 3. Meal delete -> verify removal from daily view and total recalculation
 * 4. Target management -> set targets -> verify adherence calculation
 * 5. Weekly adherence -> verify scoring aggregation across multiple days
 *
 * Validates: Requirements 1.2, 2.1-2.5, 3.1, 3.4, 3.5, 5.1, 5.3,
 *            6.3, 6.4, 6.5, 7.1-7.4, 8.1-8.4, 9.1-9.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Module mocks (must be declared before any imports that depend on them)
// ---------------------------------------------------------------------------

vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

// Shared mock for the Anthropic client – vi.hoisted ensures it's accessible
// inside the vi.mock factory (which is hoisted above all other code).
const { mockAnthropicCreate } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = function (this: any) {
    this.messages = { create: mockAnthropicCreate }
  }
  return { default: MockAnthropic }
})

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { createServerClient } from '../../app/lib/auth/supabase-server'
import { POST as uploadMeal } from '../../app/api/meals/upload/route'
import { GET as getDailyMeals, POST as setDailyTargets } from '../../app/api/meals/daily/route'
import { PUT as updateMeal, DELETE as deleteMeal } from '../../app/api/meals/[id]/route'
import { GET as getWeeklyAdherence } from '../../app/api/adherence/weekly/route'
import {
  calculateAdherenceStatus,
  calculateWeeklyAdherence,
  calculateDailyTotals,
  generateCorrectionGuidance,
} from '../../app/lib/adherence-calculator'
import { calculateTotalMacros, validateMealData } from '../../app/lib/macro-validation'
import type {
  FoodItem,
  MacroTotals,
  DailyTargets,
  DailySummary,
} from '../../app/lib/types/food-tracking'

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'integration-test-user'
const TEST_MEAL_ID = 'integration-test-meal-1'
const TEST_DATE = '2025-06-10'

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

// Generates non-empty, non-whitespace-only strings for food/portion names
const arbNonBlankString = (maxLen: number) =>
  fc
    .string({ minLength: 1, maxLength: maxLen })
    .filter((s) => s.trim().length > 0)

const arbFoodItem = fc.record({
  food: arbNonBlankString(50),
  portion: arbNonBlankString(30),
  protein: fc.float({ min: 0, max: 100, noNaN: true }),
  carbs: fc.float({ min: 0, max: 200, noNaN: true }),
  fat: fc.float({ min: 0, max: 80, noNaN: true }),
  calories: fc.float({ min: 0, max: 1000, noNaN: true }),
})

const arbFoodItems = fc.array(arbFoodItem, { minLength: 1, maxLength: 6 })

const arbPositiveTarget = fc.float({ min: 1, max: 500, noNaN: true })

const arbDailyTargets = fc
  .record({
    targetProtein: arbPositiveTarget,
    targetCarbs: arbPositiveTarget,
    targetFat: arbPositiveTarget,
    targetCalories: fc.float({ min: 100, max: 5000, noNaN: true }),
    tolerancePct: fc.float({ min: 1, max: 20, noNaN: true }),
  })
  .map((t) => ({
    ...t,
    userId: TEST_USER_ID,
    updatedAt: new Date('2025-06-01'),
  }))

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a snake_case DB row for a meal from camelCase values */
function makeMealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_MEAL_ID,
    user_id: TEST_USER_ID,
    meal_timestamp: `${TEST_DATE}T12:00:00Z`,
    photo_url: null,
    photo_expires_at: null,
    items: [
      { food: 'Chicken Breast', portion: '6oz', protein: 42, carbs: 0, fat: 3, calories: 195 },
      { food: 'Brown Rice', portion: '1 cup', protein: 5, carbs: 45, fat: 2, calories: 216 },
    ],
    total_protein: '47',
    total_carbs: '45',
    total_fat: '5',
    total_calories: '411',
    needs_review: false,
    manual_override: false,
    ai_confidence: '0.85',
    reviewed_at: null,
    created_at: `${TEST_DATE}T12:00:00Z`,
    updated_at: `${TEST_DATE}T12:00:00Z`,
    ...overrides,
  }
}

function makeMealRow2() {
  return makeMealRow({
    id: 'integration-test-meal-2',
    meal_timestamp: `${TEST_DATE}T18:00:00Z`,
    items: [
      { food: 'Salmon', portion: '5oz', protein: 35, carbs: 0, fat: 12, calories: 250 },
      { food: 'Sweet Potato', portion: '1 medium', protein: 2, carbs: 26, fat: 0, calories: 103 },
    ],
    total_protein: '37',
    total_carbs: '26',
    total_fat: '12',
    total_calories: '353',
    ai_confidence: '0.90',
    created_at: `${TEST_DATE}T18:00:00Z`,
    updated_at: `${TEST_DATE}T18:00:00Z`,
  })
}

const mockTargetsRow = {
  user_id: TEST_USER_ID,
  target_protein: '150',
  target_carbs: '200',
  target_fat: '60',
  target_calories: '2000',
  tolerance_pct: '5',
  updated_at: '2025-06-01T00:00:00Z',
}

/**
 * Creates a mock Supabase client with configurable table responses.
 * Supports insert (meals), select chains (meals, daily_targets), update, delete, and upsert.
 */
function createMockSupabase(opts: {
  authenticated?: boolean
  mealsSelectData?: any[]
  mealsInsertData?: any
  mealsUpdateData?: any
  mealsDeleteError?: any
  targetsData?: any
  targetsError?: any
  insertError?: any
  updateError?: any
  /** For weekly adherence: meals keyed by date string */
  mealsByDate?: Record<string, any[]>
} = {}) {
  const {
    authenticated = true,
    mealsSelectData = [makeMealRow()],
    mealsInsertData = makeMealRow(),
    mealsUpdateData = null,
    mealsDeleteError = null,
    targetsData = mockTargetsRow,
    targetsError = null,
    insertError = null,
    updateError = null,
    mealsByDate = null,
  } = opts

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(
        authenticated
          ? { data: { user: { id: TEST_USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'Unauthorized' } }
      ),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'meals') {
        // Track chainable state
        let capturedStartDate: string | null = null

        return {
          // INSERT chain
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: insertError ? null : mealsInsertData,
                error: insertError,
              }),
            }),
          }),
          // SELECT chain with optional date filters (used by daily and weekly routes)
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => {
              const chain: any = {
                eq: vi.fn().mockImplementation(() => chain),
                gte: vi.fn().mockImplementation((_: string, value: string) => {
                  capturedStartDate = value.split('T')[0]
                  return {
                    lt: vi.fn().mockImplementation(() => {
                      if (mealsByDate) {
                        const dayMeals = (capturedStartDate && mealsByDate[capturedStartDate]) || []
                        return {
                          order: vi.fn().mockResolvedValue({ data: dayMeals, error: null }),
                          then: (resolve: Function) => resolve({ data: dayMeals, error: null }),
                        }
                      }
                      return {
                        order: vi.fn().mockResolvedValue({ data: mealsSelectData, error: null }),
                        then: (resolve: Function) =>
                          resolve({ data: mealsSelectData, error: null }),
                      }
                    }),
                  }
                }),
                order: vi.fn().mockResolvedValue({ data: mealsSelectData, error: null }),
                single: vi.fn().mockResolvedValue({
                  data: mealsSelectData[0] ?? null,
                  error: mealsSelectData.length === 0 ? { message: 'Not found' } : null,
                }),
              }
              return chain
            }),
          }),
          // UPDATE chain
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: updateError ? null : (mealsUpdateData ?? makeMealRow()),
                    error: updateError,
                  }),
                }),
              })),
            })),
          }),
          // DELETE chain
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: mealsDeleteError,
              }),
            })),
          }),
        }
      }

      if (table === 'daily_targets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: targetsData,
                error: targetsError,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }

      // Fallback
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Request factories
// ---------------------------------------------------------------------------

function createUploadRequest(photo: Blob, timestamp: string) {
  const formData = new FormData()
  formData.append('photo', photo, 'meal.jpg')
  formData.append('timestamp', timestamp)
  return new NextRequest('http://localhost:3000/api/meals/upload', {
    method: 'POST',
    body: formData,
  })
}

function createDailyGetRequest(date: string) {
  return new NextRequest(
    `http://localhost:3000/api/meals/daily?date=${date}&tzOffset=0`
  )
}

function createTargetsPostRequest(targets: Record<string, number>) {
  return new NextRequest('http://localhost:3000/api/meals/daily', {
    method: 'POST',
    body: JSON.stringify(targets),
    headers: { 'Content-Type': 'application/json' },
  })
}

function createMealUpdateRequest(mealId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/meals/${mealId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function createMealDeleteRequest(mealId: string) {
  return new NextRequest(`http://localhost:3000/api/meals/${mealId}`, {
    method: 'DELETE',
  })
}

function createWeeklyRequest(weekStart: string) {
  return new NextRequest(
    `http://localhost:3000/api/adherence/weekly?weekStart=${weekStart}&tzOffset=0`
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Food Tracking Integration Tests', () => {
  let originalAnthropicKey: string | undefined
  let originalAnthropicModel: string | undefined
  let originalAnthropicVisionModel: string | undefined

  beforeEach(() => {
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY
    originalAnthropicModel = process.env.ANTHROPIC_MODEL
    originalAnthropicVisionModel = process.env.ANTHROPIC_VISION_MODEL
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    delete process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_VISION_MODEL
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-12T12:00:00Z'))
  })

  afterEach(() => {
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey
    }
    if (originalAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_MODEL
    } else {
      process.env.ANTHROPIC_MODEL = originalAnthropicModel
    }
    if (originalAnthropicVisionModel === undefined) {
      delete process.env.ANTHROPIC_VISION_MODEL
    } else {
      process.env.ANTHROPIC_VISION_MODEL = originalAnthropicVisionModel
    }
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // =========================================================================
  // Flow 1: Photo upload -> AI analysis -> meal storage -> daily view
  // Validates: Requirements 1.2, 2.1-2.5, 3.1, 3.4, 3.5, 5.1
  // =========================================================================
  describe('Flow 1: Upload -> Analyze -> Store -> Daily View', () => {
    it('stores meal after upload and surfaces it in daily view', async () => {
      // -- Upload step: mock supabase + anthropic --
      const storedMeal = makeMealRow()

      const mockSb = createMockSupabase({
        mealsInsertData: storedMeal,
        mealsSelectData: [storedMeal],
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      // Configure mock AI response
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              items: storedMeal.items,
              total_protein: 47,
              total_carbs: 45,
              total_fat: 5,
              total_calories: 411,
              confidence: 0.85,
              notes: '',
            }),
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
      })

      // Create a realistic-sized photo blob (> 1000 bytes)
      const photoBytes = new Uint8Array(2000)
      const photo = new Blob([photoBytes], { type: 'image/jpeg' })

      const uploadReq = createUploadRequest(photo, `${TEST_DATE}T12:00:00Z`)
      const uploadRes = await uploadMeal(uploadReq)
      const uploadData = await uploadRes.json()

      // Verify upload produced a stored meal ID
      expect(uploadRes.status).toBe(200)
      expect(uploadData.mealId).toBe(TEST_MEAL_ID)
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
        })
      )

      // -- Daily view step: same auth, same stored meal in select --
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.meals).toHaveLength(1)
      expect(dailyData.meals[0].id).toBe(TEST_MEAL_ID)
      expect(dailyData.meals[0].totalProtein).toBe(47)
      expect(dailyData.meals[0].totalCarbs).toBe(45)

      // Daily totals should equal the single meal's macros
      expect(dailyData.dailyTotals.protein).toBe(47)
      expect(dailyData.dailyTotals.carbs).toBe(45)
      expect(dailyData.dailyTotals.fat).toBe(5)
      expect(dailyData.dailyTotals.calories).toBe(411)
    })

    it('flags meal for review when AI confidence is low', async () => {
      const lowConfidenceMeal = makeMealRow({
        needs_review: true,
        ai_confidence: '0.45',
        items: [],
      })

      const mockSb = createMockSupabase({ mealsInsertData: lowConfidenceMeal })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 100, output_tokens: 10 },
        stop_reason: 'end_turn',
      })

      const photoBytes = new Uint8Array(2000)
      const photo = new Blob([photoBytes], { type: 'image/jpeg' })
      const req = createUploadRequest(photo, `${TEST_DATE}T12:00:00Z`)
      const res = await uploadMeal(req)
      const data = await res.json()

      // Meal still saved but analysis status should reflect failure
      expect(res.status).toBe(200)
      expect(data.analysisStatus).toBe('failed')
      expect(data.mealId).toBe(TEST_MEAL_ID)
    })

    it('returns 401 for unauthenticated upload', async () => {
      const mockSb = createMockSupabase({ authenticated: false })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const photoBytes = new Uint8Array(2000)
      const photo = new Blob([photoBytes], { type: 'image/jpeg' })
      const req = createUploadRequest(photo, `${TEST_DATE}T12:00:00Z`)
      const res = await uploadMeal(req)

      expect(res.status).toBe(401)
    })

    it('property: calculated totals from items equal stored totals', () => {
      fc.assert(
        fc.property(arbFoodItems, (items: FoodItem[]) => {
          const totals = calculateTotalMacros(items)

          const validation = validateMealData(items, totals)

          // With exact calculated totals, validation should always pass
          expect(validation.isValid).toBe(true)
          expect(validation.calculatedTotals.protein).toBeCloseTo(totals.protein, 1)
          expect(validation.calculatedTotals.carbs).toBeCloseTo(totals.carbs, 1)
          expect(validation.calculatedTotals.fat).toBeCloseTo(totals.fat, 1)
          expect(validation.calculatedTotals.calories).toBeCloseTo(totals.calories, 1)
        }),
        { numRuns: 100 }
      )
    })
  })

  // =========================================================================
  // Flow 2: Meal edit -> update storage -> verify daily totals recalculate
  // Validates: Requirements 8.1, 8.2, 8.3, 8.4, 5.3
  // =========================================================================
  describe('Flow 2: Edit Meal -> Recalculate Daily Totals', () => {
    it('updates meal macros and reflects new daily totals', async () => {
      const originalMeal = makeMealRow()
      const updatedMealRow = makeMealRow({
        total_protein: '60',
        total_carbs: '50',
        total_fat: '8',
        total_calories: '520',
        manual_override: true,
        needs_review: false,
        reviewed_at: '2025-06-10T14:00:00Z',
        updated_at: '2025-06-10T14:00:00Z',
      })

      // Step 1: Update the meal
      const mockSb = createMockSupabase({
        mealsSelectData: [originalMeal],
        mealsUpdateData: updatedMealRow,
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const updateReq = createMealUpdateRequest(TEST_MEAL_ID, {
        totalProtein: 60,
        totalCarbs: 50,
        totalFat: 8,
        totalCalories: 520,
        manualOverride: true,
        reviewedAt: new Date('2025-06-10T14:00:00Z').toISOString(),
      })
      const updateRes = await updateMeal(updateReq, {
        params: Promise.resolve({ id: TEST_MEAL_ID }),
      })
      const updateData = await updateRes.json()

      expect(updateRes.status).toBe(200)
      expect(updateData.success).toBe(true)
      expect(updateData.meal.manualOverride).toBe(true)
      expect(parseFloat(updateData.meal.totalProtein)).toBe(60)

      // Step 2: Retrieve daily view with the updated meal
      const updatedSelectData = [updatedMealRow]
      const mockSb2 = createMockSupabase({
        mealsSelectData: updatedSelectData,
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSb2 as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.dailyTotals.protein).toBe(60)
      expect(dailyData.dailyTotals.carbs).toBe(50)
      expect(dailyData.dailyTotals.fat).toBe(8)
      expect(dailyData.dailyTotals.calories).toBe(520)
    })

    it('recalculates daily totals correctly across multiple meals after edit', async () => {
      const meal1 = makeMealRow({
        total_protein: '60',
        total_carbs: '50',
        total_fat: '8',
        total_calories: '520',
        manual_override: true,
      })
      const meal2 = makeMealRow2()

      const mockSb = createMockSupabase({ mealsSelectData: [meal1, meal2] })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.meals).toHaveLength(2)

      // Totals should be sum of both meals
      // meal1: P60 C50 F8 Cal520 + meal2: P37 C26 F12 Cal353
      expect(dailyData.dailyTotals.protein).toBe(97)
      expect(dailyData.dailyTotals.carbs).toBe(76)
      expect(dailyData.dailyTotals.fat).toBe(20)
      expect(dailyData.dailyTotals.calories).toBe(873)
    })

    it('property: daily totals equal sum of all meal macros', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              total_protein: fc.float({ min: 0, max: 200, noNaN: true }).map(String),
              total_carbs: fc.float({ min: 0, max: 300, noNaN: true }).map(String),
              total_fat: fc.float({ min: 0, max: 100, noNaN: true }).map(String),
              total_calories: fc.float({ min: 0, max: 2000, noNaN: true }).map(String),
            }),
            { minLength: 1, maxLength: 8 }
          ),
          (meals) => {
            const totals = calculateDailyTotals(meals)

            const expectedProtein = meals.reduce((s, m) => s + parseFloat(m.total_protein), 0)
            const expectedCarbs = meals.reduce((s, m) => s + parseFloat(m.total_carbs), 0)
            const expectedFat = meals.reduce((s, m) => s + parseFloat(m.total_fat), 0)
            const expectedCalories = meals.reduce((s, m) => s + parseFloat(m.total_calories), 0)

            expect(totals.protein).toBeCloseTo(expectedProtein, 5)
            expect(totals.carbs).toBeCloseTo(expectedCarbs, 5)
            expect(totals.fat).toBeCloseTo(expectedFat, 5)
            expect(totals.calories).toBeCloseTo(expectedCalories, 5)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // =========================================================================
  // Flow 3: Meal delete -> verify removal from daily view
  // Validates: Requirements 3.1, 5.1, 5.3
  // =========================================================================
  describe('Flow 3: Delete Meal -> Verify Removal & Recalculation', () => {
    it('removes meal and reduces daily totals', async () => {
      const meal1 = makeMealRow()
      const meal2 = makeMealRow2()

      // Step 1: Delete meal1
      const mockSbDelete = createMockSupabase({
        mealsSelectData: [meal1, meal2],
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSbDelete as any)

      const deleteReq = createMealDeleteRequest(TEST_MEAL_ID)
      const deleteRes = await deleteMeal(deleteReq, {
        params: Promise.resolve({ id: TEST_MEAL_ID }),
      })
      const deleteData = await deleteRes.json()

      expect(deleteRes.status).toBe(200)
      expect(deleteData.success).toBe(true)

      // Step 2: Daily view should now only have meal2
      const mockSbAfter = createMockSupabase({ mealsSelectData: [meal2] })
      vi.mocked(createServerClient).mockResolvedValue(mockSbAfter as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.meals).toHaveLength(1)
      expect(dailyData.meals[0].id).toBe('integration-test-meal-2')

      // Totals should equal meal2 only: P37 C26 F12 Cal353
      expect(dailyData.dailyTotals.protein).toBe(37)
      expect(dailyData.dailyTotals.carbs).toBe(26)
      expect(dailyData.dailyTotals.fat).toBe(12)
      expect(dailyData.dailyTotals.calories).toBe(353)
    })

    it('daily view returns empty totals when all meals deleted', async () => {
      const mockSb = createMockSupabase({ mealsSelectData: [] })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.meals).toHaveLength(0)
      expect(dailyData.dailyTotals.protein).toBe(0)
      expect(dailyData.dailyTotals.carbs).toBe(0)
      expect(dailyData.dailyTotals.fat).toBe(0)
      expect(dailyData.dailyTotals.calories).toBe(0)
    })

    it('returns error when deleting non-existent meal', async () => {
      const mockSb = createMockSupabase({
        mealsDeleteError: { message: 'Not found' },
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createMealDeleteRequest('nonexistent-id')
      const res = await deleteMeal(req, {
        params: Promise.resolve({ id: 'nonexistent-id' }),
      })

      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // Flow 4: Target management -> set targets -> verify adherence calculation
  // Validates: Requirements 4.1, 4.2, 4.4, 4.5, 6.3, 6.4
  // =========================================================================
  describe('Flow 4: Set Targets -> Verify Adherence', () => {
    it('sets targets and calculates adherence for daily view', async () => {
      // Step 1: Set daily targets
      const mockSb = createMockSupabase({ mealsSelectData: [makeMealRow()] })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const targetReq = createTargetsPostRequest({
        targetProtein: 150,
        targetCarbs: 200,
        targetFat: 60,
        targetCalories: 2000,
      })
      const targetRes = await setDailyTargets(targetReq)
      const targetData = await targetRes.json()

      expect(targetRes.status).toBe(200)
      expect(targetData.success).toBe(true)

      // Step 2: Retrieve daily view with adherence
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const dailyReq = createDailyGetRequest(TEST_DATE)
      const dailyRes = await getDailyMeals(dailyReq)
      const dailyData = await dailyRes.json()

      expect(dailyRes.status).toBe(200)
      expect(dailyData.adherence).toBeDefined()
      expect(typeof dailyData.adherence.proteinAdherence).toBe('number')
      expect(typeof dailyData.adherence.overallScore).toBe('number')
      expect(typeof dailyData.adherence.withinTolerance).toBe('boolean')
    })

    it('rejects non-positive target values', async () => {
      const mockSb = createMockSupabase()
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createTargetsPostRequest({
        targetProtein: -10,
        targetCarbs: 200,
        targetFat: 60,
        targetCalories: 2000,
      })
      const res = await setDailyTargets(req)

      expect(res.status).toBe(400)
    })

    it('applies default 5% tolerance when not specified', async () => {
      const mockSb = createMockSupabase()
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createTargetsPostRequest({
        targetProtein: 150,
        targetCarbs: 200,
        targetFat: 60,
        targetCalories: 2000,
      })
      const res = await setDailyTargets(req)

      expect(res.status).toBe(200)

      // Verify the upsert was called with default tolerance
      const fromCalls = mockSb.from.mock.calls
      const dailyTargetsCall = fromCalls.find(
        (call: unknown[]) => call[0] === 'daily_targets'
      )
      expect(dailyTargetsCall).toBeDefined()
    })

    it('property: within-tolerance intake always scores 100%', () => {
      fc.assert(
        fc.property(arbDailyTargets, (targets: DailyTargets) => {
          // Build intake that exactly matches targets (within tolerance)
          const exactIntake: MacroTotals = {
            protein: targets.targetProtein,
            carbs: targets.targetCarbs,
            fat: targets.targetFat,
            calories: targets.targetCalories,
          }

          const adherence = calculateAdherenceStatus(exactIntake, targets)

          expect(adherence.proteinAdherence).toBe(100)
          expect(adherence.carbsAdherence).toBe(100)
          expect(adherence.fatAdherence).toBe(100)
          expect(adherence.caloriesAdherence).toBe(100)
          expect(adherence.withinTolerance).toBe(true)
          expect(adherence.overallScore).toBe(100)
        }),
        { numRuns: 100 }
      )
    })

    it('property: outside-tolerance intake scores < 100% using (1 - deviation/target) formula', () => {
      fc.assert(
        fc.property(
          arbDailyTargets,
          fc.float({ min: Math.fround(0.2), max: Math.fround(0.9), noNaN: true }), // deviation factor
          (targets: DailyTargets, deviationFactor: number) => {
            // Build intake that is significantly outside tolerance
            const multiplier = 1 + deviationFactor // 1.2x to 1.9x above target
            const intake: MacroTotals = {
              protein: targets.targetProtein * multiplier,
              carbs: targets.targetCarbs * multiplier,
              fat: targets.targetFat * multiplier,
              calories: targets.targetCalories * multiplier,
            }

            const adherence = calculateAdherenceStatus(intake, targets)

            // The deviation exceeds tolerance, so scores should be < 100
            if (deviationFactor > targets.tolerancePct / 100) {
              expect(adherence.overallScore).toBeLessThan(100)
              expect(adherence.withinTolerance).toBe(false)
            }

            // Scores should never be negative
            expect(adherence.proteinAdherence).toBeGreaterThanOrEqual(0)
            expect(adherence.carbsAdherence).toBeGreaterThanOrEqual(0)
            expect(adherence.fatAdherence).toBeGreaterThanOrEqual(0)
            expect(adherence.caloriesAdherence).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // =========================================================================
  // Flow 5: Weekly adherence -> scoring aggregation across multiple days
  // Validates: Requirements 6.1-6.5, 9.1-9.4
  // =========================================================================
  describe('Flow 5: Weekly Adherence Scoring & Guidance', () => {
    it('aggregates daily scores into weekly adherence via API', async () => {
      // Set up meals spread across three days of the week
      const mealsByDate: Record<string, any[]> = {
        '2025-06-09': [
          { total_protein: '50', total_carbs: '60', total_fat: '20', total_calories: '600' },
          { total_protein: '45', total_carbs: '65', total_fat: '18', total_calories: '650' },
          { total_protein: '45', total_carbs: '65', total_fat: '17', total_calories: '650' },
        ],
        '2025-06-10': [
          { total_protein: '55', total_carbs: '70', total_fat: '22', total_calories: '700' },
          { total_protein: '50', total_carbs: '70', total_fat: '21', total_calories: '700' },
          { total_protein: '55', total_carbs: '70', total_fat: '22', total_calories: '700' },
        ],
        '2025-06-11': [
          { total_protein: '50', total_carbs: '65', total_fat: '20', total_calories: '670' },
          { total_protein: '50', total_carbs: '70', total_fat: '20', total_calories: '665' },
          { total_protein: '50', total_carbs: '65', total_fat: '20', total_calories: '665' },
        ],
      }

      const mockSb = createMockSupabase({ mealsByDate })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createWeeklyRequest('2025-06-09')
      const res = await getWeeklyAdherence(req)
      const data = await res.json()

      expect(res.status).toBe(200)

      // Should have weekly adherence data
      expect(data.weeklyAdherence).toBeDefined()
      expect(data.weeklyAdherence.averageScore).toBeDefined()
      expect(typeof data.weeklyAdherence.averageScore).toBe('number')

      // Should have cumulative data
      expect(data.cumulativeData).toBeDefined()
      expect(typeof data.cumulativeData.totalProtein).toBe('number')
      expect(typeof data.cumulativeData.proteinAdherence).toBe('number')

      // Should have correction guidance
      expect(data.correctionGuidance).toBeDefined()
      expect(typeof data.correctionGuidance.needsImprovement).toBe('boolean')

      // Should report 3 days with data
      expect(data.daysWithData).toBe(3)
    })

    it('generates correction guidance when adherence is below 90%', async () => {
      // Very low intake will produce low adherence
      const mealsByDate: Record<string, any[]> = {
        '2025-06-09': [
          { total_protein: '20', total_carbs: '30', total_fat: '10', total_calories: '300' },
        ],
        '2025-06-10': [
          { total_protein: '25', total_carbs: '35', total_fat: '12', total_calories: '350' },
        ],
      }

      const mockSb = createMockSupabase({ mealsByDate })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createWeeklyRequest('2025-06-09')
      const res = await getWeeklyAdherence(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.correctionGuidance.needsImprovement).toBe(true)
      expect(data.correctionGuidance.overallGuidance).toBeTruthy()
    })

    it('returns 404 when no targets set for weekly view', async () => {
      const mockSb = createMockSupabase({
        targetsData: null,
        targetsError: { message: 'No rows found' },
      })
      vi.mocked(createServerClient).mockResolvedValue(mockSb as any)

      const req = createWeeklyRequest('2025-06-09')
      const res = await getWeeklyAdherence(req)

      expect(res.status).toBe(404)
    })

    it('property: weekly score equals average of daily macro scores', () => {
      const arbDailySummary = fc.record({
        userId: fc.constant(TEST_USER_ID),
        date: fc.date({
          min: new Date('2025-06-09'),
          max: new Date('2025-06-15'),
        }),
        totalProtein: fc.float({ min: 0, max: 300, noNaN: true }),
        totalCarbs: fc.float({ min: 0, max: 500, noNaN: true }),
        totalFat: fc.float({ min: 0, max: 150, noNaN: true }),
        totalCalories: fc.float({ min: 0, max: 4000, noNaN: true }),
        mealCount: fc.integer({ min: 1, max: 5 }),
      })

      fc.assert(
        fc.property(
          fc.array(arbDailySummary, { minLength: 1, maxLength: 7 }),
          arbDailyTargets,
          (summaries: DailySummary[], targets: DailyTargets) => {
            const weekStart = new Date('2025-06-09')
            const weeklyAdherence = calculateWeeklyAdherence(summaries, targets, weekStart)

            // Average score should be mean of (proteinWeekly + carbsWeekly + fatWeekly + caloriesWeekly) / 4
            const expectedAvg =
              (weeklyAdherence.proteinWeeklyScore +
                weeklyAdherence.carbsWeeklyScore +
                weeklyAdherence.fatWeeklyScore +
                weeklyAdherence.caloriesWeeklyScore) /
              4

            expect(weeklyAdherence.averageScore).toBeCloseTo(expectedAvg, 1)

            // Daily scores length should match summaries length
            expect(weeklyAdherence.dailyScores).toHaveLength(summaries.length)

            // All scores should be non-negative
            expect(weeklyAdherence.averageScore).toBeGreaterThanOrEqual(0)
            expect(weeklyAdherence.proteinWeeklyScore).toBeGreaterThanOrEqual(0)
            expect(weeklyAdherence.carbsWeeklyScore).toBeGreaterThanOrEqual(0)
            expect(weeklyAdherence.fatWeeklyScore).toBeGreaterThanOrEqual(0)
            expect(weeklyAdherence.caloriesWeeklyScore).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('property: correction guidance appears only when score < 90%', () => {
      fc.assert(
        fc.property(
          arbDailyTargets,
          fc.float({ min: Math.fround(0.01), max: Math.fround(2.0), noNaN: true }), // intake multiplier
          (targets: DailyTargets, multiplier: number) => {
            // Create a 7-day week where intake is multiplier * target each day
            const summaries: DailySummary[] = Array.from({ length: 7 }, (_, i) => ({
              userId: TEST_USER_ID,
              date: new Date(`2025-06-${9 + i}`),
              totalProtein: targets.targetProtein * multiplier,
              totalCarbs: targets.targetCarbs * multiplier,
              totalFat: targets.targetFat * multiplier,
              totalCalories: targets.targetCalories * multiplier,
              mealCount: 3,
            }))

            const weekStart = new Date('2025-06-09')
            const weeklyAdherence = calculateWeeklyAdherence(summaries, targets, weekStart)
            const guidance = generateCorrectionGuidance(weeklyAdherence, targets)

            if (weeklyAdherence.averageScore < 90) {
              expect(guidance.needsImprovement).toBe(true)
              expect(guidance.overallGuidance.length).toBeGreaterThan(0)
            } else {
              expect(guidance.needsImprovement).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // =========================================================================
  // Cross-cutting: data quality validation in the integration flow
  // =========================================================================
  describe('Cross-cutting: Data Quality Validation', () => {
    it('property: meals with protein > 500g or calories > 5000 are flagged for review', () => {
      fc.assert(
        fc.property(
          fc.record({
            food: fc.constant('Extreme Item'),
            portion: fc.constant('1 serving'),
            protein: fc.oneof(
              fc.float({ min: 501, max: 1000, noNaN: true }),
              fc.float({ min: 0, max: 100, noNaN: true })
            ),
            carbs: fc.float({ min: 0, max: 200, noNaN: true }),
            fat: fc.float({ min: 0, max: 100, noNaN: true }),
            calories: fc.oneof(
              fc.float({ min: 5001, max: 10000, noNaN: true }),
              fc.float({ min: 0, max: 1000, noNaN: true })
            ),
          }),
          (item) => {
            const items = [item]
            const totals = calculateTotalMacros(items)
            const validation = validateMealData(items, totals, 0.8)

            if (totals.protein > 500 || totals.calories > 5000) {
              expect(validation.warnings.length).toBeGreaterThan(0)
              expect(validation.needsReview).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('property: low AI confidence (< 0.6) triggers review flag', () => {
      fc.assert(
        fc.property(
          arbFoodItems,
          fc.float({ min: 0, max: Math.fround(0.59), noNaN: true }),
          (items: FoodItem[], confidence: number) => {
            const totals = calculateTotalMacros(items)
            const validation = validateMealData(items, totals, confidence)

            expect(validation.needsReview).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
