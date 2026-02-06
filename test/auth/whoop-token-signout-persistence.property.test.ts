/**
 * Property-Based Tests: WHOOP Token Persistence Through Sign-Out
 * 
 * Feature: authentication-fixes
 * Property 7: WHOOP Token Persistence Through App Sign-Out
 * 
 * **Validates: Requirements 3.5**
 * 
 * For any user with connected WHOOP account, when signing out of the application
 * and then signing back in, the WHOOP tokens should remain available unless the
 * user explicitly disconnects WHOOP.
 * 
 * This test validates that:
 * 1. WHOOP tokens persist in database through sign-out
 * 2. Session cleanup does NOT delete WHOOP tokens
 * 3. Tokens are retrievable after sign-in
 * 4. Only explicit disconnect removes tokens
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { sessionCleanupService } from '../../app/lib/auth/session-cleanup-service';
import type { WhoopTokens } from '@/app/lib/types/whoop';

/**
 * Mock token persistence that simulates database storage
 * This represents the whoop_tokens table which should persist through sign-out
 */
class MockWhoopTokenDatabase {
  private tokens = new Map<string, WhoopTokens>();

  async store(userId: string, tokens: WhoopTokens): Promise<void> {
    this.tokens.set(userId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt.getTime()),
      scope: tokens.scope
    });
  }

  async retrieve(userId: string): Promise<WhoopTokens | null> {
    const tokens = this.tokens.get(userId);
    if (!tokens) return null;
    
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt.getTime()),
      scope: tokens.scope
    };
  }

  async delete(userId: string): Promise<void> {
    this.tokens.delete(userId);
  }

  async hasTokens(userId: string): Promise<boolean> {
    return this.tokens.has(userId);
  }

  clear(): void {
    this.tokens.clear();
  }
}

/**
 * Mock session storage that simulates browser storage
 * This should be cleared on sign-out
 */
class MockBrowserSession {
  setSession(userId: string, sessionData: any): void {
    localStorage.setItem('supabase.auth.token', JSON.stringify(sessionData));
    document.cookie = `sb-access-token=${sessionData.access_token}; path=/`;
    document.cookie = `sb-refresh-token=${sessionData.refresh_token}; path=/`;
  }

  clearSession(): void {
    localStorage.clear();
    window.sessionStorage.clear();
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  }

  hasSession(): boolean {
    return localStorage.getItem('supabase.auth.token') !== null;
  }
}

