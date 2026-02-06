/**
 * WHOOP Token Service
 * 
 * Manages WHOOP OAuth tokens with encryption:
 * - Store encrypted tokens in database
 * - Retrieve and decrypt tokens
 * - Refresh expired access tokens
 * - Validate token expiration
 * - Check token validity
 * - Initialize connection on app startup
 * - Delete tokens on disconnect
 */

import { createServerClient } from '../auth/supabase-server';
import { encryptTokens, decryptTokens } from './encryption';
import { refreshAccessToken as refreshTokenAPI } from './api-client';
import type { WhoopTokens, TokenValidationResult } from '../types/whoop';

/**
 * Store WHOOP tokens for a user (encrypted)
 * Uses upsert pattern to handle both insert and update
 */
export async function storeTokens(
  userId: string,
  tokens: WhoopTokens
): Promise<void> {
  const supabase = await createServerClient();

  // Encrypt tokens before storage
  const { accessTokenEncrypted, refreshTokenEncrypted } = encryptTokens(
    tokens.accessToken,
    tokens.refreshToken
  );

  const { error } = await supabase
    .from('whoop_tokens')
    .upsert({
      user_id: userId,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      expires_at: tokens.expiresAt.toISOString(),
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    throw new Error(`Failed to store WHOOP tokens: ${error.message}`);
  }
}

/**
 * Retrieve and decrypt WHOOP tokens for a user
 * Returns null if no tokens found
 * 
 * Requirements: 3.1, 3.2
 */
export async function getTokens(userId: string): Promise<WhoopTokens | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('whoop_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - user hasn't connected WHOOP
      return null;
    }
    throw new Error(`Failed to retrieve WHOOP tokens: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  try {
    // Decrypt tokens
    const { accessToken, refreshToken } = decryptTokens(
      data.access_token_encrypted,
      data.refresh_token_encrypted
    );

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(data.expires_at),
      scope: data.scope,
    };
  } catch (decryptError) {
    // Decryption failed - tokens may be corrupted
    console.error('Failed to decrypt WHOOP tokens:', decryptError);
    // Delete corrupted tokens
    await deleteTokens(userId);
    return null;
  }
}

/**
 * Delete all WHOOP tokens for a user
 * Called when user disconnects WHOOP
 */
export async function deleteTokens(userId: string): Promise<void> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('whoop_tokens')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete WHOOP tokens: ${error.message}`);
  }

  // Also clear sync status
  await supabase
    .from('whoop_sync_status')
    .update({
      status: 'idle',
      last_sync_at: null,
      next_sync_at: null,
      error_message: null,
    })
    .eq('user_id', userId);
}

/**
 * Refresh an expired access token using the refresh token
 * Automatically stores the new tokens
 */
export async function refreshAccessToken(userId: string): Promise<WhoopTokens> {
  // Get current tokens
  const currentTokens = await getTokens(userId);
  
  if (!currentTokens) {
    throw new Error('No WHOOP tokens found for user');
  }

  try {
    // Call WHOOP API to refresh
    const newTokens = await refreshTokenAPI(currentTokens.refreshToken);

    // Store new tokens
    await storeTokens(userId, newTokens);

    return newTokens;
  } catch (error) {
    // Refresh failed - mark connection as unhealthy
    const supabase = await createServerClient();
    await supabase
      .from('whoop_sync_status')
      .upsert({
        user_id: userId,
        status: 'error',
        error_message: 'Token refresh failed. Please reconnect WHOOP.',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    throw new Error(`Failed to refresh WHOOP access token: ${error}`);
  }
}

/**
 * Validate tokens and check expiration status
 * Returns validation result with recommendations
 */
export async function validateTokens(
  userId: string
): Promise<TokenValidationResult> {
  const tokens = await getTokens(userId);

  if (!tokens) {
    return {
      valid: false,
      needsRefresh: false,
      expired: true,
    };
  }

  const now = new Date();
  const expiresAt = new Date(tokens.expiresAt);
  const timeUntilExpiry = expiresAt.getTime() - now.getTime();

  // Token is expired
  if (timeUntilExpiry <= 0) {
    return {
      valid: false,
      needsRefresh: true,
      expired: true,
    };
  }

  // Token expires in less than 5 minutes - should refresh proactively
  if (timeUntilExpiry < 5 * 60 * 1000) {
    return {
      valid: true,
      needsRefresh: true,
      expired: false,
    };
  }

  // Token is valid and not expiring soon
  return {
    valid: true,
    needsRefresh: false,
    expired: false,
  };
}

/**
 * Get valid access token, refreshing if necessary
 * This is a convenience function for API calls
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const validation = await validateTokens(userId);

  if (!validation.valid) {
    throw new Error('No valid WHOOP tokens found');
  }

  if (validation.needsRefresh) {
    const newTokens = await refreshAccessToken(userId);
    return newTokens.accessToken;
  }

  const tokens = await getTokens(userId);
  if (!tokens) {
    throw new Error('Failed to retrieve WHOOP tokens');
  }

  return tokens.accessToken;
}

/**
 * Retrieve and decrypt WHOOP tokens for a user
 * Alias for getTokens() to match design document naming
 * Returns null if no tokens found
 * 
 * Requirements: 3.1, 3.2
 */
export async function retrieveTokens(userId: string): Promise<WhoopTokens | null> {
  return getTokens(userId);
}

/**
 * Check if user has valid WHOOP tokens
 * Returns true if tokens exist and are valid (not expired)
 * 
 * Requirements: 3.1, 3.2
 */
export async function hasValidTokens(userId: string): Promise<boolean> {
  try {
    const validation = await validateTokens(userId);
    return validation.valid;
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
}

/**
 * Initialize WHOOP connection on app startup
 * Retrieves tokens, validates them, and attempts refresh if needed
 * Returns true if connection is successfully initialized
 * 
 * Requirements: 3.1, 3.2, 3.3
 */
export async function initializeConnection(userId: string): Promise<boolean> {
  try {
    // Check if tokens exist
    const tokens = await getTokens(userId);
    
    if (!tokens) {
      // No tokens found - user hasn't connected WHOOP
      return false;
    }

    // Validate token expiration
    const validation = await validateTokens(userId);

    if (!validation.valid) {
      // Tokens are expired and can't be used
      if (validation.needsRefresh) {
        // Try to refresh the tokens
        try {
          await refreshAccessToken(userId);
          return true;
        } catch (refreshError) {
          console.error('Failed to refresh tokens during initialization:', refreshError);
          return false;
        }
      }
      return false;
    }

    // Tokens are valid
    if (validation.needsRefresh) {
      // Proactively refresh tokens that are expiring soon
      try {
        await refreshAccessToken(userId);
      } catch (refreshError) {
        // Log but don't fail - current tokens are still valid
        console.warn('Proactive token refresh failed during initialization:', refreshError);
      }
    }

    return true;
  } catch (error) {
    console.error('Error initializing WHOOP connection:', error);
    return false;
  }
}
