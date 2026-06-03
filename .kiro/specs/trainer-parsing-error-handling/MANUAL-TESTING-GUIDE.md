# Manual Testing Guide - Agent Error Handling

## Overview

This guide provides step-by-step instructions for manually testing the enhanced error handling across all three agents (Trainer, Nutritionist, Socius) with real LLM interactions.

**Testing Goals:**
1. Verify conversational responses are preserved and shown to users
2. Verify successful parsing continues to work (no regressions)
3. Verify diagnostic logging appears in console for errors
4. Verify error messages are user-friendly and actionable

---

## Prerequisites

### 1. Start the Development Server

```bash
npm run dev
```

The application should be running at `http://localhost:3000`

### 2. Open Browser Developer Console

- **Chrome/Edge**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Firefox**: Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
- **Safari**: Enable Developer menu in Preferences, then press `Cmd+Option+C`

Keep the console open during all tests to observe diagnostic logging.

### 3. Sign In to the Application

Navigate to `http://localhost:3000/auth/signin` and sign in with your test account.

---

## Test Suite 1: Trainer Agent

### Test 1.1: Ambiguous Workout Input (Conversational Response)

**Goal**: Verify that when the LLM returns a clarifying question, it's preserved and shown to the user.

**Steps:**
1. Navigate to the workout logging page (typically `/log` or wherever Trainer agent is used)
2. Submit an ambiguous workout input:
   ```
   I did a workout today
   ```
3. Wait for the response

**Expected Results:**
- ✅ User sees a conversational response like: "Could you tell me more about what exercises you did? What movements were included?"
- ✅ Response is NOT a generic error like "I had trouble processing that workout"
- ✅ Console shows diagnostic log with:
  - `[AGENT ERROR]` prefix
  - Agent type: `trainer`
  - Raw LLM response (the conversational text)
  - Timestamp
- ✅ No JavaScript errors in console

**What to Document:**
- Screenshot of the user-facing response
- Screenshot of the console logs
- Note whether the conversational response was preserved

---

### Test 1.2: Clear Workout Input (Successful Parsing - Preservation)

**Goal**: Verify that successful workout parsing still works correctly (no regressions).

**Steps:**
1. Navigate to the workout logging page
2. Submit a clear workout input:
   ```
   12 min AMRAP:
   5 Pull-ups
   10 Push-ups
   15 Air Squats

   Result: 7 rounds + 5 reps
   ```
3. Wait for the response

**Expected Results:**
- ✅ Workout is successfully parsed
- ✅ User sees a confirmation message with workout details
- ✅ Workout is persisted to the database (check dashboard or workout history)
- ✅ Blocks, movements, and scores are correctly extracted
- ✅ No errors in console
- ✅ Response time is reasonable (<5 seconds)

**What to Document:**
- Screenshot of the success message
- Verify workout appears in dashboard/history
- Note any differences from previous behavior

---

### Test 1.3: Console Diagnostic Logging

**Goal**: Verify that diagnostic information is logged when errors occur.

**Steps:**
1. Navigate to the workout logging page
2. Submit an input that might cause parsing issues:
   ```
   workout stuff happened
   ```
3. Observe the console

**Expected Results:**
- ✅ Console shows detailed error log with:
  - `[AGENT ERROR]` or similar prefix
  - Agent type: `trainer`
  - Raw LLM response (full text or truncated if >1000 chars)
  - Error message or parsing failure details
  - Timestamp
- ✅ Log is readable and contains actionable information

**What to Document:**
- Screenshot of console logs
- Note the level of detail provided
- Assess whether logs would help with debugging

---

## Test Suite 2: Nutritionist Agent

### Test 2.1: Ambiguous Meal Input (Conversational Response)

**Goal**: Verify that when the LLM returns a clarifying question, it's preserved and shown to the user.

**Steps:**
1. Navigate to the meal logging page (typically `/food-progress` or meal entry form)
2. Submit an ambiguous meal input (if using text input):
   ```
   I ate food
   ```
   OR upload a very unclear photo (e.g., blank image, non-food item)