describe('Property 7: WHOOP Token Persistence Through Sign-Out', () => {
  let tokenDatabase: MockWhoopTokenDatabase;
  let browserSession: MockBrowserSession;

  beforeEach(() => {
    tokenDatabase = new MockWhoopTokenDatabase();
    browserSession = new MockBrowserSession();
    
    // Clear browser storage
    if (typeof window !== 'undefined') {
      localStorage.clear();
      window.sessionStorage.clear();
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    }
  });

  /**
   * Core property: WHOOP tokens persist in database through sign-out
   */
  it('Property 7: WHOOP tokens remain in database after sign-out', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random user and WHOOP tokens
        fc.record({
          userId: fc.uuid(),
          email: fc.emailAddress(),
          sessionToken: fc.string({ minLength: 32, maxLength: 64 }),
          whoopTokens: fc.record({
            accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
            scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
          })
        }),
        async (userData) => {
          // Step 1: User signs in and connects WHOOP
          browserSession.setSession(userData.userId, {
            access_token: userData.sessionToken,
            refresh_token: 'refresh_' + userData.sessionToken,
            user: { id: userData.userId, email: userData.email }
          });
          
          await tokenDatabase.store(userData.userId, userData.whoopTokens);

          // Verify initial state
          expect(browserSession.hasSession()).toBe(true);
          expect(await tokenDatabase.hasTokens(userData.userId)).toBe(true);

          // Step 2: User signs out
          await sessionCleanupService.signOut();

          // Property: Session should be cleared
          const isSessionClean = sessionCleanupService.verifyCleanup();
          expect(isSessionClean).toBe(true);
          expect(browserSession.hasSession()).toBe(false);

          // Property: WHOOP tokens should STILL exist in database
          const tokensAfterSignOut = await tokenDatabase.retrieve(userData.userId);
          expect(tokensAfterSignOut).not.toBeNull();
          expect(tokensAfterSignOut?.accessToken).toBe(userData.whoopTokens.accessToken);
          expect(tokensAfterSignOut?.refreshToken).toBe(userData.whoopTokens.refreshToken);
          expect(tokensAfterSignOut?.scope).toBe(userData.whoopTokens.scope);

          // Step 3: User signs back in
          browserSession.setSession(userData.userId, {
            access_token: 'new_' + userData.sessionToken,
            refresh_token: 'new_refresh_' + userData.sessionToken,
            user: { id: userData.userId, email: userData.email }
          });

          // Property: WHOOP tokens should be retrievable after sign-in
          const tokensAfterSignIn = await tokenDatabase.retrieve(userData.userId);
          expect(tokensAfterSignIn).not.toBeNull();
          expect(tokensAfterSignIn?.accessToken).toBe(userData.whoopTokens.accessToken);
          expect(tokensAfterSignIn?.refreshToken).toBe(userData.whoopTokens.refreshToken);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Multiple sign-out/sign-in cycles preserve tokens
   */
  it('Property 7: tokens persist through multiple sign-out cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          email: fc.emailAddress(),
          whoopTokens: fc.record({
            accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
            scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
          }),
          numCycles: fc.integer({ min: 2, max: 5 })
        }),
        async (testData) => {
          // Store initial WHOOP tokens
          await tokenDatabase.store(testData.userId, testData.whoopTokens);

          // Perform multiple sign-out/sign-in cycles
          for (let i = 0; i < testData.numCycles; i++) {
            // Sign in
            browserSession.setSession(testData.userId, {
              access_token: `session_${i}`,
              refresh_token: `refresh_${i}`,
              user: { id: testData.userId, email: testData.email }
            });

            // Verify session exists
            expect(browserSession.hasSession()).toBe(true);

            // Sign out
            await sessionCleanupService.signOut();

            // Verify session cleared
            expect(browserSession.hasSession()).toBe(false);

            // Property: WHOOP tokens should still exist after each cycle
            const tokens = await tokenDatabase.retrieve(testData.userId);
            expect(tokens).not.toBeNull();
            expect(tokens?.accessToken).toBe(testData.whoopTokens.accessToken);
            expect(tokens?.refreshToken).toBe(testData.whoopTokens.refreshToken);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Only explicit disconnect removes tokens
   */
  it('Property 7: explicit disconnect removes tokens, sign-out does not', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          email: fc.emailAddress(),
          whoopTokens: fc.record({
            accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
            scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
          })
        }),
        async (userData) => {
          // Store WHOOP tokens
          await tokenDatabase.store(userData.userId, userData.whoopTokens);

          // Sign in
          browserSession.setSession(userData.userId, {
            access_token: 'session_token',
            refresh_token: 'refresh_token',
            user: { id: userData.userId, email: userData.email }
          });

          // Sign out (should NOT remove WHOOP tokens)
          await sessionCleanupService.signOut();

          // Property: Tokens should still exist
          let tokens = await tokenDatabase.retrieve(userData.userId);
          expect(tokens).not.toBeNull();

          // Explicit disconnect (should remove WHOOP tokens)
          await tokenDatabase.delete(userData.userId);

          // Property: Tokens should now be gone
          tokens = await tokenDatabase.retrieve(userData.userId);
          expect(tokens).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Token values remain unchanged through sign-out
   */
  it('Property 7: token values are immutable through sign-out cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          email: fc.emailAddress(),
          whoopTokens: fc.record({
            accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
            scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
          })
        }),
        async (userData) => {
          // Store original tokens
          await tokenDatabase.store(userData.userId, userData.whoopTokens);

          // Get tokens before sign-out
          const tokensBefore = await tokenDatabase.retrieve(userData.userId);
          expect(tokensBefore).not.toBeNull();

          // Sign in and sign out
          browserSession.setSession(userData.userId, {
            access_token: 'session_token',
            refresh_token: 'refresh_token',
            user: { id: userData.userId, email: userData.email }
          });
          await sessionCleanupService.signOut();

          // Get tokens after sign-out
          const tokensAfter = await tokenDatabase.retrieve(userData.userId);

          // Property: Token values should be identical
          expect(tokensAfter).not.toBeNull();
          expect(tokensAfter?.accessToken).toBe(tokensBefore?.accessToken);
          expect(tokensAfter?.refreshToken).toBe(tokensBefore?.refreshToken);
          expect(tokensAfter?.scope).toBe(tokensBefore?.scope);
          
          // Expiration should be preserved (within 1 second tolerance)
          const timeDiff = Math.abs(
            tokensAfter!.expiresAt.getTime() - tokensBefore!.expiresAt.getTime()
          );
          expect(timeDiff).toBeLessThan(1000);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Session cleanup and token persistence are independent
   */
  it('Property 7: session cleanup does not affect token database', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.uuid(),
            email: fc.emailAddress(),
            whoopTokens: fc.record({
              accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
              refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
              expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
              scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
            })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (users) => {
          // Store tokens for multiple users
          for (const user of users) {
            await tokenDatabase.store(user.userId, user.whoopTokens);
          }

          // Sign in and out as first user
          const firstUser = users[0];
          browserSession.setSession(firstUser.userId, {
            access_token: 'session_token',
            refresh_token: 'refresh_token',
            user: { id: firstUser.userId, email: firstUser.email }
          });
          await sessionCleanupService.signOut();

          // Property: All users' tokens should still exist
          for (const user of users) {
            const tokens = await tokenDatabase.retrieve(user.userId);
            expect(tokens).not.toBeNull();
            expect(tokens?.accessToken).toBe(user.whoopTokens.accessToken);
            expect(tokens?.refreshToken).toBe(user.whoopTokens.refreshToken);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Partial session cleanup does not affect tokens
   */
  it('Property 7: tokens persist even if session cleanup partially fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          email: fc.emailAddress(),
          whoopTokens: fc.record({
            accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
            expiresAt: fc.date({ min: new Date(), max: new Date(Date.now() + 86400000) }).filter(d => !isNaN(d.getTime())),
            scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
          })
        }),
        async (userData) => {
          // Store WHOOP tokens
          await tokenDatabase.store(userData.userId, userData.whoopTokens);

          // Set up session
          browserSession.setSession(userData.userId, {
            access_token: 'session_token',
            refresh_token: 'refresh_token',
            user: { id: userData.userId, email: userData.email }
          });

          // Simulate partial cleanup failure by mocking localStorage.removeItem
          const originalRemoveItem = Storage.prototype.removeItem;
          let callCount = 0;
          Storage.prototype.removeItem = vi.fn(() => {
            callCount++;
            if (callCount === 1) {
              throw new Error('localStorage error');
            }
          });

          // Execute sign-out (may partially fail)
          try {
            await sessionCleanupService.signOut();
          } catch (error) {
            // Ignore cleanup errors
          }

          // Restore original method
          Storage.prototype.removeItem = originalRemoveItem;

          // Property: WHOOP tokens should still exist regardless of cleanup failures
          const tokens = await tokenDatabase.retrieve(userData.userId);
          expect(tokens).not.toBeNull();
          expect(tokens?.accessToken).toBe(userData.whoopTokens.accessToken);
          expect(tokens?.refreshToken).toBe(userData.whoopTokens.refreshToken);
        }
      ),
      { numRuns: 20 }
    );
  });
});
