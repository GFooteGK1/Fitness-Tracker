# Design Document: Authentication Fixes

## Overview

This design addresses three critical authentication issues in SociusFit:

1. **Browser session caching inconsistency** - Session persists but WHOOP connection doesn't in regular Chrome
2. **Sign-out failure** - Sign-out button doesn't properly clear session in Chrome
3. **WHOOP token persistence** - WHOOP requires re-authentication on each visit

The root causes stem from incomplete cookie management, inconsistent storage clearing, and missing token retrieval logic. The solution involves fixing cookie configuration, implementing comprehensive session cleanup, and adding proper token persistence mechanisms.

## Architecture

### Current Authentication Flow

```
User Login
  ↓
Supabase Auth (email/password)
  ↓
Session Created
  ├─ Server: HTTP-only cookies
  ├─ Client: localStorage (session data)
  └─ AuthContext: React state
  ↓
WHOOP OAuth (optional)
  ├─ State cookie (10min expiry)
  ├─ OAuth redirect
  ├─ Token exchange
  └─ Encrypted storage in DB
```

### Problem Areas

**Issue 1: Incomplete Cookie Scope**
- Cookies may not be properly scoped to domain/path
- Missing or incorrect SameSite attributes
- Secure flag not consistently applied

**Issue 2: Partial Session Cleanup**
- `supabase.auth.signOut()` clears server session
- Client-side storage (localStorage, cookies) not fully cleared
- AuthContext state persists after redirect

**Issue 3: Missing Token Retrieval**
- WHOOP tokens stored in DB but not retrieved on session restore
- No automatic token refresh on app initialization
- Token validation not performed on startup

### Proposed Architecture

```
Enhanced Authentication Flow
  ↓
Session Initialization
  ├─ Validate Supabase session
  ├─ Check WHOOP token existence
  ├─ Retrieve and decrypt tokens
  └─ Validate token expiry
  ↓
Session Active
  ├─ Monitor session state
  ├─ Auto-refresh WHOOP tokens
  └─ Sync across tabs
  ↓
Sign Out
  ├─ Call supabase.auth.signOut()
  ├─ Clear all cookies (explicit)
  ├─ Clear localStorage/sessionStorage
  ├─ Reset AuthContext state
  └─ Redirect to login
```

## Components and Interfaces

### 1. Enhanced Cookie Manager

**Purpose**: Centralize cookie operations with proper configuration

```typescript
interface CookieConfig {
  name: string;
  value: string;
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  httpOnly?: boolean;
}

interface CookieManager {
  // Set cookie with proper security attributes
  setCookie(config: CookieConfig): void;
  
  // Get cookie value
  getCookie(name: string): string | null;
  
  // Delete cookie with matching attributes
  deleteCookie(name: string, path?: string, domain?: string): void;
  
  // Clear all authentication-related cookies
  clearAuthCookies(): void;
}
```

**Implementation Notes**:
- Use `js-cookie` library for consistent cookie handling
- Default to `Secure=true` in production
- Default to `SameSite=Lax` for OAuth compatibility
- Explicitly set path and domain for proper scoping

### 2. Session Cleanup Service

**Purpose**: Comprehensive session termination

```typescript
interface SessionCleanupService {
  // Execute complete sign-out flow
  signOut(): Promise<void>;
  
  // Clear all client-side storage
  clearClientStorage(): void;
  
  // Clear all authentication cookies
  clearAuthCookies(): void;
  
  // Reset application state
  resetAppState(): void;
  
  // Verify cleanup completion
  verifyCleanup(): boolean;
}
```

**Cleanup Steps**:
1. Call `supabase.auth.signOut()` to invalidate server session
2. Clear all Supabase-related cookies
3. Clear localStorage keys: `supabase.auth.token`, user data
4. Clear sessionStorage
5. Reset AuthContext to initial state
6. Redirect to login page
7. Log cleanup completion for diagnostics

### 3. WHOOP Token Service (Enhanced)

**Purpose**: Manage WHOOP token lifecycle with persistence

```typescript
interface WhoopTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
}

interface WhoopTokenService {
  // Store tokens in database (existing)
  storeTokens(userId: string, tokens: WhoopTokenData): Promise<void>;
  
  // NEW: Retrieve tokens from database
  retrieveTokens(userId: string): Promise<WhoopTokenData | null>;
  
  // NEW: Check if tokens exist and are valid
  hasValidTokens(userId: string): Promise<boolean>;
  
  // Refresh access token using refresh token (existing)
  refreshAccessToken(userId: string): Promise<string>;
  
  // NEW: Initialize WHOOP connection on app startup
  initializeConnection(userId: string): Promise<boolean>;
  
  // Clear tokens on disconnect
  clearTokens(userId: string): Promise<void>;
}
```

