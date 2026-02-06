# WHOOP Integration - Implementation Handoff

**Date:** January 25, 2026  
**Status:** Core Services Complete - 40% Done  
**Next Phase:** OAuth Callback, Sync Service, UI Components, AI Integration

---

## Overview

WHOOP integration adds recovery, strain, sleep, and workout data from WHOOP wearables to SociusFit. This enables cross-domain AI insights correlating physiological metrics with existing workout and nutrition tracking.

**Spec Location:** `.kiro/specs/whoop-integration/`
- `requirements.md` - Full requirements with acceptance criteria
- `design.md` - Technical architecture and correctness properties
- `tasks.md` - Implementation task list with progress tracking

---

## ✅ Completed Work (Tasks 1-3)

### 1. Database Schema & Types
**Files Created:**
- `docs/migrations/whoop-integration-migration.sql` - Complete database migration
- `app/lib/types/whoop.ts` - All TypeScript interfaces
- `test/whoop/rls-enforcement.property.test.ts` - Property test for RLS (✅ passing)

**Tables Created:**
- `whoop_tokens` - Encrypted OAuth tokens
- `whoop_recovery` - Recovery scores, HRV, resting HR
- `whoop_sleep` - Sleep performance, efficiency, consistency
- `whoop_cycles` - Daily strain scores
- `whoop_workouts` - Individual workout sessions
- `whoop_sync_status` - Sync tracking per user

**All tables have:**
- RLS policies (users can only access their own data)
- Indexes on user_id and date columns
- Proper foreign keys to auth.users

### 2. Token Encryption Service
**Files Created:**
- `app/lib/whoop/encryption.ts` - AES-256-GCM encryption utilities
- `test/whoop/token-encryption.property.test.ts` - Property tests (✅ passing)

**Features:**
- Encrypt/decrypt individual tokens
- Batch encrypt/decrypt for token pairs
- Random IV for each encryption (non-deterministic)
- Auth tag validation prevents tampering
- Key generation utility for setup

**Environment Variable Required:**
```bash
WHOOP_ENCRYPTION_KEY=<64-char-hex-string>
```

Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 3. WHOOP API Client
**Files Created:**
- `app/lib/whoop/api-client.ts` - Complete WHOOP API wrapper
- `test/whoop/api-response-validation.property.test.ts` - Property tests (✅ passing)

**Functions Implemented:**
- `exchangeCodeForTokens()` - OAuth code → tokens
- `refreshAccessToken()` - Refresh expired tokens
- `getRecovery()` - Fetch recovery data
- `getSleep()` - Fetch sleep data
- `getCycles()` - Fetch strain/cycle data
- `getWorkouts()` - Fetch workout data
- Error detection helpers (rate limit, server error, auth error)

**OAuth Scopes Defined:**
```typescript
read:recovery, read:cycles, read:workout, read:sleep, 
read:profile, read:body_measurement, offline
```

---

## 🚧 Remaining Work (Tasks 4-16)

### Task 4: Token Service (NEXT TO IMPLEMENT)
**File to Create:** `app/lib/whoop/token-service.ts`

**Functions Needed:**
```typescript
- storeTokens(userId, tokens) - Encrypt and save to DB
- getTokens(userId) - Retrieve and decrypt from DB
- deleteTokens(userId) - Remove all tokens
- refreshAccessToken(userId) - Auto-refresh expired tokens
- validateTokens(userId) - Check expiration status
```

**Database Operations:**
- Use Supabase client with RLS
- Upsert pattern for token updates
- Handle encryption/decryption errors gracefully

**Property Test:** Token refresh flow (Property 5)

### Task 5: Checkpoint - Core Services Complete
Verify all tests pass before proceeding.

### Task 6: OAuth API Routes
**Files to Create:**
- `app/api/whoop/auth/route.ts` - Initiate OAuth flow
- `app/api/whoop/callback/route.ts` - Handle OAuth callback
- `app/api/whoop/disconnect/route.ts` - Disconnect WHOOP

**OAuth Flow:**
1. User clicks "Connect WHOOP" → `/api/whoop/auth`
2. Generate state token, redirect to WHOOP authorization
3. WHOOP redirects back → `/api/whoop/callback?code=...&state=...`
4. Validate state, exchange code for tokens
5. Store encrypted tokens, trigger initial sync
6. Redirect to settings with success/error

