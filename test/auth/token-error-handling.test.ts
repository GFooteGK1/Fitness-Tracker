/**
 * Unit Tests for WHOOP Token Error Handling
 * Task 3.4: Write unit tests for token error handling
 * 
 * Test cases:
 * 1. Invalid refresh token handling (401/403 response)
 * 2. Token decryption failure
 * 3. Token retrieval failure (database error)
 * 4. Network errors during refresh
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { decryptTokens } from '@/app/lib/whoop/encryption';
import { refreshAccessToken as refreshTokenAPI } from '@/app/lib/whoop/api-client';
import * as tokenService from '@/app/lib/whoop/token-service';

describe('WHOOP Token Error Handling', () => {
  let mockSupabase: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock that supports the full Supabase chaining pattern:
    // supabase.from(...).select(...).eq(...).single()
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });

    // For upsert chain: supabase.from(...).upsert(...)
    const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });

    mockSupabase = {
      from: vi.fn().mockImplementation(() => mockSupabase),
      select: vi.fn().mockImplementation(() => mockSupabase),
      eq: mockEq,
      single: mockSingle,
      upsert: mockUpsert,
      delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
      update: vi.fn().mockImplementation(() => mockSupabase)
    };

    (createServerClient as any).mockResolvedValue(mockSupabase);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // Restore decryptTokens to default mock (tests in section 2 override it)
    (decryptTokens as any).mockImplementation((access: string, refresh: string) => ({
      accessToken: access.replace('encrypted_', ''),
      refreshToken: refresh.replace('encrypted_', '')
    }));
  });

  describe('1. Invalid Refresh Token Handling (401/403 Response)', () => {
    it('should handle 401 error and update sync status to error', async () => {
      const userId = 'test-user-401';
      const expiredTokenData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old_access',
        refresh_token_encrypted: 'encrypted_invalid_refresh',
        expires_at: new Date(Date.now() - 3600000).toISOString(),
        scope: 'read:recovery read:sleep'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Token refresh failed: 401 Unauthorized'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow('Failed to refresh WHOOP access token');
      
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: userId,
          status: 'error',
          error_message: 'Token refresh failed. Please reconnect WHOOP.'
        }),
        expect.objectContaining({ onConflict: 'user_id' })
      );
    });

    it('should handle 403 error and update sync status to error', async () => {
      const userId = 'test-user-403';
      const expiredTokenData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old_access',
        refresh_token_encrypted: 'encrypted_revoked_refresh',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredTokenData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Token refresh failed: 403 Forbidden'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();
      
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
        expect.any(Object)
      );
    });

    it('should throw error when no tokens found for refresh', async () => {
      const userId = 'test-user-no-tokens';
      
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' }
      });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow('No WHOOP tokens found for user');
    });

    it('should mark connection as unhealthy after refresh failure', async () => {
      const userId = 'test-user-unhealthy';
      const tokenData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_access',
        refresh_token_encrypted: 'encrypted_refresh',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: tokenData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Token refresh failed: 401'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();

      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: 'Token refresh failed. Please reconnect WHOOP.'
        }),
        expect.any(Object)
      );
    });
  });

  describe('2. Token Decryption Failure', () => {
    it('should return null when decryption fails', async () => {
      const userId = 'test-user-decrypt-fail';
      const corruptedTokenData = {
        user_id: userId,
        access_token_encrypted: 'corrupted_data_invalid_format',
        refresh_token_encrypted: 'corrupted_data_invalid_format',
        expires_at: new Date().toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: corruptedTokenData, error: null });
      (decryptTokens as any).mockImplementation(() => {
        throw new Error('Invalid encrypted token format');
      });

      const result = await tokenService.getTokens(userId);

      expect(result).toBeNull();
    });

    it('should log error when decryption fails', async () => {
      const userId = 'test-user-decrypt-log';
      mockSupabase.single.mockResolvedValue({
        data: {
          user_id: userId,
          access_token_encrypted: 'bad_data',
          refresh_token_encrypted: 'bad_data',
          expires_at: new Date().toISOString(),
          scope: 'read:recovery'
        },
        error: null
      });
      (decryptTokens as any).mockImplementation(() => {
        throw new Error('Decryption failed: Invalid auth tag');
      });

      await tokenService.getTokens(userId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to decrypt WHOOP tokens:',
        expect.any(Error)
      );
    });

    it('should delete corrupted tokens after decryption failure', async () => {
      const userId = 'test-user-delete-corrupted';
      mockSupabase.single.mockResolvedValue({
        data: {
          user_id: userId,
          access_token_encrypted: 'corrupted',
          refresh_token_encrypted: 'corrupted',
          expires_at: new Date().toISOString(),
          scope: 'read:recovery'
        },
        error: null
      });
      (decryptTokens as any).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await tokenService.getTokens(userId);

      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('whoop_tokens');
    });

    it('should handle decryption failure with wrong encryption key', async () => {
      const userId = 'test-user-wrong-key';
      mockSupabase.single.mockResolvedValue({
        data: {
          user_id: userId,
          access_token_encrypted: 'encrypted_with_different_key',
          refresh_token_encrypted: 'encrypted_with_different_key',
          expires_at: new Date().toISOString(),
          scope: 'read:recovery'
        },
        error: null
      });
      (decryptTokens as any).mockImplementation(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      });

      const result = await tokenService.getTokens(userId);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('3. Token Retrieval Failure (Database Error)', () => {
    it('should throw error on database connection failure', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'CONNECTION_ERROR', message: 'Database connection failed' }
      });

      await expect(tokenService.getTokens('user-123')).rejects.toThrow(
        'Failed to retrieve WHOOP tokens: Database connection failed'
      );
    });

    it('should throw error on query timeout', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'TIMEOUT', message: 'Query timeout exceeded' }
      });

      await expect(tokenService.getTokens('user-timeout')).rejects.toThrow(
        'Failed to retrieve WHOOP tokens: Query timeout exceeded'
      );
    });

    it('should return null for PGRST116 (no rows found)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' }
      });

      const result = await tokenService.getTokens('user-no-tokens');
      expect(result).toBeNull();
    });

    it('should throw error on RLS policy violation', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST301', message: 'Row level security policy violation' }
      });

      await expect(tokenService.getTokens('user-rls-violation')).rejects.toThrow(
        'Failed to retrieve WHOOP tokens'
      );
    });

    it('should handle null data without error code', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null
      });

      const result = await tokenService.getTokens('user-null-data');
      expect(result).toBeNull();
    });

    it('should propagate database errors during token validation', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'DB_ERROR', message: 'Internal database error' }
      });

      await expect(tokenService.validateTokens('user-validate-error')).rejects.toThrow();
    });
  });

  describe('4. Network Errors During Refresh', () => {
    it('should handle network timeout during token refresh', async () => {
      const userId = 'test-user-network-timeout';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Network timeout: ETIMEDOUT'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow(
        'Failed to refresh WHOOP access token'
      );
      
      expect(mockSupabase.upsert).toHaveBeenCalled();
    });

    it('should handle DNS resolution failure', async () => {
      const userId = 'test-user-dns-fail';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.prod.whoop.com'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();
    });

    it('should handle connection refused error', async () => {
      const userId = 'test-user-connection-refused';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('connect ECONNREFUSED'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();
    });

    it('should continue with valid tokens if proactive refresh fails during initialization', async () => {
      const userId = 'test-user-proactive-fail';
      const expiringSoon = {
        user_id: userId,
        access_token_encrypted: 'encrypted_valid',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiringSoon, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Network error during proactive refresh'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await tokenService.initializeConnection(userId);

      expect(result).toBe(true);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Proactive token refresh failed during initialization:',
        expect.any(Error)
      );
    });

    it('should fail initialization if expired tokens cannot be refreshed', async () => {
      const userId = 'test-user-init-fail';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_expired',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 3600000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Network timeout'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      const result = await tokenService.initializeConnection(userId);

      expect(result).toBe(false);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to refresh tokens during initialization:',
        expect.any(Error)
      );
    });

    it('should handle network error with no response', async () => {
      const userId = 'test-user-no-response';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('fetch failed'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();
    });

    it('should handle SSL/TLS errors', async () => {
      const userId = 'test-user-ssl-error';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_old',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('SSL certificate problem'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.refreshAccessToken(userId)).rejects.toThrow();
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle getValidAccessToken with network error during refresh', async () => {
      const userId = 'test-user-get-valid-fail';
      const expiredData = {
        user_id: userId,
        access_token_encrypted: 'encrypted_expired',
        refresh_token_encrypted: 'encrypted_valid',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scope: 'read:recovery'
      };

      mockSupabase.single.mockResolvedValue({ data: expiredData, error: null });
      (refreshTokenAPI as any).mockRejectedValue(new Error('Network error'));
      mockSupabase.upsert.mockResolvedValue({ data: null, error: null });

      await expect(tokenService.getValidAccessToken(userId)).rejects.toThrow();
    });

    it('should handle hasValidTokens returning false on error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'DB_ERROR', message: 'Database error' }
      });

      const result = await tokenService.hasValidTokens('user-error');
      
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking token validity:',
        expect.any(Error)
      );
    });

    it('should handle initializeConnection with no tokens', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' }
      });

      const result = await tokenService.initializeConnection('user-no-tokens');
      
      expect(result).toBe(false);
    });

    it('should handle initializeConnection with unexpected error', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Unexpected database error'));

      const result = await tokenService.initializeConnection('user-unexpected');
      
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error initializing WHOOP connection:',
        expect.any(Error)
      );
    });
  });
});
