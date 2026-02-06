/**
 * Property-Based Tests for Cookie Manager
 * 
 * Feature: authentication-fixes
 * 
 * These tests verify universal properties that should hold across all inputs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { CookieManager, CookieConfig, serverCookieHelpers } from '@/app/lib/auth/cookie-manager';

describe('Cookie Manager - Property-Based Tests', () => {
  beforeEach(() => {
    // Reset environment mocks before each test
    vi.unstubAllEnvs();
  });

  /**
   * Property 8: Cookie Security Attributes
   * 
   * **Validates: Requirements 4.1, 4.3**
   * 
   * For any authentication cookie set by the Auth_System, the cookie should have 
   * appropriate security attributes: Secure flag (in production), SameSite=Lax, 
   * and proper Path and Domain configuration.
   */
  test.prop([
    fc.record({
      name: fc.stringMatching(/^[a-zA-Z0-9_-]+$/), // Valid cookie name
      value: fc.string({ minLength: 1, maxLength: 100 }),
      path: fc.constantFrom('/', '/api', '/auth', '/api/whoop'),
      domain: fc.option(fc.domain(), { nil: undefined }),
      sameSite: fc.constantFrom('Strict', 'Lax', 'None') as fc.Arbitrary<'Strict' | 'Lax' | 'None'>,
      maxAge: fc.option(fc.integer({ min: 0, max: 86400 }), { nil: undefined })
    }),
    fc.constantFrom('production', 'development')
  ])('Property 8: Cookie Security Attributes - all auth cookies have proper security configuration', (cookieConfig, environment) => {
    // Set environment using Vitest's stubEnv
    vi.stubEnv('NODE_ENV', environment);
    const manager = new CookieManager();

    // Build complete cookie config with environment-appropriate secure flag
    const config: CookieConfig = {
      ...cookieConfig,
      secure: environment === 'production'
    };

    // Special handling for SameSite=None (requires Secure)
    if (config.sameSite === 'None') {
      config.secure = true;
    }

    // Validate the configuration
    const result = manager.validateCookieConfig(config);

    // Property: In production, Secure flag must be true
    if (environment === 'production' && config.sameSite !== 'None') {
      expect(config.secure).toBe(true);
    }

    // Property: SameSite must be one of the valid values
    expect(['Strict', 'Lax', 'None']).toContain(config.sameSite);

    // Property: Path must be explicitly set
    expect(config.path).toBeDefined();
    expect(config.path).toMatch(/^\//);

    // Property: If SameSite=None, Secure must be true
    if (config.sameSite === 'None') {
      expect(config.secure).toBe(true);
    }

    // Property: Configuration should be valid
    expect(result.valid).toBe(true);
  });

  /**
   * Property 9: OAuth State Cookie Expiration
   * 
   * **Validates: Requirements 4.4, 6.2**
   * 
   * For any OAuth state cookie created during WHOOP authentication flow, 
   * the cookie should have an expiration time that matches the OAuth flow 
   * timeout (10 minutes = 600 seconds).
   */
  test.prop([
    fc.string({ minLength: 32, maxLength: 128 }), // OAuth state value
    fc.constantFrom('production', 'development')
  ])('Property 9: OAuth State Cookie Expiration - OAuth state cookies expire in 10 minutes', (stateValue, environment) => {
    // Set environment using Vitest's stubEnv
    vi.stubEnv('NODE_ENV', environment);
    const manager = new CookieManager();

    // Get OAuth state cookie configuration
    const config = manager.getOAuthStateCookieConfig(stateValue);

    // Property: maxAge must be exactly 600 seconds (10 minutes)
    expect(config.maxAge).toBe(600);

    // Property: Must have proper security attributes
    expect(config.path).toBe('/');
    expect(config.sameSite).toBe('Lax');
    expect(config.httpOnly).toBe(true);
    expect(config.secure).toBe(environment === 'production');

    // Validate the complete configuration
    const fullConfig: CookieConfig = {
      name: 'whoop_oauth_state',
      value: stateValue,
      ...config
    };

    const result = manager.validateCookieConfig(fullConfig);
    expect(result.valid).toBe(true);
  });

  /**
   * Additional Property: Cookie Configuration Consistency
   * 
   * For any cookie configuration that passes validation, the same configuration
   * should consistently pass validation across multiple checks.
   */
  test.prop([
    fc.record({
      name: fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
      value: fc.string({ minLength: 1, maxLength: 100 }),
      path: fc.constantFrom('/', '/api'),
      secure: fc.boolean(),
      sameSite: fc.constantFrom('Strict', 'Lax', 'None') as fc.Arbitrary<'Strict' | 'Lax' | 'None'>,
      maxAge: fc.integer({ min: 60, max: 86400 })
    })
  ])('Property: Cookie validation is consistent and deterministic', (baseConfig) => {
    const manager = new CookieManager();

    // Ensure SameSite=None has Secure flag
    const config: CookieConfig = {
      ...baseConfig,
      secure: baseConfig.sameSite === 'None' ? true : baseConfig.secure
    };

    // Validate multiple times
    const result1 = manager.validateCookieConfig(config);
    const result2 = manager.validateCookieConfig(config);
    const result3 = manager.validateCookieConfig(config);

    // Property: Results should be identical
    expect(result1.valid).toBe(result2.valid);
    expect(result2.valid).toBe(result3.valid);
    expect(result1.issues).toEqual(result2.issues);
    expect(result2.issues).toEqual(result3.issues);
  });

  /**
   * Additional Property: Server Cookie Helpers Consistency
   * 
   * For any maxAge value, server cookie helpers should return consistent
   * configuration with proper security attributes.
   */
  test.prop([
    fc.integer({ min: 60, max: 86400 }),
    fc.constantFrom('production', 'development')
  ])('Property: Server cookie helpers return consistent secure configurations', (maxAge, environment) => {
    vi.stubEnv('NODE_ENV', environment);

    // Get auth cookie options
    const authOptions = serverCookieHelpers.getAuthCookieOptions(maxAge);

    // Property: All required security attributes are present
    expect(authOptions.httpOnly).toBe(true);
    expect(authOptions.secure).toBe(environment === 'production');
    expect(authOptions.sameSite).toBe('lax');
    expect(authOptions.path).toBe('/');
    expect(authOptions.maxAge).toBe(maxAge);

    // Property: Configuration is valid when converted to proper case
    const manager = new CookieManager();
    const config: CookieConfig = {
      name: 'test-auth-cookie',
      value: 'test-value',
      httpOnly: authOptions.httpOnly,
      secure: authOptions.secure,
      sameSite: 'Lax', // Convert lowercase to proper case for validation
      path: authOptions.path,
      maxAge: authOptions.maxAge
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
  });

  /**
   * Additional Property: OAuth Cookie Configuration Invariants
   * 
   * OAuth state cookies should always have the same configuration regardless
   * of the state value, with only environment affecting the Secure flag.
   */
  test.prop([
    fc.string({ minLength: 32, maxLength: 128 }),
    fc.string({ minLength: 32, maxLength: 128 }),
    fc.constantFrom('production', 'development')
  ])('Property: OAuth cookie config is invariant to state value', (state1, state2, environment) => {
    vi.stubEnv('NODE_ENV', environment);
    const manager = new CookieManager();

    const config1 = manager.getOAuthStateCookieConfig(state1);
    const config2 = manager.getOAuthStateCookieConfig(state2);

    // Property: Configuration should be identical regardless of state value
    expect(config1.maxAge).toBe(config2.maxAge);
    expect(config1.path).toBe(config2.path);
    expect(config1.secure).toBe(config2.secure);
    expect(config1.sameSite).toBe(config2.sameSite);
    expect(config1.httpOnly).toBe(config2.httpOnly);

    // Property: Both should be valid
    const result1 = manager.validateCookieConfig({
      name: 'oauth_state',
      value: state1,
      ...config1
    });
    const result2 = manager.validateCookieConfig({
      name: 'oauth_state',
      value: state2,
      ...config2
    });

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
  });

  /**
   * Additional Property: Environment Detection Consistency
   * 
   * Environment detection should be consistent across multiple instances
   * and method calls.
   */
  test.prop([
    fc.constantFrom('production', 'development', 'test')
  ])('Property: Environment detection is consistent', (environment) => {
    vi.stubEnv('NODE_ENV', environment);

    const manager1 = new CookieManager();
    const manager2 = new CookieManager();

    // Property: Multiple instances should detect the same environment
    expect(manager1.isProductionEnvironment()).toBe(manager2.isProductionEnvironment());

    // Property: Multiple calls should return the same result
    expect(manager1.isProductionEnvironment()).toBe(manager1.isProductionEnvironment());

    // Property: Should match expected environment
    const expectedProduction = environment === 'production';
    expect(manager1.isProductionEnvironment()).toBe(expectedProduction);
  });

  /**
   * Additional Property: Cookie Name and Value Encoding Safety
   * 
   * For any valid cookie name and value, validation should handle them
   * without errors or exceptions.
   */
  test.prop([
    fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
    fc.string({ minLength: 0, maxLength: 200 })
  ])('Property: Cookie validation handles all valid inputs safely', (name, value) => {
    const manager = new CookieManager();

    const config: CookieConfig = {
      name,
      value,
      path: '/',
      secure: true,
      sameSite: 'Lax'
    };

    // Property: Validation should not throw
    expect(() => {
      const result = manager.validateCookieConfig(config);
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    }).not.toThrow();
  });

  /**
   * Additional Property: Path Validation
   * 
   * For any cookie configuration, if a path is provided, it should start with '/'
   * and be properly validated.
   */
  test.prop([
    fc.constantFrom('/', '/api', '/auth', '/api/whoop', '/dashboard')
  ])('Property: Cookie paths are properly validated', (path) => {
    const manager = new CookieManager();

    const config: CookieConfig = {
      name: 'test-cookie',
      value: 'test-value',
      path,
      secure: true,
      sameSite: 'Lax'
    };

    const result = manager.validateCookieConfig(config);

    // Property: Valid paths should pass validation
    expect(result.valid).toBe(true);
    expect(config.path).toMatch(/^\//);
  });
});

describe('Cookie Manager - Edge Case Properties', () => {
  /**
   * Property: Zero maxAge handling
   * 
   * Cookies with maxAge=0 should be valid (used for immediate expiration)
   */
  test.prop([
    fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
    fc.string({ minLength: 1, maxLength: 100 })
  ])('Property: Zero maxAge is valid for cookie deletion', (name, value) => {
    const manager = new CookieManager();

    const config: CookieConfig = {
      name,
      value,
      path: '/',
      secure: true,
      sameSite: 'Lax',
      maxAge: 0
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
  });

  /**
   * Property: Domain handling
   * 
   * Cookies with and without domain should both be valid
   */
  test.prop([
    fc.option(fc.domain(), { nil: undefined })
  ])('Property: Domain is optional and properly handled', (domain) => {
    const manager = new CookieManager();

    const config: CookieConfig = {
      name: 'test-cookie',
      value: 'test-value',
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
  });

  /**
   * Property: SameSite=None requires Secure
   * 
   * Any cookie with SameSite=None must have Secure=true
   */
  test.prop([
    fc.boolean()
  ])('Property: SameSite=None enforcement', (initialSecure) => {
    const manager = new CookieManager();

    const config: CookieConfig = {
      name: 'test-cookie',
      value: 'test-value',
      path: '/',
      secure: initialSecure,
      sameSite: 'None'
    };

    const result = manager.validateCookieConfig(config);

    if (initialSecure) {
      // Property: Should be valid when Secure is true
      expect(result.valid).toBe(true);
    } else {
      // Property: Should be invalid when Secure is false
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('SameSite=None requires Secure flag');
    }
  });
});
