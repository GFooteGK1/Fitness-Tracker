import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import * as whoopClient from '@/app/lib/whoop/api-client';
import * as tokenService from '@/app/lib/whoop/token-service';
import { fullSync } from '@/app/lib/whoop/sync-service';

/**
 * OAuth Callback Route
 * 
 * Handles the redirect from WHOOP OAuth authorization.
 * 
 * Flow:
 * 1. Receive code and state from WHOOP
 * 2. Validate state matches cookie
 * 3. Exchange code for tokens
 * 4. Store encrypted tokens
 * 5. Trigger initial sync (TODO: Task 7)
 * 6. Redirect to settings with success message
 * 
 * Error Handling:
 * - State mismatch → Security error, redirect to settings
 * - Token exchange failure → Display error message
 * - Sync failure → Store tokens anyway, mark sync as error
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[WHOOP Callback] Authentication failed:', authError);
      return NextResponse.redirect(
        new URL('/profile?error=unauthorized', request.url)
      );
    }

    // 2. Extract OAuth parameters
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // 3. Handle OAuth errors from WHOOP
    if (error) {
      console.error('[WHOOP Callback] OAuth error:', error, errorDescription);
      
      const errorMessages: Record<string, string> = {
        'access_denied': 'Authorization was denied. Please try again if you want to connect WHOOP.',
        'invalid_scope': 'Invalid permissions requested. Please contact support.',
        'server_error': 'WHOOP service is temporarily unavailable. Please try again later.',
        'invalid_grant': 'Authorization failed. Please reconnect WHOOP.',
      };
      
      const userMessage = errorMessages[error] || `Authorization failed: ${error}`;
      
      return NextResponse.redirect(
        new URL(`/profile?error=${encodeURIComponent(userMessage)}`, request.url)
      );
    }

    // 4. Validate required parameters
    if (!code || !state) {
      console.error('[WHOOP Callback] Missing code or state parameter');
      return NextResponse.redirect(
        new URL('/profile?error=invalid_callback', request.url)
      );
    }

    // 5. Validate state token (CSRF protection)
    const cookieStore = await cookies();
    const storedState = cookieStore.get('whoop_oauth_state')?.value;
    
    if (!storedState || storedState !== state) {
      console.error('[WHOOP Callback] State mismatch - possible CSRF attack', {
        stored: storedState,
        received: state,
      });
      
      // Clear the state cookie
      cookieStore.delete('whoop_oauth_state');
      
      return NextResponse.redirect(
        new URL('/profile?error=security_validation_failed', request.url)
      );
    }

    // 6. Clear state cookie after validation
    cookieStore.delete('whoop_oauth_state');

    // 7. Build redirect URI (must match the one used in auth request)
    const { origin } = new URL(request.url);
    const redirectUri = `${origin}/api/whoop/callback`;

    // 8. Exchange authorization code for tokens
    let tokens;
    try {
      tokens = await whoopClient.exchangeCodeForTokens(code, redirectUri);
    } catch (exchangeError) {
      console.error('[WHOOP Callback] Token exchange failed:', exchangeError);
      
      const errorMessage = exchangeError instanceof Error 
        ? exchangeError.message 
        : 'Failed to connect WHOOP';
      
      return NextResponse.redirect(
        new URL(`/profile?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }

    // 9. Store encrypted tokens in database
    try {
      await tokenService.storeTokens(user.id, tokens);
      console.log('[WHOOP Callback] Tokens stored successfully for user:', user.id);
    } catch (storageError) {
      console.error('[WHOOP Callback] Token storage failed:', storageError);
      
      return NextResponse.redirect(
        new URL('/profile?error=failed_to_save_connection', request.url)
      );
    }

    // 10. Initialize sync status
    try {
      const { error: syncStatusError } = await supabase
        .from('whoop_sync_status')
        .upsert({
          user_id: user.id,
          status: 'idle',
          last_sync_at: null,
          next_sync_at: null,
          error_message: null,
          records_synced: {},
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (syncStatusError) {
        console.error('[WHOOP Callback] Failed to initialize sync status:', syncStatusError);
        // Non-fatal - continue with success
      }
    } catch (syncStatusError) {
      console.error('[WHOOP Callback] Sync status initialization error:', syncStatusError);
      // Non-fatal - continue with success
    }

    // 11. Trigger initial sync (non-blocking — don't fail OAuth if sync fails)
    try {
      await fullSync(user.id);
      console.log('[WHOOP Callback] Initial sync completed for user:', user.id);
    } catch (syncError) {
      console.error('[WHOOP Callback] Initial sync failed (non-fatal):', syncError);
      // Don't fail the OAuth flow — tokens are stored, user can retry sync later
    }

    // 12. Redirect to settings with success message
    console.log('[WHOOP Callback] OAuth flow completed successfully for user:', user.id);
    return NextResponse.redirect(
      new URL('/profile?whoop_connected=true', request.url)
    );

  } catch (error) {
    console.error('[WHOOP Callback] Unexpected error:', error);
    
    return NextResponse.redirect(
      new URL('/profile?error=unexpected_error', request.url)
    );
  }
}
