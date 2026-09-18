# W8 UI design preparation

Design preparation only. Runtime implementation waits for W7 closure under the Beads dependency graph.

## Surface and state

Add one shared `NextActionCard` above the accepted-plan summary on Today (`app/dashboard/page.tsx`), and reuse its decision identity/reasons on Coach. Keep permanent Plan and Log access. Use existing `app-panel`, `app-primary`, `app-secondary`, muted text and mint/charcoal tokens. Default to one title, one short rationale and one primary destination; evidence remains under a keyboard-operable details disclosure.

Render explicit loading, pending, disabled, unavailable, abstain and active states. Unavailable says next-action computation is unavailable while plan/logging still work. It must not say the user is up to date. An abstain decision can say there is no eligible next action. Never show an action after its validity deadline or across account/date changes; invalidate visible state synchronously by loaded owner, not only in a post-render effect. Abort obsolete loads and fence every late callback to its initiating owner.

## Interaction contract

On Today entry, call one bounded POST refresh with raw `tzOffset` and `expectedUserId`, then render the server's current decision. Preserve pending state without an uncontrolled polling loop. Refresh after confirmed canonical activity saves as a separate best-effort operation; a recommendation failure cannot turn a saved activity into a failed save.

Shown is a separate display acknowledgement issued only when the card is actually presented. Freeze owner/recommendation/request identity for retries. Action controls are Done, Not applicable, Defer and Adjust when appropriate. Done records `done_reported`; copy states it does not log an activity. Defer exposes a concrete time and records its exact value. Adjust routes to the canonical plan/baseline/log correction workflow rather than mutating doses. Uncertain responses retain their request identity and an explicit Retry control. A confirmed response hides the old card immediately and refreshes the authoritative decision; do not display a second stale card while response refresh is pending.

Canonical destination links carry optional owned `recommendationId`. Freeze that ID with the first logging request and preserve it through text/photo/session/draft retries. A new occurrence is explicit. Receipts/corrections remain W2's shared surfaces. Nutrition coverage uses the explicit coverage endpoint, with status and coverage-through time, never Done or meal count.

## Outcome disclosure

Use the GET response's bounded outcome summaries under a compact recent-follow-up disclosure. Display reported, observed or unknown exactly as the server provides. Surface the immutable factual summary and attribution limits without claiming improvement caused by advice. Superseded recommendations may receive follow-up but never return as current guidance. An invalidated outcome is shown as unknown/currently unavailable while historical payload remains available in evidence details.

## Verification design

Synthetic DOM tests should cover no phantom activity from Done, separate shown/response, frozen retry IDs, account switch during load/mutation, changed date/expired card, pending/unavailable distinctions, suppressed prompts, optional evidence, origin propagation and invalidated outcomes. Browser checks should exercise 320px, 390px and desktop, light/dark, keyboard focus, 44px controls and 16px inputs. Capture and inspect actual screenshots. Synthetic fixture results do not establish live account or production behavior.
