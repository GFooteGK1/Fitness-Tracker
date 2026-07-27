# ADR-0003: Adaptive coach state, memory, and authority boundaries

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), evidence-based training doctrine

## Context

The coach needs to build an eight-week program with the athlete, remember durable
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
rules such as estimated 1RM derivation and the eight-week intent live in
`app/lib/coach/policy.ts`. Stored plans record both versions. The initial horizon
is eight weeks, with review-led deloads in weeks 4 and 8.

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

## Consequences

- The coach can be conversational without making the conversation the database.
- Every active prescription can be traced to athlete inputs, doctrine, policy,
  and a specific accepted plan version.
- Adaptations are inspectable proposals rather than silent mutations.
- The schema is larger than a transcript-only design, but it supports RLS,
  correction, concurrency, evaluation, and future UI review flows.
- The Program page can remain a persistent assessment, proposal-review, and
  accepted-plan surface while V2 remains conversational.
