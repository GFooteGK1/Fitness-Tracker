# Requirements Document

## Introduction

This document defines the requirements for integrating WHOOP wearable data into SociusFit. WHOOP provides recovery, strain, sleep, and workout metrics that will enhance SociusFit's holistic fitness insights by correlating physiological data with existing workout and nutrition tracking.

## Glossary

- **WHOOP_Integration_Service**: The backend service responsible for OAuth authentication, token management, and data synchronization with the WHOOP API
- **Recovery_Score**: A WHOOP metric (0-100%) indicating readiness for strain based on HRV, resting heart rate, and sleep
- **Strain_Score**: A WHOOP metric (0-21 scale) measuring cardiovascular load accumulated throughout the day
- **Sleep_Performance**: A WHOOP metric (0-100%) indicating sleep quality relative to sleep need
- **HRV**: Heart Rate Variability measured in milliseconds (hrv_rmssd_milli), a key recovery indicator
- **Cycle**: A WHOOP day cycle containing strain, recovery, and sleep data
- **WHOOP_Token_Store**: Secure storage for OAuth access and refresh tokens per user
- **Sync_Service**: Background service that periodically fetches and stores WHOOP data
- **Cross_Domain_Analyzer**: AI service that correlates WHOOP data with workouts and nutrition

## Requirements

### Requirement 1: OAuth Connection Flow

**User Story:** As a user, I want to connect my WHOOP account to SociusFit, so that my recovery and strain data can be imported automatically.

#### Acceptance Criteria

1. WHEN a user initiates WHOOP connection, THE WHOOP_Integration_Service SHALL redirect to WHOOP OAuth authorization URL with required scopes
2. WHEN WHOOP returns an authorization code, THE WHOOP_Integration_Service SHALL exchange it for access and refresh tokens
3. WHEN tokens are received, THE WHOOP_Token_Store SHALL securely store encrypted tokens associated with the user
4. IF the OAuth flow fails, THEN THE WHOOP_Integration_Service SHALL return a descriptive error and redirect user to settings with error message
5. WHEN a user disconnects WHOOP, THE WHOOP_Token_Store SHALL delete all stored tokens and THE Sync_Service SHALL stop syncing for that user

### Requirement 2: Token Management

**User Story:** As a system, I want to manage WHOOP OAuth tokens securely, so that user data access remains valid and secure.

#### Acceptance Criteria

1. THE WHOOP_Token_Store SHALL encrypt access and refresh tokens before database storage
2. WHEN an access token expires, THE WHOOP_Integration_Service SHALL use the refresh token to obtain a new access token
3. IF token refresh fails, THEN THE WHOOP_Integration_Service SHALL mark the connection as invalid and notify the user
4. THE WHOOP_Token_Store SHALL store token expiration timestamps to enable proactive refresh
5. WHEN tokens are refreshed, THE WHOOP_Token_Store SHALL update stored tokens atomically

### Requirement 3: Data Synchronization

**User Story:** As a user, I want my WHOOP data to sync automatically, so that I always have up-to-date recovery and strain information.

#### Acceptance Criteria

1. WHEN a user first connects WHOOP, THE Sync_Service SHALL fetch the last 7 days of historical data
2. THE Sync_Service SHALL sync new WHOOP data at least every 4 hours for active users
3. WHEN syncing recovery data, THE Sync_Service SHALL store recovery_score, hrv_rmssd_milli, resting_heart_rate, spo2_percentage, and skin_temp_celsius
4. WHEN syncing sleep data, THE Sync_Service SHALL store sleep_performance_percentage, sleep_consistency_percentage, sleep_efficiency_percentage, and respiratory_rate
5. WHEN syncing cycle data, THE Sync_Service SHALL store strain score, kilojoules, average_heart_rate, and max_heart_rate
6. WHEN syncing workout data, THE Sync_Service SHALL store sport_name, strain, heart rate data, and distance_meter
7. IF a sync fails, THEN THE Sync_Service SHALL retry with exponential backoff up to 3 times

