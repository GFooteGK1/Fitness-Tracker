# ADR-0003: Adaptive coach state, memory, and authority boundaries

- **Status:** Accepted; fixed eight-week horizon superseded by ADR-0007
- **Date:** 2026-07-27
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), ADR-0007 (rolling weekly programming), evidence-based training doctrine

## Context

The original coach needed to build an eight-week program with the athlete, remember durable
facts, use logged training and recovery data, and adapt the program over time.
Those behaviors need stable ownership boundaries. Free-form conversation alone
cannot safely serve as the training record, numeric policy, or plan activation
mechanism. Google Sheets is also no longer part of the adaptive-coach source of
truth.

## Decision

### Supabase is the canonical athlete and programming store

The application stores assessments, explicitly confirmed memories, immutable
plan versions, prescribed sessions, adaptation proposals, and check-ins in
user-scoped Supabase tables. Google Sheets may remain in legacy workout-template
paths, but it does not feed or synchronize adaptive-coach state.

### Doctrine and numeric policy are version-controlled application assets

General coaching doctrine lives in `app/lib/coach/reference.ts`; deterministic
rules such as estimated 1RM derivation and prescription construction live in
version-controlled policy. Stored plans record both versions. ADR-0007
supersedes the initial eight-week horizon and fixed week 4/week 8 review cadence
for new rolling programs. Existing eight-week plans retain their recorded policy.

### The app computes prescriptions; the model explains and proposes

The LLM may select relevant doctrine, ask questions, explain intent, and compose
concise coaching language. It may not invent numeric prescriptions. Numeric
loads, doses, and progressions must come from validated application policy or an
already accepted program. This extends ADR-0001's compute-vs-compose boundary
from dashboards into coaching.

### Memory requires explicit confirmation

The coach may persist a fact only after the athlete explicitly asks it to
remember or confirms it. Confirmed memories are versioned, correctable,
provenance-bearing, and idempotent. Conversation text and model inferences are
not durable memory by default and are treated as untrusted input when included
in a prompt.

### Plan activation is an atomic user-owned transition

Planning stores an initial program, immutable proposed version, sessions, and
proposal through one idempotent database function. Acceptance occurs through a
separate database function that locks the relevant records, rejects a stale base
version, supersedes the prior accepted version, activates the proposal, and
supports safe retry. The LLM cannot create unvalidated plan content or activate a
plan on its own.

The same boundary applies to replacement programming. Creating a replacement
stores a new proposed version against the current active version but does not
change active state. Only explicit acceptance supersedes the old version and
applies the reviewed title, goal, and dates.

### Policy 0.2 sessions are actionable without becoming falsely precise

The deterministic kernel owns domain-specific roles, equipment-supported
movement selection, timed blocks, working ranges, rest, stop rules,
substitutions, and one-variable progression. It uses an athlete's saved
assessment for percentage and load guidance only when the movement matches.
Unmatched exercises receive no invented load.

The kernel auto-filters only bounded, explicit exclusions. Other limitation
text remains visible for athlete review rather than being interpreted as a
medical diagnosis or restriction.

## Consequences

- The coach can be conversational without making the conversation the database.
- Every active prescription can be traced to athlete inputs, doctrine, policy,
  and a specific accepted plan version.
- Adaptations are inspectable proposals rather than silent mutations.
- An athlete can replace an early or outdated plan without deleting canonical
  history or briefly deactivating the accepted plan.
- The schema is larger than a transcript-only design, but it supports RLS,
  correction, concurrency, evaluation, and future UI review flows.
- The Program page can remain a persistent assessment, proposal-review, and
  accepted-plan surface while V2 remains conversational.
