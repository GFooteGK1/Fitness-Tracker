# Authentication Library

This directory contains authentication utilities and services for SociusFit.

## Files

### Core Authentication

- **`AuthContext.tsx`** - React context for authentication state management
- **`supabase.ts`** - Browser-side Supabase client
- **`supabase-client.ts`** - Alternative browser client
- **`supabase-server.ts`** - Server-side Supabase client for API routes
- **`types.ts`** - TypeScript types for authentication

### Cookie Management

- **`cookie-manager.ts`** - Centralized cookie operations with security configuration
- **`cookie-manager.usage.md`** - Usage guide and examples

## Cookie Manager

The `CookieManager` utility provides secure cookie operations for both browser and server contexts.

### Features

- ✅ Environment-aware security (production vs development)
- ✅ Automatic Secure flag in production
- ✅ SameSite=Lax by default for OAuth compatibility
- ✅ Cookie validation and security checks
- ✅ Server-side helpers for Next.js cookies() API
- ✅ Comprehensive auth cookie cleanup

### Quick Start

**Server-Side (API Routes)**:
```typescript
import { cookies } from 'next/headers';
import { serverCookieHelpers } from '@/app/lib/auth/cookie-manager';

const cookieStore = await cookies();
const options = serverCookieHelpers.getOAuthStateCookieOptions();
cookieStore.set('oauth_state', state, options);
```

**Browser-Side (Client Components)**:
```typescript
import { cookieManager } from '@/app/lib/auth/cookie-manager';

cookieManager.setCookie({
  name: 'preference',
  value: 'dark-mode',
  maxAge: 86400
});
```

See `cookie-manager.usage.md` for detailed documentation.

## Authentication Flow

### Sign Up
1. User submits email/password
2. Client validates input
3. Password breach check (HaveIBeenPwned)
4. Supabase creates account
5. Auto sign-in
6. Redirect to onboarding

### Sign In
1. User submits credentials
2. Supabase validates
3. Session created (httpOnly cookies)
4. AuthContext updates
5. Redirect to dashboard

### Session Management
1. AuthContext checks session on load
2. Validates cookies
3. Refreshes if needed
4. Monitors for changes
5. Handles expiration

### Sign Out
1. Call `supabase.auth.signOut()`
2. Clear all cookies (via CookieManager)
3. Clear localStorage/sessionStorage
4. Reset AuthContext state
5. Redirect to login

## Security

### Row Level Security (RLS)
All user data is protected by RLS policies that automatically filter to `auth.uid()`.

### Cookie Security
- HttpOnly cookies for sensitive tokens
- Secure flag in production (HTTPS only)
- SameSite=Lax for CSRF protection
- Proper domain and path scoping

### Password Security
- Minimum 8 characters
- Breach checking via HaveIBeenPwned API
- Secure hashing by Supabase

## Testing

Unit tests are located in `test/auth/`:
- `cookie-manager.test.ts` - Cookie manager tests (30 tests)

Run tests:
```bash
npm test -- test/auth/cookie-manager.test.ts
```

## Requirements Mapping

The Cookie Manager implements requirements from the authentication-fixes spec:

- **4.1**: Cookie scope configuration (domain, path, security attributes)
- **4.2**: Secure flag in production
- **4.3**: SameSite=Lax for OAuth compatibility
- **4.4**: OAuth state cookie expiration (10 minutes)
- **4.5**: Proper cookie clearing with matching attributes

## Related Documentation

- `.kiro/specs/authentication-fixes/` - Full specification
- `docs/sessions/` - Development session notes
- `docs/errors/` - Error reports and solutions
