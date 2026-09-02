# Coach trust and review design 0.1.0

## Outcome

The Program page gets one athlete-facing trust center with four distinct
sections:

1. **What Coach Knows** shows confirmed facts and their lifecycle.
2. **Needs Review** shows imported measurements that cannot enter evidence yet.
3. **Quality Progress** separates targets, estimates, proxies, training signals,
   and direct outcomes.
4. **Why This Changed** shows deterministic adaptation proposals and their
   evidence before any accept or reject action.

The surface does not show raw JSON, expose database administration, promote chat
inference, or activate a plan silently.

## Information hierarchy

Each record shows the smallest useful trust trail:

- plain-language value;
- authority state;
- source;
- effective or observed time;
- freshness;
- protocol and comparison identity where applicable;
- confidence;
- missing, excluded, or unresolved evidence; and
- the available athlete action.

Stable facts, imported observations, derived progress, and plan decisions use
different cards and labels. They are not blended into one confidence score.

## Athlete actions

### Confirmed memory

- **Still correct** appends a lifecycle review event and refreshes the review
  time. It does not create a duplicate memory version.
- **Correct** creates a new confirmed version through the existing bounded
  memory RPC. The old version becomes superseded and remains in history.
- **Withdraw** marks the current version withdrawn and appends a reason-bearing
  lifecycle event. It does not delete history.

### Qwik import

- A mapped set shows the canonical movement and fixed-load velocity protocol.
- An ambiguous set requires one candidate selection.
- An unmapped set with no supported candidate cannot be confirmed. The athlete
  can reject it and import again after the catalog supports the movement.
- **Confirm import** atomically versions any selected movement mappings,
  confirms all active normalized observations, and confirms the import.
- **Reject import** atomically rejects the import and excludes its active
  observations.

The correction transition never edits source observations in place. An
ambiguous observation is excluded, copied into a new athlete-mapped version,
then superseded with an explicit lineage link.

### Adaptation proposal

- **Accept** uses the existing stale-base-checked acceptance RPC.
- **Reject** rejects the proposed plan version and records a review event.

Both actions are explicit. Until acceptance succeeds, the current accepted plan
remains active.

## Mobile and accessibility

- The four sections stack in one column on mobile.
- Every action is at least 44 px high.
- Inputs use 16 px text.
- Expand/collapse controls use native buttons and expose expanded state.
- Status changes use live status text. Failures use alert text.
- Destructive-looking actions require an inline reason and a second explicit
  submit.
- Interrupted writes keep the current form state and idempotency key for retry.

## Error and recovery states

- Missing migrations produce one unavailable card without hiding the active
  training plan.
- Partial reads never appear complete.
- A stale proposal or already-reviewed import returns a conflict and triggers a
  refresh.
- An incomplete mapping cannot be confirmed.
- A failed request keeps edits and selection state.
- An identical retry returns the original lifecycle event and does not duplicate
  a transition.

## Data and authority boundary

Supabase remains canonical. New review-event tables are append-only and
user-scoped. Authenticated clients receive read access only; bounded
security-definer RPCs own lifecycle transitions. All RPCs use the authenticated
user, row locks, idempotency keys, exact ownership checks, and an empty
`search_path`.

Raw Qwik files and bar-path arrays remain outside the trust center, API payload,
database, and model context. A trust action changes authority state only. The
deterministic evidence selector still decides whether an observation is active,
fresh, compatible, and sufficient.
