-- WHOOP Integration Migration
-- Creates tables for storing WHOOP wearable data including tokens, recovery, sleep, cycles, and workouts
-- Run this migration in your Supabase SQL editor

-- ============================================================================
-- WHOOP Tokens Table
-- Stores encrypted OAuth tokens for WHOOP API access
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own tokens
CREATE POLICY "Users can only access their own tokens"
  ON whoop_tokens FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_tokens_user_id ON whoop_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_whoop_tokens_expires_at ON whoop_tokens(expires_at);

-- ============================================================================
-- WHOOP Recovery Table
-- Stores daily recovery metrics including HRV, resting heart rate, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL,
  date DATE NOT NULL,
  recovery_score INTEGER,
  resting_heart_rate INTEGER,
  hrv_rmssd_milli DECIMAL(10,2),
  spo2_percentage DECIMAL(5,2),
  skin_temp_celsius DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cycle_id)
);

-- Enable RLS
ALTER TABLE whoop_recovery ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own recovery data
CREATE POLICY "Users can only access their own recovery data"
  ON whoop_recovery FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_recovery_user_date ON whoop_recovery(user_id, date DESC);

-- ============================================================================
-- WHOOP Sleep Table
-- Stores sleep performance and quality metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_sleep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sleep_id BIGINT NOT NULL,
  date DATE NOT NULL,
  sleep_performance_percentage INTEGER,
  sleep_consistency_percentage INTEGER,
  sleep_efficiency_percentage DECIMAL(5,2),
  respiratory_rate DECIMAL(5,2),
  total_sleep_duration_ms BIGINT,
  is_nap BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sleep_id)
);

-- Enable RLS
ALTER TABLE whoop_sleep ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own sleep data
CREATE POLICY "Users can only access their own sleep data"
  ON whoop_sleep FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_sleep_user_date ON whoop_sleep(user_id, date DESC);

-- ============================================================================
-- WHOOP Cycles Table
-- Stores daily strain and cardiovascular load metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL,
  date DATE NOT NULL,
  strain DECIMAL(5,2),
  kilojoules INTEGER,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cycle_id)
);

-- Enable RLS
ALTER TABLE whoop_cycles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own cycle data
CREATE POLICY "Users can only access their own cycle data"
  ON whoop_cycles FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_cycles_user_date ON whoop_cycles(user_id, date DESC);

-- ============================================================================
-- WHOOP Workouts Table
-- Stores individual workout sessions with heart rate and performance data
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id BIGINT NOT NULL,
  date DATE NOT NULL,
  sport_name TEXT,
  sport_id INTEGER,
  strain DECIMAL(5,2),
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  distance_meter DECIMAL(10,2),
  altitude_gain_meter DECIMAL(10,2),
  duration_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, whoop_workout_id)
);

-- Enable RLS
ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own workout data
CREATE POLICY "Users can only access their own workout data"
  ON whoop_workouts FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user_date ON whoop_workouts(user_id, date DESC);

-- ============================================================================
-- WHOOP Sync Status Table
-- Tracks synchronization status and history for each user
-- ============================================================================
CREATE TABLE IF NOT EXISTS whoop_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  status TEXT DEFAULT 'idle',
  error_message TEXT,
  records_synced JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE whoop_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own sync status
CREATE POLICY "Users can only access their own sync status"
  ON whoop_sync_status FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whoop_sync_status_user_id ON whoop_sync_status(user_id);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next steps:
-- 1. Run this migration in your Supabase SQL editor
-- 2. Verify all tables were created successfully
-- 3. Add WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_API_HOSTNAME to environment variables
-- 4. Generate and add WHOOP_ENCRYPTION_KEY (32-byte hex string) to environment variables
