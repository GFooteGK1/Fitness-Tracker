# Design Document: Upgrade to Haiku 4.5

## Overview

This design specifies the technical implementation for upgrading all Claude AI models in the SociusFit application from their current versions to Claude Haiku 4.5 (claude-haiku-4-5-20251001). The upgrade affects 4 agent files and 6 legacy API routes, requiring simple string constant changes while maintaining all existing functionality, configuration parameters, and behavior.

### Scope

**In Scope:**
- Update model constants in 4 agent files (classifier, trainer, nutritionist, socius)
- Update model strings in 6 legacy API routes (parse-workout, meals/upload, meals/parse-text, meals/refine, ocr-workout, query/lib/response-generator)
- Update documentation references in 4 files (AGENTS.md, project-overview.md, agent-system.md, quick-reference.md)
- Comprehensive testing to verify preservation of existing functionality
- Verification of meal detection bug fix

**Out of Scope:**
- Changes to temperature, max_tokens, or other configuration parameters
- Changes to prompt engineering or system prompts
- Changes to response parsing logic
- Changes to database schema or queries
- Changes to UI components
- Performance optimization beyond what Haiku 4.5 naturally provides

### Goals

1. **Cost Reduction**: Leverage Haiku 4.5's lower pricing compared to Sonnet 4
2. **Performance Improvement**: Benefit from Haiku 4.5's faster response times
3. **Bug Fix**: Resolve meal detection classification bug where obvious meal inputs trigger "unclear" classification
4. **Zero Regression**: Maintain 100% of existing functionality and behavior
5. **Atomic Deployment**: Deploy as a single coordinated change across all files


### Success Criteria

- All 10 files updated with new model constant/string
- All existing tests pass without modification
- Meal detection classification accuracy improves (no false "unclear" for obvious meals)
- Response times decrease compared to Sonnet 4 baseline
- API costs decrease compared to Sonnet 4 baseline
- Documentation accurately reflects new model version

## Architecture

### Current State

The SociusFit application uses Claude AI models in two architectural patterns:

**1. Agent System (New Architecture)**
- Location: `app/lib/agents/`
- Components: Classifier, Trainer Agent, Nutritionist Agent, Socius Agent
- Model Constants: Defined at file level, used in `anthropic.messages.create()` calls
- Current Models:
  - Classifier: `claude-haiku-3-20241022`
  - Trainer: `claude-sonnet-4-20250514`
  - Nutritionist: `claude-sonnet-4-20250514`
  - Socius: `claude-sonnet-4-20250514`

**2. Legacy API Routes (Original Architecture)**
- Location: `app/api/`
- Components: Direct API route handlers with inline Claude calls
- Model Strings: Hardcoded in `anthropic.messages.create()` calls
- Current Model: `claude-sonnet-4-20250514` (all routes)

### Target State

All components will use Claude Haiku 4.5:
- Model Identifier: `claude-haiku-4-5-20251001`
- All configuration parameters (temperature, max_tokens) remain unchanged
- All prompt engineering remains unchanged
- All response parsing logic remains unchanged

### Why Haiku 4.5?

**Performance Benefits:**
- 3-5x faster response times compared to Sonnet 4
- Lower latency for real-time user interactions
- Better mobile experience with faster feedback

**Cost Benefits:**
- Significantly lower per-token pricing
- Estimated 60-70% cost reduction for equivalent workloads
- More sustainable for personal use case

**Quality Benefits:**
- Improved classification accuracy (fixes meal detection bug)
- Maintained parsing quality for structured outputs
- Better handling of edge cases in natural language understanding

**Model Capabilities:**
- Sufficient for classification tasks (Classifier)
- Sufficient for structured data extraction (Trainer, Nutritionist)
- Sufficient for conversational responses (Socius)
- Supports vision API for meal photo analysis
- Supports all required output formats (JSON, natural language)


## Components and Interfaces

### Component 1: Classifier Model Update

**File**: `app/lib/agents/classifier.ts`

**Current Implementation:**
```typescript
const CLASSIFIER_MODEL = 'claude-haiku-3-20241022'
```

**Target Implementation:**
```typescript
const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'
```

**Configuration (Unchanged):**
- Temperature: 0 (deterministic classification)
- Max Tokens: 256 (efficient for JSON classification output)
- System Prompt: No changes
- Response Parsing: No changes

**Interface:**
```typescript
export async function classifyInput(
  content: string,
  inputMode: InputMode
): Promise<ClassificationResult>
```

**Behavior:**
- Input: User text/voice content + input mode
- Output: Classification result with input_type, domains, confidence, context
- Fallback: Keyword-based classification if LLM fails

### Component 2: Trainer Agent Model Update

**File**: `app/lib/agents/trainer-agent.ts`

**Current Implementation:**
```typescript
const TRAINER_MODEL = 'claude-sonnet-4-20250514'
```

**Target Implementation:**
```typescript
const TRAINER_MODEL = 'claude-haiku-4-5-20251001'
```

**Configuration (Unchanged):**
- Temperature: 0 (deterministic parsing)
- Max Tokens: 4096 (complex workout structures)
- System Prompt: No changes
- Response Parsing: No changes

**Interface:**
```typescript
export async function callTrainerAgent(
  ctx: TrainerContext,
  userInput: string
): Promise<TrainerResponse>
```

**Behavior:**
- Input: Trainer context (recent workouts, PRs, movements) + user workout text
- Output: Parsed workout with blocks, scores, PRs, smart defaults
- Post-processing: PR detection, smart defaults application

### Component 3: Nutritionist Agent Model Update

**File**: `app/lib/agents/nutritionist-agent.ts`

**Current Implementation:**
```typescript
const NUTRITIONIST_MODEL = 'claude-sonnet-4-20250514'
```

**Target Implementation:**
```typescript
const NUTRITIONIST_MODEL = 'claude-haiku-4-5-20251001'
```

**Configuration (Unchanged):**
- Temperature: 0 (deterministic analysis)
- Max Tokens: 2048 (meal analysis with multiple items)
- System Prompt: No changes
- Response Parsing: No changes

