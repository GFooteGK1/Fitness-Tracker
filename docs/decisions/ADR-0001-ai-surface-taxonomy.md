# ADR-0001: AI-Surface Taxonomy and the Compute-vs-Compose Boundary

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** Greg Foote
- **Related:** OpenAI provider migration (the `app/lib/llm/` seam), per-task model-cost strategy

## Context

We are migrating the app's AI provider from Anthropic to OpenAI. A per-interaction
cost analysis found that the multi-round agent loop (`app/lib/agents/tools/agentic-loop.ts`,
up to 3 tool rounds, plus the fire-and-forget background Socius call on every
meal/workout log) costs roughly **20–55× a single direct extraction call**. The
cost driver is structural, not the model tier.

The migration was originally framed as a binary fork: v1 (direct pages calling
extraction routes) vs v2 (the chat-first agent UI under `/v2`). That framing is
wrong, because it pushes the app's **highest-frequency** interaction — logging —
through its **most expensive** path. The better question is per-surface: *where
does AI-first interaction add user value beyond its cost?*

## Decision

Decide treatment per surface, on three buckets, governed by one hard rule.

### Surface taxonomy

| Bucket | Surfaces | Treatment | Rationale |
|---|---|---|---|
| 1. Deterministic (keep as-is) | Meal logging, workout logging, PR entry/bulk-import (text + photo) | One direct extraction call, no agent loop; cheapest capable model | User-input-driven every time; value is fast, accurate capture, not conversation. High frequency ⇒ must stay cheap and work offline. |
| 2. On-demand AI-composed | Dashboard, food-progress, program/progress views | Composed when asked, not persisted; hybrid render (below) | Synthesis/presentation viewed occasionally; no reason to maintain hardcoded pages + aggregation crons when the AI can compose on demand. |
| 3. AI-first conversational | Holistic query, coaching, programming recommendations (Socius/agent loop) | Full agent loop | This *is* the AI-first value — ambiguous, multi-domain, pull-based. |

### Non-negotiable rule: the app computes the numbers, the AI composes the presentation

Every figure shown to a user is computed in application code from the database
and passed to the model as a **pre-computed value**. The model never calculates a
statistic; it decides layout, ordering, narrative, and tone. This single boundary
buys three things at once:

- **Trust** — no hallucinated totals; a dashboard's protein figure is `sum(meals)`
  computed in code, never an LLM guess.
- **Cost** — prompts carry compact aggregates, not raw rows.
- **Simplicity** — it makes the view template (below) a pure formatting contract.

### On-demand dashboards: hybrid render

An on-demand view is not a slow, blank-until-AI page. Computed numbers render
**instantly** from ordinary DB reads; the AI-composed narrative/layout **streams in
over them**; the composed view is **cached for the day** and invalidated on a new
relevant log. "On-demand" means not-persisted-as-a-page, not slow-every-time.

### User-editable view template ("skill")

A **versioned output contract**, per-user with a default fallback, that the user
edits **within a schema** (not free-form): it defines sections, ordering,
visibility, and tone for a given view type (e.g. "weekly review: macros first,
then recovery, hide sleep detail, terse"). It doubles as the OpenAI
structured-output schema for that view. Editing within a schema means a bad user
edit cannot break rendering.

## Consequences

- **Cost is bounded by engagement, not data entry.** The expensive agent path
  fires on views and questions (~5–15/day) rather than on every one of ~150
  logs/month. Estimated well under $1/active user/month with the model-cost
  levers applied — materially cheaper than routing everything through the agent.
- **Latency** on composed views is mitigated by the hybrid render; a loading
  state covers the streamed narrative only.
- **Offline/PWA:** logging stays deterministic and offline-capable; composed
  views require connectivity (acceptable — the gym-critical path is logging).
- **Trust** is preserved structurally by the compute-vs-compose rule.

## Migration sequencing

1. Port the **bucket-1 logging routes** first through the `app/lib/llm/` seam —
   cheap, deterministic, low-risk.
2. Build the **view-template primitive** and the **on-demand composition** path
   (bucket 2) on top of the seam.
3. Retire the **persisted dashboard pages** into the on-demand path last.
4. Bucket-3 conversational surfaces port with the agent loop (the trickiest seam
   work) and are model-selected by the tool-trace eval.

## Follow-ups (tracked in beads)

- View-template schema + storage (per-user + default, versioned).
- Compute-aggregates data layer feeding pre-computed numbers to composed views.
- Hybrid on-demand dashboard (instant numbers + streamed narrative + daily cache).
- User-edit surface for the template (settings + natural-language adjust).
- Retire persisted dashboard/progress pages into the on-demand path.
