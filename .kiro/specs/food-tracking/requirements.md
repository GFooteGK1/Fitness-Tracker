# Requirements Document

## Introduction

The Food Tracking Feature enables users to log meals through photo capture and AI analysis, providing macro and calorie tracking alongside existing workout data. The system focuses on consistency over perfection with ±5% tolerance on daily macro targets, emphasizing ease of use with <30 seconds per meal logging time.

## Glossary

- **Food_Tracker**: The complete food tracking system including photo capture, AI analysis, and data storage
- **Meal_Logger**: The component responsible for capturing and processing meal photos
- **AI_Analyzer**: Claude API integration that converts meal photos to structured nutritional data
- **Macro_Calculator**: Component that computes protein, carbohydrates, fat, and calorie totals
- **Adherence_Scorer**: System that calculates daily and weekly adherence to nutritional targets
- **Photo_Storage**: Temporary storage system for meal photos (30-day retention)
- **Data_Pipeline**: End-to-end flow from photo capture to structured data storage

## Requirements

### Requirement 1: Photo-Based Meal Logging

**User Story:** As a CrossFit athlete, I want to log meals by taking photos, so that I can quickly track my nutrition without manual data entry.

#### Acceptance Criteria

1. WHEN a user opens the meal logging interface, THE Food_Tracker SHALL display a camera interface for photo capture
2. WHEN a user takes a meal photo, THE Food_Tracker SHALL upload it to temporary storage within 5 seconds
3. WHEN a photo is uploaded, THE AI_Analyzer SHALL process it and return structured nutritional data within 15 seconds
4. WHEN AI analysis completes, THE Food_Tracker SHALL store the meal data in the database with a needs_review flag
5. THE Food_Tracker SHALL complete the entire logging process in under 30 seconds per meal

### Requirement 2: AI-Powered Nutritional Analysis

**User Story:** As a user, I want AI to automatically extract nutritional information from meal photos, so that I don't have to manually calculate macros.

#### Acceptance Criteria

1. WHEN the AI_Analyzer receives a meal photo, THE AI_Analyzer SHALL identify individual food items with portion estimates
2. WHEN food items are identified, THE AI_Analyzer SHALL calculate protein, carbohydrates, fat, and calories for each item
3. WHEN individual calculations are complete, THE Macro_Calculator SHALL compute total macros for the entire meal
4. THE AI_Analyzer SHALL return data in structured JSON format with meal_items array and total_macros object
5. WHEN AI analysis fails or returns invalid data, THE Food_Tracker SHALL flag the entry for manual review

### Requirement 3: Data Storage and Management

**User Story:** As a system administrator, I want meal data stored in a structured format, so that it can be analyzed and queried efficiently.

#### Acceptance Criteria

1. WHEN meal data is processed, THE Food_Tracker SHALL store it in the meals table with all required fields
2. WHEN a meal is stored, THE Photo_Storage SHALL retain the photo URL with 30-day expiration
3. WHEN photo expiration time is reached, THE Photo_Storage SHALL automatically delete expired photos
4. THE Food_Tracker SHALL store meal items as JSONB array preserving individual food details
5. THE Food_Tracker SHALL maintain audit trail with created_at timestamps and manual_override flags

### Requirement 4: Daily Target Management

**User Story:** As a user, I want to set and track daily macro targets, so that I can monitor my adherence to nutritional goals.

#### Acceptance Criteria

1. WHEN a user sets nutritional targets, THE Food_Tracker SHALL store protein, carbohydrate, fat, and calorie goals
2. THE Food_Tracker SHALL apply a default 5% tolerance to all macro targets
3. WHEN targets are updated, THE Food_Tracker SHALL timestamp the changes for historical tracking
4. THE Food_Tracker SHALL allow users to modify tolerance percentage per their preferences
5. THE Food_Tracker SHALL validate that all target values are positive numbers

### Requirement 5: Daily Progress Tracking

**User Story:** As a user, I want to see my daily nutritional progress, so that I can adjust my eating throughout the day.

