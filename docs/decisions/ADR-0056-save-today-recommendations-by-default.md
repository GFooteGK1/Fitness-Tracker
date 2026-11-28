# ADR-0056 - Save Today recommendations by default

- **Status** — Accepted for the SociusFit owner pilot on November 27, 2026. Installed-client verification is pending.
- **Related** — [ADR-0054](ADR-0054-save-today-training-session.md) and [ADR-0055](ADR-0055-routine-production-release-authority.md).

## Decision

A request for today's personalized training recommendation authorizes saving the validated result to Today. A request to change the saved recommendation authorizes replacing it and recording the athlete's stated edit feedback. An explicit preview, hypothetical comparison, or factual question remains read-only. The selected chat model prepares the evidence and authors the recommendation. SociusFit verifies the owner, local day, check-in revision, and training safety, and confirms a save only when the normal Today read can display that exact draft.

The November 27 response validated a preview and asked for a second confirmation. The athlete expected that recommendation to appear in Today and directed the app to save the first recommendation and record feedback on requested edits. ADR-0054 still governs the authenticated storage boundary and check-in lifecycle. This decision supersedes its save opt-in rule for ordinary Today recommendations and revisions.

## Edit feedback

The daily draft owns its revision and the feedback submitted for that revision. Replace the draft and append bounded, athlete-stated feedback in the same conditional update. Bind the update to the draft revision observed during preparation, so two chats cannot silently overwrite each other's work. Feedback is edit history, separate from coaching preferences and completed-workout feedback. The existing check-in lifecycle retains past daily rows and clears the draft and its feedback when the associated answers change on the same day.

## Alternatives considered

- Keep a separate confirmation for each recommendation. This adds a second interaction before the recommendation appears in the Today card.
- Store edit feedback in a new ledger. An independent ledger could keep feedback after the associated check-in changes. It would require a production schema change and a policy for how that feedback can inform other coaching decisions.

## Release and verification

Release support for reading both draft formats before the app writes the new format. Earlier releases require the original draft shape and would hide newer drafts during rollback. Verify that the compatibility release reads a representative new-format draft before enabling writes. Exercise a fresh recommendation, an explicit preview, an athlete-requested edit, two competing revisions, and a same-day reopen. Confirm that the card reads the same validated draft and that feedback remains scoped to the owner and daily check-in.