**Property Tests:**
- OAuth URL construction (Property 2)
- OAuth error handling (Property 3)
- Disconnect cleanup (Property 4)

### Task 7: Sync Service
**File to Create:** `app/lib/whoop/sync-service.ts`

**Functions Needed:**
```typescript
- fullSync(userId) - Fetch 7 days of history
- incrementalSync(userId) - Fetch since last sync
- getSyncStatus(userId) - Get sync metadata
```

**Data Transformation:**
- Convert WHOOP API responses to database format
- Handle missing optional fields (set to null)
- Upsert pattern for existing records
- Update sync_status after each sync

**Retry Logic:**
- Exponential backoff: 1s, 2s, 4s
- Max 3 retries for transient errors
- Mark as error after failures

**Property Tests:**
- Initial sync date range (Property 6)
- Data field extraction (Property 7)
- Retry with backoff (Property 8)

### Task 8: Sync API Route
**File to Create:** `app/api/whoop/sync/route.ts`

Trigger manual or scheduled syncs.

### Task 9: Checkpoint - Backend Complete

### Task 10: Data API Route
**File to Create:** `app/api/whoop/data/route.ts`

**Endpoints:**
- GET `/api/whoop/data?type=all` - Fetch all WHOOP data
- GET `/api/whoop/data?type=recovery&startDate=...&endDate=...`

**Response:**
```typescript
{
  recovery?: WhoopRecovery,
  sleep?: WhoopSleep,
  cycle?: WhoopCycle,
  workouts?: WhoopWorkout[],
  connectionStatus: 'connected' | 'disconnected' | 'expired',
  lastSyncAt?: string
}
```

**Property Tests:**
- Fallback to recent data (Property 11)
- Cached data with staleness (Property 14)

### Task 11: Dashboard Components
**Files to Create:**
- `app/components/whoop/WhoopMetricsCard.tsx` - Display metrics
- Update `app/dashboard/page.tsx` - Integrate card

**UI Requirements:**
- Recovery score with color coding (green >66%, yellow 34-66%, red <34%)
- Strain score display
- Sleep performance percentage
- Loading states
- Connect prompt when disconnected
- Fallback to recent data with timestamp

**Property Test:**
- Recovery score color coding (Property 10)

### Task 12: Settings Components
**Files to Create:**
- `app/components/whoop/WhoopConnectionSettings.tsx` - Connection management
- `app/profile/settings/page.tsx` or update existing

**UI Requirements:**
- Connection status display
- Last sync timestamp
- Connect button (when disconnected)
- Disconnect button with confirmation dialog
- Reconnect option (when unhealthy)
- Historical data retention notice

### Task 13: Checkpoint - UI Complete

### Task 14: Cross-Domain AI Insights
**Files to Update:**
- `app/api/fitness-insights/route.ts` - Add WHOOP data to insights
- `app/api/query/route.ts` - Include WHOOP in query context

**AI Prompt Enhancements:**
- Include recovery score, strain, sleep in context
- Correlate recovery with workout performance
- Correlate sleep with next-day performance
- Threshold-based recommendations (recovery <34%, sleep <70%)

**Property Tests:**
- Threshold-based recommendations (Property 12)
- WHOOP context in queries (Property 13)

### Task 15: Error Handling
**File to Create:** `app/lib/whoop/error-handling.ts`

Define error types, messages, and logging patterns.

### Task 16: Final Checkpoint
All tests pass, ready for deployment.

---

## Environment Variables Needed

### Development (.env.local)
```bash
# WHOOP OAuth (from developer.whoop.com)
WHOOP_CLIENT_ID=your_client_id
WHOOP_CLIENT_SECRET=your_client_secret
WHOOP_API_HOSTNAME=https://api.prod.whoop.com

# Encryption (generate with crypto.randomBytes)
WHOOP_ENCRYPTION_KEY=<64-char-hex-string>

# Existing variables (already set)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
```

### Production (Vercel)
Add the same variables in Vercel Dashboard → Settings → Environment Variables

---

## Database Setup Steps

### 1. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Add to `.env.local` as `WHOOP_ENCRYPTION_KEY`

### 2. Run Migration in Supabase
1. Go to Supabase Dashboard → SQL Editor
2. Open `docs/migrations/whoop-integration-migration.sql`
3. Copy entire contents
4. Paste and run in SQL Editor

