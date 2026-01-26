import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import * as tokenService from '@/app/lib/whoop/token-service';

/**
 * Disconnect WHOOP Route
 * 
 * Removes WHOOP connection by deleting tokens and clearing sync status.
 * Historical WHOOP data is retained in the database.
 * 
 * Flow:
 * 1. Authenticate user
 * 2. Delete tokens from database
 * 3. Clear sync status
 * 4. Return success response
 * 
 * Requirements: 1.5
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[WHOOP Disconnect] Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Delete tokens from database
    try {
      await tokenService.deleteTokens(user.id);
      console.log('[WHOOP Disconnect] Tokens deleted for user:', user.id);
    } catch (deleteError) {
      console.error('[WHOOP Disconnect] Failed to delete tokens:', deleteError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to disconnect WHOOP',
          message: 'An error occurred while removing your WHOOP connection. Please try again.',
        },
        { status: 500 }
      );
    }

    // 3. Clear sync status (set to idle with null timestamps)
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
        console.error('[WHOOP Disconnect] Failed to clear sync status:', syncStatusError);
        // Non-fatal - tokens are already deleted
      }
    } catch (syncStatusError) {
      console.error('[WHOOP Disconnect] Sync status clear error:', syncStatusError);
      // Non-fatal - tokens are already deleted
    }

    // 4. Return success response
    console.log('[WHOOP Disconnect] Successfully disconnected WHOOP for user:', user.id);
    return NextResponse.json({
      success: true,
      message: 'WHOOP disconnected successfully. Your historical data has been retained.',
    });

  } catch (error) {
    console.error('[WHOOP Disconnect] Unexpected error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Unexpected error',
        message: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}