**Token Retrieval Flow**:
1. On app initialization, check if user is authenticated
2. Query `whoop_tokens` table for user's tokens
3. Decrypt tokens using encryption service
4. Validate token expiry
5. If expired, attempt refresh using refresh token
6. If refresh fails, mark connection as disconnected
7. Store connection state in AuthContext

### 4. Session Synchronization Service

**Purpose**: Keep authentication state consistent across tabs

```typescript
interface SessionSyncService {
  // Initialize cross-tab communication
  initialize(): void;
  
  // Broadcast session change to other tabs
  broadcastSessionChange(event: 'login' | 'logout' | 'token_refresh'): void;
  
  // Listen for session changes from other tabs
  onSessionChange(callback: (event: string) => void): void;
  
  // Cleanup listeners
  cleanup(): void;
}
```

**Implementation**:
- Use `BroadcastChannel` API for modern browsers
- Fallback to `localStorage` events for older browsers
- Broadcast on: login, logout, token refresh
- Listeners update AuthContext state

### 5. Enhanced AuthContext

**Purpose**: Centralized authentication state with WHOOP integration

```typescript
interface AuthContextState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  whoopConnected: boolean;
  whoopTokensValid: boolean;
  loading: boolean;
  error: Error | null;
}

interface AuthContextActions {
  // Existing
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  
  // Enhanced
  signOut(): Promise<void>; // Now uses SessionCleanupService
  
  // NEW
  initializeWhoopConnection(): Promise<void>;
  refreshWhoopTokens(): Promise<void>;
  disconnectWhoop(): Promise<void>;
}
```

## Data Models

### Cookie Storage

**Supabase Auth Cookies** (managed by Supabase):
- `sb-access-token` - JWT access token
- `sb-refresh-token` - Refresh token
- Attributes: `HttpOnly=true`, `Secure=true`, `SameSite=Lax`, `Path=/`

**WHOOP OAuth State Cookie**:
- Name: `whoop-oauth-state`
- Value: Encrypted state parameter
- Attributes: `Secure=true`, `SameSite=Lax`, `Path=/`, `MaxAge=600` (10 minutes)

### Database Schema (Existing)

