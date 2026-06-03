# Agent Error Handling Bugfix Design

## Overview

This bugfix addresses systematic error handling deficiencies across all three agents (Trainer, Nutritionist, Socius) in the multi-agent system. Currently, when LLMs return conversational text instead of JSON or when parsing fails, the system returns generic error messages without logging diagnostic information. This prevents users from receiving helpful feedback and makes debugging impossible for developers.

The fix implements a shared error handling utility that:
1. Captures and logs full LLM responses for debugging
2. Detects conversational responses and presents them to users
3. Implements robust formatting cleanup before JSON parsing
4. Provides actionable error messages to users
5. Maintains backward compatibility with successful parsing

## Glossary

- **LLM Response**: The raw text returned by Claude API (may be JSON or conversational text)
- **Parse Function**: Functions that convert raw LLM text to typed responses (`parseTrainerResponse`, `parseNutritionistResponse`, `parseSociusResponse`)
- **Caller Function**: Functions that orchestrate agent calls and handle errors (`createTrainerCaller`, `createNutritionistCaller`, `createSociusCaller`)
- **Conversational Response**: Natural language text from the LLM that is not structured JSON (e.g., clarifying questions, explanations)
- **Formatting Artifacts**: Markdown code fences, extra whitespace, or other formatting that interferes with JSON parsing
- **Diagnostic Logging**: Detailed error logs that include full context for debugging (LLM response, user input, error details)

## Bug Details

### Fault Condition

The bug manifests when an LLM returns conversational text instead of JSON, or when JSON parsing fails due to formatting issues. The parse functions catch the error but silently swallow diagnostic information, and the caller functions return generic error messages without preserving the actual LLM response.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { llmResponse: string, parseAttempt: boolean }
  OUTPUT: boolean

  RETURN (isConversationalText(input.llmResponse) OR hasParsingError(input.llmResponse))
         AND input.parseAttempt === true
         AND NOT diagnosticInfoLogged(input.llmResponse)
         AND genericErrorReturned()
