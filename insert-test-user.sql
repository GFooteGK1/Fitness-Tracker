-- Insert test user data for development
-- This creates a test user in auth system first, then profile data

-- Step 1: Insert test user into auth.users table (Supabase auth system)
-- Note: In production, this would be handled by Supabase Auth API
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'authenticated',
  'authenticated',
  'testuser@example.com',
  '$2a$10$dummy.hash.for.testing.purposes.only',
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Test User"}',
  false,
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert test user profile (this would normally be created by auth system)
INSERT INTO user_profiles (user_id, fitness_goals, activity_level, body_metrics, preferences, medical_conditions, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  '["muscle_gain", "performance"]'::jsonb,
  'very_active',
  '{"height_inches": 69, "weight_lbs": 166, "body_fat_pct": 12}'::jsonb,
  '{"units": "imperial", "notifications": true, "privacy_level": "private"}'::jsonb,
  '["high_protein"]'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- Step 3: Insert test daily targets
INSERT INTO daily_targets (user_id, target_protein, target_carbs, target_fat, target_calories, tolerance_pct, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  150.0,
  200.0,
  80.0,
  2000.0,
  5.0,
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  target_protein = EXCLUDED.target_protein,
  target_carbs = EXCLUDED.target_carbs,
  target_fat = EXCLUDED.target_fat,
  target_calories = EXCLUDED.target_calories,
  tolerance_pct = EXCLUDED.tolerance_pct,
  updated_at = NOW();