### 3. Verify Tables Created
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'whoop%';
```

Should see: whoop_tokens, whoop_recovery, whoop_sleep, whoop_cycles, whoop_workouts, whoop_sync_status

### 4. Verify RLS Policies
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename LIKE 'whoop%';
```

---

## WHOOP Developer Dashboard Setup

### 1. Create App
Go to [developer.whoop.com](https://developer.whoop.com) and create an app.

### 2. Configure OAuth
**Privacy Policy URL:**
- Development: `http://localhost:3000/privacy`
- Production: `https://your-domain.vercel.app/privacy`

**Redirect URLs (add both):**
- Development: `http://localhost:3000/api/whoop/callback`
- Production: `https://your-domain.vercel.app/api/whoop/callback`

### 3. Copy Credentials
- Client ID → `WHOOP_CLIENT_ID`
- Client Secret → `WHOOP_CLIENT_SECRET`

---

## Testing Strategy

### Property-Based Tests (15 total)
All property tests use fast-check with 100 iterations minimum.

**Completed (3):**
- ✅ Property 1: Token encryption round-trip
- ✅ Property 9: RLS enforcement
- ✅ Property 15: API response validation

**Remaining (12):**
- Property 2: OAuth URL construction
- Property 3: OAuth error handling
- Property 4: Disconnect cleanup
- Property 5: Token refresh flow
- Property 6: Initial sync date range
- Property 7: WHOOP data field extraction
- Property 8: Retry with exponential backoff
- Property 10: Recovery score color coding
- Property 11: Fallback to recent data
- Property 12: Threshold-based recommendations
- Property 13: WHOOP context in queries
- Property 14: Cached data with staleness

### Unit Tests
Write unit tests for:
- OAuth flow edge cases
- Token service database operations
- Sync service data transformation
- UI component rendering states
- Error handling scenarios

---

## Key Design Decisions

### 1. Token Security
- AES-256-GCM encryption (authenticated encryption)
- Random IV per encryption (non-deterministic)
- Encryption key stored in environment variable
- Tokens never logged or exposed in responses

### 2. Data Synchronization
- Initial sync: 7 days of history
- Incremental sync: Since last sync timestamp
- Sync frequency: Every 4 hours for active users
- Retry logic: Exponential backoff (1s, 2s, 4s)

### 3. Error Handling
- Rate limiting: Exponential backoff
- Server errors: Retry up to 3 times
- Auth errors: Mark connection unhealthy, prompt reconnect
- Partial data: Store available, log missing fields

### 4. UI/UX
- Mobile-first design (touch targets 44px minimum)
- Color-coded recovery scores (traffic light pattern)
- Loading states for all async operations
- Graceful degradation when WHOOP unavailable
- Historical data retained after disconnect

---

## Architecture Patterns

### API Routes
```typescript
// Standard pattern for WHOOP API routes
export async function GET/POST(request: Request) {
  // 1. Authenticate user
  const user = await getUser();
  if (!user) return unauthorized();
  
  // 2. Get/validate WHOOP tokens
  const tokens = await tokenService.getTokens(user.id);
  if (!tokens) return notConnected();
  
  // 3. Call WHOOP API
  const data = await whoopClient.getData(tokens.accessToken);
  
  // 4. Handle errors
  if (isAuthError(error)) {
    await tokenService.refreshAccessToken(user.id);
    // Retry once
  }
  
  // 5. Return response
  return json({ data });
}
```

### Database Operations
```typescript
// Use Supabase client with RLS
const { data, error } = await supabase
  .from('whoop_recovery')
  .select('*')
  .eq('user_id', userId)
  .order('date', { ascending: false })
  .limit(1)
  .single();
```

### React Components
```typescript
// Standard component pattern
export function WhoopMetricsCard({ isConnected, onConnect }: Props) {
  const [data, setData] = useState<WhoopData | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (isConnected) {
      fetchWhoopData();
    }
  }, [isConnected]);
  
  if (!isConnected) return <ConnectPrompt onConnect={onConnect} />;
  if (loading) return <LoadingState />;
  if (!data) return <NoDataState />;
  
  return <MetricsDisplay data={data} />;
}
```

---

## Common Issues & Solutions

### Issue: Token Refresh Fails
**Cause:** Refresh token expired or revoked  
**Solution:** Mark connection unhealthy, prompt user to reconnect

### Issue: Sync Takes Too Long
**Cause:** Fetching too much data at once  
**Solution:** Batch requests, implement pagination

### Issue: RLS Policy Blocks Query
**Cause:** Missing user_id in query or incorrect auth context  
**Solution:** Verify auth.uid() is set, check RLS policies

### Issue: Invalid Date in Property Tests
**Cause:** fast-check generating dates outside valid range  
**Solution:** Use integer timestamps mapped to ISO strings (already fixed)

---

## Next Steps for Implementation

1. **Start with Task 4:** Token Service
   - Implement database operations
   - Write property test for token refresh
   - Test locally with mock data

2. **Continue to Task 6:** OAuth Routes
   - Implement auth initiation
   - Implement callback handling
   - Test OAuth flow end-to-end

3. **Move to Task 7:** Sync Service
   - Implement data fetching and transformation
   - Add retry logic
   - Test with real WHOOP API (if credentials available)

4. **Build UI (Tasks 11-12):**
   - Create dashboard card
   - Create settings component
   - Test on mobile devices

5. **Integrate AI (Task 14):**
   - Update fitness insights API
   - Update query API
   - Test cross-domain insights

6. **Final Testing & Deployment:**
   - Run all property tests
   - Run all unit tests
   - Deploy to Vercel
   - Test in production

---

## Files Reference

### Created Files
```
docs/migrations/whoop-integration-migration.sql
app/lib/types/whoop.ts
app/lib/whoop/encryption.ts
app/lib/whoop/api-client.ts
test/whoop/rls-enforcement.property.test.ts
test/whoop/token-encryption.property.test.ts
test/whoop/api-response-validation.property.test.ts
```

### Files to Create (Next Phase)
```
app/lib/whoop/token-service.ts
app/lib/whoop/sync-service.ts
app/lib/whoop/error-handling.ts
app/api/whoop/auth/route.ts
app/api/whoop/callback/route.ts
app/api/whoop/disconnect/route.ts
app/api/whoop/sync/route.ts
app/api/whoop/data/route.ts
app/components/whoop/WhoopMetricsCard.tsx
app/components/whoop/WhoopConnectionSettings.tsx
app/privacy/page.tsx
```

### Files to Update
```
app/dashboard/page.tsx (integrate WHOOP card)
app/profile/page.tsx or settings page (add WHOOP settings)
app/api/fitness-insights/route.ts (add WHOOP context)
app/api/query/route.ts (add WHOOP context)
```

---

## Success Criteria

### Functional Requirements
- ✅ User can connect WHOOP account via OAuth
- ✅ Tokens stored encrypted in database
- ✅ Data syncs automatically every 4 hours
- ✅ Dashboard displays recovery, strain, sleep metrics
- ✅ Settings page shows connection status
- ✅ AI insights include WHOOP data correlations
- ✅ User can disconnect WHOOP

### Non-Functional Requirements
- ✅ All property tests pass (15 total)
- ✅ All unit tests pass
- ✅ Mobile-responsive UI
- ✅ Loading states for all async operations
- ✅ Error handling for all failure scenarios
- ✅ RLS policies enforce data isolation

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run database migration in Supabase
- [ ] Generate and set WHOOP_ENCRYPTION_KEY
- [ ] Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET
- [ ] All tests passing locally
- [ ] Privacy policy page created

### Vercel Deployment
- [ ] Add environment variables in Vercel
- [ ] Deploy to production
- [ ] Update WHOOP redirect URLs to production domain
- [ ] Test OAuth flow in production
- [ ] Test data sync in production
- [ ] Verify RLS policies working

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check sync status for test users
- [ ] Verify AI insights include WHOOP data
- [ ] Test on actual mobile devices
- [ ] Document any issues in `/docs/errors/`

---

## Contact & Resources

**WHOOP API Documentation:** https://developer.whoop.com/docs  
**Spec Location:** `.kiro/specs/whoop-integration/`  
**Task Tracking:** `.kiro/specs/whoop-integration/tasks.md`

**Key Contacts:**
- WHOOP Developer Support: developer@whoop.com
- Supabase Support: support@supabase.io

---

**Ready to continue implementation!** Start with Task 4 (Token Service) and work through the remaining tasks systematically. All foundation work is complete and tested.
