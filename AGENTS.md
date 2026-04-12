# AGENTS.md - SociusFit

> Persistent context for AI coding agents. Available every turn without explicit invocation.

---

## Critical Instructions

**IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any tasks involving this project's stack.**

When working on this codebase:
1. **Consult project docs first** — Check the docs index below before relying on training data
2. **Match existing patterns** — Explore similar files in the codebase before writing new code
3. **Respect version constraints** — Use APIs matching versions specified below
4. **Follow mobile-first principles** — 44px touch targets, 16px min fonts, one-handed operation
5. **Enforce RLS everywhere** — All user tables must have row-level security policies

---

## Project Overview

**Project:** SociusFit - Holistic AI-Powered Fitness Companion  
**Version:** 0.2.0 (Production Ready)  
**Status:** Active Development

**What it does:**
- 🏋️ Workout tracking (text, photo OCR, voice)
- 🍽️ Nutrition monitoring (photo-based AI analysis)
- ⌚ WHOOP wearable integration (recovery, strain, sleep, HRV)
- 🤖 Cross-domain AI insights (workout ↔ nutrition ↔ WHOOP)
- 📊 Analytics dashboard with PR tracking
- 📅 Coach programming (Google Sheets integration)

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 15.x |
| UI | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| Database | Supabase PostgreSQL | - |
| Auth | Supabase Auth | - |
| Storage | Supabase Storage | - |
| AI | Anthropic Claude Sonnet 4 | claude-sonnet-4-20250514 |
| Deployment | Vercel (serverless) | - |
| Testing | Vitest + fast-check | 2.x |

---

## Documentation Index
```
[Docs]|root: ./docs
|architecture:{ARCHITECTURE-MAP.md,COMPONENT-DEPENDENCY-GRAPH.md,DEVELOPMENT-PRINCIPLES.md,USER-ID-LINKAGE.md}
|guides:{SETUP-GUIDE.md,DEPLOYMENT-GUIDE.md,DEPLOYMENT-READINESS.md,PHOTO-STORAGE-SETUP.md}
|migrations:{complete-holistic-migration.sql,whoop-integration-migration.sql,fix-rls-policies.sql}
|sessions:{CURRENT-STATE-2026-02-01.md,CURRENT-STATE-SUMMARY.md,PROJECT-STATUS.md,WHOOP-INTEGRATION-COMPLETE.md}
|errors:{2026-01-*.md}
|security:{SECURITY-CHECKLIST.md}

[Specs]|root: ./.kiro/specs
|authentication:{requirements.md,design.md,tasks.md}
|food-tracking:{requirements.md,design.md,tasks.md}
|holistic-query-system:{requirements.md,design.md,tasks.md}
|whoop-integration:{requirements.md,design.md,tasks.md}
|weekly-progress-tracking:{requirements.md,design.md,tasks.md}
|dynamic-sheet-tab-detection:{requirements.md,design.md,tasks.md}

[Steering]|root: ./.kiro/steering
|always:{project-overview.md,development-principles.md}
|conditional:{api-development.md,database-patterns.md,component-patterns.md,auth-security.md,testing-guidelines.md,food-tracking.md,workout-tracking.md,whoop-integration.md,holistic-query.md,weekly-progress.md}
|manual:{troubleshooting.md,deployment.md,quick-reference.md}
```

---

## Project Structure

```
fitness-tracker/
├── app/
│   ├── api/
│   │   ├── auth/{signup,signin,signout,check-password}/route.ts
│   │   ├── meals/{upload,analyze,daily,cleanup,[id]}/route.ts
│   │   ├── whoop/{auth,callback,sync,data,disconnect}/route.ts
│   │   ├── query/route.ts                    # Holistic query endpoint
│   │   ├── parse-workout/route.ts            # AI workout parsing
│   │   ├── ocr-workout/route.ts              # Photo text extraction
│   │   ├── profile/{route.ts,onboarding/}
│   │   ├── targets/route.ts
│   │   ├── adherence/weekly/route.ts
│   │   ├── fitness-insights/route.ts
│   │   └── dashboard-stats/route.ts
│   ├── components/
│   │   ├── auth/{AuthLayout,ProtectedRoute,SignInForm,SignUpForm}.tsx
│   │   ├── whoop/{WhoopMetricsCard,WhoopConnectionSettings}.tsx
│   │   ├── Meal{CameraCapture,EntryCard,EditModal,DisplayExample}.tsx
│   │   ├── {Daily,Weekly}ProgressView.tsx
│   │   ├── {WeekToDateSection,DailyBreakdown,DayCard}.tsx
│   │   ├── TargetManagement.tsx
│   │   └── {Navigation,UserMenu,Breadcrumbs,ErrorBoundary}.tsx
│   ├── lib/
│   │   ├── auth/{AuthContext,supabase-browser,supabase-server}.ts
│   │   ├── whoop/{api-client,token-service,encryption,sync-service,error-handling}.ts
│   │   ├── types/{database,food,workout}.types.ts
│   │   ├── {adherence-calculator,macro-validation,imageUtils}.ts
│   │   ├── {meal-storage,offline-queue,target-management}.ts
│   │   └── {error-handling,session-management,storage}.ts
│   ├── {dashboard,food-progress,log,program,query}/page.tsx
│   └── auth/{signin,signup}/page.tsx
├── docs/
├── test/
└── .kiro/{specs,steering}/
```

