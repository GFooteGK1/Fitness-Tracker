# Implementation Plan: WHOOP v2 Schema Fix

## Status: ✅ COMPLETE

**Completion Date:** February 5, 2026  
**Completion Report:** `docs/sessions/WHOOP-V2-SCHEMA-FIX-COMPLETE.md`  
**Deployment Guide:** `docs/migrations/WHOOP-V2-SCHEMA-FIX-DEPLOYMENT.md`

## Overview

This implementation plan fixes the schema mismatch between the WHOOP v2 API (which returns UUID strings) and the current database schema (which uses BIGINT columns). The fix involves database migration, TypeScript type updates, validation logic, sync service updates, and comprehensive testing.

**All tasks completed successfully with >90% test coverage on all critical code paths.**

## Tasks

- [x] 1. Create validation utilities
  - Create `app/lib/whoop/validation.ts` with UUID and identifier validation functions
  - Implement `isValidUUID()` function with UUID v4 regex pattern
  - Implement `validateWhoopIdentifier()` function for all identifier types
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 1.1 Write property tests for validation utilities
  - **Property 1: UUID Validation for Sleep Records**
  - **Property 2: UUID Validation for Workout Records**
  - **Property 3: Integer Validation for Cycle Records**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 2. Update TypeScript type definitions
  - Update `app/lib/types/whoop.types.ts`
  - Change `WhoopSleep.sleepId` from `number` to `string`
  - Change `WhoopWorkout.whoopWorkoutId` from `number` to `string`
  - Verify `WhoopCycle.cycleId` and `WhoopRecovery.cycleId` remain `number`
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.1 Write type system tests
  - Create unit tests that verify TypeScript compilation with correct types
  - Create tests that verify compilation fails with incorrect types
  - _Requirements: 2.5_

- [x] 3. Create database migration script
  - Create `docs/migrations/whoop-v2-schema-fix.sql`
  - Implement idempotent column type changes (BIGINT → TEXT)
  - Add verification checks for schema, constraints, and RLS policies
  - Include rollback instructions in comments
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 3.1 Write migration tests
  - Test migration on empty tables
  - Test migration idempotency (run twice)
  - Test data preservation with existing records
  - Test constraint preservation
  - Test RLS policy preservation
  - _Requirements: 1.5, 1.6, 1.7, 1.8, 6.1, 6.2_

- [x] 4. Update sync service data transformations
  - Update `app/lib/whoop/sync-service.ts`
  - Modify `transformSleepData()` to handle UUID strings
  - Modify `transformWorkoutData()` to handle UUID strings
  - Add validation calls before database operations
  - Ensure cycle and recovery transformations remain unchanged
  - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 7.4_

- [x] 4.1 Write property tests for API response parsing
  - **Property 5: Sleep API Response Parsing**
  - **Property 6: Workout API Response Parsing**
  - **Property 7: Cycle API Response Parsing**
  - **Property 8: Recovery API Response Parsing**
  - **Validates: Requirements 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 7.4**

- [x] 4.2 Write property tests for error handling
  - **Property 13: Malformed API Response Error Handling**
  - **Validates: Requirements 7.5**

- [x] 5. Update upsert operations
  - Update upsert functions in `app/lib/whoop/sync-service.ts`
  - Ensure conflict detection uses correct identifier columns
  - Add validation before upsert operations
  - Verify upsert works with TEXT columns for sleep/workout IDs
  - _Requirements: 4.4, 4.5_

- [x] 5.1 Write property tests for upsert behavior
  - **Property 9: Upsert Duplicate Prevention**
  - **Validates: Requirements 4.4, 4.5, 5.4**

- [x] 6. Update test generators
  - Update `test/whoop/*.property.test.ts` files
  - Replace `fc.integer()` with `fc.uuid()` for sleep_id generators
  - Replace `fc.integer()` with `fc.uuid()` for whoop_workout_id generators
  - Verify cycle_id generators remain `fc.integer()`
  - _Requirements: 5.1, 5.2_

- [x] 6.1 Write property tests for test generators
  - **Property 10: UUID Generator Validity**
  - **Property 11: Integer Generator Validity**
  - **Validates: Requirements 5.1, 5.2**

- [x] 7. Add round-trip tests
  - Create tests that store and retrieve records
  - Verify identifier format preservation
  - Test with UUID strings for sleep/workout records
  - Test with integers for cycle/recovery records
  - _Requirements: 3.5_

- [x] 7.1 Write property tests for round-trip preservation
  - **Property 4: Identifier Round-Trip Preservation**
  - **Property 12: Transformation UUID Preservation**
  - **Validates: Requirements 3.5, 5.3**

- [x] 8. Checkpoint - Run all tests and verify
  - Run full test suite: `npm run test`
  - Verify at least 134 tests pass (existing tests)
  - Verify all new property tests pass
  - Fix any failing tests
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 5.5_

- [x] 9. Create integration tests with real API responses
  - Create `test/whoop/real-api-responses.test.ts`
  - Add actual v2 API response examples from WHOOP documentation
  - Test sleep response parsing with real UUID
  - Test workout response parsing with real UUID
  - Test cycle response parsing with real integer ID
  - Verify end-to-end flow from API response to database storage
  - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2, 7.3, 7.4_

- [x] 10. Update error handling
  - Add descriptive error messages for validation failures
  - Add error logging for API parsing failures
  - Ensure errors include response structure for debugging
  - Test error scenarios with invalid identifiers
  - _Requirements: 3.4, 7.5_

- [x] 11. Create deployment documentation
  - Document migration execution steps
  - Create pre-deployment checklist
  - Create post-deployment verification queries
  - Document rollback procedure
  - Add monitoring guidelines
  - _Requirements: 6.3, 6.4, 6.5_

- [x] 12. Final checkpoint - Complete verification
  - Run full test suite with coverage: `npm run test -- --coverage`
  - Verify >90% line coverage for validation and sync code
  - Run migration script on local test database
  - Verify schema changes are correct
  - Test sync operation with test WHOOP account (if available)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Migration must be tested thoroughly before production deployment
- All 134+ existing tests must continue to pass after changes
- Comprehensive test coverage ensures safe production deployment
