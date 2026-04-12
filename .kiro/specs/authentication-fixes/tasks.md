# Implementation Plan: Authentication Fixes

## Overview

This implementation plan addresses three critical authentication issues: browser session caching inconsistency, sign-out failure in Chrome, and WHOOP token persistence. The approach involves creating centralized services for cookie management, session cleanup, and token persistence, then integrating these services into the existing AuthContext and authentication flows.

## Tasks

- [x] 1. Create Cookie Manager utility
  - Implement `CookieManager` class with methods for setting, getting, deleting cookies
  - Configure proper security attributes (Secure, SameSite, Path, Domain)
  - Add environment detection for production vs development cookie settings
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 1.1 Write property test for Cookie Manager
  - **Property 8: Cookie Security Attributes**
  - **Validates: Requirements 4.1, 4.3**

- [x] 1.2 Write property test for OAuth cookie expiration
  - **Property 9: OAuth State Cookie Expiration**
  - **Validates: Requirements 4.4, 6.2**

- [x] 2. Create Session Cleanup Service
  - Implement `SessionCleanupService` with comprehensive cleanup logic
  - Add methods for clearing cookies, localStorage, sessionStorage
  - Implement server-side session invalidation via Supabase
  - Add cleanup verification method
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2.1 Write property test for sign-out cleanup completeness
  - **Property 3: Sign-Out Cleanup Completeness**
  - **Validates: Requirements 2.1, 2.2, 2.3, 4.5**

- [x] 2.2 Write property test for post-sign-out access control
  - **Property 4: Post-Sign-Out Access Control**
  - **Validates: Requirements 2.4**

- [x] 2.3 Write unit tests for edge cases
  - Test stale session detection (edge case 1.4)
  - Test partial cleanup failure handling
  - Test server sign-out failure handling

- [-] 3. Enhance WHOOP Token Service with retrieval logic
  - Add `retrieveTokens()` method to fetch and decrypt tokens from database
  - Add `hasValidTokens()` method to check token existence and validity
  - Add `initializeConnection()` method for app startup token restoration
  - Implement token expiry validation logic
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3.1 Write property test for token round-trip persistence
  - **Property 5: WHOOP Token Round-Trip Persistence**
  - **Validates: Requirements 3.1, 3.2**

- [x] 3.2 Write property test for automatic token refresh
  - **Property 6: Automatic Token Refresh**
  - **Validates: Requirements 3.3**

- [x] 3.3 Write property test for token persistence through sign-out
  - **Property 7: WHOOP Token Persistence Through App Sign-Out**
  - **Validates: Requirements 3.5**

- [-] 3.4 Write unit tests for token error handling
  - Test invalid refresh token handling (edge case 3.4)
  - Test token decryption failure
  - Test token retrieval failure
  - Test network errors during refresh

- [x] 4. Checkpoint - Ensure core services pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create Session Synchronization Service
  - Implement `SessionSyncService` using BroadcastChannel API
  - Add fallback to localStorage events for older browsers
  - Implement event broadcasting for login, logout, token refresh
  - Add listener registration and cleanup methods
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 5.1 Write property test for session state propagation
  - **Property 10: Session State Propagation**
  - **Validates: Requirements 5.1**

- [x] 5.2 Write property test for proactive session expiry handling
  - **Property 11: Proactive Session Expiry Handling**
  - **Validates: Requirements 5.2**

- [x] 5.3 Write property test for token refresh side effects
  - **Property 12: Token Refresh Side Effects**
  - **Validates: Requirements 5.3**

- [x] 6. Enhance AuthContext with new services
  - Integrate `SessionCleanupService` into sign-out flow
  - Add WHOOP connection state (`whoopConnected`, `whoopTokensValid`)
  - Implement `initializeWhoopConnection()` method
  - Add `refreshWhoopTokens()` and `disconnectWhoop()` methods
  - Call token initialization on app startup
  - _Requirements: 1.1, 1.2, 1.5, 3.2, 5.1_

- [x] 6.1 Write property test for session initialization validation
  - **Property 1: Session Initialization Validates Storage Consistency**
  - **Validates: Requirements 1.1, 1.5**

- [x] 6.2 Write property test for session restoration
  - **Property 2: Session Restoration Without Re-authentication**
  - **Validates: Requirements 1.2**

- [x] 7. Update OAuth flow with proper state management
  - Update OAuth initiation to use `CookieManager` for state cookies
  - Implement cryptographically secure state generation (32+ bytes)
  - Add state validation in OAuth callback route
  - Implement state cookie cleanup after successful OAuth
  - Add error handling for state validation failures
  - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [x] 7.1 Write property test for OAuth state security
  - **Property 13: OAuth State Parameter Security**
  - **Validates: Requirements 6.1**

- [x] 7.2 Write property test for OAuth state validation
  - **Property 14: OAuth State Validation**
  - **Validates: Requirements 6.3**

- [x] 7.3 Write property test for OAuth state cleanup
  - **Property 15: OAuth State Cleanup**
  - **Validates: Requirements 6.5**

- [x] 7.4 Write unit test for OAuth state validation failure
  - Test invalid state rejection (edge case 6.4)

- [x] 8. Implement comprehensive error logging
  - Add structured logging to all authentication operations
  - Log session validation failures with specific reasons
  - Log token operation failures with token state
  - Log cookie operation failures with browser info
  - Log sign-out failures with step-by-step status
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8.1 Write property test for comprehensive error logging
  - **Property 16: Comprehensive Error Logging**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 9. Update sign-out UI component
  - Ensure sign-out button calls enhanced `signOut()` from AuthContext
  - Add loading state during sign-out
  - Add error handling and user feedback
  - Test sign-out flow in Chrome browser
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 10. Update WHOOP connection UI components
  - Display WHOOP connection status from AuthContext
  - Show token validity status
  - Add manual reconnect button when tokens are invalid
  - Add disconnect button that clears tokens
  - _Requirements: 3.2, 3.4_

- [x] 11. Checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.
  - Test complete authentication flow in Chrome
  - Verify WHOOP connection persists across sessions
  - Verify sign-out properly clears all session data

- [x] 12. Add session synchronization to AuthContext
  - Initialize `SessionSyncService` in AuthContext
  - Broadcast session changes (login, logout, token refresh)
  - Listen for session changes from other tabs
  - Update AuthContext state when receiving broadcasts
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 12.1 Write integration tests for cross-tab synchronization
  - Test BroadcastChannel API integration
  - Test localStorage event fallback

- [x] 13. Final checkpoint - End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify consistent behavior between regular and incognito modes (manual)
  - Verify sign-out works correctly in Chrome
  - Verify WHOOP stays connected across browser sessions
  - Test error scenarios and verify logging

## Notes

- All tasks are required for comprehensive authentication fixes with full test coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- Manual testing required for cross-browser and cross-tab behavior
- Focus on mobile-first principles throughout implementation
