# Approved signal-review fixes

Date: 2026-09-21. Tasks: `Fitness-Tracker-i40.6.1` and `Fitness-Tracker-i40.6.2`.
Authority: Greg explicitly approved these two local fixes after the six-case review and executable gap analysis. Broader package acceptance, numerical policy and production activation remain separate.

## Result and scope

**Improvement preserves the accepted prescription.** The evaluator still identifies an improved outcome, but weekly mapper `weekly-review-0.4.0` returns continuation with an explicit explanation that improvement alone does not justify more work. One matching assignment and an available policy increment no longer cause a dose increase. Both one- and two-assignment cases compile unchanged accepted work into the next week. Safety and recovery precedence remain intact. A later justified-change operation still needs its own reviewed policy and evidence; no new numerical criterion is introduced here.

**Signal facts reach the saved review together.** The review endpoint reads source-scoped performed history through the existing capability and attaches `signal-evidence-context-1` to the API response, input fingerprint and stored rationale. Shared decision readback preserves selected readings and provenance, explicitly recorded sensor counts, and working records linked by workout and movement. The chat prompt treats these as factual companion context, not evidence that the numerical evaluator already reconciled mixed signals.

Expected readings, observed readings and performed repetitions remain separate. Existing records without explicit count metadata stay unknown. The optional `valueProvenance.measurementCoverage` contract accepts version 1 and explicit nullable counts; it adds no capture UI and does not validate a sensor. Partial retrieval cannot establish sensor loss. Prescribed reps and ordinal gaps never fill unknowns. Working records retain exact/bounded/unknown quantities, literal weight text, source limitations, completion uncertainty and separate session effort.

Full observations that exceed the size or structural bounds are omitted explicitly. Saved decoding checks identity, metadata/count agreement, timestamp, owner and structure. Valid optional context that would exceed the shared decision budget is omitted with a marker while preserving the valid core decision. Old records without the new field stay compatible. Historical accepted-origin factual sources are marked freshness-unknown unless a tracked correction already establishes corrected status; the additional facts are not falsely labeled evaluator-consumed merely to obtain invalidation tracking.

The current review retains the existing context-revision fence, including canonical workout mutations. No new migration or storage table is needed. `initialDosePolicy` and other capability settings remain unchanged. The accepted athlete plan is not mutated.

## What remains unimplemented

This is a factual evidence bridge and a correction to automatic progression. It does not select a protocol-specific missing-sensor rule, quantify fatigue, infer capacity loss, automate mixed-signal physiology, or create a numerical VBT adapter. The accepted six behaviors are broader than these two fixes. In particular, investigation workflows, justified numerical changes, and general dose-preserving rescheduling still belong to their existing packages.

The prior [evaluation report](reviewed-signals-report.json) is a historical pre-fix artifact. Its direct-improvement downstream observation was `collect_signal`; the new regression proves continuation under the revised mapper. The original baseline, signal traces and reviewed-signal report are preserved rather than silently rewritten.

## Verification

Verification exercises actual evaluator → weekly mapper → compiler paths, a case with room for the former increase, accepted input immutability, and safety precedence. Factual context checks cover explicit/unknown/conflicting counts, incomplete retrieval, missing readings, same-workout/movement association, provenance, foreign ownership, inconsistent as-of time, deep metadata, large ordinals and whole-record budget omissions. Stored readback tests include malformed payloads, contradictory recorded counts, old-record compatibility, optional context overflow and historical source freshness. API tests inspect persisted rationale, fingerprint and returned facts.

Combined regression: **338 tests across 19 files passed**. After final producer/readback edge fixes for empty movement identity and high workout revisions, **54 focused tests across four files passed**. Full TypeScript, focused ESLint and whitespace checks passed. Independent review verified the mapper and factual API/readback boundaries, identified the missingness, uncertainty, metadata-consistency, size-limit and historical-freshness issues, and rechecked their fixes. The final workout-revision limit fix has an explicit 20,000-revision roundtrip regression.

The evaluator → mapper → compiler regressions use actual local functions. API attachment tests use the real factual builder with mocked evaluator/persistence services; they verify arguments and returned data, not hosted database writes. Shared readback tests validate the persisted JSON projection and prompt context. No hosted database, live athlete account, browser visual check, paid/model evaluation, deployment, commit or push is part of this verification. See [ADR-0027](../../decisions/ADR-0027-signal-facts-before-prescription-changes.md) for the authority and architecture decision.
