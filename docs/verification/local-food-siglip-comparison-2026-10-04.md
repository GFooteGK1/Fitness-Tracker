# Local food screening comparison — October 4, 2026

The approved offline candidate comparison is complete. Food recognition improved on
the exposed development set, but the scene-risk policy still fails. It is unsuitable
as an automatic-upload permission gate. The phone remains the existing observation pilot.

## Observed results

| Same original 21 images and rubric | Saved Vision v1 | SigLIP2 probe v1 |
| --- | --- | --- |
| Clear meals passed | 5/11 | 11/11 |
| All food images passed | 8/19 | 16/19 |
| Non-food false passes | 0/2 | 0/2 |
| Scenes flagged for people/body parts passed | 3/5 | 2/5 |
| Uncertain | 9/21 | 5/21 |
| Errors or missing results | 0 | 0 |

The broader real-photo set has 26 cases: 19 food and seven non-food. No non-food
case passed; only two were classified non-food and five were uncertain. Overall eight
of 26 were uncertain. All six synthetic document/UI/abstract controls were uncertain,
with no false passes or execution errors. These are separate development evidence
layers, not a pooled accuracy score or a privacy qualification.

The two previously shared user photos were checked locally in a separate ignored
manifest/cache: the granola package was **uncertain**, and the cat was **non-food**.
No user image, private manifest or private result is included in the public fixtures
or publication package. This is desktop analysis of shared references; the
`privateDevice/development` label does not establish physical-device execution.

The granola package's food margin was positive (6.07), but the independent risk
contrast abstained (risk margin 1.42). The strongest food description was packaged
food, and the strongest risk description was a screen showing food. The public
packaged-food shelf also abstained for risk. This suggests a false risk response;
it does not prove an actual screen detector. Conversely, public-02 (hands near pizza)
and public-13 (vendor/body with bananas) still passed. Prompts and thresholds were
not changed after observing any of these outcomes.

## Execution and immutable inputs

Runtime: Windows desktop, Python 3.13.12, torch 2.8.0, transformers 4.57.1,
Pillow 11.3.0, CPU with four threads. Exact runtime/model/processor classes are in
`results.json`; the isolated 28-package development lock is retained. Public
per-image p50/p95 were 129/210 ms. These include image loading/preprocessing/inference,
exclude model loading and text-feature preparation, and cannot be compared directly
with macOS Vision timing or interpreted as phone performance.

The Google model card declares Apache 2.0:
[SigLIP2 base model](https://huggingface.co/google/siglip2-base-patch16-224).
The checkpoint uses the installed `SiglipModel` implementation, despite its SigLIP2
product name. The frozen model and supporting-file hashes bind immutable revision
`75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2`. Git blob hashes bind small supporting
files; LFS SHA-256 binds tokenizer artifacts and weights. The raw report also records
all supporting files' observed SHA-256 values. Remote code is disabled, weights use
safetensors, and all inference loads are local-only. Public downloads contain no
photo data and use no provider inference API or implicit Hugging Face token.

| Frozen artifact | SHA-256 |
| --- | --- |
| `siglip-probe.json` | `31a14ad5495f8d01422ab883bc8e426a37fe2085f76ba307781866adf0b0761c` |
| `siglip-model-files.json` | `6052922291b4778dbe14924320bd69e2b0e3f9e6629b3cae9dbe172d3b98d4f3` |
| `fixtures.siglip2-development-v1.json` | `cd89bff783f09f4df984af7d4a23b1ffa5d691d5b7c29e1bd445b80125f265b9` |
| Public `results.json` | `953cdbba25e4665b7db3dcbf4fcb58b6a2e87ea83009214145cde652fc89db9f` |
| Public `summary.json` | `e6d4310a92d81ae25dc2194abfc75986fb8f1a215b44fc97b79bfa5220169598` |
| Public `comparison.json` | `14ed135243e25179940a10b44609ba7d829955a405298e0393bc3d31d1d258c0` |

Public reports are retained in `scripts/eval/local-food/results/siglip2-windows-20261004/`.
Git attributes preserve the exact new input/report bytes across platforms. Original
baseline canonical manifest hash remains
`48d96c942ef01ddf066a792c78aa3b7a6541497bbd81870726eff148e6963511`.
The comparison binds original case IDs, pixels, groups, flags and expectations,
and rejects incomplete reports or rubric changes. Extra cases have no invented
Vision baseline. Similarity margins and the logistic `foodConfidence` field are
experimental relative scores, not calibrated probabilities.

## Verification, failures and review

Sixteen offline contract tests passed. All 32 fixture hashes were verified before
model loading and again for the exact decoded bytes. Generated controls matched
their frozen hashes. Fresh reports never overwrite existing final or partial paths;
an inference exception saves one error checkpoint and stops without resending.

Two setup failures were diagnosed before the successful image run:

1. Attempt 01 stopped before model loading: tokenizer files use Git LFS, so checking
   downloaded content against the repository's pointer blob hash was incorrect.
   Immutable repository metadata supplied the actual LFS SHA-256 values. The pins
   were corrected; prompts, thresholds, pixels and rubric were unchanged.
2. Attempt 02 stopped during text preparation: tokenizer metadata has no usable
   maximum length. Installed model configuration supplies 64 positions. Explicit
   padding/truncation to that context passed the targeted 24-by-64 input check.

The failures were reassessed, with independent review of both fixes before attempt
03. That attempt completed all 32 images, followed by grading and comparison. The
two-image local supplementary check also completed without errors. Neither failed
attempt produced image classifications; no output was relabelled as a successful run.

Independent review closed two additional receipt defects before image inference:
decoding the exact freshly verified image buffer and pinning config/tokenizer/
processor artifacts as well as weights. The reviewer independently tested mutation
rejection for LFS artifacts and checked the numerical feature-normalization, learned
scale/bias and text-context handling against the installed implementation.
Final independent result review accepted the offline comparison only. The reviewer
regraded both public and local private raw reports, recomputed the same-pixel comparison,
and confirmed exact saved-summary equality, published hashes and Git exclusion of
private inputs/results. No blocking receipt or interpretation finding remains.
Automatic-upload qualification and phone integration were explicitly not accepted.

## Next implementation slice

Keep the semantic model as a promising food-presence candidate. Prepare native
feasibility around the image encoder plus precomputed text vectors, rather than
bundling the full 1.50 GB desktop checkpoint. Conversion, weight size, memory,
locked-phone CPU execution and battery remain unproved.

Before permitting automatic uploads, evaluate an independently grounded scene guard
and expand packaged-food, real photographed-screen, document, medical and person/
hand cases. Freeze a separate grouped holdout before the next candidate's output;
these exposed cases remain regression/development cases. Do not loosen the risk
threshold merely to pass the observed package. Food presence alone does not establish
a consumed portion or permission to create a canonical meal.

No app model/policy migration, image upload, Socius analysis, meal creation, production
action, commit, push or TestFlight build occurred in this slice. Only development
evaluation dependencies were installed in an ignored isolated environment. Beads
CLI is unavailable; canonical task status was not falsely advanced. The private
project board receives a scoped evidence note without replacing Beads.
