# Requirements Document: Dynamic Sheet Tab Detection

## Introduction

The Dynamic Sheet Tab Detection feature enables automatic identification of the correct Google Sheets tab containing the current month's programming. Coaches add a new tab each month to their programming spreadsheet, and the system must intelligently detect which tab to display without manual configuration. This eliminates the need for coaches or developers to update the hardcoded SHEET_GID value when a new month begins.

## Glossary

- **Sheet**: The entire Google Sheets document containing all programming tabs
- **Tab**: An individual worksheet within the Google Sheets document (also called "sheet" in Google Sheets API terminology)
- **Tab_GID**: The unique identifier for a specific tab within a Google Sheet
- **Tab_Detector**: The system component responsible for identifying the correct tab
- **Tab_Name_Parser**: The component that extracts date information from tab names
- **Tab_Cache**: Temporary storage of the detected tab GID to minimize API calls
- **Workouts_API**: The /api/workouts endpoint that fetches daily programming
- **Current_Month**: The month corresponding to the server's current date
- **Fallback_Tab**: The rightmost (most recently added) tab used when current month detection fails
- **Google_Sheets_API**: The Google Sheets API v4 used to access sheet metadata
- **Detection_Confidence**: A score indicating how certain the system is about tab selection
- **GOOGLE_SHEETS_CSV_URL**: Environment variable containing the current CSV export URL (to be deprecated)

## Requirements

### Requirement 1: Tab Discovery

**User Story:** As a developer, I want the system to automatically discover all available tabs in the programming sheet, so that the hardcoded SHEET_GID can be replaced with dynamic detection.

#### Acceptance Criteria

1. WHEN the Workouts_API is called, THE Tab_Detector SHALL retrieve the list of all tabs from the Sheet using Google Sheets API v4
2. WHEN the Google_Sheets_API is unavailable, THE Tab_Detector SHALL return a descriptive error message
3. THE Tab_Detector SHALL extract tab name, Tab_GID, and tab index for each tab
4. THE Tab_Detector SHALL handle sheets with up to 50 tabs without performance degradation
5. WHEN the spreadsheet ID cannot be extracted from environment variables, THE Tab_Detector SHALL return a configuration error

### Requirement 2: Tab Name Parsing

**User Story:** As a coach, I want to name my monthly tabs in whatever format makes sense to me, so that I can maintain my existing naming conventions without breaking the system.

#### Acceptance Criteria

1. WHEN a tab name contains a month name (full or abbreviated) and a year, THE Tab_Name_Parser SHALL extract the month and year
2. WHEN a tab name contains a date in ISO format (YYYY-MM), THE Tab_Name_Parser SHALL extract the month and year
3. WHEN a tab name contains a date in US format (MM/YYYY or MM-YYYY), THE Tab_Name_Parser SHALL extract the month and year
4. WHEN a tab name contains only a month name without a year, THE Tab_Name_Parser SHALL assume the current year
5. WHEN a tab name contains ambiguous date information, THE Tab_Name_Parser SHALL return a low Detection_Confidence score
6. THE Tab_Name_Parser SHALL recognize month names in English (full and 3-letter abbreviations)
7. WHEN a tab name contains no recognizable date information, THE Tab_Name_Parser SHALL return null for the parsed date

### Requirement 3: Current Month Tab Selection

**User Story:** As a user, I want to see the programming for the current month automatically, so that I always have the most relevant workout plan displayed.

#### Acceptance Criteria

1. WHEN multiple tabs are available, THE Tab_Detector SHALL select the tab matching the Current_Month
2. WHEN determining the Current_Month, THE Tab_Detector SHALL use the server's current date
3. WHEN multiple tabs match the Current_Month, THE Tab_Detector SHALL select the tab with the highest Detection_Confidence score
4. IF multiple tabs have equal confidence scores, THEN THE Tab_Detector SHALL select the tab with the highest index (rightmost tab)
5. WHEN no tab matches the Current_Month, THE Tab_Detector SHALL select the Fallback_Tab

### Requirement 4: Fallback Tab Selection

**User Story:** As a user, I want to see the most recent programming when the current month's tab isn't found, so that I still have access to relevant workouts even if tab naming is inconsistent.

#### Acceptance Criteria

1. WHEN no tab matches the Current_Month, THE Tab_Detector SHALL identify the Fallback_Tab as the most recently dated tab
2. WHEN no tabs contain recognizable dates, THE Tab_Detector SHALL select the rightmost tab as the Fallback_Tab
3. WHEN selecting the Fallback_Tab, THE Tab_Detector SHALL log a warning indicating fallback mode was used
4. THE Tab_Detector SHALL include fallback status in the response to enable user notification

### Requirement 5: Tab Detection Caching

**User Story:** As a system administrator, I want tab detection results to be cached appropriately, so that we minimize API calls and stay within Google Sheets API quotas.

#### Acceptance Criteria

