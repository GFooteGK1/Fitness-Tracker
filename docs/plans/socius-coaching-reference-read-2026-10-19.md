# Versioned coaching-reference read

Greg approved this slice on 2026-10-19, including normal tested commit/merge. It follows the factual coverage inventory; it does not update the separately missing athlete requirements.

## Contract and decision

Publish `external-coaching-0.1.0` as a small repository-backed, reviewed, qualitative reference through `get_coaching_reference`. The selected LLM authors programming and synthesis. General guidance creates no athlete facts, universal sport priority, training cadence or dose. Preserve the legacy internal generation path and all historical snapshots.

Repository publication avoids a new schema, synchronization owner, credentials or permissions. Each publication change needs a new version and explicit editorial review; do not silently rewrite a historical version. The interface review date is separate from the inherited evidence-review date and its limited coverage. Supersession applies only to the external chosen-LLM authority contract.

The input accepts only an exact published version and zero to four distinct whitelisted domains. Omission returns the current core. Unknown versions fail; they never silently fall back. Every response includes the core, sources, review scope, authority and supersession. `contentHash` hashes the complete publication; `selectedContentHash` hashes the returned `reference` subset. Both use SHA-256 of exact UTF-8 `JSON.stringify` bytes in publication order. Domain order is canonical regardless of request order. The entire duplicated text/structured tool response is limited to 32,768 UTF-8 bytes.

`get_coaching_context` adds only a small publication pointer, with an explicit unpublished state/gap when a reviewed publication is unavailable. It retains its existing 128,000-character fail-closed budget and factual authority. The pointer is general reference coverage, not evidence of athlete preference completion or fresh science.

## Acceptance and boundaries

- Existing trusted owner/client/issuer/resource/role/expiry checks plus `db.auth.getUser()` subject equality apply to the new tool. No identity selector comes from tool input.
- Reference calls perform no domain reads, RPCs, writes, provider requests or host operations. Existing OAuth scopes and security/access settings are unchanged.
- Exact two-tool registry; unknown/write tools remain unavailable. Both tools use the existing MCP HTTP transport and challenge behavior.
- Verify selectors, immutable returned objects, independently reproducible full/subset hashes, all bounded selections, identity negatives, JSON/SSE transport, missing-publication context and saved-plan compatibility.
- Independent pre-candidate oracle and frozen-candidate review/verification are required, including a representative known-bad mutation. Tests establish software behavior, not improved athletic outcomes.
- No athlete record writes, daily-isometric preference insertion, save-back, nutrition/photo flow, reminders, new credentials, scope changes, manual deployment or background-job changes.

Normal protected merge triggers the existing Git deployment. Record merged/deployed/actual connected read acceptance separately; a passing synthetic test is not a real harness retrieval.
