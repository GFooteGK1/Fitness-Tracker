# Root Cause Analysis: Storage Upload RLS Failure

## Issue Summary
Photo uploads were failing with "new row violates row-level security policy" error despite having correct RLS policies configured in Supabase.

---

## Root Cause

**The `app/lib/storage.ts` file was creating a Supabase client using only the anon key, without user authentication context.**

```typescript
// ❌ INCORRECT - No user authentication
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

This meant that when storage functions were called, they were executing as an anonymous user, not as the authenticated user. The RLS policies check `auth.uid()` to verify the user owns the folder they're uploading to, but without authentication context, `auth.uid()` returns null, causing the policy check to fail.

---

## Why This Happened

1. **Separation of concerns gone wrong**: The storage utility was designed as a standalone module, but storage operations require user authentication
2. **Pattern inconsistency**: Other parts of the app correctly use `createServerClient()` which includes authentication
3. **Testing gap**: The storage functionality wasn't tested with actual RLS policies enabled

---

## The Fix

Changed storage functions to accept an authenticated Supabase client as a parameter:

```typescript
// ✅ CORRECT - Uses authenticated client
export async function uploadMealPhoto(
  supabase: SupabaseClient,  // ← Pass authenticated client
  file: Buffer,
  fileName: string,
  contentType: string,
  userId: string
): Promise<{ success: boolean; filePath?: string; error?: string }>
```

The API route now passes its authenticated client:
```typescript
const supabase = await createServerClient()  // Has user session
const result = await uploadMealPhoto(supabase, fileBuffer, fileName, file.type, user.id)
```

---

## Audit Results: Other Potential Issues

### ✅ No Other Active Issues Found

**Checked:**
1. ✅ All API routes use `createServerClient()` correctly
2. ✅ Client components use `createClientComponentClient()` correctly  
3. ✅ No other utility files create unauthenticated clients

**Found (but not used):**
- `app/lib/meal-storage.ts` - Has same pattern but is **dead code** (not imported anywhere)

---

## Prevention Measures

### 1. Code Pattern Rules

**Server-side (API routes):**
```typescript
// ✅ ALWAYS use this in API routes
import { createServerClient } from '@/app/lib/auth/supabase-server'
const supabase = await createServerClient()
```

**Client-side (React components):**
```typescript
// ✅ ALWAYS use this in components
import { createClient } from '@/app/lib/auth/supabase-client'
const supabase = createClient()
```

**Utility functions:**
```typescript
// ✅ ALWAYS accept client as parameter
export async function myUtility(
  supabase: SupabaseClient,  // ← Pass client in
  ...otherParams
) {
  // Use the passed client
}
```

### 2. Never Do This

```typescript
// ❌ NEVER create standalone clients in utilities
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)  // ← Missing auth context!
```

### 3. Testing Checklist

When adding new features that interact with Supabase:
- [ ] Test with RLS policies enabled
- [ ] Verify user can only access their own data
- [ ] Test as different users to ensure isolation
- [ ] Check that `auth.uid()` is available in policies

---

## Impact Assessment

### What Was Affected
- ✅ Photo uploads (FIXED)
- ✅ Storage operations (FIXED)

### What Was NOT Affected
- ✅ Authentication - working correctly
- ✅ Meal data storage - working correctly
- ✅ User profiles - working correctly
- ✅ All other database operations - working correctly

---

## Lessons Learned

1. **Authentication context is critical**: Any operation that touches user data needs authentication context
2. **RLS policies are strict**: They fail closed (deny by default), which is good for security
3. **Utility patterns matter**: Utilities that need auth should accept clients as parameters
4. **Test with real constraints**: Local development should mirror production RLS policies

---

## Related Files

**Fixed:**
- `app/lib/storage.ts` - Updated to accept authenticated client
- `app/api/meals/upload/route.ts` - Updated to pass authenticated client

**Dead Code (can be removed):**
- `app/lib/meal-storage.ts` - Not used anywhere, has same pattern issue

**Correct Examples:**
- `app/lib/auth/supabase-server.ts` - Server-side client creation
- `app/lib/auth/supabase-client.ts` - Client-side client creation
- All API routes in `app/api/` - Correctly use createServerClient()

---

## Status: ✅ RESOLVED

Photo uploads now work correctly with RLS policies enforcing user data isolation.

---

*Analysis Date: January 11, 2026*
*Analyst: Kiro AI*