**Interface:**
```typescript
export async function callNutritionistAgent(
  ctx: NutritionistContext,
  userInput: string
): Promise<NutritionistResponse>
```

**Behavior:**
- Input: Nutritionist context (daily totals, targets, portion history) + user meal text/photo
- Output: Parsed meal with items, totals, timing, adherence status
- Post-processing: Timing inference, portion defaults, macro validation


### Component 4: Socius Agent Model Update

**File**: `app/lib/agents/socius-agent.ts`

**Current Implementation:**
```typescript
const SOCIUS_MODEL = 'claude-sonnet-4-20250514'
```

**Target Implementation:**
```typescript
const SOCIUS_MODEL = 'claude-haiku-4-5-20251001'
```

**Configuration (Unchanged):**
- Temperature: 0.7 (natural conversational responses)
- Max Tokens: 2000 (comprehensive cross-domain insights)
- System Prompt: No changes
- Response Parsing: No changes

**Interface:**
```typescript
export async function callSociusAgent(
  ctx: SociusContext,
  userInput: string
): Promise<SociusResponse>
```

**Behavior:**
- Input: Socius context (workouts, meals, WHOOP data, recent insights) + user query
- Output: Natural language response with insights, data points, confidence
- Post-processing: Insight validation, pattern detection

### Component 5: Legacy Parse Workout Route Update

**File**: `app/api/parse-workout/route.ts`

**Current Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }]
})
```

**Target Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4096,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }]
})
```

**Configuration (Unchanged):**
- Temperature: 0 (default, deterministic)
- Max Tokens: 4096
- System Prompt: No changes
- Response Parsing: No changes

**Behavior:**
- Maintains backward compatibility for existing UI components
- Continues to support direct workout parsing without agent system
- Database operations unchanged

### Component 6: Legacy Meal Routes Update

**Files**:
- `app/api/meals/upload/route.ts`
- `app/api/meals/parse-text/route.ts` (if exists)
- `app/api/meals/refine/route.ts` (if exists)

**Current Implementation (upload route):**
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [...]
})
```

**Target Implementation:**
```typescript
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  messages: [...]
})
```

**Configuration (Unchanged):**
- Temperature: 0 (default, deterministic)
- Max Tokens: Varies by route (1024 for upload, appropriate for others)
- Vision API support maintained
- Response Parsing: No changes


### Component 7: Legacy OCR Workout Route Update

**File**: `app/api/ocr-workout/route.ts`

**Current Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  messages: [...]
})
```

**Target Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 2000,
  messages: [...]
})
```

**Configuration (Unchanged):**
- Temperature: 0 (default, deterministic)
- Max Tokens: 2000
- Vision API support maintained
- Response Parsing: No changes

**Behavior:**
- Extracts workout text from whiteboard photos
- Maintains OCR accuracy for handwritten text
- Supports messy/unclear handwriting with best-effort extraction

### Component 8: Legacy Query Response Generator Update

**File**: `app/api/query/lib/response-generator.ts`

**Current Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  temperature: 0.7,
  messages: [...]
})
```

**Target Implementation:**
```typescript
const message = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 2000,
  temperature: 0.7,
  messages: [...]
})
```

**Configuration (Unchanged):**
- Temperature: 0.7 (natural conversational responses)
- Max Tokens: 2000
- System Prompt: No changes
- Response Parsing: No changes

**Behavior:**
- Generates natural language responses to user queries
- References workout, nutrition, and WHOOP data
- Maintains conversational quality


## Data Models

### Model Configuration

**Type Definition:**
```typescript
interface ModelConfig {
  model: string           // Model identifier
  temperature: number     // 0 for deterministic, 0.7 for conversational
  max_tokens: number      // Output token limit
}
```

**Current Configurations:**
```typescript
// Classifier
{ model: 'claude-haiku-3-20241022', temperature: 0, max_tokens: 256 }

// Trainer Agent
{ model: 'claude-sonnet-4-20250514', temperature: 0, max_tokens: 4096 }

// Nutritionist Agent
{ model: 'claude-sonnet-4-20250514', temperature: 0, max_tokens: 2048 }

// Socius Agent
{ model: 'claude-sonnet-4-20250514', temperature: 0.7, max_tokens: 2000 }

// Legacy Routes
{ model: 'claude-sonnet-4-20250514', temperature: 0 or 0.7, max_tokens: varies }
```

**Target Configurations:**
```typescript
// Classifier
{ model: 'claude-haiku-4-5-20251001', temperature: 0, max_tokens: 256 }

// Trainer Agent
{ model: 'claude-haiku-4-5-20251001', temperature: 0, max_tokens: 4096 }

// Nutritionist Agent
{ model: 'claude-haiku-4-5-20251001', temperature: 0, max_tokens: 2048 }

// Socius Agent
{ model: 'claude-haiku-4-5-20251001', temperature: 0.7, max_tokens: 2000 }

// Legacy Routes
{ model: 'claude-haiku-4-5-20251001', temperature: 0 or 0.7, max_tokens: varies }
```

### Response Schemas (Unchanged)

All response schemas remain identical. The model upgrade does not affect:

**ClassificationResult:**
```typescript
interface ClassificationResult {
  input_type: 'workout_log' | 'meal_log' | 'question' | 'mixed' | 'unclear'
  domains: AgentDomain[]
  confidence: number
  context: {
    date?: string
    meal_timing?: string
    has_portions: boolean
    has_score: boolean
    is_benchmark: boolean
    benchmark_name?: string
  }
}
```

**TrainerResponse:**
```typescript
interface TrainerResponse {
  message: string
  workout?: {
    blocks: WorkoutBlock[]
    primary_score: string | null
    rpe: number | null
    tags: string[]
  }
  new_prs: BenchmarkPR[]
  smart_defaults: SmartDefault[]
  confidence: number
}
```

