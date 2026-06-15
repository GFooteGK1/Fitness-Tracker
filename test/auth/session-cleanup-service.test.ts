/**
 * Unit Tests for Session Cleanup Service
 * 
 * Tests comprehensive session cleanup, storage clearing, and verification.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionCleanupService } from '@/app/lib/auth/session-cleanup-service';
import { cookieManager } from '@/app/lib/auth/cookie-manager';
import { createClient } from '@/app/lib/auth/supabase-client';

// Mock dependencies
vi.mock('@/app/lib/auth/cookie-manager', () => ({
  cookieManager: {
    clearAuthCookies: vi.fn()
  }
}));

vi.mock('@/app/lib/auth/supabase-client', () => ({
  createClient: vi.fn()
}));

function mockNavigator(value: Partial<Navigator>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value
  });
}

function restoreNavigator(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, 'navigator', descriptor);
  } else {
    delete (globalThis as any).navigator;
  }
}

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  let mockSupabase: any;

  beforeEach(() => {
    service = new SessionCleanupService();
    
    // Setup Supabase mock
    mockSupabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null })
      }
    };
    
    vi.mocked(createClient).mockReturnValue(mockSupabase);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Environment Detection', () => {
    it('should detect browser context', () => {
      expect(service.isBrowserContext()).toBe(false);
    });
  });

  describe('Server-Side Error Handling', () => {
    it('should return error result when signOut called server-side', async () => {
      // In Node.js environment (not browser), server signOut works
      // but cookie/localStorage/sessionStorage clearing will fail
      const result = await service.signOut();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Cookie clearing should fail in server context
      expect(result.errors.some(e => e.includes('Cookie clearing failed'))).toBe(true);
    });

    it('should return false when verifyCleanup called server-side', () => {
      const result = service.verifyCleanup();
      expect(result).toBe(false);
    });
  });

  describe('Cleanup Result Structure', () => {
    it('should return proper CleanupResult structure on error', async () => {
      const result = await service.signOut();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('errors');
      
      expect(result.steps).toHaveProperty('serverSignOut');
      expect(result.steps).toHaveProperty('cookiesCleared');
      expect(result.steps).toHaveProperty('localStorageCleared');
      expect(result.steps).toHaveProperty('sessionStorageCleared');
      
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should mark success as false when any step fails', async () => {
      const result = await service.signOut();
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('SessionCleanupService - Browser Context Tests', () => {
  let service: SessionCleanupService;
  let mockSupabase: any;
  let originalWindow: any;
  let originalDocument: any;
  let originalLocalStorage: any;
  let originalSessionStorage: any;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    // Mock browser environment
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    // Create mock storage that exposes keys to Object.keys()
    const mockStorage = () => {
      const store = new Map<string, string>();
      const handler: ProxyHandler<any> = {
        get(_target, prop: string) {
          if (prop === 'getItem') return (key: string) => store.get(key) ?? null;
          if (prop === 'setItem') return (key: string, value: string) => { store.set(key, value); };
          if (prop === 'removeItem') return (key: string) => { store.delete(key); };
          if (prop === 'clear') return () => { store.clear(); };
          if (prop === 'length') return store.size;
          if (prop === 'key') return (index: number) => [...store.keys()][index] ?? null;
          return store.get(prop) ?? undefined;
        },
        ownKeys() {
          return [...store.keys()];
        },
        getOwnPropertyDescriptor(_target, prop: string) {
          if (store.has(prop)) {
            return { configurable: true, enumerable: true, value: store.get(prop) };
          }
          return undefined;
        },
        has(_target, prop: string) {
          return store.has(prop);
        }
      };
      return new Proxy({}, handler);
    };

    (global as any).window = { location: { hostname: 'localhost' } };
    (global as any).document = { cookie: '' };
    (global as any).localStorage = mockStorage();
    (global as any).sessionStorage = mockStorage();
    mockNavigator({
      userAgent: 'test-agent',
      cookieEnabled: true
    });

    // Setup Supabase mock
    mockSupabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null })
      }
    };
    
    vi.mocked(createClient).mockReturnValue(mockSupabase);
    vi.clearAllMocks();

    // Create service after mocking browser environment
    service = new SessionCleanupService();
  });

  afterEach(() => {
    // Restore original environment
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.sessionStorage = originalSessionStorage;
    restoreNavigator(originalNavigatorDescriptor);
  });

  describe('Complete Sign-Out Flow', () => {
    it('should execute all cleanup steps successfully', async () => {
      const result = await service.signOut();

      expect(result.success).toBe(true);
      expect(result.steps.serverSignOut).toBe(true);
      expect(result.steps.cookiesCleared).toBe(true);
      expect(result.steps.localStorageCleared).toBe(true);
      expect(result.steps.sessionStorageCleared).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should call Supabase signOut', async () => {
      await service.signOut();

      expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('should call cookieManager.clearAuthCookies', async () => {
      await service.signOut();

      expect(cookieManager.clearAuthCookies).toHaveBeenCalledTimes(1);
    });

    it('should clear localStorage auth keys', async () => {
      // Add some auth-related keys
      localStorage.setItem('sb-access-token', 'token123');
      localStorage.setItem('supabase.auth.token', 'token456');
      localStorage.setItem('other-key', 'value');

      await service.signOut();

      expect(localStorage.getItem('sb-access-token')).toBeNull();
      expect(localStorage.getItem('supabase.auth.token')).toBeNull();
      // Non-auth keys might remain (depending on implementation)
    });

    it('should clear all sessionStorage', async () => {
      sessionStorage.setItem('key1', 'value1');
      sessionStorage.setItem('key2', 'value2');

      await service.signOut();

      expect(sessionStorage.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue cleanup even if server sign-out fails', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({ 
        error: new Error('Server error') 
      });

      const result = await service.signOut();

      expect(result.steps.serverSignOut).toBe(false);
      expect(result.steps.cookiesCleared).toBe(true);
      expect(result.steps.localStorageCleared).toBe(true);
      expect(result.steps.sessionStorageCleared).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Server sign-out failed');
    });

    it('should handle cookie clearing errors', async () => {
      vi.mocked(cookieManager.clearAuthCookies).mockImplementation(() => {
        throw new Error('Cookie error');
      });

      const result = await service.signOut();

      expect(result.steps.cookiesCleared).toBe(false);
      expect(result.errors.some(e => e.includes('Cookie clearing failed'))).toBe(true);
    });

    it('should handle localStorage errors', async () => {
      // Create a service with a broken clearLocalStorage
      const brokenService = new SessionCleanupService();
      const origClearLS = brokenService.clearLocalStorage.bind(brokenService);
      brokenService.clearLocalStorage = () => { throw new Error('Storage error'); };

      const result = await brokenService.signOut();

      // Should catch error and mark as failed
      expect(result.steps.localStorageCleared).toBe(false);
      expect(result.errors.some((e: string) => e.includes('localStorage clearing failed'))).toBe(true);
    });

    it('should handle sessionStorage errors', async () => {
      // Create a service with a broken clearSessionStorage
      const brokenService = new SessionCleanupService();
      brokenService.clearSessionStorage = () => { throw new Error('Storage error'); };

      const result = await brokenService.signOut();

      expect(result.steps.sessionStorageCleared).toBe(false);
    });
  });

  describe('Cleanup Verification', () => {
    it('should verify cleanup when all artifacts removed', () => {
      const result = service.verifyCleanup();

      expect(result).toBe(true);
    });

    it('should detect remaining auth cookies', () => {
      (global as any).document.cookie = 'sb-access-token=value123';

      const result = service.verifyCleanup();

      expect(result).toBe(false);
    });

    it('should detect remaining localStorage auth keys', () => {
      localStorage.setItem('sb-refresh-token', 'token123');

      const result = service.verifyCleanup();

      expect(result).toBe(false);
    });

    it('should detect auth-related sessionStorage keys', () => {
      sessionStorage.setItem('sb-session-data', 'value');

      const result = service.verifyCleanup();

      expect(result).toBe(false);
    });

    it('should allow non-auth localStorage keys', () => {
      localStorage.setItem('user-preference', 'dark-mode');

      const result = service.verifyCleanup();

      // Should pass since it's not an auth key
      expect(result).toBe(true);
    });
  });

  describe('localStorage Cleanup Patterns', () => {
    it('should remove keys starting with "sb-"', async () => {
      localStorage.setItem('sb-access-token', 'value');
      localStorage.setItem('sb-refresh-token', 'value');

      await service.signOut();

      expect(localStorage.getItem('sb-access-token')).toBeNull();
      expect(localStorage.getItem('sb-refresh-token')).toBeNull();
    });

    it('should remove keys starting with "supabase."', async () => {
      localStorage.setItem('supabase.auth.token', 'value');

      await service.signOut();

      expect(localStorage.getItem('supabase.auth.token')).toBeNull();
    });

    it('should remove keys containing "auth"', async () => {
      localStorage.setItem('my-auth-data', 'value');

      await service.signOut();

      expect(localStorage.getItem('my-auth-data')).toBeNull();
    });

    it('should remove keys containing "session"', async () => {
      localStorage.setItem('user-session', 'value');

      await service.signOut();

      expect(localStorage.getItem('user-session')).toBeNull();
    });

    it('should remove keys containing "token"', async () => {
      localStorage.setItem('access-token', 'value');

      await service.signOut();

      expect(localStorage.getItem('access-token')).toBeNull();
    });
  });
});

describe('Requirements Validation', () => {
  let service: SessionCleanupService;
  let mockSupabase: any;
  let originalWindow: any;
  let originalDocument: any;
  let originalLocalStorage: any;
  let originalSessionStorage: any;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    // Mock browser environment
    const mockStorage = () => {
      const store = new Map<string, string>();
      const handler: ProxyHandler<any> = {
        get(_target, prop: string) {
          if (prop === 'getItem') return (key: string) => store.get(key) ?? null;
          if (prop === 'setItem') return (key: string, value: string) => { store.set(key, value); };
          if (prop === 'removeItem') return (key: string) => { store.delete(key); };
          if (prop === 'clear') return () => { store.clear(); };
          if (prop === 'length') return store.size;
          if (prop === 'key') return (index: number) => [...store.keys()][index] ?? null;
          return store.get(prop) ?? undefined;
        },
        ownKeys() {
          return [...store.keys()];
        },
        getOwnPropertyDescriptor(_target, prop: string) {
          if (store.has(prop)) {
            return { configurable: true, enumerable: true, value: store.get(prop) };
          }
          return undefined;
        },
        has(_target, prop: string) {
          return store.has(prop);
        }
      };
      return new Proxy({}, handler);
    };

    (global as any).window = { location: { hostname: 'localhost' } };
    (global as any).document = { cookie: '' };
    (global as any).localStorage = mockStorage();
    (global as any).sessionStorage = mockStorage();
    mockNavigator({ userAgent: 'test', cookieEnabled: true });

    mockSupabase = {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null })
      }
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase);

    // Reset the cookieManager mock to not throw errors
    vi.mocked(cookieManager.clearAuthCookies).mockImplementation(() => {});

    service = new SessionCleanupService();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.sessionStorage = originalSessionStorage;
    restoreNavigator(originalNavigatorDescriptor);
  });

  it('should enforce Requirement 2.1: Clear all authentication cookies', async () => {
    await service.signOut();

    expect(cookieManager.clearAuthCookies).toHaveBeenCalled();
  });

  it('should enforce Requirement 2.2: Clear localStorage and sessionStorage', async () => {
    localStorage.setItem('sb-token', 'value');
    sessionStorage.setItem('data', 'value');

    await service.signOut();

    expect(localStorage.getItem('sb-token')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('should enforce Requirement 2.3: Invalidate server-side session', async () => {
    await service.signOut();

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('should enforce Requirement 2.4: Complete cleanup before redirect', async () => {
    const result = await service.signOut();

    // All steps should complete
    expect(result.steps.serverSignOut).toBe(true);
    expect(result.steps.cookiesCleared).toBe(true);
    expect(result.steps.localStorageCleared).toBe(true);
    expect(result.steps.sessionStorageCleared).toBe(true);
  });
});