---

## Database Schema

### User & Auth
```
user_profiles: user_id*, weight, height, age, gender, fitness_goals, created_at
```

### Workouts
```
workouts: id*, user_id, workout_date, input_text, blocks(JSONB), primary_score, total_duration_min, tags[], notes, rpe, parse_confidence, created_at
block_scores: id*, workout_id, block_type, block_title, rounds_completed, extra_reps, time_s, total_reps, tonnage_lb, rx_status, is_pr, created_at
benchmark_prs: id*, user_id, benchmark_name, date, score_value, score_display, rx_status, is_pr, workout_id, notes
movements: id*, canonical_name, category, movement_pattern, aliases(JSONB), equipment(JSONB), rx_standards(JSONB)
```

### Nutrition
```
meals: id*, user_id, meal_timestamp, photo_url, meal_timing, total_protein, total_carbs, total_fat, total_calories, items(JSONB), created_at
daily_targets: id*, user_id, date, target_protein, target_carbs, target_fat, target_calories, created_at
daily_summaries: (VIEW) user_id, date, total_protein, total_carbs, total_fat, total_calories, meal_count
```

### WHOOP Integration
```
whoop_tokens: id*, user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes[], created_at, updated_at
whoop_recovery: id*, user_id, cycle_id, date, recovery_score, resting_hr, hrv_ms, spo2_pct, skin_temp_c, created_at
whoop_sleep: id*, user_id, sleep_id, date, total_sleep_min, rem_min, deep_min, light_min, awake_min, sleep_efficiency, sleep_score, created_at
whoop_cycles: id*, user_id, cycle_id, date, strain_score, avg_hr, max_hr, calories_burned, created_at
whoop_workouts: id*, user_id, whoop_workout_id, sport_id, sport_name, start_time, end_time, strain, avg_hr, max_hr, calories, created_at
whoop_sync_status: id*, user_id, last_sync_at, sync_status, error_message, created_at, updated_at
```

### Cross-Domain
```
fitness_correlations: id*, user_id, correlation_type, correlation_value, date_range, created_at
daily_fitness_summary: (VIEW) user_id, date, workout_count, total_nutrition, energy_correlation
```

### RLS Pattern (All Tables)
```sql
CREATE POLICY "Users can only access their own data"
  ON table_name FOR ALL
  USING (auth.uid() = user_id);
```

---

## Core Patterns

### Authentication (Supabase SSR)
```typescript
// Browser context
import { createClient } from '@/app/lib/auth/supabase-browser'
const supabase = createClient()

// Server context (API routes, server components)
import { createServerClient } from '@/app/lib/auth/supabase-server'
const supabase = await createServerClient()

// Auth check in API route
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### API Route Structure
```typescript
// app/api/[resource]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  
  // 1. Auth check
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // 2. Parse request
  const body = await request.json()
  
  // 3. Validate input
  // 4. Business logic
  // 5. Database operation (RLS filters automatically)
  // 6. Return response
}
```

### Component Pattern
```typescript
// Named exports, props interface above component
interface ComponentNameProps {
  prop1: string
  prop2?: number
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // Implementation
}
```

### Protected Route
```tsx
<ProtectedRoute>
  <YourProtectedPage />
