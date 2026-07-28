# ADR-0004: Fast nutrition logging and food-fact provenance

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), ADR-0002 (food-photo eval data)

## Context

Repeated meals should take seconds to log, and packaged foods should use label
facts when they are available. Re-running an LLM for either case would add cost,
latency, and avoidable variation. Barcode databases can accelerate entry, but
their data is community supplied and may be incomplete or wrong. Meal and label
photos are not retained today and remain a separate privacy decision.

## Decision

### The meal log remains canonical; common meals are a projection

Common meals are derived from exact, user-owned, non-review-pending meal
snapshots. Frequency, recency, and stable tie-breaking are computed in
application code. Quick logging copies the selected snapshot into a new meal
with a fresh local-date-aware UTC timestamp, a source-meal reference, and an
idempotent request UUID. There is no mutable common-meal template that could
rewrite history.

### Reviewed food facts live in a private catalog

`food_catalog_entries` stores the current reviewed name, brand, barcode,
serving basis, macros, normalized source snapshot, explicit corrections, source
reference, and verification/use timestamps. RLS is forced and every policy is
scoped to the authenticated owner. Each meal stores a macro snapshot plus a
catalog/provenance reference inside its item JSON, so later catalog edits do not
change historical totals.

Structured label facts are retained; label and meal images are not. Image
retention still requires the separate privacy, storage-cost, and deletion-policy
decision recorded in ADR-0002.

### Barcode lookup is bounded and review-first

The first public lookup adapter uses the current Open Food Facts v3 product
endpoint. The server owns the host and field projection, sends the required app
identity, applies a timeout and response-size cap, and queries the user's saved
catalog before the public service. Open Food Facts is attributed in the review
UI. A product is never logged directly from a provider response: the athlete
must review the serving and macros first.

The client uses the native Barcode Detection API when it is available and asks
only for UPC/EAN formats. Manual barcode entry and full manual-label entry are
always present, so unsupported browsers and provider misses do not block
logging. A camera-scanner dependency is deferred until real browser coverage
shows that the native-plus-manual path is insufficient.

### Application code computes every logged value

Serving multiplication, macro totals, barcode normalization, repeated-meal
ranking, and correction diffs are deterministic application functions. Neither
common-meal logging nor successful barcode logging calls the LLM. AI-assisted
label OCR may be considered later only as a bounded draft-producing path with
the same review and provenance rules.

## Consequences

- Repeated meals become a one-tap action after entering the existing Add Meal
  surface.
- Package data can be corrected without losing its source snapshot.
- Provider outages fall back to manual entry and cannot corrupt meal history.
- Deployments must apply the nutrition fast-log migration before deploying the
  routes that use its columns and catalog table.
- Open Food Facts rate limits and data-license obligations remain operational
  constraints; the saved user catalog reduces repeat lookups.
- USDA FoodData Central and label-photo OCR remain optional follow-on providers,
  not hidden dependencies of this first release.