END FUNCTION
```

### Examples

- **Trainer Agent**: User submits "I did a workout today" → LLM returns "Could you tell me more about what exercises you did?" → User sees "I had trouble processing that workout. Could you try rephrasing it?" instead of the LLM's helpful question

- **Nutritionist Agent**: User submits "I ate food" → LLM returns "What did you eat? Can you describe the meal?" → User sees "I had trouble processing that. Could you try again?" instead of the LLM's clarifying question

- **Socius Agent**: User submits "How am I doing?" → LLM returns "I'd be happy to analyze your progress. What specific aspect would you like me to focus on?" → User sees "I had trouble analyzing that. Could you try again?" instead of the LLM's helpful response

- **Edge Case**: LLM returns valid JSON wrapped in markdown code fences (```json\n{...}\n```) → Parsing fails because code fence stripping logic has a bug → No diagnostic logging occurs → User sees generic error

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful JSON parsing with valid structured data must continue to work exactly as before
- All database persistence operations (workouts, meals, insights) must remain unchanged
- Smart defaults, PR detection, and macro validation must continue to function
- Response normalization and type safety must be preserved

**Scope:**
All inputs that result in successful JSON parsing should be completely unaffected by this fix. This includes:
- Valid JSON responses from LLMs (with or without markdown code fences)
- Successful workout logging with blocks, movements, and scores
- Successful meal logging with items and macro totals
- Successful insight generation with pattern detection

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Inadequate Error Logging**: The parse functions catch JSON parsing errors but don't log the raw LLM response, making it impossible to diagnose why parsing failed
   - `parseTrainerResponse`, `parseNutritionistResponse`, `parseSociusResponse` all have empty catch blocks
   - No console.error or structured logging of the raw response
   - No error context (user input, timestamp, agent type)

2. **Missing Conversational Response Detection**: The system assumes all LLM responses should be JSON, but doesn't detect when the LLM intentionally returns conversational text
   - No check for conversational indicators (questions, explanations, requests for clarification)
   - Conversational responses are treated as parsing failures rather than valid responses

3. **Insufficient Formatting Cleanup**: The code strips markdown code fences but may not handle all formatting variations
   - Only handles ```json and ``` patterns
   - Doesn't handle extra whitespace, trailing commas, or other common formatting issues
   - Doesn't log the cleaned response before parsing

4. **Generic Error Messages in Caller Functions**: The catch blocks in `createTrainerCaller`, `createNutritionistCaller`, and `createSociusCaller` return hardcoded generic messages
   - No attempt to extract useful information from the error
   - No logging of user input or partial response data
   - No differentiation between parsing errors and other errors

## Correctness Properties

Property 1: Fault Condition - Enhanced Error Logging and Response Detection

_For any_ LLM response where JSON parsing fails (isBugCondition returns true), the fixed parse functions SHALL log the full raw response with error context (agent type, timestamp, user input hash) to the console, SHALL attempt to detect if the response is conversational text, and SHALL return either the conversational text to the user or a detailed error message with actionable feedback.

**Validates: Requirements 2.1, 2.2, 2.4, 2.5**

Property 2: Preservation - Successful Parsing Behavior

_For any_ LLM response where JSON parsing succeeds (isBugCondition returns false), the fixed parse functions SHALL produce exactly the same parsed result as the original functions, preserving all normalization logic, type safety, and downstream processing (smart defaults, PR detection, macro validation).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `app/lib/agents/error-handling.ts` (NEW)

**Purpose**: Shared error handling utilities for all agents

**Specific Changes**:
1. **Create `logParsingError` function**: Logs full diagnostic information when parsing fails
   - Accepts: agentType, rawResponse, userInputHash, error
   - Logs: timestamp, agent type, raw response (truncated if >1000 chars), error message
   - Returns: void

2. **Create `detectConversationalResponse` function**: Detects if LLM response is conversational text
   - Accepts: rawResponse string
   - Checks for: question marks, clarifying phrases ("could you", "can you", "please tell me")
   - Returns: boolean

3. **Create `cleanResponseForParsing` function**: Strips all formatting artifacts before JSON parsing
   - Accepts: rawResponse string
   - Strips: markdown code fences (```json, ```), leading/trailing whitespace, BOM characters
   - Logs: cleaned response before parsing
   - Returns: cleaned string

4. **Create `extractConversationalContent` function**: Extracts useful conversational text from failed parse
   - Accepts: rawResponse string
   - Returns: cleaned conversational text or null

5. **Create `buildUserFriendlyError` function**: Builds actionable error messages for users
   - Accepts: agentType, error, rawResponse
   - Returns: user-friendly error message with specific guidance

**File**: `app/lib/agents/trainer-agent.ts`

**Function**: `parseTrainerResponse`

**Specific Changes**:
1. **Import error handling utilities**: Add imports from `./error-handling`
2. **Enhance formatting cleanup**: Replace manual code fence stripping with `cleanResponseForParsing`
3. **Add diagnostic logging**: Call `logParsingError` in catch block with full context
4. **Detect conversational responses**: Check if response is conversational before treating as error
5. **Preserve conversational responses**: If conversational, return it as the message with low confidence
6. **Log cleaned response**: Log the cleaned response before JSON.parse attempt

**File**: `app/lib/agents/nutritionist-agent.ts`

**Function**: `parseNutritionistResponse`

**Specific Changes**:
1. **Import error handling utilities**: Add imports from `./error-handling`
2. **Enhance formatting cleanup**: Replace manual code fence stripping with `cleanResponseForParsing`
3. **Add diagnostic logging**: Call `logParsingError` in catch block with full context
4. **Detect conversational responses**: Check if response is conversational before treating as error
5. **Preserve conversational responses**: If conversational, return it as the message with low confidence
6. **Log cleaned response**: Log the cleaned response before JSON.parse attempt

**File**: `app/lib/agents/socius-agent.ts`

**Function**: `parseSociusResponse`

**Specific Changes**:
1. **Import error handling utilities**: Add imports from `./error-handling`
2. **Enhance formatting cleanup**: Replace manual code fence stripping with `cleanResponseForParsing`
3. **Add diagnostic logging**: Call `logParsingError` in catch block with full context
4. **Detect conversational responses**: Check if response is conversational before treating as error
5. **Preserve conversational responses**: If conversational, return it as the message with low confidence
6. **Log cleaned response**: Log the cleaned response before JSON.parse attempt

**File**: `app/api/agent/process/route.ts`

**Function**: `createTrainerCaller`, `createNutritionistCaller`, `createSociusCaller`

**Specific Changes**:
1. **Import error handling utilities**: Add imports from error-handling module
2. **Enhanced error logging**: Log full error stack, user input (hashed), and partial response data
3. **Preserve LLM responses**: If the error contains a conversational response from the parse function, return it
4. **Differentiate error types**: Check if error is from parsing vs other sources
5. **Return actionable errors**: Use `buildUserFriendlyError` to construct user-facing messages

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Fault Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate LLM responses with conversational text, malformed JSON, and formatting artifacts. Run these tests on the UNFIXED code to observe failures and confirm that diagnostic information is not logged.

**Test Cases**:
1. **Conversational Response Test**: Simulate LLM returning "Could you tell me more about the workout?" → Verify generic error is returned and no diagnostic logging occurs (will fail on unfixed code)
2. **Malformed JSON Test**: Simulate LLM returning JSON with trailing comma → Verify parsing fails and raw response is not logged (will fail on unfixed code)
3. **Markdown Code Fence Test**: Simulate LLM returning valid JSON wrapped in ```json\n{...}\n``` → Verify parsing succeeds or fails gracefully (may fail on unfixed code)
4. **Empty Response Test**: Simulate LLM returning empty string → Verify error handling and logging (will fail on unfixed code)

**Expected Counterexamples**:
- Generic error messages returned without preserving conversational responses
- No console.error logs containing the raw LLM response
- Possible causes: empty catch blocks, no conversational detection, insufficient formatting cleanup

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := parseFunction_fixed(input.llmResponse)
  ASSERT diagnosticInfoLogged(input.llmResponse)
  ASSERT (isConversational(input.llmResponse) IMPLIES result.message === extractedConversationalText)
  ASSERT (NOT isConversational(input.llmResponse) IMPLIES result.message === actionableErrorMessage)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT parseFunction_original(input) = parseFunction_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all successful parsing scenarios

**Test Plan**: Observe behavior on UNFIXED code first for successful JSON parsing, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Valid JSON Preservation**: Observe that valid JSON responses parse correctly on unfixed code, then write test to verify this continues after fix
2. **Workout Persistence Preservation**: Observe that workouts are persisted correctly on unfixed code, then write test to verify this continues after fix
3. **Smart Defaults Preservation**: Observe that smart defaults are applied correctly on unfixed code, then write test to verify this continues after fix
4. **PR Detection Preservation**: Observe that PR detection works correctly on unfixed code, then write test to verify this continues after fix

### Unit Tests

- Test `logParsingError` with various error scenarios and verify console output
- Test `detectConversationalResponse` with conversational and non-conversational text
- Test `cleanResponseForParsing` with various formatting artifacts
- Test `extractConversationalContent` with mixed content
- Test `buildUserFriendlyError` with different agent types and error types
- Test each parse function with conversational responses, malformed JSON, and valid JSON
- Test caller functions with various error scenarios

### Property-Based Tests

- Generate random valid JSON responses and verify parsing succeeds identically to original
- Generate random conversational responses and verify they are detected and preserved
- Generate random formatting artifacts and verify cleanup handles them
- Test that all successful parsing scenarios continue to work across many random inputs

### Integration Tests

- Test full agent flow with conversational LLM responses
- Test full agent flow with malformed JSON responses
- Test full agent flow with valid JSON responses (preservation)
- Test that diagnostic logs appear in console for parsing failures
- Test that user-friendly error messages are returned to API clients
