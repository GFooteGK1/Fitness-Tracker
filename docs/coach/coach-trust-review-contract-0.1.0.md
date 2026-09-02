# Coach Trust and Review Contract 0.1.0

Status: implemented locally; production database migration applied; application deployment pending.

## Purpose

The Program page gives the athlete one place to inspect and control the data
that can affect adaptive programming. The surface answers four questions:

1. What facts has Coach remembered?
2. Which imported measurements still need athlete review?
3. Which goal qualities and evidence roles are being tracked?
4. Why did Coach propose a change?

This contract implements the programming loop `goal -> assess -> prescribe ->
observe -> adapt`. It does not add APEX scoring tables. A single readiness
score, difficult session, or unreviewed import cannot change training emphasis.

## Read model

`GET /api/coach/trust` returns a bounded, user-scoped model with four sections:

- `What Coach Knows` contains only confirmed, active memory versions. Each item
  includes a plain summary, provenance label, confidence, review date, and
  freshness state.
- `Needs Review` contains pending Qwik imports. It shows normalized set values,
  protocol, movement mapping state, supported candidates, warnings, source time,
  and a source SHA-256 prefix.
- `Quality Progress` shows accepted goals, their current quality emphasis, and
  separate counts for targets, estimates, proxies, training signals, and direct
  outcomes.
- `Why This Changed` shows proposed replacements only. It includes the
  deterministic evaluator explanation, action, trend, evidence status,
  confidence, included and excluded counts, bounded exclusion reasons, and the
  statement that automatic activation is off.

Every authoritative query includes `user_id`. Reads are bounded. If any
required storage layer is unavailable, the model fails closed instead of
showing a partial authoritative picture.

## Athlete actions

`POST /api/coach/trust` accepts one authenticated action with a resource UUID
and an idempotency key:

| Action | Effect |
| --- | --- |
| `reaffirm_memory` | Refreshes the review date of the current confirmed memory and appends one review event. |
| `correct_memory` | Supersedes the current memory and creates a new confirmed version. The old content remains in history. |
| `withdraw_memory` | Withdraws the fact with an athlete-supplied reason. The row and review event remain in history. |
| `confirm_import` | Confirms mapped Qwik groups and creates an athlete-confirmed replacement group for each explicitly resolved ambiguous movement. |
| `reject_import` | Excludes the import, its groups, and its values with an athlete-supplied reason. |
| `accept_proposal` | Calls the existing atomic acceptance transition. It is replay-safe even when the first response is lost. |
| `reject_proposal` | Rejects the proposal and proposed plan version with a reason. The accepted plan remains active. |

Correction fields are allowlisted by memory kind. Ambiguous Qwik selections
must be one of the candidates stored with that athlete's import. Unmapped Qwik
groups cannot be confirmed. Conflicts fail closed and ask the athlete to
refresh.

The UI retains the exact request body and idempotency key after an interrupted
write. It clears that retry state only after a successful response. Withdrawal,
import rejection, and proposal rejection require a reason and a second submit.

## Storage and history

`coach-trust-review-migration.sql` adds append-only review-event tables for
memory, measurement import, and adaptation proposal decisions. Authenticated
users can read only their own events. They cannot write the event tables
directly. Security-definer RPCs own the bounded transitions.

All new user tables enable and force RLS. The RPCs validate `auth.uid()`, use an
empty `search_path`, take an advisory transaction lock, enforce owner-safe
foreign keys, and reject mismatched idempotency replay.

Corrections do not rewrite evidence. They supersede or exclude the previous
version and preserve the decision event. Proposal rejection does not change the
active plan pointer. Proposal acceptance remains the only plan activation path.

## Qwik privacy boundary

The trust endpoint rejects `rawText`, `bar_path`, and `barPath` recursively.
Supabase stores normalized Qwik measurements, bounded provenance, mapping
status, and the source SHA-256. Raw Qwik JSON and bar-path arrays are not sent
through the supported flow. The original export remains with the athlete under
the declared policy `user_retained_not_uploaded`.

## Mobile and accessibility contract

- Interactive targets are at least 44 px high.
- Inputs, text areas, and selects use at least 16 px text.
- Controls have native labels and keyboard order.
- The layout has no horizontal overflow at 320 or 390 px.
- Status, error, and unavailable states use live or alert semantics.

## Authority boundary

The database stores facts, observations, review history, and immutable
proposals. Deterministic application policy evaluates compatible repeated
evidence. The LLM may explain or ask questions, but it cannot confirm evidence,
correct memory, or activate a plan. The athlete performs each authority-changing
action explicitly.

## Out of scope

- Destructive database rollback or application deployment.
- Uploading or retaining raw Qwik exports in Supabase.
- Automatic plan activation.
- Reallocating emphasis from one session or readiness value.
- APEX-specific scoring tables.
