/**
 * Property-Based Tests for Comprehensive Error Logging
 *
 * Property 16: Comprehensive Error Logging
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  authErrorLogger,
  type AuthErrorType,
} from '@/app/lib/auth/auth-error-logger';

describe('Auth Error Logger - Property Tests', () => {
  beforeEach(() => {
    authErrorLogger.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const errorTypeArb = fc.constantFrom<AuthErrorType>(
    'session_validation',
    'token_operation',
    'cookie_operation',
    'sign_out',
    'oauth'
  );

  /**
   * Property 16: Comprehensive Error Logging
   */
  test.prop([
    errorTypeArb,
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.option(fc.uuid())
  ])('Property 16: every log entry includes error type, message, component, and timestamp', (errorType, message, component, userId) => {
    authErrorLogger.clear();

    authErrorLogger.log({
      errorType,
      message,
      component,
      userId: userId ?? undefined,
    });

    const logs = authErrorLogger.getLogs();
    expect(logs).toHaveLength(1);

    const entry = logs[0];
    expect(entry.errorType).toBe(errorType);
    expect(entry.message).toBe(message);
    expect(entry.component).toBe(component);
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).getTime()).not.toBeNaN();

    if (userId) {
      expect(entry.userId).toBe(userId);
    }
  });

  test.prop([
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ minLength: 1, maxLength: 50 })
  ])('Property 16 (7.1): session validation failures are logged with reason', (userId, reason, component) => {
    authErrorLogger.clear();

    authErrorLogger.logSessionValidationFailure({
      userId,
      reason,
      component,
      storageLayers: { cookies: true, localStorage: false },
    });

    const logs = authErrorLogger.getLogsByType('session_validation');
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain(reason);
    expect(logs[0].userId).toBe(userId);
    expect(logs[0].details?.storageLayers).toBeDefined();
  });

  test.prop([
    fc.uuid(),
    fc.constantFrom('refresh', 'store', 'retrieve', 'decrypt'),
    fc.string({ minLength: 1, maxLength: 50 })
  ])('Property 16 (7.2): token operation failures include operation name', (userId, operation, component) => {
    authErrorLogger.clear();

    authErrorLogger.logTokenOperationFailure({
      userId,
      operation,
      component,
      error: new Error('test error'),
    });

    const logs = authErrorLogger.getLogsByType('token_operation');
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain(operation);
    expect(logs[0].details?.operation).toBe(operation);
  });

  test.prop([
    fc.constantFrom('set', 'get', 'delete', 'clear'),
    fc.constantFrom('sb-access-token', 'sb-refresh-token', 'whoop-oauth-state'),
    fc.string({ minLength: 1, maxLength: 50 })
  ])('Property 16 (7.3): cookie operation failures include cookie name and browser info', (operation, cookieName, component) => {
    authErrorLogger.clear();

    authErrorLogger.logCookieOperationFailure({
      operation,
      cookieName,
      component,
      error: new Error('cookie error'),
    });

    const logs = authErrorLogger.getLogsByType('cookie_operation');
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain(cookieName);
    expect(logs[0].details?.cookieName).toBe(cookieName);
    expect(logs[0].details?.userAgent).toBeDefined();
  });

  test.prop([
    fc.uuid(),
    fc.constantFrom('serverSignOut', 'cookiesCleared', 'localStorageCleared', 'sessionStorageCleared'),
    fc.string({ minLength: 1, maxLength: 50 })
  ])('Property 16 (7.4): sign-out failures include step status', (userId, step, component) => {
    authErrorLogger.clear();

    const stepsCompleted = {
      serverSignOut: step !== 'serverSignOut',
      cookiesCleared: step !== 'cookiesCleared',
      localStorageCleared: step !== 'localStorageCleared',
      sessionStorageCleared: step !== 'sessionStorageCleared',
    };

    authErrorLogger.logSignOutFailure({
      userId,
      step,
      component,
      error: new Error('step failed'),
      stepsCompleted,
    });

    const logs = authErrorLogger.getLogsByType('sign_out');
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain(step);
    expect(logs[0].details?.stepsCompleted).toBeDefined();
  });

  test.prop([
    fc.array(errorTypeArb, { minLength: 1, maxLength: 10 })
  ])('Property 16: getLogsByType filters correctly', (errorTypes) => {
    authErrorLogger.clear();

    errorTypes.forEach((errorType, i) => {
      authErrorLogger.log({
        errorType,
        message: `msg_${i}`,
        component: 'test',
      });
    });

    const total = authErrorLogger.getLogs().length;
    expect(total).toBe(errorTypes.length);

    const uniqueTypes = [...new Set(errorTypes)];
    let filteredTotal = 0;
    for (const type of uniqueTypes) {
      const filtered = authErrorLogger.getLogsByType(type);
      const expectedCount = errorTypes.filter(t => t === type).length;
      expect(filtered).toHaveLength(expectedCount);
      filteredTotal += filtered.length;
    }
    expect(filteredTotal).toBe(total);
  });

  test.prop([
    fc.integer({ min: 1, max: 10 })
  ])('Property 16: clear removes all logs', (count) => {
    authErrorLogger.clear();

    for (let i = 0; i < count; i++) {
      authErrorLogger.log({
        errorType: 'session_validation',
        message: `msg_${i}`,
        component: 'test',
      });
    }

    expect(authErrorLogger.getLogs()).toHaveLength(count);
    authErrorLogger.clear();
    expect(authErrorLogger.getLogs()).toHaveLength(0);
  });
});
