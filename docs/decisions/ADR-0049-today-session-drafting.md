# ADR-0049 - Draft today’s session in chat

- **Status:** Local candidate. Installed-host and coaching-quality acceptance are pending.
- **Date:** 2026-11-21
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0048](ADR-0048-saved-today-check-in.md)

## Decision

The athlete asks their chosen LLM to draft today’s session after a confirmed check-in save. The owner-scoped MCP pilot offers a versioned workflow with two read-only calls. The existing Today recommendation remains available for a quick read.

1. `prepare_today_session_draft` fixes the inclusive 28-day window ending on the athlete’s local date. It reads the saved check-in, active goals, constraints, accepted session, completed workouts and the reviewed playbook. It groups logged workouts into four seven-day periods and preserves evidence gaps. A saved review hold stops the workflow. Missing material inputs prompt a focused question.
2. The chosen LLM reviews the four weeks against the active goals, selects one objective, and uses the check-in to set the dose. It supplies one editable draft to `show_today_session_draft`, including evidence references and an explanation of any accepted-session adjustment.
3. The display tool rereads the authorized evidence. The prepared ID covers the version and stable packet contents. A new date, correction, changed review or changed source invalidates the prior result. The tool checks the plan relationship, references and draft structure before supplying the inline card. The athlete can request a revision in chat. The two tools perform zero domain writes.

The card shows a draft only after validation. In ordinary chat, whether the model invokes both tools and whether the training decision fits the athlete remain acceptance checks. The server can verify the shape and source references. Coaching judgment needs reviewed examples.

## Alternatives considered

- A prompt using the generic coaching tools is a low-cost pilot. The draft entry point removes the model’s discretion over the evidence window and readiness checks.
- An embedded generator could control every rendering step in Today. It would introduce a second authoring path and a separate model integration. The inline draft retains the athlete’s selected LLM and gives SociusFit a validation boundary for the card.

## Acceptance

Local regression covers the mounted MCP boundary, verified owner, date edges, current check-in and playbook, changed evidence, policy holds, draft validation, zero writes and the inline card.

In an authorized isolated candidate connected to the intended host, use a synthetic athlete and freeze the local date, confirmed goals, check-in, plan, logged workout revisions and playbook for each case. Run each case in three fresh chats. Use “Draft today’s session” and ordinary paraphrases. Capture the prepare and display call order, evidence ID, selected goal and workout references, validation result and domain-write count. Confirm the inline card and continued conversation on desktop and phone.

| Case | Expected observation |
| --- | --- |
| Normal readiness and a planned session | Exact 28-day packet, one objective and one executable draft with an explicit relationship to the accepted session. |
| Same evidence with higher fatigue | Same goals and history. The explanation ties any adjustment to the check-in and respects the session constraints. |
| A corrected workout | The latest saved revision informs the draft and the corrected workout counts once. |
| A partial log | The draft states relevant gaps and makes claims only about known work. |
| Missing or stale check-in | A focused request for the current check-in. No draft display. |
| Saved review hold | The review message appears. No draft display. |
| Evidence changes before display | The first display attempt stops. A new attempt starts from a fresh prepare call. |

Every run must meet the tool, date, source, hold, validation and no-write checks. A coaching reviewer must also pass goal fit, readiness adjustment and feasibility for each ready case. Keep model/host and workflow version with each result so a change can be evaluated against the same cases. This installed-chat pilot is a separate milestone from passing synthetic tests.