**NutritionistResponse:**
```typescript
interface NutritionistResponse {
  message: string
  meal?: {
    items: MealItem[]
    totals: MacroTotals
    timing: MealTiming
  }
  remaining_budget: MacroTotals
  week_status: WeekStatus
  smart_defaults: SmartDefault[]
  confidence: number
}
```

**SociusResponse:**
```typescript
interface SociusResponse {
  message: string
  insights: RecentInsight[]
  data_points: Record<string, unknown>
  confidence: number
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:

**Redundancy Analysis:**
1. Requirements 1.5, 2.5, 3.5, 4.5, 5.5, 6.6, 7.5, 8.5 all test preservation properties for their respective components. These can be consolidated into domain-specific preservation properties rather than having separate properties per requirement.

2. Requirements 9.1-9.5 test that each component works after upgrade, which is redundant with the preservation properties already defined for each component.

3. Requirements 11.2, 11.3, 11.5 test performance and accuracy improvements, which overlap with preservation properties and the meal detection fix property.

4. Configuration checks (temperature, max_tokens) across requirements 1.3-1.4, 2.2-2.3, 3.2-3.3, 4.2-4.3, 5.2-5.3, 6.4-6.5, 7.2-7.3, 8.2-8.3 can be consolidated into a single configuration preservation property.

**Consolidated Properties:**
After reflection, I've consolidated 40+ potential properties into 8 comprehensive properties that provide unique validation value without redundancy.

### Property 1: Model Constant Updates

*For all* agent files and legacy API routes, after the upgrade, the model identifier string SHALL be 'claude-haiku-4-5-20251001'.

**Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, 6.3, 7.1, 8.1**

**Test Approach:**
- Read each file and verify the model constant/string matches expected value
- Files to check: classifier.ts, trainer-agent.ts, nutritionist-agent.ts, socius-agent.ts, parse-workout/route.ts, meals/upload/route.ts, meals/parse-text/route.ts, meals/refine/route.ts, ocr-workout/route.ts, query/lib/response-generator.ts

### Property 2: Configuration Preservation

*For all* agent files and legacy API routes, after the upgrade, the temperature and max_tokens configuration parameters SHALL remain unchanged from their pre-upgrade values.

**Validates: Requirements 1.3, 1.4, 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.2, 5.3, 6.4, 6.5, 7.2, 7.3, 8.2, 8.3**

**Test Approach:**
- Verify temperature values: Classifier (0), Trainer (0), Nutritionist (0), Socius (0.7), Legacy routes (0 or 0.7)
- Verify max_tokens values: Classifier (256), Trainer (4096), Nutritionist (2048), Socius (2000), Legacy routes (varies)

### Property 3: Classification Preservation

*For all* valid user inputs, classifying with Haiku 4.5 SHALL produce classification results (input_type, domains, confidence) that are equivalent to or better than classification with Haiku 3.

**Validates: Requirements 1.5, 9.1**

**Test Approach:**
- Property-based test with generated user inputs covering workout, meal, query, and mixed intents
- Compare classification results between models
- "Better" means: same or higher confidence, same or more accurate input_type, same or more appropriate domains

### Property 4: Meal Detection Accuracy

*For all* obvious meal inputs (containing food names, portions, or meal timing indicators), classifying with Haiku 4.5 SHALL produce input_type 'meal_log' without producing 'unclear' classification.

**Validates: Requirements 1.2, 11.3**

**Test Approach:**
- Property-based test with generated obvious meal descriptions
- Examples: "chicken breast 6oz with rice", "ate salmon and vegetables for lunch", "post-workout shake with protein powder"
- Verify input_type is 'meal_log' and not 'unclear'
- This tests the bug fix


### Property 5: Workout Parsing Preservation

*For all* valid workout inputs, parsing with Haiku 4.5 SHALL produce structured workout data (blocks, scores, movements) that conforms to the WorkoutParseResult schema and is equivalent to or better than parsing with Sonnet 4.

**Validates: Requirements 2.4, 2.5, 5.4, 5.5, 9.2**

**Test Approach:**
- Property-based test with generated workout descriptions covering AMRAP, FOR_TIME, EMOM, STRENGTH, CARDIO
- Verify output conforms to WorkoutBlock schema
- Verify scores are calculated correctly
- Verify movements are extracted with proper reps/weights
- Compare parsing quality between models

### Property 6: Meal Analysis Preservation

*For all* valid meal inputs (text or photo), analyzing with Haiku 4.5 SHALL produce structured meal data (items, macros, timing) that conforms to the MealAnalysisResult schema and produces macro estimates within acceptable validation ranges (protein 0-200g, carbs 0-300g, fat 0-150g, calories 0-2000, calorie consistency within 10%).

**Validates: Requirements 3.4, 3.5, 6.6, 9.3**

**Test Approach:**
- Property-based test with generated meal descriptions
- Verify output conforms to MealItem schema
- Verify macros are within validation ranges
- Verify calorie consistency: |calculated_cals - reported_cals| / calculated_cals <= 0.1
- Compare analysis quality between models

### Property 7: Cross-Domain Query Preservation

*For all* valid user queries, generating responses with Haiku 4.5 SHALL produce coherent natural language responses that reference appropriate fitness data (workouts, nutrition, WHOOP) and are equivalent to or better than responses generated with Sonnet 4.

**Validates: Requirements 4.4, 4.5, 8.4, 8.5, 9.4**

**Test Approach:**
- Property-based test with generated queries covering workout-only, nutrition-only, WHOOP-only, and cross-domain queries
- Verify responses are coherent (non-empty, grammatically correct)
- Verify responses reference appropriate data domains based on query intent
- Compare response quality between models (length, relevance, data references)

### Property 8: Test Idempotence

*For all* test inputs, running the same test multiple times with Haiku 4.5 (temperature 0 for deterministic tests) SHALL produce identical results on each execution.

**Validates: Requirements 9.6, 12.6**

**Test Approach:**
- Run each deterministic test (temperature 0) 10 times with the same input
- Verify outputs are identical across all runs
- This ensures the upgrade doesn't introduce non-deterministic behavior
- Excludes tests with temperature 0.7 (Socius, query generator) which are intentionally non-deterministic


## Error Handling

### Error Categories

**1. Model Availability Errors**
- **Scenario**: Haiku 4.5 model is not available or deprecated
- **Detection**: Anthropic API returns 404 or model_not_found error
- **Handling**:
  - Log error with model identifier
  - Return user-friendly error message
  - For Classifier: Fall back to keyword-based classification
  - For Agents: Return error response with confidence 0.3
- **Prevention**: Verify model availability in staging before production deployment

**2. API Authentication Errors**
- **Scenario**: ANTHROPIC_API_KEY is invalid or expired
- **Detection**: Anthropic API returns 401 authentication error
- **Handling**:
  - Log error (without exposing API key)
  - Return 500 error to client with generic message
  - Alert monitoring system
- **Prevention**: Verify API key in pre-deployment checks

**3. Rate Limiting Errors**
- **Scenario**: Anthropic API rate limits exceeded
- **Detection**: Anthropic API returns 429 rate limit error
- **Handling**:
  - Implement exponential backoff retry (3 attempts)
  - Log rate limit events
  - Return 503 Service Unavailable if retries exhausted
- **Prevention**: Monitor API usage, implement request queuing if needed

**4. Response Parsing Errors**
- **Scenario**: Model returns malformed JSON or unexpected format
- **Detection**: JSON.parse() throws error or schema validation fails
- **Handling**:
  - Log full response for debugging (using error-handling.ts utilities)
  - Detect conversational responses and extract content
  - Return user-friendly error message
  - For Classifier: Fall back to keyword-based classification
- **Prevention**: Comprehensive testing with diverse inputs

**5. Timeout Errors**
- **Scenario**: Model response takes too long
- **Detection**: Request exceeds timeout threshold (30s for API routes)
- **Handling**:
  - Cancel request
  - Log timeout event with input hash
  - Return 504 Gateway Timeout
- **Prevention**: Monitor response times, adjust max_tokens if needed

### Error Handling Patterns

**Classifier Error Handling:**
```typescript
export async function classifyInput(
  content: string,
  inputMode: InputMode
): Promise<ClassificationResult> {
  try {
    return await classifyWithLLM(content, inputMode)
  } catch (error) {
    console.error('Classifier LLM call failed, falling back to keywords:', error)
    return classifyWithKeywords(content, inputMode)
  }
}
```

**Agent Error Handling:**
```typescript
export function parseTrainerResponse(raw: string, userInput: string = ''): TrainerResponse {
  const cleaned = cleanResponseForParsing(raw)

  try {
    const parsed = JSON.parse(cleaned)
    return normalizeTrainerResponse(parsed)
  } catch (error) {
    logParsingError('trainer', raw, hashUserInput(userInput), error)

    if (detectConversationalResponse(raw)) {
      const content = extractConversationalContent(raw)
      if (content) {
        return { message: content, confidence: 0.3, ... }
      }
    }

    const errorMessage = buildUserFriendlyError('trainer', error, raw)
    return { message: errorMessage, confidence: 0.3, ... }
  }
}
```

**API Route Error Handling:**
```typescript
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Process request with Haiku 4.5
    const response = await anthropic.messages.create({ ... })

    return NextResponse.json({ success: true, data: response })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Request failed', details: error.message },
      { status: 500 }
    )
  }
}
```

### Monitoring and Alerting

**Metrics to Track:**
- Model error rate (by error type)
- Fallback usage rate (Classifier keyword fallback)
- Response parsing failure rate
- Average response time (should decrease with Haiku 4.5)
- API cost per request (should decrease with Haiku 4.5)

**Alert Thresholds:**
- Error rate > 5%: Warning
- Error rate > 10%: Critical
- Fallback rate > 20%: Warning
- Response time > 10s: Warning
- Response time > 30s: Critical


## Testing Strategy

### Dual Testing Approach

This upgrade requires both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests:**
- Verify specific model constant values in each file
- Verify configuration parameters (temperature, max_tokens) remain unchanged
- Test specific examples of meal detection bug fix
- Test error handling paths
- Test fallback mechanisms

**Property-Based Tests:**
- Verify classification preservation across all input types
- Verify parsing preservation across all workout types
- Verify meal analysis preservation across all meal inputs
- Verify query response preservation across all query types
- Verify test idempotence for deterministic operations

### Test Configuration

**Property-Based Test Library:** fast-check (already in use)

**Test Iterations:** Minimum 100 iterations per property test

**Test Tagging:** Each property test must reference its design document property:
```typescript
// Feature: upgrade-to-haiku-4-5, Property 3: Classification Preservation
it('should preserve classification quality with Haiku 4.5', () => {
  fc.assert(fc.property(...))
})
```

### Test Suite Structure

**1. Model Constant Verification Tests (Unit)**

File: `test/upgrade-haiku-4-5/model-constants.test.ts`

```typescript
describe('Model Constant Updates', () => {
  it('should use Haiku 4.5 in classifier', () => {
    const source = fs.readFileSync('app/lib/agents/classifier.ts', 'utf-8')
    expect(source).toContain("CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'")
  })

  it('should use Haiku 4.5 in trainer agent', () => {
    const source = fs.readFileSync('app/lib/agents/trainer-agent.ts', 'utf-8')
    expect(source).toContain("TRAINER_MODEL = 'claude-haiku-4-5-20251001'")
  })

  // ... similar tests for other files
})
```

**2. Configuration Preservation Tests (Unit)**

File: `test/upgrade-haiku-4-5/configuration.test.ts`

```typescript
describe('Configuration Preservation', () => {
  it('should maintain classifier temperature 0', () => {
    const source = fs.readFileSync('app/lib/agents/classifier.ts', 'utf-8')
    expect(source).toMatch(/temperature:\s*0[,\s]/)
  })

  it('should maintain classifier max_tokens 256', () => {
    const source = fs.readFileSync('app/lib/agents/classifier.ts', 'utf-8')
    expect(source).toMatch(/max_tokens:\s*256[,\s]/)
  })

  // ... similar tests for other configurations
})
```

**3. Classification Preservation Tests (Property)**

File: `test/upgrade-haiku-4-5/classification-preservation.property.test.ts`

```typescript
import * as fc from 'fast-check'

