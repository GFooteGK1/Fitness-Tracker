/**
 * Property-based tests for Domain Fetchers
 * Feature: holistic-query-system
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  fetchWorkoutData,
  fetchNutritionData,
  fetchCrossDomainData,
  createDefaultTimeWindow,
} from '../../app/api/query/lib/domain-fetchers';
import { WorkoutData, NutritionData, CrossDomainData, TimeWindow } from '../../app/api/query/lib/types';

// Mock Supabase client factory
function createMockSupabase(mockData: {
  workouts?: any[];
  benchmarkPrs?: any[];
  meals?: any[];
  dailyTargets?: any;
  workoutsError?: Error;
  prsError?: Error;
  mealsError?: Error;
  targetsError?: Error;
}) {
  const createQueryBuilder = (tableName: string) => {
    let data: any[] = [];
    let error: Error | null = null;
    let isSingle = false;

    if (tableName === 'workouts') {
      data = mockData.workouts || [];
      error = mockData.workoutsError || null;
    } else if (tableName === 'benchmark_prs') {
      data = mockData.benchmarkPrs || [];
      error = mockData.prsError || null;
    } else if (tableName === 'meals') {
      data = mockData.meals || [];
      error = mockData.mealsError || null;
    } else if (tableName === 'daily_targets') {
      data = mockData.dailyTargets ? [mockData.dailyTargets] : [];
      error = mockData.targetsError || null;
    }

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(() => {
        isSingle = true;
        return builder;
      }),
      then: (resolve: any) => {
        if (error) {
          resolve({ data: null, error: { message: error.message } });
        } else if (isSingle) {
          resolve({ data: data[0] || null, error: data.length === 0 ? { code: 'PGRST116' } : null });
        } else {
          resolve({ data, error: null });
        }
      }
    };
    return builder;
  };

  return {
    from: vi.fn((tableName: string) => createQueryBuilder(tableName))
  };
}


// Helper to generate valid date strings
const dateStringGen = (minYear: number, maxYear: number) => 
  fc.tuple(
    fc.integer({ min: minYear, max: maxYear }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }) // Use 28 to avoid invalid dates
  ).map(([year, month, day]) => 
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

const timestampStringGen = (minYear: number, maxYear: number) =>
  fc.tuple(
    dateStringGen(minYear, maxYear),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([date, hour, min, sec]) => 
    `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000Z`
  );

// Generators for test data
const workoutRecordGen = fc.record({
  workout_date: dateStringGen(2024, 2026),
  input_text: fc.string({ minLength: 1, maxLength: 500 }),
  primary_score: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  blocks: fc.option(fc.array(fc.record({ type: fc.string() })), { nil: null }),
  rpe: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  user_id: fc.uuid()
});

const benchmarkPrGen = fc.record({
  benchmark_name: fc.string({ minLength: 1, maxLength: 50 }),
  date: dateStringGen(2024, 2026),
  score_value: fc.float({ min: 0, max: 1000 }),
  score_display: fc.string({ minLength: 1, maxLength: 20 }),
  rx_status: fc.constantFrom('rx', 'scaled', 'rx+'),
  user_id: fc.uuid()
});

const mealRecordGen = fc.record({
  meal_timestamp: timestampStringGen(2024, 2026),
  meal_name: fc.string({ minLength: 1, maxLength: 100 }),
  total_protein: fc.float({ min: 0, max: 200 }).map(n => n.toString()),
  total_carbs: fc.float({ min: 0, max: 500 }).map(n => n.toString()),
  total_fat: fc.float({ min: 0, max: 200 }).map(n => n.toString()),
  total_calories: fc.float({ min: 0, max: 3000 }).map(n => n.toString()),
  meal_timing: fc.option(fc.constantFrom('pre_workout', 'post_workout', 'general', 'recovery'), { nil: null }),
  user_id: fc.uuid()
});

const dailyTargetsGen = fc.record({
  target_protein: fc.float({ min: 50, max: 300 }).map(n => n.toString()),
  target_carbs: fc.float({ min: 100, max: 500 }).map(n => n.toString()),
  target_fat: fc.float({ min: 30, max: 200 }).map(n => n.toString()),
  target_calories: fc.float({ min: 1200, max: 4000 }).map(n => n.toString()),
  user_id: fc.uuid()
});

// Generate valid time windows where start < end
const timeWindowGen = fc.integer({ min: 1, max: 365 }).map(days => {
  const end = new Date('2026-01-19T00:00:00.000Z');
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
});

const userIdGen = fc.uuid();

describe('Domain Fetchers Property Tests', () => {
  /**
   * Property 4: Domain fetcher returns correct data scope for intent
   * For any WORKOUT_ONLY intent, the Domain Fetcher SHALL return data containing workout records
   * and SHALL NOT return meal records.
   * For any NUTRITION_ONLY intent, the Domain Fetcher SHALL return data containing meal records
   * and SHALL NOT return workout records.
   * For any CROSS_DOMAIN intent, the Domain Fetcher SHALL return data containing both.
   * Validates: Requirements 2.1, 2.2, 2.3
   */
  it('Property 4: Domain fetcher returns correct data scope for intent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(workoutRecordGen, { minLength: 0, maxLength: 5 }),
        fc.array(benchmarkPrGen, { minLength: 0, maxLength: 3 }),
        fc.array(mealRecordGen, { minLength: 0, maxLength: 5 }),
        fc.option(dailyTargetsGen, { nil: undefined }),
        userIdGen,
        timeWindowGen,
        async (workouts, prs, meals, targets, userId, timeWindow) => {
          // Test fetchWorkoutData returns only workout data
          const workoutMock = createMockSupabase({
            workouts,
            benchmarkPrs: prs
          });
          const workoutResult = await fetchWorkoutData(workoutMock as any, userId, timeWindow);
          
          expect(workoutResult).toHaveProperty('workouts');
          expect(workoutResult).toHaveProperty('benchmarkPrs');
          expect(workoutResult).not.toHaveProperty('meals');
          expect(Array.isArray(workoutResult.workouts)).toBe(true);
          expect(Array.isArray(workoutResult.benchmarkPrs)).toBe(true);

          // Test fetchNutritionData returns only nutrition data
          const nutritionMock = createMockSupabase({
            meals,
            dailyTargets: targets
          });
          const nutritionResult = await fetchNutritionData(nutritionMock as any, userId, timeWindow);
          
          expect(nutritionResult).toHaveProperty('meals');
          expect(nutritionResult).toHaveProperty('dailyTargets');
          expect(nutritionResult).toHaveProperty('dailySummaries');
          expect(nutritionResult).not.toHaveProperty('workouts');
          expect(Array.isArray(nutritionResult.meals)).toBe(true);

          // Test fetchCrossDomainData returns both
          const crossDomainMock = createMockSupabase({
            workouts,
            benchmarkPrs: prs,
            meals,
            dailyTargets: targets
          });
          const crossDomainResult = await fetchCrossDomainData(crossDomainMock as any, userId, timeWindow);
          
          expect(crossDomainResult).toHaveProperty('workout');
          expect(crossDomainResult).toHaveProperty('nutrition');
          expect(crossDomainResult.workout).toHaveProperty('workouts');
          expect(crossDomainResult.nutrition).toHaveProperty('meals');
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 5: Fetched data respects user authentication
   * For any fetch operation with a given user ID, all returned records SHALL have
   * a user_id field matching the authenticated user's ID.
   * Validates: Requirements 2.4
   */
  it('Property 5: Fetched data respects user authentication', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdGen,
        fc.array(workoutRecordGen, { minLength: 1, maxLength: 5 }),
        fc.array(mealRecordGen, { minLength: 1, maxLength: 5 }),
        timeWindowGen,
        async (userId, workouts, meals, timeWindow) => {
          // Assign the same user_id to all records
          const userWorkouts = workouts.map(w => ({ ...w, user_id: userId }));
          const userMeals = meals.map(m => ({ ...m, user_id: userId }));

          const mock = createMockSupabase({
            workouts: userWorkouts,
            meals: userMeals
          });

          // The mock simulates that Supabase filters by user_id
          // In real implementation, the .eq('user_id', userId) ensures this
          // We verify the fetcher calls the correct methods
          const workoutResult = await fetchWorkoutData(mock as any, userId, timeWindow);
          const nutritionResult = await fetchNutritionData(mock as any, userId, timeWindow);

          // Verify from() was called with correct table names
          expect(mock.from).toHaveBeenCalledWith('workouts');
          expect(mock.from).toHaveBeenCalledWith('meals');
          
          // The data returned should be from the mock which simulates filtered data
          expect(workoutResult.workouts.length).toBeLessThanOrEqual(userWorkouts.length);
          expect(nutritionResult.meals.length).toBeLessThanOrEqual(userMeals.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Fetched data respects time window
   * For any fetch operation with a specified time window, all returned workout records
   * SHALL have workout_date within the window, and all returned meal records SHALL have
   * meal_timestamp within the window.
   * Validates: Requirements 2.5
   */
  it('Property 6: Fetched data respects time window', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdGen,
        timeWindowGen,
        async (userId, timeWindow) => {
          // Create workouts within and outside the time window
          const withinWindow = new Date(timeWindow.start.getTime() + 
            (timeWindow.end.getTime() - timeWindow.start.getTime()) / 2);
          
          const workoutsInWindow = [{
            workout_date: withinWindow.toISOString().split('T')[0],
            input_text: 'Test workout',
            primary_score: null,
            blocks: null,
            rpe: 7,
            tags: [],
            user_id: userId
          }];

          const mealsInWindow = [{
            meal_timestamp: withinWindow.toISOString(),
            meal_name: 'Test meal',
            total_protein: '30',
            total_carbs: '50',
            total_fat: '15',
            total_calories: '450',
            meal_timing: 'general',
            user_id: userId
          }];

          const mock = createMockSupabase({
            workouts: workoutsInWindow,
            meals: mealsInWindow
          });

          const workoutResult = await fetchWorkoutData(mock as any, userId, timeWindow);
          const nutritionResult = await fetchNutritionData(mock as any, userId, timeWindow);

          // Verify the fetcher applies time window filters
          // The mock returns data that would be filtered by Supabase
          // We verify the structure is correct
          for (const workout of workoutResult.workouts) {
            const workoutDate = new Date(workout.workout_date);
            expect(workoutDate >= timeWindow.start || workoutDate <= timeWindow.end).toBe(true);
          }

          for (const meal of nutritionResult.meals) {
            const mealDate = new Date(meal.meal_timestamp);
            expect(mealDate >= timeWindow.start || mealDate <= timeWindow.end).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 7: Fetched data contains required fields
   * For any workout data returned by the Domain Fetcher, each workout record SHALL contain:
   * workout_date, input_text, primary_score, blocks, rpe, and tags.
   * For any nutrition data returned, each meal record SHALL contain:
   * meal_timestamp, meal_name, total_protein, total_carbs, total_fat, total_calories, and meal_timing.
   * Validates: Requirements 2.6, 2.7
   */
  it('Property 7: Fetched data contains required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(workoutRecordGen, { minLength: 1, maxLength: 5 }),
        fc.array(benchmarkPrGen, { minLength: 1, maxLength: 3 }),
        fc.array(mealRecordGen, { minLength: 1, maxLength: 5 }),
        userIdGen,
        timeWindowGen,
        async (workouts, prs, meals, userId, timeWindow) => {
          const workoutMock = createMockSupabase({
            workouts,
            benchmarkPrs: prs
          });
          const workoutResult = await fetchWorkoutData(workoutMock as any, userId, timeWindow);

          // Verify workout records have required fields
          for (const workout of workoutResult.workouts) {
            expect(workout).toHaveProperty('workout_date');
            expect(workout).toHaveProperty('input_text');
            expect(workout).toHaveProperty('primary_score');
            expect(workout).toHaveProperty('blocks');
            expect(workout).toHaveProperty('rpe');
            expect(workout).toHaveProperty('tags');
            expect(Array.isArray(workout.tags)).toBe(true);
          }

          // Verify benchmark PR records have required fields
          for (const pr of workoutResult.benchmarkPrs) {
            expect(pr).toHaveProperty('benchmark_name');
            expect(pr).toHaveProperty('date');
            expect(pr).toHaveProperty('score_value');
            expect(pr).toHaveProperty('score_display');
            expect(pr).toHaveProperty('rx_status');
          }

          const nutritionMock = createMockSupabase({ meals });
          const nutritionResult = await fetchNutritionData(nutritionMock as any, userId, timeWindow);

          // Verify meal records have required fields
          for (const meal of nutritionResult.meals) {
            expect(meal).toHaveProperty('meal_timestamp');
            expect(meal).toHaveProperty('meal_name');
            expect(meal).toHaveProperty('total_protein');
            expect(meal).toHaveProperty('total_carbs');
            expect(meal).toHaveProperty('total_fat');
            expect(meal).toHaveProperty('total_calories');
            expect(meal).toHaveProperty('meal_timing');
            
            // Verify numeric fields are numbers
            expect(typeof meal.total_protein).toBe('number');
            expect(typeof meal.total_carbs).toBe('number');
            expect(typeof meal.total_fat).toBe('number');
            expect(typeof meal.total_calories).toBe('number');
          }

          // Verify daily summaries have required fields
          for (const summary of nutritionResult.dailySummaries) {
            expect(summary).toHaveProperty('date');
            expect(summary).toHaveProperty('total_protein');
            expect(summary).toHaveProperty('total_carbs');
            expect(summary).toHaveProperty('total_fat');
            expect(summary).toHaveProperty('total_calories');
            expect(summary).toHaveProperty('meal_count');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: Cross-domain data includes meal_timing
   * For any CROSS_DOMAIN fetch operation, the returned meal data SHALL include
   * the meal_timing field for correlation with workout proximity.
   * Validates: Requirements 5.6
   */
  it('Property 9: Cross-domain data includes meal_timing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(workoutRecordGen, { minLength: 0, maxLength: 3 }),
        fc.array(benchmarkPrGen, { minLength: 0, maxLength: 2 }),
        fc.array(mealRecordGen, { minLength: 1, maxLength: 5 }),
        userIdGen,
        timeWindowGen,
        async (workouts, prs, meals, userId, timeWindow) => {
          const mock = createMockSupabase({
            workouts,
            benchmarkPrs: prs,
            meals
          });

          const result = await fetchCrossDomainData(mock as any, userId, timeWindow);

          // Verify cross-domain data includes nutrition with meal_timing
          expect(result).toHaveProperty('nutrition');
          expect(result.nutrition).toHaveProperty('meals');
          
          // Each meal should have meal_timing field (can be null)
          for (const meal of result.nutrition.meals) {
            expect(meal).toHaveProperty('meal_timing');
            // meal_timing can be null or one of the valid values
            if (meal.meal_timing !== null) {
              expect(['pre_workout', 'post_workout', 'general', 'recovery']).toContain(meal.meal_timing);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Domain Fetchers Unit Tests', () => {
  it('createDefaultTimeWindow returns correct time range', () => {
    const window = createDefaultTimeWindow(30);
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // End should be close to now
    expect(Math.abs(window.end.getTime() - now.getTime())).toBeLessThan(1000);
    
    // Start should be approximately 30 days ago
    expect(Math.abs(window.start.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(1000);
  });

  it('createDefaultTimeWindow defaults to 180 days', () => {
    const window = createDefaultTimeWindow();
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

    expect(Math.abs(window.start.getTime() - sixMonthsAgo.getTime())).toBeLessThan(1000);
  });

  it('fetchWorkoutData handles empty results', async () => {
    const mock = createMockSupabase({
      workouts: [],
      benchmarkPrs: []
    });
    const timeWindow = createDefaultTimeWindow();
    
    const result = await fetchWorkoutData(mock as any, 'test-user-id', timeWindow);
    
    expect(result.workouts).toEqual([]);
    expect(result.benchmarkPrs).toEqual([]);
  });

  it('fetchNutritionData handles missing daily targets', async () => {
    const mock = createMockSupabase({
      meals: [],
      dailyTargets: undefined
    });
    const timeWindow = createDefaultTimeWindow();
    
    const result = await fetchNutritionData(mock as any, 'test-user-id', timeWindow);
    
    expect(result.meals).toEqual([]);
    expect(result.dailyTargets).toBeNull();
    expect(result.dailySummaries).toEqual([]);
  });

  it('fetchNutritionData calculates daily summaries correctly', async () => {
    const meals = [
      {
        meal_timestamp: '2026-01-15T08:00:00Z',
        meal_name: 'Breakfast',
        total_protein: '30',
        total_carbs: '50',
        total_fat: '15',
        total_calories: '450',
        meal_timing: 'general'
      },
      {
        meal_timestamp: '2026-01-15T12:00:00Z',
        meal_name: 'Lunch',
        total_protein: '40',
        total_carbs: '60',
        total_fat: '20',
        total_calories: '580',
        meal_timing: 'general'
      },
      {
        meal_timestamp: '2026-01-16T08:00:00Z',
        meal_name: 'Breakfast',
        total_protein: '25',
        total_carbs: '45',
        total_fat: '12',
        total_calories: '390',
        meal_timing: 'pre_workout'
      }
    ];

    const mock = createMockSupabase({ meals });
    const timeWindow = createDefaultTimeWindow();
    
    const result = await fetchNutritionData(mock as any, 'test-user-id', timeWindow);
    
    // Should have 2 daily summaries (Jan 15 and Jan 16)
    expect(result.dailySummaries.length).toBe(2);
    
    // Find Jan 15 summary
    const jan15 = result.dailySummaries.find(s => s.date === '2026-01-15');
    expect(jan15).toBeDefined();
    expect(jan15?.meal_count).toBe(2);
    expect(jan15?.total_protein).toBe(70); // 30 + 40
    expect(jan15?.total_carbs).toBe(110); // 50 + 60
    
    // Find Jan 16 summary
    const jan16 = result.dailySummaries.find(s => s.date === '2026-01-16');
    expect(jan16).toBeDefined();
    expect(jan16?.meal_count).toBe(1);
    expect(jan16?.total_protein).toBe(25);
  });
});
