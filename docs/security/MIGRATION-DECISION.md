# Migration Decision: @supabase/ssr Package

## Current Situation

We attempted to migrate from `@supabase/auth-helpers-nextjs` to `@supabase/ssr` to fix storage upload issues, but this has broken authentication across the entire application.

## Problems Encountered

1. ✅ **Original Issue**: Storage uploads failing with RLS errors
2. ❌ **New Issue**: All API routes returning 401 Unauthorized after migration
3. ❌ **Complexity**: The migration requires changes across 15+ files
4. ❌ **Risk**: Breaking working authentication to fix storage

## Recommendation: REVERT AND USE SIMPLER FIX

Instead of migrating the entire auth system, we should:

1. **Revert to `@supabase/auth-helpers-nextjs`** (working auth)
2. **Create a separate storage-specific client** that includes storage API
3. **Keep all existing auth code working**

## Simpler Solution

The root cause was that `createServerComponentClient` doesn't include storage API. We can fix this by creating a hybrid approach:

```typescript
// For auth operations - use existing auth-helpers
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'

// For storage operations - use supabase-js directly with session
import { createClient } from '@supabase/supabase-js'

// In storage functions, get session from auth client, then create storage client
const authClient = createServerComponentClient({ cookies })
const { data: { session } } = await authClient.auth.getSession()

const storageClient = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${session.access_token}` } }
})
```

This way:
- ✅ Auth keeps working (no changes needed)
- ✅ Storage gets proper authentication
- ✅ Minimal code changes (only storage.ts)
- ✅ No risk to working features

## Decision

**REVERT the @supabase/ssr migration and implement the simpler hybrid approach.**

The migration is too risky and complex for the benefit it provides. The hybrid approach solves the storage issue without breaking authentication.