### Requirement 4: WHOOP Data Storage

**User Story:** As a system, I want to store WHOOP data efficiently, so that it can be queried for insights and displayed on the dashboard.

#### Acceptance Criteria

1. THE Database SHALL store WHOOP recovery records with user_id, date, and all recovery metrics
2. THE Database SHALL store WHOOP sleep records with user_id, date, and all sleep metrics
3. THE Database SHALL store WHOOP cycle records with user_id, date, and all strain metrics
4. THE Database SHALL store WHOOP workout records linked to user_id with sport type and performance metrics
5. THE Database SHALL enforce row-level security so users can only access their own WHOOP data
6. THE Database SHALL index WHOOP tables by user_id and date for efficient querying

### Requirement 5: Dashboard Display

**User Story:** As a user, I want to see my WHOOP metrics on the dashboard, so that I can understand my recovery and strain at a glance.

#### Acceptance Criteria

1. WHEN a user has connected WHOOP, THE Dashboard SHALL display today's recovery score with color coding (green >66%, yellow 34-66%, red <34%)
2. WHEN a user has connected WHOOP, THE Dashboard SHALL display today's strain score
3. WHEN a user has connected WHOOP, THE Dashboard SHALL display last night's sleep performance percentage
4. WHEN WHOOP data is not available for today, THE Dashboard SHALL display the most recent available data with timestamp
5. IF a user has not connected WHOOP, THEN THE Dashboard SHALL display a prompt to connect WHOOP
6. WHEN displaying WHOOP metrics, THE Dashboard SHALL show loading states during data fetch

### Requirement 6: Cross-Domain AI Insights

**User Story:** As a user, I want AI-powered insights that correlate my WHOOP data with workouts and nutrition, so that I can optimize my training and recovery.

#### Acceptance Criteria

1. WHEN generating insights, THE Cross_Domain_Analyzer SHALL correlate recovery scores with workout performance (RPE, energy levels)
2. WHEN generating insights, THE Cross_Domain_Analyzer SHALL correlate sleep quality with next-day workout performance
3. WHEN generating insights, THE Cross_Domain_Analyzer SHALL correlate strain accumulation with nutrition intake
4. WHEN recovery score is below 34%, THE Cross_Domain_Analyzer SHALL recommend reduced training intensity
5. WHEN sleep performance is below 70%, THE Cross_Domain_Analyzer SHALL suggest recovery-focused activities
6. THE Cross_Domain_Analyzer SHALL include WHOOP data context when answering user queries about performance

### Requirement 7: Settings and Connection Management

**User Story:** As a user, I want to manage my WHOOP connection from settings, so that I can connect, view status, or disconnect as needed.

#### Acceptance Criteria

1. THE Settings_Page SHALL display WHOOP connection status (connected/disconnected)
2. WHEN connected, THE Settings_Page SHALL display last sync timestamp and connection health
3. THE Settings_Page SHALL provide a button to initiate WHOOP connection when disconnected
4. THE Settings_Page SHALL provide a button to disconnect WHOOP with confirmation dialog
5. WHEN disconnecting, THE Settings_Page SHALL inform user that historical WHOOP data will be retained
6. IF connection is unhealthy, THEN THE Settings_Page SHALL display reconnection option

### Requirement 8: Error Handling and Resilience

**User Story:** As a system, I want robust error handling for WHOOP integration, so that failures are graceful and recoverable.

#### Acceptance Criteria

1. IF WHOOP API returns rate limit error, THEN THE Sync_Service SHALL implement backoff and retry
2. IF WHOOP API is unavailable, THEN THE Dashboard SHALL display cached data with staleness indicator
3. WHEN API errors occur, THE WHOOP_Integration_Service SHALL log errors with context for debugging
4. IF user's WHOOP subscription lapses, THEN THE Sync_Service SHALL handle reduced data availability gracefully
5. THE WHOOP_Integration_Service SHALL validate all API responses before storage
