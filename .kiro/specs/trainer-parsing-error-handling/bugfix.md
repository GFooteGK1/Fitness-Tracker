# Bugfix Requirements Document

## Introduction

All three agents in the multi-agent system (Trainer, Nutritionist, and Socius) return generic error messages when users submit queries. This prevents users from successfully interacting with the agents and makes debugging impossible because the actual error or LLM response is not logged or surfaced to developers.

**Affected Agents:**
- **Trainer Agent** (`app/lib/agents/trainer-agent.ts`): Returns "I had trouble processing that workout. Could you try rephrasing it?"
- **Nutritionist Agent** (`app/lib/agents/nutritionist-agent.ts`): Returns "I had trouble processing that. Could you try again?"
- **Socius Agent** (`app/lib/agents/socius-agent.ts`): Returns "I had trouble analyzing that. Could you try again?"

The bug impacts core functionality across all three agents. Users cannot successfully interact with agents when the LLM returns non-JSON responses or when parsing fails, and developers cannot diagnose the root cause due to inadequate error handling across the entire agent system.

**Files Involved:**
- `app/lib/agents/trainer-agent.ts`
- `app/lib/agents/nutritionist-agent.ts`
- `app/lib/agents/socius-agent.ts`
- `app/lib/agents/prompts/trainer.ts`
- `app/lib/agents/prompts/nutritionist.ts`
- `app/lib/agents/prompts/socius.ts`
- `app/api/agent/process/route.ts`

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN any agent's LLM (Trainer, Nutritionist, or Socius) returns conversational text instead of JSON THEN the system returns a generic error message without logging the actual LLM response

1.2 WHEN JSON parsing fails in any agent's parse function (`parseTrainerResponse`, `parseNutritionistResponse`, `parseSociusResponse`) THEN the catch block silently swallows the error and returns a generic message without preserving the original response for debugging

1.3 WHEN an error occurs in any agent's caller function (`createTrainerCaller`, `createNutritionistCaller`, `createSociusCaller`) THEN the catch block logs a generic error to console but returns a generic error message to the user without including diagnostic information

1.4 WHEN any LLM response contains markdown code fences or other formatting THEN the parsing may fail even if valid JSON is present, and the actual content is not logged for inspection

1.5 WHEN users submit ambiguous input to any agent THEN the LLM may not understand the format and return conversational text, but the user receives no specific feedback about what was unclear

### Expected Behavior (Correct)

2.1 WHEN any agent's LLM returns conversational text instead of JSON THEN the system SHALL log the full LLM response to the console with a clear error indicator and return a user-friendly error message that preserves the conversational response if it's coherent

2.2 WHEN JSON parsing fails in any agent's parse function THEN the system SHALL log the parsing error details and the raw response, and SHALL attempt to extract useful information from the conversational text before falling back to a generic error

2.3 WHEN an error occurs in any agent's caller function THEN the system SHALL log the full error stack trace, the user input, and any partial response data, and SHALL return an error message that helps users understand what went wrong

2.4 WHEN any LLM response contains markdown code fences or other formatting THEN the system SHALL strip all common formatting patterns (code fences, markdown, extra whitespace) before attempting JSON parsing and log the cleaned response

2.5 WHEN users submit ambiguous input to any agent THEN the system SHALL detect when the LLM returns a clarifying question or conversational response and SHALL present that response to the user instead of a generic error message

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any agent successfully parses a response with valid JSON THEN the system SHALL CONTINUE TO parse the response, execute the appropriate actions (persist workout, analyze nutrition, provide insights), and return the conversational response

3.2 WHEN any LLM returns valid JSON with structured data THEN the system SHALL CONTINUE TO extract all relevant fields correctly (blocks, movements, scores, PRs for Trainer; macro analysis for Nutritionist; insights for Socius)

3.3 WHEN an agent successfully processes a request THEN the system SHALL CONTINUE TO persist the appropriate data to the database (workouts table, benchmark_prs table, etc.)

3.4 WHEN any parse function receives valid JSON (with or without markdown code fences) THEN the system SHALL CONTINUE TO successfully parse and normalize the response

3.5 WHEN users submit clear, unambiguous input to any agent THEN the system SHALL CONTINUE TO parse and process them successfully with appropriate responses