3. Wait for the response

**Expected Results:**
- ✅ User sees a conversational response like: "What did you eat? Can you describe the meal or provide more details?"
- ✅ Response is NOT a generic error like "I had trouble processing that"
- ✅ Console shows diagnostic log with:
  - `[AGENT ERROR]` prefix
  - Agent type: `nutritionist`
  - Raw LLM response (the conversational text)
  - Timestamp
- ✅ No JavaScript errors in console

**What to Document:**
- Screenshot of the user-facing response
- Screenshot of the console logs
- Note whether the conversational response was preserved

---

### Test 2.2: Clear Meal Input (Successful Analysis - Preservation)

**Goal**: Verify that successful meal analysis still works correctly (no regressions).

**Steps:**
1. Navigate to the meal logging page
2. Upload a clear photo of a meal (e.g., chicken breast, rice, vegetables)
   OR submit clear text input:
   ```
   Grilled chicken breast (6oz), brown rice (1 cup), steamed broccoli (1 cup)
   ```
3. Wait for the response

**Expected Results:**
- ✅ Meal is successfully analyzed
- ✅ User sees macro breakdown (protein, carbs, fat, calories)
- ✅ Macros are within reasonable ranges (validated)
- ✅ Meal is persisted to the database (check food progress page)
- ✅ No errors in console
- ✅ Response time is reasonable (<10 seconds for photo, <5 seconds for text)

**What to Document:**
- Screenshot of the macro breakdown
- Verify meal appears in food progress page
- Note any differences from previous behavior
- Check if macro validation is working (reasonable values)

---

### Test 2.3: Console Diagnostic Logging

**Goal**: Verify that diagnostic information is logged when errors occur.

**Steps:**
1. Navigate to the meal logging page
2. Submit an input that might cause parsing issues:
   - Upload a photo of a non-food item (e.g., a book, a wall)
   - OR submit unclear text: "stuff"
3. Observe the console

**Expected Results:**
- ✅ Console shows detailed error log with:
  - `[AGENT ERROR]` or similar prefix
  - Agent type: `nutritionist`
  - Raw LLM response (full text or truncated if >1000 chars)
  - Error message or parsing failure details
  - Timestamp
- ✅ Log is readable and contains actionable information

**What to Document:**
- Screenshot of console logs
- Note the level of detail provided
- Assess whether logs would help with debugging

---

## Test Suite 3: Socius Agent

### Test 3.1: Ambiguous Query (Conversational Response)

**Goal**: Verify that when the LLM returns a clarifying question, it's preserved and shown to the user.

**Steps:**
1. Navigate to the query page (typically `/query` or wherever Socius agent is used)
2. Submit an ambiguous query:
   ```
   How am I doing?
   ```
3. Wait for the response

**Expected Results:**
- ✅ User sees a conversational response like: "I'd be happy to analyze your progress. What specific aspect would you like me to focus on - workouts, nutrition, or overall trends?"
- ✅ Response is NOT a generic error like "I had trouble analyzing that"
- ✅ Console shows diagnostic log with:
  - `[AGENT ERROR]` prefix
  - Agent type: `socius`
  - Raw LLM response (the conversational text)
  - Timestamp
- ✅ No JavaScript errors in console

**What to Document:**
- Screenshot of the user-facing response
- Screenshot of the console logs
- Note whether the conversational response was preserved

---

### Test 3.2: Clear Query (Successful Insight Generation - Preservation)

**Goal**: Verify that successful insight generation still works correctly (no regressions).

**Steps:**
1. Navigate to the query page
2. Submit a clear query:
   ```
   What are my workout trends over the last 7 days?
   ```
   OR
   ```
   How is my protein intake compared to my target?
   ```
3. Wait for the response

**Expected Results:**
- ✅ Query is successfully processed
- ✅ User sees relevant insights based on their data
- ✅ Insights are accurate and actionable
- ✅ No errors in console
- ✅ Response time is reasonable (<10 seconds)

