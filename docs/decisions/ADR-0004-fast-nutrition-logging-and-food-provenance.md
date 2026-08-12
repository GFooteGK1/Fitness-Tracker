# ADR-0004: Fast nutrition logging and food-fact provenance

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), ADR-0002 (food-photo eval data)

## Context

Repeated meals should take seconds to log, and packaged foods should use facts
from their nutrition labels. Re-running an LLM for either case would add cost,
latency, and avoidable variation. Meal and label photos are not retained today
and remain a separate privacy decision.

## Decision

### The meal log remains canonical; common meals are a projection

Common meals are derived from exact, user-owned, non-review-pending meal
snapshots. Frequency, recency, and stable tie-breaking are computed in
application code. Quick logging copies the selected snapshot into a new meal
with a fresh local-date-aware UTC timestamp, a source-meal reference, and an
idempotent request UUID. There is no mutable common-meal template that could
rewrite history.

### Reviewed manual label facts live in a private catalog

`food_catalog_entries` stores the current reviewed name, brand, serving basis,
macros, normalized source snapshot, explicit corrections, and
verification/use timestamps. RLS is forced and every policy is scoped to the
authenticated owner. Each meal stores a macro snapshot plus a catalog/provenance
reference inside its item JSON, so later catalog edits do not change historical
totals.

The athlete enters the serving and macro values from the package label, then
reviews them before logging. The application records this as a `manual_label`
entry. Label and meal images are not retained. Image retention still requires
the separate privacy, storage-cost, and deletion-policy decision recorded in
ADR-0002.

### Application code computes every logged value

Serving multiplication, macro totals, repeated-meal ranking, and correction
diffs are deterministic application functions. Neither common-meal logging nor
manual-label logging calls the LLM. AI-assisted label OCR may be considered
later only as a bounded draft-producing path with the same review and
provenance rules.

## Consequences

- Repeated meals become a one-tap action after entering the existing Add Meal
  surface.
- Package data can be corrected without losing its source snapshot.
- Deployments must apply the nutrition fast-log migration before deploying the
  routes that use its columns and catalog table.
- Label-photo OCR remains an optional follow-on provider, not a hidden
  dependency of this release.
