# Shared decision readback and remaining freshness work

Date: 2026-09-21. Local implementation in `codex/programming-quality`.

## Delivered behavior

Chat previously received a legacy execution summary but did not retrieve the
persisted rolling-week decision. It now receives the same validated saved review
as the weekly API, with actual computed evidence summaries, exclusions, snapshot
references, policy versions and linked proposal state. The Program page offers
the exact saved rationale under “Why this recommendation.”

Invalidated or unverifiable saved decisions cannot drive saved-review controls.
Controls match the projected review/proposal IDs rather than selecting a different
row from history ordering. Refresh replaces an older live response. This preserves
the distinction between an accepted week, a review recommendation and a proposed
replacement awaiting acceptance.

Confirmed event dates now guard the direction horizon. A December target that
conflicts with a confirmed April event produces an actionable 409. Replacement
directions first refresh intent, then validate the date. The app does not silently
change the event, and accepted snapshots remain unchanged.

## Freshness limits found in the audit

The projection's `current` status is limited to the latest saved review for the
active accepted base and the validity of sources included in that review. It
explicitly reports that newer athlete context has not been reconciled.

- Ordinary continuation intentionally clones the accepted profile. Replacing its
  full `planningContext`, `prescriptionBasis` or `trainingIntent` with a fresh
  snapshot violates current continuity checks. Fresh interpretation must remain
  separate until the next-proposal contract supports that transition.
- Initial drafts lack a general intent/history revision check at acceptance.
  The existing targeted source guard applies only when a weekly review is linked.
- New intent, availability or feedback is not equivalent to a correction of an
  included observation. Existing review invalidation does not cover every such
  newly relevant input.

Next implementation should bind unaccepted proposals to the relevant source
versions and reject stale acceptance transactionally. It must preserve accepted
JSON and accepted replay. A route preflight alone cannot close an acceptance race.
This is remaining P2/P1 work, not a reason to infer that existing drafts are fresh.
This audit led to `Fitness-Tracker-i40.3.1`, now implemented locally by the
[context revision slice](proposal-context-revisions.md). Its mutation fence covers
initial drafts, linked reviews and proposals; readback rejects stale revisions.
Changed-intent strategy reconciliation remains in `Fitness-Tracker-i40.3.2`.

## Verification boundary

Synthetic readback tests exercise the real runtime and weekly GET with the same
owned rows, including source invalidation. Prompt tests verify identical record
embedding and owner rejection. UI tests verify rationale, disabled stale reuse
and mismatched history/proposal identity. Event tests cover matching and conflicting
dates, null/undated cases and refreshed replacement intent. These checks do not
establish live RLS, browser visual quality, new numerical validity or superior
coaching outcomes.

Final combined regression: 356 tests in 26 files passed. Full TypeScript, focused
ESLint and whitespace checks passed. Independent review verified both resolved
integration findings and found no remaining actionable issue in this slice.
