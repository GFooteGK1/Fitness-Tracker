# Fresh human-screening challenge

The independently reviewed fresh set has thirteen original public-domain/CC0
photos and thirteen source families. Labels and fixed v4 policy were saved before
inference. Five foods have no visible humans, five contain identifiable human
regions, and three are negatives. Three no-human positives are prepared meal/drink
servings. No source hash/page/author overlap or recognizable reused scene was found
against old32. Model pretraining independence is unknown.

One blurry archival frame was acquired but excluded before inference because food
presence was uncertain. The final selected source was unavailable after HTTP429.
Both sources and two failed acquisition receipts remain preserved; no further
downloads were attempted. The thirteen scored cases meet the fixed 12-20 range.

One cached local CPU SigLIP observation run completed all thirteen inputs. It
captured 5/5 eligible no-human foods and 3/3 clear meal/drink servings, with no
non-food candidates among three negatives. Three of five human-food scenes passed
as candidates: `challenge-03` carrots/hands, `challenge-05` plates/hands/torso,
and `challenge-09` corn/hands/torso. Semantic screening alone fails the human
abstention expectations. These outputs are now exposed evidence; no thresholds,
prompts or labels were changed after observation.

The fixed v3/v4 composer binds image/manifest hashes, pinned semantic artifacts and
the verified native checkout revision. Missing, unavailable or truncated detector
evidence prevents composition. Upper-body-512 can only demote an existing v3
candidate; 1024px cannot change routing. Timings are summed components, not phone
or end-to-end measurements. The old32 mechanics replay completed without outcome
changes; it is not new quality evidence.

Validation: 33 Python contract tests and eight signing-workflow checks passed.
Independent code review found boolean-as-integer native provenance acceptance;
strict type checks and negative tests fixed it. Independent pixel review agreed
with all thirteen labels and the archival exclusion before inference.

Frozen inputs: `scripts/eval/local-food/fixtures.fresh-challenge-v1.json`,
`fresh-challenge-v1-label-audit.json`, `scene-policy-v4.json`.
Local results: `scripts/eval/local-food/results/fresh-siglip2-windows-20261005/`.
The gate receipt binds the source semantic result, label audit and manifest hashes.

The prepared unsigned Mac workflow uses a constrained `fresh-challenge-v1` input,
pinned public originals at ten-second spacing and JSON-only receipt retention.
Fresh full/upper native geometry and combined v3/v4 quality are pending. No app
runtime, signing, TestFlight, image upload, macro analysis or meal mutation occurred.

Board status: the plan note was delivered and read back at version200. The
checkpoint note `camera-fresh-challenge-checkpoint-20261005-01a0eaae` remains queued:
HTTP400 rejected its note payload for missing required text. Preserve its original
ID/version/payload in the outbox; no blind flush, resubmission or deletion occurred.

## Mac outcome and recovery package

Published package bbd38819f6744605cb455a365142724805e52a8f was read back on the
existing feature branch. The single approved Mac run37309091907 passed unsigned
app/extension compilation, 33 Python contracts, 53 Swift tests plus five XCTest
checks. Fresh fixture acquisition verified cases01-10, then failed HTTP429 on11.
No native detector execution or fresh geometry receipt occurred. Combined v3/v4
quality remains unverified. Preserve this failed run; no repeat was dispatched.

This is the third acquisition failure against the unresolved source blocker.
Guardrails require stopping and approval of a revised method. A deterministic
local ZIP of the thirteen existing originals plus exact manifest passes local
readback and independent inspection. Size25,533,518 bytes;
SHA256 c42772f50d4ef24fc8ea177e772bbe0cee627c7e8c29a52bc722391f69f4825c.
34 Python contracts pass after local transport preparation. The prepared public
fixture prerelease transport removes Commons from the fresh path, validates all
bytes before native execution, and needs new target-specific approval. No ZIP
upload, new release, transport commit/push or recovery run has occurred.
See `docs/plans/2026-10-05-fixture-transport-recovery.md`.

The later local-result/publication/Mac-start board note was delivered and read
back at version202. The earlier malformed checkpoint remains queued unchanged.

## Approved fixture publication, October 6

Greg approved the revised transport package. The public fixture prerelease was
created once, explicitly prerelease and not latest. Published asset615384843 has
size25,533,518 and the frozen SHA256. Download of actual uploaded bytes passed
whole-archive, exact manifest and thirteen individual image hash verification.
34 Python contracts pass. Transport publication and one unsigned Mac diagnostic
are the remaining approved steps; no TestFlight or app runtime adoption.
Release: https://github.com/GFooteGK1/Fitness-Tracker/releases/tag/photo-screening-fixtures-v1.
