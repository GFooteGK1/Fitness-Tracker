# Implementation Plan: WHOOP Integration

## Overview

This implementation plan breaks down the WHOOP integration feature into discrete coding tasks. The approach follows SociusFit's existing patterns: Next.js API routes, Supabase database with RLS, and TypeScript throughout. Tasks are ordered to enable incremental progress with early validation of core functionality.

## Tasks

- [x] 1. Set up database schema and types
  - [x] 1.1 Create database migration for WHOOP tables
    - Create `whoop_tokens`, `whoop_recovery`, `whoop_sleep`, `whoop_cycles`, `whoop_workouts`, `whoop_sync_status` tables
    - Add RLS policies for all tables
    - Create indexes on user_id and date columns
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 1.2 Create TypeScript interfaces for WHOOP data
    - Add interfaces to `app/lib/types/whoop.ts`
    - Include WhoopRecovery, WhoopSleep, WhoopCycle, WhoopWorkout, WhoopTokens, WhoopSyncStatus
    - Export from `app/lib/types/index.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.3 Write property test for RLS enforcement
    - **Property 9: Row-Level Security Enforcement**
    - **Validates: Requirements 4.5**

- [x] 2. Implement token encryption service
  - [x] 2.1 Create token encryption utilities
    - Create `app/lib/whoop/encryption.ts`
    - Implement encrypt/decrypt functions using Node.js crypto
    - Use AES-256-GCM with random IV
    - Store encryption key in environment variable
    - _Requirements: 2.1_

  - [x] 2.2 Write property test for token encryption round-trip
    - **Property 1: Token Encryption Round-Trip**
    - **Validates: Requirements 1.3, 2.1**

- [x] 3. Implement WHOOP API client
  - [x] 3.1 Create WHOOP API client
    - Create `app/lib/whoop/api-client.ts`
    - Implement token exchange function
    - Implement token refresh function
    - Implement data fetching functions (recovery, sleep, cycles, workouts)
    - Handle rate limiting and errors
    - _Requirements: 1.2, 2.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Write property test for API response validation
    - **Property 15: API Response Validation**
    - **Validates: Requirements 8.5**

- [x] 4. Implement token service
  - [x] 4.1 Create token service
    - Create `app/lib/whoop/token-service.ts`
    - Implement storeTokens, getTokens, deleteTokens functions
    - Implement refreshAccessToken with automatic retry
    - Implement validateTokens for expiration checking
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Write property test for token refresh flow
    - **Property 5: Token Refresh Flow**
    - **Validates: Requirements 2.2, 2.4, 2.5**

- [x] 5. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement OAuth API routes
  - [x] 6.1 Create OAuth initiation route
    - Create `app/api/whoop/auth/route.ts`
    - Generate cryptographic state token
    - Build authorization URL with required scopes
    - Store state in session/cookie for validation
    - Return redirect URL
    - _Requirements: 1.1_

  - [x] 6.2 Write property test for OAuth URL construction
    - **Property 2: OAuth Authorization URL Construction**
    - **Validates: Requirements 1.1**

  - [x] 6.3 Create OAuth callback route
    - Create `app/api/whoop/callback/route.ts`
    - Validate state parameter
    - Exchange code for tokens
    - Store encrypted tokens
    - Trigger initial sync
    - Redirect to settings with success/error
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 6.4 Write property test for OAuth error handling
    - **Property 3: OAuth Error Handling**
    - **Validates: Requirements 1.4, 2.3**

  - [x] 6.5 Create disconnect route
    - Create `app/api/whoop/disconnect/route.ts`
    - Delete tokens from database
    - Clear sync status
    - Return success response
    - _Requirements: 1.5_

  - [x] 6.6 Write property test for disconnect cleanup
    - **Property 4: Disconnect Cleanup**
    - **Validates: Requirements 1.5**

- [x] 7. Implement sync service
  - [x] 7.1 Create sync service
    - Create `app/lib/whoop/sync-service.ts`
    - Implement fullSync (7 days history)
    - Implement incrementalSync (since last sync)
    - Transform API responses to database format
    - Handle upsert for existing records
    - Update sync status after each sync
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

  - [x] 7.2 Write property test for initial sync date range
    - **Property 6: Initial Sync Date Range**
    - **Validates: Requirements 3.1**

  - [x] 7.3 Write property test for data field extraction
    - **Property 7: WHOOP Data Field Extraction**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6**

  - [x] 7.4 Implement retry logic with exponential backoff
    - Add retry wrapper for API calls
    - Implement exponential backoff (1s, 2s, 4s)
    - Mark sync as error after 3 failures
    - _Requirements: 3.7, 8.1_

  - [x] 7.5 Write property test for retry with backoff
    - **Property 8: Retry with Exponential Backoff**
    - **Validates: Requirements 3.7, 8.1**

- [x] 8. Create sync API route
  - [x] 8.1 Create sync trigger route
    - Create `app/api/whoop/sync/route.ts`
    - Authenticate user
    - Validate WHOOP connection exists
    - Trigger full or incremental sync
    - Return sync results
    - _Requirements: 3.1, 3.2_

- [x] 9. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create data API route
  - [x] 10.1 Create WHOOP data route
    - Create `app/api/whoop/data/route.ts`
    - Authenticate user
    - Fetch recovery, sleep, cycle data for requested date range
    - Include connection status and last sync time
    - Handle missing data gracefully
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.2 Write property test for fallback to recent data
    - **Property 11: Fallback to Recent Data**
    - **Validates: Requirements 5.4**

  - [x] 10.3 Write property test for cached data with staleness
    - **Property 14: Cached Data with Staleness Indicator**
    - **Validates: Requirements 8.2**

- [x] 11. Implement dashboard components
  - [x] 11.1 Create WHOOP metrics card component
    - Create `app/components/whoop/WhoopMetricsCard.tsx`
    - Display recovery score with color coding
    - Display strain score
    - Display sleep performance
    - Show loading and error states
    - Show connect prompt when disconnected
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 11.2 Write property test for recovery score color coding
    - **Property 10: Recovery Score Color Coding**
    - **Validates: Requirements 5.1**

  - [x] 11.3 Integrate WHOOP card into dashboard
    - Update `app/dashboard/page.tsx`
    - Fetch WHOOP data on load
    - Display WhoopMetricsCard
    - Handle connection states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 12. Implement settings components
  - [x] 12.1 Create WHOOP connection settings component
    - Create `app/components/whoop/WhoopConnectionSettings.tsx`
    - Display connection status
    - Show last sync time when connected
    - Connect button when disconnected
    - Disconnect button with confirmation dialog
    - Reconnect option when unhealthy
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 12.2 Create or update settings page
    - Create `app/privacy/page.tsx` - Privacy policy (required for WHOOP OAuth)
    - Update `app/profile/page.tsx` - Integrate WhoopConnectionSettings component
    - Handle OAuth redirect flow
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 13. Checkpoint - UI complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement cross-domain AI insights
  - [x] 14.1 Update fitness insights API
    - Update `app/api/fitness-insights/route.ts`
    - Fetch WHOOP data alongside workouts and meals
    - Include WHOOP metrics in insight generation
    - Add recovery-based recommendations
    - Add sleep-based recommendations
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 14.2 Write property test for threshold-based recommendations
    - **Property 12: Threshold-Based Recommendations**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 14.3 Update query API for WHOOP context
    - Update `app/api/query/lib/domain-fetchers.ts`
    - Update `app/api/query/lib/prompt-templates.ts`
    - Include WHOOP data in AI prompt context
    - Enable queries about recovery, strain, sleep
    - _Requirements: 6.6_

  - [x] 14.4 Write property test for WHOOP context in queries
    - **Property 13: WHOOP Context in Query Responses**
    - **Validates: Requirements 6.6**

- [x] 15. Implement error handling and logging
  - [x] 15.1 Create WHOOP error handling utilities
    - Create `app/lib/whoop/error-handling.ts`
    - Define error types and messages
    - Implement error logging with context
    - Handle graceful degradation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 16. Final checkpoint
  - All core functionality complete
  - 134 property tests passing
  - Ready for deployment

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Environment variables needed: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_API_HOSTNAME`, `WHOOP_ENCRYPTION_KEY`
