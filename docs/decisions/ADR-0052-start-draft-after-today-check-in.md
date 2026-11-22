# ADR-0052 - Start the daily draft after saving Today

- **Status:** Local candidate. Installed ChatGPT acceptance is pending.
- **Date:** 2026-11-22
- **Related:** [ADR-0039](ADR-0039-chosen-llm-and-durable-context.md), [ADR-0050](ADR-0050-one-daily-session-drafting-workflow.md), [ADR-0051](ADR-0051-five-point-today-check-in.md)

## Decision

On hosts that support text follow-ups, the Today pilot offers **Save check-in & draft session** as one athlete action. Today requests an immediate ChatGPT follow-up after it verifies the exact saved answers and local date. It uses the standard MCP Apps message capability and sends the verified date and timezone offset. The selected chat model passes both values to the existing prepare tool. Preparation rejects a supplied date that has rolled over. [Apps SDK UI guide](https://developers.openai.com/plugins/build/chatgpt-ui#prefer-shared-fields-and-methods)

An uncertain save receipt triggers a read. A confirmed readback of those same answers can start the draft once. Hydration, changed unsaved answers, a local-date rollover or a safety hold already shown in Today suppress automatic chat dispatch. Preparation and display check current holds before drafting. The check-in receipt stands on its own. An unavailable or failed handoff shows the existing chat prompt so the athlete can continue. Host acknowledgment confirms request receipt. Installed acceptance requires the actual prepare call and validated draft.

Preparation uses the same four weeks of completed work, active goals, constraints, check-in and reviewed playbook across scheduled training, scheduled rest and unscheduled dates. Reserve scheduled rest for a date inside a verified accepted week whose complete dated sessions leave the day free. On scheduled rest, the same workflow can present full rest or light recovery while following the accepted schedule. Full rest has empty exercise phases. A training draft requires warm-up and main work.

Both tools remain read-only. The display tool rereads the evidence and safety state before returning an editable proposal. The athlete can adjust it in the same chat.

## Alternatives

- Asking for a separate chat turn after every save adds an action for the athlete.
- Generating from the app server would transfer authoring to a different model and require a separate provider decision.

## Verification

Test a confirmed save, rest and training days, matching readback after a lost receipt, blocked dispatch, host rejection, unavailable capability and no duplicate send. Verify a pinned Today save produces one chat message and a validated draft on desktop and a physical phone.
