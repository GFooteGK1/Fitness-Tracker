/**
 * Property-based tests for Query API Route
 * Feature: holistic-query-system
 * Validates: Requirements 7.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the auth module before importing the route
vi.mock('../../app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock response' }],
      }),
    },
  })),
}));

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

// Mock Supabase client factory for authenticated user
function createAuthenticatedMockSupabase(userId: string) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: [], error: null }),
    }),
  };
}

// Mock Supabase client factory for unauthenticated user
function createUnauthenticatedMockSupabase(errorType: 'no_user' | 'auth_error' | 'expired_session') {
  const errors: Record<string, { user: null; error: { message: string } | null }> = {
    no_user: { user: null, error: null },
    auth_error: { user: null, error: { message: 'Invalid token' } },
    expired_session: { user: null, error: { message: 'Session expired' } },
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: errors[errorType],
        error: errors[errorType].error,
      }),
    },
    from: vi.fn(),
  };
}

describe('Query Route Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 10: Unauthenticated requests are rejected
   * For any query request without valid authentication, the Query Router SHALL return
   * a 401 Unauthorized status and SHALL NOT fetch any user data.
   * Validates: Requirements 7.4
   */
  it('Property 10: Unauthenticated requests are rejected', async () => {
    // Generator for various question strings
    const questionGen = fc.string({ minLength: 1, maxLength: 500 });
    
    // Generator for different unauthenticated scenarios
    const unauthScenarioGen = fc.constantFrom('no_user', 'auth_error', 'expired_session') as fc.Arbitrary<'no_user' | 'auth_error' | 'expired_session'>;

    await fc.assert(
      fc.asyncProperty(
        questionGen,
        unauthScenarioGen,
        async (question, scenario) => {
          // Setup unauthenticated mock
          const mockSupabase = createUnauthenticatedMockSupabase(scenario);
          vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

          // Create request with the question
          const request = createMockRequest({ question });

          // Execute the route handler
          const response = await POST(request);

          // Verify 401 status is returned
          expect(response.status).toBe(401);

          // Verify error message
          const body = await response.json();
          expect(body).toHaveProperty('error');
          expect(body.error).toBe('Unauthorized');

          // Verify no data fetching occurred (from() should not be called)
          expect(mockSupabase.from).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional unit tests for authentication edge cases
   */
  describe('Authentication Unit Tests', () => {
    it('returns 401 when no session cookie exists', async () => {
      const mockSupabase = createUnauthenticatedMockSupabase('no_user');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: 'What is my deadlift PR?' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when session is expired', async () => {
      const mockSupabase = createUnauthenticatedMockSupabase('expired_session');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: 'How much protein did I eat?' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when token is invalid', async () => {
      const mockSupabase = createUnauthenticatedMockSupabase('auth_error');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: 'Show me my workouts' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('does not fetch user data when unauthenticated', async () => {
      const mockSupabase = createUnauthenticatedMockSupabase('no_user');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: 'What is my deadlift PR?' });
      await POST(request);

      // Verify from() was never called (no data fetching)
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  /**
   * Input validation tests
   */
  describe('Input Validation Tests', () => {
    it('returns 400 when question is missing', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({});
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Question is required');
    });

    it('returns 400 when question is empty string', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: '' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Question is required');
    });

    it('returns 400 when question is only whitespace', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const request = createMockRequest({ question: '   \n\t  ' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Question is required');
    });

    it('returns 400 when question exceeds max length', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const longQuestion = 'a'.repeat(2001);
      const request = createMockRequest({ question: longQuestion });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Question too long');
    });

    it('accepts question at max length', async () => {
      const mockSupabase = createAuthenticatedMockSupabase('test-user-id');
      vi.mocked(createServerClient).mockResolvedValue(mockSupabase as any);

      const maxLengthQuestion = 'a'.repeat(2000);
      const request = createMockRequest({ question: maxLengthQuestion });
      const response = await POST(request);

      // Should not return 400 for length
      expect(response.status).not.toBe(400);
    });
  });
});
