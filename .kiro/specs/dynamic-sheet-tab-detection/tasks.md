# Implementation Plan: Dynamic Sheet Tab Detection

## Overview

This implementation plan breaks down the Dynamic Sheet Tab Detection feature into discrete coding tasks. The approach follows a bottom-up strategy: building core utilities first (parsing, API client), then the orchestration layer (detector, cache), and finally integrating with the existing Workouts API.

## Tasks

- [x] 1. Set up project structure and type definitions
  - Create `app/lib/sheets/` directory
  - Create `types.ts` with all TypeScript interfaces
  - Export types for use across components
  - _Requirements: All requirements (foundational)_

- [ ] 2. Implement Tab Name Parser
  - [x] 2.1 Create tab-name-parser.ts with core parsing logic
    - Implement `parseTabName()` function
    - Add regex patterns for all date formats (Month YYYY, Mon YYYY, YYYY-MM, MM/YYYY, Month only)
    - Implement month name mapping (full and abbreviated)
    - Assign confidence scores based on pattern matched
    - Return null for non-date tab names
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.7_
  
  - [x] 2.2 Write property test for date format parsing
    - **Property 2: Date format parsing with confidence scoring**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 10.1, 10.2, 10.3, 10.4, 10.5**
  
  - [x] 2.3 Write property test for non-date tab names
    - **Property 3: Non-date tab names return null**
    - **Validates: Requirements 2.7, 10.7**
  
  - [x] 2.4 Write unit tests for specific date formats
    - Test "January 2026" → confidence 1.0
    - Test "Jan 2026" → confidence 0.95
    - Test "2026-01" → confidence 0.9
    - Test "01/2026" → confidence 0.85
    - Test "January" → confidence 0.7, current year
    - Test "Sheet1" → null
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_


- [ ] 3. Implement Google Sheets API Client
  - [x] 3.1 Create google-sheets-client.ts with API wrapper
    - Implement `fetchSheetTabs()` function
    - Build API URL with fields parameter
    - Add error handling for all HTTP status codes (401, 403, 404, 429, 500+)
    - Implement exponential backoff retry logic (max 3 retries)
    - Parse API response and extract tab metadata
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 7.4, 7.5, 7.6_
  
  - [x] 3.2 Write property test for exponential backoff
    - **Property 14: Exponential backoff on rate limiting**
    - **Validates: Requirements 7.5**
  
  - [x] 3.3 Write unit tests for API error handling
    - Test 401 unauthorized → CONFIG_ERROR
    - Test 403 forbidden → API_ERROR with permissions guidance
    - Test 404 not found → API_ERROR
    - Test 429 rate limit → retry with backoff
    - Test 500 server error → retry with backoff
    - _Requirements: 1.2, 7.4, 7.5_
  
  - [x] 3.4 Write property test for tab metadata extraction
    - **Property 1: Tab metadata extraction completeness**
    - **Validates: Requirements 1.3**

- [ ] 4. Implement Tab Cache
  - [x] 4.1 Create tab-cache.ts with caching logic
    - Implement `TabCache` class with Map storage
    - Implement `get()` method with TTL and month validation
    - Implement `set()` method
    - Implement `clear()` method
    - Add cache invalidation logic (TTL expired, month changed)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [x] 4.2 Write property test for cache hit avoids API call
    - **Property 8: Cache hit avoids API call**
    - **Validates: Requirements 5.1, 5.3**
  
  - [x] 4.3 Write property test for cache expiration
    - **Property 9: Cache expiration after TTL**
    - **Validates: Requirements 5.2**
  
  - [x] 4.4 Write property test for cache invalidation on month change
    - **Property 10: Cache invalidation on month change**
    - **Validates: Requirements 5.4**
  
  - [x] 4.5 Write unit tests for cache behavior
    - Test cache hit within TTL
    - Test cache miss after TTL expires
    - Test cache invalidation when month changes
    - Test cache not storing error results
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_


- [ ] 5. Implement Tab Detector orchestrator
  - [-] 5.1 Create tab-detector.ts with main detection logic
    - Implement `detectCurrentTab()` function
    - Add cache check logic
    - Integrate Google Sheets API client
    - Integrate tab name parser
    - Implement tab scoring algorithm
    - Implement tab selection logic (highest confidence, tiebreaker by index)
    - Implement fallback logic (most recent dated tab, rightmost tab)
    - Add comprehensive logging (INFO, WARN, ERROR levels)
    - Cache successful results
    - _Requirements: 1.1, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 5.4, 5.5, 8.1, 8.2, 8.4, 8.5_
  
  - [x] 5.2 Write property test for current month tab selection
    - **Property 4: Current month tab selection**
    - **Validates: Requirements 3.1**
  
  - [x] 5.3 Write property test for highest confidence selection with tiebreaker
    - **Property 5: Highest confidence selection with tiebreaker**
    - **Validates: Requirements 3.3, 3.4**
  
  - [x] 5.4 Write property test for fallback to most recent dated tab
    - **Property 6: Fallback to most recent dated tab**
    - **Validates: Requirements 3.5, 4.1, 4.4**
  
  - [x] 5.5 Write property test for fallback to rightmost tab
    - **Property 7: Fallback to rightmost tab**
    - **Validates: Requirements 4.2, 4.4**
  
  - [x] 5.6 Write property test for fallback response includes warning
    - **Property 15: Fallback response includes warning**
    - **Validates: Requirements 4.3, 8.6**
  
  - [x] 5.7 Write unit tests for tab selection scenarios
    - Test selecting current month tab when available
    - Test selecting highest confidence when multiple matches
    - Test tiebreaker by index when equal confidence
    - Test fallback to most recent dated tab
    - Test fallback to rightmost tab when no dates
    - Test logging behavior for each scenario
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 8.4, 8.5_

