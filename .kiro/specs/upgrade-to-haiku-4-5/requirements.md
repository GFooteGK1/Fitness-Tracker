# Requirements Document

## Introduction

This document specifies requirements for upgrading all Claude AI models in the SociusFit application from outdated versions to the latest Haiku 4.5 model (claude-haiku-4-5-20251001). The upgrade affects the classifier, three specialized agents (Trainer, Nutritionist, Socius), and six legacy API routes. This upgrade will improve classification accuracy, reduce costs, increase speed, and fix the meal detection classification bug where obvious meal inputs incorrectly trigger clarification requests.

## Glossary

- **Classifier**: The AI component that determines user intent (workout, meal, query, unclear) from natural language input
- **Trainer_Agent**: The AI agent responsible for parsing workout text and photos into structured workout data
- **Nutritionist_Agent**: The AI agent responsible for analyzing meal photos and text into structured nutrition data
- **Socius_Agent**: The AI agent responsible for generating cross-domain fitness insights and answering holistic queries
- **Legacy_API_Routes**: The original API endpoints that directly call Claude without using the agent system
- **Model_Constant**: The string constant defining which Claude model version to use
- **Haiku_4_5**: The latest Claude model version (claude-haiku-4-5-20251001) released October 2025
- **Classification_Accuracy**: The percentage of user inputs correctly classified by the Classifier
- **Response_Quality**: The correctness, completeness, and usefulness of AI-generated responses

## Requirements

### Requirement 1: Upgrade Classifier Model

**User Story:** As a developer, I want the Classifier to use Haiku 4.5, so that classification accuracy improves and the meal detection bug is fixed.

#### Acceptance Criteria

1. THE Classifier SHALL use model constant 'claude-haiku-4-5-20251001'
2. WHEN a user submits obvious meal input, THE Classifier SHALL classify it as 'meal' without requesting clarification
3. THE Classifier SHALL maintain temperature 0 for deterministic classification
4. THE Classifier SHALL maintain max_tokens 256 for efficient classification
5. FOR ALL valid user inputs, upgrading the model then classifying SHALL produce results equivalent to or better than the previous model (preservation property)

### Requirement 2: Upgrade Trainer Agent Model

**User Story:** As a developer, I want the Trainer Agent to use Haiku 4.5, so that workout parsing is faster and more cost-effective while maintaining quality.

#### Acceptance Criteria

1. THE Trainer_Agent SHALL use model constant 'claude-haiku-4-5-20251001'
2. THE Trainer_Agent SHALL maintain temperature 0 for deterministic parsing
3. THE Trainer_Agent SHALL maintain max_tokens 4096 for complex workout parsing
4. WHEN parsing workout text, THE Trainer_Agent SHALL produce structured workout data matching the WorkoutParseResult schema
5. FOR ALL valid workout inputs, parsing with the new model SHALL produce equivalent or better structured data compared to the previous model (preservation property)

### Requirement 3: Upgrade Nutritionist Agent Model

**User Story:** As a developer, I want the Nutritionist Agent to use Haiku 4.5, so that meal analysis is faster and more cost-effective while maintaining accuracy.

#### Acceptance Criteria

1. THE Nutritionist_Agent SHALL use model constant 'claude-haiku-4-5-20251001'
2. THE Nutritionist_Agent SHALL maintain temperature 0 for deterministic analysis
3. THE Nutritionist_Agent SHALL maintain max_tokens 2048 for meal analysis
4. WHEN analyzing meal photos or text, THE Nutritionist_Agent SHALL produce structured meal data matching the MealAnalysisResult schema
5. FOR ALL valid meal inputs, analyzing with the new model SHALL produce macro estimates within acceptable validation ranges (preservation property)

### Requirement 4: Upgrade Socius Agent Model

**User Story:** As a developer, I want the Socius Agent to use Haiku 4.5, so that cross-domain insights are generated faster and more cost-effectively.

#### Acceptance Criteria

1. THE Socius_Agent SHALL use model constant 'claude-haiku-4-5-20251001'
2. THE Socius_Agent SHALL maintain temperature 0.7 for natural conversational responses
3. THE Socius_Agent SHALL maintain max_tokens 2000 for comprehensive insights
4. WHEN generating cross-domain insights, THE Socius_Agent SHALL reference workout, nutrition, and WHOOP data appropriately
5. FOR ALL valid queries, generating insights with the new model SHALL produce responses of equivalent or better quality compared to the previous model (preservation property)

### Requirement 5: Upgrade Legacy Parse Workout Route

**User Story:** As a developer, I want the parse-workout API route to use Haiku 4.5, so that legacy workout parsing remains functional during the agent migration.

#### Acceptance Criteria

1. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in parse-workout route
2. THE parse-workout route SHALL maintain temperature 0 for deterministic parsing
3. THE parse-workout route SHALL maintain max_tokens 4096 for complex workouts
4. WHEN receiving workout text, THE parse-workout route SHALL return structured workout blocks
5. FOR ALL valid workout inputs, parsing with the new model SHALL produce equivalent or better results compared to the previous model (preservation property)

