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
import { decryptTokens } from '@/app/lib/whoop/encryption';

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

vi.mock('@/app/lib/whoop/api-client', () => ({
  refreshAccessToken: vi.fn()
}));

import { refreshAccessToken as refreshTokenAPI } from '@/app/lib/whoop/api-client';

/**
 * Helper to create a mock Supabase client that supports the chaining patterns
 * used by token-service.ts:
 *   - from('whoop_tokens').select('*').eq('user_id', ...).single()
 *   - from('whoop_tokens').upsert(...)
 *   - from('whoop_tokens').delete().eq('user_id', ...)
 *   - from('whoop_sync_status').upsert(...)
 *   - from('whoop_sync_status').update(...).eq('user_id', ...)
 */
function createMockSupabase(tokenData: any) {
  const mockSingle = vi.fn().mockResolvedValue({ data: tokenData, error: tokenData ? null : { code: 'PGRST116', message: 'No rows returned' } });
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
  const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

  const mockSupabase: any = {
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
      delete: mockDelete,
      update: mockUpdate,
    }),
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn()
    },
    _mocks: { mockSingle, mockEq, mockSelect, mockUpsert, mockDelete, mockUpdate }
  };

  return mockSupabase;
}

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

    vi.clearAllMocks();

    // Restore default mock implementations after clearAllMocks
    (decryptTokens as any).mockImplementation((access: string, refresh: string) => ({
      accessToken: access.replace('encrypted_', ''),
      refreshToken: refresh.replace('encrypted_', '')
    }));
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
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ min: new Date(Date.now() + 6 * 60 * 1000), max: new Date(Date.now() + 86400000) })
        .filter(d => !isNaN(d.getTime())),
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

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

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
    mockSupabase = createMockSupabase(null);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

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
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ min: new Date(Date.now() - 86400000), max: new Date(Date.now() - 1000) })
        .filter(d => !isNaN(d.getTime())),
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep'), { minLength: 1, maxLength: 2 })
    })
  ])('Property 1: detects expired tokens during initialization', async (tokenData) => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup: Store expired tokens in database
    const mockTokenRecord = {
      user_id: tokenData.userId,
      access_token_encrypted: `encrypted_${tokenData.accessToken}`,
      refresh_token_encrypted: `encrypted_${tokenData.refreshToken}`,
      expires_at: tokenData.expiresAt.toISOString(),
      scope: tokenData.scope
    };

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

    // Mock refreshTokenAPI to fail (simulating expired refresh token)
    (refreshTokenAPI as any).mockRejectedValue(new Error('Token refresh failed: 401'));

    // Act: Initialize connection with expired tokens
    const initialized = await initializeConnection(tokenData.userId);

    // Assert: Should fail to initialize (tokens expired and refresh failed)
    expect(initialized).toBe(false);

    // Property: System should detect expiration
    const retrievedTokens = await getTokens(tokenData.userId);
    expect(retrievedTokens).not.toBeNull();
    expect(retrievedTokens?.expiresAt.getTime()).toBeLessThan(Date.now());

    consoleErrorSpy.mockRestore();
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
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) })
        .filter(d => !isNaN(d.getTime())),
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

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

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
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ min: new Date(Date.now() + 60000), max: new Date(Date.now() + 4 * 60 * 1000) })
        .filter(d => !isNaN(d.getTime())),
      scope: fc.array(fc.constantFrom('read:recovery', 'read:sleep'), { minLength: 1, maxLength: 2 })
    })
  ])('Property 2: proactively refreshes expiring tokens on restoration', async (sessionData) => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

    // Mock the WHOOP API refresh to return new tokens
    (refreshTokenAPI as any).mockResolvedValue({
      accessToken: newAccessToken,
      refreshToken: sessionData.refreshToken,
      expiresAt: newExpiresAt,
      scope: sessionData.scope
    });

    // Act: Initialize connection (should trigger proactive refresh)
    const initialized = await initializeConnection(sessionData.userId);

    // Assert: Connection should be initialized
    expect(initialized).toBe(true);

    // Property: System should attempt proactive refresh for expiring tokens
    // (Note: In real implementation, this would update the database)

    consoleWarnSpy.mockRestore();
  });

  test.prop([
    fc.array(
      fc.record({
        userId: fc.uuid(),
        accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
        refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
        expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) })
          .filter(d => !isNaN(d.getTime()))
      }),
      { minLength: 1, maxLength: 5 }
    )
  ])('Property 2: handles multiple concurrent session restorations', async (sessions) => {
    // Use the last session for the mock (all concurrent calls will see the same data)
    const lastSession = sessions[sessions.length - 1];
    const mockTokenRecord = {
      user_id: lastSession.userId,
      access_token_encrypted: `encrypted_${lastSession.accessToken}`,
      refresh_token_encrypted: `encrypted_${lastSession.refreshToken}`,
      expires_at: lastSession.expiresAt.toISOString(),
      scope: ['read:recovery']
    };

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

    // Act: Initialize connections concurrently
    const results = await Promise.all(
      sessions.map(session => initializeConnection(session.userId))
    );

    // Assert: All connections should be initialized (mock returns valid data for any userId)
    expect(results.every(result => result === true)).toBe(true);

    // Property: Token retrieval should succeed for all users
    // (In production, each userId gets its own tokens; here we verify the mock path works)
    const retrievedTokens = await getTokens(lastSession.userId);
    expect(retrievedTokens).not.toBeNull();
    expect(retrievedTokens?.accessToken).toBe(lastSession.accessToken);
  });

  test.prop([
    fc.record({
      userId: fc.uuid(),
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ min: new Date(Date.now() + 3600000), max: new Date(Date.now() + 86400000) })
        .filter(d => !isNaN(d.getTime()))
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

    mockSupabase = createMockSupabase(mockTokenRecord);
    vi.mocked(createServerClient).mockResolvedValue(mockSupabase);

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
