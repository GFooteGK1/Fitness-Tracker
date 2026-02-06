# Session Cleanup Service - Usage Guide

## Overview

The `SessionCleanupService` provides comprehensive session termination and cleanup for authentication. It ensures all authentication artifacts are properly removed when a user signs out.

## Features

- ✅ Server-side session invalidation via Supabase
- ✅ Complete cookie cleanup (auth and OAuth state)
- ✅ localStorage and sessionStorage clearing
- ✅ Cleanup verification
- ✅ Detailed error logging
- ✅ Graceful error handling (continues cleanup even if steps fail)

## Basic Usage

### Import

```typescript
import { sessionCleanupService } from '@/app/lib/auth/session-cleanup-service';
```

### Sign Out

```typescript
// Execute complete sign-out flow
const result = await sessionCleanupService.signOut();

if (result.success) {
  console.log('Sign-out successful');
  // Redirect to login page
  router.push('/auth/signin');
} else {
  console.error('Sign-out completed with errors:', result.errors);
  // Still redirect - client-side cleanup was attempted
  router.push('/auth/signin');
}
```

### Verify Cleanup

```typescript
// Verify all authentication artifacts have been removed
const isClean = sessionCleanupService.verifyCleanup();

if (!isClean) {
  console.warn('Some authentication artifacts remain');
}
```

## CleanupResult Structure

```typescript
interface CleanupResult {
  success: boolean;  // true if all steps succeeded
  steps: {
    serverSignOut: boolean;         // Supabase signOut() called
    cookiesCleared: boolean;        // Auth cookies removed
    localStorageCleared: boolean;   // Auth localStorage keys removed
    sessionStorageCleared: boolean; // sessionStorage cleared
  };
  errors: string[];  // Array of error messages if any step failed
}
```

## Integration with AuthContext

```typescript
// In AuthContext.tsx
import { sessionCleanupService } from '@/app/lib/auth/session-cleanup-service';

const signOut = async () => {
  try {
    // Execute comprehensive cleanup
    const result = await sessionCleanupService.signOut();
    
    if (!result.success) {
      console.error('Sign-out errors:', result.errors);
    }
    
    // Reset local state
    setUser(null);
    setProfile(null);
    setSession(null);
    
    // Redirect to login
    router.push('/auth/signin');
  } catch (error) {
    console.error('Sign-out failed:', error);
    // Still attempt to redirect
    router.push('/auth/signin');
  }
};
```

## What Gets Cleaned Up

### Cookies
- `sb-access-token`
- `sb-refresh-token`
- `whoop_oauth_state`
- Any cookie starting with `sb-`

### localStorage
Keys matching these patterns:
- Starts with `sb-`
- Starts with `supabase.`
- Contains `auth`
- Contains `session`
- Contains `token`

### sessionStorage
- All keys are cleared

### Server-Side
- Supabase session invalidated via `supabase.auth.signOut()`

## Error Handling

The service continues cleanup even if individual steps fail:

```typescript
const result = await sessionCleanupService.signOut();

// Check which steps succeeded
if (!result.steps.serverSignOut) {
  console.error('Server sign-out failed');
}

if (!result.steps.cookiesCleared) {
  console.error('Cookie clearing failed');
}

// All errors are logged
result.errors.forEach(error => {
  console.error('Cleanup error:', error);
});
```

## Browser Context Requirement

The service must be called from browser context (client-side):

```typescript
'use client'  // Required for Next.js client components

import { sessionCleanupService } from '@/app/lib/auth/session-cleanup-service';

export function SignOutButton() {
  const handleSignOut = async () => {
    await sessionCleanupService.signOut();
    // Redirect...
  };
  
  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

## Logging

The service logs detailed information for diagnostics:

```typescript
// Success log
{
  timestamp: '2026-01-27T01:44:10.336Z',
  success: true,
  steps: {
    serverSignOut: true,
    cookiesCleared: true,
    localStorageCleared: true,
    sessionStorageCleared: true
  },
  errors: [],
  browser: {
    userAgent: 'Mozilla/5.0...',
    cookiesEnabled: true
  }
}

// Error log
{
  timestamp: '2026-01-27T01:44:10.351Z',
  success: false,
  steps: {
    serverSignOut: false,
    cookiesCleared: true,
    localStorageCleared: true,
    sessionStorageCleared: true
  },
  errors: [
    'Server sign-out failed: Supabase sign-out failed: Network error'
  ],
  browser: {
    userAgent: 'Mozilla/5.0...',
    cookiesEnabled: true
  }
}
```

## Requirements Satisfied

- **Requirement 2.1**: Clear all authentication cookies
- **Requirement 2.2**: Clear localStorage and sessionStorage
- **Requirement 2.3**: Invalidate server-side session
- **Requirement 2.4**: Complete cleanup before redirect

## Testing

Comprehensive unit tests are available in `test/auth/session-cleanup-service.test.ts`:

```bash
npm test -- test/auth/session-cleanup-service.test.ts
```

## Related Services

- **CookieManager** (`cookie-manager.ts`) - Used for cookie operations
- **Supabase Client** (`supabase.ts`) - Used for server-side session invalidation
- **AuthContext** (`AuthContext.tsx`) - Integrates cleanup service into sign-out flow