- [ ] 6. Checkpoint - Ensure all core components pass tests
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 7. Integrate with Workouts API
  - [x] 7.1 Update app/api/workouts/route.ts to use tab detection
    - Import `detectCurrentTab` from tab-detector
    - Remove hardcoded SHEET_GID constant
    - Call `detectCurrentTab()` at start of GET handler
    - Handle TabDetectionError with appropriate error responses
    - Construct CSV URL using detected sheetGid
    - Log warnings when fallback mode is used
    - Include troubleshooting guidance in error responses
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.3, 8.6_
  
  - [x] 7.2 Write property test for CSV URL construction
    - **Property 12: CSV URL construction with detected GID**
    - **Validates: Requirements 6.2**
  
  - [x] 7.3 Write property test for error response with troubleshooting
    - **Property 13: Error response with troubleshooting guidance**
    - **Validates: Requirements 6.4**
  
  - [x] 7.4 Write unit tests for Workouts API integration
    - Test successful tab detection and CSV fetch
    - Test fallback mode with warning logged
    - Test error handling with troubleshooting guidance
    - Test that hardcoded SHEET_GID is removed
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8. Add environment variable configuration
  - [x] 8.1 Update environment variable handling
    - Add GOOGLE_SHEETS_API_KEY to .env.example
    - Add GOOGLE_SHEETS_CACHE_TTL_HOURS to .env.example (optional)
    - Add validation for required environment variables
    - Add clear error messages for missing configuration
    - Update documentation with setup instructions
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  
  - [x] 8.2 Write unit tests for configuration error handling
    - Test missing GOOGLE_SHEETS_API_KEY → CONFIG_ERROR
    - Test missing SHEET_ID → CONFIG_ERROR
    - Test custom GOOGLE_SHEETS_CACHE_TTL_HOURS
    - _Requirements: 1.5, 9.2, 9.5_


- [ ] 9. Add comprehensive error handling and logging
  - [x] 9.1 Implement TabDetectionError class
    - Create custom error class with error codes
    - Add error codes: API_ERROR, CONFIG_ERROR, PARSE_ERROR, NO_TABS_FOUND
    - Include details field for debugging information
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 9.2 Add structured logging throughout system
    - Add INFO logs for successful detection
    - Add WARN logs for fallback mode
    - Add ERROR logs for failures
    - Include timestamps, component names, and relevant details
    - Log all detection attempts with selected tab info
    - _Requirements: 8.1, 8.2, 8.4, 8.5_
  
  - [ ] 9.3 Write unit tests for error handling
    - Test TabDetectionError creation with all error codes
    - Test error messages include troubleshooting guidance
    - Test logging output format and content
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 10. Final checkpoint - Integration testing and validation
  - [ ] 10.1 Test end-to-end flow with real Google Sheets
    - Set up test spreadsheet with multiple tabs
    - Test current month detection
    - Test fallback scenarios
    - Test cache behavior
    - Verify logging output
    - _Requirements: All requirements_
  
  - [ ] 10.2 Verify all requirements are met
    - Review requirements document
    - Confirm all acceptance criteria are satisfied
    - Check that all properties are tested
    - Validate error handling coverage
    - _Requirements: All requirements_
  
  - [ ] 10.3 Update documentation
    - Add setup instructions to README or docs
    - Document environment variables
    - Add troubleshooting guide
    - Include example tab naming conventions
    - _Requirements: 9.1, 9.2, 9.5_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- Bottom-up implementation: utilities first, then orchestration, then integration
- All components use TypeScript with strict type checking
- Error handling is comprehensive with clear troubleshooting guidance
- Logging is structured for easy debugging and monitoring
- Cache implementation is in-memory for simplicity and performance
- Google Sheets API v4 is used for tab metadata retrieval
- Exponential backoff protects against rate limiting
- Fallback logic ensures system continues working even when current month tab isn't found

## Testing Summary

**Property-Based Tests (15 properties):**
- Property 1: Tab metadata extraction completeness
- Property 2: Date format parsing with confidence scoring
- Property 3: Non-date tab names return null
- Property 4: Current month tab selection
- Property 5: Highest confidence selection with tiebreaker
- Property 6: Fallback to most recent dated tab
- Property 7: Fallback to rightmost tab
- Property 8: Cache hit avoids API call
- Property 9: Cache expiration after TTL
- Property 10: Cache invalidation on month change
- Property 11: Error results not cached
- Property 12: CSV URL construction with detected GID
- Property 13: Error response with troubleshooting guidance
- Property 14: Exponential backoff on rate limiting
- Property 15: Fallback response includes warning

**Unit Tests:**
- Specific date format examples
- API error handling scenarios
- Cache behavior edge cases
- Tab selection logic
- Configuration error handling
- Logging verification
- Integration with Workouts API

**Coverage Goals:**
- Line coverage: >90%
- Branch coverage: >85%
- Function coverage: 100%
- Property test iterations: 100 per property
