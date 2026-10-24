# Athlete programming navigation and accepted-week status

October 11, 2026. Canonical blocker: Fitness-Tracker-i40.17.5.1.7.

The athlete Plan screen previously offered only the coach-assignment workspace.
Greg's existing personal program was available through first-reviewed programming,
but that page had no normal navigation entry. The September accepted week also
appeared under "This week", "Active" and a terminal "Today" session in October.

The Plan entry now offers "Review your next week". Legacy programs enter the
first-reviewed flow; programs already using reviewed-week format retain their
existing proposal route. The coach workspace remains a secondary entry. Its
empty state offers the athlete review route without creating an assignment.
The review screen uses the same plain-language title and links back to Plan.

Accepted legacy weeks are labeled by the athlete's local calendar date: last
accepted week/history, this week/current, or upcoming accepted week/scheduled.
Past and future weeks do not expose today's result card. Terminal cards within
the current week require an exact date match. Existing session statuses and
accepted prescriptions remain unchanged. Proposed weeks still require separate
reviewer approval and athlete acceptance.

Sign-in resume is restricted to the exact programming routes, including UUID
session and proposal identifiers. External URLs, protocol-relative targets,
encoded paths, dot normalization, backslashes, whitespace and unlisted paths
fall back to Dashboard. The sign-in page waits for profile loading and preserves
onboarding precedence. The form no longer races that decision with its own
Dashboard redirect. This changes navigation only; no auth credentials, cookies,
RLS, grants or database schemas change.

Focused checks cover navigation destinations, calendar boundaries, unchanged
history, unsafe return targets, protected content, profile waiting, onboarding,
and sign-in completion. Hosted computer-use proof is required before promotion.
Numerical policy remains disabled. The staged app shares production data; do not
create synthetic hosted records or silently accept a new athlete week.

Private independent review and release receipts reside under ignored
output/programming-quality-review/rollout-2026-10-08. Retain prior source-bound
receipts as historical evidence; qualify a fresh artifact for this change.
