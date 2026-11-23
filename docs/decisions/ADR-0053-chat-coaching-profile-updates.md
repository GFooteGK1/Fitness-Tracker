# ADR-0053 – Save coaching profile updates from chat

- **Status:** Approved for the owner pilot. See `Fitness-Tracker-i25` for rollout and client verification.
- **Date:** 2026-11-23
- **Tracking:** `Fitness-Tracker-i25`
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0044](ADR-0044-chatgpt-activity-record-operations.md), [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md)

## Decision

The athlete can approve a lasting profile change in the same chat as coaching. The chosen LLM can use a disclosure in the current conversation and asks before saving it when storage intent is unclear. An explicit request to save or correct a specific value supplies that intent. The tool inputs carry the reviewed content and the revision seen by the athlete’s coach. The OAuth principal and database session supply ownership.

`get_coaching_profile` reads the four editable declarations and the legacy goal. `save_coaching_requirement` updates one complete declaration. Retain unaffected facts in that declaration, including other active goals and verified baselines. The goal update writes canonical `training_intent`, which takes precedence in chosen-LLM daily drafts. Accepted plans retain their goal and session snapshots. Legacy rolling-week goal adoption remains subject to that workflow’s own review.

An injury update stores the athlete’s wording and any explicitly reported training limitations. An optional known classifier helps existing consumers apply `no_running` or `no_overhead`. A cleared restriction is an explicitly approved empty declaration. Daily draft preparation requires review if a saved restriction reaches its review date. Exercise dislikes remain plain athlete wording for the chosen LLM. Catalog-linked movements and interests still indicate positive preferences. Existing equipment declarations retain their storage format to preserve compatibility and reviewed wording.

The database binds each save to the latest owner/category revision under the existing lock and uses the canonical confirmation and correction operations. A private receipt stores the request hash and an owned revision reference. The exact request returns its original saved version after a lost response or a later edit. A stale request or a reused ID with different content fails before changing the profile. The application verifies the returned owner, revision and saved content before confirming success. New writes respect the coaching pause control.

Production Supabase assigned migration version `20261123130203` to the reviewed SQL. The stored statement matched the reviewed Git bytes and SHA-256. The repository uses the applied version so future deployments recognize it.

Both tools require `SOCIUS_MCP_WRITES_ENABLED=true` and `SOCIUS_MCP_COACHING_REQUIREMENTS_ENABLED=true`. The HTTP endpoint also requires the authenticated subject to match the configured pilot owner (`SOCIUS_MCP_TODAY_OWNER_ID`). Install and verify the migration before enabling the owner pilot. When a chat request includes a save and a new draft, the coach saves first and prepares the draft from fresh evidence after verified readback.

## Alternatives

- A separate chat-memory store would introduce another source of truth and require merging it into current coaching and authorization. Reusing the versioned declarations keeps one owner for the current facts.
- An application-side read followed by unconditional confirmation leaves a race between the two operations. The database checks the expected revision in the save transaction.

## Acceptance

Use synthetic inputs to verify each category, version conflicts, recovery with an identical request, ownership, and subsequent draft evidence. For the installed host, verify an ordinary disclosure prompts for consent, an explicit save returns the intended value, a fresh chat retrieves it, a fresh draft accounts for it, and a temporary or hypothetical disclosure creates no saved revision. Use approved data and release authority for hosted verification.
