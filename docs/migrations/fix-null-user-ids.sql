-- Fix NULL user_id values in workouts table
-- Updates all workouts with NULL user_id to the specified user
-- Run this in Supabase SQL Editor

-- Update workouts table
UPDATE workouts
SET user_id = 'ac73492c-263a-46dd-a07a-8f34a80d0c0c'
WHERE user_id IS NULL;

-- Verify the update
SELECT COUNT(*) as updated_count
FROM workouts
WHERE user_id = 'ac73492c-263a-46dd-a07a-8f34a80d0c0c';

-- Check for any remaining NULL values
SELECT COUNT(*) as remaining_nulls
FROM workouts
WHERE user_id IS NULL;
