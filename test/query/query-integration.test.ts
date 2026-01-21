/**
 * Integration tests for full Query API flow
 * Feature: holistic-query-system
 * Validates: Requirements 1.1, 2.1, 2.2, 2.3, 7.1, 7.3, 7.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store mock functions for Anthropic to control behavior per test
const mockAnthropicCreate = vi.fn();

// Mock the auth module before importing the route
vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

// Mock Anthropic as a class constructor using a function that can be called with new
vi.mock('@anthropic-ai/sdk', () => {
  // Create a mock class
  const MockAnthropic = function() {
    return {
      messages: {
        create: mockAnthropicCreate,
      },
    };
  };
  return {
    default: MockAnthropic,
  };
});

import { POST } from '../../app/api/query/route';
import { createServerClient } from '../../app/lib/auth/supabase-server';

// Helper to create a mock request
function createMockRequest(body: object): Request {
  return new Request('http://localhost:3000/api/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// Sample test data
const sampleWorkouts = [
  {
    workout_date: '2026-01-15',
    input_text: 'Back Squat 5x5 @ 225lbs, then 3x10 Romanian Deadlifts @ 135lbs',
    primary_score: '225lbs',
    blocks: null,
    rpe: 8,
    tags: ['strength', 'legs'],
  },
  {
    workout_date: '2026-01-14',
    input_text: 'AMRAP 20: 5 Pull-ups, 10 Push-ups, 15 Air Squats',
    primary_score: '12 rounds',
    blocks: null,
    rpe: 9,
    tags: ['metcon', 'bodyweight'],
  },
];

const sampleBenchmarkPrs = [
  {
    benchmark_name: 'Fran',
    date: '2026-01-10',
    score_value: 180,
    score_display: '3:00',
    rx_status: 'rx',
  },
];

const sampleMeals = [
  {
    meal_timestamp: '2026-01-15T08:00:00Z',
    meal_name: 'Breakfast',
    total_protein: '35',
    total_carbs: '45',
    total_fat: '15',
    total_calories: '450',
    meal_timing: 'pre_workout',
  },
  {
    meal_timestamp: '2026-01-15T12:30:00Z',
    meal_name: 'Lunch',
    total_protein: '45',
    total_carbs: '60',
    total_fat: '20',
    total_calories: '600',
    meal_timing: 'post_workout',
  },
];

const sampleDailyTargets = {
  target_protein: '180',
  target_carbs: '250',
  target_fat: '70',
  target_calories: '2400',
};


// Mock Supabase client factory for authenticated user with data
function createAuthenticatedMockSupabase(
  userId: string,
  data: {
    workouts?: any[];
    benchmarkPrs?: any[];
    meals?: any[];
    dailyTargets?: any;
  } = {}
) {
  const createQueryBuilder = (tableName: string) => {
    let tableData: any[] = [];
    let isSingle = false;

    if (tableName === 'workouts') {
      tableData = data.workouts || [];
    } else if (tableName === 'benchmark_prs') {
      tableData = data.benchmarkPrs || [];
    } else if (tableName === 'meals') {
      tableData = data.meals || [];
    } else if (tableName === 'daily_targets') {
      tableData = data.dailyTargets ? [data.dailyTargets] : [];
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
        if (isSingle) {
          resolve({ 
            data: tableData[0] || null, 
            error: tableData.length === 0 ? { code: 'PGRST116' } : null 
          });
        } else {
          resolve({ data: tableData, error: null });
        }
      },
    };
    return builder;
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn((tableName: string) => createQueryBuilder(tableName)),
  };
}

// Mock Supabase client factory for unauthenticated user
function createUnauthenticatedMockSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
    from: vi.fn(),
  };
}

// Mock Supabase client factory that simulates database errors
function createErrorMockSupabase(userId: string, errorTable: string) {
  const createQueryBuilder = (tableName: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (resolve: any) => {
        if (tableName === errorTable) {
          resolve({ data: null, error: { message: `Failed to fetch ${tableName}` } });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    return builder;
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn((tableName: string) => createQueryBuilder(tableName)),
  };
}


describe('Query API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for Anthropic - successful response
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Mock AI response for integration test' }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Workout-only query end-to-end', () => {
    /**
     * Tests the full flow for workout-only queries:
     * 1. User submits a workout-related question
     * 2. Intent classifier identifies WORKOUT_ONLY intent
     * 3. Domain fetcher retrieves only workout data
     * 4. Response generator uses workout prompt
     * 5. Returns successful response with metadata
     * Validates: Requirements 1.1, 2.1
     */
    it('processes workout-only query with full data flow', async () => {
      const userId = 'test-user-workout';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'What is my deadlift PR?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.answer).toBeDefined();
      expect(body.metadata).toBeDefined();
      expect(body.metadata.intent).toBe('WORKOUT_ONLY');
      expect(body.metadata.dataFetched).toHaveProperty('workouts');
      expect(body.metadata.dataFetched).toHaveProperty('prs');
      expect(body.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('fetches only workout-related tables for workout questions', async () => {
      const userId = 'test-user-workout-tables';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'Show me my squat progress',
      });

      await POST(request);

      // Verify only workout-related tables were queried
      const fromCalls = mockSupabase.from.mock.calls.map(call => call[0]);
      expect(fromCalls).toContain('workouts');
      expect(fromCalls).toContain('benchmark_prs');
      expect(fromCalls).not.toContain('meals');
      expect(fromCalls).not.toContain('daily_targets');
    });

    it('handles workout query with empty workout data', async () => {
      const userId = 'test-user-no-workouts';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: [],
        benchmarkPrs: [],
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'What is my bench press PR?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      // Should return helpful message about no workout data
      expect(body.answer).toContain("don't see any workout data");
    });
  });


  describe('Nutrition-only query end-to-end', () => {
    /**
     * Tests the full flow for nutrition-only queries:
     * 1. User submits a nutrition-related question
     * 2. Intent classifier identifies NUTRITION_ONLY intent
     * 3. Domain fetcher retrieves only nutrition data
     * 4. Response generator uses nutrition prompt
     * 5. Returns successful response with metadata
     * Validates: Requirements 1.1, 2.2
     */
    it('processes nutrition-only query with full data flow', async () => {
      const userId = 'test-user-nutrition';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        meals: sampleMeals,
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      // Use a clear nutrition-only question with explicit nutrition keyword
      const request = createMockRequest({
        question: 'What are my daily calories?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.answer).toBeDefined();
      expect(body.metadata).toBeDefined();
      expect(body.metadata.intent).toBe('NUTRITION_ONLY');
      expect(body.metadata.dataFetched).toHaveProperty('meals');
      expect(body.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('fetches only nutrition-related tables for nutrition questions', async () => {
      const userId = 'test-user-nutrition-tables';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        meals: sampleMeals,
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'What are my macros for this week?',
      });

      await POST(request);

      // Verify only nutrition-related tables were queried
      const fromCalls = mockSupabase.from.mock.calls.map(call => call[0]);
      expect(fromCalls).toContain('meals');
      expect(fromCalls).toContain('daily_targets');
      expect(fromCalls).not.toContain('workouts');
      expect(fromCalls).not.toContain('benchmark_prs');
    });

    it('handles nutrition query with empty meal data', async () => {
      const userId = 'test-user-no-meals';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        meals: [],
        dailyTargets: null,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How many calories did I eat yesterday?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      // Should return helpful message about no meal data
      expect(body.answer).toContain("don't see any meal data");
    });
  });


  describe('Cross-domain query end-to-end', () => {
    /**
     * Tests the full flow for cross-domain queries:
     * 1. User submits a question about correlations
     * 2. Intent classifier identifies CROSS_DOMAIN intent
     * 3. Domain fetcher retrieves both workout and nutrition data
     * 4. Response generator uses cross-domain prompt
     * 5. Returns successful response with metadata
     * Validates: Requirements 1.1, 2.3
     */
    it('processes cross-domain query with full data flow', async () => {
      const userId = 'test-user-cross-domain';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
        meals: sampleMeals,
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my diet affect my workout performance?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.answer).toBeDefined();
      expect(body.metadata).toBeDefined();
      expect(body.metadata.intent).toBe('CROSS_DOMAIN');
      expect(body.metadata.dataFetched).toHaveProperty('workouts');
      expect(body.metadata.dataFetched).toHaveProperty('meals');
      expect(body.metadata.dataFetched).toHaveProperty('prs');
      expect(body.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('fetches both workout and nutrition tables for cross-domain questions', async () => {
      const userId = 'test-user-cross-domain-tables';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
        meals: sampleMeals,
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my protein intake impact my strength gains?',
      });

      await POST(request);

      // Verify both workout and nutrition tables were queried
      const fromCalls = mockSupabase.from.mock.calls.map(call => call[0]);
      expect(fromCalls).toContain('workouts');
      expect(fromCalls).toContain('benchmark_prs');
      expect(fromCalls).toContain('meals');
      expect(fromCalls).toContain('daily_targets');
    });

    it('handles cross-domain query with partial data (only workouts)', async () => {
      const userId = 'test-user-partial-workouts';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
        meals: [],
        dailyTargets: null,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my nutrition affect my lifts?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      // Should still return a response (AI will handle partial data)
      expect(body.answer).toBeDefined();
    });

    it('handles cross-domain query with no data at all', async () => {
      const userId = 'test-user-no-data';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: [],
        benchmarkPrs: [],
        meals: [],
        dailyTargets: null,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my diet affect my performance?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      // Should return helpful message about no data
      expect(body.answer).toContain("don't see enough data");
    });
  });


  describe('Error scenarios', () => {
    /**
     * Tests error handling for authentication failures
     * Validates: Requirements 7.4
     */
    describe('Authentication errors', () => {
      it('returns 401 for unauthenticated requests', async () => {
        const mockSupabase = createUnauthenticatedMockSupabase();
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const request = createMockRequest({
          question: 'What is my deadlift PR?',
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('Unauthorized');
        // Verify no data fetching occurred
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });
    });

    /**
     * Tests error handling for input validation
     * Validates: Requirements 7.1
     */
    describe('Input validation errors', () => {
      it('returns 400 for missing question', async () => {
        const mockSupabase = createAuthenticatedMockSupabase('test-user');
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const request = createMockRequest({});

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Question is required');
      });

      it('returns 400 for empty question', async () => {
        const mockSupabase = createAuthenticatedMockSupabase('test-user');
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const request = createMockRequest({ question: '' });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Question is required');
      });

      it('returns 400 for question exceeding max length', async () => {
        const mockSupabase = createAuthenticatedMockSupabase('test-user');
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const longQuestion = 'a'.repeat(2001);
        const request = createMockRequest({ question: longQuestion });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Question too long');
      });

      it('returns 400 for invalid JSON body', async () => {
        const mockSupabase = createAuthenticatedMockSupabase('test-user');
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const request = new Request('http://localhost:3000/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json',
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Invalid request body');
      });
    });

    /**
     * Tests error handling for AI provider failures
     * Validates: Requirements 7.3
     */
    describe('AI provider errors', () => {
      it('returns error response for general API errors', async () => {
        const mockSupabase = createAuthenticatedMockSupabase('test-user', {
          workouts: sampleWorkouts,
          benchmarkPrs: sampleBenchmarkPrs,
        });
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        // Mock Anthropic to throw general API error
        const apiError = new Error('API Error');
        mockAnthropicCreate.mockRejectedValue(apiError);

        const request = createMockRequest({
          question: 'What is my deadlift PR?',
        });

        const response = await POST(request);
        const body = await response.json();

        // Should return an error status (500 or 502 depending on error type)
        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(body.error).toBeDefined();
      });
    });

    /**
     * Tests error handling for database failures
     */
    describe('Database errors', () => {
      it('returns 500 for database fetch failures', async () => {
        const mockSupabase = createErrorMockSupabase('test-user', 'workouts');
        vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

        const request = createMockRequest({
          question: 'What is my deadlift PR?',
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBeDefined();
      });
    });
  });


  describe('Time window configuration', () => {
    it('uses default 180-day time window when not specified', async () => {
      const userId = 'test-user-default-window';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'What is my deadlift PR?',
      });

      await POST(request);

      // Verify the query was made (time window is applied internally)
      expect(mockSupabase.from).toHaveBeenCalledWith('workouts');
    });

    it('accepts custom time window in request', async () => {
      const userId = 'test-user-custom-window';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'What is my deadlift PR?',
        timeWindowDays: 30,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('Response metadata', () => {
    it('includes complete metadata in successful response', async () => {
      const userId = 'test-user-metadata';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts,
        benchmarkPrs: sampleBenchmarkPrs,
        meals: sampleMeals,
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my diet affect my performance?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.intent).toBe('CROSS_DOMAIN');
      expect(typeof body.metadata.confidence).toBe('number');
      expect(body.metadata.confidence).toBeGreaterThanOrEqual(0);
      expect(body.metadata.confidence).toBeLessThanOrEqual(1);
      expect(body.metadata.dataFetched).toBeDefined();
      expect(typeof body.metadata.processingTimeMs).toBe('number');
    });

    it('includes correct data counts in metadata', async () => {
      const userId = 'test-user-data-counts';
      const mockSupabase = createAuthenticatedMockSupabase(userId, {
        workouts: sampleWorkouts, // 2 workouts
        benchmarkPrs: sampleBenchmarkPrs, // 1 PR
        meals: sampleMeals, // 2 meals
        dailyTargets: sampleDailyTargets,
      });
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({
        question: 'How does my diet affect my performance?',
      });

      const response = await POST(request);
      const body = await response.json();

      expect(body.metadata.dataFetched.workouts).toBe(2);
      expect(body.metadata.dataFetched.prs).toBe(1);
      expect(body.metadata.dataFetched.meals).toBe(2);
    });
  });
});
