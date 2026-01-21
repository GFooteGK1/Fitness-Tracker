# Requirements Document

## Introduction

The Holistic Query System enables users to ask natural language questions about their fitness data and receive intelligent, contextual responses that span both workout and nutrition domains. The system uses an intent-based router to classify queries, fetch only relevant data, and apply domain-specific prompts for accurate, insightful answers. This replaces the current workout-only query system with a unified approach that supports cross-domain fitness insights.

## Glossary

- **Query_Router**: The component that classifies user questions by intent and determines which data domains are relevant
- **Intent_Classifier**: The AI-powered module that analyzes user questions to determine query type (workout, nutrition, or cross-domain)
- **Domain_Fetcher**: The data retrieval component that fetches relevant records from specific database tables based on classified intent
- **Response_Generator**: The AI component that synthesizes fetched data into conversational answers using domain-specific prompts
- **Cross_Domain_Analyzer**: The specialized component that correlates workout and nutrition data to identify patterns and insights
- **Query_Context**: The assembled data payload containing user profile, relevant workouts, meals, and targets based on intent
- **Workout_Domain**: Data scope including workouts, block_scores, and benchmark_prs tables
- **Nutrition_Domain**: Data scope including meals, daily_targets, and daily_summaries
- **Holistic_Domain**: Combined scope spanning both workout and nutrition data for cross-domain analysis

## Requirements

### Requirement 1: Intent Classification

**User Story:** As a user, I want my questions to be automatically understood so that the system fetches only relevant data and provides focused answers.

#### Acceptance Criteria

1. WHEN a user submits a question, THE Intent_Classifier SHALL categorize it as one of: WORKOUT_ONLY, NUTRITION_ONLY, or CROSS_DOMAIN within 500ms
2. WHEN a question contains workout-related keywords (e.g., "deadlift", "AMRAP", "PR", "reps", "sets"), THE Intent_Classifier SHALL include WORKOUT_ONLY or CROSS_DOMAIN in the classification
3. WHEN a question contains nutrition-related keywords (e.g., "protein", "calories", "meal", "eating", "macros"), THE Intent_Classifier SHALL include NUTRITION_ONLY or CROSS_DOMAIN in the classification
4. WHEN a question references both domains or asks about correlations (e.g., "how does my diet affect my lifts"), THE Intent_Classifier SHALL classify it as CROSS_DOMAIN
5. IF the Intent_Classifier cannot determine intent with confidence, THEN THE Query_Router SHALL default to CROSS_DOMAIN to ensure comprehensive data availability

### Requirement 2: Domain-Specific Data Fetching

**User Story:** As a user, I want the system to efficiently retrieve only the data needed to answer my question so that responses are fast and relevant.

#### Acceptance Criteria

1. WHEN intent is classified as WORKOUT_ONLY, THE Domain_Fetcher SHALL retrieve only workouts, block_scores, and benchmark_prs for the user
2. WHEN intent is classified as NUTRITION_ONLY, THE Domain_Fetcher SHALL retrieve only meals, daily_targets, and daily nutrition summaries for the user
3. WHEN intent is classified as CROSS_DOMAIN, THE Domain_Fetcher SHALL retrieve data from both workout and nutrition domains
4. THE Domain_Fetcher SHALL respect the user's authentication and only fetch data belonging to the authenticated user
5. THE Domain_Fetcher SHALL limit data retrieval to a configurable time window (default: 6 months) to manage context size
6. WHEN fetching workout data, THE Domain_Fetcher SHALL include workout_date, input_text, primary_score, blocks, rpe, and tags
7. WHEN fetching nutrition data, THE Domain_Fetcher SHALL include meal_timestamp, meal_name, total_protein, total_carbs, total_fat, total_calories, and meal_timing

### Requirement 3: Workout Query Processing

**User Story:** As a user, I want to ask questions about my workout history and receive accurate, detailed answers about my training.

#### Acceptance Criteria

1. WHEN processing a WORKOUT_ONLY query, THE Response_Generator SHALL use a workout-specialized system prompt
2. THE Response_Generator SHALL parse workout input_text to identify movements, weights, rep schemes, and workout types
3. THE Response_Generator SHALL reference benchmark_prs when questions involve personal records or named workouts
4. THE Response_Generator SHALL provide human-readable dates and relative time context in responses
5. WHEN a specific workout or PR is found, THE Response_Generator SHALL quote relevant details from the data

### Requirement 4: Nutrition Query Processing

**User Story:** As a user, I want to ask questions about my eating habits and receive insights about my nutrition patterns.

#### Acceptance Criteria

1. WHEN processing a NUTRITION_ONLY query, THE Response_Generator SHALL use a nutrition-specialized system prompt
2. THE Response_Generator SHALL calculate daily and weekly macro averages when relevant to the question
3. THE Response_Generator SHALL compare actual intake against daily_targets when questions involve adherence or goals
4. THE Response_Generator SHALL identify meal timing patterns (pre-workout, post-workout) when relevant
5. WHEN analyzing nutrition trends, THE Response_Generator SHALL consider at least 7 days of data for pattern recognition

### Requirement 5: Cross-Domain Correlation Analysis

**User Story:** As a user, I want to understand how my nutrition affects my workout performance so that I can optimize both.

#### Acceptance Criteria

1. WHEN processing a CROSS_DOMAIN query, THE Cross_Domain_Analyzer SHALL correlate workout performance with nutrition data from surrounding days
2. THE Cross_Domain_Analyzer SHALL identify patterns between pre-workout nutrition and workout performance metrics
3. THE Cross_Domain_Analyzer SHALL compare nutrition on rest days versus training days when relevant
4. THE Cross_Domain_Analyzer SHALL analyze protein intake relative to strength training volume
5. WHEN correlations are identified, THE Response_Generator SHALL explain the relationship in actionable terms
6. THE Cross_Domain_Analyzer SHALL consider meal_timing data to correlate specific meals with workout proximity

### Requirement 6: Response Quality and Format

**User Story:** As a user, I want clear, conversational responses that directly answer my questions with supporting evidence from my data.

#### Acceptance Criteria

1. THE Response_Generator SHALL provide conversational, human-readable responses
2. THE Response_Generator SHALL include specific dates, values, and quotes from data when answering questions
3. IF the requested information is not found in the data, THEN THE Response_Generator SHALL explain what was searched and suggest alternative queries
4. THE Response_Generator SHALL limit responses to relevant information without excessive preamble
5. WHEN providing recommendations, THE Response_Generator SHALL base them on patterns observed in the user's actual data

### Requirement 7: Error Handling and Edge Cases

**User Story:** As a user, I want the system to handle unusual situations gracefully so that I always receive a helpful response.

#### Acceptance Criteria

1. IF no data exists for the classified domain, THEN THE Query_Router SHALL inform the user and suggest logging relevant data
2. IF the question is ambiguous, THEN THE Response_Generator SHALL ask a clarifying question or provide answers for multiple interpretations
3. IF the API call to the AI provider fails, THEN THE Query_Router SHALL return a user-friendly error message with retry guidance
4. THE Query_Router SHALL validate that the user is authenticated before processing any query
5. IF the question is outside the fitness/nutrition domain, THEN THE Response_Generator SHALL politely redirect to supported query types
