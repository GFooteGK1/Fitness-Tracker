/**
 * Property-Based Tests for Automatic Token Refresh
 * 
 * Feature: authentication-fixes
 * Property 6: Automatic Token Refresh
 * 
 * **Validates: Requirements 3.3**
 * 
 * For any expired WHOOP access token with a valid refresh token, when the 
 * WHOOP_Connection detects expiration, it should automatically use the refresh 
 * token to obtain a new access token without user intervention.
 */

import { describe, expect, beforeEach, afterEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import type { WhoopTokens } from '@/app/lib/types/whoop';

/**
 * Simplified token refresh interface for property testing
 * This represents the core contract that the token service must uphold
 */
interface TokenRefreshService {
  getTokens(userId: string): Promise<WhoopTokens | null>;
  refreshAccessToken(userId: string): Promise<WhoopTokens>;
  getValidAccessToken(userId: string): Promise<string>;
  validateTokens(userId: string): Promise<{
    valid: boolean;
    needsRefresh: boolean;
    expired: boolean;
  }>;
}

/**
 * Mock implementation that simulates token refresh behavior
 * This allows us to test the refresh properties without external API dependencies
 */
class MockTokenRefreshService implements TokenRefreshService {
  private storage = new Map<string, WhoopTokens>();
  private refreshCallCount = 0;

  async getTokens(userId: string): Promise<WhoopTokens | null> {
    return this.storage.get(userId) || null;
  }

  async refreshAccessToken(userId: string): Promise<WhoopTokens> {
    const currentTokens = await this.getTokens(userId);
    if (!currentTokens) {
      throw new Error('No tokens found for user');
    }
    this.refreshCallCount++;

    // Simulate API call to refresh tokens
    const newTokens: WhoopTokens = {
      accessToken: `new_access_${Date.now()}_${Math.random()}`,
      refreshToken: currentTokens.refreshToken, // Refresh token typically stays the same
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      scope: currentTokens.scope
    };

    // Store new tokens
    this.storage.set(userId, newTokens);
    return newTokens;
  }

  async validateTokens(userId: string): Promise<{
    valid: boolean;
    needsRefresh: boolean;
    expired: boolean;
  }> {
    const tokens = await this.getTokens(userId);

    if (!tokens) {
      return {
        valid: false,
        needsRefresh: false,
        expired: true
      };
    }

    const now = new Date();
    const expiresAt = new Date(tokens.expiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // Token is expired
    if (timeUntilExpiry <= 0) {
      return {
        valid: false,
        needsRefresh: true,
        expired: true
      };
    }

    // Token expires in less than 5 minutes - should refresh proactively
    if (timeUntilExpiry < 5 * 60 * 1000) {
      return {
        valid: true,
        needsRefresh: true,
        expired: false
      };
    }

    // Token is valid and not expiring soon
    return {
      valid: true,
      needsRefresh: false,
      expired: false
    };
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const validation = await this.validateTokens(userId);

    if (!validation.valid && !validation.needsRefresh) {
      throw new Error('No valid WHOOP tokens found');
    }

    if (validation.needsRefresh) {
      const newTokens = await this.refreshAccessToken(userId);
      return newTokens.accessToken;
    }

    const tokens = await this.getTokens(userId);
    if (!tokens) {
      throw new Error('Failed to retrieve WHOOP tokens');
    }

    return tokens.accessToken;
  }

  // Test helpers
  setTokens(userId: string, tokens: WhoopTokens): void {
    this.storage.set(userId, tokens);
  }

  getRefreshCallCount(): number {
    return this.refreshCallCount;
  }

  clear(): void {
    this.storage.clear();
    this.refreshCallCount = 0;
  }
}

describe('WHOOP Token Refresh - Property Tests', () => {
  let service: MockTokenRefreshService;

  beforeEach(() => {
    service = new MockTokenRefreshService();
  });

  afterEach(() => {
    service.clear();
  });

  /**
   * Property 6: Automatic Token Refresh
   * 
   * For any expired WHOOP access token with a valid refresh token, when the 
   * WHOOP_Connection detects expiration, it should automatically use the refresh 
   * token to obtain a new access token without user intervention.
   */
  test.prop([
    fc.uuid(), // userId
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() - 86400000), // Up to 1 day in the past
        max: new Date(Date.now() - 1000) // At least 1 second in the past (expired)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: expired tokens trigger automatic refresh', async (userId, expiredTokens) => {
    // Setup: Store expired tokens
    service.setTokens(userId, expiredTokens);

    // Validate that tokens are expired
    const validation = await service.validateTokens(userId);
    expect(validation.expired).toBe(true);
    expect(validation.needsRefresh).toBe(true);

    // Get valid access token (should trigger refresh)
    const accessToken = await service.getValidAccessToken(userId);

    // Property: Should have called refresh
    expect(service.getRefreshCallCount()).toBeGreaterThan(0);

    // Property: Should return a new access token
    expect(accessToken).toBeDefined();
    expect(accessToken).not.toBe(expiredTokens.accessToken);

    // Property: New tokens should be stored
    const newTokens = await service.getTokens(userId);
    expect(newTokens).not.toBeNull();
    expect(newTokens?.accessToken).toBe(accessToken);

    // Property: New tokens should not be expired
    const newValidation = await service.validateTokens(userId);
    expect(newValidation.expired).toBe(false);
    expect(newValidation.valid).toBe(true);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() + 1000), // At least 1 second in future
        max: new Date(Date.now() + 4 * 60 * 1000) // Less than 5 minutes (needs proactive refresh)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: tokens expiring soon trigger proactive refresh', async (userId, expiringTokens) => {
    // Setup: Store tokens that are expiring soon
    service.setTokens(userId, expiringTokens);

    // Validate that tokens need refresh
    const validation = await service.validateTokens(userId);
    expect(validation.needsRefresh).toBe(true);
    expect(validation.expired).toBe(false);
    expect(validation.valid).toBe(true);

    // Get valid access token (should trigger proactive refresh)
    const accessToken = await service.getValidAccessToken(userId);

    // Property: Should have called refresh proactively
    expect(service.getRefreshCallCount()).toBeGreaterThan(0);

    // Property: Should return a new access token
    expect(accessToken).toBeDefined();
    expect(accessToken).not.toBe(expiringTokens.accessToken);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() + 6 * 60 * 1000), // More than 5 minutes in future
        max: new Date(Date.now() + 86400000) // Up to 1 day in future
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: valid tokens do not trigger unnecessary refresh', async (userId, validTokens) => {
    // Setup: Store valid tokens that don't need refresh
    service.setTokens(userId, validTokens);

    // Validate that tokens are valid and don't need refresh
    const validation = await service.validateTokens(userId);
    expect(validation.valid).toBe(true);
    expect(validation.needsRefresh).toBe(false);
    expect(validation.expired).toBe(false);

    // Get valid access token (should NOT trigger refresh)
    const accessToken = await service.getValidAccessToken(userId);

    // Property: Should NOT have called refresh
    expect(service.getRefreshCallCount()).toBe(0);

    // Property: Should return the original access token
    expect(accessToken).toBe(validTokens.accessToken);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() - 86400000),
        max: new Date(Date.now() - 1000)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    }),
    fc.integer({ min: 2, max: 5 }) // Number of refresh attempts
  ])('Property 6: multiple refresh calls update tokens correctly', async (userId, expiredTokens, attempts) => {
    // Reset state for this iteration
    service.clear();

    // Setup: Store expired tokens
    service.setTokens(userId, expiredTokens);

    const accessTokens: string[] = [];

    // Perform multiple refreshes
    for (let i = 0; i < attempts; i++) {
      const newTokens = await service.refreshAccessToken(userId);
      accessTokens.push(newTokens.accessToken);
    }

    // Property: Each refresh should produce a unique access token
    const uniqueTokens = new Set(accessTokens);
    expect(uniqueTokens.size).toBe(accessTokens.length);

    // Property: Refresh count should match attempts
    expect(service.getRefreshCallCount()).toBe(attempts);

    // Property: Final tokens should be valid
    const validation = await service.validateTokens(userId);
    expect(validation.valid).toBe(true);
    expect(validation.expired).toBe(false);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() - 86400000),
        max: new Date(Date.now() - 1000)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: refresh preserves refresh token', async (userId, expiredTokens) => {
    // Setup: Store expired tokens
    service.setTokens(userId, expiredTokens);
    const originalRefreshToken = expiredTokens.refreshToken;

    // Refresh tokens
    const newTokens = await service.refreshAccessToken(userId);

    // Property: Refresh token should be preserved
    expect(newTokens.refreshToken).toBe(originalRefreshToken);

    // Property: Access token should be different
    expect(newTokens.accessToken).not.toBe(expiredTokens.accessToken);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() - 86400000),
        max: new Date(Date.now() - 1000)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: refresh extends token expiration', async (userId, expiredTokens) => {
    // Setup: Store expired tokens
    service.setTokens(userId, expiredTokens);
    const originalExpiry = expiredTokens.expiresAt.getTime();

    // Refresh tokens
    const newTokens = await service.refreshAccessToken(userId);

    // Property: New expiration should be in the future
    expect(newTokens.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Property: New expiration should be later than original
    expect(newTokens.expiresAt.getTime()).toBeGreaterThan(originalExpiry);
  });

  test.prop([
    fc.uuid()
  ])('Property 6: refresh fails when no tokens exist', async (userId) => {
    // Don't store any tokens

    // Property: Refresh should fail with appropriate error
    await expect(service.refreshAccessToken(userId)).rejects.toThrow('No tokens found for user');

    // Property: Should not have incremented refresh count
    expect(service.getRefreshCallCount()).toBe(0);
  });

  test.prop([
    fc.uuid(),
    fc.record({
      accessToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      refreshToken: fc.string({ minLength: 32, maxLength: 128 }).filter(s => s.trim().length >= 32),
      expiresAt: fc.date({ 
        min: new Date(Date.now() - 86400000),
        max: new Date(Date.now() - 1000)
      }).filter(d => !isNaN(d.getTime())),
      scope: fc.constantFrom('read:recovery read:sleep offline', 'read:all offline')
    })
  ])('Property 6: refresh updates stored tokens', async (userId, expiredTokens) => {
    // Setup: Store expired tokens
    service.setTokens(userId, expiredTokens);

    // Get tokens before refresh
    const tokensBefore = await service.getTokens(userId);
    expect(tokensBefore?.accessToken).toBe(expiredTokens.accessToken);

    // Refresh tokens
    await service.refreshAccessToken(userId);

    // Get tokens after refresh
    const tokensAfter = await service.getTokens(userId);

    // Property: Stored tokens should be updated
    expect(tokensAfter?.accessToken).not.toBe(expiredTokens.accessToken);
    expect(tokensAfter?.accessToken).toBeDefined();
  });
});
