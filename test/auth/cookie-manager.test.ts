/**
 * Unit Tests for Cookie Manager
 * 
 * Tests cookie operations, security attributes, and environment detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CookieManager, serverCookieHelpers } from '@/app/lib/auth/cookie-manager';

describe('CookieManager', () => {
  let cookieManager: CookieManager;
  let originalEnv: string | undefined;

  beforeEach(() => {
    cookieManager = new CookieManager();
    originalEnv = process.env.NODE_ENV;
  });

  describe('Environment Detection', () => {
    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production';
      const manager = new CookieManager();
      expect(manager.isProductionEnvironment()).toBe(true);
    });

    it('should detect development environment', () => {
      process.env.NODE_ENV = 'development';
      const manager = new CookieManager();
      expect(manager.isProductionEnvironment()).toBe(false);
    });

    it('should detect browser context', () => {
      // In Node.js test environment, window is undefined
      expect(cookieManager.isBrowserContext()).toBe(false);
    });
  });

  describe('Cookie Configuration Validation', () => {
    it('should validate secure cookie in production', () => {
      process.env.NODE_ENV = 'production';
      const manager = new CookieManager();

      const result = manager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: true,
        sameSite: 'Lax',
        path: '/'
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should flag missing secure flag in production', () => {
      process.env.NODE_ENV = 'production';
      const manager = new CookieManager();

      const result = manager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: false,
        sameSite: 'Lax',
        path: '/'
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Secure flag should be true in production');
    });

    it('should allow non-secure cookies in development', () => {
      process.env.NODE_ENV = 'development';
      const manager = new CookieManager();

      const result = manager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: false,
        sameSite: 'Lax',
        path: '/'
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should require SameSite attribute', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value',
        path: '/'
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('SameSite must be Strict, Lax, or None');
    });

    it('should require Secure flag when SameSite=None', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: false,
        sameSite: 'None',
        path: '/'
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('SameSite=None requires Secure flag');
    });

    it('should require explicit path', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: true,
        sameSite: 'Lax'
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Path should be explicitly set');
    });

    it('should validate OAuth state cookie expiration', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'whoop_oauth_state',
        value: 'state123',
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 3600 // Wrong: should be 600
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('OAuth state cookie should have 10 minute (600s) expiration');
    });

    it('should accept valid OAuth state cookie config', () => {
      process.env.NODE_ENV = 'production';
      const manager = new CookieManager();

      const result = manager.validateCookieConfig({
        name: 'whoop_oauth_state',
        value: 'state123',
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 600
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('OAuth State Cookie Configuration', () => {
    it('should return correct OAuth state cookie config in production', () => {
      process.env.NODE_ENV = 'production';
      const manager = new CookieManager();

      const config = manager.getOAuthStateCookieConfig('test-state');

      expect(config.maxAge).toBe(600);
      expect(config.path).toBe('/');
      expect(config.secure).toBe(true);
      expect(config.sameSite).toBe('Lax');
      expect(config.httpOnly).toBe(true);
    });

    it('should return correct OAuth state cookie config in development', () => {
      process.env.NODE_ENV = 'development';
      const manager = new CookieManager();

      const config = manager.getOAuthStateCookieConfig('test-state');

      expect(config.maxAge).toBe(600);
      expect(config.path).toBe('/');
      expect(config.secure).toBe(false);
      expect(config.sameSite).toBe('Lax');
      expect(config.httpOnly).toBe(true);
    });
  });

  describe('Server Cookie Helpers', () => {
    it('should provide auth cookie options with defaults', () => {
      process.env.NODE_ENV = 'production';
      
      const options = serverCookieHelpers.getAuthCookieOptions();

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(86400);
    });

    it('should allow custom maxAge for auth cookies', () => {
      const options = serverCookieHelpers.getAuthCookieOptions(3600);

      expect(options.maxAge).toBe(3600);
    });

    it('should provide OAuth state cookie options', () => {
      process.env.NODE_ENV = 'production';
      
      const options = serverCookieHelpers.getOAuthStateCookieOptions();

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(600);
    });

    it('should use non-secure cookies in development', () => {
      process.env.NODE_ENV = 'development';
      
      const authOptions = serverCookieHelpers.getAuthCookieOptions();
      const oauthOptions = serverCookieHelpers.getOAuthStateCookieOptions();

      expect(authOptions.secure).toBe(false);
      expect(oauthOptions.secure).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle cookie names with special characters', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'my-cookie_123',
        value: 'value',
        secure: true,
        sameSite: 'Lax',
        path: '/'
      });

      expect(result.valid).toBe(true);
    });

    it('should handle cookie values with special characters', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value=with&special?chars',
        secure: true,
        sameSite: 'Lax',
        path: '/'
      });

      expect(result.valid).toBe(true);
    });

    it('should handle domain-scoped cookies', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: true,
        sameSite: 'Lax',
        path: '/',
        domain: '.example.com'
      });

      expect(result.valid).toBe(true);
    });

    it('should handle cookies with zero maxAge', () => {
      const result = cookieManager.validateCookieConfig({
        name: 'test',
        value: 'value',
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Server-Side Error Handling', () => {
    it('should throw error when trying to set cookie server-side', () => {
      // In Node.js environment (not browser)
      expect(() => {
        cookieManager.setCookie({
          name: 'test',
          value: 'value'
        });
      }).toThrow('Server-side cookie setting should use Next.js cookies() API');
    });

    it('should throw error when trying to get cookie server-side', () => {
      expect(() => {
        cookieManager.getCookie('test');
      }).toThrow('Server-side cookie reading should use Next.js cookies() API');
    });

    it('should throw error when trying to delete cookie server-side', () => {
      expect(() => {
        cookieManager.deleteCookie('test');
      }).toThrow('Server-side cookie deletion should use Next.js cookies() API');
    });

    it('should throw error when trying to clear auth cookies server-side', () => {
      expect(() => {
        cookieManager.clearAuthCookies();
      }).toThrow('Server-side cookie clearing should use Next.js cookies() API');
    });
  });
});

describe('Cookie Security Requirements', () => {
  it('should enforce Requirement 4.1: proper cookie scope configuration', () => {
    const manager = new CookieManager();
    
    const config = {
      name: 'auth-token',
      value: 'token123',
      path: '/',
      domain: 'example.com',
      secure: true,
      sameSite: 'Lax' as const
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should enforce Requirement 4.2: Secure flag in production', () => {
    process.env.NODE_ENV = 'production';
    const manager = new CookieManager();
    
    const config = {
      name: 'auth-token',
      value: 'token123',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
    expect(config.secure).toBe(true);
  });

  it('should enforce Requirement 4.3: SameSite=Lax for OAuth compatibility', () => {
    const manager = new CookieManager();
    
    const config = {
      name: 'whoop_oauth_state',
      value: 'state123',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const,
      maxAge: 600
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
    expect(config.sameSite).toBe('Lax');
  });

  it('should enforce Requirement 4.4: OAuth state cookie expiration', () => {
    const manager = new CookieManager();
    
    const oauthConfig = manager.getOAuthStateCookieConfig('state123');
    
    expect(oauthConfig.maxAge).toBe(600); // 10 minutes
  });

  it('should enforce Requirement 4.5: proper cookie clearing with domain/path', () => {
    const manager = new CookieManager();
    
    // Validation ensures path is set for proper clearing
    const config = {
      name: 'auth-token',
      value: 'token123',
      path: '/',
      secure: true,
      sameSite: 'Lax' as const
    };

    const result = manager.validateCookieConfig(config);
    expect(result.valid).toBe(true);
    expect(config.path).toBe('/');
  });
});
