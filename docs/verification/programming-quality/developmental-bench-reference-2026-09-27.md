# Accepted developmental bench reference — verification receipt

Canonical task: `Fitness-Tracker-i40.1.7`. Scope: reviewed P0 input for later P1
continuity work. Greg accepted the complete synthetic base and Tuesday/Wednesday
swap with "Usable as this test reference" on 2026-09-27.

Artifacts:

- [Accepted source](developmental-bench-week-1.md).
- Source snapshot and schedule maps:
  `test/fixtures/reviewed-developmental-bench-week.json`.
- Separate single-exposure progression judgment: C2-R in
  [policy-review-round-1.md](policy-review-round-1.md). No exact increment inferred.

The fixture stores each complete session as source text, including preparation,
work, effort and rest, with stable session IDs and content hashes. Both schedules
reference the same session and monitoring definitions. It is an offline source
snapshot, not a replacement for typed runtime prescription contracts.

## Direct verification

Checks read the saved JSON and accepted Markdown independently. All five complete
session sections match their saved content and SHA256. The monitoring section
matches its saved content and SHA256; actual velocity observations remain empty.
Both schedules contain each of the five sessions once, retain Thursday/Sunday
rest, and fit the explicitly declared availability. The only changed days are
Tuesday and Wednesday: bench volume moves earlier, running moves later.

Time sums read from the source's component rows: Monday 54:21, bench volume
42:09, running 42:42, Friday 48:09, Saturday 67:09. Weekday allowance is 60 minutes;
Saturday is 75. These are planning estimates, not measured durations.
The source contains Greg's actual response; the fixture records qualitative
acceptance, null rubric scores and `runtimeAuthority: false`.

- Source SHA256, CRLF normalized to LF:
  `205356ebd232c632263a8c42a6fd0e9bfb2513aa9bdaf41b5107959a40f82cad`.
- Fixture SHA256, saved bytes:
  `379e040c9a38d4a5ebe0d3098073ff782549651dd5865ebfdc9ba7b202333f8a`.

Only documentation and a data fixture changed. No application build or new
test suite was needed for this snapshot. The source-text and schedule checks
do not prove compiler behavior, persisted acceptance, source-correction
invalidation or physiological outcomes.

## Remaining boundary

The reviewed-base prerequisite is now satisfied for this limited synthetic case.
P0 as a whole, applicable `qsp`/`u5l.6` reconciliation and P1 implementation remain
open. Actual device/setup metadata is still required before sensor comparisons;
there is no measured monitoring series in this fixture. No numerical activation,
production deployment or new paid evaluation was authorized or performed.
