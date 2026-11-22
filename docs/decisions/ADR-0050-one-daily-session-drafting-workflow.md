# ADR-0050 - One workflow for daily training drafts

- **Status:** Local candidate. Installed-host and coaching-quality acceptance are pending.
- **Date:** 2026-11-22
- **Scope:** SociusFit owner plugin, Today dashboard and web coach handoff

[ADR-0052](ADR-0052-start-draft-after-today-check-in.md) starts this same workflow from the verified Today save and defines how it handles rest days.

## Decision

Use the [daily session draft](ADR-0049-today-session-drafting.md) for requests to recommend, draft or adjust today's training in the owner pilot. The athlete saves the [five-field check-in](ADR-0051-five-point-today-check-in.md) in Today and requests the draft in SociusFit chat. The generic context tool supplies saved facts. Today confirms the save and shows recovery, logged workouts and any scheduled sessions. The standalone web coach uses the pilot owner check before giving that chat handoff.

The draft reads four weeks of completed sessions, confirmed goals and constraints, today's saved assessment and the versioned coaching playbook. An accepted session, if present, is context for following or adjusting scheduled work. Drafting and displaying a session perform no writes.

If prepare cannot verify the inputs or display cannot validate the draft, the chat reports what needs attention. Every daily draft and revision goes through prepare and display.

For explicit, standalone daily draft questions from the pilot owner, the web coach returns one chat handoff before calling its coaching agents. The coach prompts also give this handoff for paraphrased requests. Saved-work lookups, completed-work logging and weekly planning retain their own entry points.

Today and the draft share an owner-bound safety read. A pause, recovery decision or concerning pain report bound to the current accepted plan holds the draft. Evidence changes that make an old weekly review ineligible for replacing a plan do not require another weekly review to propose a daily session. An unavailable safety read stops a draft when the accepted-plan safety state cannot be verified. Display rereads current evidence and safety.

This supersedes the quick recommendation and preview in [ADR-0046](ADR-0046-today-check-in-guidance.md) and the daily gating portion of ADR-0049. The [saved check-in contract](ADR-0048-saved-today-check-in.md) and the standalone weekly programming and acceptance paths remain in force. Cached Today widgets get a static chat handoff for a confirmed check-in or a notice to reopen Today for the retired preview. Previously supported resource addresses resolve to the current widget when the host requests them again.

## Alternatives

- Keeping the quick recommendation alongside chat would give the athlete two answers based on different evidence.
- Requiring a fresh weekly review before every draft would bind today's session to a separate plan-replacement decision.

## Verification

Test a stale non-safety review with a saved check-in and confirm prepare and display succeed. Exercise explicit holds, unavailable safety data, owner checks and source changes between calls. Verify Today confirms a successful save and reopens with the same answers. Then repeat the installed-host acceptance cases in ADR-0049 with this workflow.
