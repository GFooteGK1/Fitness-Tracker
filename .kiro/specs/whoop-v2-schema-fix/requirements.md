# Requirements Document

## Introduction

The WHOOP integration currently uses v2 API endpoints but has a database schema designed for v1 API responses. The v2 API returns UUID strings for sleep and workout identifiers, while the database schema uses BIGINT columns. This mismatch causes silent data loss, duplicate record issues, and prevents proper upsert operations. This feature fixes the schema to match the v2 API structure.

## Glossary

- **WHOOP_API**: The WHOOP v2 REST API that returns fitness data
- **Sleep_Record**: A record in the whoop_sleep table representing a sleep session
- **Workout_Record**: A record in the whoop_workouts table representing a workout session
- **Cycle_Record**: A record in the whoop_cycles table representing a physiological cycle
- **UUID**: Universally Unique Identifier in string format (e.g., "550e8400-e29b-41d4-a716-446655440000")
- **Schema_Migration**: A database operation that modifies table structure
- **Upsert_Operation**: An insert operation that updates on conflict
- **Type_System**: TypeScript type definitions that enforce data structure

## Requirements

### Requirement 1: Database Schema Migration

**User Story:** As a system administrator, I want the database schema to match the WHOOP v2 API response structure, so that data can be stored without loss or corruption.

#### Acceptance Criteria

1. WHEN the migration runs, THE Schema_Migration SHALL change whoop_sleep.sleep_id from BIGINT to TEXT
2. WHEN the migration runs, THE Schema_Migration SHALL change whoop_workouts.whoop_workout_id from BIGINT to TEXT
3. WHEN the migration runs, THE Schema_Migration SHALL preserve whoop_recovery.cycle_id as BIGINT
4. WHEN the migration runs, THE Schema_Migration SHALL preserve whoop_cycles.cycle_id as BIGINT
5. WHEN the migration runs multiple times, THE Schema_Migration SHALL execute idempotently without errors
6. WHEN existing data is present, THE Schema_Migration SHALL preserve all existing records
7. WHEN the migration completes, THE Schema_Migration SHALL maintain all existing indexes
8. WHEN the migration completes, THE Schema_Migration SHALL maintain all existing RLS policies

### Requirement 2: Type System Updates

**User Story:** As a developer, I want TypeScript types to reflect the correct data types, so that type checking prevents runtime errors.

#### Acceptance Criteria

1. WHEN defining WhoopSleep interface, THE Type_System SHALL use string type for sleepId
2. WHEN defining WhoopWorkout interface, THE Type_System SHALL use string type for whoopWorkoutId
3. WHEN defining WhoopRecovery interface, THE Type_System SHALL use number type for cycleId
4. WHEN defining WhoopCycle interface, THE Type_System SHALL use number type for cycleId
5. WHEN compiling TypeScript code, THE Type_System SHALL report errors for incorrect type usage

### Requirement 3: Data Validation

**User Story:** As a system, I want to validate that stored identifiers match expected formats, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN storing a Sleep_Record, THE System SHALL validate that sleep_id is a valid UUID string
2. WHEN storing a Workout_Record, THE System SHALL validate that whoop_workout_id is a valid UUID string
3. WHEN storing a Cycle_Record, THE System SHALL validate that cycle_id is a positive integer
4. IF an invalid identifier format is provided, THEN THE System SHALL reject the operation with a descriptive error
5. WHEN retrieving records, THE System SHALL return identifiers in their stored format

### Requirement 4: Sync Service Compatibility

**User Story:** As a sync service, I want to handle WHOOP v2 API responses correctly, so that all data is stored without loss.

#### Acceptance Criteria

1. WHEN receiving v2 API sleep data, THE Sync_Service SHALL extract UUID strings for sleep identifiers
2. WHEN receiving v2 API workout data, THE Sync_Service SHALL extract UUID strings for workout identifiers
3. WHEN receiving v2 API cycle data, THE Sync_Service SHALL extract integer values for cycle identifiers
4. WHEN performing upsert operations, THE Sync_Service SHALL use the correct identifier for conflict detection
5. WHEN duplicate identifiers are encountered, THE Sync_Service SHALL update existing records rather than creating duplicates

### Requirement 5: Test Coverage

**User Story:** As a developer, I want comprehensive tests for UUID handling, so that regressions are caught early.

#### Acceptance Criteria

1. WHEN running property tests, THE Test_Suite SHALL generate valid UUID v4 strings for sleep and workout identifiers
2. WHEN running property tests, THE Test_Suite SHALL generate valid integers for cycle identifiers
3. WHEN testing data transformations, THE Test_Suite SHALL verify UUID format preservation
4. WHEN testing upsert operations, THE Test_Suite SHALL verify duplicate prevention with UUID identifiers
5. WHEN all tests run, THE Test_Suite SHALL maintain at least 134 passing tests

### Requirement 6: Backward Compatibility

**User Story:** As a system operator, I want the migration to handle edge cases gracefully, so that the system remains stable during transition.

#### Acceptance Criteria

1. WHEN the migration encounters empty tables, THE Schema_Migration SHALL complete successfully
2. WHEN the migration encounters existing data, THE Schema_Migration SHALL convert data types safely
3. WHEN API endpoints are called during migration, THE System SHALL continue functioning
4. WHEN the migration completes, THE System SHALL handle both old and new data formats temporarily
5. AFTER migration completion, THE System SHALL only accept new data formats

### Requirement 7: API Response Handling

**User Story:** As an integration layer, I want to correctly parse v2 API responses, so that all fields are extracted accurately.

#### Acceptance Criteria

1. WHEN parsing v2 sleep responses, THE System SHALL extract sleep_id as a string
2. WHEN parsing v2 workout responses, THE System SHALL extract id as a string
3. WHEN parsing v2 cycle responses, THE System SHALL extract id as a number
4. WHEN parsing v2 recovery responses, THE System SHALL extract cycle_id as a number
5. IF API response format is unexpected, THEN THE System SHALL log a detailed error with the response structure
