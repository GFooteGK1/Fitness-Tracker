# Fresh scene challenge acquisition

Current status: **revised method approved October 6; transport readback passed**.
Owner: root. Objective: complete fresh v3/v4 comparison before phone adoption.
Prior cycle: three acquisition failures. Recovery cycle: one planned unsigned Mac
attempt under approved fixture transport; no new run dispatched at this checkpoint.

The October 5 fresh challenge acquisition stopped on its first image error:
`HTTP Error 429: Too many requests (f061ab2)`. One exact-title metadata request
succeeded. Two original public-domain images were downloaded and verified against
their source SHA-1 and local SHA-256 before the third original was rate-limited.

Preserved local evidence: `scripts/eval/data/local-food/fresh-challenge-20261005/`:
`metadata-response.json`, `selected-sources.json`, `image-acquisition-failure.json`,
and the first two images. No automatic retry occurred. No labels, semantic results,
or native results have been frozen for this incomplete set. The previous metadata
rate-limit investigation remains separate and is not erased by this attempt.

Continue independent fixed-policy composition work. Do not substitute synthetic
cases or development photos and describe them as new held-out quality evidence.
Any bounded resume must preserve existing originals, verify their hashes, record
the new attempt, and stop at the first new error. A second acquisition failure
requires reassessment; a third requires stopping the blocker and a revised plan.

After more than five minutes cooling off, one deliberate attempt succeeded for
the third original. A separate remaining batch spaced requests ten seconds apart,
preserved and verified all existing images, then stopped on HTTP 429 for the final
selected source (`Summer Meals`). The second failure receipt is
`acquisition-attempt-03.json`; no further retries or source substitutions occur.

Reassessment: fourteen distinct originals are verified and fall within the
precommitted 12-20-case range. Freeze only those successfully acquired originals
after independent pixel/source review. Exclude the unacquired fifteenth source;
record its absence and the resulting coverage gap. Availability determined this
exclusion before any inference, not a favorable model result. Do not claim all
fifteen selected images were acquired or that this small set qualifies uploads.

Third failure: approved unsigned Mac run37309091907 at published bbd38819 stopped
on HTTP429 acquiring challenge-11 after verifying challenge-01 through10.
Ten-second spacing and a different GitHub runner did not remove the source
dependency. All retries/reruns against that blocker stop. Local raw run log:
`scripts/eval/data/local-food/fresh-challenge-20261005/mac-37309091907/run.log`.
No native partial receipt exists because acquisition failed before execution.
Unsigned compilation, 33 Python contracts, 53 Swift and five XCTest checks passed.
Fresh geometry and combined quality remain unverified.

Retrospective: frozen labels, cached semantic results and reviewed composer are
usable. The source-availability hypothesis failed. Do not shrink the challenge
after outputs or tune policy to compensate. A deterministic bundle of the thirteen
existing originals and manifest removes Wikimedia from the fresh Mac path.
Public fixture prerelease storage is a new external target and requires approval.
Prepared local pack/unpack checks preserve exact bytes and reject unknown/missing
entries, changed hashes and oversized archives before writing. Revised method:
`docs/plans/2026-10-05-fixture-transport-recovery.md`.

October 6: Greg approved revised fixture prerelease, transport publication and one
unsigned Mac run. Created the exact planned public fixture prerelease and asset
once, then downloaded actual asset bytes into a new local cache. Size25,533,518;
SHA256 c42772f50d4ef24fc8ea177e772bbe0cee627c7e8c29a52bc722391f69f4825c;
exact manifest and thirteen image hashes passed extraction verification. Prior
failures remain preserved. No source request or semantic inference rerun occurred.
