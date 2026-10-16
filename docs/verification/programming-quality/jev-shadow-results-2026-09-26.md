# JEV programming shadow comparison: first live result

Tracking: `Fitness-Tracker-i40.4.5`. Eight authorized calls completed through the
existing TypeSafe connection, pinned to `jev-1.13.0`. Greg's Go approved the eight
proposed judgments and USD 0.10 total cap, no retries, after the explicit approval
question. No runtime routing, numerical activation or private athlete transmission.

## Result

JEV agreed with six of eight approved development labels. It returned no supported
answer on the five cases labeled contradicted or insufficient evidence. These raw
counts do not establish general accuracy, calibrated confidence or release readiness.

| Case | Approved label | JEV label | Confidence | Agreement |
|---|---|---|---:|---|
| 01: upright-speed demand | supported | insufficient_evidence | 0.36 | No |
| 02: barbell requirement for walking goal | contradicted | contradicted | 0.98 | Yes |
| 03: proxy used to claim exact event achievement | insufficient_evidence | contradicted | 0.97 | No |
| 04: strength maintenance / running priority | supported | supported | 0.94 | Yes |
| 05: untested maximal upright tolerance | insufficient_evidence | insufficient_evidence | 0.94 | Yes |
| 06: unavailable implement / assessment deferral | supported | supported | 0.92 | Yes |
| 07: unknown pulling protocols | insufficient_evidence | insufficient_evidence | 0.91 | Yes |
| 08: easy sets contradicted by set logs | contradicted | contradicted | 1.00 | Yes |

Case 01 assigned 0.41 to supported, 0.02 to contradicted and 0.57 to insufficient
evidence. Case 03 assigned 0.00, 0.98 and 0.02 respectively. High confidence did
not ensure agreement with the approved label. JEV supplied no prose explanation.

## Interpretation and next development work

Case 01 needs a wording audit before attributing the disagreement entirely to the
model. The review summary described upright speed as a relevant demand; the frozen
request says the goal requires upright speed work. Relevance of a fitness quality
and necessity of a particular training intervention are different claims. The
request also presents a proposed disposition, so the input may blend goal analysis
with individualized emphasis. This is an interpretation of the input, not a JEV
explanation. Preserve the original label, request and result.

Case 03 exposes the distinction between absent direct evidence and evidence that
the target was not met. An unmeasured event outcome is unknown; the model chose
contradicted. A subsequent development packet should explicitly contrast missing
event measurement with a measured result below target and a measured result meeting
target. Clarify whether the question judges actual attainment or whether the claim
is established by the cited evidence. Do not relabel this run to improve agreement.

Prepare those contrasting cases offline and review their exact claim wording.
Another live comparison needs a new bounded authorization: all eight calls in this
allowance have been used, even though spending was far below the ceiling. JEV remains
a candidate shadow reviewer. It cannot replace the P3 demand/theme adapter or
deterministic ownership, protocol, dose, time and acceptance checks.

## Execution and accounting evidence

- Eight valid receipts, eight durable dispatch claims, one attempt per claim, zero
  retries. Read-only recovery verified request/receipt/manifest/label bindings and
  reported complete accounting. No recovery call dispatched a request.
- Provider-reported usage: 6,473 input tokens and 419 output tokens.
- Estimated cost: USD 0.000271866, about USD 0.00027, using the freshly checked
  [published model price](https://docs.typesafe.ai/models) of USD 0.042 per million
  input tokens and free output tokens. This is a rate-derived estimate, not an
  independently verified provider bill. Reserved upper estimate was USD 0.021504;
  authorized ceiling was USD 0.10.
- Observed callback elapsed time: 133–360 ms, median 156 ms. This includes client
  loading/compilation and receipt persistence; it is not pure inference latency or
  application end-to-end latency.
- Existing bridge hash: `dabcee51f368b45fb2e520fa729df390dfa0143dc28c98140a6c61c665d908c0`.
  Existing client hash: `c2000acaa7bd5195b5eab7114c0ca1b7b2bda1b327750b6eea764608225becfc`.
  Both were checked before execution. Credentials were read only inside the existing
  bridge and were neither logged nor changed. Runner bundle/source hashes are saved.
- No application source changed in this turn. Source readback confirms
  `personalizedCoachingCapabilities().initialDosePolicy` remains false. Hosted
  program state was not queried or modified by this trial.

Ignored evidence directory:
`output/programming-quality-review/jev-shadow-development-v1`.
It contains approved labels, approval source, execution basis, exact frozen
requests, durable claims, native receipts, result bindings, latency records and
read-only comparison output. Labels and baseline programs were not sent to JEV.

| Artifact | SHA256 |
|---|---|
| manifest.json | `01b90fd957476b93a98d47077fb10933204e2bbae0eb8c12f06cbbac8fb395c6` |
| reviewed-labels.json | `474ed9a22a1bff7a699c67b1d171d2d74e0c53268e8c73476f2d0ac52ce5725f` |
| run-result.json | `3be1eb1d5f3e33959dcc82a13c17286bba7e73f3873c14983461b733575889c9` |
| comparison.json | `e7015065726cee42be2e604b865f5b70f0c3e4022d4229e3b09f074a8004dbc1` |

Prior verification remains 67 offline checks, TypeScript/lint and independent
review of the wrapper. This turn adds real transport/response/receipt evidence;
it does not claim hosted integration, athlete outcomes, holdout acceptance or
production activation. Frozen baseline and sealed holdout remain untouched.
