# First JEV shadow comparison: review and authorization

Tracking: `Fitness-Tracker-i40.4.4`. Historical review packet. Greg subsequently
approved the labels and named budget; the [live results](jev-shadow-results-2026-09-26.md)
are recorded under `i40.4.5`. The pre-approval state below is preserved as history.
These are eight synthetic development examples, not the
sealed holdout, private athlete records or evidence of calibrated accuracy.

## Proposed review labels

Supported means justified by the supplied context, not proven effective or cleared
for prescription. Contradicted requires conflicting evidence. Insufficient evidence
means the claim is not established; it does not mean the opposite is true.

| Case | Evidence and claim to check | Proposed judgment |
|---|---|---|
| 01 | Goal: improve a standardized flying-run result. Claim: upright speed is a relevant training demand. | Supported |
| 02 | Goal: comfortable walking habit; athlete explicitly declines barbells. Claim: the goal requires maximal barbell lifting. | Contradicted |
| 03 | Only a standing-jump proxy is measured; no approach-jump attempt. Claim: the approach-jump event target has been achieved. | Insufficient evidence |
| 04 | Repeated comparable strength assessments meet the target; running remains below target and is the confirmed priority. Claim: maintain strength while emphasizing running. | Supported |
| 05 | Symptoms have resolved, but there are no recent upright running exposures. Claim: current evidence establishes tolerance of maximal upright sprinting. | Insufficient evidence |
| 06 | Required event implement is unavailable this week; goal retained and access reviewed next week. Claim: temporarily defer the exact assessment. | Supported |
| 07 | Pulling records have unknown implement, handle height and rest. Claim: they establish like-for-like improvement. | Insufficient evidence |
| 08 | Final working sets were logged as hard with worsening technique. Claim: all working sets were easy and technically sound. | Contradicted |

Review can accept all eight or correct individual cases. No answer has been
attributed to Greg yet. Agreement on these examples is an initial development
signal, not a release gate, calibrated confidence threshold or general accuracy estimate.

## Proposed paid scope

- Provider: TypeSafe; exact model: `jev-1.13.0`.
- Maximum: eight physical requests, one per frozen case, one question each.
- Total spend authorization requested: **USD 0.10**, no retries or extra probe calls.
- Only the synthetic request state is sent. Baseline programs, owner identifiers,
  expected labels, source paths and outcome-revealing fixture names are excluded.
- Current [published pricing](https://docs.typesafe.ai/models), checked September 26:
  USD 0.042 per million input tokens, output tokens free; maximum 64k input tokens
  per request. Reserving that entire maximum for every call gives USD 0.021504 for
  eight calls. This conservative reservation is not a provider billing receipt.
- Recheck pricing before dispatch. Stop if the model/rate changes, accounting is
  uncertain, a request/receipt is invalid or the connection fails. No substitutions.
- Preserve all proposals, acceptance, credentials, model routing and numerical
  activation. This is an observation-only comparison.

The [accepted QPlan](../../plans/coaching-programming-quality.md) states:
“Before any paid comparison, specify provider/model, maximum calls and total spend
for explicit authorization.” Earlier general approval did not name these limits.

## Frozen artifacts and runner

Ignored directory: `output/programming-quality-review/jev-shadow-development-v1`.
Eight requests are 2,240–2,415 bytes each, below the 8,192-byte cap.
Manifest SHA256:
`01b90fd957476b93a98d47077fb10933204e2bbae0eb8c12f06cbbac8fb395c6`.
Proposed-label SHA256:
`99dee7f9fff219d86ae52aae6a47874cf38492145e0a273f7c8e215f0d422eda`.
No reviewed-label file, live approval or dispatch claim was created.

`scripts/programming-shadow-packet.ts` builds neutral requests and separates the
review labels. `scripts/programming-shadow-runner.ts` provides a project-local
wrapper around an injected existing transport. The shared experiment dispatcher
accepts only model-routing and retry-escalation decisions, so these quality checks
must not be disguised as routing. Shared dispatcher/client files were not changed.

After approval, save reviewed labels with Greg's actual judgment and approval
source; bind their new hash and the manifest hash in `ShadowApproval`. Compile the
local wrapper with the repository's existing tooling, and inject the existing
`jev_transport.mjs` exported `run(connection, request, receipt)` function with the
existing machine-local connection. That bridge calls the established Choice client
with its 30-second deadline and no retries; do not replace it with another HTTP client.
The wrapper itself does not provide a default transport or credential loading.

The atomic run claim allows one dispatcher. It records the approved manifest,
review labels and spend reservation before any call. Each attempt persists exact
approved request bytes and a dispatch claim first. Completed callbacks bind exact
receipt bytes to request, manifest and labels. Recovery verifies these bindings and
never resends. A crash consumes the attempt; a late receipt without a binding stays
unverified. This intentionally forfeits unused calls after interruption. No caller
may evade the cap by copying the package to a new run directory.

Known usage and estimated cost are reported separately from incomplete accounting.
Review all verdict disagreements, especially supported answers on insufficient or
contradicted cases. Record raw probabilities, latency, usage and failure counts;
do not treat high confidence as authority. No automatic routing follows this trial.

## Verification

67 tests passed across the shadow runner, offline decision checker and goal-demand
trace. TypeScript and scoped ESLint passed. The packet export then passed all 18
runner checks and was read back; its directory is ignored and has no dispatch claim.
Tests cover approval/hash/label/cap rejection, pre-dispatch journaling, concurrent
dispatch, interruption, no-resend recovery, malformed/unknown/over-reservation
receipts, and changed request/receipt/label artifacts. All provider responses were
injected. Live transport and billing are unverified for this programming trial.

Independent source review found missing receipt-to-request binding and approved-byte
preservation; both were repaired and covered by tests. Re-review cleared the scoped
runner/packet with no remaining blockers. No live API calls occurred.
