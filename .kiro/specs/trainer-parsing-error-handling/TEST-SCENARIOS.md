# Test Scenarios - Specific Examples

This document provides specific test inputs and expected outputs for manual testing.

---

## Trainer Agent Test Scenarios

### Scenario T1: Ambiguous Workout (Conversational Response Expected)

**Input:**
```
I did a workout today
```

**Expected LLM Behavior:**
- LLM should ask clarifying questions
- Example: "Could you tell me more about what exercises you did? What movements were included and how many rounds or reps?"

**Expected System Behavior:**
- ✅ User sees the LLM's clarifying question (NOT a generic error)
- ✅ Console shows: `[AGENT ERROR] trainer` with full LLM response
- ✅ No JavaScript errors

---

### Scenario T2: Very Vague Input (Conversational Response Expected)

**Input:**
```
workout stuff
```

**Expected LLM Behavior:**
- LLM should ask for more details
- Example: "I'd be happy to help log your workout! Can you describe what exercises you did?"

**Expected System Behavior:**
- ✅ User sees the LLM's helpful response
- ✅ Console shows diagnostic log
- ✅ No crashes

---

### Scenario T3: Clear AMRAP Workout (Successful Parsing Expected)

**Input:**
```
12 min AMRAP:
5 Pull-ups
10 Push-ups
15 Air Squats

Result: 7 rounds + 5 reps
```

**Expected LLM Behavior:**
- LLM should return structured JSON with blocks, movements, scores

**Expected System Behavior:**
- ✅ Workout successfully parsed
- ✅ User sees confirmation: "Great workout! I logged your 12-minute AMRAP..."
- ✅ Workout appears in dashboard/history
- ✅ Blocks: 1 AMRAP block with 3 movements
- ✅ Score: 7 rounds + 5 reps
- ✅ No errors in console

---

### Scenario T4: Clear FOR TIME Workout (Successful Parsing Expected)

**Input:**
```
21-15-9 reps for time:
Thrusters (95#)
Pull-ups

Time: 8:45
```

**Expected LLM Behavior:**
- LLM should return structured JSON

**Expected System Behavior:**
- ✅ Workout successfully parsed
- ✅ User sees confirmation with workout details
- ✅ Workout persisted with correct structure
- ✅ Time: 8:45 (525 seconds)
- ✅ No errors

---

### Scenario T5: Benchmark Workout - Fran (Successful Parsing + PR Detection)

**Input:**
```
Fran
21-15-9:
Thrusters 95#
Pull-ups

Time: 4:32 RX
```

**Expected LLM Behavior:**
- LLM should recognize "Fran" as a benchmark
- LLM should return structured JSON with benchmark flag

**Expected System Behavior:**
- ✅ Workout successfully parsed
- ✅ Benchmark detected: "Fran"
- ✅ PR detection runs (checks if 4:32 is a PR)
- ✅ If PR: User sees "New PR!" message
- ✅ Workout persisted to workouts table
- ✅ PR persisted to benchmark_prs table (if applicable)
- ✅ No errors

---

### Scenario T6: Strength Workout (Successful Parsing Expected)

**Input:**
```
Back Squat
5x5 @ 225#

Felt strong today
```

**Expected LLM Behavior:**
- LLM should return structured JSON with STRENGTH block

**Expected System Behavior:**
- ✅ Workout successfully parsed
- ✅ Block type: STRENGTH
- ✅ Movement: Back Squat
- ✅ Weight: 225 lbs
- ✅ Sets/reps: 5x5
- ✅ Notes: "Felt strong today"
- ✅ No errors

---

### Scenario T7: Empty Input (Error Handling)

**Input:**
```
[empty string or just whitespace]
```

**Expected System Behavior:**
- ✅ Appropriate error message (not a crash)
- ✅ Console shows diagnostic log
- ✅ User can try again

---

### Scenario T8: Special Characters (Edge Case)

**Input:**
```
💪 Workout: 100 burpees 🔥
```

**Expected System Behavior:**
- ✅ Either successfully parsed OR conversational response
- ✅ No crashes
- ✅ Emojis handled gracefully

---

## Nutritionist Agent Test Scenarios

### Scenario N1: Ambiguous Meal (Conversational Response Expected)

**Input (Text):**
```
I ate food
```

**Expected LLM Behavior:**
- LLM should ask for more details
- Example: "What did you eat? Can you describe the meal or provide more details about the food items?"

**Expected System Behavior:**
- ✅ User sees the LLM's clarifying question
- ✅ Console shows diagnostic log
- ✅ No JavaScript errors

