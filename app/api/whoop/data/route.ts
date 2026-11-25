import { NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import type { WhoopRecovery, WhoopSleep, WhoopCycle, WhoopWorkout } from '@/app/lib/types/whoop';

function isStoredDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function workoutCoverage(status: 'available' | 'unavailable' | 'not_connected') {
  return { status, dateBasis: 'stored_date_label', eventTimePrecision: 'unknown' } as const;
}

/**
 * GET /api/whoop/data
 * 
 * Fetches WHOOP data for the authenticated user.
 * 
 * Query Parameters:
 * - type: 'all' | 'recovery' | 'sleep' | 'cycle' | 'workouts' (default: 'all')
 * - startDate: inclusive stored date label (YYYY-MM-DD for workouts, optional)
 * - endDate: inclusive stored date label (YYYY-MM-DD for workouts, optional)
 * - limit: number (default: 7 for workouts, 1 for others)
 * 
 * Returns:
 * - recovery: Most recent recovery data
 * - sleep: Most recent sleep data
 * - cycle: Most recent cycle data
 * - workouts: Saved workout rows in the requested date-label range (up to limit), or null when unavailable
 * - workoutCoverage: Workout read status, date label basis, and unknown provider occurrence times
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
    const includeWorkouts = type === 'all' || type === 'workouts';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Number(searchParams.get('limit') ?? '7');

    if (includeWorkouts) {
      if ((startDate !== null && !isStoredDate(startDate)) || (endDate !== null && !isStoredDate(endDate))
        || (startDate !== null && endDate !== null && startDate > endDate)) {
        return NextResponse.json(
          { error: 'Use an ordered YYYY-MM-DD range of stored date labels for WHOOP workouts.' },
          { status: 400 }
        );
      }
      if (!Number.isSafeInteger(limit) || limit < 1) {
        return NextResponse.json({ error: 'The WHOOP workout limit must be a positive integer.' }, { status: 400 });
      }
    }

    // 3. Check if WHOOP is connected (tokens exist)
    const { data: tokens, error: connectionReadError } = await supabase
      .from('whoop_tokens')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connectionReadError) {
      return NextResponse.json({
        error: 'Could not verify the WHOOP connection.',
        ...(includeWorkouts ? { workouts: null, workoutCoverage: workoutCoverage('unavailable') } : {}),
      }, { status: 503 });
    }

    // If no tokens, user hasn't connected WHOOP
    if (!tokens) {
      return NextResponse.json({
        connectionStatus: 'disconnected',
        lastSyncAt: null,
        staleness: false,
        recovery: null,
        sleep: null,
        cycle: null,
        ...(includeWorkouts ? { workouts: null, workoutCoverage: workoutCoverage('not_connected') } : {}),
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
      workouts?: WhoopWorkout[] | null;
      workoutCoverage?: ReturnType<typeof workoutCoverage>;
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
    if (includeWorkouts) {
      const query = supabase
        .from('whoop_workouts')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .limit(limit);

      if (startDate) query.gte('date', startDate);
      if (endDate) query.lte('date', endDate);

      const { data: workouts, error } = await query;
      const available = !error && Array.isArray(workouts);
      response.workouts = available ? workouts : null;
      response.workoutCoverage = workoutCoverage(available ? 'available' : 'unavailable');
      if (!available && type === 'workouts') {
        return NextResponse.json({ ...response, error: 'WHOOP workouts are unavailable.' }, { status: 503 });
      }
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
