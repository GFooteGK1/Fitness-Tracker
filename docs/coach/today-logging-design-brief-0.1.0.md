# Today Logging Design Brief 0.1.0

## Outcome

The Program page centers the next actionable prescribed session. An ordinary
session takes one tap before training and three short answers after training.
The save creates one canonical workout and links the check-in and observations
to that workout in the existing atomic completion transaction.

## Athlete flow

1. Read the current job: objective, rationale, prescription, intended feel,
   success condition, and stop rules.
2. Tap readiness from 1 through 5. Readiness is advisory. One value cannot
   rewrite the accepted plan.
3. Expand pain or constraint capture only when readiness is low or the athlete
   selects `Something changed`.
4. Record a measurement only when the accepted plan schedules one for this
   session. Week 1, 4, and 8 assessment schedules are assigned to one session,
   not repeated across every workout.
5. Finish as prescribed, modified, stopped early, or skipped. Copying the
   immutable prescription into performed work requires explicit confirmation.
6. Enter session RPE and energy. Modified work needs a concise actual-work
   summary. Skipped sessions create no workout or performance observation.
7. Save once. Success confirms the canonical workout link. A failed or offline
   response retains the exact request and idempotency key for safe replay.

## Information hierarchy

- `Today`: one primary action card with date and session state.
- `Do`: the session objective and prescribed work.
- `Feel`: the execution target and success condition.
- `Stop or modify`: the accepted stop rules and local readiness warning.
- `Measure today`: only plan-scheduled strength, jump, sprint, run, or readiness
  input.
- `Finish`: result, session RPE, energy, conditional pain or constraint, and
  optional note.
- `Plan`: the eight-week intent and remaining session history stay available
  below the Today card.

## Data contract

- Supabase remains canonical.
- Accepted plan intent remains immutable and owns the measurement schedule.
- The runtime context deterministically assigns each scheduled assessment to
  one prescribed session in its week.
- Completion uses contract v2 with explicit performed work and typed
  observations.
- `as_prescribed` submits no client replacement blocks or summary. The database
  copies the accepted prescription.
- `modified` and `stopped_early` submit the athlete's concise actual-work
  summary as performed work.
- Pre-session readiness and scheduled measurements are athlete-confirmed
  observations. Session RPE remains the check-in-owned training signal.
- Every retry reuses the same request body and idempotency key. Editing a failed
  entry intentionally starts a new request key.

## Measurement mapping

| Assessment | Primary input | Required comparison context |
| --- | --- | --- |
| Repetition maximum | Load and reps | Prescribed movement and equipment |
| Repetition capacity | Reps and fixed load | Prescribed movement and equipment |
| Jump height | Height | Jump movement and equipment |
| Sprint time | Time and distance | Sprint movement and environment state |
| Run time trial | Time and distance | Run modality, equipment, and environment state |
| Readiness | 1-5 score | Athlete self-report source |

## States and recovery

- Loading: keep the existing Program skeleton.
- Empty: explain that no active plan or no planned session is available.
- Planned: show readiness, the prescription, and finish controls.
- Saving: disable edits and announce progress.
- Failed or offline: retain the exact entry and offer `Retry same entry`.
- Edit after failure: discard the pending request and its key before enabling
  fields.
- Stale plan: retain the entry, explain that the accepted plan changed, and
  offer a context refresh.
- Completed: show the canonical workout ID and training-history link.
- Skipped: show a terminal state with no workout link.

## Interaction and accessibility constraints

- Mobile first at 320px and 390px with no horizontal overflow.
- Touch targets are at least 44px.
- Inputs use at least 16px text.
- Every input has a visible label. Choice buttons expose pressed state.
- Errors use an alert region. Saving and success use status regions.
- Keyboard focus remains visible and follows the visual order.
- No new design system or spreadsheet-style entry surface is introduced.
