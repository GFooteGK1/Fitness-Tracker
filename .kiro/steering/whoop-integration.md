---
inclusion: fileMatch
fileMatchPattern: '**/{whoop,api/whoop}/**/*.{ts,tsx}'
---

# WHOOP Integration

## OAuth Flow
1. `/api/whoop/auth` → Redirect to WHOOP authorization
2. WHOOP callback → `/api/whoop/callback?code=...`
3. Exchange code → Encrypt tokens (AES-256-GCM) → Store in `whoop_tokens`
4. Initial sync: 7 days history
5. Ongoing: `/api/whoop/sync` every 4 hours

## Database Tables
- `whoop_tokens`: access/refresh tokens (encrypted), expires_at, scopes
- `whoop_recovery`: cycle_id, date, recovery_score (0-100), resting_hr, hrv_ms, spo2_pct, skin_temp_c
- `whoop_sleep`: sleep_id, date, total/rem/deep/light/awake_min, efficiency, score (0-100)
- `whoop_cycles`: cycle_id, date, strain_score (0-21), avg/max_hr, calories
- `whoop_workouts`: whoop_workout_id, sport_id/name, start/end_time, strain, hr, calories
- `whoop_sync_status`: last_sync_at, status (success/failed/in_progress), error_message

## Token Encryption (`app/lib/whoop/encryption.ts`)
```typescript
// AES-256-GCM, format: iv:authTag:encryptedData (all hex)
encrypt(text: string): string
decrypt(encrypted: string): string
```
**Important**: API routes using encryption need `export const runtime = 'nodejs'`

## Key Functions

**Token Service** (`app/lib/whoop/token-service.ts`):
- `refreshTokenIfNeeded(userId)` - Refreshes if expires within 5 min
- `exchangeRefreshToken(refreshToken)` - Gets new tokens from WHOOP

**API Client** (`app/lib/whoop/api-client.ts`):
- `fetchWhoopData<T>(accessToken, endpoint)` - Handles 401 (TOKEN_EXPIRED)
- Endpoints: `/developer/v1/{recovery,activity/sleep,cycle,activity/workout,user/profile/basic}`

**Sync Service** (`app/lib/whoop/sync-service.ts`):
- `syncWhoopData(userId)` - Parallel fetch all domains, upsert records
- `getSyncDateRange(userId)` - Last sync or 7 days for initial
- `withRetry<T>(fn, maxRetries=3)` - Exponential backoff: 1s, 2s, 4s

## UI Helpers
**Recovery**: ≥67 green (Recovered), ≥34 yellow (Recovering), <34 red (Need Rest)
**Strain**: ≥18 All Out, ≥14 Strenuous, ≥10 Moderate, <10 Light
**Sleep**: ≥85 Optimal, ≥70 Good, ≥50 Fair, <50 Poor

## API Endpoints
- `GET /api/whoop/auth` - Initiate OAuth
- `GET /api/whoop/callback` - Handle OAuth, trigger initial sync
- `POST /api/whoop/sync` - Manual sync (auto every 4 hours)
- `GET /api/whoop/data?date=YYYY-MM-DD&range=day|week|month` - Get metrics
- `POST /api/whoop/disconnect` - Remove connection, delete all data

## Cross-Domain Integration
```typescript
// In query/lib/domain-fetchers.ts
fetchWhoopContext(userId, dateRange) // Returns { recovery, sleep, strain }
```

## Error Handling
```typescript
class WhoopError extends Error {
  code: 'NOT_CONNECTED' | 'TOKEN_EXPIRED' | 'REFRESH_FAILED' | 'API_ERROR' | 'RATE_LIMITED' | 'SYNC_FAILED'
  retryable: boolean
}
```

## Environment Variables
```bash
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_API_HOSTNAME=api.prod.whoop.com
WHOOP_ENCRYPTION_KEY=...  # 64 hex chars (32 bytes): openssl rand -hex 32
```

## Best Practices
- Always refresh tokens before API calls
- Use upsert for sync (handles duplicates)
- Encrypt tokens at rest (AES-256-GCM)
- Handle rate limits with exponential backoff
- Update sync status for user visibility
- Parallel fetch for efficiency
- Clean up on disconnect
- Color-code scores for quick feedback
