# CookieManager Usage Guide

## Overview

The `CookieManager` utility provides centralized cookie operations with proper security configuration for both browser and server contexts.

## Key Features

- ✅ Automatic environment detection (production vs development)
- ✅ Secure flag automatically set in production
- ✅ SameSite=Lax by default for OAuth compatibility
- ✅ Proper domain and path scoping
- ✅ Cookie validation and security checks
- ✅ Server-side helpers for Next.js cookies() API

## Usage Patterns

### Server-Side Usage (API Routes)

**Recommended Pattern**: Use Next.js `cookies()` API with our helper functions

```typescript
import { cookies } from 'next/headers';
import { serverCookieHelpers } from '@/app/lib/auth/cookie-manager';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  
  // Set OAuth state cookie
  const state = generateState();
  const oauthOptions = serverCookieHelpers.getOAuthStateCookieOptions();
  cookieStore.set('whoop_oauth_state', state, oauthOptions);
  
  // Set auth cookie with custom expiration
  const authOptions = serverCookieHelpers.getAuthCookieOptions(3600); // 1 hour
  cookieStore.set('custom-auth-token', token, authOptions);
  
  // Read cookie
  const storedState = cookieStore.get('whoop_oauth_state')?.value;
  
  // Delete cookie
  cookieStore.delete('whoop_oauth_state');
}
```

### Browser-Side Usage (Client Components)

```typescript
'use client'

import { cookieManager } from '@/app/lib/auth/cookie-manager';

export default function Component() {
  // Set cookie
  cookieManager.setCookie({
    name: 'user-preference',
    value: 'dark-mode',
    maxAge: 86400, // 24 hours
    path: '/',
    sameSite: 'Lax'
    // secure flag automatically set based on environment
  });
  
  // Get cookie
  const preference = cookieManager.getCookie('user-preference');
  
  // Delete cookie
  cookieManager.deleteCookie('user-preference');
  
  // Clear all auth cookies (sign-out)
  cookieManager.clearAuthCookies();
}
```

### Cookie Validation

```typescript
import { CookieManager } from '@/app/lib/auth/cookie-manager';

const manager = new CookieManager();

const config = {
  name: 'auth-token',
  value: 'token123',
  secure: true,
  sameSite: 'Lax' as const,
  path: '/'
};

const result = manager.validateCookieConfig(config);

if (!result.valid) {
  console.error('Cookie configuration issues:', result.issues);
}
```

## Security Best Practices

### 1. Always Use Proper Scoping

```typescript
// ✅ Good: Explicit path and domain
cookieManager.setCookie({
  name: 'token',
  value: 'abc123',
  path: '/',
  domain: 'example.com'
});

// ❌ Bad: No path specified
cookieManager.setCookie({
  name: 'token',
  value: 'abc123'
});
```

### 2. Use Appropriate SameSite Values

```typescript
// ✅ Good: Lax for OAuth flows
cookieManager.setCookie({
  name: 'oauth-state',
  value: 'state123',
  sameSite: 'Lax'
});

// ✅ Good: Strict for sensitive auth tokens
cookieManager.setCookie({
  name: 'session-token',
  value: 'token123',
  sameSite: 'Strict'
});

// ⚠️ Caution: None requires Secure flag
cookieManager.setCookie({
  name: 'cross-site-token',
  value: 'token123',
  sameSite: 'None',
  secure: true // Required!
});
```

### 3. Set Appropriate Expiration Times

```typescript
// OAuth state: 10 minutes
const oauthOptions = serverCookieHelpers.getOAuthStateCookieOptions();
// maxAge: 600

// Session: 24 hours (default)
const authOptions = serverCookieHelpers.getAuthCookieOptions();
// maxAge: 86400

// Custom: 1 hour
const customOptions = serverCookieHelpers.getAuthCookieOptions(3600);
// maxAge: 3600
```

### 4. Clear Cookies Properly on Sign-Out

```typescript
// Browser-side
cookieManager.clearAuthCookies();

// Server-side
const cookieStore = await cookies();
cookieStore.delete('sb-access-token');
cookieStore.delete('sb-refresh-token');
cookieStore.delete('whoop_oauth_state');
```

## Common Patterns

### OAuth Flow

```typescript
// 1. Initiate OAuth (server-side)
import { cookies } from 'next/headers';
import { serverCookieHelpers } from '@/app/lib/auth/cookie-manager';
import crypto from 'crypto';

export async function GET() {
  const state = crypto.randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  const options = serverCookieHelpers.getOAuthStateCookieOptions();
  
  cookieStore.set('oauth_state', state, options);
  
  // Redirect to OAuth provider...
}

// 2. Validate callback (server-side)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');
  
  const cookieStore = await cookies();
  const storedState = cookieStore.get('oauth_state')?.value;
  
  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }
  
  // Clear state cookie after validation
  cookieStore.delete('oauth_state');
  
  // Continue with token exchange...
}
```

### Session Management

```typescript
// Set session cookie (server-side)
const cookieStore = await cookies();
const options = serverCookieHelpers.getAuthCookieOptions(86400); // 24 hours

cookieStore.set('session-token', sessionToken, options);

// Check session (browser-side)
const sessionToken = cookieManager.getCookie('session-token');

if (!sessionToken) {
  // Redirect to login
}
```

### User Preferences

```typescript
// Save preference (browser-side)
cookieManager.setCookie({
  name: 'theme',
  value: 'dark',
  maxAge: 31536000, // 1 year
  path: '/'
});

// Load preference
const theme = cookieManager.getCookie('theme') || 'light';
```

## Environment Differences

### Production
- `secure: true` (HTTPS only)
- Strict cookie validation
- All security flags enforced

### Development
- `secure: false` (allows HTTP)
- Same validation rules
- Easier local testing

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { CookieManager } from '@/app/lib/auth/cookie-manager';

describe('Cookie Operations', () => {
  it('should validate cookie configuration', () => {
    const manager = new CookieManager();
    
    const result = manager.validateCookieConfig({
      name: 'test',
      value: 'value',
      secure: true,
      sameSite: 'Lax',
      path: '/'
    });
    
    expect(result.valid).toBe(true);
  });
});
```

## Troubleshooting

### Cookie Not Being Set

**Problem**: Cookie doesn't appear in browser

**Solutions**:
1. Check if Secure flag is set but using HTTP (development)
2. Verify domain matches current hostname
3. Check browser cookie settings
4. Verify SameSite compatibility

### Cookie Not Being Cleared

**Problem**: Cookie persists after deletion

**Solutions**:
1. Ensure path matches the path used when setting
2. Ensure domain matches the domain used when setting
3. Use `clearAuthCookies()` for comprehensive cleanup
4. Check for multiple cookies with similar names

### OAuth State Validation Fails

**Problem**: State parameter doesn't match

**Solutions**:
1. Verify cookie expiration (10 minutes)
2. Check SameSite=Lax is set
3. Ensure cookie is being set before redirect
4. Verify cookie is accessible in callback route

## Related Files

- `app/lib/auth/cookie-manager.ts` - Main implementation
- `test/auth/cookie-manager.test.ts` - Unit tests
- `app/api/whoop/auth/route.ts` - Example usage (OAuth)
- `app/api/whoop/callback/route.ts` - Example usage (OAuth callback)

## Requirements Mapping

- **Requirement 4.1**: Cookie scope configuration (domain, path, security attributes)
- **Requirement 4.2**: Secure flag in production
- **Requirement 4.3**: SameSite=Lax for OAuth compatibility
- **Requirement 4.4**: OAuth state cookie expiration (10 minutes)
- **Requirement 4.5**: Proper cookie clearing with matching attributes
