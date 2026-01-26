import { createServerClient } from '@/app/lib/auth/supabase-server';
import * as whoopClient from './api-client';
import * as tokenService from './token-service';
import type {
  WhoopRecovery,
  WhoopSleep,
  WhoopCycle,
  WhoopWorkout,
  WhoopSyncStatus,
} from '@/app/lib/types/whoop';

/**
 * WHOOP Sync Service
 * 
 * Handles fetching and storing WHOOP data from the API.
 * Supports both full sync (7 days history) and incremental sync (since last sync).
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 8.1
 */

export interface SyncResult {
  success: boolean;
  recordsSynced: {
    recovery: number;
    sleep: number;
    cycles: number;
    workouts: number;
  };
  errors?: string[];
}

export interface SyncOptions {
  fullSync?: boolean; // If true, fetch 7 days; otherwise incremental
  retryCount?: number; // Current retry attempt (for internal use)
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds

/**
 * Perform full sync - fetch last 7 days of WHOOP data
 */
export async function fullSync(userId: string): Promise<SyncResult> {
  console.log('[WHOOP Sync] Starting full sync for user:', userId);
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  return await syncDateRange(userId, startDate, endDate);
}

/**
 * Perform incremental sync - fetch data since last sync
 */
export async function incrementalSync(userId: string): Promise<SyncResult> {
  console.log('[WHOOP Sync] Starting incremental sync for user:', userId);
  
  const syncStatus = await getSyncStatus(userId);
  
  if (!syncStatus.lastSyncAt) {
    console.log('[WHOOP Sync] No previous sync found, performing full sync');
    return await fullSync(userId);
  }
  
  const startDate = new Date(syncStatus.lastSyncAt);
  const endDate = new Date();
  
  return await syncDateRange(userId, startDate, endDate);
}

/**
 * Sync WHOOP data for a specific date range
 */
async function syncDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const retryCount = options.retryCount || 0;
  
