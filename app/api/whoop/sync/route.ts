import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import * as syncService from '@/app/lib/whoop/sync-service';

/**
 * WHOOP Sync API Route
 *
 * Triggers manual or scheduled syncs of WHOOP data.
 *
 * POST /api/whoop/sync
 * - fullSync: boolean (optional) - If true, fetch 7 days; otherwise incremental
 *
 * Requirements: 3.1, 3.2
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[WHOOP Sync] Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let fullSync = false;
    try {
      const body = await request.json();
      fullSync = body.fullSync === true;
    } catch (parseError) {
      // Body is optional, default to incremental sync
      fullSync = false;
    }

    console.log(`[WHOOP Sync] Starting ${fullSync ? 'full' : 'incremental'} sync for user:`, user.id);

    // 3. Trigger sync
    const result = fullSync
      ? await syncService.fullSync(user.id)
      : await syncService.incrementalSync(user.id);

    // 4. Return result
    if (result.success) {
      console.log('[WHOOP Sync] Sync completed successfully:', result.recordsSynced);

      return NextResponse.json({
        success: true,
        message: 'WHOOP data synced successfully',
        recordsSynced: result.recordsSynced,
      });
    } else {
      console.error('[WHOOP Sync] Sync failed:', result.errors);

      return NextResponse.json({
        success: false,
        message: 'WHOOP sync failed',
        errors: result.errors,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[WHOOP Sync] Unexpected error:', error);

    return NextResponse.json({
      success: false,
      error: 'Unexpected error during sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/whoop/sync
 *
 * Get current sync status for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[WHOOP Sync] Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get sync status
    const syncStatus = await syncService.getSyncStatus(user.id);

    // 3. Return status
    return NextResponse.json({
      status: syncStatus.status,
      lastSyncAt: syncStatus.lastSyncAt,
      nextSyncAt: syncStatus.nextSyncAt,
      errorMessage: syncStatus.errorMessage,
      recordsSynced: syncStatus.recordsSynced,
    });

  } catch (error) {
    console.error('[WHOOP Sync] Error getting sync status:', error);

    return NextResponse.json({
      error: 'Failed to get sync status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
