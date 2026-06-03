# Manual Testing Checklist - Quick Reference

Use this checklist to quickly track your manual testing progress.

## Setup
- [ ] Development server running (`npm run dev`)
- [ ] Browser console open (F12)
- [ ] Signed in to application
- [ ] Ready to test

---

## Trainer Agent Tests

### Ambiguous Input (Conversational Response)
- [ ] Submit: "I did a workout today"
- [ ] ✅ Conversational response shown (not generic error)
- [ ] ✅ Console shows diagnostic log with raw LLM response
- [ ] ✅ No JavaScript errors

### Clear Input (Successful Parsing)
- [ ] Submit: "12 min AMRAP: 5 Pull-ups, 10 Push-ups, 15 Air Squats. Result: 7 rounds + 5 reps"
- [ ] ✅ Workout successfully parsed
- [ ] ✅ Workout persisted to database
- [ ] ✅ Confirmation message shown
- [ ] ✅ No errors in console

### Console Logging
- [ ] Submit: "workout stuff happened"
- [ ] ✅ Console shows detailed error log
- [ ] ✅ Log includes agent type, timestamp, raw response
- [ ] ✅ Log is readable and actionable

---

## Nutritionist Agent Tests

### Ambiguous Input (Conversational Response)
- [ ] Submit: "I ate food" OR upload unclear photo
- [ ] ✅ Conversational response shown (not generic error)
- [ ] ✅ Console shows diagnostic log with raw LLM response
- [ ] ✅ No JavaScript errors

### Clear Input (Successful Analysis)
- [ ] Upload clear meal photo OR submit: "Grilled chicken breast (6oz), brown rice (1 cup), steamed broccoli (1 cup)"
- [ ] ✅ Meal successfully analyzed
- [ ] ✅ Macro breakdown shown (protein, carbs, fat, calories)
- [ ] ✅ Meal persisted to database
- [ ] ✅ No errors in console

### Console Logging
- [ ] Upload non-food photo OR submit: "stuff"
- [ ] ✅ Console shows detailed error log
- [ ] ✅ Log includes agent type, timestamp, raw response
- [ ] ✅ Log is readable and actionable

---

## Socius Agent Tests

### Ambiguous Query (Conversational Response)
- [ ] Submit: "How am I doing?"
- [ ] ✅ Conversational response shown (not generic error)
- [ ] ✅ Console shows diagnostic log with raw LLM response
- [ ] ✅ No JavaScript errors

### Clear Query (Successful Insights)
- [ ] Submit: "What are my workout trends over the last 7 days?"
- [ ] ✅ Query successfully processed
- [ ] ✅ Relevant insights shown
- [ ] ✅ No errors in console

### Console Logging
- [ ] Submit: "stuff" OR "????"
- [ ] ✅ Console shows detailed error log
- [ ] ✅ Log includes agent type, timestamp, raw response
- [ ] ✅ Log is readable and actionable

---

## Error Message Quality

### User-Friendly Messages
- [ ] Error messages use plain language (not technical jargon)
- [ ] Error messages provide specific guidance
- [ ] Error messages are contextual to agent type
- [ ] Error messages do NOT expose internal details
- [ ] Error messages do NOT show raw JSON/stack traces

### Conversational Response Preservation
- [ ] Conversational responses shown verbatim (or with minimal cleanup)
- [ ] Conversational responses NOT replaced with generic errors
- [ ] Conversational responses maintain helpful tone
- [ ] Users can understand what additional information is needed

---

## Regression Testing

### Successful Parsing Scenarios
- [ ] Trainer: Test AMRAP, FOR TIME, EMOM, STRENGTH formats
- [ ] Nutritionist: Test photo uploads and text descriptions
- [ ] Socius: Test workout trends, nutrition analysis, cross-domain queries
- [ ] All scenarios work as expected
- [ ] No new errors introduced
- [ ] Response times similar to before

### Edge Cases
- [ ] Trainer: Empty input, very long input, special characters
- [ ] Nutritionist: Blank photo, corrupted image, non-food photos
- [ ] Socius: Empty query, very long query, queries with no data
- [ ] No crashes or JavaScript errors
- [ ] Appropriate error messages for each edge case
- [ ] Application remains functional

---

## Performance Testing

### Response Times
- [ ] Successful parsing: Response times similar to baseline
- [ ] Error scenarios: Quick responses (no long timeouts)
- [ ] Diagnostic logging: No noticeable delays
- [ ] Overall user experience: Smooth

---

## Console Logging Quality

### Diagnostic Information Completeness
- [ ] Logs include agent type
- [ ] Logs include timestamp
- [ ] Logs include raw LLM response (or truncated)
- [ ] Logs include error message/parsing failure details
- [ ] Logs include user input hash (for correlation)
- [ ] Logs formatted for readability

### Log Formatting
- [ ] Clear prefixes (e.g., `[AGENT ERROR]`)
- [ ] Appropriate console methods (console.error for errors)
- [ ] Structured and easy to scan
- [ ] Long responses truncated appropriately (>1000 chars)
- [ ] No sensitive information (passwords, tokens)

---

## Final Summary

**Total Tests**: _____ / _____

**Pass Rate**: _____%

**Critical Issues Found**: _____

**Regressions Found**: _____

**Ready for Production**: ☐ Yes ☐ No

---

## Notes

[Add any additional observations or findings here]

---

*Completed by: ________________*
*Date: ________________*
