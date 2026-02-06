/**
 * Session Cleanup Service
 * 
 * Comprehensive session termination and cleanup.
 * Ensures all authentication artifacts are properly cleared on sign-out.
 * 
 * Cleanup Steps:
 * 1. Server-side session invalidation via Supabase
 * 2. Clear all authentication cookies
 * 3. Clear localStorage entries
 * 4. Clear sessionStorage
 * 5. Verify cleanup completion
 */

import { createClient } from './supabase-client';
import { cookieManager } from './cookie-manager';

export interface CleanupResult {
  success: boolean;
  steps: {
    serverSignOut: boolean;
    cookiesCleared: boolean;
    localStorageCleared: boolean;
    sessionStorageCleared: boolean;
  };
  errors: string[];
}

export class SessionCleanupService {
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined';
  }

  /**
   * Execute complete sign-out flow with comprehensive cleanup
   * 
   * @returns Cleanup result with status of each step
   */
  async signOut(): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: false,
      steps: {
        serverSignOut: false,
        cookiesCleared: false,
        localStorageCleared: false,
        sessionStorageCleared: false
      },
      errors: []
    };

    // Step 1: Server-side session invalidation
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      result.steps.serverSignOut = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Server sign-out failed: ${errorMessage}`);
      // Continue with client-side cleanup even if server sign-out fails
    }

    // Step 2: Clear authentication cookies
    try {
      this.clearAuthCookies();
      result.steps.cookiesCleared = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Cookie clearing failed: ${errorMessage}`);
    }

    // Step 3: Clear localStorage
    try {
      this.clearLocalStorage();
      result.steps.localStorageCleared = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`localStorage clearing failed: ${errorMessage}`);
    }

    // Step 4: Clear sessionStorage
    try {
      this.clearSessionStorage();
      result.steps.sessionStorageCleared = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`sessionStorage clearing failed: ${errorMessage}`);
    }

    // Determine overall success
    result.success = result.steps.serverSignOut && 
                     result.steps.cookiesCleared && 
                     result.steps.localStorageCleared && 
                     result.steps.sessionStorageCleared;

    return result;
  }

  /**
   * Clear all authentication cookies
   * Uses CookieManager for proper cookie deletion
   */
  clearAuthCookies(): void {
    if (!this.isBrowser) {
      throw new Error('Cookie clearing must be called in browser context');
    }

    cookieManager.clearAuthCookies();
  }

  /**
   * Clear all localStorage entries related to authentication
   * Includes Supabase session data and application-specific user data
   */
  clearLocalStorage(): void {
    if (!this.isBrowser) {
      throw new Error('localStorage clearing must be called in browser context');
    }

    // List of known auth-related localStorage keys
    const authKeys = [
      'supabase.auth.token',
      'sb-access-token',
      'sb-refresh-token',
    ];

    // Clear known auth keys
    authKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        // Continue even if individual key removal fails
        console.error(`Failed to remove localStorage key: ${key}`, error);
      }
    });

    // Also clear any keys that start with 'sb-' or 'supabase'
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (key.startsWith('sb-') || key.startsWith('supabase')) {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.error(`Failed to remove localStorage key: ${key}`, error);
        }
      }
    });
  }

  /**
   * Clear all sessionStorage
   * This is a complete clear since sessionStorage is session-specific
   */
  clearSessionStorage(): void {
    if (!this.isBrowser) {
      throw new Error('sessionStorage clearing must be called in browser context');
    }

    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('Failed to clear sessionStorage', error);
      throw error;
    }
  }

  /**
   * Reset application state
   * This should be called by the AuthContext to reset React state
   * 
   * Note: This method doesn't directly reset state, but provides
   * a hook for the AuthContext to know when to reset
   */
  resetAppState(): void {
    // This is a placeholder for AuthContext integration
    // The actual state reset happens in AuthContext
  }

  /**
   * Verify that cleanup was successful
   * Checks for any remaining authentication artifacts
   * 
   * @returns true if cleanup is complete, false if artifacts remain
   */
  verifyCleanup(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    // Check for remaining auth cookies
    const cookies = document.cookie.split(';');
    const hasAuthCookies = cookies.some(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      return cookieName.startsWith('sb-') || 
             cookieName === 'whoop_oauth_state' ||
             cookieName === 'sb-access-token' ||
             cookieName === 'sb-refresh-token';
    });

    if (hasAuthCookies) {
      return false;
    }

    // Check for remaining localStorage keys
    const localStorageKeys = Object.keys(localStorage);
    const hasAuthLocalStorage = localStorageKeys.some(key => 
      key.startsWith('sb-') || 
      key.startsWith('supabase') ||
      key === 'supabase.auth.token'
    );

    if (hasAuthLocalStorage) {
      return false;
    }

    // Check sessionStorage (should be empty or have no auth data)
    const sessionStorageKeys = Object.keys(sessionStorage);
    const hasAuthSessionStorage = sessionStorageKeys.some(key =>
      key.startsWith('sb-') || 
      key.startsWith('supabase')
    );

    if (hasAuthSessionStorage) {
      return false;
    }

    return true;
  }

  /**
   * Get detailed cleanup status for diagnostics
   * 
   * @returns Object with detailed status of each storage mechanism
   */
  getCleanupStatus(): {
    cookies: string[];
    localStorage: string[];
    sessionStorage: string[];
  } {
    if (!this.isBrowser) {
      return {
        cookies: [],
        localStorage: [],
        sessionStorage: []
      };
    }

    // Get remaining auth cookies
    const cookies = document.cookie.split(';')
      .map(cookie => cookie.split('=')[0].trim())
      .filter(name => 
        name.startsWith('sb-') || 
        name === 'whoop_oauth_state' ||
        name === 'sb-access-token' ||
        name === 'sb-refresh-token'
      );

    // Get remaining auth localStorage keys
    const localStorageKeys = Object.keys(localStorage)
      .filter(key => 
        key.startsWith('sb-') || 
        key.startsWith('supabase') ||
        key === 'supabase.auth.token'
      );

    // Get remaining auth sessionStorage keys
    const sessionStorageKeys = Object.keys(sessionStorage)
      .filter(key =>
        key.startsWith('sb-') || 
        key.startsWith('supabase')
      );

    return {
      cookies,
      localStorage: localStorageKeys,
      sessionStorage: sessionStorageKeys
    };
  }
}

// Export singleton instance
export const sessionCleanupService = new SessionCleanupService();
