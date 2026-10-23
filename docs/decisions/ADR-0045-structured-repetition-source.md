# ADR-0045: Structured repetition source on recorded sets

- Status: Accepted for implementation; production deployment and athlete import remain separately approved actions
- Date: 2026-10-22
- Deciders: Greg (source preservation intent), Codex (bounded implementation), independent source-contract oracle review

## Context

ChatGPT is the operating interface and Socius stores typed, auditable facts (ADR-0044). The existing QWIK 1.10 adapter retains several phase metrics in observation metadata, but its wrapper format differs from the observed iOS array export and its persistence transaction does not attach measurements to an existing workout. That export records ordered concentric and eccentric phases with separate mean/peak values, IDs, frames, durations, pauses and signed eccentric motion. Its large raw bar-path array has no declared coordinate unit or frame rate. Existing ID-less performed sets must survive amendments without reconstruction or score/PR churn.

## Decision

Add a bounded versioned `velocity.recording` source object through a typed revision-bound `setRecordings` amendment, retain the exact original file externally by reference and SHA-256, and compute explicitly selected summaries separately from stored source values.

## Consequences

- Reuse the existing owner-authorized mutation, request ledger, immutable revision and verified readback. Paths are bound to the caller's current revision; source identity cannot be attached twice within a workout.
- Keep existing scalar velocity fields, all other set JSON and their provenance unchanged. Imported recording leaves receive exact-path imported/unreviewed provenance; confirmation cannot relabel an estimated source leaf.
- The existing database function excludes the entire velocity object when comparing projection inputs. No migration, table, grant, flag, storage upload or credential change is necessary; real SQL tests must prove unchanged projections and complete roundtrips.
- The source adapter supports the observed array shape explicitly, not an invented vendor version. Missing and null phases differ. Source RPE strings, load units and undeclared plate diameter are retained without replacing workout facts.
- Raw traces remain in the user-retained original artifact. This avoids duplicating large, incompletely specified traces in every workout revision; durable artifact upload/retention and analytical observation promotion remain separate slices.
- Legacy 1.10 import and scalar velocity tools remain supported. New recording amendments do not promote adaptive programming evidence or alter accepted plans, goals or numeric coaching policy.

## Alternatives considered

1. Extend the existing observation import tables: useful for future reviewed evidence promotion, but requires a larger transactional link to an existing set, new array adapter semantics and missing device/export-time handling.
2. Add a sibling set recording field: clearer physical naming, but requires a database migration solely to teach projection comparison that the new metadata is not a score input.
3. Store raw vendor JSON/traces in workout rows: preserves bytes poorly after JSON normalization and needlessly multiplies large traces across revisions; exact file hash plus external artifact retains the original instead.
