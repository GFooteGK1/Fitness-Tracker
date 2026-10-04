# Local food classifier comparison

Greg approved improving/replacing local screening and broadening the automated tests.
Baseline: Vision v1 passed 5/11 clear meals and 3/5 scenes flagged for people/body parts.
The application remains an observation pilot; no photo upload or meal creation is added.

## Options and decision

| Approach | Benefit | Constraint | Decision |
| --- | --- | --- | --- |
| Apple Vision plus crops and face/body/hand detectors | Existing native frameworks, smallest runtime change | Same food taxonomy, more compute; detectors need device qualification and cannot guarantee exclusion | Keep as an alternative if replacement cannot fit the phone |
| Off-the-shelf image/text encoder with fixed food and scene contrasts | Direct semantic food/non-food comparison without asking Greg for training labels | Larger weights; desktop quality does not prove Core ML portability, size or locked execution | Evaluate Google's SigLIP2 locally first |
| Existing Socius cloud vision with explicit photo selection | Reuses capable nutrition vision and explicit approval | Automatic library screening would send non-food images and change the privacy boundary | Later manual-review fallback; no cloud calls in this slice |

This is a level-3 choice because it may change a native inference boundary. Lead/builder:
main Codex software engineer. Independent reviewer: existing camera-probe review agent.
Verifier: deterministic grader, hash/provenance readback and local CPU inference.
Confidence is moderate in the comparison's usefulness; phone integration is unproven.

## Evidence and ordered scope

1. Freeze `siglip-probe.json` before inference: exact public model revision/weight hash,
   text descriptions, food/non-food and risk margins. Relative scores are not probabilities.
2. Add real non-food references beyond cats and separate synthetic document/screen controls.
   Inspect pixels and expected answers before model output; preserve the original dataset.
3. Bind the new manifest to model and policy hashes. Use an isolated ignored development
   environment. Load safetensors with remote code disabled and CPU inference; public model
   downloads only, no photo bytes or prompts sent to any inference service.
4. Compare the original 21 case identities against saved v1, then grade broader cases and
   evidence layers separately. Preserve partial/final results. Missing/error meals are misses.
5. Independent review of code, labels, reports and proposed next action. If quality remains
   poor, report it without tuning against these cases or claiming upload qualification.
6. Only after meaningful quality improvement prepare the native Core ML feasibility proof.
   A separate untouched grouped holdout and physical locked-device tests precede qualification.

The model's published card lists Apache 2.0. Model revision
`75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2` and 1,500,800,904-byte weight SHA-256
`612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b` were read from the
public Google repository. Full desktop weights are not a phone deployment proposal;
precomputed text vectors and a converted image encoder would need independent verification.

Sources: [Google model card](https://huggingface.co/google/siglip2-base-patch16-224),
[Apple classification API](https://developer.apple.com/documentation/vision/vnclassifyimagerequest),
[MobileCLIP code/model licence distinction](https://github.com/apple-aiml-research/ml-mobileclip/blob/main/LICENSE).
MobileCLIP's source MIT licence alone does not qualify its weights; a verified artefact-specific
redistribution basis would be needed. No MobileCLIP weights are downloaded for this work.

No runtime dependency, model, policy-version migration or permission change is introduced
in the phone app. Rollback is to leave the evaluation files unused; v1 saved state is preserved.
No push, paid call, TestFlight or production action is implied by a desktop quality result.
