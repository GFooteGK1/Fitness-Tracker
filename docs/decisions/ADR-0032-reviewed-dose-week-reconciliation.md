# 0032 - Reconcile a reviewed dose with its complete week

- **Status:** Accepted for local implementation; synthetic weekly reference approved
- **Date:** 2026-09-28
- **Deciders:** Codex within the approved implementation scope

## Context

The accepted single-session compiler and reviewed weekly compiler have separate
source bindings. A single-session option cannot supply a missing weekly judgment.
Historical performed evidence, an accepted base prescription and a proposed dose
must remain distinguishable. Name equality alone cannot establish equipment or
protocol equivalence, and conditional time estimates cannot establish guaranteed fit.

## Decision

The authenticated weekly compiler validates an explicitly declared reviewed load
trial against a separately reviewed complete week and stores its detached source
receipt with the existing immutable registration packet. The explicit reviewed source correspondence binds the owned workout identity, revision, factual projection and date before the target exposure. Historical receipt validation does not rerun current movement eligibility.

## Consequences

- Positive: the reconciler verifies exact quantities, preparation order, reviewed
  identity linkage and unchanged surrounding work without editing the candidate.
- Positive: the original historical dose, including unknown target RPE, remains
  separate from the base and target prescriptions, with hashes and source references.
- Positive: the proposal reader exposes a browser-safe summary derived from the
  verified stored receipt; server hashing/validation code does not enter the browser.
- Negative: only the first exact same-week, single-load-trial operation is supported;
  range lowering, combined changes and unsupported identity mappings require review.
- Neutral: ordinary reviewed weeks retain their current path; declaring a load
  trial requires reconciliation. No registry entry, coaching approval, migration
  application or numerical activation follows from this representation.
- Alternative rejected: splicing an accepted session into another reviewed week
  would borrow authority and obscure changed weekly demands. A receipt-only log
  without checking the compiled candidate would not establish reconciliation.
