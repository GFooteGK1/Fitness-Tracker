# W7 legacy insight retirement and passive source validity

Author verification: local synthetic tests only; no provider calls, production writes, or live account claims. Independent review is recorded separately by the reviewer.

## Scope and behavior

`app/lib/agents/legacy-insight-guard.ts` permanently rejects `NUT_PERF`, `HRV_TREND`, `CAL_DEF`, `STRAIN_NUT`, and `PRO_REC`, including whitespace/case variants. The matching old fitness insight types `nutrition_performance`, `nutrition_strain`, and `recovery_nutrition` are also rejected. Recommendation rollout flags cannot restore these unsupported contracts. No replacement physiology or numerical dose rule was introduced.

The background checkers remain callable compatibility entries returning null. Their unsupported rules were removed. The old fitness endpoint no longer manufactures a 70 kg athlete or a strain-related calorie deficit from partial meal logs. Socius response parsing removes retired typed insights and replaces associated prose/data points with an evidence-unavailable response, even at model confidence 1. Persistence, passive context, all three model prompts, urgent-response prepending, and V2 insight/chat displays enforce the same permanent boundary. Meal timing is now a factual count of distinct logged workouts with linked pre-workout meal records, with unknown intake coverage and no fueling prescription. Stored low-energy ratings retain their factual summary while stating that the cause is unknown. Other unrelated classes remain unchanged.

Historical rows and raw metrics remain stored. Typed insight chat rows are displayed/reused only after resolving their owned insight source. Missing/unavailable source lookup withholds only those typed rows; user text is retained. Existing unlinked Socius analyst prose has no source contract. It remains in visible chat history but is excluded from model conversation context. This deliberately limits conversational recall of old analyst replies; fresh verified recommendations enter model context separately. Chat compaction cannot copy a retired typed insight into new summary facts.

`targets_confirmed` requires actual valid persisted target values. Absent or malformed targets use zero placeholders only for legacy arithmetic compatibility; model prompts show unknown targets, remaining budget and adherence. Explicit stored zero values survive. Prompts distinguish logged totals from complete food intake and cannot infer a calorie deficit from partial logging.

Passive WHOOP observations retain dates and last sync time. Eligibility requires an owned connection, idle successful sync within the existing WHOOP endpoint's 24-hour freshness window, no error, and a nonfuture clock. Current readings must have the athlete's current local date. A second sync-state read must match the first completed generation; a final check after historical aggregates must also match. Disconnected, stale, syncing, error, changed-generation, and future-source states are unavailable. Even passive cache hits refresh this validity check; local-date/timezone changes invalidate cache reuse. Historical Socius WHOOP averages are withheld without eligible sync. The fitness insight endpoint uses the same source eligibility and only current dated readings for current advice. Raw source history is preserved.

This is a deterministic contract/source guard. It is not a semantic verifier for arbitrary model prose lacking typed insight metadata. Prompt instructions restrict unsupported claims; the replacement recommendation path has its own deterministic evidence rules.

## Verification

Author run: **16 suites / 325 tests passed**, plus `npx tsc --noEmit` passed. Two additional distinct linked-workout timing and cause-unknown energy cases then passed in the **8-test fitness insight API suite**, and type checking passed again. Independent review reran the 16-suite/325-test snapshot successfully before those two test-only additions. New tests cover retired confidence/flag rollback, normalized retired identifiers, owner-bound historical reads, unlinked analyst visibility versus model exclusion, partial/missing targets, explicit zeros, stale/disconnected WHOOP, mid-read sync changes, cache timezone/day rollover, and fitness-endpoint advice filtering.

```powershell
npx vitest run test/api/fitness-insights-evidence.test.ts test/agents/legacy-insight-guard.test.ts test/agents/passive-evidence-validity.test.ts test/agents/socius-agent.test.ts test/agents/socius-background.test.ts test/agents/socius-background.property.test.ts test/agents/context-builder.test.ts test/agents/context-builder.property.test.ts test/agents/chat-persistence.test.ts test/agents/chat-persistence.property.test.ts test/agents/chat-compaction.test.ts test/agents/chat-compaction.property.test.ts test/agents/socius-prompt.test.ts test/agents/trainer-prompt.test.ts test/agents/nutritionist-prompt.test.ts test/v2/insight-sorting.property.test.ts
npx tsc --noEmit
```

Older tests that required retired claims now require their withholding. Generic parser/persistence fixtures use retained pattern types, so confidence, serialization, ordering and unrelated behavior remain tested. Property tests retain raw storage round trips while expecting unresolved typed insights and unverified analyst prose to be withheld from model reads.
