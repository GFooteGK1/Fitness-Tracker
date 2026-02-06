# Design Document: WHOOP v2 Schema Fix

## Overview

This design addresses the schema mismatch between the WHOOP v2 API and the current database structure. The v2 API returns UUID strings for sleep and workout identifiers, but the database uses BIGINT columns, causing silent data loss and duplicate records. This fix migrates the schema to use TEXT columns for UUID storage while maintaining integer types for cycle identifiers (which remain integers in v2 API).

**Key Changes:**
- Database: BIGINT → TEXT for sleep_id and whoop_workout_id
- TypeScript: number → string for corresponding interface properties
- Tests: Integer generators → UUID generators for affected properties
- Sync: Ensure proper UUID handling in data transformations

**Impact:**
- Fixes silent data loss during WHOOP sync operations
- Enables proper upsert operations (no more duplicates)
- Aligns database schema with v2 API response structure
- Maintains all 134+ existing tests with updated generators

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     WHOOP v2 API                            │
│  Returns: { sleep_id: "uuid", id: "uuid", cycle_id: 123 }  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Sync Service Layer                         │
│  - Fetches data from WHOOP API                              │
│  - Transforms API responses to database format              │
│  - Validates identifier formats (UUID vs integer)           │
│  - Performs upsert operations                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Database Layer                             │
│  whoop_sleep:                                               │
│    - sleep_id: TEXT (UUID string)                           │
│  whoop_workouts:                                            │
│    - whoop_workout_id: TEXT (UUID string)                   │
│  whoop_cycles:                                              │
│    - cycle_id: BIGINT (integer)                             │
│  whoop_recovery:                                            │
│    - cycle_id: BIGINT (integer)                             │
└─────────────────────────────────────────────────────────────┘
```

### Migration Strategy

**Approach:** Alter column types in place with data preservation

**Steps:**
1. Check if columns are already TEXT (idempotent check)
2. If BIGINT, alter to TEXT
3. Preserve all existing data (cast BIGINT to TEXT if needed)
4. Maintain indexes and constraints
5. Verify RLS policies remain intact

**Rollback:** If needed, can revert TEXT → BIGINT (though data loss may occur for UUID values)

## Components and Interfaces

### Database Schema Changes

**Before (v1-style):**
```sql
CREATE TABLE whoop_sleep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  sleep_id BIGINT NOT NULL,  -- ❌ Wrong for v2 API
  date DATE NOT NULL,
  -- ... other columns
  UNIQUE(user_id, sleep_id)
);

CREATE TABLE whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  whoop_workout_id BIGINT NOT NULL,  -- ❌ Wrong for v2 API
  sport_id INTEGER,
  -- ... other columns
  UNIQUE(user_id, whoop_workout_id)
);
```

**After (v2-compatible):**
```sql
CREATE TABLE whoop_sleep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  sleep_id TEXT NOT NULL,  -- ✅ Stores UUID strings
  date DATE NOT NULL,
  -- ... other columns
  UNIQUE(user_id, sleep_id)
);

CREATE TABLE whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  whoop_workout_id TEXT NOT NULL,  -- ✅ Stores UUID strings
  sport_id INTEGER,
  -- ... other columns
  UNIQUE(user_id, whoop_workout_id)
);
```

**Unchanged (already correct):**
```sql
CREATE TABLE whoop_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  cycle_id BIGINT NOT NULL,  -- ✅ Correct - v2 API uses integers
  -- ... other columns
  UNIQUE(user_id, cycle_id)
);

CREATE TABLE whoop_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  cycle_id BIGINT NOT NULL,  -- ✅ Correct - v2 API uses integers
  -- ... other columns
  UNIQUE(user_id, cycle_id)
);
```

### TypeScript Interface Changes

**File:** `app/lib/types/whoop.types.ts`

**Before:**
```typescript
export interface WhoopSleep {
  id: string
  userId: string
  sleepId: number  // ❌ Wrong type
  date: string
  totalSleepMin: number
  remMin: number
  deepMin: number
  lightMin: number
  awakeMin: number
  sleepEfficiency: number
  sleepScore: number
  createdAt: string
}

