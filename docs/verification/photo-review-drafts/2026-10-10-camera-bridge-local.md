# Camera-close bridge local qualification

Task: Fitness-Tracker-1vo.19. Scope approved October 10: local implementation and
verification of opt-in Camera-close → GPT screening → Socius review draft.

Web base: `d3db5fb316f0f48fc8b61df9250997c20dc12d04`, branch
`codex/photo-review-drafts`. Native base:
`d36f85311a77a01b1ca2afe9cab43c4b2cb9e257`, branch
`codex/auto-meal-photos-probe`. Candidate changes are uncommitted. Existing
unrelated diagnostic/evaluation files were preserved in both worktrees.

## Implemented contract

Pair through `/capture/camera` using explicit unattended cloud consent. The
private capability is revealed once in the browser, stored in native Keychain
and represented by a hash on the server. Setup, revocation, request admission,
terminal outcomes and draft creation use narrow RPCs. RLS and table grants do
not expose token hashes, cross-owner statuses or canonical acceptance to native.
The companion owns a new checkpoint and bounded queue, persists the first
transport identity, and uses only status after unknown delivery. Each invocation
processes one photo. No historical probe photos are used. Cloud-only/unavailable
assets defer; old-date imports do not qualify. No queue pruning is automatic.

The current GPT model/policy and 0.9 thresholds are unchanged. Only qualified
food continues to the configured Socius macro analyzer. Refusal/error/uncertain
stops. Only explicit browser acceptance creates a meal. Images are normalized
and metadata-stripped before transport, bounded and decoded again on the server,
and never saved in SociusFit photo storage or request/draft records.

## Local evidence

The latest expanded run passed 108 tests across 10 files:

```
npx vitest run test/api/camera-photo-bridge.integration.test.ts test/api/camera-signout.test.ts test/api/photo-drafts.integration.test.ts test/components/camera-photo-setup.test.tsx test/auth/auth-context.test.tsx test/nutrition/photo-screening.test.ts test/capture test/auth/post-signout-access.property.test.ts test/auth/whoop-token-signout-persistence.property.test.ts --maxWorkers=1
```

This executes real disposable PostgreSQL functions/RLS with actual JPEG pixels,
fake providers and fake Supabase RPC HTTP transport. It covers a concurrent
duplicate held at screening, changed input, replacement-identity conflict,
lost finish response, unreclaimed processing, scoped status, revocation/expiry,
post-suspension revocation, paused uploads, caps, non-food/uncertain/failed routes,
JPEG metadata after scans, progressive pixels, dimension limits, review-only
drafts and separate owner acceptance. UI/auth tests cover explicit consent, late
pairing secret/account changes, revoke acknowledgement and sign-out failure.

Nine native core tests are authored, including fresh-checkpoint future-date
exclusion, persistent epoch fencing across store instances, corrupt-evidence
preservation, lease contention and between-scan metadata stripping. These have
not run on this Windows host. They do not prove actual asynchronous iOS Photos,
Keychain, URLSession or locked invocation behavior. Independent review and final
type/build evidence will be appended once complete.

## Release procedure and device acceptance

Local qualification does not authorize hosted writes, deployment protection
changes, provider calls, commits/pushes, signing or TestFlight distribution.
Publish only the scoped candidate after review, then run exact-revision native
CI: `swift test --package-path ios`, XcodeGen and unsigned host/extension builds.
Generate a Supabase migration from the reviewed draft SQL with the CLI and
qualify it on the intended target. Install the migration before web deployment:
sign-out now fails visibly without the confirmed revocation RPC, even while the
bridge flag is off. Verify Supabase Auth/PostgREST grants on that target.

Select a callable receiver before native release. The existing selected-photo
Vercel preview requires browser authentication and cannot receive native bearer
requests as configured. A device must not receive a Vercel bypass secret. Record
the approved target/protection arrangement and its identity/route readbacks.
Enable only the intended target's bridge and capture-v2 flags. Review native
privacy disclosures/provider retention and App Store settings before distribution.

On the qualified build, use SociusFit web for pairing/review and SociusFit Auto
Meals for pairing, queue diagnostics and the new Shortcut action. Verify:

1. Pair after existing test photos; future-dated/edited old photos stay excluded.
2. Photograph a clear meal unlocked, close Camera, and see one review draft with
   no nutrition change until explicit acceptance; correction/dismissal work.
3. Repeat from the locked Camera after first unlock. Record the build, request
   outcome and timing. A thumbnail probe's old success does not qualify this lane.
4. Non-food, screenshot and ambiguous images produce no automatic meal.
5. Repeated Camera close never duplicates provider work or drafts. Multiple new
   photos drain one at a time on subsequent invocations.
6. Before first unlock, denied/limited Photos, offline-before-send and unavailable
   iCloud-only photos defer without a new sent request. Restore access and run.
7. Lose the response after first dispatch; status resolves the same identity or
   remains visibly pending. Never repeat the photo body or reset pending state.
8. Disable during pairing and processing; another process cannot re-enable the
   cancelled pairing. Sign out/revoke from web, and the capability stops before
   another provider dispatch. Already sent requests cannot be recalled.
9. Kill/relaunch during submitted state and hit capacity/history/corrupt-state
   boundaries. Preserve the original evidence and show a bounded recovery message.

This is the next device test matrix, not completed evidence. The broader automatic
feature and .19 stay in progress until required native/release verification exists.
