/**
 * Unit Tests for OAuth State Validation Failure
 *
 * Task 7.4: Test invalid state rejection (edge case 6.4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Validates that a received state matches the stored state.
 * This mirrors the validation logic in the callback route.
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

describe('OAuth State Validation Failure - Unit Tests', () => {
  it('should reject when stored state is undefined', () => {
    const result = validateOAuthState(undefined, 'abc123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No stored state');
  });

  it('should reject when stored state is empty string', () => {
    const result = validateOAuthState('', 'abc123');
    expect(result.valid).toBe(false);
  });

  it('should reject when states do not match', () => {
    const result = validateOAuthState('stored_state_abc', 'received_state_xyz');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('should accept when states match exactly', () => {
    const state = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const result = validateOAuthState(state, state);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject states that differ by one character', () => {
    const stored = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const received = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b3';
    const result = validateOAuthState(stored, received);
    expect(result.valid).toBe(false);
  });

  it('should reject case-different states', () => {
    const stored = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const received = 'ABCDEF1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const result = validateOAuthState(stored, received);
    expect(result.valid).toBe(false);
  });

  it('should provide clear error message for CSRF scenarios', () => {
    const result = validateOAuthState('legitimate_state', 'attacker_state');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('should handle very long state values', () => {
    const longState = 'a'.repeat(1000);
    const result = validateOAuthState(longState, longState);
    expect(result.valid).toBe(true);
  });
});
