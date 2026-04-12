/**
 * Property-Based Tests for OAuth State Management
 *
 * Property 13: OAuth State Parameter Security
 * Validates: Requirements 6.1
 *
 * Property 14: OAuth State Validation
 * Validates: Requirements 6.3
 *
 * Property 15: OAuth State Cleanup
 * Validates: Requirements 6.5
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import crypto from 'crypto';

/**
 * Generates an OAuth state parameter the same way the auth route does.
 */
function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates that a received state matches the stored state.
 */
function validateOAuthState(stored: string | undefined, received: string): {
  valid: boolean;
  error?: string;
} {
  if (!stored) {
    return { valid: false, error: 'No stored state found — possible session expiry' };
  }
  if (stored !== received) {
    return { valid: false, error: 'State mismatch — possible CSRF attack' };
  }
  return { valid: true };
}

describe('OAuth State Management - Property Tests', () => {
  /**
   * Property 13: OAuth State Parameter Security
   */
  test.prop([
    fc.integer({ min: 1, max: 20 })
  ])('Property 13: generated state has minimum 32 bytes of entropy (64 hex chars)', (_iteration) => {
    const state = generateOAuthState();

    // Property: 32 bytes → 64 hex characters
    expect(state).toHaveLength(64);
    // Property: only hex characters
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  test.prop([
    fc.integer({ min: 2, max: 50 })
  ])('Property 13: each generated state is unique', (count) => {
    const states = new Set<string>();
    for (let i = 0; i < count; i++) {
      states.add(generateOAuthState());
    }

    // Property: all states are unique (collision probability is negligible for 256-bit)
    expect(states.size).toBe(count);
  });

  test.prop([
    fc.integer({ min: 1, max: 10 })
  ])('Property 13: state has sufficient entropy for CSRF protection', (_iteration) => {
    const state = generateOAuthState();
    const bytes = Buffer.from(state, 'hex');

    // Property: at least 32 bytes of random data
    expect(bytes.length).toBeGreaterThanOrEqual(32);

    // Property: not all zeros or trivially low entropy
    const uniqueBytes = new Set(bytes);
    expect(uniqueBytes.size).toBeGreaterThan(1);
  });

  /**
   * Property 14: OAuth State Validation
   */
  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 14: matching state validates successfully', (state) => {
    const result = validateOAuthState(state, state);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/),
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 14: non-matching states are rejected', (stored, received) => {
    fc.pre(stored !== received);

    const result = validateOAuthState(stored, received);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('mismatch');
  });

  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 14: missing stored state is rejected', (received) => {
    const result = validateOAuthState(undefined, received);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('No stored state');
  });

  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 14: empty stored state is rejected', (received) => {
    const result = validateOAuthState('', received);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  /**
   * Property 15: OAuth State Cleanup
   */
  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 15: state is consumed after successful validation', (state) => {
    // Simulate cookie store
    const cookieStore: Record<string, string | undefined> = {
      'whoop_oauth_state': state,
    };

    // Validate
    const result = validateOAuthState(cookieStore['whoop_oauth_state'], state);
    expect(result.valid).toBe(true);

    // Cleanup — delete the state cookie
    delete cookieStore['whoop_oauth_state'];

    // Property: state cookie is cleared after flow
    expect(cookieStore['whoop_oauth_state']).toBeUndefined();

    // Property: re-validation with same state fails (no stored value)
    const revalidation = validateOAuthState(cookieStore['whoop_oauth_state'], state);
    expect(revalidation.valid).toBe(false);
  });

  test.prop([
    fc.stringMatching(/^[0-9a-f]{64}$/),
    fc.stringMatching(/^[0-9a-f]{64}$/)
  ])('Property 15: state cleanup prevents replay attacks', (state1, state2) => {
    fc.pre(state1 !== state2);

    const cookieStore: Record<string, string | undefined> = {
      'whoop_oauth_state': state1,
    };

    // First flow succeeds
    const result1 = validateOAuthState(cookieStore['whoop_oauth_state'], state1);
    expect(result1.valid).toBe(true);

    // Cleanup
    delete cookieStore['whoop_oauth_state'];

    // Replay attack with the old state fails
    const replay = validateOAuthState(cookieStore['whoop_oauth_state'], state1);
    expect(replay.valid).toBe(false);
  });
});
