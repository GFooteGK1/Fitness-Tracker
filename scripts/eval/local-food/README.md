# Local food-presence evaluation

This evaluates the on-device screening candidate before any photo upload. It uses
Apple Vision revision 1 on CPU and `LocalFoodScreeningPolicy` from the same Swift
source as the phone. No Jev, provider credentials or nutrition calls are involved.
Expected answers are frozen before inference. Phone development labels are optional;
Greg need not label this reference set.

## Run

From the repository root, with Python 3.9+:

```sh
python3 -B -m unittest discover -s scripts/eval/local-food -p 'test_*.py'
python3 -B scripts/eval/local-food/fetch.py scripts/eval/local-food/fixtures.json scripts/eval/data/local-food
```

On macOS 14+ with Swift 6:

```sh
swift run --package-path ios LocalFoodEval scripts/eval/local-food/fixtures.json scripts/eval/data/local-food scripts/eval/data/local-food/vision-run-001.json
python3 -B scripts/eval/local-food/score.py scripts/eval/local-food/fixtures.json scripts/eval/data/local-food/vision-run-001.json scripts/eval/data/local-food/summary-run-001.json
```

Choose fresh output filenames. Final reports and earlier checkpoints are never
replaced. Each invocation creates a separate `.partial.json` checkpoint and updates
that file atomically after every classification. If inference hangs or the job stops,
grade the partial report with the same command: absent cases count as errors/misses.
The unsigned native CI workflow runs the evaluation after compilation and retains
JSON reports, including partial evidence on ordinary step failure, for 30 days.
Abrupt runner loss or a job-level timeout can prevent artifact upload; checkpoint
creation does not guarantee remote retention. Images and local
reports in `scripts/eval/data/` are ignored by Git. No schedule or activation is added.

## Rubric

- Food presence means visible edible food or drink, including packaged or growing
  food. It does not establish consumption or an estimable portion.
- A clear meal has a central prepared portion. Packaged shelves, growing fruit,
  drinks, stored leftovers and meals mixed with people are separate categories.
- A candidate on non-food is a false pass. Uncertain, error and missing food results
  are misses for automatic routing, even when abstention is sensible.
- People/body parts and screenshot metadata are separate challenge flags. A candidate
  on a flagged scene is a sensitive false pass regardless of food presence.
- Score food/clear-meal recall, non-food and sensitive false passes, uncertainty,
  errors, and nearest-rank p50/p95 classifier duration. Missing cases have no invented
  timing and remain in recall denominators.

Report evidence layers (public, synthetic, private device) and development/held-out
splits separately. Reports bind manifest/image SHA-256 hashes, policy/revision, OS
and preprocessing. Unknown/duplicate cases, changed pixels, wrong manifests and
cross-split image groups fail validation. Expected answers are not passed to Vision.
Same-scene rice and granola photos share groups. No overall accuracy is pooled across
layers or splits, and the grader never grants automatic-upload qualification.

The starter set has **21 development references: 19 food, two cats**, with 11 clear
meals and five scenes containing people/body parts. Codex inspected all pixels before
inference; these are provisional development labels, not expert adjudication. There
is no untouched holdout. Documents, photographed screens, medical scenes, broader
non-food scenes and a close-up packaged-food case like Greg's granola bag remain
coverage gaps. Read category counts alongside aggregate scores.

macOS uses an oriented 512px ImageIO thumbnail. The phone reads through Photos with
downloads disabled and passes image orientation. Vision and policy are shared, but
preprocessing, OS assets, hardware, Photos availability and locked execution differ.
CLI timing covers Vision/policy; phone timing includes image access. Neither establishes
battery/memory behavior. Cancellation is cooperative and can exceed ten seconds.

## Use the results

1. Run the unchanged candidate and inspect failures/reasons before tuning thresholds.
2. Expand representative negatives and packaged food; independently adjudicate a
   separate grouped holdout. Do not tune against the holdout.
3. Compare frozen baseline and candidate on the same OS and preserve both receipts.
4. Review clear-meal recall (proposed target 95%), observed sensitive false passes
   (target zero), broader false-pass/abstention coverage and physical locked execution.
   These proposed gates need sufficient coverage and review; they are not guarantees.
5. Implement authenticated Socius analysis into review drafts with duplicate prevention,
   recovery and explicit meal acceptance after the routing decision is qualified.

If general Vision misses food badly, compare another image-capable classifier/provider
under a separate scoped decision. Jev may judge text observations later; it cannot
read these images directly.

## Data acquisition

Public source/licence/author links are recorded in `fixtures.json` (CC0/public domain).
Fetch pinned HTTPS Wikimedia media URLs, bound inputs to 10 MiB, verify hashes before
writing, preserve existing files, and stop on the first error. Redirect destinations
are checked before following them. Do not retry rate limits automatically.

Initial bulk metadata collection was rate-limited; a nonterminating PowerShell loop
reused stale results. That catalog was rejected and preserved in ignored local data.
Only successful records were inspected and frozen. Further bulk API lookup stopped.
The frozen fetcher uses file URLs and does not query/search the Commons API.

Do not add personal photos to this public CI manifest. Private device evaluation
needs a separate local manifest/cache; any upload needs target-specific authority.
