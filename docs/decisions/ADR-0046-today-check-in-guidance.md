# ADR-0046 - One-day guidance in SociusFit Today

- **Status:** Historical decision. [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md) retires in-widget daily recommendations and check-in previews in its candidate.
- **Date:** 2026-11-21
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0040](ADR-0040-owner-pilot-whoop-timing.md), [training doctrine](../coach/training-doctrine.md#recovery-and-fatigue-management)

[ADR-0048](ADR-0048-saved-today-check-in.md) describes the local candidate that adds durable check-in storage to the design below.

## Decision

The private Today dashboard gives the signed-in owner optional same-day guidance about effort and what to do next. The athlete compares stress, fatigue, and sleep with their usual. Submitting the check-in reruns the existing owner-scoped context read and returns guidance inside the widget. The check-in and resulting guidance are ephemeral. The chosen LLM retains authority for authoring workouts and programming.

`open_socius_today` still accepts the empty global launch and timezone-only hydration. An optional, validated check-in requires a timezone offset. The result extends widget-only `_meta` with actions and reasons derived from the assessment, confirmed goal, recent work and any session scheduled for the current local date. A current saved review action takes precedence. An adverse answer offers a gentler start. Aligned adverse answers or a high confirmed session effort offer an easy day. Session effort applies only to the current or preceding local day and must be athlete-confirmed or corrected. The 8.5/10 cutoff is a conservative product heuristic for offering an easy option. Numerical training dose remains outside this decision.

WHOOP remains visible with its recorded freshness. The recovery context marks local-day alignment unverified, so its values carry no weight in the guidance. The widget expires the assessment when the athlete's local day changes. The existing tool registration and owner guard remain the access boundary. No new write, schema, external model call or permission is needed.

## Alternatives considered

- Continue showing the saved weekly plan as Today’s recommendation. This keeps loading simple and leaves the athlete’s current check-in unused. The saved session still helps as context after the assessment.
- Send a chat draft or add an embedded model. The former depends on a host workflow that already failed in the installed app. An embedded model would introduce a second owner for workout authoring and another provider call. The Today card instead gives a bounded recommendation using evidence already available to the owner view.
