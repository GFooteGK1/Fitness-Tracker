# Error Report: Supabase Environment Variable Configuration

**Date**: 2026-01-04
**Category**: API/Integration
**Severity**: High
**Environment**: Development
**Fitness Domain**: General

## Problem Description
Multiple API endpoints were returning 500 Internal Server Errors due to incorrect Supabase environment variable configuration. APIs were trying to use `SUPABASE_SERVICE_ROLE_KEY` which wasn't defined in the environment.

## Error Details
- **Error Message**: `Unexpected token '<', "<DOCTYPE" is not valid JSON`
- **Root Cause**: APIs returning HTML error pages instead of JSON due to Supabase client initialization failure
- **Affected Components**: 
  - `/api/targets` - Daily nutrition targets
  - `/api/meals/[id]` - Meal updates
  - `/api/adherence/weekly` - Weekly adherence tracking
- **User Impact**: Nutrition logging UI completely non-functional, targets couldn't be saved

## Investigation Process
1. **Observed Symptoms**: Multiple 500 errors in browser console, JSON parsing errors
2. **Server Logs**: Showed Supabase client creation failing at line 11 in targets API
3. **Environment Check**: Found APIs using `SUPABASE_SERVICE_ROLE_KEY` but `.env.local.example` only shows `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Code Review**: Confirmed all API files were using incorrect environment variable

## Root Cause
API files were configured to use `process.env.SUPABASE_SERVICE_ROLE_KEY` but the actual environment variable available was `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. This caused Supabase client initialization to fail, leading to 500 errors.

## Solution
Updated all API files to use the correct environment variable:

**Before:**
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // ❌ Undefined
)
```

**After:**
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // ✅ Correct
)
```

**Files Updated:**
- `app/api/targets/route.ts`
- `app/api/meals/[id]/route.ts` 
- `app/api/adherence/weekly/route.ts`

## Prevention
- Always verify environment variable names match between code and `.env.local.example`
- Add environment variable validation at application startup
- Include environment setup in development documentation
- Use TypeScript environment variable validation

## Testing
- ✅ Targets API now responds correctly
- ✅ Mobile UI can save nutrition targets
- ✅ No more JSON parsing errors
- ✅ All API endpoints functional

## Related Issues
- Mobile-first UI testing now fully functional
- Nutrition logging workflow restored
- Database integration working properly

## Next Steps
1. Add environment variable validation to prevent similar issues
2. Update development setup documentation
3. Consider using a configuration validation library