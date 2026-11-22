# ADR-0048 - Saved daily check-in for SociusFit Today

- **Status:** Local candidate. Hosted and athlete verification are pending.
- **Date:** 2026-11-21
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0046](ADR-0046-today-check-in-guidance.md)

## Decision

Today saves the athlete’s explicit check-in in `coach_daily_checkins`. Each owner has one row per local calendar date. An explicit save replaces that date’s answers, and the confirmation echoes the verified row. Opening Today reads the same date and regenerates the recommendation from the saved answers and current coaching context. The private save tool requires the verified Today pilot owner and the existing MCP writes flag. It verifies the date against the supplied current timezone offset before saving. New saves require stress, fatigue, sleep, soreness, and motivation. The two added prompts follow the coaching reference and are proposed fields for this candidate.

`get_coaching_context` includes the same date’s answers, with missing and unavailable states. The owner-scoped coaching read checks the check-in along with its other sources. For the Today pilot, chat also receives the recommendation from the same guidance function, using current sources. The athlete can follow that recommendation or ask their chosen LLM for adjustments. An accepted training plan changes only through its existing review flow. The legacy three-field preview and previously published Today resource aliases remain available for installed clients during refresh.

## Alternatives considered

- Widget state could survive some reopens in the same client. A saved backend row also supports fresh chats and other clients using the same coaching context.
- `coach_checkins` owns follow-up and prescribed-session feedback. Its reachable writers enforce that workflow. `readiness.self_report` is a single five-point observation. A dedicated daily row gives all five answers a typed contract and an owner/date key without broadening grants on session feedback.

## Rollout

Apply the additive table migration before deploying the widget and MCP change. Verify an explicit save, a fresh Today open, and a fresh coaching chat with the pilot owner. Verify that the first open on the following local day has no check-in. Disabling the MCP writes flag unmounts the save tool, and rolling back the app can leave previously saved rows in place.
