# 0008 - Automated local food-screening evaluation

- **Status:** Accepted for local implementation; macOS execution and quality qualification pending
- **Date:** 2026-10-03
- **Deciders:** Greg authorized automated evaluations; Codex selected a shared native runner

## Context

Camera-close discovery passed Greg's phone tests. Initial screening screenshots show
three saved classifications and twelve pending/unrecorded photos; they do not establish
food accuracy. Manual phone labeling should not be a prerequisite for use. Jev accepts
text state and cannot directly classify images. Vision's meal performance is unknown.

## Decision

Share the existing CPU/revision-1 Vision operation between the App Intent and a macOS
Swift evaluator. Freeze inspected public reference images and expected answers before
inference. Grade deterministic routing errors, abstention and timing. Bind hashes, OS,
policy and revision; separate development/holdout and evidence layers. Native compile
CI retains JSON reports without images once this change is authorized to be pushed.

## Consequences

- No Python model reimplementation, provider keys or new dependencies. Photos access
  and phone checkpoint/session behavior remain in the app.
- macOS exercises shared classification/policy, not locked iPhone execution or Photos
  preprocessing. OS model assets and hardware can change results.
- The first 21 references are a food-heavy development set with explicit coverage gaps,
  grouped related images and provisional inspected labels. They support baseline error
  discovery, not privacy/upload acceptance. Correct labels through a new dataset revision
  while retaining old receipts.
- Phone labels remain optional diagnostics. Automation handles preparation/scoring;
  ambiguous reference adjudication remains a review task.
- Missing/error/uncertain meals stay in routing-recall denominators. Sensitive scene
  passes are scored separately from food presence. The grader never activates uploads.
- Images stay in ignored caches. CI fetches frozen public-domain references only.
  Private device data needs separate local handling; any external transfer needs authority.
  Socius macro review drafts and canonical meal acceptance remain later slices.

See `scripts/eval/local-food/README.md` for the rubric, commands and proposed gates.
