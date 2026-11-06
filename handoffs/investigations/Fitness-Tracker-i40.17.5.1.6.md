# First-reviewed setup cannot be verified

As of October 11, 2026. Canonical tracker: Fitness-Tracker-i40.17.5.1.6.
Workspace: `.worktrees/programming-quality`, branch `codex/programming-quality`.
Status: local repair verified and independently reviewed; publication and hosted verification pending.

## Confirmed cause and repair

The setup reader loads performed training evidence before returning the setup seed.
The complete owned retrieval contained 42 workouts, all using
`blocks[].segments[].events[]`. Both coaching consumers supported only
`movements` and `exercises`, so they rejected this stored format and the setup
endpoint returned unavailable. Confirmed setup declarations and the active
designation were not the cause.

The repair shares original-index event traversal between both consumers. It reads
actual quantities only from `performed`, retains prescribed targets, segment
rounds and block scores separately with their source paths, and does not multiply
rounds or invent sets or effort. Malformed and mixed representations remain
incomplete. Existing formats, ownership, cutoffs and deduplication remain enforced.
Numerical policy remains disabled. There are no database or dependency changes.

The existing 64-entry candidate limit remains. An explicit 1–180 day lookback
control defaults to 90 and invalidates unsubmitted prepared state when changed.
It cannot change during a retained request. Over-limit preview returns guidance
to choose a shorter window; it never truncates evidence or silently narrows it.

## Attempts and verification

1. Owned source replay before the repair: setup declaration construction passed,
   but source fetch and setup read failed with `Performed evidence retrieval is
   incomplete or requires review`. Complete retrieval had zero included events.
2. After the repair, the retained owned-source replay passed all four checks,
   including setup and fresh factual projection. All 364 events are represented,
   with zero omitted events and zero structural issues. The private source was
   not rewritten. Root focused regression: 312 tests passed. Typecheck, scoped
   ESLint and diff checks passed.
3. Independent review passed 81 checks with no material findings: maintained
   regressions, private saved-source composition, adversarial cases and old-reader
   failure detection. Maximum projected record summary was 2,456 characters,
   below the existing 4,000-character bound. The 63/64/65 maintained checks cover
   packet parsing; the service over-limit branch and request bindings were
   inspected. No private candidate was submitted.
4. First local build failed during `/capture` prerender because this checkout
   lacked Supabase build configuration. The second build used the exact CI
   placeholders (`https://example.supabase.co`, `ci-placeholder-key`) and passed,
   including all 89 static pages. Existing unrelated hook and workspace-root
   warnings remain. This proves buildability, not hosted behavior.

The independent replay harness had one duplicate-import transform failure while
copying a changing diagnostic test. Its original result is retained; a separate
corrected copy passed. Candidate source was unchanged by the reviewer.

Private evidence remains in ignored
`output/programming-quality-review/rollout-2026-10-08/`.
Review receipt: `independent-segment-history-review-20261011.json`, SHA256
`27f5934b9f3c64cf53ae1f264230f9d73412a7fd0b70a4deed9265fc77804f83`.
This receipt pins all eleven runtime and test files. Private athlete exports are
excluded from publication.

## Concrete publication and release plan

Publish only these eleven reviewed runtime/test files plus this investigation:

- `app/lib/coach/segmented-workout-events.ts`
- `app/lib/coach/performed-dose-evidence.ts`
- `app/lib/coach/performed-work-context.ts`
- `app/lib/coach/planning-context.ts`
- `app/lib/coach/reviewed-evidence-projection.ts`
- `app/lib/coach/first-reviewed-candidate-server.ts`
- `app/lib/coach/first-reviewed-preview-http.ts`
- `app/program/first-reviewed-workspace.tsx`
- `test/coach/segmented-workout-events.test.ts`
- `test/program/first-reviewed-setup-workspace.test.tsx`
- `test/database/first-reviewed-candidates.test.ts`

1. Verify the reviewed hashes and exact staged diff. Commit and push the repair
   on `codex/programming-quality`; keep PR #88 draft. Preserve unrelated changes.
2. Require the full CI workflow to pass for that exact new commit, including the
   maintained test suite, typecheck, lint, build and mobile browser journeys.
3. Prepare and independently qualify a fresh, isolated staging operation for
   Vercel project `prj_RocmjxStsTrtmrDaqMddMnb29ENh`, team
   `team_zjdKVgrSBNAYC9gql0Raiocm`. Pin the committed source and use a new exclusive
   operation receipt. Do not reuse any consumed installation, promotion, access
   grant or staging intent from the earlier release.
4. Verify the staged deployment and read-only setup/facts flow with Greg's
   authenticated browser. Preview shares production Supabase: no synthetic user
   writes, database installation, context rewrites or numerical activation.
5. Prepare and qualify promotion of only that verified candidate to SociusFit.
   Read back all three domain assignments before and after promotion. Retain
   current live `dpl_EnibmH7rQSGvhYEaPvi91yKng68M` as the recovery target if the
   new app fails. Do not delete deployments.
6. Verify the live setup/facts read. Keep this bug open until hosted evidence
   passes. Then continue the complete-week review and separate athlete acceptance.

Greg's existing commit/push and full remaining Programming v1 release approval
covers this in-scope blocker repair. The prior release packet pins source
`2a33c004`; its artifact qualification does not prove this new source. Bind the
new commit, CI, staging and promotion evidence before release. Do not replay
consumed operators or broaden the approved project or action scope.

## Attended check after hosting the repair

Ask Greg to explicitly choose a history window; recommend 14 days, which the
captured source contains as six workouts and 51 events. Keep older work outside
that selected review scope as historical, not absent. Then read saved setup and
load fresh facts. The 90-day scope contains 364 events and correctly exceeds
the review-packet limit.

Chat confirms current hamstrings are good and listed equipment is available.
The last saved declaration still contained the old limitation and clarification
text. Verify and correct those persisted fields after the reader works; do not
claim the chat confirmation was already saved. No reviewed candidate or new week
has yet been accepted, and the September week remains preserved history.