export interface WhoopWorkout {
  id: string
  userId: string
  whoopWorkoutId: number  // ❌ Wrong type
  sportId: number
  sportName: string
  startTime: string
  endTime: string
  strain: number
  avgHr: number
  maxHr: number
  calories: number
  createdAt: string
}
```

**After:**
```typescript
export interface WhoopSleep {
  id: string
  userId: string
  sleepId: string  // ✅ UUID string
  date: string
  totalSleepMin: number
  remMin: number
  deepMin: number
  lightMin: number
  awakeMin: number
  sleepEfficiency: number
  sleepScore: number
  createdAt: string
}

export interface WhoopWorkout {
  id: string
  userId: string
  whoopWorkoutId: string  // ✅ UUID string
  sportId: number
  sportName: string
  startTime: string
  endTime: string
  strain: number
  avgHr: number
  maxHr: number
  calories: number
  createdAt: string
}

// Unchanged (already correct)
export interface WhoopCycle {
  id: string
  userId: string
  cycleId: number  // ✅ Integer
  // ...
}

export interface WhoopRecovery {
  id: string
  userId: string
  cycleId: number  // ✅ Integer
  // ...
}
```

### Validation Functions

**File:** `app/lib/whoop/validation.ts` (new file)

```typescript
/**
 * Validates that a string is a valid UUID v4 format
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Validates WHOOP identifier based on data type
 */
export function validateWhoopIdentifier(
  value: string | number,
  type: 'sleep' | 'workout' | 'cycle' | 'recovery'
): { valid: boolean; error?: string } {
  if (type === 'sleep' || type === 'workout') {
    if (typeof value !== 'string') {
      return { valid: false, error: `${type} ID must be a string (UUID)` }
    }
    if (!isValidUUID(value)) {
      return { valid: false, error: `${type} ID must be a valid UUID: ${value}` }
    }
    return { valid: true }
  }
  
  if (type === 'cycle' || type === 'recovery') {
    if (typeof value !== 'number') {
      return { valid: false, error: `${type} ID must be a number` }
    }
    if (!Number.isInteger(value) || value <= 0) {
      return { valid: false, error: `${type} ID must be a positive integer` }
    }
    return { valid: true }
  }
  
  return { valid: false, error: 'Unknown identifier type' }
}
```

### Sync Service Updates

**File:** `app/lib/whoop/sync-service.ts`

**Key Changes:**
```typescript
// Transform v2 API sleep response to database format
function transformSleepData(apiResponse: WhoopV2SleepResponse): WhoopSleep {
  return {
    sleepId: apiResponse.id,  // ✅ Already a UUID string from v2 API
    date: apiResponse.start.split('T')[0],
    totalSleepMin: Math.round(apiResponse.score.total_sleep_duration_milli / 60000),
    // ... other fields
  }
}

// Transform v2 API workout response to database format
function transformWorkoutData(apiResponse: WhoopV2WorkoutResponse): WhoopWorkout {
  return {
    whoopWorkoutId: apiResponse.id,  // ✅ Already a UUID string from v2 API
    sportId: apiResponse.sport_id,
    sportName: apiResponse.sport_name || 'Unknown',
    // ... other fields
  }
}

// Upsert with proper conflict handling
async function upsertSleepRecords(userId: string, records: WhoopSleep[]) {
  // Validate all records before upserting
  for (const record of records) {
    const validation = validateWhoopIdentifier(record.sleepId, 'sleep')
    if (!validation.valid) {
      throw new Error(`Invalid sleep record: ${validation.error}`)
    }
  }
  
  const { data, error } = await supabase
    .from('whoop_sleep')
    .upsert(
      records.map(r => ({ ...r, user_id: userId })),
      { onConflict: 'user_id,sleep_id' }  // ✅ Works correctly with TEXT column
    )
  
  if (error) throw error
  return data
}
```

## Data Models

### WHOOP v2 API Response Formats

**Sleep Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": 12345,
  "created_at": "2024-01-15T08:30:00.000Z",
  "updated_at": "2024-01-15T08:30:00.000Z",
  "start": "2024-01-14T23:00:00.000Z",
  "end": "2024-01-15T07:00:00.000Z",
  "score": {
    "total_sleep_duration_milli": 28800000,
    "sleep_efficiency_percentage": 92.5,
    "sleep_performance_percentage": 85.0
  },
  "stage_summary": {
    "total_awake_time_milli": 1800000,
    "total_light_sleep_time_milli": 14400000,
    "total_slow_wave_sleep_time_milli": 7200000,
    "total_rem_sleep_time_milli": 7200000
  }
}
```

