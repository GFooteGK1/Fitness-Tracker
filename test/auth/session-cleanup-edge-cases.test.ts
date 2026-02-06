/**
 * Unit Tests: Session Cleanup Edge Cases
 * 
 * Feature: authentication-fixes
 * Tests edge cases for session cleanup service
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sessionCleanupService } from '../../app/lib/auth/session-cleanup-service';
import { createClient } from '../../app/lib/auth/supabase-client';

// Mock Supabase client
vi.mock('../../app/lib/auth/supabase-client', () => ({
  createClient: vi.fn()
}));

describe('Session Cleanup Edge Cases', () => {
  beforeEach(() => {
    // Clear all storage before each test
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
    vi.clearAllMocks();
  });

  describe('Edge Case 1.4: Stale session detection', () => {
    it('should detect stale session in localStorage', () => {
      // Setup: Create stale session data
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'stale-token',
        refresh_token: 'stale-refresh',
        expires_at: Date.now() - 86400000 // Expired yesterday
      }));

      // Verify stale data exists
      const status = sessionCleanupService.getCleanupStatus();
      expect(status.localStorage).toContain('supabase.auth.token');

      // Cleanup should remove stale data
      sessionCleanupService.clearLocalStorage();

      // Verify cleanup
      const afterStatus = sessionCleanupService.getCleanupStatus();
      expect(afterStatus.localStorage).not.toContain('supabase.auth.token');
    });

    it('should detect stale cookies', () => {
      // Setup: Create stale cookies
      document.cookie = 'sb-access-token=stale-token; path=/';
      document.cookie = 'sb-refresh-token=stale-refresh; path=/';

      // Verify stale cookies exist
      const status = sessionCleanupService.getCleanupStatus();
      expect(status.cookies.length).toBeGreaterThan(0);

      // Cleanup should remove stale cookies
      sessionCleanupService.clearAuthCookies();

      // Verify cleanup
      const afterStatus = sessionCleanupService.getCleanupStatus();
      expect(afterStatus.cookies.length).toBe(0);
    });
  });

  describe('Partial cleanup failure handling', () => {
    it('should continue cleanup even if localStorage fails', async () => {
      // Setup: Mock localStorage.removeItem to throw error
      const originalRemoveItem = Storage.prototype.removeItem;
      const mockRemoveItem = vi.fn(() => {
        throw new Error('localStorage error');
      });
      Storage.prototype.removeItem = mockRemoveItem;

      // Set up session data
      document.cookie = 'sb-access-token=test-token; path=/';
      sessionStorage.setItem('sb-data', 'test');

      // Execute sign-out
      const result = await sessionCleanupService.signOut();

      // Should still clear cookies and sessionStorage
      expect(result.steps.cookiesCleared).toBe(true);
      expect(result.steps.sessionStorageCleared).toBe(true);

      // localStorage clearing should fail but be logged
      expect(result.errors.length).toBeGreaterThan(0);

      // Restore original method immediately
      Storage.prototype.removeItem = originalRemoveItem;
    });

    it('should continue cleanup even if cookie clearing fails', async () => {
      // Setup: Create session data
      localStorage.setItem('supabase.auth.token', 'test-token');
      sessionStorage.setItem('sb-data', 'test');

      // Mock document.cookie to simulate failure
      const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      Object.defineProperty(document, 'cookie', {
        get: () => 'sb-access-token=test',
        set: () => {
          throw new Error('Cookie error');
        },
        configurable: true
      });

      // Execute sign-out
      const result = await sessionCleanupService.signOut();

      // Should still clear localStorage and sessionStorage
      expect(result.steps.localStorageCleared).toBe(true);
      expect(result.steps.sessionStorageCleared).toBe(true);

      // Cookie clearing should fail but be logged
      expect(result.errors.length).toBeGreaterThan(0);

      // Restore original property
      if (originalCookie) {
        Object.defineProperty(document, 'cookie', originalCookie);
      }
    });
  });

  describe('Server sign-out failure handling', () => {
    it('should continue client-side cleanup if server sign-out fails', async () => {
      // Setup: Mock Supabase client to fail
      const mockSignOut = vi.fn().mockRejectedValue(new Error('Server error'));
      (createClient as any).mockReturnValue({
        auth: {
          signOut: mockSignOut
        }
      });

      // Set up session data
      localStorage.setItem('supabase.auth.token', 'test-token');
      document.cookie = 'sb-access-token=test-token; path=/';
      sessionStorage.setItem('sb-data', 'test');

      // Execute sign-out
      const result = await sessionCleanupService.signOut();

      // Server sign-out should fail
      expect(result.steps.serverSignOut).toBe(false);
      expect(result.errors.some(e => e.includes('Server sign-out failed'))).toBe(true);

      // But client-side cleanup should succeed
      expect(result.steps.localStorageCleared).toBe(true);
      expect(result.steps.cookiesCleared).toBe(true);
      expect(result.steps.sessionStorageCleared).toBe(true);

      // Verify client-side artifacts are removed
      expect(localStorage.getItem('supabase.auth.token')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('should log server error details', async () => {
      // Setup: Mock Supabase client with specific error
      const serverError = new Error('Network timeout');
      const mockSignOut = vi.fn().mockRejectedValue(serverError);
      (createClient as any).mockReturnValue({
        auth: {
          signOut: mockSignOut
        }
      });

      // Execute sign-out
      const result = await sessionCleanupService.signOut();

      // Should log the specific error
      expect(result.errors.some(e => e.includes('Network timeout'))).toBe(true);
    });

    it('should still redirect user even if server sign-out fails', async () => {
      // Setup: Mock Supabase client to fail
      const mockSignOut = vi.fn().mockRejectedValue(new Error('Server error'));
      (createClient as any).mockReturnValue({
        auth: {
          signOut: mockSignOut
        }
      });

      // Set up session data
      localStorage.setItem('supabase.auth.token', 'test-token');

      // Execute sign-out
      const result = await sessionCleanupService.signOut();

      // Client-side should be clean even if server fails
      const isClean = sessionCleanupService.verifyCleanup();
      expect(isClean).toBe(true);

      // This ensures user can't access protected routes with stale client data
      expect(localStorage.getItem('supabase.auth.token')).toBeNull();
    });
  });

  describe('Cleanup verification', () => {
    it('should detect incomplete cleanup', () => {
      // Setup: Leave some auth data
      localStorage.setItem('supabase.auth.token', 'remaining-token');

      // Verification should fail
      const isClean = sessionCleanupService.verifyCleanup();
      expect(isClean).toBe(false);

      // Status should show remaining data
      const status = sessionCleanupService.getCleanupStatus();
      expect(status.localStorage).toContain('supabase.auth.token');
    });

    it('should pass verification when fully clean', () => {
      // Ensure everything is clean
      localStorage.clear();
      sessionStorage.clear();

      // Verification should pass
      const isClean = sessionCleanupService.verifyCleanup();
      expect(isClean).toBe(true);

      // Status should show no remaining data
      const status = sessionCleanupService.getCleanupStatus();
      expect(status.cookies.length).toBe(0);
      expect(status.localStorage.length).toBe(0);
      expect(status.sessionStorage.length).toBe(0);
    });
  });
});
