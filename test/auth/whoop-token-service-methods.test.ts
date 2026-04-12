/**
 * Unit Tests for WHOOP Token Service Methods
 * 
 * Verifies that all required methods from Task 3 are implemented:
 * - retrieveTokens() - fetch and decrypt tokens from database
 * - hasValidTokens() - check token existence and validity
 * - initializeConnection() - app startup token restoration
 * - Token expiry validation logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('@/app/lib/auth/supabase-server', () => ({
  createServerClient: vi.fn()
}));

vi.mock('@/app/lib/whoop/encryption', () => ({
  encryptTokens: vi.fn((access, refresh) => ({
    accessTokenEncrypted: `encrypted_${access}`,
    refreshTokenEncrypted: `encrypted_${refresh}`
  })),
  decryptTokens: vi.fn((access, refresh) => ({
    accessToken: access.replace('encrypted_', ''),
    refreshToken: refresh.replace('encrypted_', '')
  }))
}));

vi.mock('@/app/lib/whoop/api-client', () => ({
  refreshAccessToken: vi.fn()
}));

import { createServerClient } from '@/app/lib/auth/supabase-server';
import * as tokenService from '@/app/lib/whoop/token-service';

describe('WHOOP Token Service - Task 3 Methods', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      }),
      update: vi.fn().mockReturnThis()
    };

    (createServerClient as any).mockResolvedValue(mockSupabase);
  });

  afterEach(async () => {
    // Restore decryptTokens to default mock (decryption failure tests override it)
    const { decryptTokens } = await import('@/app/lib/whoop/encryption');
    (decryptTokens as any).mockImplementation((access: string, refresh: string) => ({
      accessToken: access.replace('encrypted_', ''),
      refreshToken: refresh.replace('encrypted_', '')
    }));
  });

  describe('retrieveTokens()', () => {
    it('should be defined and callable', () => {
      expect(tokenService.retrieveTokens).toBeDefined();
      expect(typeof tokenService.retrieveTokens).toBe('function');
    });

    it('should retrieve and decrypt tokens from database', async () => {
      const userId = 'test-user-123';
      const mockData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: mockData, error: null });

      const result = await tokenService.retrieveTokens(userId);

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('access_token');
      expect(result?.refreshToken).toBe('refresh_token');
      expect(mockSupabase.from).toHaveBeenCalledWith('whoop_tokens');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', userId);
    });

    it('should return null when no tokens exist', async () => {
      mockSupabase.single.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await tokenService.retrieveTokens('non-existent-user');

      expect(result).toBeNull();
    });
  });

  describe('hasValidTokens()', () => {
    it('should be defined and callable', () => {
      expect(tokenService.hasValidTokens).toBeDefined();
      expect(typeof tokenService.hasValidTokens).toBe('function');
    });

    it('should return true for valid non-expired tokens', async () => {
      const userId = 'test-user-123';
      const mockData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour in future
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: mockData, error: null });

      const result = await tokenService.hasValidTokens(userId);

      expect(result).toBe(true);
    });

    it('should return false for expired tokens', async () => {
      const userId = 'test-user-123';
      const mockData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour in past
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: mockData, error: null });

      const result = await tokenService.hasValidTokens(userId);

      expect(result).toBe(false);
    });

    it('should return false when no tokens exist', async () => {
      mockSupabase.single.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await tokenService.hasValidTokens('non-existent-user');

      expect(result).toBe(false);
    });

    it('should return false and log error on exception', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const result = await tokenService.hasValidTokens('test-user');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('initializeConnection()', () => {
    it('should be defined and callable', () => {
      expect(tokenService.initializeConnection).toBeDefined();
      expect(typeof tokenService.initializeConnection).toBe('function');
    });

    it('should return true for valid tokens', async () => {
      const userId = 'test-user-123';
      const mockData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: mockData, error: null });

      const result = await tokenService.initializeConnection(userId);

      expect(result).toBe(true);
    });

    it('should return false when no tokens exist', async () => {
      mockSupabase.single.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      const result = await tokenService.initializeConnection('non-existent-user');

      expect(result).toBe(false);
    });

    it('should return false for expired tokens that cannot be refreshed', async () => {
      const userId = 'test-user-123';
      const mockData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired
        scope: 'read:recovery read:sleep offline'
      };

      // First call for getTokens
      mockSupabase.single.mockResolvedValueOnce({ data: mockData, error: null });
      
      // Mock refresh failure
      const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
      (refreshAccessToken as any).mockRejectedValue(new Error('Refresh failed'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await tokenService.initializeConnection(userId);

      expect(result).toBe(false);
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabase.single.mockRejectedValue(new Error('Database error'));

      const result = await tokenService.initializeConnection('test-user');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Token Expiry Validation Logic', () => {
    it('should validate token expiration correctly', async () => {
      const userId = 'test-user-123';
      
      // Test with valid token
      const validTokenData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: validTokenData, error: null });

      const validResult = await tokenService.validateTokens(userId);
      expect(validResult.valid).toBe(true);
      expect(validResult.expired).toBe(false);
    });

    it('should detect expired tokens', async () => {
      const userId = 'test-user-123';
      
      const expiredTokenData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });

      const expiredResult = await tokenService.validateTokens(userId);
      expect(expiredResult.valid).toBe(false);
      expect(expiredResult.expired).toBe(true);
      expect(expiredResult.needsRefresh).toBe(true);
    });

    it('should detect tokens expiring soon', async () => {
      const userId = 'test-user-123';
      
      // Token expires in 2 minutes (less than 5 minute threshold)
      const expiringSoonData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access_token',
        refresh_token_encrypted: 'encrypted_refresh_token',
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        scope: 'read:recovery read:sleep offline'
      };

      mockSupabase.single.mockResolvedValue({ data: expiringSoonData, error: null });

      const result = await tokenService.validateTokens(userId);
      expect(result.valid).toBe(true);
      expect(result.needsRefresh).toBe(true);
      expect(result.expired).toBe(false);
    });
  });

  describe('Error Handling - Task 3.4', () => {
    describe('Invalid Refresh Token Handling (Edge Case 3.4)', () => {
      it('should handle 401 Unauthorized response from refresh endpoint', async () => {
        const userId = 'test-user-123';
        const expiredTokenData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        const refreshError = new Error('Unauthorized');
        (refreshError as any).status = 401;
        (refreshAccessToken as any).mockRejectedValue(refreshError);

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to refresh tokens'),
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });

      it('should handle 403 Forbidden response from refresh endpoint', async () => {
        const userId = 'test-user-123';
        const expiredTokenData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        const refreshError = new Error('Forbidden');
        (refreshError as any).status = 403;
        (refreshAccessToken as any).mockRejectedValue(refreshError);

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        expect(result).toBe(false);
        consoleErrorSpy.mockRestore();
      });
    });

    describe('Token Decryption Failure', () => {
      it('should handle decryption errors gracefully', async () => {
        const userId = 'test-user-123';
        const mockData = {
          user_id: userId,
          access_token_encrypted: 'corrupted_data',
          refresh_token_encrypted: 'corrupted_data',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: mockData, error: null });
        
        const { decryptTokens } = await import('@/app/lib/whoop/encryption');
        (decryptTokens as any).mockImplementation(() => {
          throw new Error('Decryption failed: Invalid auth tag');
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.retrieveTokens(userId);

        // Should return null on decryption failure
        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should clean up corrupted tokens after decryption failure', async () => {
        const userId = 'test-user-123';
        const mockData = {
          user_id: userId,
          access_token_encrypted: 'corrupted_data',
          refresh_token_encrypted: 'corrupted_data',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: mockData, error: null });
        const mockDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
        mockSupabase.delete.mockReturnValue({ eq: mockDeleteEq });

        const { decryptTokens } = await import('@/app/lib/whoop/encryption');
        (decryptTokens as any).mockImplementation(() => {
          throw new Error('Decryption failed');
        });

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await tokenService.retrieveTokens(userId);

        // Verify cleanup was attempted
        expect(mockSupabase.delete).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Token Retrieval Failure', () => {
      it('should handle database connection errors', async () => {
        const userId = 'test-user-123';
        const dbError = new Error('Connection timeout');

        mockSupabase.single.mockRejectedValue(dbError);

        await expect(tokenService.retrieveTokens(userId)).rejects.toThrow('Connection timeout');
      });

      it('should handle database query errors', async () => {
        const userId = 'test-user-123';

        mockSupabase.single.mockResolvedValue({
          data: null,
          error: { message: 'Query failed', code: 'PGRST500' }
        });

        await expect(tokenService.retrieveTokens(userId)).rejects.toThrow('Failed to retrieve WHOOP tokens: Query failed');
      });

      it('should return false from hasValidTokens on retrieval failure', async () => {
        mockSupabase.single.mockRejectedValue(new Error('Database error'));

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.hasValidTokens('test-user');

        expect(result).toBe(false);

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Network Errors During Refresh', () => {
      it('should handle network timeout errors', async () => {
        const userId = 'test-user-123';
        const expiredTokenData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        const networkError = new Error('Network timeout');
        (networkError as any).code = 'ETIMEDOUT';
        (refreshAccessToken as any).mockRejectedValue(networkError);

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should handle DNS resolution errors', async () => {
        const userId = 'test-user-123';
        const expiredTokenData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        const dnsError = new Error('getaddrinfo ENOTFOUND');
        (dnsError as any).code = 'ENOTFOUND';
        (refreshAccessToken as any).mockRejectedValue(dnsError);

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        expect(result).toBe(false);

        consoleErrorSpy.mockRestore();
      });

      it('should handle connection refused errors', async () => {
        const userId = 'test-user-123';
        const expiredTokenData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        const connError = new Error('connect ECONNREFUSED');
        (connError as any).code = 'ECONNREFUSED';
        (refreshAccessToken as any).mockRejectedValue(connError);

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        expect(result).toBe(false);

        consoleErrorSpy.mockRestore();
      });

      it('should not fail initialization if proactive refresh fails for valid tokens', async () => {
        const userId = 'test-user-123';
        // Token expires in 2 minutes (triggers proactive refresh)
        const expiringSoonData = {
          user_id: userId,
          access_token_encrypted: 'encrypted_access_token',
          refresh_token_encrypted: 'encrypted_refresh_token',
          expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
          scope: 'read:recovery read:sleep offline'
        };

        mockSupabase.single.mockResolvedValue({ data: expiringSoonData, error: null });
        
        const { refreshAccessToken } = await import('@/app/lib/whoop/api-client');
        (refreshAccessToken as any).mockRejectedValue(new Error('Network error'));

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await tokenService.initializeConnection(userId);

        // Should still return true because current tokens are valid
        expect(result).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Proactive token refresh failed'),
          expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
      });
    });
  });
});
