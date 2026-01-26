-- WHOOP V2 API Migration
-- Updates ID columns from BIGINT to TEXT to support WHOOP v2 API UUIDs
-- WHOOP migrated from v1 (integer IDs) to v2 (UUID IDs)
-- Run this migration in your Supabase SQL editor

-- ============================================================================
-- Update whoop_recovery table
-- ============================================================================
ALTER TABLE whoop_recovery 
  ALTER COLUMN cycle_id TYPE TEXT USING cycle_id::TEXT;

-- ============================================================================
-- Update whoop_sleep table
-- ============================================================================
ALTER TABLE whoop_sleep 
  ALTER COLUMN sleep_id TYPE TEXT USING sleep_id::TEXT;

-- ============================================================================
-- Update whoop_cycles table
-- ============================================================================
ALTER TABLE whoop_cycles 
  ALTER COLUMN cycle_id TYPE TEXT USING cycle_id::TEXT;

-- Update kilojoules to DECIMAL to support fractional values from v2 API
ALTER TABLE whoop_cycles 
  ALTER COLUMN kilojoules TYPE DECIMAL(10,2) USING kilojoules::DECIMAL;

-- ============================================================================
-- Update whoop_workouts table
-- ============================================================================
ALTER TABLE whoop_workouts 
  ALTER COLUMN whoop_workout_id TYPE TEXT USING whoop_workout_id::TEXT;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration updates all WHOOP ID columns to support v2 API UUIDs
-- The v1 API is deprecated and no longer supported by WHOOP