// Feature: upgrade-to-haiku-4-5, Property 3: Classification Preservation
describe('Classification Preservation', () => {
  it('should preserve classification quality across all input types', () => {
    fc.assert(
      fc.property(
        fc.record({
          content: fc.string({ minLength: 10, maxLength: 500 }),
          inputMode: fc.constantFrom('text', 'voice', 'photo')
        }),
        async ({ content, inputMode }) => {
          const result = await classifyInput(content, inputMode)

          // Verify result structure
          expect(result).toHaveProperty('input_type')
          expect(result).toHaveProperty('domains')
          expect(result).toHaveProperty('confidence')
          expect(result.confidence).toBeGreaterThanOrEqual(0)
          expect(result.confidence).toBeLessThanOrEqual(1)

          // Verify valid input_type
          expect(['workout_log', 'meal_log', 'question', 'mixed', 'unclear'])
            .toContain(result.input_type)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

**4. Meal Detection Accuracy Tests (Property)**

File: `test/upgrade-haiku-4-5/meal-detection.property.test.ts`

```typescript
// Feature: upgrade-to-haiku-4-5, Property 4: Meal Detection Accuracy
describe('Meal Detection Accuracy', () => {
  const obviousMealPatterns = [
    'chicken breast {portion} with rice',
    'ate {food} for {meal_timing}',
    '{food} and {food} for lunch',
    'post-workout shake with protein',
    '{portion} salmon with vegetables'
  ]

  it('should classify obvious meal inputs as meal_log', () => {
    fc.assert(
      fc.property(
        fc.record({
          food: fc.constantFrom('chicken', 'salmon', 'steak', 'eggs', 'rice', 'pasta'),
          portion: fc.constantFrom('6oz', '8oz', '1 cup', '2 cups', '100g'),
          meal_timing: fc.constantFrom('breakfast', 'lunch', 'dinner')
        }),
        async ({ food, portion, meal_timing }) => {
          const inputs = [
            `${food} ${portion} with rice`,
            `ate ${food} for ${meal_timing}`,
            `${food} and vegetables for lunch`,
            `${portion} ${food} with sweet potato`
          ]

          for (const input of inputs) {
            const result = await classifyInput(input, 'text')

            // Should NOT be unclear
            expect(result.input_type).not.toBe('unclear')

            // Should be meal_log or mixed (if workout keywords present)
            expect(['meal_log', 'mixed']).toContain(result.input_type)

            // Should include nutritionist domain
            expect(result.domains).toContain('nutritionist')
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```


**5. Workout Parsing Preservation Tests (Property)**

File: `test/upgrade-haiku-4-5/workout-parsing-preservation.property.test.ts`

```typescript
// Feature: upgrade-to-haiku-4-5, Property 5: Workout Parsing Preservation
describe('Workout Parsing Preservation', () => {
  it('should preserve workout parsing quality across all block types', () => {
    fc.assert(
      fc.property(
        fc.record({
          blockType: fc.constantFrom('AMRAP', 'FOR_TIME', 'EMOM', 'STRENGTH', 'CARDIO'),
          duration: fc.integer({ min: 5, max: 60 }),
          movements: fc.array(
            fc.record({
              name: fc.constantFrom('Pull-up', 'Push-up', 'Squat', 'Deadlift', 'Row'),
              reps: fc.integer({ min: 1, max: 50 })
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async ({ blockType, duration, movements }) => {
          const workoutText = buildWorkoutText(blockType, duration, movements)
          const ctx = buildTrainerContext()

          const result = await callTrainerAgent(ctx, workoutText)

          // Verify response structure
          expect(result).toHaveProperty('message')
          expect(result).toHaveProperty('confidence')
          expect(result.confidence).toBeGreaterThanOrEqual(0)
          expect(result.confidence).toBeLessThanOrEqual(1)

          // If workout parsed, verify structure
          if (result.workout) {
            expect(result.workout).toHaveProperty('blocks')
            expect(Array.isArray(result.workout.blocks)).toBe(true)

            for (const block of result.workout.blocks) {
              expect(block).toHaveProperty('block_type')
              expect(block).toHaveProperty('movements')
              expect(Array.isArray(block.movements)).toBe(true)
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

**6. Meal Analysis Preservation Tests (Property)**

File: `test/upgrade-haiku-4-5/meal-analysis-preservation.property.test.ts`

```typescript
// Feature: upgrade-to-haiku-4-5, Property 6: Meal Analysis Preservation
describe('Meal Analysis Preservation', () => {
  it('should preserve meal analysis quality with valid macro ranges', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            food: fc.constantFrom('chicken breast', 'salmon', 'rice', 'broccoli', 'eggs'),
            portion: fc.constantFrom('4oz', '6oz', '8oz', '1 cup', '2 cups')
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (items) => {
          const mealText = items.map(i => `${i.food} ${i.portion}`).join(', ')
          const ctx = buildNutritionistContext()

          const result = await callNutritionistAgent(ctx, mealText)

          // Verify response structure
          expect(result).toHaveProperty('message')
          expect(result).toHaveProperty('confidence')

          // If meal parsed, verify macro ranges
          if (result.meal) {
            const { totals } = result.meal

            // Macro range validation
            expect(totals.protein).toBeGreaterThanOrEqual(0)
            expect(totals.protein).toBeLessThanOrEqual(200)

            expect(totals.carbs).toBeGreaterThanOrEqual(0)
            expect(totals.carbs).toBeLessThanOrEqual(300)

            expect(totals.fat).toBeGreaterThanOrEqual(0)
            expect(totals.fat).toBeLessThanOrEqual(150)

            expect(totals.calories).toBeGreaterThanOrEqual(0)
            expect(totals.calories).toBeLessThanOrEqual(2000)

            // Calorie consistency check (within 10%)
            const calculatedCals = (totals.protein * 4) + (totals.carbs * 4) + (totals.fat * 9)
            if (calculatedCals > 0) {
              const deviation = Math.abs(calculatedCals - totals.calories) / calculatedCals
              expect(deviation).toBeLessThanOrEqual(0.1)
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

**7. Query Response Preservation Tests (Property)**

File: `test/upgrade-haiku-4-5/query-preservation.property.test.ts`

```typescript
// Feature: upgrade-to-haiku-4-5, Property 7: Cross-Domain Query Preservation
describe('Query Response Preservation', () => {
  it('should preserve query response quality across all query types', () => {
    fc.assert(
      fc.property(
        fc.record({
          queryType: fc.constantFrom('workout', 'nutrition', 'whoop', 'cross-domain'),
          question: fc.string({ minLength: 10, maxLength: 200 })
        }),
        async ({ queryType, question }) => {
          const ctx = buildSociusContext(queryType)
          const query = buildQueryForType(queryType, question)

          const result = await callSociusAgent(ctx, query)

          // Verify response structure
          expect(result).toHaveProperty('message')
          expect(result).toHaveProperty('confidence')
          expect(result.message).toBeTruthy()
          expect(result.message.length).toBeGreaterThan(0)

          // Verify response references appropriate data
          const message = result.message.toLowerCase()

          if (queryType === 'workout' || queryType === 'cross-domain') {
            // Should reference workout-related terms
            const hasWorkoutRef = /workout|exercise|lift|train|pr|strength/.test(message)
            expect(hasWorkoutRef).toBe(true)
          }

          if (queryType === 'nutrition' || queryType === 'cross-domain') {
            // Should reference nutrition-related terms
            const hasNutritionRef = /protein|carbs|calories|meal|food|nutrition/.test(message)
            expect(hasNutritionRef).toBe(true)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
```


**8. Test Idempotence Tests (Property)**

File: `test/upgrade-haiku-4-5/idempotence.property.test.ts`

```typescript
// Feature: upgrade-to-haiku-4-5, Property 8: Test Idempotence
describe('Test Idempotence', () => {
  it('should produce identical results for deterministic operations', () => {
    fc.assert(
      fc.property(
        fc.record({
          operation: fc.constantFrom('classify', 'parse-workout', 'analyze-meal'),
          input: fc.string({ minLength: 20, maxLength: 200 })
        }),
        async ({ operation, input }) => {
          const results = []

          // Run same operation 10 times
          for (let i = 0; i < 10; i++) {
            let result

            switch (operation) {
              case 'classify':
                result = await classifyInput(input, 'text')
                break
              case 'parse-workout':
                const trainerCtx = buildTrainerContext()
                result = await callTrainerAgent(trainerCtx, input)
                break
              case 'analyze-meal':
                const nutritionistCtx = buildNutritionistContext()
                result = await callNutritionistAgent(nutritionistCtx, input)
                break
            }

            results.push(JSON.stringify(result))
          }

          // All results should be identical (temperature 0 = deterministic)
          const firstResult = results[0]
          for (const result of results) {
            expect(result).toBe(firstResult)
          }

          return true
        }
      ),
      { numRuns: 20 } // Lower runs since each property run does 10 iterations
    )
  })
})
```

### Integration Tests

**End-to-End Flow Tests:**

File: `test/upgrade-haiku-4-5/integration.test.ts`

```typescript
describe('End-to-End Integration Tests', () => {
  it('should handle complete workout logging flow', async () => {
    const workoutText = '12min AMRAP: 5 pull-ups, 10 push-ups, 15 squats - Got 7+5 RPE 8'

    // 1. Classify
    const classification = await classifyInput(workoutText, 'text')
    expect(classification.input_type).toBe('workout_log')
    expect(classification.domains).toContain('trainer')

    // 2. Parse
    const ctx = buildTrainerContext()
    const parsed = await callTrainerAgent(ctx, workoutText)
    expect(parsed.workout).toBeDefined()
    expect(parsed.workout!.blocks.length).toBeGreaterThan(0)

    // 3. Persist (mock)
    const workoutId = await persistWorkout(parsed, 'test-user-id', workoutText, mockSupabase)
    expect(workoutId).toBeTruthy()
  })

  it('should handle complete meal logging flow', async () => {
    const mealText = 'chicken breast 6oz, brown rice 1 cup, broccoli 1 cup'

    // 1. Classify
    const classification = await classifyInput(mealText, 'text')
    expect(classification.input_type).toBe('meal_log')
    expect(classification.domains).toContain('nutritionist')

    // 2. Analyze
    const ctx = buildNutritionistContext()
    const analyzed = await callNutritionistAgent(ctx, mealText)
    expect(analyzed.meal).toBeDefined()
    expect(analyzed.meal!.items.length).toBeGreaterThan(0)

    // 3. Validate macros
    const validation = validateMacros(analyzed.meal!.totals)
    expect(validation.isValid).toBe(true)

    // 4. Persist (mock)
    const mealId = await persistMeal(analyzed, 'test-user-id', mockSupabase)
    expect(mealId).toBeTruthy()
  })

  it('should handle complete query flow', async () => {
    const query = 'How did my workouts affect my nutrition this week?'

    // 1. Classify
    const classification = await classifyInput(query, 'text')
    expect(classification.input_type).toBe('question')
    expect(classification.domains).toContain('socius')

    // 2. Generate response
    const ctx = buildSociusContext('cross-domain')
    const response = await callSociusAgent(ctx, query)
    expect(response.message).toBeTruthy()
    expect(response.message.length).toBeGreaterThan(0)
  })
})
```

### Performance Tests

File: `test/upgrade-haiku-4-5/performance.test.ts`

```typescript
describe('Performance Tests', () => {
  it('should respond faster than 5 seconds for classification', async () => {
    const input = 'chicken breast 6oz with rice and vegetables'

    const startTime = Date.now()
    await classifyInput(input, 'text')
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(5000)
  })

  it('should respond faster than 10 seconds for workout parsing', async () => {
    const input = '12min AMRAP: 5 pull-ups, 10 push-ups, 15 squats'
    const ctx = buildTrainerContext()

    const startTime = Date.now()
    await callTrainerAgent(ctx, input)
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(10000)
  })

  it('should respond faster than 10 seconds for meal analysis', async () => {
    const input = 'grilled salmon 6oz, sweet potato 1 cup, asparagus 1 cup'
    const ctx = buildNutritionistContext()

    const startTime = Date.now()
    await callNutritionistAgent(ctx, input)
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(10000)
  })
})
```

### Test Execution Plan

**Pre-Deployment:**
1. Run all unit tests (model constants, configuration)
2. Run all property-based tests (100+ iterations each)
3. Run integration tests (end-to-end flows)
4. Run performance tests (verify speed improvements)
5. Manual testing of meal detection bug fix

**Post-Deployment:**
1. Monitor error rates for 24 hours
2. Monitor response times for 24 hours
3. Monitor API costs for 7 days
4. Collect user feedback on classification accuracy

**Success Criteria:**
- All tests pass
- Error rate < 5%
- Response times decrease by 20%+ compared to Sonnet 4
- API costs decrease by 50%+ compared to Sonnet 4
- No meal detection false "unclear" classifications in production logs


## Implementation Plan

### Phase 1: Preparation (Pre-Implementation)

**1.1 Verify Model Availability**
- Check Anthropic documentation for Haiku 4.5 availability
- Verify model identifier: `claude-haiku-4-5-20251001`
- Test model access with API key in staging environment
- Confirm vision API support for meal photo analysis

**1.2 Create Feature Branch**
```bash
git checkout -b feature/upgrade-to-haiku-4-5
```

**1.3 Backup Current State**
- Document current model versions in all files
- Capture baseline metrics (response times, error rates, costs)
- Export recent test results for comparison

### Phase 2: Code Changes

**2.1 Update Agent Files (4 files)**

File: `app/lib/agents/classifier.ts`
```typescript
// Change line 6
- const CLASSIFIER_MODEL = 'claude-haiku-3-20241022'
+ const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'
```

File: `app/lib/agents/trainer-agent.ts`
```typescript
// Change line 15
- const TRAINER_MODEL = 'claude-sonnet-4-20250514'
+ const TRAINER_MODEL = 'claude-haiku-4-5-20251001'
```

File: `app/lib/agents/nutritionist-agent.ts`
```typescript
// Change line 16
- const NUTRITIONIST_MODEL = 'claude-sonnet-4-20250514'
+ const NUTRITIONIST_MODEL = 'claude-haiku-4-5-20251001'
```

File: `app/lib/agents/socius-agent.ts`
```typescript
// Change line 14
- const SOCIUS_MODEL = 'claude-sonnet-4-20250514'
+ const SOCIUS_MODEL = 'claude-haiku-4-5-20251001'
```

**2.2 Update Legacy API Routes (6 files)**

File: `app/api/parse-workout/route.ts`
```typescript
// Change line ~30 in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

File: `app/api/meals/upload/route.ts`
```typescript
// Change line ~50 in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

File: `app/api/meals/parse-text/route.ts` (if exists)
```typescript
// Change model string in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

File: `app/api/meals/refine/route.ts` (if exists)
```typescript
// Change model string in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

File: `app/api/ocr-workout/route.ts`
```typescript
// Change line ~40 in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

File: `app/api/query/lib/response-generator.ts`
```typescript
// Change model string in anthropic.messages.create()
- model: 'claude-sonnet-4-20250514',
+ model: 'claude-haiku-4-5-20251001',
```

**2.3 Update Documentation (4 files)**

File: `AGENTS.md`
```markdown
# Change in Tech Stack section
- AI: Anthropic Claude Sonnet 4 (claude-sonnet-4-20250514)
+ AI: Anthropic Claude Haiku 4.5 (claude-haiku-4-5-20251001)

# Change in Models section
- Classifier: `claude-haiku-3-20241022` (temperature 0, max_tokens 256)
- Agents: `claude-sonnet-4-20250514` (Trainer, Nutritionist, Socius)
+ Classifier: `claude-haiku-4-5-20251001` (temperature 0, max_tokens 256)
+ Agents: `claude-haiku-4-5-20251001` (Trainer, Nutritionist, Socius)
```

File: `.kiro/steering/project-overview.md`
```markdown
# Change in Tech Stack section
- **Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
+ **Model**: Claude Haiku 4.5 (claude-haiku-4-5-20251001)
```

File: `.kiro/steering/agent-system.md`
```markdown
# Change in Models section
- Classifier: `claude-haiku-3-20241022` (temperature 0, max_tokens 256)
- Agents: `claude-sonnet-4-20250514` (Trainer, Nutritionist, Socius)
+ Classifier: `claude-haiku-4-5-20251001` (temperature 0, max_tokens 256)
+ Agents: `claude-haiku-4-5-20251001` (Trainer, Nutritionist, Socius)
```

File: `.kiro/steering/quick-reference.md`
```markdown
# Change in code examples
- model: 'claude-sonnet-4-20250514'
+ model: 'claude-haiku-4-5-20251001'
```

### Phase 3: Testing

**3.1 Create Test Files**
- `test/upgrade-haiku-4-5/model-constants.test.ts`
- `test/upgrade-haiku-4-5/configuration.test.ts`
- `test/upgrade-haiku-4-5/classification-preservation.property.test.ts`
- `test/upgrade-haiku-4-5/meal-detection.property.test.ts`
- `test/upgrade-haiku-4-5/workout-parsing-preservation.property.test.ts`
- `test/upgrade-haiku-4-5/meal-analysis-preservation.property.test.ts`
- `test/upgrade-haiku-4-5/query-preservation.property.test.ts`
- `test/upgrade-haiku-4-5/idempotence.property.test.ts`
- `test/upgrade-haiku-4-5/integration.test.ts`
- `test/upgrade-haiku-4-5/performance.test.ts`

**3.2 Run Test Suite**
```bash
npm run test test/upgrade-haiku-4-5/
```

**3.3 Run Existing Tests**
```bash
npm run test
```

Verify all existing tests still pass without modification.

**3.4 Manual Testing**
- Test meal detection with obvious meal inputs
- Test workout parsing with various block types
- Test meal analysis with photo uploads
- Test query responses with cross-domain questions
- Verify error handling paths


### Phase 4: Deployment

**4.1 Staging Deployment**
```bash
# Deploy to staging environment
vercel --prod --scope=staging
```

**4.2 Staging Validation**
- Run smoke tests on staging
- Test meal detection bug fix with real inputs
- Monitor error rates for 1 hour
- Monitor response times for 1 hour
- Verify API costs are lower

**4.3 Production Deployment**
```bash
# Merge to main
git checkout main
git merge feature/upgrade-to-haiku-4-5

# Deploy to production
vercel --prod
```

**4.4 Production Monitoring**
- Monitor error rates for 24 hours
- Monitor response times for 24 hours
- Monitor API costs for 7 days
- Check for meal detection false "unclear" classifications
- Collect user feedback

**4.5 Rollback Plan**
If critical issues arise:
```bash
# Revert commit
git revert HEAD

# Redeploy previous version
vercel --prod
```

Rollback triggers:
- Error rate > 10%
- Response time > 30s average
- Meal detection accuracy worse than before
- Critical parsing failures

### Phase 5: Post-Deployment

**5.1 Metrics Collection**
- Baseline vs. new response times
- Baseline vs. new API costs
- Baseline vs. new error rates
- Meal detection accuracy improvement

**5.2 Documentation Updates**
- Update session notes with deployment results
- Document any issues encountered
- Update troubleshooting guide if needed

**5.3 Cleanup**
```bash
# Delete feature branch
git branch -d feature/upgrade-to-haiku-4-5
```

## Deployment Checklist

**Pre-Deployment:**
- [ ] All 10 code files updated
- [ ] All 4 documentation files updated
- [ ] All unit tests pass
- [ ] All property tests pass (100+ iterations each)
- [ ] Integration tests pass
- [ ] Performance tests pass
- [ ] Manual testing complete
- [ ] Staging deployment successful
- [ ] Staging validation complete

**Deployment:**
- [ ] Feature branch merged to main
- [ ] Production deployment initiated
- [ ] Deployment successful
- [ ] Smoke tests pass in production

**Post-Deployment:**
- [ ] Error rate < 5% after 1 hour
- [ ] Response times improved
- [ ] No meal detection false "unclear" in logs
- [ ] User feedback collected
- [ ] Metrics documented
- [ ] Session notes updated

## Risk Assessment

### High Risk Items

**1. Model Availability**
- **Risk**: Haiku 4.5 not available or deprecated
- **Mitigation**: Verify availability before deployment, test in staging
- **Contingency**: Rollback to previous version

**2. Parsing Quality Regression**
- **Risk**: Haiku 4.5 produces lower quality parsing than Sonnet 4
- **Mitigation**: Comprehensive property-based testing, staging validation
- **Contingency**: Rollback if parsing accuracy drops significantly

**3. Vision API Compatibility**
- **Risk**: Haiku 4.5 vision API behaves differently for meal photos
- **Mitigation**: Test meal photo analysis in staging
- **Contingency**: Keep legacy meal routes as fallback

### Medium Risk Items

**1. Response Time Variance**
- **Risk**: Response times vary significantly from expected
- **Mitigation**: Performance testing, monitoring
- **Contingency**: Adjust max_tokens if needed

**2. Cost Increase**
- **Risk**: Actual costs don't decrease as expected
- **Mitigation**: Monitor API usage closely
- **Contingency**: Investigate usage patterns, optimize if needed

### Low Risk Items

**1. Documentation Drift**
- **Risk**: Documentation not updated consistently
- **Mitigation**: Checklist for all documentation files
- **Contingency**: Update documentation post-deployment

**2. Test Flakiness**
- **Risk**: Property tests produce inconsistent results
- **Mitigation**: Test idempotence property, multiple test runs
- **Contingency**: Adjust test parameters or seed values

## Success Metrics

### Quantitative Metrics

**Performance:**
- Response time reduction: Target 30%+ improvement
- Classification: < 3s average (down from ~5s)
- Workout parsing: < 5s average (down from ~8s)
- Meal analysis: < 5s average (down from ~8s)

**Cost:**
- API cost reduction: Target 50%+ reduction
- Cost per classification: < $0.001
- Cost per workout parse: < $0.005
- Cost per meal analysis: < $0.005

**Reliability:**
- Error rate: < 5%
- Fallback rate (Classifier): < 10%
- Parsing failure rate: < 2%

**Accuracy:**
- Meal detection false "unclear": 0%
- Classification accuracy: ≥ 95%
- Parsing accuracy: ≥ 90%

### Qualitative Metrics

**User Experience:**
- Faster feedback on mobile devices
- Improved meal detection (no false "unclear")
- Maintained parsing quality
- No increase in error messages

**Developer Experience:**
- Simple, atomic deployment
- No breaking changes
- Comprehensive test coverage
- Clear documentation

## Conclusion

This design specifies a straightforward model upgrade from various Claude models to Haiku 4.5 across 10 files. The upgrade is low-risk due to:

1. **Simple Changes**: Only model string constants change
2. **Preserved Configuration**: All temperature, max_tokens, and prompts unchanged
3. **Comprehensive Testing**: Property-based tests ensure preservation of functionality
4. **Atomic Deployment**: All changes deployed together
5. **Clear Rollback**: Simple revert if issues arise

The upgrade delivers significant benefits:
- 30%+ faster response times
- 50%+ cost reduction
- Fixed meal detection bug
- Maintained or improved quality

Success depends on thorough testing, careful staging validation, and close production monitoring during the first 24 hours.
