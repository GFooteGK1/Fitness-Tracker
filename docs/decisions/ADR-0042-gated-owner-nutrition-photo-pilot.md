# ADR-0042 - Gated owner nutrition photo pilot

- **Status:** Accepted for local preparation; activation pending
- **Date:** 2026-10-19
- **Deciders:** Greg, Codex

## Context

Selected photos currently produce review drafts and discard their bytes. Greg approved a selected-photo pilot that saves a private photo and automatically logs an estimate using OpenAI, with optional later refinement in the chosen LLM. A photo does not prove consumption or measure portions. Storage, provider billing and canonical writes cross distinct failure boundaries. Existing capture revisions and owner authorization must survive the change.

## Decision

We prepare a separately gated owner photo workflow with durable capture identities, at most one screening and one estimation attempt per capture, existing atomic canonical capture operations, and narrow retrieval and correction adapters for the chosen LLM.

## Consequences

- Positive: Original estimates, source hashes, effective provider/model and timestamps survive correction; totals derive from validated items.
- Positive: Existing selected-photo drafts and native device permissions retain their current behavior.
- Negative: A lost provider response stops automatic processing; reconciliation is necessary and may leave no estimate. Exactly one canonical meal does not imply a successful provider response.
- Negative: Private storage and database state cannot commit together. Uncertain uploads remain visible and must be reconciled before deletion or retry.
- Neutral: The pilot's compile-time activation gate remains false. SQL stays under `docs/migrations`, outside the migration runner. No credentials, grants, production writes, jobs or provider calls are activated by this candidate.
- Neutral: Photo retention duration, deletion/orphan recovery, exact provider availability/cost, hard spending controls, credential reuse and existing bucket policies require a separate activation decision. Proposed values are not consent or runtime proof.

## Alternatives considered

Extending the native camera capability would turn a draft-only device permission into canonical write authority and add unrelated background capture. The selected-photo owner session is the smaller boundary.

Reusing transient review drafts alone preserves established behavior but cannot retain a photo or automatically create an explicitly unreviewed estimated meal.

Handing every photo into the chosen LLM avoids automatic provider spending but does not deliver the approved take-a-photo-and-move-on workflow. The model API performs bounded extraction only; it does not become the programmer or coach.

## Approved bounds and inactive controls, 2026-10-19

Greg approved existing hosted OpenAI key reuse in place, fixed GPT-6 Luna
screening/GPT-5.6 Luna estimation without fallback, private retention without
unattended permanent deletion, and application-only $1 rolling24h/$5 initial30d
limits. The isolated follow-up prepares a fixed 720-hour policy and append-only
per-stage exposure ledger alongside captures, using the same owner transaction
lock. No owner-facing reset/refund/delete or recurring job is added. The two
literal false activation gates and unapplied SQL are retained.

Full-context reservations make the initial no-refund implementation too restrictive
for daily food tracking: one full estimate/day, five total. It is an inactive
control foundation, not an activation recommendation. A trusted server-only
settlement path for confirmed actual usage is proposed separately; owner-supplied
RPC result payloads must never authorize a financial refund. See the dated
[nutrition budget controls and capacity analysis](../verification/llm-coaching-context/nutrition-photo-budget-controls-2026-10-19.md).

## Trusted settlement preparation, 2026-10-19

The next inactive slice implements the approved trusted-usage direction. Full
pre-dispatch reservations remain immutable. A service-only, owner/capture/stage/
model/rate-bound RPC can record one provider receipt and upward-rounded confirmed
charge, retaining original evidence. Owner-facing result transitions lose all
financial completion authority. Missing/invalid usage and unknown outcomes retain
full exposure; there is no timeout release, reset or automatic reconciliation.
A confirmed cost above a deliberately violated reserve halts new admissions.

Synthetic capacity acceptance uses3,000 screening input tokens and5,000 estimate
input/1,024 output tokens:660+4,778microUSD/photo. Ten sequential actual capture
transactions/day and300 across a simulated720h initial period are the acceptance
fixture, not a measured cost or guarantee for arbitrary photos. Real hosted
credentials/prices/data controls and multi-session/Storage proof remain separate.
The SQL remains unapplied and adds a third literalfalse gate on settlement.
