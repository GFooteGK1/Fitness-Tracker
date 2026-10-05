# Fresh scene challenge acquisition

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
