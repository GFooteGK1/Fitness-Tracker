# ADR-0039: Chosen LLM programming and durable Socius context

- **Status:** Accepted target; migration is incremental and is not fully implemented
- **Date:** 2026-10-19
- **Decider:** Greg Foote
- **Related:** ADR-0001, ADR-0003, ADR-0038; `docs/plans/socius-durable-context-goal-2026-10-19.md`

## Decision

The athlete uses one input/output plane in their chosen LLM harness. That LLM creates programming, interprets context and explains recommendations. Socius owns durable model-independent records/context, provenance/history, deterministic calculations and narrow validated operations. A mandatory embedded API-model programmer or coach is not part of the target.

This supersedes the target authority rule in ADR-0003 that the app computes prescriptions while the model only explains them. It does not remove useful deterministic calculations or structural validation. It does not rewrite historical reference/policy versions or turn unreviewed chat inference into confirmed athlete facts. Existing numerical targets and thresholds require their own evidence; passing software tests does not establish training efficacy.

Current embedded generation remains legacy behavior until a separately authorized retirement release. Preserve accepted historical plans, sessions, rationale, IDs, policy snapshots, completion links and logging. Future selected-LLM proposals remain unsaved until the authorized durable save/accept operation succeeds; a read tool grants no mutation authority.

## Alternatives and consequences

Continuing an embedded programmer would preserve the duplicate coaching surface and conflict with the user's explicit direction. Replacing the application wholesale would discard useful storage/auth/provenance contracts without resolving the missing evidence. Evolve incrementally instead: qualify factual coverage first, then narrow persistence, portability and retirement.

The first external reference publication is repository-backed, versioned and read-only, with review scope, provenance, supersession and complete/selected-content hashes. `get_coaching_context` points to `get_coaching_reference`; the selected LLM can request up to four whitelisted detailed domains alongside the core. The bounded contract is recorded in `docs/plans/socius-coaching-reference-read-2026-10-19.md`. A database/document copy would allow publication independent of releases but needs synchronization ownership; the first slice avoids duplication and new schema while remaining coupled to normal releases. It does not rewrite athlete requirements or the legacy internal reference.

The current integration is an owner pilot with broader owner credential rights and an unattested original OAuth resource. It is not a generally qualified multi-user authorization platform. Future client/grant/permission changes, migrations, live writes, deployment, data deletion and notifications retain their own explicit scope and approval gates. This accepted target is not blanket rollout authority.

## Delivery

Use the goal's ordered Beads-backed slices. Software completion requires tests/review passed, committed and merged through normal CI and branch protection. Record deployment, real-data verification and product acceptance separately. Current release, merge and owner-data acceptance states are recorded in the goal and dated verification receipts; format compatibility must be established with actual source evidence and a released owner read. Other domains have different storage/exposure/population evidence. Retire embedded authoring only after the replacement path has end-to-end proof and a specific release decision.
