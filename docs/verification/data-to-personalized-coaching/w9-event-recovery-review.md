# Independent event recovery and bounded-rule review

Reviewed the coordinator's `event-recovery.ts`, recommendation event and coverage APIs, recent `rules.ts` changes, and `service.ts` coverage exposure against the actual W7 SQL. The reviewer authored the database slice, but did not author these application changes. This is an independent application review supported by separately executed database regressions.

No important finding remains in this bounded review.

## Recovery proof

`confirmedUnwrittenEvent` matches both exact database error code and exact message, scoped to the RPC family. It recognizes only source/date/current-state/defer rejections that occur after exact-event replay and before a new row is written. A generic 40001 or 55000, a payload conflict, an unknown serialization error, a missing message, an unrelated RPC error, and a thrown transport failure are not accepted as no-write proof. API responses preserve the caller's original request identity and set `noWriteConfirmed` and `refreshRequired` together only for recognized proof. The APIs do not invent a replacement request or activity.

Actual SQL regression proves a committed deferred response and shown acknowledgement replay before source/runtime/local-date freshness checks, including a changed timezone whose local date differs. New stale responses return the exact recognized current-state error. A changed response payload remains a separate collision. A new expired defer returns the exact recognized pre-write validation error and creates no event. Saved coverage replays after source changes; new stale coverage source/date attempts return their distinct recognized errors, while changed replay payload stays a collision. Rejected attempts leave only the original committed rows.

## Rule and coverage delta

A current `collect_signal` review routes to the existing plan review at signal-request priority. It records the authoritative review reference, retains accepted-plan authority, and creates no invented measurement or outcome specification. Safety/retracted-review navigation still takes precedence.

Nutrition uses a saved target and actual logged entries without requiring unrelated training intent. Protein and calorie remainders are simple nonnegative logged arithmetic. Estimates and explicit coverage-through time remain labeled; missing targets are not filled with defaults, and the text does not infer total intake, a deficit, a trend or a new prescription. The existing actual-SQL journey independently demonstrates the no-intent target path and separate explicit coverage action.

The service forwards stored coverage with its validity flag. Only `coverageValid` reports enter rule evaluation. It does not promote Done into coverage or convert a stale report to current completeness.

## Executed evidence

`npm test -- --root . --exclude '**/.worktrees/**' test/recommendations/event-recovery.test.ts test/database/recommendations.test.ts test/recommendations/rules.test.ts test/recommendations/service.test.ts test/database/recommendation-journey.test.ts`

Result: **78 tests passed across five files** (17 independent recovery/API cases, 30 actual SQL recommendation cases, 14 rules, 10 service and 7 actual application/SQL journeys). No SQL runtime change was needed. These are synthetic local results; external/hosted behavior is not claimed.
