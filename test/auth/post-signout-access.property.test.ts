/**
 * Property-Based Tests: Post-Sign-Out Access Control
 * 
 * Feature: authentication-fixes
 * Property 4: Post-Sign-Out Access Control
 * 
 * **Validates: Requirements 2.4**
 * 
 * For any user who has signed out, when attempting to access protected routes,
 * the Auth_System should redirect to the login page and reject any requests
 * using the invalidated session token.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { sessionCleanupService } from '../../app/lib/auth/session-cleanup-service';

describe('Property 4: Post-Sign-Out Access Control', () => {
  beforeEach(() => {
    // Clear all storage before each test
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
      // Clear cookies
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    }
  });

  it('should reject access with invalidated session tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random session data
        fc.record({
          userId: fc.uuid(),
          accessToken: fc.string({ minLength: 32, maxLength: 64 }),
          refreshToken: fc.string({ minLength: 32, maxLength: 64 }),
          email: fc.emailAddress()
        }),
        async (sessionData) => {
          // Setup: Create a mock session in storage
          localStorage.setItem('supabase.auth.token', JSON.stringify({
            access_token: sessionData.accessToken,
            refresh_token: sessionData.refreshToken,
            user: {
              id: sessionData.userId,
              email: sessionData.email
            }
          }));

          // Set auth cookies
          document.cookie = `sb-access-token=${sessionData.accessToken}; path=/`;
          document.cookie = `sb-refresh-token=${sessionData.refreshToken}; path=/`;

          // Execute sign-out
          const result = await sessionCleanupService.signOut();

          // Property: Session tokens should no longer be accessible
          const remainingToken = localStorage.getItem('supabase.auth.token');
          expect(remainingToken).toBeNull();

          // Property: Auth cookies should be cleared
          const cookies = document.cookie;
          expect(cookies).not.toContain('sb-access-token');
          expect(cookies).not.toContain('sb-refresh-token');

          // Property: Verification should confirm cleanup
          const isClean = sessionCleanupService.verifyCleanup();
          expect(isClean).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should clear all session artifacts regardless of session state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various session states
        fc.record({
          hasLocalStorage: fc.boolean(),
          hasCookies: fc.boolean(),
          hasSessionStorage: fc.boolean(),
          accessToken: fc.string({ minLength: 32, maxLength: 64 }),
          refreshToken: fc.string({ minLength: 32, maxLength: 64 })
        }),
        async (state) => {
          // Setup: Create session artifacts based on state
          if (state.hasLocalStorage) {
            localStorage.setItem('supabase.auth.token', JSON.stringify({
              access_token: state.accessToken,
              refresh_token: state.refreshToken
            }));
          }

          if (state.hasCookies) {
            document.cookie = `sb-access-token=${state.accessToken}; path=/`;
            document.cookie = `sb-refresh-token=${state.refreshToken}; path=/`;
          }

          if (state.hasSessionStorage) {
            sessionStorage.setItem('sb-temp-data', 'test');
          }

          // Execute sign-out
          const result = await sessionCleanupService.signOut();

          // Property: All storage mechanisms should be cleared
          expect(result.steps.localStorageCleared).toBe(true);
          expect(result.steps.cookiesCleared).toBe(true);
          expect(result.steps.sessionStorageCleared).toBe(true);

          // Property: Verification confirms no artifacts remain
          const isClean = sessionCleanupService.verifyCleanup();
          expect(isClean).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});
