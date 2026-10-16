# Camera bridge verification attempts

Objective: locally qualify scoped Camera-close cloud-screening/draft bridge.
Workspace: photo-review-drafts web; auto-meal-photos-probe native.
Scope: no provider, hosted writes, release or Git publication.

2026-10-10 attempt 1: integration tests passed 13/13, then expanded selected-photo
regression passed 68/68. Nonincremental typecheck failed only in new test source:
UUID default inferred a template-literal type rather than string; mixed forbidden
metadata array inferred optional undefined properties. Expected: compile. Actual:
TS2345 at new test lines89/93. Repair explicit string argument and typed metadata
cases; no production behavior change. Next: typecheck and affected focused checks.

Supabase CLI and Swift/Xcode are unavailable on Windows. This is capability
evidence, not a failed migration/compile attempt. Draft SQL is kept in the existing
docs/migrations pattern; generate its release migration through the CLI on a
qualified host before installation. No native compile run is claimed.

Attempt 2: bridge SQL/API passed 16/16; three new setup component tests failed
because their jest-dom matchers were not registered. Added the explicit Vitest
matcher import; four focused files then passed 31/31. No product change was
needed for the matcher failure.

Independent review found three product blockers and one coordination hazard:
timestamp-only admission could admit old future-dated probe photos; revocation
failure was swallowed by the sign-out fallback; JPEG checking stopped at the
first scan; pairing/disable used process-local generation alone. Repairs use a
fresh separate cloud Photos checkpoint, sign-out preflight outside the fallback,
whole-JPEG scanning plus real bounded decoding, and persistent enrollment/epoch
coordination. Specific negative tests were added. The existing failed review
receipt is preserved in ignored output; it is not final approval.

Attempt 3: nonincremental typecheck found only two incorrect relative imports in
the reviewer's ignored runner. Reviewer repaired its runner, without changing
candidate code. The expanded capture/auth/photo set then passed 108/108 across
10 files. Lint passed with the two existing warnings in PhotoMealReview and v2.
Final typecheck/build and independent corrected-candidate review are still being
completed; no native compile or hosted readback is implied.

Final follow-up: independent corrected-candidate review accepted scoped local
source and reproduced 38/38 checks. The production build first rejected a helper
export from a Next.js route; moved the helper unchanged into a library. Its next
run compiled but prerender failed because public Supabase settings were missing.
A final run with process-only build placeholders and both feature flags off
passed and generated all 92 routes. These were distinct failures, each repaired;
there was no unchanged retry. Final nonincremental typecheck passed. Post-helper
bridge tests passed 19/19 and setup wording checks 3/3. The exact 34-file source
pin and independent receipt are preserved in portable verification files.
See 2026-10-10-camera-bridge-final-local.md for current evidence and the dedicated
handoffs/camera-cloud-bridge.md for release prerequisites. Native tests remain
unexecuted; no native compile, provider, hosted or release claim is made.
