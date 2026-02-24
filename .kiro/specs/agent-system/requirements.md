# Requirements Document

## Introduction

SociusFit currently operates as a collection of separate tools — workout logging, meal tracking, WHOOP integration, and a query system — each with its own UI and API endpoints. This feature transforms SociusFit into a unified conversational experience powered by a multi-agent system. A fast Classifier routes user input (text, voice, photo, file) to specialized agents — Trainer, Nutritionist, and Socius — each with distinct expertise and personality. The architecture follows a passive-context approach where each agent receives full relevant context in its system prompt rather than fetching it on demand. The new system lives at `/v2` and coexists with the existing dashboard, ensuring zero disruption to current functionality.

## Glossary

- **Classifier**: A lightweight LLM component (Claude Haiku) that analyzes user input and determines which domain agent(s) should handle it
- **Trainer**: A domain agent specialized in workout parsing, PR detection, and coaching commentary
- **Nutritionist**: A domain agent specialized in meal analysis, macro tracking, and nutrition guidance
- **Socius**: A cross-domain agent that detects patterns and correlations across workouts, nutrition, and WHOOP recovery data
- **Passive_Context**: Pre-built context data embedded in agent system prompts rather than retrieved on demand
- **Context_Builder**: A module that assembles domain-specific context (recent workouts, daily macros, WHOOP metrics) for injection into agent prompts
- **Chat_Message**: A persisted record of a single message in the conversation, attributed to a specific role (user, trainer, nutritionist, socius, system)
- **Insight**: A pattern or correlation detected by Socius, stored with priority level and confidence score
- **Pattern_ID**: A short identifier for a known cross-domain pattern (e.g., CAL_DEF, OVER_TRN, NUT_PERF, REC_VOL, PRO_REC)
- **Input_Type**: The classification of user input as one of: workout_log, meal_log, question, mixed, unclear
- **Domain**: One of the routing targets: trainer, nutritionist, socius
- **Confidence_Score**: A numeric value (0.0–1.0) indicating how certain the Classifier or an agent is about its output
- **Smart_Default**: A reasonable assumption applied when user input is incomplete (e.g., estimating RPE, using last session's weight, applying standard portion sizes)
- **Agent_Router**: The server-side orchestration logic that receives the Classifier output and dispatches to the appropriate agent(s)
- **Chat_Persistence_Layer**: The database tables and API logic responsible for storing and retrieving conversation history
- **Chat_Compaction**: A process that summarizes older conversation messages into condensed summaries to keep the context window efficient
- **Weekly_Adherence**: The week-to-date and end-of-week macro adherence tracking that compares actual intake against prorated daily targets
- **V2_UI**: The new single-page chat-based interface at `/v2`

## Requirements

### Requirement 1: Input Classification

**User Story:** As a user, I want my input (text, voice transcription, photo, or file) to be automatically understood and routed to the right agent, so that I don't have to manually choose which feature to use.

#### Acceptance Criteria

1. WHEN a user submits input through the V2_UI, THE Classifier SHALL analyze the input and return a structured JSON classification containing input_type, target domains, confidence_score, and extracted context within 2 seconds
2. WHEN the Classifier determines a single domain with confidence_score above 0.7, THE Agent_Router SHALL route the input to that single domain agent
3. WHEN the Classifier determines multiple domains are relevant, THE Agent_Router SHALL execute a sequential pipeline sending the input to each relevant agent in order
4. WHEN the Classifier returns a confidence_score below 0.5, THE Agent_Router SHALL ask the user a clarifying question before routing
5. WHEN the input contains a photo, THE Classifier SHALL determine whether the photo depicts a meal or a workout whiteboard and route accordingly
6. WHEN the input contains voice audio, THE Classifier SHALL first transcribe the audio using the existing transcription endpoint and then classify the resulting text
7. THE Classifier SHALL extract contextual metadata from the input including date references, meal_timing indicators, presence of portions, presence of scores, and benchmark names

### Requirement 2: Trainer Agent

**User Story:** As a user, I want to log workouts through natural conversation and receive coaching feedback, so that tracking feels like talking to a knowledgeable training partner.

#### Acceptance Criteria

1. WHEN the Trainer receives workout text input, THE Trainer SHALL parse it into structured workout blocks (AMRAP, FOR_TIME, EMOM, STRENGTH, CARDIO) with movements, reps, weights, and scores
2. WHEN the Trainer parses a workout, THE Trainer SHALL return a confidence_score indicating parse reliability
3. WHEN the parsed workout contains a benchmark workout (e.g., Fran, Murph, Grace), THE Trainer SHALL check the user's benchmark_prs table and detect whether the score is a new PR
4. WHEN a new PR is detected, THE Trainer SHALL include a congratulatory coaching comment and record the PR in the benchmark_prs table
5. WHEN the workout input is missing RPE, THE Trainer SHALL estimate RPE based on workout intensity and flag the estimate as a Smart_Default
6. WHEN the workout input is missing weight for a movement, THE Trainer SHALL look up the user's most recent session with that movement and apply the previous weight as a Smart_Default
7. WHEN the Trainer applies any Smart_Default, THE Trainer SHALL clearly indicate the assumed value in its response and allow the user to correct it
8. WHEN the Trainer receives a workout question (e.g., "What was my last Fran time?"), THE Trainer SHALL query the user's workout history and respond conversationally
9. THE Trainer SHALL persist the parsed workout to the workouts and block_scores tables upon successful parsing

### Requirement 3: Nutritionist Agent

**User Story:** As a user, I want to log meals through photos or text and get immediate macro feedback relative to my daily targets, so that I can make informed food choices throughout the day.

#### Acceptance Criteria

1. WHEN the Nutritionist receives a meal photo, THE Nutritionist SHALL analyze the image using Claude Vision and return identified food items with estimated macros (protein, carbs, fat, calories)
2. WHEN the Nutritionist receives text describing a meal, THE Nutritionist SHALL parse the food items and estimate macros based on the descriptions
3. WHEN the meal input lacks specific portion sizes, THE Nutritionist SHALL apply standard portion Smart_Defaults and flag them in the response
4. WHEN the Nutritionist logs a meal, THE Nutritionist SHALL calculate the user's remaining daily macro budget (target minus consumed) and include it in the response
5. WHEN the Nutritionist logs a meal, THE Nutritionist SHALL validate macros using the existing macro-validation logic (range checks and calorie consistency within 10%)
6. WHEN macro validation fails, THE Nutritionist SHALL flag the inconsistency to the user and suggest corrections
7. WHEN the Nutritionist receives a nutrition question (e.g., "How much protein have I had today?"), THE Nutritionist SHALL query the user's meal history and daily targets and respond conversationally
8. THE Nutritionist SHALL persist the analyzed meal to the meals table upon successful analysis
9. WHEN the meal_timing is not specified, THE Nutritionist SHALL infer it from the current time of day and proximity to logged workouts
10. WHEN the Nutritionist logs a meal, THE Nutritionist SHALL include the user's week-to-date cumulative adherence status (actual vs prorated targets for protein, carbs, fat, calories) in its response
11. WHEN the user's week-to-date adherence is within tolerance, THE Nutritionist SHALL provide brief reinforcing feedback acknowledging consistency
12. WHEN the user's week-to-date adherence shows a significant deviation (outside tolerance), THE Nutritionist SHALL review the broader weekly picture and provide constructive feedback focused on getting back on track rather than perfection
13. WHEN a full week of data is available, THE Nutritionist SHALL provide an end-of-week summary comparing total actual intake against weekly targets with an emphasis on overall consistency trends

### Requirement 4: Socius Cross-Domain Agent

**User Story:** As a user, I want to receive insights about how my training, nutrition, and recovery interact, so that I can optimize my overall fitness approach.

#### Acceptance Criteria

1. WHEN the Socius receives a cross-domain question, THE Socius SHALL query workout, nutrition, and WHOOP data and synthesize a response drawing from all relevant domains
2. WHEN a workout or meal is logged, THE Socius SHALL run an asynchronous background analysis checking for known patterns (CAL_DEF, OVER_TRN, NUT_PERF, REC_VOL, PRO_REC)
3. WHEN the Socius detects a pattern with confidence_score above 0.6, THE Socius SHALL create an Insight record with the appropriate priority level (urgent, notable, informational)
4. WHEN an urgent Insight is created, THE V2_UI SHALL display it as a banner notification on the user's next interaction
5. WHEN the Socius detects a caloric deficit pattern (CAL_DEF) on a high-strain training day, THE Socius SHALL classify the Insight as urgent priority
6. THE Socius SHALL store each detected Insight in the insights table with pattern_id, priority, confidence_score, content, and supporting data_context
7. WHEN the user asks about trends or correlations, THE Socius SHALL analyze data over the requested time period and present findings with supporting data points
8. WHEN the user asks for workout summaries, THE Socius SHALL aggregate workout data by block_type (metcon, strength, cardio) and report counts, frequency, and volume over the requested period
9. WHEN the user asks a vague or broad question (e.g., "How am I doing?"), THE Socius SHALL return a general high-level summary across all domains rather than asking for clarification

### Requirement 5: Passive Context System

**User Story:** As a user, I want agents to already know my recent activity and targets when I interact with them, so that I don't have to repeat context every time.

#### Acceptance Criteria

1. WHEN an agent is invoked, THE Context_Builder SHALL assemble domain-relevant context including recent history, user targets, and profile data
2. WHEN building Trainer context, THE Context_Builder SHALL include the last 7 days of workouts, recent PRs, and the user's profile
3. WHEN building Nutritionist context, THE Context_Builder SHALL include today's meals, daily macro targets, remaining budget, and the user's profile
4. WHEN building Socius context, THE Context_Builder SHALL include recent workouts, recent meals, WHOOP recovery and sleep data, and existing insights
5. THE Context_Builder SHALL inject the assembled context into the agent's system prompt before the LLM call
6. WHEN building context, THE Context_Builder SHALL execute database queries in parallel to minimize latency

### Requirement 6: Chat Persistence

**User Story:** As a user, I want my conversation history preserved so that I can scroll back through previous interactions and agents can reference earlier messages.

#### Acceptance Criteria

1. WHEN a user sends a message, THE Chat_Persistence_Layer SHALL store it in the chat_messages table with role, content, input_type, domain, and timestamp
2. WHEN an agent responds, THE Chat_Persistence_Layer SHALL store the response in the chat_messages table attributed to the responding agent's role
3. WHEN the V2_UI loads, THE Chat_Persistence_Layer SHALL retrieve the most recent conversation messages for display
4. THE chat_messages table SHALL enforce row-level security so that users can only access their own messages
5. WHEN a Chat_Message is associated with a created entity (workout or meal), THE Chat_Persistence_Layer SHALL store the related_entity_id and related_entity_type for cross-referencing
6. WHEN the conversation history for a user exceeds a configurable message threshold, THE Chat_Persistence_Layer SHALL compact older messages into condensed summaries to manage context window size
7. WHEN Chat_Compaction runs, THE Chat_Persistence_Layer SHALL preserve key facts (logged entities, PR records, important corrections) while discarding verbose conversational filler

### Requirement 7: Unified API Endpoint

**User Story:** As a developer, I want a single API endpoint that handles all agent interactions, so that the client has one consistent interface for the conversational system.

#### Acceptance Criteria

1. THE Agent_Router SHALL expose a single POST endpoint at `/api/agent/process` that accepts user input and returns agent responses
2. WHEN the endpoint receives a request, THE Agent_Router SHALL authenticate the user via Supabase Auth and reject unauthenticated requests with a 401 status
3. WHEN the endpoint receives a request, THE Agent_Router SHALL run the Classifier, build passive context, route to the appropriate agent(s), persist messages, and return the response
4. WHEN the endpoint processes a photo input, THE Agent_Router SHALL accept the photo as a base64-encoded string or a Supabase Storage URL
5. IF the Classifier or any agent call fails, THEN THE Agent_Router SHALL return a structured error response with an error code and user-friendly message
6. WHEN the endpoint processes a multi-domain request, THE Agent_Router SHALL return responses from each agent as separate attributed messages in a single response array

### Requirement 8: V2 Chat Interface

**User Story:** As a user, I want a mobile-first chat interface where I can interact with all fitness features through a single conversation, so that logging and querying feels natural and fast.

#### Acceptance Criteria

1. THE V2_UI SHALL render a single-page chat layout at the `/v2` route with a scrollable message area and a fixed input bar at the bottom
2. WHEN displaying agent messages, THE V2_UI SHALL visually distinguish each agent using unique icons and color accents (Trainer, Nutritionist, Socius)
3. THE V2_UI input bar SHALL provide buttons for text entry, voice recording, camera capture, and file upload
4. WHEN the user taps the camera button, THE V2_UI SHALL open the device camera in environment-facing mode and compress the captured image before sending
5. WHEN the user taps the voice button, THE V2_UI SHALL activate the Web Speech API for voice input and display a recording indicator
6. WHEN an agent response is pending, THE V2_UI SHALL display a typing indicator attributed to the expected agent
7. THE V2_UI SHALL include a bottom navigation bar with tabs for Chat, Insights, and PRs
8. WHEN the user navigates to the Insights tab, THE V2_UI SHALL display Socius insights sorted by priority and recency
9. WHEN the user navigates to the PRs tab, THE V2_UI SHALL display the user's benchmark PRs with historical progression
10. THE V2_UI SHALL render all interactive elements with a minimum touch target of 44×44 pixels and use a minimum 16px font size for inputs
11. WHEN an urgent Insight exists that has not been surfaced, THE V2_UI SHALL display it as a dismissible banner at the top of the chat view

### Requirement 9: Migration Safety

**User Story:** As a user, I want the existing dashboard and API endpoints to continue working unchanged while the new agent system is developed, so that I experience no disruption.

#### Acceptance Criteria

1. THE existing API endpoints (`/api/parse-workout`, `/api/meals/*`, `/api/query`, `/api/ocr-workout`, `/api/transcribe-audio`) SHALL continue to function without modification
2. THE existing dashboard at `/dashboard` SHALL remain accessible and fully functional
3. THE Agent_Router SHALL reuse existing library modules (macro-validation, adherence-calculator, imageUtils, auth) rather than reimplementing their logic
4. WHEN new database tables are added (chat_messages, insights), THE migration SHALL not alter or drop any existing tables
5. THE V2_UI at `/v2` SHALL coexist with the existing pages without affecting their routing or functionality

### Requirement 10: Phased Rollout

**User Story:** As a developer, I want to build the agent system incrementally in phases, so that each phase delivers working functionality and can be validated independently.

#### Acceptance Criteria

1. WHEN Phase 1 is complete, THE system SHALL have a working Classifier, the V2_UI chat interface, and routing that delegates to existing API endpoints as backend processors
2. WHEN Phase 2 is complete, THE system SHALL have fully functional Trainer and Nutritionist agents with custom prompts, passive context, and direct database persistence replacing the delegation to existing endpoints
3. WHEN Phase 3 is complete, THE system SHALL have the Socius agent with pattern detection, the insights table, background analysis after each log, and the Insights tab in the V2_UI
4. WHEN any phase is deployed, THE existing dashboard and API endpoints SHALL remain unaffected
