import { NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import type { WhoopRecovery, WhoopSleep, WhoopCycle, WhoopWorkout } from '@/app/lib/types/whoop';

/**
 * GET /api/whoop/data
 * 
 * Fetches WHOOP data for the authenticated user.
 * 
 * Query Parameters:
 * - type: 'all' | 'recovery' | 'sleep' | 'cycle' | 'workouts' (default: 'all')
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - limit: number (default: 7 for workouts, 1 for others)
 * 
 * Returns:
 * - recovery: Most recent recovery data
 * - sleep: Most recent sleep data
 * - cycle: Most recent cycle data
 * - workouts: Recent workouts (up to limit)
 * - connectionStatus: 'connected' | 'disconnected' | 'unhealthy'
 * - lastSyncAt: ISO timestamp of last successful sync
 * - staleness: boolean indicating if data is >24 hours old
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse query parameters
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '7', 10);

    // 3. Check if WHOOP is connected (tokens exist)
    const { data: tokens } = await supabase
      .from('whoop_tokens')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // If no tokens, user hasn't connected WHOOP
    if (!tokens) {
      return NextResponse.json({
        connectionStatus: 'disconnected',
        lastSyncAt: null,
        staleness: false,
        recovery: null,
        sleep: null,
        cycle: null,
        workouts: []
      });
    }

    // 4. Check sync status
    const { data: syncStatus } = await supabase
      .from('whoop_sync_status')
      .select('status, last_sync_at, error_message')
      .eq('user_id', user.id)
      .single();

    const connectionStatus = syncStatus?.status === 'error'
      ? 'unhealthy'
      : 'connected';

    // 5. Calculate staleness (data >24 hours old)
    const lastSyncAt = syncStatus?.last_sync_at;
    const staleness = lastSyncAt
      ? Date.now() - new Date(lastSyncAt).getTime() > 24 * 60 * 60 * 1000
      : true;

    // 6. Fetch requested data
    const response: {
      recovery?: WhoopRecovery | null;
      sleep?: WhoopSleep | null;
      cycle?: WhoopCycle | null;
      workouts?: WhoopWorkout[];
      connectionStatus: string;
      lastSyncAt: string | null;
      staleness: boolean;
    } = {
      connectionStatus,
      lastSyncAt,
      staleness
    };

    // Fetch recovery data
    if (type === 'all' || type === 'recovery') {
      const query = supabase
        .from('whoop_recovery')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1);

      if (startDate) query.gte('date', startDate);
      if (endDate) query.lte('date', endDate);

      const { data: recovery } = await query.single();
      response.recovery = recovery || null;
    }

    // Fetch sleep data
    if (type === 'all' || type === 'sleep') {
      const query = supabase
        .from('whoop_sleep')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1);

      if (startDate) query.gte('date', startDate);
      if (endDate) query.lte('date', endDate);

      const { data: sleep } = await query.single();
      response.sleep = sleep || null;
    }

    // Fetch cycle data
    if (type === 'all' || type === 'cycle') {
      const query = supabase
        .from('whoop_cycles')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1);

      if (startDate) query.gte('date', startDate);
      if (endDate) query.lte('date', endDate);

      const { data: cycle } = await query.single();
      response.cycle = cycle || null;
    }

    // Fetch workouts data
    if (type === 'all' || type === 'workouts') {
      const query = supabase
        .from('whoop_workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false })
        .limit(limit);

      if (startDate) query.gte('start_time', startDate);
      if (endDate) query.lte('start_time', endDate);

      const { data: workouts } = await query;
      response.workouts = workouts || [];
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching WHOOP data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch WHOOP data' },
      { status: 500 }
    );
  }
}
