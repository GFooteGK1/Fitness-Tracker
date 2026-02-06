/**
 * Cookie Manager Utility
 * 
 * Centralized cookie operations with proper security configuration.
 * Supports both browser and server contexts.
 * 
 * Security Features:
 * - Automatic Secure flag in production
 * - SameSite=Lax by default for OAuth compatibility
 * - Proper domain and path scoping
 * - Environment-aware configuration
 */

export interface CookieConfig {
  name: string;
  value: string;
  maxAge?: number; // in seconds
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  httpOnly?: boolean; // Note: only works server-side
}

export class CookieManager {
  private isProduction: boolean;
  private isBrowser: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.isBrowser = typeof window !== 'undefined';
  }

  /**
   * Set a cookie with proper security attributes
   * 
   * @param config - Cookie configuration
   */
  setCookie(config: CookieConfig): void {
    const {
      name,
      value,
      maxAge,
      path = '/',
      domain,
      secure = this.isProduction,
      sameSite = 'Lax',
      httpOnly = false
    } = config;

    // Build cookie string
    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

    if (maxAge !== undefined) {
      cookieString += `; Max-Age=${maxAge}`;
      // Also set Expires for better browser compatibility
      const expires = new Date(Date.now() + maxAge * 1000);
      cookieString += `; Expires=${expires.toUTCString()}`;
    }

    cookieString += `; Path=${path}`;

    if (domain) {
      cookieString += `; Domain=${domain}`;
    }

    if (secure) {
      cookieString += '; Secure';
    }

    cookieString += `; SameSite=${sameSite}`;

    // HttpOnly can only be set server-side
    if (httpOnly && !this.isBrowser) {
      cookieString += '; HttpOnly';
    }

    // Set the cookie
    if (this.isBrowser) {
      document.cookie = cookieString;
    } else {
      // Server-side: This is a helper for building cookie strings
      // Actual setting happens via Next.js cookies() API
      throw new Error('Server-side cookie setting should use Next.js cookies() API');
    }
  }

  /**
   * Get a cookie value by name
   * 
   * @param name - Cookie name
   * @returns Cookie value or null if not found
   */
  getCookie(name: string): string | null {
    if (!this.isBrowser) {
      throw new Error('Server-side cookie reading should use Next.js cookies() API');
    }

    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const [cookieName, cookieValue] = cookie.split('=').map(c => c.trim());
      
      if (decodeURIComponent(cookieName) === name) {
        return decodeURIComponent(cookieValue);
      }
    }

    return null;
  }

  /**
   * Delete a cookie by setting it to expire immediately
   * 
   * @param name - Cookie name
   * @param path - Cookie path (must match the path used when setting)
   * @param domain - Cookie domain (must match the domain used when setting)
   */
  deleteCookie(name: string, path: string = '/', domain?: string): void {
    if (!this.isBrowser) {
      throw new Error('Server-side cookie deletion should use Next.js cookies() API');
    }

    // Set cookie with past expiration date
    let cookieString = `${encodeURIComponent(name)}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}`;

    if (domain) {
      cookieString += `; Domain=${domain}`;
    }

    document.cookie = cookieString;
  }

  /**
   * Clear all authentication-related cookies
   * This includes Supabase auth cookies and WHOOP OAuth state
   */
  clearAuthCookies(): void {
    if (!this.isBrowser) {
      throw new Error('Server-side cookie clearing should use Next.js cookies() API');
    }

    // List of known auth cookie names
    const authCookieNames = [
      'sb-access-token',
      'sb-refresh-token',
      'whoop_oauth_state',
      // Supabase may use different cookie names depending on configuration
      // These patterns cover common variations
    ];

    // Get all cookies and filter for auth-related ones
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const cookieName = cookie.split('=')[0].trim();
      
      // Delete if it matches known auth cookies or starts with 'sb-'
      if (authCookieNames.includes(cookieName) || cookieName.startsWith('sb-')) {
        this.deleteCookie(cookieName);
        
        // Also try deleting with common domain variations
        // This ensures cookies are cleared even if domain was explicitly set
        const hostname = window.location.hostname;
        this.deleteCookie(cookieName, '/', hostname);
        
        // Try with leading dot for subdomain cookies
        if (hostname.includes('.')) {
          const rootDomain = hostname.split('.').slice(-2).join('.');
          this.deleteCookie(cookieName, '/', `.${rootDomain}`);
        }
      }
    }
  }

  /**
   * Get cookie configuration for OAuth state
   * Returns a config object suitable for server-side cookie setting
   * 
   * @param state - OAuth state value
   * @returns Cookie configuration
   */
  getOAuthStateCookieConfig(state: string): Omit<CookieConfig, 'name' | 'value'> {
    return {
      maxAge: 600, // 10 minutes
      path: '/',
      secure: this.isProduction,
      sameSite: 'Lax',
      httpOnly: true
    };
  }

  /**
   * Validate cookie security attributes
   * Used for testing and verification
   * 
   * @param config - Cookie configuration to validate
   * @returns Validation result with any issues found
   */
  validateCookieConfig(config: CookieConfig): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for secure flag in production
    if (this.isProduction && !config.secure) {
      issues.push('Secure flag should be true in production');
    }

    // Check for appropriate SameSite value
    if (!config.sameSite || !['Strict', 'Lax', 'None'].includes(config.sameSite)) {
      issues.push('SameSite must be Strict, Lax, or None');
    }

    // If SameSite=None, Secure must be true
    if (config.sameSite === 'None' && !config.secure) {
      issues.push('SameSite=None requires Secure flag');
    }

    // Check for path
    if (!config.path) {
      issues.push('Path should be explicitly set');
    }

    // Check OAuth state cookie expiration
    if (config.name === 'whoop_oauth_state' && config.maxAge !== 600) {
      issues.push('OAuth state cookie should have 10 minute (600s) expiration');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Check if running in production environment
   */
  isProductionEnvironment(): boolean {
    return this.isProduction;
  }

  /**
   * Check if running in browser context
   */
  isBrowserContext(): boolean {
    return this.isBrowser;
  }
}

// Export singleton instance for convenience
export const cookieManager = new CookieManager();

// Export helper functions for server-side use with Next.js cookies() API
export const serverCookieHelpers = {
  /**
   * Get cookie configuration for setting via Next.js cookies() API
   */
  getAuthCookieOptions: (maxAge?: number) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAge || 86400 // 24 hours default
  }),

  /**
   * Get OAuth state cookie options
   */
  getOAuthStateCookieOptions: () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600 // 10 minutes
  })
};