1. WHEN a tab is successfully detected, THE Tab_Cache SHALL store the Tab_GID, tab name, and detection timestamp
2. THE Tab_Cache SHALL expire cached results after 4 hours
3. WHEN the cached tab is still valid (within 4 hours), THE Tab_Detector SHALL return the cached Tab_GID without calling the Google_Sheets_API
4. WHEN the date changes to a new month, THE Tab_Cache SHALL invalidate all cached results
5. WHEN a detection error occurs, THE Tab_Detector SHALL not cache the error result
6. THE Tab_Cache SHALL be stored in memory (not database) for fast access

### Requirement 6: Workouts API Integration

**User Story:** As a user, I want the /api/workouts endpoint to automatically use the correct month's tab, so that I can view my workouts without manual configuration.

#### Acceptance Criteria

1. WHEN the Workouts_API is called, THE Workouts_API SHALL call the Tab_Detector to identify the correct Tab_GID
2. WHEN the Tab_Detector returns a Tab_GID, THE Workouts_API SHALL use that GID to construct the CSV export URL
3. WHEN the Tab_Detector returns a fallback tab, THE Workouts_API SHALL log a warning but proceed with the fallback Tab_GID
4. WHEN tab detection fails, THE Workouts_API SHALL return an error message with troubleshooting guidance
5. THE Workouts_API SHALL remove the hardcoded SHEET_GID constant and use dynamic detection exclusively

### Requirement 7: Google Sheets API Integration

**User Story:** As a developer, I want to use the Google Sheets API to access tab metadata, so that I can retrieve tab information beyond what CSV export provides.

#### Acceptance Criteria

1. THE Tab_Detector SHALL use Google Sheets API v4 to retrieve spreadsheet metadata
2. WHEN authenticating with the Google_Sheets_API, THE Tab_Detector SHALL use API key authentication for read-only access
3. THE Tab_Detector SHALL extract the spreadsheet ID from the existing hardcoded SHEET_ID constant
4. WHEN the API key is missing or invalid, THE Tab_Detector SHALL return a configuration error
5. THE Tab_Detector SHALL handle API rate limiting by implementing exponential backoff with maximum 3 retries
6. THE Tab_Detector SHALL use the spreadsheets.get endpoint with fields parameter to minimize response size

### Requirement 8: Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can debug tab detection issues when they occur.

#### Acceptance Criteria

1. WHEN tab detection fails due to API errors, THE Tab_Detector SHALL log the error with timestamp and error details
2. WHEN no tabs contain recognizable dates, THE Tab_Detector SHALL log a warning and return the Fallback_Tab
3. WHEN the spreadsheet is not publicly accessible, THE Tab_Detector SHALL return a permissions error with instructions
4. WHEN multiple tabs match the current month with equal confidence, THE Tab_Detector SHALL log which tab was selected and why
5. THE Tab_Detector SHALL log all detection attempts with timestamps, selected tab name, Tab_GID, and confidence scores for debugging
6. WHEN using the Fallback_Tab, THE Workouts_API SHALL include a warning field in the response indicating fallback mode was used

### Requirement 9: Configuration and Environment Variables

**User Story:** As a system administrator, I want to configure the Google Sheets integration through environment variables, so that I can manage API credentials securely.

#### Acceptance Criteria

1. THE Tab_Detector SHALL read the API key from a new GOOGLE_SHEETS_API_KEY environment variable
2. WHEN GOOGLE_SHEETS_API_KEY is not set, THE Tab_Detector SHALL return a configuration error with setup instructions
3. THE Tab_Detector SHALL support an optional GOOGLE_SHEETS_CACHE_TTL_HOURS environment variable to override the default 4-hour cache duration
4. THE Tab_Detector SHALL use the existing hardcoded SHEET_ID constant for the spreadsheet ID
5. WHEN environment variables are missing, THE Tab_Detector SHALL provide clear error messages indicating which variables are required

### Requirement 10: Tab Name Pattern Recognition

**User Story:** As a system, I want to recognize common tab naming patterns with high confidence, so that I can accurately detect the correct month's programming across different coaching styles.

#### Acceptance Criteria

1. THE Tab_Name_Parser SHALL assign a confidence score of 1.0 for tab names matching "Month YYYY" format (e.g., "January 2026")
2. THE Tab_Name_Parser SHALL assign a confidence score of 0.95 for tab names matching "Mon YYYY" format (e.g., "Jan 2026")
3. THE Tab_Name_Parser SHALL assign a confidence score of 0.9 for tab names matching "YYYY-MM" format (e.g., "2026-01")
4. THE Tab_Name_Parser SHALL assign a confidence score of 0.85 for tab names matching "MM/YYYY" format (e.g., "01/2026")
5. THE Tab_Name_Parser SHALL assign a confidence score of 0.7 for tab names containing only a month name (e.g., "January")
6. THE Tab_Name_Parser SHALL assign a confidence score of 0.5 for tab names with ambiguous patterns (e.g., "Week 1-4")
7. THE Tab_Name_Parser SHALL assign a confidence score of 0.0 for tab names with no recognizable date information