**Workout Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "user_id": 12345,
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2024-01-15T10:00:00.000Z",
  "start": "2024-01-15T09:00:00.000Z",
  "end": "2024-01-15T10:00:00.000Z",
  "sport_id": 63,
  "sport_name": "Functional Fitness",
  "score": {
    "strain": 14.5,
    "average_heart_rate": 145,
    "max_heart_rate": 178,
    "kilojoule": 1200
  }
}
```

**Cycle Response (unchanged - still uses integers):**
```json
{
  "id": 123456789,
  "user_id": 12345,
  "created_at": "2024-01-15T00:00:00.000Z",
  "start": "2024-01-14T23:00:00.000Z",
  "end": "2024-01-15T23:00:00.000Z",
  "score": {
    "strain": 12.3
  }
}
```

### Database Migration Script

**File:** `docs/migrations/whoop-v2-schema-fix.sql`

```sql
-- WHOOP v2 Schema Fix Migration
-- Changes sleep_id and whoop_workout_id from BIGINT to TEXT to support UUID strings
-- Preserves cycle_id as BIGINT (v2 API still uses integers for cycles)

BEGIN;

-- Check and alter whoop_sleep.sleep_id
DO $$
BEGIN
  -- Check if column is already TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whoop_sleep'
    AND column_name = 'sleep_id'
    AND data_type = 'bigint'
  ) THEN
    -- Alter column type (preserves existing data by casting)
    ALTER TABLE whoop_sleep
      ALTER COLUMN sleep_id TYPE TEXT USING sleep_id::TEXT;
    
    RAISE NOTICE 'Altered whoop_sleep.sleep_id from BIGINT to TEXT';
  ELSE
    RAISE NOTICE 'whoop_sleep.sleep_id is already TEXT, skipping';
  END IF;
END $$;

-- Check and alter whoop_workouts.whoop_workout_id
DO $$
BEGIN
  -- Check if column is already TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whoop_workouts'
    AND column_name = 'whoop_workout_id'
    AND data_type = 'bigint'
  ) THEN
    -- Alter column type (preserves existing data by casting)
    ALTER TABLE whoop_workouts
      ALTER COLUMN whoop_workout_id TYPE TEXT USING whoop_workout_id::TEXT;
    
    RAISE NOTICE 'Altered whoop_workouts.whoop_workout_id from BIGINT to TEXT';
  ELSE
    RAISE NOTICE 'whoop_workouts.whoop_workout_id is already TEXT, skipping';
  END IF;
END $$;

-- Verify cycle columns remain BIGINT (no changes needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whoop_cycles'
    AND column_name = 'cycle_id'
    AND data_type = 'bigint'
  ) THEN
    RAISE EXCEPTION 'whoop_cycles.cycle_id is not BIGINT - unexpected state';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whoop_recovery'
    AND column_name = 'cycle_id'
    AND data_type = 'bigint'
  ) THEN
    RAISE EXCEPTION 'whoop_recovery.cycle_id is not BIGINT - unexpected state';
  END IF;
  
  RAISE NOTICE 'Verified cycle_id columns remain BIGINT';
END $$;

-- Verify unique constraints still exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whoop_sleep_user_id_sleep_id_key'
  ) THEN
    RAISE EXCEPTION 'Missing unique constraint on whoop_sleep(user_id, sleep_id)';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whoop_workouts_user_id_whoop_workout_id_key'
  ) THEN
    RAISE EXCEPTION 'Missing unique constraint on whoop_workouts(user_id, whoop_workout_id)';
  END IF;
  
  RAISE NOTICE 'Verified unique constraints intact';
END $$;

COMMIT;

-- Verification queries
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
  AND column_name IN ('sleep_id', 'whoop_workout_id', 'cycle_id')
