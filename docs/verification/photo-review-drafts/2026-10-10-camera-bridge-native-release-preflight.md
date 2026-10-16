# Camera bridge native qualification and hosted preflight

Verified 2026-10-10. Implementation: Fitness-Tracker-1vo.19.
Release/device acceptance: Fitness-Tracker-1vo.20 and the open automatic-photo epic.

## Native result

Greg's instruction to take next steps authorized the scoped native publication
and unsigned checks. Only the eleven native files in the reviewed source manifest
were committed and pushed. Existing unrelated diagnostic/evaluation work remains
outside the commit.

Commit: `b38c9004ebbe55e3f2250256024629c11c868a6c`, branch
`codex/auto-meal-photos-probe`. Exact-head
[macOS CI](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/38088090632)
completed successfully: Xcode 26.5, pinned XcodeGen 2.46.0, 14 core tests with
zero failures, including all nine CloudPhotoQueueTests, signing-contract checks,
project generation, unsigned simulator app and extension, and the existing public
reference classifier evaluation. The host's App Intents metadata extraction ran;
the metadata warning belongs to the extension without an AppIntents dependency.
This is compile/test evidence, not signed-device or locked execution evidence.
No TestFlight workflow was dispatched.

Safe CI receipt/log are preserved under native
`output/camera-cloud-bridge-release/native-compile-38088090632.*` (ignored).

## Migration and live target preflight

Supabase CLI 2.120.0 was obtained transiently through the package runner, without
changing project dependencies. Its discovered `migration new` command generated
`supabase/migrations/20261010213531_camera_photo_bridge.sql`. The file contains
the exact reviewed draft bytes; SHA256:
`944e999b9728c4a30d5d140299e7ff304ab5b83ec0aebfb10426174c589e80de`.
No local reset or hosted installation occurred.

Read-only live checks identified `fitness-tracker`, Supabase project
`auolnfwetmfcwhtvakzy`, healthy PostgreSQL 17.6. The capture migration is installed;
the required activity_drafts columns and validate_capture_operation function exist.
Both camera tables and camera RPCs are absent. Schema/grants/Auth/PostgREST still
need qualification after an approved installation. Do not run an unqualified bulk
db push: this worktree does not contain all later hosted programming migrations.
Apply only the reviewed camera migration through the supported targeted path.

The advisor baseline predates this migration: 20 INFO notices for existing tables
with RLS/no policies, and WARN groups for one mutable search path, one anon
security-definer execution, 73 authenticated security-definer executions, and
leaked-password protection. They are not new camera findings and were not changed.
See the [Supabase linter documentation](https://supabase.com/docs/guides/database/database-linter).

## Concrete hosted pilot proposal

Use the existing Vercel `fitness-tracker` project
`prj_RocmjxStsTrtmrDaqMddMnb29ENh`, team
`team_zjdKVgrSBNAYC9gql0Raiocm`. Authenticated CLI readback succeeded; the connector
403 is a scope mismatch, not evidence that the CLI is disconnected. Production is
main and remains unchanged. Native publication caused the normal protected Git
preview `dpl_GsKxdWm7ccBeyzCtiNZFUYKsL9DK`; it contains the native branch's older
web code, not the new receiver, and is not the selected pilot deployment.

Proposed dedicated preview alias:
`fitness-tracker-camera-pilot-gregs-projects-98860c8b.vercel.app`.
Verify ownership/availability immediately before assigning it. Deploy only the
exact committed web source, install the additive migration first, then point this
alias to that deployment and add one Deployment Protection Exception for this
domain. That exception exposes the entire preview domain to the internet; normal
Supabase login still protects owner routes and scoped capabilities protect native
routes. Other domains retain their current protection. The phone stores no Vercel
bypass secret. Exception removal pauses the native lane at the hosting boundary.

[Vercel's current documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions)
confirms domain exceptions and public visibility. This protection change requires
explicit approval for this domain. No exception/alias was created in preflight.

Credential metadata readback found SUPABASE_SERVICE_ROLE_KEY configured only for
production; this receiver requires it server-side in the pilot. No local copy is
available. Configure it securely for `codex/photo-review-drafts` preview scope
before deployment; do not paste it into chat, embed it in the phone, expose its
value through tools, or make it available to unrelated previews. Provider keys
already exist in preview; retain the previously qualified Meal Logging OpenAI key
as a deployment-only override if approved. Provider calls are not part of preflight.

Set CAMERA_PHOTO_BRIDGE_ENABLED and CAPTURE_RECEIPTS_V2_ENABLED only on the selected
pilot deployment, at build/runtime where required. Verify anonymous owner endpoints,
missing/invalid device capabilities and response headers without submitting photos.
Only after these checks and explicit distribution approval, run the existing
branch-bound TestFlight workflow for the exact native commit, source=native,
confirmation=UPLOAD TESTFLIGHT PROBE. Update Apple privacy/test metadata only under
the corresponding target-specific authorization.

## Remaining evidence

The prior 108 focused tests, independent 38-test review and web type/lint/build
remain local evidence. The generated migration has identical SQL and no new
application behavior. The hosted receiver, actual service-role RPC transport,
signed build, UIKit JPEG compatibility, pairing/revocation and locked/unlocked
Shortcut matrix are not yet qualified. No automatic canonical writes are enabled.