**What to Document:**
- Screenshot of the insights provided
- Note the quality and relevance of insights
- Note any differences from previous behavior

---

### Test 3.3: Console Diagnostic Logging

**Goal**: Verify that diagnostic information is logged when errors occur.

**Steps:**
1. Navigate to the query page
2. Submit an input that might cause parsing issues:
   ```
   stuff
   ```
   OR
   ```
   ????
   ```
3. Observe the console

**Expected Results:**
- ✅ Console shows detailed error log with:
  - `[AGENT ERROR]` or similar prefix
  - Agent type: `socius`
  - Raw LLM response (full text or truncated if >1000 chars)
  - Error message or parsing failure details
  - Timestamp
- ✅ Log is readable and contains actionable information

**What to Document:**
- Screenshot of console logs
- Note the level of detail provided
- Assess whether logs would help with debugging

---

## Test Suite 4: Error Message Quality

### Test 4.1: User-Friendly Error Messages

**Goal**: Verify that error messages are helpful and actionable for users.

**Steps:**
1. For each agent, trigger an error scenario (ambiguous input, unclear photo, etc.)
2. Read the error message shown to the user

**Expected Results:**
- ✅ Error messages are written in plain language (not technical jargon)
- ✅ Error messages provide specific guidance on what to do next
- ✅ Error messages are contextual to the agent type (Trainer, Nutritionist, Socius)
- ✅ Error messages do NOT expose internal implementation details
- ✅ Error messages do NOT show raw JSON or stack traces to users

**What to Document:**
- List of error messages seen for each agent
- Rate each message on clarity (1-5 scale)
- Note any messages that could be improved

---

### Test 4.2: Conversational Response Preservation

**Goal**: Verify that conversational responses from the LLM are preserved and shown to users.

**Steps:**
1. For each agent, submit ambiguous input that triggers a conversational response
2. Verify the LLM's conversational text is shown to the user

**Expected Results:**
- ✅ Conversational responses are shown verbatim (or with minimal cleanup)
- ✅ Conversational responses are NOT replaced with generic errors
- ✅ Conversational responses maintain the LLM's helpful tone
- ✅ Users can understand what additional information is needed

**What to Document:**
- Examples of conversational responses preserved
- Note any cases where conversational responses were NOT preserved
- Assess the quality of preserved responses

---

## Test Suite 5: Regression Testing

### Test 5.1: Successful Parsing Scenarios

**Goal**: Verify that all previously working scenarios still work correctly.

**Steps:**
1. Test a variety of successful inputs for each agent:
   - **Trainer**: Various workout formats (AMRAP, FOR TIME, EMOM, STRENGTH)
   - **Nutritionist**: Various meal types (photos, text descriptions)
   - **Socius**: Various query types (workout trends, nutrition analysis, cross-domain)
2. Verify all scenarios work as expected

**Expected Results:**
- ✅ All successful parsing scenarios continue to work
- ✅ No new errors introduced
- ✅ Response times are similar to before
- ✅ Data persistence works correctly
- ✅ Smart defaults, PR detection, macro validation all work

**What to Document:**
- List of scenarios tested
- Note any regressions or unexpected behavior
- Compare response times to baseline (if available)

---

### Test 5.2: Edge Cases

**Goal**: Verify that edge cases are handled gracefully.

**Steps:**
1. Test edge cases for each agent:
   - **Trainer**: Empty input, very long input, special characters, emojis
   - **Nutritionist**: Blank photo, corrupted image, very large image, non-food photos
   - **Socius**: Empty query, very long query, queries with no data available
2. Verify all edge cases are handled without crashes

**Expected Results:**
- ✅ No JavaScript errors or crashes
- ✅ Appropriate error messages for each edge case
- ✅ Application remains functional after edge case inputs
- ✅ Console logs provide diagnostic information

**What to Document:**
- List of edge cases tested
- Note any crashes or unexpected behavior
- Assess error handling quality for edge cases