ORDER BY table_name, column_name;
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: UUID Validation for Sleep Records
*For any* sleep record, if the sleep_id is provided, it must be a valid UUID v4 string format, otherwise the validation should reject it with a descriptive error.

**Validates: Requirements 3.1, 3.4**

### Property 2: UUID Validation for Workout Records
*For any* workout record, if the whoop_workout_id is provided, it must be a valid UUID v4 string format, otherwise the validation should reject it with a descriptive error.

**Validates: Requirements 3.2, 3.4**

### Property 3: Integer Validation for Cycle Records
*For any* cycle record, if the cycle_id is provided, it must be a positive integer, otherwise the validation should reject it with a descriptive error.

**Validates: Requirements 3.3, 3.4**

### Property 4: Identifier Round-Trip Preservation
*For any* WHOOP record (sleep, workout, cycle, or recovery), storing the record and then retrieving it should return the identifier in the same format (UUID string or integer) as it was stored.

**Validates: Requirements 3.5**

### Property 5: Sleep API Response Parsing
*For any* valid v2 API sleep response, the sync service should extract the sleep_id field as a UUID string that passes UUID validation.

**Validates: Requirements 4.1, 7.1**

### Property 6: Workout API Response Parsing
*For any* valid v2 API workout response, the sync service should extract the id field as a UUID string that passes UUID validation.

**Validates: Requirements 4.2, 7.2**

### Property 7: Cycle API Response Parsing
*For any* valid v2 API cycle response, the sync service should extract the id field as a positive integer.

**Validates: Requirements 4.3, 7.3**

### Property 8: Recovery API Response Parsing
*For any* valid v2 API recovery response, the sync service should extract the cycle_id field as a positive integer.

**Validates: Requirements 7.4**

### Property 9: Upsert Duplicate Prevention
*For any* WHOOP record with a given identifier, upserting the same identifier twice should result in exactly one record in the database (update, not duplicate creation).

**Validates: Requirements 4.4, 4.5, 5.4**

### Property 10: UUID Generator Validity
*For any* UUID generated by the test suite's UUID generator, it should be a valid UUID v4 format string.

**Validates: Requirements 5.1**

### Property 11: Integer Generator Validity
*For any* integer generated by the test suite's integer generator for cycle IDs, it should be a positive integer.

**Validates: Requirements 5.2**

### Property 12: Transformation UUID Preservation
*For any* UUID string, transforming it through the API response parser and back should preserve the exact UUID value.

**Validates: Requirements 5.3**

### Property 13: Malformed API Response Error Handling
*For any* malformed or unexpected API response structure, the system should log a detailed error message that includes the response structure without throwing an unhandled exception.

**Validates: Requirements 7.5**

## Error Handling

### Validation Errors

**UUID Format Errors:**
```typescript
{
  error: 'INVALID_UUID_FORMAT',
  message: 'sleep_id must be a valid UUID v4 string',
  received: '12345',
  expected: 'UUID v4 format (e.g., 550e8400-e29b-41d4-a716-446655440000)'
}
```

**Integer Format Errors:**
```typescript
{
  error: 'INVALID_CYCLE_ID',
  message: 'cycle_id must be a positive integer',
  received: -5,
  expected: 'Positive integer'
}
```

### Migration Errors

**Column Type Mismatch:**
```typescript
{
  error: 'MIGRATION_FAILED',
  message: 'Failed to alter column type',
  table: 'whoop_sleep',
  column: 'sleep_id',
  currentType: 'bigint',
  targetType: 'text',
  sqlError: '...'
}
```

**Constraint Violation:**
```typescript
{
  error: 'CONSTRAINT_MISSING',
  message: 'Expected unique constraint not found after migration',
  constraint: 'whoop_sleep_user_id_sleep_id_key',
  table: 'whoop_sleep'
}
```

### Sync Errors

**API Response Parsing:**
```typescript
{
  error: 'API_PARSE_ERROR',
  message: 'Failed to extract identifier from WHOOP API response',
  endpoint: '/v1/activity/sleep',
  responseStructure: { /* actual response */ },
  expectedField: 'id',
  receivedType: 'number',
  expectedType: 'string (UUID)'
}
```

