# ADR-0051 - Five-point Today check-in

- **Status:** Local candidate. Migration and installed-host verification are pending in production.
- **Date:** 2026-11-22
- **Related:** [ADR-0048](ADR-0048-saved-today-check-in.md), [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md)

## Decision

Today asks for a whole-number rating from 1 to 5 for stress, fatigue, sleep, soreness and motivation. Higher always means better. Very high stress, fatigue or soreness score 1. Very poor sleep and very low motivation also score 1. The form starts without defaults for a new day.

Keep one check-in row per athlete and local date. Add nullable integer columns for the exact ratings. The row contains either all five ratings or none. Existing relative-to-usual answers keep their original values and appear with their scale identified. The athlete can replace an earlier check-in by saving all five ratings. A saved relative check-in remains valid evidence for the draft on the same local day.

Numeric saves also populate the older display categories. A score of 3 maps to the middle category. Scores 1–2 and 4–5 map to the unfavorable and favorable categories for each field. The database enforces these pairings. The numeric read surface and draft use exact ratings when present. The compatibility categories support cached widgets and an application rollback. A changed legacy answer replaces the check-in at its original precision. An equivalent legacy save preserves the exact ratings.

The daily drafting evidence binds the values and their scale. A correction within the same compatibility category still requires a fresh prepare call before displaying the revised draft. Requests to author or revise today's session use the same workflow defined in [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md).

## Alternatives

- Converting old categories to scores would assign precision the athlete never supplied.
- Changing the old columns in place would prevent the existing app from reading numeric saves during rollback.

## Release sequence

Apply and verify the additive migration before deploying the new app. Verify the intended ChatGPT host shows the 1–5 form, reads the saved scores after reopening, and uses them for a fresh draft and a revision. An application rollback can leave the added columns and preserved rows in place.
