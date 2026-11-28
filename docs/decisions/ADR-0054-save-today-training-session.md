# ADR-0054 - Save today’s training session

- **Status:** Proposed for the owner pilot. Installed-host verification is pending.
- **Date:** 2026-11-26
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md), [ADR-0052](ADR-0052-start-draft-after-today-check-in.md)

[ADR-0056](ADR-0056-save-today-recommendations-by-default.md) supersedes the separate save confirmation for an ordinary Today recommendation and defines how requested edits are recorded.

## Context

The Today check-in already persists for the athlete’s local calendar date. A confirmed submission asks the chosen chat model to draft the session. The validated draft appears in the chat that authored it. The athlete wants the session below the collapsible check-in and available from Today throughout the same local day.

## Decision

Store the explicitly authorized, validated session draft on the athlete’s daily check-in and read that saved draft in Today for its local date.

## Consequences

- The chosen LLM prepares evidence and authors a draft. The confirmed Today action requests `save_today_session_draft` to validate, store and display it. A direct request to save to Today also supplies consent. Ordinary previews and unsaved revisions continue to use the read-only `show_today_session_draft` tool and share the same validator.
- The opt-in save requires the existing owner pilot and MCP writes controls. The server rechecks current evidence and plan safety, then stores the validated display projection on `coach_daily_checkins`. Existing row-level security scopes reads and ordinary check-in writes to the owner. Authenticated writes grant access only to check-in columns. After verifying the OAuth owner and current local date, the server writes the draft through a service-role client with draft-only update privileges on this table. The update matches that owner, date and check-in revision. Check-in and draft writes affect the same daily record. Accepted programming and completed workouts retain their existing write workflows.
- The confirmed Today save binds the chat request to the local date and check-in revision. The database accepts a draft only for the revision that informed it. A changed check-in rotates the revision and clears the stored draft in the same update. An identical submission retains both. A delayed request for an earlier revision cannot replace the draft for the current one, including when the athlete re-enters an earlier set of answers.
- A fresh Today view reads the current local day and can retrieve the draft after the chat changes or the view reopens. A same-day refresh can pick up a draft while the athlete waits. Today displays a saved draft only when it matches the current check-in and training safety permits display. The next local day reads its own row. Older rows can remain in storage.
- The check-in save and the chat handoff have separate outcomes. A chat acknowledgment confirms dispatch. A verified database result confirms persistence. Missing inputs, a safety hold, an unavailable read, or a failed save can leave the session unavailable while the check-in remains saved.
- This requires an additive database migration and one private draft write tool. ChatGPT may ask for approval on the write. Verify owner isolation, explicit save, current-date and revision checks, older check-in compatibility, and save failure locally. Before claiming installed acceptance, verify the flow, reopen, and local-day rollover in the intended ChatGPT clients.

## Alternatives considered

- Store the draft in widget state. A fresh chat or a different client may have no access to that state.
- Generate a draft inside Today. This adds a coaching runtime and a second authoring path with its own evidence and safety behavior.
- Add a separate daily draft table. The draft and the check-in share an owner, date, and revision lifecycle. A projection on the existing row keeps answer updates and draft invalidation atomic.