**Upsert Conflict:**
```typescript
{
  error: 'UPSERT_FAILED',
  message: 'Failed to upsert WHOOP record',
  table: 'whoop_sleep',
  conflictColumn: 'sleep_id',
  identifier: '550e8400-e29b-41d4-a716-446655440000',
  sqlError: '...'
}
```

### Error Recovery Strategies

1. **Validation Errors**: Reject the operation immediately, log the error, return descriptive message to caller
2. **Migration Errors**: Rollback transaction, preserve existing data, alert administrator
3. **Sync Errors**: Log detailed error with API response, skip problematic record, continue with remaining records
4. **Type Mismatch**: Attempt type coercion if safe, otherwise reject with clear error message

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** - Specific examples and edge cases:
- Migration script execution on empty tables
- Migration script idempotency (run twice)
- Schema verification after migration
- Type system compilation checks
- Specific API response examples
- RLS policy preservation
- Index preservation

**Property Tests** - Universal properties across all inputs:
- UUID validation for all possible UUID strings
- Integer validation for all possible integers
- API response parsing for all valid response structures
- Upsert behavior for all identifier combinations
- Round-trip preservation for all record types
- Generator validity for all generated values

### Property-Based Testing Configuration

**Library**: fast-check (already in use for WHOOP integration tests)

**Configuration**:
```typescript
import * as fc from 'fast-check'

// Minimum 100 iterations per property test
fc.assert(
  fc.property(/* ... */),
  { numRuns: 100 }
)
```

**UUID Generator**:
```typescript
// Generate valid UUID v4 strings
const uuidArbitrary = fc.uuid()

// Example usage
fc.property(
  uuidArbitrary,
  (uuid) => {
    const result = validateWhoopIdentifier(uuid, 'sleep')
    return result.valid === true
  }
)
```

**Integer Generator**:
```typescript
// Generate positive integers for cycle IDs
const cycleIdArbitrary = fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER })

// Example usage
fc.property(
  cycleIdArbitrary,
  (cycleId) => {
    const result = validateWhoopIdentifier(cycleId, 'cycle')
    return result.valid === true
  }
)
```

**API Response Generator**:
```typescript
// Generate valid v2 API sleep responses
const sleepResponseArbitrary = fc.record({
  id: fc.uuid(),
  user_id: fc.integer({ min: 1 }),
  created_at: fc.date().map(d => d.toISOString()),
  start: fc.date().map(d => d.toISOString()),
  end: fc.date().map(d => d.toISOString()),
  score: fc.record({
    total_sleep_duration_milli: fc.integer({ min: 0, max: 36000000 }),
    sleep_efficiency_percentage: fc.float({ min: 0, max: 100 }),
    sleep_performance_percentage: fc.float({ min: 0, max: 100 })
  }),
  stage_summary: fc.record({
    total_awake_time_milli: fc.integer({ min: 0 }),
    total_light_sleep_time_milli: fc.integer({ min: 0 }),
    total_slow_wave_sleep_time_milli: fc.integer({ min: 0 }),
    total_rem_sleep_time_milli: fc.integer({ min: 0 })
  })
})
```

### Test Organization

**File Structure**:
```
test/
├── whoop/
│   ├── schema-migration.test.ts          # Unit tests for migration
│   ├── validation.property.test.ts       # Property tests for validation
│   ├── sync-parsing.property.test.ts     # Property tests for API parsing
│   ├── upsert-behavior.property.test.ts  # Property tests for upsert
│   └── type-system.test.ts               # Unit tests for TypeScript types
```

### Test Tags

Each property test must reference its design document property:

```typescript
describe('UUID Validation', () => {
  it('Property 1: UUID Validation for Sleep Records - Feature: whoop-v2-schema-fix', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (uuid) => {
          const result = validateWhoopIdentifier(uuid, 'sleep')
          return result.valid === true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### Coverage Goals

- **Line Coverage**: >90% for validation and sync service code
- **Branch Coverage**: >85% for error handling paths
- **Property Coverage**: 100% (all 13 properties must have tests)
- **Mutation Testing**: Consider using Stryker for mutation testing on critical validation logic

### Integration Testing

**Real API Response Testing**:
```typescript
// Use actual v2 API response examples from WHOOP documentation
const realSleepResponse = {
  "id": "550e8400-e29b-41d4-a716-446655440000",
  // ... actual v2 response structure
}

