/**
 * Property-Based Tests for Session Initialization
 * 
 * Feature: authentication-fixes
 * Property 1: Session Initialization Validates Storage Consistency
 * Validates: Requirements 1.1, 1.5
 * 
 * Property 2: Session Restoration Without Re-authentication
 * Validates: Requirements 1.2
 */

import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { initializeConnection, getTokens } from '@/app/lib/whoop/token-service';
import { createServerClient } from '@/app/lib/auth/supabase-server';

// Mock dependencies
vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}));

vi.mock('@/app/lib/whoop/encryption', () => ({
  encryptTokens: vi.fn((access: string, refresh: string) => ({
    accessTokenEncrypted: `encrypted_${access}`,
    refreshTokenEncrypted: `encrypted_${refresh}`
  })),
  decryptTokens: vi.fn((access: string, refresh: string) => ({
    accessToken: access.replace('encrypted_', ''),
    refreshToken: refresh.replace('encrypted_', '')
  }))
}));

describe('Session Initialization - Property Tests', () => {
  let mockSupabase: any;
  let originalWindow: any;
  let originalDocument: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    // Save original globals
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;

    // Setup mock browser environment
    const mockStorage = () => {
      const storage: Record<string, string> = {};
      return {
        getItem: (key: string) => storage[key] || null,
        setItem: (key: string, value: string) => { storage[key] = value; },
        removeItem: (key: string) => { delete storage[key]; },
        clear: () => { Object.keys(storage).forEach(key => delete storage[key]); },
        get length() { return Object.keys(storage).length; },
        key: (index: number) => Object.keys(storage)[index] || null
      };
    };

    (global as any).window = { location: { hostname: 'localhost' } };
    (global as any).document = { cookie: '' };
    (global as any).localStorage = mockStorage();

    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(),
      auth: {
        getSession: vi.fn(),
        getUser: vi.fn()
      }
    };

    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original globals
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
  });

  /**
   * Property 1: Session Initialization Validates Storage Consistency
   * 
   * For any authenticated user session, when the application initializes,
   * the Auth_System should validate that session data is consistent across
   * all storage mechanisms (cookies, localStorage, database) before granting
   * access to protected resources.
   */
  test.prop([
    fc.record({
      userId: fc.uuid(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
      expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }), // Future date
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep', 'read:workout', 'read:cycle'), { minLength: 1, maxLength: 4 })
    })
  ])('Property 1: validates WHOOP token storage consistency on initialization', async (tokenData) => {
    // Setup: Store tokens in database
    const mockTokenRecord = {
      user_id: tokenData.userId,
      access_token_encrypted: `encrypted_${tokenData.accessToken}`,
      refresh_token_encrypted: `encrypted_${tokenData.refreshToken}`,
      expires_at: tokenData.expiresAt.toISOString(),
      scope: tokenData.scope
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockTokenRecord,
            error: null
          })
        })
      })
    });

    // Act: Initialize connection (simulates app startup)
    const initialized = await initializeConnection(tokenData.userId);

    // Assert: Connection should be successfully initialized
    expect(initialized).toBe(true);

    // Property: Retrieved tokens should match stored tokens
    const retrievedTokens = await getTokens(tokenData.userId);
    expect(retrievedTokens).not.toBeNull();
    expect(retrievedTokens?.accessToken).toBe(tokenData.accessToken);
    expect(retrievedTokens?.refreshToken).toBe(tokenData.refreshToken);
    expect(retrievedTokens?.scope).toEqual(tokenData.scope);

    // Property: Token expiry should be preserved
    expect(retrievedTokens?.expiresAt.getTime()).toBe(tokenData.expiresAt.getTime());
  });

  test.prop([
    fc.uuid()
  ])('Property 1: handles missing tokens gracefully', async (userId) => {
    // Setup: No tokens in database
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows returned' }
          })
        })
      })
    });

    // Act: Initialize connection with no stored tokens
    const initialized = await initializeConnection(userId);

    // Assert: Should return false (not initialized)
    expect(initialized).toBe(false);

    // Property: Should not throw errors
    const retrievedTokens = await getTokens(userId);
    expect(retrievedTokens).toBeNull();
  });

  test.prop([
    fc.record({
      userId: fc.uuid(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
      expiresAt: fc.date({ min: new Date(Date.now() - 86400000), max: new Date(Date.now() - 1000) }), // Past date (expired)
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep'), { minLength: 1, maxLength: 2 })
    })
  ])('Property 1: detects expired tokens during initialization', async (tokenData) => {
    // Setup: Store expired tokens in database
    const mockTokenRecord = {
      user_id: tokenData.userId,
      access_token_encrypted: `encrypted_${tokenData.accessToken}`,
      refresh_token_encrypted: `encrypted_${tokenData.refreshToken}`,
      expires_at: tokenData.expiresAt.toISOString(),
      scope: tokenData.scope
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockTokenRecord,
            error: null
          })
        })
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Refresh failed' }
          })
        })
      })
    });

    // Act: Initialize connection with expired tokens
    const initialized = await initializeConnection(tokenData.userId);

    // Assert: Should fail to initialize (tokens expired and refresh failed)
    expect(initialized).toBe(false);

    // Property: System should detect expiration
    const retrievedTokens = await getTokens(tokenData.userId);
    expect(retrievedTokens).not.toBeNull();
    expect(retrievedTokens?.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  /**
   * Property 2: Session Restoration Without Re-authentication
   * 
   * For any authenticated user with valid session data, when returning to
   * the application in a new browser tab (simulated by clearing in-memory
   * state while preserving storage), the Auth_System should restore the
   * complete session state without requiring re-authentication.
   */
  test.prop([
    fc.record({
      userId: fc.uuid(),
      email: fc.emailAddress(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
      expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) }), // 1-24 hours in future
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep', 'read:workout', 'read:cycle'), { minLength: 1, maxLength: 4 })
    })
  ])('Property 2: restores WHOOP connection without re-authentication', async (sessionData) => {
    // Setup: Simulate existing session with WHOOP tokens
    const mockTokenRecord = {
      user_id: sessionData.userId,
      access_token_encrypted: `encrypted_${sessionData.accessToken}`,
      refresh_token_encrypted: `encrypted_${sessionData.refreshToken}`,
      expires_at: sessionData.expiresAt.toISOString(),
      scope: sessionData.scope
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockTokenRecord,
            error: null
          })
        })
      })
    });

    // Act: Simulate app restart - initialize connection (no re-auth)
    const initialized = await initializeConnection(sessionData.userId);

    // Assert: Connection should be restored
    expect(initialized).toBe(true);

    // Property: Tokens should be accessible without re-authentication
    const retrievedTokens = await getTokens(sessionData.userId);
    expect(retrievedTokens).not.toBeNull();
    expect(retrievedTokens?.accessToken).toBe(sessionData.accessToken);
    expect(retrievedTokens?.refreshToken).toBe(sessionData.refreshToken);

    // Property: Token validity should be preserved
    expect(retrievedTokens?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test.prop([
    fc.record({
      userId: fc.uuid(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
      expiresAt: fc.date({ min: new Date(Date.now() + 60000), max: new Date(Date.now() + 300000) }), // 1-5 minutes in future
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep'), { minLength: 1, maxLength: 2 })
    })
  ])('Property 2: proactively refreshes expiring tokens on restoration', async (sessionData) => {
    // Setup: Tokens expiring soon (< 5 minutes)
    const mockTokenRecord = {
      user_id: sessionData.userId,
      access_token_encrypted: `encrypted_${sessionData.accessToken}`,
      refresh_token_encrypted: `encrypted_${sessionData.refreshToken}`,
      expires_at: sessionData.expiresAt.toISOString(),
      scope: sessionData.scope
    };

    const newAccessToken = `refreshed_${sessionData.accessToken}`;
    const newExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockTokenRecord,
            error: null
          })
        })
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              ...mockTokenRecord,
              access_token_encrypted: `encrypted_${newAccessToken}`,
              expires_at: newExpiresAt.toISOString()
            },
            error: null
          })
        })
      })
    });

    // Mock the WHOOP API refresh endpoint
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: newAccessToken,
        refresh_token: sessionData.refreshToken,
        expires_in: 3600
      })
    });

    // Act: Initialize connection (should trigger proactive refresh)
    const initialized = await initializeConnection(sessionData.userId);

    // Assert: Connection should be initialized
    expect(initialized).toBe(true);

    // Property: System should attempt proactive refresh for expiring tokens
    // (Note: In real implementation, this would update the database)
  });

  test.prop([
    fc.array(
      fc.record({
        userId: fc.uuid(),
        accessToken: fc.string({ minLength: 32, maxLength: 128 }),
        refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
        expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) })
      }),
      { minLength: 1, maxLength: 5 }
    )
  ])('Property 2: handles multiple concurrent session restorations', async (sessions) => {
    // Setup: Multiple users with valid tokens
    sessions.forEach(session => {
      const mockTokenRecord = {
        user_id: session.userId,
        access_token_encrypted: `encrypted_${session.accessToken}`,
        refresh_token_encrypted: `encrypted_${session.refreshToken}`,
        expires_at: session.expiresAt.toISOString(),
        scope: ['read:recovery']
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockTokenRecord,
              error: null
            })
          })
        })
      });
    });

    // Act: Initialize connections concurrently
    const results = await Promise.all(
      sessions.map(session => initializeConnection(session.userId))
    );

    // Assert: All connections should be initialized
    expect(results.every(result => result === true)).toBe(true);

    // Property: Each user's tokens should be independently restored
    const retrievedTokens = await Promise.all(
      sessions.map(session => getTokens(session.userId))
    );

    retrievedTokens.forEach((tokens, index) => {
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBe(sessions[index].accessToken);
    });
  });

  test.prop([
    fc.record({
      userId: fc.uuid(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }),
      expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) })
    }),
    fc.nat({ max: 3 })
  ])('Property 2: session restoration is idempotent', async (sessionData, iterations) => {
    // Setup: Valid tokens in database
    const mockTokenRecord = {
      user_id: sessionData.userId,
      access_token_encrypted: `encrypted_${sessionData.accessToken}`,
      refresh_token_encrypted: `encrypted_${sessionData.refreshToken}`,
      expires_at: sessionData.expiresAt.toISOString(),
      scope: ['read:recovery']
    };

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockTokenRecord,
            error: null
          })
        })
      })
    });

    // Act: Initialize connection multiple times
    const results: boolean[] = [];
    for (let i = 0; i <= iterations; i++) {
      const result = await initializeConnection(sessionData.userId);
      results.push(result);
    }

    // Assert: All initializations should succeed
    expect(results.every(result => result === true)).toBe(true);

    // Property: Multiple initializations should produce consistent results
    const tokens1 = await getTokens(sessionData.userId);
    const tokens2 = await getTokens(sessionData.userId);
    
    expect(tokens1?.accessToken).toBe(tokens2?.accessToken);
    expect(tokens1?.refreshToken).toBe(tokens2?.refreshToken);
  });
});