**whoop_tokens table**:
```sql
CREATE TABLE whoop_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### LocalStorage Schema

**Keys to Clear on Sign-Out**:
- `supabase.auth.token` - Cached session data
- `sb-*` - Any Supabase-prefixed keys
- Application-specific user data keys

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Session Initialization Validates Storage Consistency

*For any* authenticated user session, when the application initializes, the Auth_System should validate that session data is consistent across all storage mechanisms (cookies, localStorage, database) before granting access to protected resources.

**Validates: Requirements 1.1, 1.5**

### Property 2: Session Restoration Without Re-authentication

*For any* authenticated user with valid session data, when returning to the application in a new browser tab (simulated by clearing in-memory state while preserving storage), the Auth_System should restore the complete session state without requiring re-authentication.

**Validates: Requirements 1.2**

### Property 3: Sign-Out Cleanup Completeness

*For any* authenticated session, when the sign-out flow executes, the Auth_System should clear all authentication artifacts including: all auth cookies (with proper domain/path matching), all localStorage entries, all sessionStorage entries, and server-side session state.

**Validates: Requirements 2.1, 2.2, 2.3, 4.5**

### Property 4: Post-Sign-Out Access Control

*For any* user who has signed out, when attempting to access protected routes, the Auth_System should redirect to the login page and reject any requests using the invalidated session token.

**Validates: Requirements 2.4**

### Property 5: WHOOP Token Round-Trip Persistence

*For any* valid WHOOP OAuth tokens, when stored in the database and then retrieved in a new session, the Token_Persistence mechanism should return decrypted tokens that match the original values and are correctly associated with the user.

**Validates: Requirements 3.1, 3.2**

### Property 6: Automatic Token Refresh

*For any* expired WHOOP access token with a valid refresh token, when the WHOOP_Connection detects expiration, it should automatically use the refresh token to obtain a new access token without user intervention.

**Validates: Requirements 3.3**

### Property 7: WHOOP Token Persistence Through App Sign-Out

*For any* user with connected WHOOP account, when signing out of the application and then signing back in, the WHOOP tokens should remain available unless the user explicitly disconnects WHOOP.

**Validates: Requirements 3.5**

### Property 8: Cookie Security Attributes

*For any* authentication cookie set by the Auth_System, the cookie should have appropriate security attributes: Secure flag (in production), SameSite=Lax, and proper Path and Domain configuration.

**Validates: Requirements 4.1, 4.3**

### Property 9: OAuth State Cookie Expiration

*For any* OAuth state cookie created during WHOOP authentication flow, the cookie should have an expiration time that matches the OAuth flow timeout (10 minutes).

**Validates: Requirements 4.4, 6.2**

### Property 10: Session State Propagation

*For any* session state change (login, logout, token refresh), when the Auth_System detects the change, all registered application components should receive the updated authentication state.

**Validates: Requirements 5.1**

### Property 11: Proactive Session Expiry Handling

*For any* expired session, when the Auth_System detects expiration, it should notify the user and redirect to login before attempting any API calls that would fail due to invalid session.

**Validates: Requirements 5.2**

### Property 12: Token Refresh Side Effects

*For any* WHOOP token refresh operation, when new tokens are obtained, the Token_Persistence mechanism should both update the database with the new tokens and notify all relevant components of the change.

**Validates: Requirements 5.3**

### Property 13: OAuth State Parameter Security

*For any* WHOOP OAuth flow initiation, the generated state parameter should be cryptographically secure with sufficient entropy (minimum 32 bytes of random data).

**Validates: Requirements 6.1**

### Property 14: OAuth State Validation

*For any* OAuth callback received, when the Auth_System validates the state parameter, it should only accept callbacks where the state parameter exactly matches the stored value, and should reject all others with a clear error message.

**Validates: Requirements 6.3**

### Property 15: OAuth State Cleanup

*For any* successfully completed OAuth flow, when tokens are obtained and stored, the Auth_System should immediately clear the OAuth state cookie.

**Validates: Requirements 6.5**

### Property 16: Comprehensive Error Logging

*For any* authentication error (session validation failure, token operation failure, cookie operation failure, sign-out failure), the Auth_System should log detailed information including: error type, specific failure reason, user context, affected component, and relevant state information.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

## Error Handling

### Session Errors

**Stale Session Detection**:
- Check: Session exists in storage but fails server validation
- Action: Clear all session data, redirect to login
- Log: Session ID, expiry time, validation failure reason

**Partial Session State**:
- Check: Session data exists in some storage layers but not others
- Action: Clear all session data, treat as unauthenticated
- Log: Which storage layers had data, which were missing

**Session Expiry During Use**:
- Check: Session expires while user is active
- Action: Show modal notification, save any unsaved work, redirect to login
- Log: Session duration, last activity time

### WHOOP Token Errors

**Token Retrieval Failure**:
- Check: Database query fails or returns no tokens
- Action: Mark WHOOP as disconnected, continue with app functionality
- Log: User ID, database error, query details

**Token Decryption Failure**:
- Check: Stored tokens cannot be decrypted
- Action: Clear corrupted tokens, mark WHOOP as disconnected
- Log: User ID, encryption error, token metadata

**Refresh Token Expired**:
- Check: Refresh token fails with 401/403
- Action: Mark WHOOP as disconnected, prompt user to reconnect
- Log: User ID, token expiry time, API response

**Token Refresh Network Failure**:
- Check: Network error during token refresh
- Action: Retry with exponential backoff (3 attempts), then mark as disconnected
- Log: User ID, network error, retry attempts

### Cookie Errors

**Cookie Setting Failure**:
- Check: Cookie not present after setting
- Action: Log error, attempt fallback to localStorage for non-sensitive data
- Log: Cookie name, attributes, browser info

**Cookie Scope Mismatch**:
- Check: Cookie exists but not accessible due to domain/path mismatch
- Action: Delete old cookie, set new cookie with correct scope
- Log: Old scope, new scope, cookie name

**Third-Party Cookie Blocking**:
- Check: Browser blocks third-party cookies (affects OAuth)
- Action: Show user-friendly error message with instructions
- Log: Browser info, cookie blocking status

### Sign-Out Errors

**Partial Cleanup Failure**:
- Check: Some cleanup steps succeed, others fail
- Action: Continue with all cleanup steps, log failures, still redirect to login
- Log: Which steps succeeded, which failed, error details

**Server Sign-Out Failure**:
- Check: `supabase.auth.signOut()` fails
- Action: Still clear client-side data, redirect to login, log error
- Log: Server error, session ID, user ID

## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

### Unit Testing Focus

Unit tests should cover:

1. **Specific Examples**:
   - Sign-out with valid session clears all storage
   - WHOOP token retrieval with existing tokens returns correct data
   - OAuth state validation with matching state succeeds

2. **Edge Cases**:
   - Stale session data triggers re-authentication (1.4)
   - Invalid WHOOP refresh tokens prompt re-authentication (3.4)
   - OAuth state validation failure returns clear error (6.4)

3. **Error Conditions**:
   - Token decryption failure handling
   - Network errors during token refresh
   - Cookie setting failures in restrictive browsers

4. **Integration Points**:
   - AuthContext properly integrates with SessionCleanupService
   - CookieManager correctly interfaces with browser cookie API
   - SessionSyncService broadcasts to other tabs

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript/JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `Feature: authentication-fixes, Property {number}: {property_text}`

**Property Test Implementation**:

Each of the 16 correctness properties should be implemented as a separate property-based test:

1. **Property 1** (Session Initialization): Generate random session states, verify validation logic
2. **Property 2** (Session Restoration): Generate random authenticated users, verify restoration
3. **Property 3** (Sign-Out Cleanup): Generate random sessions, verify complete cleanup
4. **Property 4** (Post-Sign-Out Access): Generate random protected routes, verify access denial
5. **Property 5** (Token Round-Trip): Generate random WHOOP tokens, verify storage/retrieval
6. **Property 6** (Token Refresh): Generate expired tokens with valid refresh tokens, verify auto-refresh
7. **Property 7** (Token Persistence): Generate random users with WHOOP, verify tokens persist through sign-out
8. **Property 8** (Cookie Security): Generate random auth cookies, verify security attributes
9. **Property 9** (OAuth Cookie Expiry): Generate OAuth state cookies, verify expiration time
10. **Property 10** (State Propagation): Generate random session changes, verify component updates
11. **Property 11** (Expiry Handling): Generate expired sessions, verify proactive handling
12. **Property 12** (Refresh Side Effects): Generate token refresh events, verify database + notification
13. **Property 13** (State Security): Generate multiple OAuth states, verify cryptographic security
14. **Property 14** (State Validation): Generate matching/non-matching states, verify validation
15. **Property 15** (State Cleanup): Generate completed OAuth flows, verify state cookie removal
16. **Property 16** (Error Logging): Generate various auth errors, verify comprehensive logging

**Test Data Generators**:

```typescript
// Generate random user sessions
const sessionGenerator = fc.record({
  userId: fc.uuid(),
  email: fc.emailAddress(),
  accessToken: fc.string({ minLength: 32 }),
  refreshToken: fc.string({ minLength: 32 }),
  expiresAt: fc.date()
});