---

### Scenario N2: Very Vague Input (Conversational Response Expected)

**Input (Text):**
```
stuff
```

**Expected LLM Behavior:**
- LLM should ask for clarification
- Example: "I'd be happy to help log your meal! Can you describe what you ate?"

**Expected System Behavior:**
- ✅ User sees helpful response
- ✅ Console shows diagnostic log
- ✅ No crashes

---

### Scenario N3: Clear Meal Description (Successful Analysis Expected)

**Input (Text):**
```
Grilled chicken breast (6oz)
Brown rice (1 cup)
Steamed broccoli (1 cup)
Olive oil (1 tbsp)
```

**Expected LLM Behavior:**
- LLM should return structured JSON with items and macro totals

**Expected System Behavior:**
- ✅ Meal successfully analyzed
- ✅ User sees macro breakdown:
  - Protein: ~45-55g
  - Carbs: ~45-55g
  - Fat: ~15-20g
  - Calories: ~450-550
- ✅ Meal persisted to database
- ✅ Meal appears in food progress page
- ✅ Macros validated (within reasonable ranges)
- ✅ No errors

---

### Scenario N4: Photo Upload - Clear Meal (Successful Analysis Expected)

**Input (Photo):**
- Upload a clear photo of a meal (e.g., chicken, rice, vegetables on a plate)

**Expected LLM Behavior:**
- LLM should analyze the photo and return structured JSON

**Expected System Behavior:**
- ✅ Photo successfully uploaded to Supabase Storage
- ✅ Meal successfully analyzed
- ✅ User sees macro breakdown
- ✅ Macros are reasonable for the visible food
- ✅ Meal persisted with photo_url
- ✅ No errors

---

### Scenario N5: Photo Upload - Unclear Photo (Conversational Response Expected)

**Input (Photo):**
- Upload a very unclear photo (e.g., blurry, dark, or non-food item)

**Expected LLM Behavior:**
- LLM should indicate it cannot analyze the photo
- Example: "I'm having trouble identifying the food in this photo. Could you upload a clearer image or describe what you ate?"

**Expected System Behavior:**
- ✅ User sees helpful response (not generic error)
- ✅ Console shows diagnostic log
- ✅ No crashes

---

### Scenario N6: Photo Upload - Non-Food Item (Error Handling)

**Input (Photo):**
- Upload a photo of a non-food item (e.g., a book, a wall, a person)

**Expected LLM Behavior:**
- LLM should indicate this is not food
- Example: "This doesn't appear to be a food item. Can you upload a photo of your meal?"

**Expected System Behavior:**
- ✅ User sees appropriate message
- ✅ Console shows diagnostic log
- ✅ No crashes

---

### Scenario N7: Meal with Timing (Successful Analysis Expected)

**Input (Text):**
```
POST_WORKOUT meal:
Protein shake (2 scoops whey)
Banana
Peanut butter (2 tbsp)
```

**Expected System Behavior:**
- ✅ Meal successfully analyzed
- ✅ Meal timing: POST_WORKOUT
- ✅ Macro breakdown shown
- ✅ Meal persisted with correct timing
- ✅ No errors

---

### Scenario N8: Empty Input (Error Handling)

**Input:**
```
[empty string or no photo uploaded]
```

**Expected System Behavior:**
- ✅ Appropriate error message
- ✅ Console shows diagnostic log
- ✅ User can try again

---

## Socius Agent Test Scenarios

### Scenario S1: Ambiguous Query (Conversational Response Expected)

**Input:**
```
How am I doing?
```

**Expected LLM Behavior:**
- LLM should ask for clarification
- Example: "I'd be happy to analyze your progress! What specific aspect would you like me to focus on - workouts, nutrition, recovery, or overall trends?"

**Expected System Behavior:**
- ✅ User sees the LLM's clarifying question
- ✅ Console shows diagnostic log
- ✅ No JavaScript errors

---

### Scenario S2: Very Vague Query (Conversational Response Expected)

**Input:**
```
stuff
```

**Expected LLM Behavior:**
- LLM should ask for more details
- Example: "I'm here to help! What would you like to know about your fitness data?"

**Expected System Behavior:**
- ✅ User sees helpful response
- ✅ Console shows diagnostic log
- ✅ No crashes

---

### Scenario S3: Clear Workout Trend Query (Successful Insights Expected)

**Input:**
```
What are my workout trends over the last 7 days?
```

**Expected LLM Behavior:**
- LLM should analyze workout data and return structured insights

