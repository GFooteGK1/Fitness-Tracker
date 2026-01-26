// WHOOP Integration Types
// TypeScript interfaces for WHOOP wearable data

// ============================================================================
// OAuth and Token Types
// ============================================================================

export interface WhoopTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export interface WhoopTokensDB {
  id: string;
  userId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenValidationResult {
  valid: boolean;
  needsRefresh: boolean;
  expired: boolean;
}

// ============================================================================
// WHOOP Data Types
// ============================================================================

export interface WhoopRecovery {
  id: string;
  userId: string;
  cycleId: number;
  date: Date;
  recoveryScore: number | null;
  restingHeartRate: number | null;
  hrvRmssdMilli: number | null;
  spo2Percentage: number | null;
  skinTempCelsius: number | null;
  createdAt: Date;
}

export interface WhoopSleep {
  id: string;
  userId: string;
  sleepId: number;
  date: Date;
  sleepPerformancePercentage: number | null;
  sleepConsistencyPercentage: number | null;
  sleepEfficiencyPercentage: number | null;
  respiratoryRate: number | null;
  totalSleepDurationMs: number | null;
  isNap: boolean;
  createdAt: Date;
}

export interface WhoopCycle {
  id: string;
  userId: string;
  cycleId: number;
  date: Date;
  strain: number | null;
  kilojoules: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  createdAt: Date;
}

export interface WhoopWorkout {
  id: string;
  userId: string;
  whoopWorkoutId: number;
  date: Date;
  sportName: string | null;
  sportId: number | null;
  strain: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  distanceMeter: number | null;
  altitudeGainMeter: number | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface WhoopSyncStatus {
  id: string;
  userId: string;
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  status: 'idle' | 'syncing' | 'error';
  errorMessage: string | null;
  recordsSynced: {
    recovery?: number;
    sleep?: number;
    cycles?: number;
    workouts?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// WHOOP API Response Types
// ============================================================================

export interface WhoopRecoveryResponse {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
}

export interface WhoopSleepResponse {
  id: string;
  cycle_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score: {
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

export interface WhoopCycleResponse {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score_state: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

export interface WhoopWorkoutResponse {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  sport_id: number;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
  };
}

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ============================================================================
// Connection and Status Types
// ============================================================================

export interface WhoopConnectionStatus {
  isConnected: boolean;
  connectionHealth: 'healthy' | 'unhealthy' | 'expired' | 'unknown';
  lastSyncAt: Date | null;
  expiresAt: Date | null;
}

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

// ============================================================================
// UI Component Props Types
// ============================================================================

export interface WhoopMetricsCardProps {
  recovery?: WhoopRecovery;
  sleep?: WhoopSleep;
  cycle?: WhoopCycle;
  isLoading: boolean;
  isConnected: boolean;
  onConnect: () => void;
}

export interface WhoopConnectionSettingsProps {
  isConnected: boolean;
  lastSyncAt?: Date;
  connectionHealth: 'healthy' | 'unhealthy' | 'unknown';
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}

// ============================================================================
// Error Types
// ============================================================================

export interface WhoopErrorLog {
  timestamp: Date;
  userId: string;
  operation: 'oauth' | 'sync' | 'token_refresh' | 'data_fetch';
  errorType: string;
  errorMessage: string;
  context: {
    endpoint?: string;
    statusCode?: number;
    retryCount?: number;
    requestId?: string;
  };
}

export type WhoopOAuthError = 
  | 'invalid_grant'
  | 'access_denied'
  | 'invalid_scope'
  | 'server_error'
  | 'state_mismatch';

export type WhoopSyncError =
  | 'rate_limited'
  | 'server_error'
  | 'network_timeout'
  | 'partial_data'
  | 'invalid_response';
