/**
 * Property-Based Tests for Session Cleanup Service
 * 
 * Feature: authentication-fixes
 * Property 3: Sign-Out Cleanup Completeness
 * Validates: Requirements 2.1, 2.2, 2.3, 4.5
 */

import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { SessionCleanupService } from '@/app/lib/auth/session-cleanup-service';
import { cookieManager } from '@/app/lib/auth/cookie-manager';
import { createClient } from '@/app/lib/auth/supabase';

vi.mock('@/app/lib/auth/cookie-manager', () => ({
  cookieManager: { clearAuthCookies: vi.fn() }
}));

vi.mock('@/app/lib/auth/supabase', () => ({
  createClient: vi.fn()
}));

describe('Session Cleanup Service - Property Tests', () => {
  let mockSupabase: any;
  let originalWindow: any;
  let originalDocument: any;
  let originalLocalStorage: any;
  let originalSessionStorage: any;
  let originalNavigator: any;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalNavigator = global.navigator;

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
    (global as any).sessionStorage = mockStorage();
    (global as any).navigator = { userAgent: 'test-agent', cookieEnabled: true };

    mockSupabase = {
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) }
    };
    
    vi.mocked(createClient).mockReturnValue(mockSupabase);
    vi.mocked(cookieManager.clearAuthCookies).mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.sessionStorage = originalSessionStorage;
    global.navigator = originalNavigator;
  });

  test.prop([
    fc.array(fc.record({
      key: fc.stringMatching(/^(sb-|supabase\.|auth|session|token)/),
      value: fc.string()
    }), { minLength: 0, maxLength: 10 }),
    fc.array(fc.record({
      key: fc.string(),
      value: fc.string()
    }), { minLength: 0, maxLength: 10 })
  ])('Property 3: clears all auth artifacts', async (authKeys, sessionKeys) => {
    const service = new SessionCleanupService();
    authKeys.forEach(({ key, value }) => localStorage.setItem(key, value));
    sessionKeys.forEach(({ key, value }) => sessionStorage.setItem(key, value));

    const result = await service.signOut();

    expect(result.steps.serverSignOut).toBe(true);
    expect(result.steps.cookiesCleared).toBe(true);
    expect(result.steps.localStorageCleared).toBe(true);
    expect(result.steps.sessionStorageCleared).toBe(true);
    authKeys.forEach(({ key }) => expect(localStorage.getItem(key)).toBeNull());
    expect(sessionStorage.length).toBe(0);
    expect(service.verifyCleanup()).toBe(true);
  });

  test.prop([fc.boolean(), fc.boolean()])('Property 3: resilient to failures', async (serverSuccess, cookieSuccess) => {
    const service = new SessionCleanupService();
    if (!serverSuccess) mockSupabase.auth.signOut.mockResolvedValue({ error: new Error('Server error') });
    if (!cookieSuccess) vi.mocked(cookieManager.clearAuthCookies).mockImplementation(() => { throw new Error('Cookie error'); });

    const result = await service.signOut();

    expect(result.steps.localStorageCleared).toBe(true);
    expect(result.steps.sessionStorageCleared).toBe(true);
    if (!serverSuccess || !cookieSuccess) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
    }
  });

  test.prop([fc.constantFrom('sb-access-token', 'sb-refresh-token', 'supabase.auth.token', 'auth-data', 'session-id', 'user-token')])('Property 3: removes auth key patterns', async (keyPattern) => {
    const service = new SessionCleanupService();
    localStorage.setItem(keyPattern, 'test-value');
    await service.signOut();
    expect(localStorage.getItem(keyPattern)).toBeNull();
  });

  test.prop([fc.nat({ max: 3 })])('Property 3: idempotent', async (iterations) => {
    const service = new SessionCleanupService();
    localStorage.setItem('sb-token', 'value');
    sessionStorage.setItem('data', 'value');

    const result1 = await service.signOut();
    expect(result1.success).toBe(true);

    for (let i = 0; i < iterations; i++) {
      const result = await service.signOut();
      expect(result.success).toBe(true);
    }
    expect(service.verifyCleanup()).toBe(true);
  });
});
