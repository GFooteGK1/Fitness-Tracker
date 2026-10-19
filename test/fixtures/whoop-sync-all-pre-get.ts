import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/app/lib/auth/supabase-server';
import * as syncService from '@/app/lib/whoop/sync-service';

/**
 * WHOOP Sync All Users Route
 *
 * Triggered by Vercel Cron (see vercel.json — daily at 10:30 UTC ≈ 05:30
 * America/Chicago). Syncs WHOOP data for all connected users.
 *
 * POST /api/whoop/sync-all
 *
 * Security & data access:
 * - Authenticated via CRON_SECRET (Vercel Cron sends it as a Bearer token).
 * - Uses a service-role Supabase client because a cron has no user session;
 *   the cookie-scoped client would see zero rows under RLS and sync nobody.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // In production, verify the cron secret
    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret) {
        console.error('[WHOOP Sync All] CRON_SECRET not configured');
        return NextResponse.json(
          { error: 'Cron secret not configured' },
          { status: 500 }
        );
      }

      if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('[WHOOP Sync All] Unauthorized cron request');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    console.log('[WHOOP Sync All] Starting scheduled sync for all users');

    // 2. Get all users with WHOOP connected.
    // Service-role client: no user session on a cron, so RLS must be bypassed
    // to see every user's token row (and to write their synced data below).
    const supabase = createServiceRoleClient();

    const { data: tokens, error: tokensError } = await supabase
      .from('whoop_tokens')
      .select('user_id');

    if (tokensError) {
      console.error('[WHOOP Sync All] Failed to fetch connected users:', tokensError);
      return NextResponse.json(
        { error: 'Failed to fetch connected users' },
        { status: 500 }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log('[WHOOP Sync All] No users with WHOOP connected');
      return NextResponse.json({
        success: true,
        message: 'No users to sync',
        usersSynced: 0,
      });
    }

    console.log(`[WHOOP Sync All] Found ${tokens.length} users with WHOOP connected`);

    // 3. Sync each user (incremental sync)
    const results = {
      total: tokens.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const { user_id } of tokens) {
      try {
        console.log(`[WHOOP Sync All] Syncing user: ${user_id}`);
        
        const result = await syncService.incrementalSync(user_id, supabase);
        
        if (result.success) {
          results.successful++;
          console.log(`[WHOOP Sync All] User ${user_id} synced successfully:`, result.recordsSynced);
        } else {
          results.failed++;
          const errorMsg = `User ${user_id}: ${result.errors?.join(', ') || 'Unknown error'}`;
          results.errors.push(errorMsg);
          console.error(`[WHOOP Sync All] User ${user_id} sync failed:`, result.errors);
        }
      } catch (error) {
        results.failed++;
        const errorMsg = `User ${user_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMsg);
        console.error(`[WHOOP Sync All] User ${user_id} sync error:`, error);
      }
    }

    console.log('[WHOOP Sync All] Sync completed:', results);

    // 4. Return summary
    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });

  } catch (error) {
    console.error('[WHOOP Sync All] Unexpected error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Also support GET for manual testing (only in development)
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'GET method not allowed in production' },
      { status: 405 }
    );
  }

  // In development, allow GET for testing
  return POST(request);
}
