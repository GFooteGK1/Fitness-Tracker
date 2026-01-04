# Error Report: Foreign Key Constraint Violation - Test User Setup

**Date**: 2026-01-04
**Category**: Database/Integration
**Severity**: Medium
**Environment**: Development
**Fitness Domain**: General

## Problem Description
When attempting to insert test user data for development testing, encountered a foreign key constraint violation. The `user_profiles` table references `auth.users(id)`, but the test UUID doesn't exist in the auth system.

## Error Details
- **Error Message**: `insert or update on table "user_profiles" violates foreign key constraint "user_profiles_user_id_fkey"`
- **Detail**: `Key (user_id)=(550e8400-e29b-41d4-a716-446655440000) is not present in table "users"`
- **Affected Components**: Test data setup, user_profiles table, daily_targets table
- **User Impact**: Cannot test nutrition logging UI with proper user data

## Investigation Process
1. **Initial Issue**: UUID format error with "test-user-id" string
2. **First Fix**: Changed to valid UUID format `550e8400-e29b-41d4-a716-446655440000`
3. **Second Issue**: Column mismatch - tried to insert into non-existent columns (age, weight_kg, etc.)
4. **Second Fix**: Updated SQL to match actual table schema using JSONB fields
5. **Third Issue**: Imperial units preference needed
6. **Third Fix**: Changed units to "imperial" and body metrics to imperial format
7. **Current Issue**: Foreign key constraint - UUID doesn't exist in auth.users table

## Root Cause
The `user_profiles` table has a foreign key constraint referencing `auth.users(id)`. In a Supabase setup, users must exist in the auth system before profile data can be inserted. Our test UUID doesn't exist in the auth.users table.

## Solution
Create a test user entry in the auth.users table first, then insert profile data. This respects the foreign key constraint while enabling proper testing.

**Implemented Solution:**
```sql
-- Step 1: Insert into auth.users table first
INSERT INTO auth.users (id, aud, role, email, ...) VALUES (...);

-- Step 2: Insert into user_profiles table (foreign key satisfied)
INSERT INTO user_profiles (user_id, ...) VALUES (...);

-- Step 3: Insert into daily_targets table
INSERT INTO daily_targets (user_id, ...) VALUES (...);
```

**Result**: ✅ **RESOLVED** - Test user creation successful, nutrition logging UI now has proper test data with imperial units.

## Prevention
- Always check foreign key relationships when creating test data
- Consider auth system requirements in development setup
- Document test user creation process for future developers
- Create helper scripts that handle auth user creation properly

## Related Issues
- Mobile-first UI testing requires valid user data
- Development workflow needs streamlined test user setup
- Auth integration not fully configured for development

## Next Steps
1. Implement proper test user creation that respects auth constraints
2. Document the complete test user setup process
3. Consider creating development-specific auth bypass for testing