it('should handle real v2 API sleep response', () => {
  const transformed = transformSleepData(realSleepResponse)
  expect(transformed.sleepId).toBe(realSleepResponse.id)
  expect(isValidUUID(transformed.sleepId)).toBe(true)
})
```

### Regression Prevention

**Existing Test Maintenance**:
- All 134+ existing WHOOP integration tests must continue to pass
- Update test generators to use `fc.uuid()` instead of `fc.integer()` for sleep/workout IDs
- Verify no tests are accidentally broken by type changes
- Add new tests for UUID-specific edge cases

**Test Execution**:
```bash
# Run all tests
npm run test

# Run only WHOOP tests
npm run test -- whoop

# Run with coverage
npm run test -- --coverage

# Run property tests with verbose output
npm run test -- --reporter=verbose whoop/*.property.test.ts
```

## Deployment Considerations

### Pre-Deployment Checklist

- [ ] All tests pass (134+ existing + new UUID tests)
- [ ] Migration script tested on staging database
- [ ] Migration script verified as idempotent
- [ ] TypeScript compilation succeeds with no errors
- [ ] No breaking changes to API endpoints
- [ ] RLS policies verified intact
- [ ] Indexes verified intact
- [ ] Backup of production database created

### Migration Execution Plan

1. **Backup**: Create full database backup
2. **Staging Test**: Run migration on staging environment
3. **Verification**: Verify schema changes and data integrity on staging
4. **Production Window**: Schedule maintenance window (minimal downtime expected)
5. **Execute**: Run migration script on production
6. **Verify**: Check schema, data, indexes, RLS policies
7. **Monitor**: Watch for sync errors in first 24 hours
8. **Rollback Plan**: If issues occur, restore from backup

### Post-Deployment Verification

```sql
-- Verify column types
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('whoop_sleep', 'whoop_workouts', 'whoop_cycles', 'whoop_recovery')
  AND column_name IN ('sleep_id', 'whoop_workout_id', 'cycle_id')
ORDER BY table_name, column_name;

-- Expected results:
-- whoop_sleep.sleep_id: text
-- whoop_workouts.whoop_workout_id: text
-- whoop_cycles.cycle_id: bigint
-- whoop_recovery.cycle_id: bigint

-- Verify unique constraints
SELECT conname, contype, conrelid::regclass
FROM pg_constraint
WHERE conname LIKE 'whoop_%_user_id_%_key';

-- Verify RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename LIKE 'whoop_%'
ORDER BY tablename, policyname;
```

### Monitoring

**Key Metrics to Watch**:
- WHOOP sync success rate (should remain >95%)
- Duplicate record creation (should be 0)
- Validation error rate (may increase initially if old data exists)
- API response parsing errors (should be 0 for v2 responses)
- Database query performance (should be unchanged)

**Alert Thresholds**:
- Sync failure rate >5%: Investigate immediately
- Duplicate records detected: Rollback and investigate
- Validation errors >10%: Review data quality
- Query performance degradation >20%: Check indexes

## Future Considerations

### Potential Enhancements

1. **Strict UUID Type**: Consider using PostgreSQL UUID type instead of TEXT for stronger type safety
2. **Migration Automation**: Add migration to CI/CD pipeline for automatic staging deployment
3. **Data Quality Monitoring**: Add dashboard for tracking identifier format compliance
4. **API Version Detection**: Add logic to detect and handle both v1 and v2 API responses dynamically

### Technical Debt

- Current implementation uses TEXT instead of UUID type for flexibility
- No automatic migration rollback mechanism (manual restore required)
- Limited validation of UUID version (accepts any UUID format, not just v4)

### Lessons Learned

- Always verify API response structure matches database schema during integration
- Property-based testing catches type mismatches early
- Idempotent migrations are essential for safe deployment
- UUID vs integer identifier choice should be made at design time, not discovered later
