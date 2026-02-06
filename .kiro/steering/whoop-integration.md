---
inclusion: fileMatch
fileMatchPattern: '**/{whoop,api/whoop}/**/*.{ts,tsx}'
---

# WHOOP Integration Guidelines

## Overview

SociusFit integrates with WHOOP wearables to pull recovery, strain, sleep, and workout data for cross-domain fitness insights.

## OAuth 2.0 Flow

```
1. GET /api/whoop/auth
   └── Redirect to WHOOP authorization URL with scopes

2. User authorizes on WHOOP
   └── WHOOP redirects to /api/whoop/callback?code=...

3. GET /api/whoop/callback
   ├── Exchange code for tokens
   ├── Encrypt tokens with AES-256-GCM
   ├── Store in whoop_tokens table
   └── Trigger initial sync (7 days history)

4. Ongoing: POST /api/whoop/sync (every 4 hours)
   ├── Refresh token if expired
   ├── Fetch new data since last sync
   └── Upsert to whoop_* tables
```

## Database Schema

### whoop_tokens
```sql
whoop_tokens
├── id (UUID, primary key)
├── user_id (UUID, FK to auth.users, UNIQUE)
├── access_token_encrypted (TEXT) -- AES-256-GCM encrypted
├── refresh_token_encrypted (TEXT) -- AES-256-GCM encrypted
├── token_expires_at (TIMESTAMPTZ)
├── scopes (TEXT[])
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### whoop_recovery
```sql
whoop_recovery
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── cycle_id (BIGINT, UNIQUE per user)
├── date (DATE)
├── recovery_score (INTEGER) -- 0-100
├── resting_hr (INTEGER) -- bpm
├── hrv_ms (DECIMAL) -- milliseconds
├── spo2_pct (DECIMAL) -- percentage
├── skin_temp_c (DECIMAL) -- celsius
└── created_at (TIMESTAMPTZ)
```

### whoop_sleep
```sql
whoop_sleep
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── sleep_id (BIGINT, UNIQUE per user)
├── date (DATE)
├── total_sleep_min (INTEGER)
├── rem_min (INTEGER)
├── deep_min (INTEGER)
├── light_min (INTEGER)
├── awake_min (INTEGER)
├── sleep_efficiency (DECIMAL) -- 0-1
├── sleep_score (INTEGER) -- 0-100
└── created_at (TIMESTAMPTZ)
```

### whoop_cycles
```sql
whoop_cycles
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── cycle_id (BIGINT, UNIQUE per user)
├── date (DATE)
├── strain_score (DECIMAL) -- 0-21
├── avg_hr (INTEGER)
├── max_hr (INTEGER)
├── calories_burned (INTEGER)
└── created_at (TIMESTAMPTZ)
```

### whoop_workouts
```sql
whoop_workouts
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── whoop_workout_id (BIGINT, UNIQUE per user)
├── sport_id (INTEGER)
├── sport_name (TEXT)
├── start_time (TIMESTAMPTZ)
├── end_time (TIMESTAMPTZ)
├── strain (DECIMAL)
├── avg_hr (INTEGER)
├── max_hr (INTEGER)
├── calories (INTEGER)
└── created_at (TIMESTAMPTZ)
```

### whoop_sync_status
```sql
whoop_sync_status
├── id (UUID, primary key)
├── user_id (UUID, FK, UNIQUE)
├── last_sync_at (TIMESTAMPTZ)
├── sync_status (TEXT) -- 'success', 'failed', 'in_progress'
├── error_message (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

## Token Encryption

```typescript
// app/lib/whoop/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.WHOOP_ENCRYPTION_KEY!, 'hex') // 32 bytes

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, dataHex] = encrypted.split(':')
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
}
```

**Important:** API routes using encryption must specify Node.js runtime:
```typescript
export const runtime = 'nodejs'
```

## WHOOP API Client

```typescript
// app/lib/whoop/api-client.ts
const WHOOP_API_BASE = `https://${process.env.WHOOP_API_HOSTNAME}`

export async function fetchWhoopData<T>(
  accessToken: string,
  endpoint: string
): Promise<T> {
  const response = await fetch(`${WHOOP_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new WhoopError('TOKEN_EXPIRED', 'Access token expired')
    }
    throw new WhoopError('API_ERROR', `WHOOP API error: ${response.status}`)
  }
  
  return response.json()
}

// Endpoints
export const WHOOP_ENDPOINTS = {
  recovery: '/developer/v1/recovery',
  sleep: '/developer/v1/activity/sleep',
  cycles: '/developer/v1/cycle',
  workouts: '/developer/v1/activity/workout',
  user: '/developer/v1/user/profile/basic'
}
```

## Token Refresh Flow

```typescript
// app/lib/whoop/token-service.ts
export async function refreshTokenIfNeeded(userId: string): Promise<string> {
  const supabase = await createServerClient()
  
  const { data: tokenRecord } = await supabase
    .from('whoop_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (!tokenRecord) {
    throw new WhoopError('NOT_CONNECTED', 'WHOOP not connected')
  }
  
  // Check if token expires within 5 minutes
  const expiresAt = new Date(tokenRecord.token_expires_at)
  const bufferTime = 5 * 60 * 1000 // 5 minutes
  
  if (expiresAt.getTime() - Date.now() < bufferTime) {
    // Refresh needed
    const refreshToken = decrypt(tokenRecord.refresh_token_encrypted)
    const newTokens = await exchangeRefreshToken(refreshToken)
    
    await supabase
      .from('whoop_tokens')
      .update({
        access_token_encrypted: encrypt(newTokens.access_token),
        refresh_token_encrypted: encrypt(newTokens.refresh_token),
        token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
    
    return newTokens.access_token
  }
  
  return decrypt(tokenRecord.access_token_encrypted)
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID!,
      client_secret: process.env.WHOOP_CLIENT_SECRET!
    })
  })
  
  if (!response.ok) {
    throw new WhoopError('REFRESH_FAILED', 'Token refresh failed')
  }
  
  return response.json()
}
```

## Sync Service

```typescript
// app/lib/whoop/sync-service.ts
export async function syncWhoopData(userId: string): Promise<SyncResult> {
  const supabase = await createServerClient()
  
  try {
    // Update status to in_progress
    await updateSyncStatus(userId, 'in_progress')
    
    // Get valid access token
    const accessToken = await refreshTokenIfNeeded(userId)
    
    // Determine date range (last sync or 7 days for initial)
    const { startDate, endDate } = await getSyncDateRange(userId)
    
    // Parallel fetch for efficiency
    const [recovery, sleep, cycles, workouts] = await Promise.all([
      fetchRecoveryData(accessToken, startDate, endDate),
      fetchSleepData(accessToken, startDate, endDate),
      fetchCycleData(accessToken, startDate, endDate),
      fetchWorkoutData(accessToken, startDate, endDate)
    ])
    
    // Upsert data (handles duplicates gracefully)
    const results = await Promise.all([
      upsertRecoveryRecords(supabase, userId, recovery),
      upsertSleepRecords(supabase, userId, sleep),
      upsertCycleRecords(supabase, userId, cycles),
      upsertWorkoutRecords(supabase, userId, workouts)
    ])
    
    // Update sync status
    await updateSyncStatus(userId, 'success')
    
    return {
      success: true,
      recordsUpdated: results.reduce((sum, r) => sum + r.count, 0)
    }
  } catch (error) {
    await updateSyncStatus(userId, 'failed', error.message)
    throw error
  }
}
```

## Error Handling

```typescript
// app/lib/whoop/error-handling.ts
export class WhoopError extends Error {
  constructor(
    public code: WhoopErrorCode,
    message: string,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'WhoopError'
  }
}

export type WhoopErrorCode =
  | 'NOT_CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'REFRESH_FAILED'
  | 'API_ERROR'
  | 'RATE_LIMITED'
  | 'SYNC_FAILED'

// Retry with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (error instanceof WhoopError && !error.retryable) {
        throw error
      }
      
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
    }
  }
  
  throw lastError!
}
```

## UI Components

### Recovery Score Color Coding
```typescript
export function getRecoveryColor(score: number): string {
  if (score >= 67) return 'text-green-500'   // Green: recovered
  if (score >= 34) return 'text-yellow-500'  // Yellow: recovering
  return 'text-red-500'                       // Red: needs recovery
}

export function getRecoveryLabel(score: number): string {
  if (score >= 67) return 'Recovered'
  if (score >= 34) return 'Recovering'
  return 'Need Rest'
}
```

### Strain Level Interpretation
```typescript
export function getStrainLevel(strain: number): string {
  if (strain >= 18) return 'All Out'      // 18-21
  if (strain >= 14) return 'Strenuous'    // 14-17.9
  if (strain >= 10) return 'Moderate'     // 10-13.9
  return 'Light'                           // 0-9.9
}

export function getStrainColor(strain: number): string {
  if (strain >= 18) return 'text-red-500'
  if (strain >= 14) return 'text-orange-500'
  if (strain >= 10) return 'text-yellow-500'
  return 'text-green-500'
}
```

### Sleep Score Display
```typescript
export function getSleepQuality(score: number): string {
  if (score >= 85) return 'Optimal'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Poor'
}
```

## API Endpoints

### GET /api/whoop/auth
Initiates OAuth flow by redirecting to WHOOP authorization.

### GET /api/whoop/callback
Handles OAuth callback, exchanges code for tokens, triggers initial sync.

### POST /api/whoop/sync
Manually triggers data sync. Called automatically every 4 hours.

**Response:**
```typescript
{
  success: boolean,
  recordsUpdated: number,
  lastSyncAt: string
}
```

### GET /api/whoop/data
Retrieves latest WHOOP metrics for dashboard display.

**Query Params:**
- `date` - Optional, defaults to today (YYYY-MM-DD)
- `range` - Optional, 'day' | 'week' | 'month'

**Response:**
```typescript
{
  recovery: {
    score: number,
    resting_hr: number,
    hrv_ms: number,
    date: string
  },
  sleep: {
    score: number,
    total_hours: number,
    efficiency: number,
    date: string
  },
  strain: {
    score: number,
    calories: number,
    date: string
  },
  connected: boolean,
  lastSyncAt: string
}
```

### POST /api/whoop/disconnect
Removes WHOOP connection and deletes all user's WHOOP data.

## Database Queries

### Get Latest Metrics
```typescript
// Get most recent recovery, sleep, strain for dashboard
const [recovery, sleep, strain] = await Promise.all([
  supabase
    .from('whoop_recovery')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .single(),
  supabase
    .from('whoop_sleep')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .single(),
  supabase
    .from('whoop_cycles')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .single()
])
```

### Get Weekly Trend
```typescript
const startOfWeek = getStartOfWeek(new Date())

const { data: weeklyRecovery } = await supabase
  .from('whoop_recovery')
  .select('date, recovery_score, hrv_ms')
  .gte('date', startOfWeek.toISOString())
  .order('date', { ascending: true })
```

### Check Connection Status
```typescript
const { data: tokens } = await supabase
  .from('whoop_tokens')
  .select('id, token_expires_at')
  .single()

const isConnected = !!tokens
const isExpired = tokens && new Date(tokens.token_expires_at) < new Date()
```

## Cross-Domain Integration

WHOOP data integrates with the holistic query system:

```typescript
// In query/lib/domain-fetchers.ts
export async function fetchWhoopContext(
  userId: string,
  dateRange: DateRange
): Promise<WhoopContext> {
  const supabase = await createServerClient()
  
  const [recovery, sleep, strain] = await Promise.all([
    supabase
      .from('whoop_recovery')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end),
    supabase
      .from('whoop_sleep')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end),
    supabase
      .from('whoop_cycles')
      .select('*')
      .eq('user_id', userId)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
  ])
  
  return { recovery: recovery.data, sleep: sleep.data, strain: strain.data }
}
```

## Best Practices

1. **Always refresh tokens** before making API calls
2. **Use upsert** for sync operations to handle duplicates
3. **Encrypt tokens at rest** with AES-256-GCM
4. **Handle rate limits** with exponential backoff
5. **Update sync status** for user visibility
6. **Parallel fetch** recovery, sleep, strain for efficiency
7. **Clean up on disconnect** - delete all user's WHOOP data
8. **Test with stale data** - handle cases where sync fails
9. **Color-code recovery scores** for quick visual feedback
10. **Integrate with holistic queries** for cross-domain insights

## Environment Variables

```bash
WHOOP_CLIENT_ID=your-whoop-client-id
WHOOP_CLIENT_SECRET=your-whoop-client-secret
WHOOP_API_HOSTNAME=api.prod.whoop.com
WHOOP_ENCRYPTION_KEY=your-32-byte-hex-key  # Generate: openssl rand -hex 32
```

## Testing

Property-based tests cover:
- Token encryption round-trip
- OAuth URL construction
- OAuth error handling
- Disconnect cleanup
- Token refresh flow
- Initial sync date range (7 days)
- Data field extraction
- Retry with exponential backoff
- RLS enforcement
- Recovery score color coding
- Fallback to recent data on error
- Threshold-based recommendations
- API response validation
- Cached data staleness detection
