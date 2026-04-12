/**
 * Comprehensive Authentication Error Logger
 *
 * Provides structured logging for all authentication operations.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

export type AuthErrorType =
  | 'session_validation'
  | 'token_operation'
  | 'cookie_operation'
  | 'sign_out'
  | 'oauth';

export interface AuthLogEntry {
  errorType: AuthErrorType;
  message: string;
  component: string;
  userId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

class AuthErrorLogger {
  private logs: AuthLogEntry[] = [];

  log(entry: Omit<AuthLogEntry, 'timestamp'>): void {
    const fullEntry: AuthLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(fullEntry);

    console.error(
      `[Auth:${entry.errorType}] ${entry.message}`,
      {
        component: entry.component,
        userId: entry.userId,
        details: entry.details,
      }
    );
  }

  logSessionValidationFailure(params: {
    userId?: string;
    reason: string;
    component: string;
    storageLayers?: Record<string, boolean>;
  }): void {
    this.log({
      errorType: 'session_validation',
      message: `Session validation failed: ${params.reason}`,
      component: params.component,
      userId: params.userId,
      details: {
        reason: params.reason,
        storageLayers: params.storageLayers,
      },
    });
  }

  logTokenOperationFailure(params: {
    userId?: string;
    operation: string;
    component: string;
    error: unknown;
  }): void {
    this.log({
      errorType: 'token_operation',
      message: `Token operation '${params.operation}' failed`,
      component: params.component,
      userId: params.userId,
      details: {
        operation: params.operation,
        error: params.error instanceof Error ? params.error.message : String(params.error),
      },
    });
  }

  logCookieOperationFailure(params: {
    operation: string;
    cookieName: string;
    component: string;
    error: unknown;
  }): void {
    this.log({
      errorType: 'cookie_operation',
      message: `Cookie operation '${params.operation}' failed for '${params.cookieName}'`,
      component: params.component,
      details: {
        operation: params.operation,
        cookieName: params.cookieName,
        error: params.error instanceof Error ? params.error.message : String(params.error),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      },
    });
  }

  logSignOutFailure(params: {
    userId?: string;
    step: string;
    component: string;
    error: unknown;
    stepsCompleted: Record<string, boolean>;
  }): void {
    this.log({
      errorType: 'sign_out',
      message: `Sign-out step '${params.step}' failed`,
      component: params.component,
      userId: params.userId,
      details: {
        step: params.step,
        error: params.error instanceof Error ? params.error.message : String(params.error),
        stepsCompleted: params.stepsCompleted,
      },
    });
  }

  logOAuthFailure(params: {
    userId?: string;
    step: string;
    component: string;
    error: unknown;
  }): void {
    this.log({
      errorType: 'oauth',
      message: `OAuth step '${params.step}' failed`,
      component: params.component,
      userId: params.userId,
      details: {
        step: params.step,
        error: params.error instanceof Error ? params.error.message : String(params.error),
      },
    });
  }

  getLogs(): AuthLogEntry[] {
    return [...this.logs];
  }

  getLogsByType(errorType: AuthErrorType): AuthLogEntry[] {
    return this.logs.filter(l => l.errorType === errorType);
  }

  clear(): void {
    this.logs = [];
  }
}

export const authErrorLogger = new AuthErrorLogger();