#### Acceptance Criteria

1. WHEN viewing daily progress, THE Food_Tracker SHALL display all meals logged for the current day
2. WHEN displaying meals, THE Food_Tracker SHALL show individual food items with macro breakdowns
3. WHEN calculating daily totals, THE Macro_Calculator SHALL sum all meal macros for running totals
4. WHEN comparing to targets, THE Adherence_Scorer SHALL indicate whether daily intake is within tolerance
5. THE Food_Tracker SHALL provide visual indicators for target adherence status

### Requirement 6: Weekly Adherence Analysis

**User Story:** As a user, I want to see weekly adherence patterns, so that I can identify trends and make improvements.

#### Acceptance Criteria

1. WHEN viewing weekly data, THE Food_Tracker SHALL display Monday through Sunday daily totals
2. WHEN calculating weekly adherence, THE Adherence_Scorer SHALL compute daily adherence for each macro and calories
3. WHEN daily adherence is within ±5% tolerance, THE Adherence_Scorer SHALL assign 100% score
4. WHEN daily adherence exceeds tolerance, THE Adherence_Scorer SHALL calculate score as (1 - deviation/target) × 100
5. THE Adherence_Scorer SHALL compute weekly score as average of all daily macro scores

### Requirement 7: Data Quality Validation

**User Story:** As a system administrator, I want data quality checks, so that obviously incorrect nutritional data is flagged for review.

#### Acceptance Criteria

1. WHEN meal data is processed, THE Food_Tracker SHALL validate that protein values are reasonable (≤500g per meal)
2. WHEN meal data is processed, THE Food_Tracker SHALL validate that calorie values are reasonable (≤5000 per meal)
3. WHEN validation fails, THE Food_Tracker SHALL set needs_review flag to true
4. THE Food_Tracker SHALL require all four macro values (protein, carbs, fat, calories) before saving
5. WHEN users make manual corrections, THE Food_Tracker SHALL set manual_override flag and preserve original AI data

### Requirement 8: Manual Override Capability

**User Story:** As a user, I want to correct AI analysis errors, so that my nutritional data remains accurate.

#### Acceptance Criteria

1. WHEN viewing a meal entry, THE Food_Tracker SHALL provide an edit interface for macro corrections
2. WHEN a user makes corrections, THE Food_Tracker SHALL preserve the original AI analysis data
3. WHEN corrections are saved, THE Food_Tracker SHALL set manual_override flag to true
4. WHEN corrections are made, THE Food_Tracker SHALL timestamp the review with reviewed_at field
5. THE Food_Tracker SHALL allow users to revert manual changes back to original AI analysis

### Requirement 9: Correction Guidance System

**User Story:** As a user, I want specific guidance when my weekly adherence is low, so that I know how to improve my nutrition.

#### Acceptance Criteria

1. WHEN weekly adherence score is below 90%, THE Food_Tracker SHALL provide specific correction guidance
2. WHEN protein intake is low, THE Food_Tracker SHALL suggest adding protein servings with gram amounts
3. WHEN carbohydrate intake is high, THE Food_Tracker SHALL suggest reducing carb servings with gram amounts
4. THE Food_Tracker SHALL calculate deviation percentages and translate to practical serving adjustments
5. THE Food_Tracker SHALL provide guidance in user-friendly language avoiding technical jargon

### Requirement 10: Photo Management and Privacy

**User Story:** As a user, I want my meal photos stored securely with automatic cleanup, so that my privacy is protected and storage costs are controlled.

#### Acceptance Criteria

1. WHEN a meal photo is uploaded, THE Photo_Storage SHALL store it with 30-day expiration metadata
2. WHEN photos reach expiration date, THE Photo_Storage SHALL automatically delete them from storage
3. THE Photo_Storage SHALL provide secure URLs that expire with the photo retention period
4. WHEN meal data is queried, THE Food_Tracker SHALL check photo expiration before returning URLs
5. THE Photo_Storage SHALL handle storage failures gracefully without blocking meal data entry