---

## Test Suite 6: Performance Testing

### Test 6.1: Response Times

**Goal**: Verify that error handling does not significantly impact performance.

**Steps:**
1. For each agent, measure response times for:
   - Successful parsing scenarios
   - Error scenarios (conversational responses, parsing failures)
2. Compare to baseline performance (if available)

**Expected Results:**
- ✅ Successful parsing response times are similar to baseline
- ✅ Error scenarios respond quickly (no long timeouts)
- ✅ Diagnostic logging does not cause noticeable delays
- ✅ Overall user experience is smooth

**What to Document:**
- Response times for each scenario (in seconds)
- Note any performance regressions
- Assess whether performance is acceptable

---

## Test Suite 7: Console Logging Quality

### Test 7.1: Diagnostic Information Completeness

**Goal**: Verify that console logs contain all necessary diagnostic information.

**Steps:**
1. Trigger error scenarios for each agent
2. Review console logs for completeness

**Expected Results:**
- ✅ Logs include agent type (trainer, nutritionist, socius)
- ✅ Logs include timestamp
- ✅ Logs include raw LLM response (or truncated version)
- ✅ Logs include error message or parsing failure details
- ✅ Logs include user input hash (for correlation)
- ✅ Logs are formatted for readability

**What to Document:**
- Screenshot of console logs for each agent
- Note any missing information
- Assess whether logs would help with debugging

---

### Test 7.2: Log Formatting and Readability

**Goal**: Verify that console logs are easy to read and understand.

**Steps:**
1. Review console logs from various error scenarios
2. Assess formatting and readability

**Expected Results:**
- ✅ Logs use clear prefixes (e.g., `[AGENT ERROR]`)
- ✅ Logs use appropriate console methods (console.error for errors)
- ✅ Logs are structured and easy to scan
- ✅ Long responses are truncated appropriately (>1000 chars)
- ✅ Logs do not contain sensitive information (passwords, tokens)

**What to Document:**
- Examples of well-formatted logs
- Note any formatting issues
- Suggest improvements if needed

---

## Reporting Issues

If you find any issues during manual testing, document them using this template:

### Issue Template

```markdown
## Issue: [Brief Description]

**Agent**: Trainer / Nutritionist / Socius

**Test Case**: [Test Suite and Test Number]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Screenshots**:
[Attach screenshots of UI and console]

**Console Logs**:
```
[Paste relevant console logs]
```

**Severity**: Critical / High / Medium / Low

**Notes**:
[Any additional context or observations]
```

---

## Test Results Summary

After completing all tests, fill out this summary:

### Overall Results

| Test Suite | Pass | Fail | Notes |
|------------|------|------|-------|
| 1. Trainer Agent | ☐ | ☐ | |
| 2. Nutritionist Agent | ☐ | ☐ | |
| 3. Socius Agent | ☐ | ☐ | |
| 4. Error Message Quality | ☐ | ☐ | |
| 5. Regression Testing | ☐ | ☐ | |
| 6. Performance Testing | ☐ | ☐ | |
| 7. Console Logging Quality | ☐ | ☐ | |

### Key Findings

**Conversational Response Preservation**:
- [ ] Working as expected
- [ ] Issues found: [describe]

**Diagnostic Logging**:
- [ ] Working as expected
- [ ] Issues found: [describe]

**Error Message Quality**:
- [ ] Working as expected
- [ ] Issues found: [describe]

**Regressions**:
- [ ] No regressions found
- [ ] Regressions found: [describe]

### Recommendations

[List any recommendations for improvements or follow-up work]

---

## Next Steps

After completing manual testing:

1. Document all findings in this guide or a separate test report
2. Create GitHub issues for any bugs found
3. Update the spec's tasks.md to mark task 8 as complete
4. Share results with the team
5. Proceed to task 9 (Checkpoint) if all tests pass

---

*Last Updated: [Date]*
*Tester: [Your Name]*
