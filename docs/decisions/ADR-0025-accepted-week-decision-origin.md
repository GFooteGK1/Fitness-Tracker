# ADR-0025 - Preserve the accepted week's decision origin

- Status: Accepted for local implementation under the programming-quality QPlan
- Date: 2026-09-21

## Context

An accepted replacement has a new active plan ID, but the review that chose it belongs to the prior accepted base. Looking up only a review of the new active base loses the evidence and rationale immediately after acceptance. Reusing the originating review as a current decision would incorrectly authorize future actions.

## Decision

Add an optional historical `acceptedOrigin` to the shared coaching decision context. Read the owned accepted proposal whose proposed plan is the current active accepted plan, and follow its exact originating review and prior-base binding. Validate the accepted plan, proposal, review, owner, program and embedded review ID before projecting the record.

The existing `status` and `decision` remain solely about the next review of the active base. The origin has `validity: historical_accepted_snapshot`, `currentEligibility: not_evaluated` and an explicit unchanged, corrected or unknown source status. Its stored revision is preserved without claiming it matches current evidence. Malformed or unavailable origin data is omitted with a bounded missing reason.

Chat and Program show this origin as an explanation of the accepted week. It never supplies proposal or acceptance controls. Original evidence values, exclusions, limitations and rationale remain historical even after corrections. No accepted prescription or saved review is edited.

## Alternatives and consequences

Replacing the current decision with the origin would conflate accepted history and future eligibility. Copying the review into another table would introduce a second source of truth. Following the existing accepted proposal relationship avoids both, with additional bounded reads and an independently validated projection. Initial plans without a weekly review have no origin. Hosted validation remains separate from local readback tests.
