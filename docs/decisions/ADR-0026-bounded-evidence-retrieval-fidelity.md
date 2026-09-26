# ADR-0026 - Bounded evidence retrieval with visible omissions

- Status: Accepted for local implementation under the programming-quality QPlan
- Date: 2026-09-21
- Scope: P2 evidence contracts, not numerical prescription policy

## Decision

Preserve field provenance and disclose why owned records did not reach the reasoning packet. The evidence selector uses a bounded exclusion ledger with reason counts and an explicit overflow count. Invalid or oversized meaningful provenance/comparison fields omit the affected record and mark selection incomplete; they do not silently become an empty object. Source query limits still define what the selector can inspect. The ledger does not claim knowledge of rows never returned by the database.

Observation value provenance remains separate from observation-group source identity. The complete selected record or series then passes through the existing reasoning projection budget. Algorithm `coach-context-selection-0.4.0` identifies the changed selector behavior; accepted historical evidence snapshots retain their recorded versions.

Confirmed outcome IDs resolve against the owned accepted plan's validated training-intent snapshot, independently of legacy allocation IDs. Exact measurement, assessment version, protocol and binding requirements select factual evidence while preserving its semantic role. A proxy or training signal never becomes a direct outcome; the targeted evaluator retains its separate direct-evidence gate. Unknown selectors do not widen retrieval. Explicitly retrieving facts for a paused or unsupported outcome does not make that outcome eligible for adaptation. Device differences retain their existing comparability-series boundaries; the outcome contract does not invent a device preference.

Add a read-only Socius tool, `get_coach_performed_work`, for deliberate older workout retrieval through the existing canonical history reader and factual projection. The only model-supplied option is an integer lookback of 1–180 days. Owner, clock and timezone come from the authenticated request context. Passive and planning defaults remain 28 days; the 100-workout query cap and projection budget remain visible. The existing history capability controls access.

Workout RPE is projected as session effort with source path, provenance and unknown/invalid state. It does not replace movement or set effort. A historical log is factual evidence, not an independently validated max or permission to prescribe its dose.

## Alternatives and consequences

Silently clipping fields or substituting empty objects can make incomplete evidence appear complete. Returning all raw data would increase disclosure and context cost without preserving reasoning quality. Whole-record omission plus bounded accounting makes the limit inspectable.

Increasing the passive history window for everyone would change routine cost and familiarity inputs. A deliberate read tool retains current defaults while recovering older relevant logs. Its finite window and record limits mean some requests still need narrower retrieval or an explicit limitation; coverage completeness is never athlete-history completeness.

Changing numerical policies to accommodate richer facts would cross a separate review boundary. These changes grant no new dose or progression authority, write no athlete data, require no new database migration and preserve accepted plans.

Legacy strength assessments do not contain an exact catalog protocol binding.
Confirmed-outcome lookups therefore exclude them with an explicit reason rather
than guessing movement equivalence. Broader retrieval retains those assessments.
An unknown goal selector cannot widen observation or baseline selection.
