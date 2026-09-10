# ADR-0009 - Daily action navigation

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Greg, Codex

## Context

Greg approved the charcoal-and-mint mobile mockups in the UI modernization
conversation. The dashboard currently prioritizes narrative and historical
metrics; the navigation occupies valuable mobile space. Logging and accepted
plan execution already have canonical routes and retry contracts.

## Decision

Keep `/dashboard` as the daily entry point so existing sign-in redirects remain
valid. Move its historical reporting to `/progress`. Add `/capture` as a short
choice between existing logging paths. Use five stable mobile destinations:
Today, Plan, Log, Progress, Coach. The conversational Coach retains its own
full-height navigation in this first slice.

Today reads stored sessions through `/api/coach`. It does not generate a plan,
infer rest from missing activity, or mark anything complete. Use progressive
disclosure for narrative detail and plan-update information. Preserve the system
light/dark preference with shared surface and action tokens.

## Alternatives

1. Restyle the existing long dashboard: lower routing cost, but retains the
   hierarchy problem Greg identified.
2. Rebuild logging and coaching together: closer to the entire mockup at once,
   but would couple visual work to persistence and assessment changes.
3. Deliver the approved visual foundation over existing contracts: selected.

## Consequences

Historical reporting has a new destination, with existing detail routes still
reachable. Bottom-fixed navigation requires matching offsets for sticky actions
and safe-area padding. The first slice retains precise RPE entry and existing
meal correction semantics. Photo analysis currently saves an estimate before
review; labels must not imply that the first write occurs only after review.
Whole-meal portion scaling and save-after-review require a later contract change.

## Verification

Check authenticated and signed-out navigation, accepted/empty/error plan states,
meal entry modes, unchanged session retry behavior, small-screen action overlap,
light/dark contrast, and typecheck/build. Browser fixtures simulate account and
API responses; they are not production transaction proof.
