# Bugfix Requirements Document

## Introduction

The classifier incorrectly asks users for clarification when they provide obvious meal inputs with portions and specific food items. This creates friction in the meal logging flow and violates the design principle that clear meal inputs should be confidently classified and routed to the nutritionist agent.

The bug manifests when users provide natural meal descriptions like "I had 170g of 0% greek yogurt and 65g of peanut butter granola" — the classifier returns `unclear` or confidence < 0.5, triggering the clarification message "I'm not sure what you'd like to do. Could you clarify — is this a workout, a meal, or a question?"

This bug impacts user experience by requiring unnecessary clarification steps for straightforward meal logging, which is a core feature of SociusFit.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user inputs a meal description with portions and common food items (e.g., "I had 170g of 0% greek yogurt and 65g of peanut butter granola") THEN the classifier returns `unclear` or confidence < 0.5

1.2 WHEN the classifier returns confidence < 0.5 THEN the router triggers the clarification flow asking "Could you clarify — is this a workout, a meal, or a question?"

1.3 WHEN the LLM classifier fails and falls back to keyword matching THEN common food items like "yogurt", "granola", "peanut butter", "banana", "avocado", "berries" are not recognized as nutrition keywords

1.4 WHEN a meal input contains portions (e.g., "170g", "65g") and past-tense food verbs (e.g., "had", "ate") THEN the keyword fallback does not leverage these strong meal indicators to boost confidence

### Expected Behavior (Correct)

2.1 WHEN a user inputs a meal description with portions and common food items (e.g., "I had 170g of 0% greek yogurt and 65g of peanut butter granola") THEN the classifier SHALL return `meal_log` with confidence >= 0.8

2.2 WHEN the classifier returns `meal_log` with confidence >= 0.8 THEN the router SHALL route directly to the nutritionist agent without asking for clarification

2.3 WHEN the LLM classifier fails and falls back to keyword matching THEN common food items like "yogurt", "granola", "peanut butter", "banana", "avocado", "berries" SHALL be recognized as nutrition keywords

2.4 WHEN a meal input contains portions (e.g., "170g", "65g") and past-tense food verbs (e.g., "had", "ate") THEN the keyword fallback SHALL boost confidence to >= 0.7 for meal classification

2.5 WHEN the LLM classifier prompt includes examples of meal inputs with portions THEN the classifier SHALL learn to confidently identify similar patterns

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user inputs an ambiguous message like "hey" or "hello" THEN the classifier SHALL CONTINUE TO return `unclear` with confidence < 0.5 and trigger clarification

3.2 WHEN a user inputs a clear workout log (e.g., "5 rounds: 10 DL 225#, 15 BJ — 14:07") THEN the classifier SHALL CONTINUE TO return `workout_log` with confidence >= 0.9 and route to trainer

3.3 WHEN a user inputs a cross-domain question (e.g., "How does my protein intake affect my recovery?") THEN the classifier SHALL CONTINUE TO return `question` with domains `["socius"]` and confidence >= 0.8

3.4 WHEN a user inputs a mixed log (e.g., "Had a protein shake after my deadlift session") THEN the classifier SHALL CONTINUE TO return `mixed` with domains `["nutritionist", "trainer"]` and confidence >= 0.7

3.5 WHEN the LLM classifier successfully returns a valid classification THEN the keyword fallback SHALL CONTINUE TO not be invoked

3.6 WHEN a user inputs a meal without portions (e.g., "Had a protein shake and banana") THEN the classifier SHALL CONTINUE TO classify as `meal_log` with confidence >= 0.8 (portions are not required for meal classification)