### Requirement 6: Upgrade Legacy Meal Routes

**User Story:** As a developer, I want the meal API routes to use Haiku 4.5, so that legacy meal processing remains functional during the agent migration.

#### Acceptance Criteria

1. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in meals/upload route
2. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in meals/parse-text route
3. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in meals/refine route
4. THE meal routes SHALL maintain temperature 0 for deterministic analysis
5. THE meal routes SHALL maintain appropriate max_tokens for each route's purpose
6. FOR ALL valid meal inputs, analyzing with the new model SHALL produce macro estimates within acceptable validation ranges (preservation property)

### Requirement 7: Upgrade Legacy OCR Workout Route

**User Story:** As a developer, I want the ocr-workout API route to use Haiku 4.5, so that photo-based workout extraction improves in quality and speed.

#### Acceptance Criteria

1. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in ocr-workout route
2. THE ocr-workout route SHALL maintain temperature 0 for deterministic extraction
3. THE ocr-workout route SHALL maintain max_tokens 2000 for OCR text extraction
4. WHEN receiving workout photos, THE ocr-workout route SHALL extract text accurately
5. FOR ALL valid workout photos, extracting text with the new model SHALL produce equivalent or better results compared to the previous model (preservation property)

### Requirement 8: Upgrade Legacy Query Response Generator

**User Story:** As a developer, I want the query response generator to use Haiku 4.5, so that natural language query responses are faster and more cost-effective.

#### Acceptance Criteria

1. THE Legacy_API_Routes SHALL use model constant 'claude-haiku-4-5-20251001' in query/lib/response-generator
2. THE response generator SHALL maintain temperature 0.7 for natural responses
3. THE response generator SHALL maintain max_tokens 2000 for comprehensive answers
4. WHEN generating query responses, THE response generator SHALL reference appropriate fitness data
5. FOR ALL valid queries, generating responses with the new model SHALL produce answers of equivalent or better quality compared to the previous model (preservation property)

### Requirement 9: Preserve Existing Functionality

**User Story:** As a developer, I want all existing functionality to continue working after the upgrade, so that users experience no regressions.

#### Acceptance Criteria

1. WHEN the model upgrade is complete, THE Classifier SHALL correctly classify workout, meal, query, and unclear intents
2. WHEN the model upgrade is complete, THE Trainer_Agent SHALL parse workouts into valid structured data
3. WHEN the model upgrade is complete, THE Nutritionist_Agent SHALL analyze meals into valid structured data
4. WHEN the model upgrade is complete, THE Socius_Agent SHALL generate coherent cross-domain insights
5. WHEN the model upgrade is complete, THE Legacy_API_Routes SHALL continue to function for backward compatibility
6. FOR ALL existing test cases, running tests after the upgrade SHALL produce passing results (idempotence property)

### Requirement 10: Update Documentation

**User Story:** As a developer, I want documentation to reflect the new model version, so that future developers understand the current system state.

#### Acceptance Criteria

1. THE documentation SHALL reference 'claude-haiku-4-5-20251001' as the current model
2. THE AGENTS.md file SHALL list Haiku 4.5 as the AI model version
3. THE project-overview.md steering file SHALL list Haiku 4.5 as the AI model version
4. THE agent-system.md steering file SHALL list Haiku 4.5 for both classifier and agents
5. THE quick-reference.md steering file SHALL show Haiku 4.5 in code examples

### Requirement 11: Verify Cost and Performance Improvements

**User Story:** As a product owner, I want to verify that the upgrade delivers promised benefits, so that the investment is justified.

#### Acceptance Criteria

1. WHEN comparing API costs, THE Haiku_4_5 model SHALL cost less per token than Sonnet 4
2. WHEN comparing response times, THE Haiku_4_5 model SHALL respond faster than Sonnet 4 for equivalent tasks
3. WHEN comparing classification accuracy, THE Haiku_4_5 Classifier SHALL correctly classify obvious meal inputs without false "unclear" results
4. THE upgrade SHALL maintain or improve Response_Quality across all agents
5. THE upgrade SHALL maintain or improve parsing accuracy for workouts and meals

### Requirement 12: Test Model Upgrade

**User Story:** As a developer, I want comprehensive tests to verify the upgrade, so that I can confidently deploy to production.

#### Acceptance Criteria

1. THE test suite SHALL include preservation tests verifying existing functionality continues to work
2. THE test suite SHALL include classification accuracy tests verifying meal detection improvements
3. THE test suite SHALL include agent response quality tests verifying output remains valid
4. THE test suite SHALL include integration tests verifying end-to-end flows work correctly
5. WHEN all tests pass, THE upgrade SHALL be considered ready for deployment
6. FOR ALL test inputs, running tests multiple times SHALL produce consistent results (idempotence property)
