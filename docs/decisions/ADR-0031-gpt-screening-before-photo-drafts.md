# ADR-0031 - GPT screening before selected-photo drafts

- **Status:** Accepted for local implementation; release qualification pending
- **Date:** 2026-10-10
- **Deciders:** Greg, Codex

## Context

The selected-photo review flow in ADR-0030 already separates estimates from
confirmed consumption. Greg selected GPT vision for food screening because Jev
currently accepts text rather than image evidence. The clarified Decisions
policy passed eight approved comparison cases, recovering two missed food routes
without observed regressions. These small samples do not establish production
accuracy, and cloud classification sends non-food images to OpenAI too. The
[Decisions guide](https://developers.openai.com/api/docs/guides/decisions), checked
2026-10-10, documents the dedicated endpoint and fixed model; qualification evidence
is in `docs/verification/photo-review-drafts/2026-10-10-screening-clarification-comparison.md`.

## Decision

We screen explicitly selected, OpenAI-approved photos with the qualified GPT
Decisions policy before invoking the existing Socius macro analyzer and draft ledger.

## Consequences

- Food candidates with both confidence and selected probability at least 0.9
  proceed to macro analysis; non-food and uncertain photos stop with a result and
  manual-entry guidance. These thresholds are provisional, not calibrated.
- Refusal, invalid output and provider failure stop analysis. Both provider calls
  have a 45-second timeout and zero automatic retries. A new submission requires
  explicit user action; an uncertain ledger/save result retains its original identity.
- The ledger stores only bounded screening metadata, never photo bytes or raw
  provider text. Completed screening-only results can be reconciled after a lost
  response. Existing draft recovery and owner checks remain authoritative.
- Consent names OpenAI screening and Socius macro analysis. Old generic approval
  alone cannot initiate either provider call. Photo selection does not authorize
  library scanning, unattended uploads, or confirm consumption.
- Only explicit draft acceptance writes nutrition. No schema, dependency, image
  storage, deployment or native Camera bridge is introduced in this slice.
- Screening uses fixed REST `/v1/decisions` and `gpt-6-luna`, since the installed
  OpenAI SDK predates Decisions support. The macro provider remains configurable
  through the existing vision seam. This supersedes ADR-0030's future-only
  Decisions classification statement for the selected-photo path.
- Compression and edge-case classification still need broader device qualification.

## Alternatives considered

Sending every selected photo directly to macro analysis preserves the previous
flow, but cannot exercise the approved food/non-food routing boundary.

A separate ingestion table or worker would add durable orchestration before the
native upload and unattended cloud-consent contracts are ready. The existing
owner-scoped request ledger already provides replay and draft recovery.

An on-device-only classifier would avoid cloud transmission of non-food images,
but differs from Greg's chosen GPT classifier and the qualified policy.