// Generate random WHOOP tokens
const whoopTokenGenerator = fc.record({
  accessToken: fc.string({ minLength: 32 }),
  refreshToken: fc.string({ minLength: 32 }),
  expiresAt: fc.integer({ min: Date.now(), max: Date.now() + 86400000 }),
  userId: fc.uuid()
});

// Generate random cookie configurations
const cookieConfigGenerator = fc.record({
  name: fc.constantFrom('sb-access-token', 'sb-refresh-token', 'whoop-oauth-state'),
  value: fc.string({ minLength: 16 }),
  secure: fc.boolean(),
  sameSite: fc.constantFrom('Strict', 'Lax', 'None'),
  path: fc.constantFrom('/', '/api', '/auth'),
  maxAge: fc.integer({ min: 60, max: 86400 })
});
```

### Testing Environment

**Browser Testing**:
- Test in Chrome, Firefox, Safari
- Test with third-party cookies enabled/disabled
- Test in regular and incognito modes (manual verification)

**Cross-Tab Testing**:
- Manual verification of tab synchronization
- Automated tests for BroadcastChannel API
- Fallback tests for localStorage events

**Database Testing**:
- Use Supabase local development environment
- Test RLS policies with different user contexts
- Test encryption/decryption with test keys

### Test Execution

**Unit Tests**: Run on every commit
```bash
npm test
```

**Property Tests**: Run on every commit (with 100 iterations minimum)
```bash
npm test -- --testPathPattern=property
```

**Integration Tests**: Run before deployment
```bash
npm test -- --testPathPattern=integration
```

**Manual Tests**: Run before major releases
- Cross-browser compatibility
- Cross-tab synchronization
- Incognito mode behavior