**Expected System Behavior:**
- ✅ Query successfully processed
- ✅ User sees insights about:
  - Number of workouts logged
  - Most common workout types
  - Volume trends
  - Any PRs achieved
- ✅ Insights are accurate based on user's data
- ✅ No errors

---

### Scenario S4: Clear Nutrition Query (Successful Insights Expected)

**Input:**
```
How is my protein intake compared to my target this week?
```

**Expected LLM Behavior:**
- LLM should analyze nutrition data and return structured insights

**Expected System Behavior:**
- ✅ Query successfully processed
- ✅ User sees insights about:
  - Average daily protein intake
  - Target protein goal
  - Adherence percentage
  - Days over/under target
- ✅ Insights are accurate based on user's data
- ✅ No errors

---

### Scenario S5: Cross-Domain Query (Successful Insights Expected)

**Input:**
```
How does my nutrition affect my workout performance?
```

**Expected LLM Behavior:**
- LLM should analyze both workout and nutrition data
- LLM should identify correlations or patterns

**Expected System Behavior:**
- ✅ Query successfully processed
- ✅ User sees cross-domain insights:
  - Correlation between nutrition and performance
  - Patterns identified (e.g., better workouts on high-protein days)
  - Recommendations
- ✅ Insights are accurate and actionable
- ✅ No errors

---

### Scenario S6: Query with No Data Available (Conversational Response Expected)

**Input:**
```
What are my workout trends over the last 30 days?
```

**Context:** User has only logged 2 workouts in the last 30 days

**Expected LLM Behavior:**
- LLM should indicate insufficient data
- Example: "You've logged 2 workouts in the last 30 days. I need more data to identify meaningful trends. Keep logging your workouts!"

**Expected System Behavior:**
- ✅ User sees helpful response (not an error)
- ✅ Response explains why trends can't be generated
- ✅ Response encourages continued logging
- ✅ No errors

---

### Scenario S7: Empty Query (Error Handling)

**Input:**
```
[empty string or just whitespace]
```

**Expected System Behavior:**
- ✅ Appropriate error message
- ✅ Console shows diagnostic log
- ✅ User can try again

---

### Scenario S8: Special Characters (Edge Case)

**Input:**
```
????
```

**Expected System Behavior:**
- ✅ Either conversational response OR appropriate error
- ✅ No crashes
- ✅ Console shows diagnostic log

---

## Performance Benchmarks

### Expected Response Times

| Scenario Type | Expected Time | Acceptable Range |
|---------------|---------------|------------------|
| Trainer - Successful Parse | 3-5s | 2-8s |
| Trainer - Conversational | 2-4s | 1-6s |
| Nutritionist - Text Analysis | 3-5s | 2-8s |
| Nutritionist - Photo Analysis | 5-10s | 3-15s |
| Nutritionist - Conversational | 2-4s | 1-6s |
| Socius - Simple Query | 3-6s | 2-10s |
| Socius - Cross-Domain Query | 5-10s | 3-15s |
| Socius - Conversational | 2-4s | 1-6s |

**Note:** Times may vary based on:
- LLM API response time
- Network latency
- Database query complexity
- Amount of user data

---

## Console Log Examples

### Expected Diagnostic Log Format

**For Conversational Response:**
```
[AGENT ERROR] trainer - 2026-02-01T12:34:56.789Z
User Input Hash: abc123def456
Raw LLM Response: "Could you tell me more about what exercises you did? What movements were included and how many rounds or reps?"
Error: Conversational response detected (not an error, preserving response)
```

**For Parsing Failure:**
```
[AGENT ERROR] nutritionist - 2026-02-01T12:35:12.345Z
User Input Hash: xyz789abc123
Raw LLM Response: "{ invalid json with trailing comma, }"
Error: SyntaxError: Unexpected token ',' at position 42
Cleaned Response: "{ invalid json with trailing comma, }"
```

**For Successful Parse (No Error Log Expected):**
```
[No error log should appear for successful parsing]
```

---

## Issue Severity Guidelines

**Critical:**
- Application crashes
- Data loss
- Security vulnerabilities
- Complete feature failure

**High:**
- Generic errors shown instead of conversational responses
- No diagnostic logging for errors
- Regressions in successful parsing
- Performance degradation >50%

**Medium:**
- Poor error message quality
- Incomplete diagnostic logs
- Minor regressions
- Performance degradation 20-50%

**Low:**
- Formatting issues in logs
- Minor UX improvements needed
- Performance degradation <20%

---

*Use these scenarios as a guide for comprehensive manual testing.*