</ProtectedRoute>
```

---

## WHOOP Integration Patterns

### OAuth Flow
```
1. GET /api/whoop/auth → Redirect to WHOOP authorization
2. WHOOP redirects to /api/whoop/callback with code
3. Exchange code for tokens → Encrypt with AES-256-GCM → Store in whoop_tokens
4. Initial sync: Fetch 7 days of recovery, sleep, strain, workouts
5. Ongoing sync: Every 4 hours via /api/whoop/sync
```

### Token Encryption
```typescript
// app/lib/whoop/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM encryption
const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.WHOOP_ENCRYPTION_KEY!, 'hex') // 32 bytes

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, dataHex] = encrypted.split(':')
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
}
```

### WHOOP API Client
```typescript
// app/lib/whoop/api-client.ts
const WHOOP_API_BASE = `https://${process.env.WHOOP_API_HOSTNAME}`

export async function fetchWhoopData(
  accessToken: string,
  endpoint: string
): Promise<any> {
  const response = await fetch(`${WHOOP_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('TOKEN_EXPIRED')
    }
    throw new Error(`WHOOP API error: ${response.status}`)
  }
  
  return response.json()
}
```

### Token Refresh Flow
```typescript
// app/lib/whoop/token-service.ts
export async function refreshTokenIfNeeded(userId: string): Promise<string> {
  const tokenRecord = await getTokenRecord(userId)
  
  if (isTokenExpired(tokenRecord.token_expires_at)) {
    const refreshToken = decrypt(tokenRecord.refresh_token_encrypted)
    const newTokens = await exchangeRefreshToken(refreshToken)
    await updateTokenRecord(userId, newTokens)
    return newTokens.access_token
  }
  
  return decrypt(tokenRecord.access_token_encrypted)
}
```

### Sync Service
```typescript
// app/lib/whoop/sync-service.ts
export async function syncWhoopData(userId: string): Promise<SyncResult> {
  const accessToken = await refreshTokenIfNeeded(userId)
  
  // Parallel fetch for efficiency
  const [recovery, sleep, cycles, workouts] = await Promise.all([
    fetchRecoveryData(accessToken, startDate, endDate),
    fetchSleepData(accessToken, startDate, endDate),
    fetchCycleData(accessToken, startDate, endDate),
    fetchWorkoutData(accessToken, startDate, endDate)
  ])
  
  // Upsert data (handle duplicates gracefully)
  await Promise.all([
    upsertRecoveryRecords(userId, recovery),
    upsertSleepRecords(userId, sleep),
    upsertCycleRecords(userId, cycles),
    upsertWorkoutRecords(userId, workouts)
  ])
  
  // Update sync status
  await updateSyncStatus(userId, 'success')
  
  return { success: true, recordsUpdated: ... }
}
```

### WHOOP Metrics Display
```typescript
// Recovery score color coding
function getRecoveryColor(score: number): string {
  if (score >= 67) return 'text-green-500'  // Green: recovered
  if (score >= 34) return 'text-yellow-500' // Yellow: recovering
  return 'text-red-500'                      // Red: needs recovery
}

// Strain score interpretation
function getStrainLevel(strain: number): string {
  if (strain >= 18) return 'All Out'
  if (strain >= 14) return 'Strenuous'
  if (strain >= 10) return 'Moderate'
  return 'Light'
}
```

### WHOOP Database Queries
```typescript
// Get latest WHOOP metrics for dashboard
const { data: recovery } = await supabase
  .from('whoop_recovery')
  .select('*')
  .order('date', { ascending: false })
  .limit(1)
  .single()

const { data: sleep } = await supabase
  .from('whoop_sleep')
  .select('*')
  .order('date', { ascending: false })
  .limit(1)
  .single()

const { data: strain } = await supabase
  .from('whoop_cycles')
  .select('*')
  .order('date', { ascending: false })
  .limit(1)
  .single()
```

---

## Food Tracking Patterns

### Photo Upload Flow
```
1. Camera capture (environment-facing) → Preview
2. Compress image (max 1200px, quality 0.8, <1MB)
3. If offline → Queue in IndexedDB
4. Upload to Supabase Storage: meal-photos/{user_id}/{timestamp}.jpg
5. Claude Vision analysis → Extract macros + items
6. Validate macros (macro-validation.ts)
7. Insert to meals table
8. Update UI with new totals
```

### Macro Validation
```typescript
// app/lib/macro-validation.ts
export function validateMacros(macros: Macros): ValidationResult {
  const errors: string[] = []
  
  // Range checks per meal
  if (macros.protein < 0 || macros.protein > 200) errors.push('Protein out of range')
  if (macros.carbs < 0 || macros.carbs > 300) errors.push('Carbs out of range')
  if (macros.fat < 0 || macros.fat > 150) errors.push('Fat out of range')
  if (macros.calories < 0 || macros.calories > 2000) errors.push('Calories out of range')
  
  // Calorie consistency check (within 10%)
  const calculatedCals = (macros.protein * 4) + (macros.carbs * 4) + (macros.fat * 9)
  if (Math.abs(calculatedCals - macros.calories) / calculatedCals > 0.1) {
    errors.push('Calorie calculation inconsistent')
  }
  
  return { isValid: errors.length === 0, errors }
}
```

### Adherence Calculation
```typescript
// app/lib/adherence-calculator.ts
export function calculateAdherence(actual: Macros, target: Macros): number {
  const proteinAdh = Math.min(actual.protein / target.protein, 1)
  const carbsAdh = Math.min(actual.carbs / target.carbs, 1)
  const fatAdh = Math.min(actual.fat / target.fat, 1)
  
  // Weighted average (protein weighted higher for fitness)
  return (proteinAdh * 0.4) + (carbsAdh * 0.3) + (fatAdh * 0.3)
}

// Cumulative (week-to-date) calculation
export function calculateCumulativeAdherence(
  dailyTotals: DailyTotal[],
  dailyTarget: Macros,
  daysElapsed: number
): CumulativeAdherence {
  const proratedTarget = {
    protein: dailyTarget.protein * daysElapsed,
    carbs: dailyTarget.carbs * daysElapsed,
    fat: dailyTarget.fat * daysElapsed,
    calories: dailyTarget.calories * daysElapsed
  }
  
  const cumulative = dailyTotals.reduce((acc, day) => ({
    protein: acc.protein + day.protein,
    carbs: acc.carbs + day.carbs,
    fat: acc.fat + day.fat,
    calories: acc.calories + day.calories
  }), { protein: 0, carbs: 0, fat: 0, calories: 0 })
  
  return {
    actual: cumulative,
    target: proratedTarget,
    deviation: {
      protein: cumulative.protein - proratedTarget.protein,
      carbs: cumulative.carbs - proratedTarget.carbs,
      fat: cumulative.fat - proratedTarget.fat,
      calories: cumulative.calories - proratedTarget.calories
    },
    adherencePercent: calculateAdherence(cumulative, proratedTarget)
  }
}
```

### Meal Timing Options
```typescript
type MealTiming = 'PRE_WORKOUT' | 'POST_WORKOUT' | 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'
```

---

## Workout Tracking Patterns

### Block Types
```typescript
type BlockType = 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'STRENGTH' | 'CARDIO'
```

### Workout Blocks JSONB
```typescript
{
  blocks: [{
    block_type: "AMRAP",
    duration_min: 12,
    movements: [
      { name: "Pull-up", reps: 5 },
      { name: "Push-up", reps: 10 },
      { name: "Air Squat", reps: 15 }
    ],
    score: { rounds: 7, extra_reps: 5 },
    rx_status: "RX"
  }]
}
```

### AI Parsing Config
```typescript
// Claude Sonnet 4 for deterministic parsing
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  temperature: 0,  // Deterministic for consistent parsing
  messages: [...]
})
```

### Common Movement Aliases
```
PU → Pull-up, DL → Deadlift, BS → Back Squat, FS → Front Squat
OHS → Overhead Squat, C&J → Clean and Jerk, S2OH → Shoulder to Overhead
225# → 225 lb, 100kg → 100 kg, BW → bodyweight
```

---

## Dynamic Sheet Tab Detection

Automatically identifies the correct Google Sheets tab for the current month's programming, replacing the need for manual SHEET_GID updates.

### Architecture
```
app/lib/sheets/
├── tab-detector.ts          # Main orchestrator — detectCurrentTab()
├── tab-name-parser.ts       # Date extraction from tab names
├── google-sheets-client.ts  # Google Sheets API v4 wrapper
├── tab-cache.ts             # In-memory TTL cache
├── workout-fetcher.ts       # CSV fetch + parse (used by API and agents)
├── types.ts                 # TypeScript interfaces, TabDetectionError
└── index.ts                 # Barrel exports
```

### How It Works
1. `detectCurrentTab(spreadsheetId, referenceDate?)` checks the in-memory cache
2. On cache miss, fetches tab metadata from Google Sheets API v4
3. Parses each tab name to extract date info with confidence scoring
4. Selects the tab matching the current month (highest confidence, rightmost as tiebreaker)
5. Falls back to most recent dated tab, or rightmost tab if no dates found
6. Caches successful (non-fallback) results for 4 hours

### Supported Tab Name Formats
| Format | Example | Confidence |
|--------|---------|------------|
| Month YYYY | January 2026 | 1.0 |
| Mon YYYY | Jan 2026 | 0.95 |
| YYYY-MM | 2026-01 | 0.9 |
| MM/YYYY | 01/2026 | 0.85 |
| Month only | January | 0.7 |

### Environment Variables
```bash
GOOGLE_SHEETS_API_KEY=your-key        # Required — Google Sheets API v4 key
GOOGLE_SHEETS_CACHE_TTL_HOURS=4       # Optional — cache TTL (default: 4)
```

### Logging
All components log with `[TabDetection] Component: action` prefix:
- **INFO**: cache hits, successful tab detection, tabs fetched
- **WARN**: fallback activation, rate limit retries, invalid sheet properties
- **ERROR**: missing API key, API failures

### Troubleshooting
- **CONFIG_ERROR**: Check `GOOGLE_SHEETS_API_KEY` env var is set
- **API_ERROR (403)**: Ensure spreadsheet is publicly readable or API key has access
- **API_ERROR (429)**: Rate limited — system retries automatically with exponential backoff (1s, 2s, 4s)
- **NO_TABS_FOUND**: Verify `PROGRAMMING_SHEET_ID` in `workout-fetcher.ts` is correct
- **Fallback warnings**: Add a tab named with current month (e.g., "April 2026")

---

## Holistic Query System

### Intent Classification
```typescript
// app/api/query/lib/intent-classifier.ts
type QueryIntent = 'workout' | 'nutrition' | 'whoop' | 'cross-domain'

export async function classifyIntent(question: string): Promise<QueryIntent> {
  // AI-powered classification or keyword matching
  const workoutKeywords = ['workout', 'exercise', 'lift', 'pr', 'fran', 'murph']
  const nutritionKeywords = ['protein', 'carbs', 'calories', 'meal', 'food', 'eat']
  const whoopKeywords = ['recovery', 'strain', 'sleep', 'hrv', 'whoop']
  
  // Check for cross-domain indicators
  const hasCrossDomain = question.includes('affect') || question.includes('correlation')
  
  // Return appropriate intent
}
```

### Domain-Specific Fetchers
```typescript
// app/api/query/lib/domain-fetchers.ts
export async function fetchWorkoutContext(userId: string, dateRange: DateRange) {
  return supabase.from('workouts').select('*').eq('user_id', userId)...
}

export async function fetchNutritionContext(userId: string, dateRange: DateRange) {
  return supabase.from('meals').select('*').eq('user_id', userId)...
}

export async function fetchWhoopContext(userId: string, dateRange: DateRange) {
  const [recovery, sleep, strain] = await Promise.all([
    supabase.from('whoop_recovery').select('*')...,
    supabase.from('whoop_sleep').select('*')...,
    supabase.from('whoop_cycles').select('*')...
  ])
  return { recovery, sleep, strain }
}
```

---

## Mobile-First Guidelines

### Touch Targets
```css
/* Minimum 44px for all interactive elements */
.button, .link, .input {
  min-width: 44px;
  min-height: 44px;
}

button { touch-action: manipulation; } /* Prevent double-tap zoom */
```

### Font Sizes
```css
/* Minimum 16px for inputs (prevents iOS zoom) */
input, textarea, select { font-size: 16px; }
```

### Responsive Patterns
```tsx
// Mobile-first responsive container
<div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Grid layout
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

// Touch-friendly button
<button className="min-w-[44px] min-h-[44px] px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
```

### Camera Integration
```typescript
// Environment-facing camera (back camera on mobile)
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  }
})
```

---

## Testing Patterns

### Property-Based Tests (fast-check)
```typescript
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

describe('MacroValidation', () => {
  it('should accept valid macro ranges', () => {
    fc.assert(
      fc.property(
        fc.record({
          protein: fc.integer({ min: 0, max: 200 }),
          carbs: fc.integer({ min: 0, max: 300 }),
          fat: fc.integer({ min: 0, max: 150 }),
          calories: fc.integer({ min: 0, max: 2000 })
        }),
        (macros) => {
          const result = validateMacros(macros)
          return result.isValid === true
        }
      )
    )
  })
})
```

### Test Commands
```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key

# WHOOP
WHOOP_CLIENT_ID=your-whoop-client-id
WHOOP_CLIENT_SECRET=your-whoop-client-secret
WHOOP_API_HOSTNAME=api.prod.whoop.com
WHOOP_ENCRYPTION_KEY=your-32-byte-hex-key  # 64 hex chars = 32 bytes

# Optional
GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/...
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:ui` | Open Vitest UI |

---

## Known Gotchas

### 1. Node.js Crypto in Edge Runtime
```typescript
// ❌ Wrong - doesn't work in Edge Runtime
import crypto from 'crypto'

// ✅ Correct - use Web Crypto API or ensure Node.js runtime
export const runtime = 'nodejs'  // Add to API route if using Node crypto
```

### 2. Supabase Auth Cookie Handling
```typescript
// ❌ Wrong - missing cookie handling
const supabase = createClient(url, key)

// ✅ Correct - use SSR client with cookie handling
const supabase = await createServerClient()  // Handles cookies automatically
```

### 3. WHOOP Token Expiration
```typescript
// ❌ Wrong - using token without checking expiration
const data = await fetchWhoopData(storedToken, endpoint)

// ✅ Correct - always refresh if needed first
const validToken = await refreshTokenIfNeeded(userId)
const data = await fetchWhoopData(validToken, endpoint)
```

### 4. RLS with JOINs
```typescript
// ❌ Wrong - JOIN may bypass RLS
const { data } = await supabase.from('workouts').select('*, block_scores(*)')

// ✅ Correct - Ensure both tables have RLS, use foreign key relationships
// RLS on block_scores should reference workouts.user_id or use workout_id FK
```

### 5. Image Upload Size
```typescript
// ❌ Wrong - uploading raw camera image (5-10MB)
await supabase.storage.from('meal-photos').upload(path, rawFile)

// ✅ Correct - compress first (<1MB)
const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.8 })
await supabase.storage.from('meal-photos').upload(path, compressed)
```

### 6. Timezone Handling for Daily Queries

**All date operations must use `app/lib/timezone-utils.ts`**. Two offset conventions exist:

- **Raw convention** (`getTimezoneOffset()`): positive for west of UTC (e.g., 360 for CST). Used by `localDateToUTCStart/End`, meals/daily API, adherence/weekly API, query page.
- **Agent convention** (negated): negative for west of UTC (e.g., -360 for CST). Used by V2 page's `tz_offset`, `buildPassiveContext`, agent/process route. Formula: `localTime = UTC + tzOffset`.

```typescript
// ❌ Wrong - server timezone, locale-dependent, or lossy UTC split
const today = new Date().toISOString().split('T')[0]
const localDate = new Date().toLocaleDateString('en-CA')

// ✅ Correct - client-side: use timezone-utils
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'
const today = getLocalDate()                    // YYYY-MM-DD in user's local tz
const tzOffset = getTimezoneOffset()            // raw convention for API calls
fetch(`/api/dashboard-stats?tzOffset=${tzOffset}`)

// ✅ Correct - server-side: accept tzOffset, compute UTC boundaries
import { localDateToUTCStart, localDateToUTCEnd, isValidTimezoneOffset } from '@/app/lib/timezone-utils'
const tzOffset = parseInt(searchParams.get('tzOffset') || '0', 10)
const utcStart = localDateToUTCStart(dateStr, tzOffset)  // raw convention
const utcEnd = localDateToUTCEnd(dateStr, tzOffset)

// ✅ Correct - manual YYYY-MM-DD formatting (no toISOString or toLocaleDateString)
const d = new Date()
const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
```

**Forbidden patterns** (will produce wrong dates near midnight or in non-en-CA locales):
- `toISOString().split('T')[0]` for local dates
- `toLocaleDateString('en-CA')` on server
- `toDateString()` comparisons
- `new Date().getDate()` without timezone offset adjustment on server

---

## Security Checklist

- [x] RLS enabled on all user tables
- [x] Indexes on user_id columns for RLS performance
- [x] WHOOP tokens encrypted with AES-256-GCM
- [x] Password breach checking (HaveIBeenPwned)
- [x] httpOnly session cookies
- [x] Function search_path vulnerabilities fixed
- [x] Storage bucket RLS policies
- [x] Input validation on all forms
- [x] API rate limiting (Vercel default)

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Page Load (3G) | <3s | <2s ✅ |
| API Response | <200ms | <150ms ✅ |
| Meal Logging E2E | <30s | <25s ✅ |
| Workout Parsing | <5s | 3-4s ✅ |
| Database Queries | <100ms | <80ms ✅ |

---

*Last updated: February 1, 2026*  
*Version: 0.2.0*  
*Maintained by: Greg (with Claude)*
