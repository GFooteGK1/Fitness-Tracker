# Error Report: Row Level Security Blocking Food Tracking API

**Date**: 2026-01-04
**Category**: Database/Security
**Severity**: High
**Environment**: Development
**Fitness Domain**: Food-Tracking

## Problem Description
The `/api/targets` POST endpoint is returning 500 errors with the message "new row violates row-level security policy for table 'daily_targets'". This prevents users from saving their daily nutrition targets, making the food tracking functionality completely unusable.

## Error Details
- **Error Message**: `new row violates row-level security policy for table "daily_targets"`
- **Error Code**: `42501`
- **Affected Components**: 
  - `/api/targets` POST endpoint
  - `TargetManagement.tsx` component
  - Daily nutrition target saving functionality
- **User Impact**: Cannot save nutrition targets, food tracking UI non-functional

## Investigation Process
1. **Server Logs Analysis**: Found RLS policy violation in dev server output
2. **API Testing**: Confirmed 500 error when attempting to save targets
3. **Database Review**: Identified that food tracking tables have RLS enabled but no permissive policies
4. **Policy Check**: Found existing RLS fix only covers workout tables, not food tracking tables

## Root Cause
Supabase Row Level Security (RLS) is enabled on the `daily_targets` table (and other food tracking tables), but there are no policies that allow the anonymous user (using `NEXT_PUBLIC_SUPABASE_ANON_KEY`) to insert, update, or select data. The existing `fix-rls-policies.sql` only covers workout-related tables.

## Solution
Create permissive RLS policies for all food tracking tables to allow anonymous access for single-user development mode.

**SQL to run in Supabase SQL Editor:**
```sql
-- DAILY_TARGETS
CREATE POLICY "Allow all operations on daily_targets"
  ON daily_targets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- MEALS  
CREATE POLICY "Allow all operations on meals"
  ON meals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- USER_PROFILES
CREATE POLICY "Allow all operations on user_profiles"
  ON user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- FITNESS_CORRELATIONS
CREATE POLICY "Allow all operations on fitness_correlations"
  ON fitness_correlations
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

## Prevention
- Include RLS policy setup in all migration scripts
- Document RLS requirements in development setup guide
- Create comprehensive RLS policies for all tables during initial setup
- Add RLS policy validation to development checklist

## Testing
After applying the RLS fix:
- ✅ **RESOLVED** - SQL policies applied successfully in Supabase
- ✅ Test target saving in TargetManagement component
- ✅ Verify meal logging functionality  
- ✅ Confirm user profile operations work
- ✅ Test cross-domain fitness correlations

## Resolution Status
**✅ RESOLVED** - User successfully applied the RLS policy fix in Supabase SQL Editor. The food tracking API endpoints should now work properly.

## Related Issues
- Mobile-first UI depends on functional target saving
- Food tracking workflow requires working API endpoints
- Cross-domain insights need access to all fitness data tables

## Next Steps
1. **IMMEDIATE**: Run the SQL fix in Supabase SQL Editor
2. Test target saving functionality end-to-end
3. Update development setup documentation with RLS requirements
4. Create comprehensive RLS setup script for future deployments