  try {
    // Update sync status to 'syncing'
    await updateSyncStatus(userId, {
      status: 'syncing',
      errorMessage: null,
    });
    
    // Get valid access token (auto-refreshes if needed)
    const accessToken = await tokenService.getValidAccessToken(userId);
    
    if (!accessToken) {
      throw new Error('No valid WHOOP access token found');
    }
    
    // Fetch data from WHOOP API in parallel
    const [recoveryData, sleepData, cycleData, workoutData] = await Promise.all([
      whoopClient.getRecovery(accessToken, startDate, endDate),
      whoopClient.getSleep(accessToken, startDate, endDate),
      whoopClient.getCycles(accessToken, startDate, endDate),
      whoopClient.getWorkouts(accessToken, startDate, endDate),
    ]);
    
    // Transform and store data
    const recordsSynced = {
      recovery: 0,
      sleep: 0,
      cycles: 0,
      workouts: 0,
    };
    
    // Store recovery data
    if (recoveryData.length > 0) {
      recordsSynced.recovery = await storeRecoveryData(userId, recoveryData);
    }
    
    // Store sleep data
    if (sleepData.length > 0) {
      recordsSynced.sleep = await storeSleepData(userId, sleepData);
    }
    
    // Store cycle data
    if (cycleData.length > 0) {
      recordsSynced.cycles = await storeCycleData(userId, cycleData);
    }
    
    // Store workout data
    if (workoutData.length > 0) {
      recordsSynced.workouts = await storeWorkoutData(userId, workoutData);
    }
    
    // Update sync status to 'idle' with success
    await updateSyncStatus(userId, {
      status: 'idle',
      lastSyncAt: new Date(),
      nextSyncAt: calculateNextSyncTime(),
      errorMessage: null,
      recordsSynced,
    });
    
    console.log('[WHOOP Sync] Sync completed successfully:', recordsSynced);
    
    return {
      success: true,
      recordsSynced,
    };
    
  } catch (error) {
    console.error('[WHOOP Sync] Sync failed:', error);
    
    // Check if we should retry
    if (retryCount < MAX_RETRIES && isRetryableError(error)) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`[WHOOP Sync] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      await sleep(delay);
      
      return await syncDateRange(userId, startDate, endDate, {
        ...options,
        retryCount: retryCount + 1,
      });
    }
    
    // Max retries reached or non-retryable error
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    
    await updateSyncStatus(userId, {
      status: 'error',
      errorMessage,
    });
    
    return {
      success: false,
      recordsSynced: {
        recovery: 0,
        sleep: 0,
        cycles: 0,
        workouts: 0,
      },
      errors: [errorMessage],
    };
  }
}

/**
 * Transform and store recovery data
 */
async function storeRecoveryData(
  userId: string,
  recoveryData: any[]
): Promise<number> {
  const supabase = await createServerClient();
  
  const records = recoveryData.map(item => transformRecoveryData(userId, item));
  
  const { error } = await supabase
    .from('whoop_recovery')
    .upsert(records, {
      onConflict: 'user_id,cycle_id',
    });
  
  if (error) {
    console.error('[WHOOP Sync] Failed to store recovery data:', error);
    throw error;
  }
  
  return records.length;
}

/**
 * Transform WHOOP API recovery response to database format
 */
function transformRecoveryData(userId: string, apiData: any): Partial<WhoopRecovery> {
  return {
    user_id: userId,
    cycle_id: apiData.cycle_id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    recovery_score: apiData.score?.recovery_score ?? null,
    resting_heart_rate: apiData.score?.resting_heart_rate ?? null,
    hrv_rmssd_milli: apiData.score?.hrv_rmssd_milli ?? null,
    spo2_percentage: apiData.score?.spo2_percentage ?? null,
    skin_temp_celsius: apiData.score?.skin_temp_celsius ?? null,
  };
}

/**
 * Transform and store sleep data
 */
async function storeSleepData(
  userId: string,
  sleepData: any[]
): Promise<number> {
  const supabase = await createServerClient();
  
  const records = sleepData.map(item => transformSleepData(userId, item));
  
  const { error } = await supabase
    .from('whoop_sleep')
    .upsert(records, {
      onConflict: 'user_id,sleep_id',
    });
  
  if (error) {
    console.error('[WHOOP Sync] Failed to store sleep data:', error);
    throw error;
  }
  
  return records.length;
}

/**
 * Transform WHOOP API sleep response to database format
 */
function transformSleepData(userId: string, apiData: any): Partial<WhoopSleep> {
  return {
    user_id: userId,
    sleep_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    sleep_performance_percentage: apiData.score?.sleep_performance_percentage ?? null,
    sleep_consistency_percentage: apiData.score?.sleep_consistency_percentage ?? null,
    sleep_efficiency_percentage: apiData.score?.sleep_efficiency_percentage ?? null,
    respiratory_rate: apiData.score?.respiratory_rate ?? null,
    total_sleep_duration_ms: apiData.score?.stage_summary?.total_in_bed_time_milli ?? null,
    is_nap: apiData.nap ?? false,
  };
}

/**
 * Transform and store cycle data
 */
async function storeCycleData(
  userId: string,
  cycleData: any[]
): Promise<number> {
  const supabase = await createServerClient();
  
  const records = cycleData.map(item => transformCycleData(userId, item));
  
  const { error } = await supabase
    .from('whoop_cycles')
    .upsert(records, {
      onConflict: 'user_id,cycle_id',
    });
  
  if (error) {
    console.error('[WHOOP Sync] Failed to store cycle data:', error);
    throw error;
  }
  
  return records.length;
}

/**
 * Transform WHOOP API cycle response to database format
 */
function transformCycleData(userId: string, apiData: any): Partial<WhoopCycle> {
  return {
    user_id: userId,
    cycle_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    strain: apiData.score?.strain ?? null,
    kilojoules: apiData.score?.kilojoule ?? null,
    average_heart_rate: apiData.score?.average_heart_rate ?? null,
    max_heart_rate: apiData.score?.max_heart_rate ?? null,
  };
}

/**
 * Transform and store workout data
 */
async function storeWorkoutData(
  userId: string,
  workoutData: any[]
): Promise<number> {
  const supabase = await createServerClient();
  
  const records = workoutData.map(item => transformWorkoutData(userId, item));
  
  const { error } = await supabase
    .from('whoop_workouts')
    .upsert(records, {
      onConflict: 'user_id,whoop_workout_id',
    });
  
  if (error) {
    console.error('[WHOOP Sync] Failed to store workout data:', error);
    throw error;
  }
  
  return records.length;
}

/**
 * Transform WHOOP API workout response to database format
 */
function transformWorkoutData(userId: string, apiData: any): Partial<WhoopWorkout> {
  return {
    user_id: userId,
    whoop_workout_id: apiData.id,
    date: apiData.created_at ? new Date(apiData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    sport_name: apiData.sport_name ?? null,
    sport_id: apiData.sport_id ?? null,
    strain: apiData.score?.strain ?? null,
    average_heart_rate: apiData.score?.average_heart_rate ?? null,
    max_heart_rate: apiData.score?.max_heart_rate ?? null,
    distance_meter: apiData.score?.distance_meter ?? null,
    altitude_gain_meter: apiData.score?.altitude_gain_meter ?? null,
    duration_ms: apiData.score?.duration_milli ?? null,
  };
}

/**
 * Get sync status for a user
 */
export async function getSyncStatus(userId: string): Promise<WhoopSyncStatus> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('whoop_sync_status')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    // Return default status if not found
    return {
      id: '',
      user_id: userId,
      last_sync_at: null,
      next_sync_at: null,
      status: 'idle',
      error_message: null,
      records_synced: {},
      created_at: new Date(),
      updated_at: new Date(),
    };
  }
  
  return {
    id: data.id,
    user_id: data.user_id,
    last_sync_at: data.last_sync_at ? new Date(data.last_sync_at) : null,
    next_sync_at: data.next_sync_at ? new Date(data.next_sync_at) : null,
    status: data.status,
    error_message: data.error_message,
    records_synced: data.records_synced || {},
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
  };
}

/**
 * Update sync status
 */
async function updateSyncStatus(
  userId: string,
  updates: Partial<{
    status: 'idle' | 'syncing' | 'error';
    lastSyncAt: Date;
    nextSyncAt: Date;
    errorMessage: string | null;
    recordsSynced: Record<string, number>;
  }>
): Promise<void> {
  const supabase = await createServerClient();
  
  const updateData: any = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  
  if (updates.lastSyncAt !== undefined) {
    updateData.last_sync_at = updates.lastSyncAt.toISOString();
  }
  
  if (updates.nextSyncAt !== undefined) {
    updateData.next_sync_at = updates.nextSyncAt.toISOString();
  }
  
  if (updates.errorMessage !== undefined) {
    updateData.error_message = updates.errorMessage;
  }
  
  if (updates.recordsSynced !== undefined) {
    updateData.records_synced = updates.recordsSynced;
  }
  
  const { error } = await supabase
    .from('whoop_sync_status')
    .upsert(updateData, {
      onConflict: 'user_id',
    });
  
  if (error) {
    console.error('[WHOOP Sync] Failed to update sync status:', error);
    throw error;
  }
}

/**
 * Calculate next sync time (4 hours from now)
 */
function calculateNextSyncTime(): Date {
  const nextSync = new Date();
  nextSync.setHours(nextSync.getHours() + 4);
  return nextSync;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on rate limit, timeout, or server errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500')
    );
  }
  return false;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
