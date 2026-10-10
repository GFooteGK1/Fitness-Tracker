# Camera cloud bridge handoff

Updated 2026-10-10 after native qualification. Objective: Camera closes → new
photos → GPT food screening → Socius macro review draft → explicit acceptance.
Implementation tracker: Fitness-Tracker-1vo.19; remaining hosted release/device
acceptance: Fitness-Tracker-1vo.20. Epic Fitness-Tracker-1vo remains open.

Local implementation, independent review and native unsigned qualification are
complete. The eleven reviewed native files were committed/pushed under Greg's
next-steps instruction; exact-head macOS CI passed. Hosted receiver, migration,
signing, TestFlight and device acceptance remain pending. Native push triggered
the normal protected Git preview, containing that branch's older web code, not
the new receiver. No hosted migration, protection/credential change, real provider
call or TestFlight upload occurred.

## Current workspaces

- Web: C:\Dev\Personal\repos\Fitness-Tracker\.worktrees\photo-review-drafts,
  branch codex/photo-review-drafts, base d3db5fb316f0f48fc8b61df9250997c20dc12d04.
- Native: C:\Dev\Personal\repos\Fitness-Tracker\.worktrees\auto-meal-photos-probe,
  branch codex/auto-meal-photos-probe, published head b38c9004ebbe55e3f2250256024629c11c868a6c;
  original base d36f85311a77a01b1ca2afe9cab43c4b2cb9e257.

Web publication is held until migration/configuration are ready. Preserve unrelated
root, historical probe diagnostics, support captures and evaluation files. The
source manifest identifies the 34 reviewed candidate files; do not stage everything
from either worktree. Inspect current web HEAD/package receipt before publication.

## Evidence and decisions

See [final local result](../docs/verification/photo-review-drafts/2026-10-10-camera-bridge-final-local.md)
for 108 focused tests, independent 38-test review, final type/lint/build and
immutable source/review hashes. Build used process-only placeholder public
Supabase values. [Native release preflight](../docs/verification/photo-review-drafts/2026-10-10-camera-bridge-native-release-preflight.md)
supersedes the earlier native-unexecuted status: exact b38c900 macOS CI passed
14 core tests, including all nine bridge tests, and unsigned app/extension build.

[ADR-0032](../docs/decisions/ADR-0032-camera-close-cloud-photo-bridge.md) defines
hashed scoped device pairing, explicit cloud consent, fresh discovery checkpoint,
durable identity before dispatch, status-only uncertain recovery, bounded queue,
metadata stripping, revocation and review-only drafts. Existing selected-photo
and diagnostic lanes are preserved. GPT policy/model/thresholds are unchanged.

## Next concrete work

1. Obtain explicit hosted authority for the exact fitness-tracker Supabase
   migration and the proposed Vercel camera-pilot preview-domain exception. The
   receiver needs branch-scoped SUPABASE_SERVICE_ROLE_KEY secure configuration;
   its existing production-only secret is not available locally. Never retrieve
   or print that secret or broaden it to unrelated previews.
2. Install only supabase/migrations/20261010213531_camera_photo_bridge.sql after
   confirming its reviewed SHA256, then qualify grants/Auth/PostgREST. Do not bulk
   db-push this worktree, which lacks later hosted programming migrations. Even
   flag-off sign-out requires this revocation RPC.
3. Publish/deploy only exact committed web/package source to the existing project.
   Use the proposed fitness-tracker-camera-pilot-gregs-projects-98860c8b.vercel.app
   alias only after ownership check and approved domain exception; qualify rejection
   paths and deployment-specific flags. Keep the main production app unchanged.
4. Under explicit distribution authority, sign/distribute native b38c900 through
   TestFlight only after hosted preflight succeeds. Unsigned CI already passed.
5. Run the device matrix in the earlier local snapshot. Prove one clear-meal
   draft, explicit correction/accept/dismiss, non-food exclusion, duplicates,
   unknown-delivery status, offline/iCloud deferral and disable/sign-out races,
   unlocked and locked after first unlock. Preserve build/request receipts.

The user reported that the earlier selected-photo preview tests passed. That
does not establish this automatic lane's device behavior. The implementation can
close on local/unsigned evidence; .20 and the epic remain open for hosted/device proof.

## Recovery and authority

No pending real upload/provider request exists from this local qualification.
Never repeat a future uncertain photo body, replace its identity, reset queued
evidence or silently reactivate a cancelled pairing. Preserve failed receipts.
No auto-review rejection occurred. Next-steps authority covered native publication
and unsigned qualification. Hosted credential/protection/database targets and
TestFlight distribution need explicit approval. Routine private project-board
notes are authorized; Beads remains authoritative. No Dolt remote sync was run.
