# JEV clarified shadow comparison: live result

Tracking: `Fitness-Tracker-i40.4.7`. Completed after Greg explicitly approved the
exact v2 judgments and eight TypeSafe `jev-1.13.0` requests, USD 0.10 total cap,
no retries. Original v1 artifacts remain unchanged.

## Outcome

All eight JEV judgments matched the approved labels. The clarified examples now
distinguish goal relevance from an unsupported increase in training, and unknown
event attainment from measured contradiction or confirmed attainment.

| Case | Approved label and JEV result | Confidence |
|---|---|---:|
| 01: upright speed relevant to flying-run goal | supported | 1.00 |
| 02: increasing speed work without athlete context | insufficient_evidence | 1.00 |
| 03: retain the relevant quality while resolving emphasis | supported | 0.82 |
| 04: exact-event attainment with only a proxy result | insufficient_evidence | 1.00 |
| 05: target attainment contradicted by the specific assessment | contradicted | 1.00 |
| 06: target attainment supported by the specific assessment | supported | 0.89 |
| 07: strength maintenance / running priority / retained speed | supported | 0.80 |
| 08: combined sprint/lifting increase with incomplete context | insufficient_evidence | 0.97 |

There were zero supported answers on the four cases labeled non-supported.
These are eight synthetic development cases selected around known issues, not a
holdout or general accuracy estimate. Both prompts and examples changed from v1;
6/8 versus 8/8 is not a controlled measurement of improvement. High confidence is
not authority. The two contextual cases do not constitute complete executable weeks.

## Execution evidence

- Eight successful physical requests, eight durable claims, one attempt each,
  zero retries. Read-only recovery returned complete accounting and verified every
  request/receipt/manifest/label binding without dispatching a new call.
- Provider usage: 8,621 input tokens, 413 output tokens.
- Estimated cost: USD 0.000362082 (about USD 0.00036), using freshly verified
  [published pricing](https://docs.typesafe.ai/models): USD 0.042 per million input
  tokens, output free. This is a rate-derived estimate, not provider billing proof.
  The authorization was USD 0.10; all eight authorized request slots are used.
- Callback elapsed time: 130–402 ms, median 154.5 ms. Includes existing client
  loading/compilation and receipt persistence, not only model inference.
- Existing connection, client and bridge were reused. The driver verified pinned
  client/bridge source hashes before dispatch and saved compiled runner/source
  hashes. Credentials, shared transport and current routing were not changed.
- The full approved context and claims were sent, with reviewer labels, owner IDs
  and baseline programs excluded. All case state was synthetic.
- No application source changed. `initialDosePolicy` remains false. The trial did
  not read or write hosted athlete plans and did not activate JEV in production.

Ignored evidence directory:
`output/programming-quality-review/jev-shadow-development-v2`.
Approval, reviewed labels, execution basis, requests, claims, native receipts,
bindings, timings and comparison output are retained there.

| Artifact | SHA256 |
|---|---|
| manifest.json | `c1bbb0cbdab2561ed69f7d1ceb18a5c7f64c6e3b857a0117471ecc048e09a7c3` |
| reviewed-labels.json | `0eba72a88aac6bcd8edf4dfca389bdb9cb4d87b384e45feaa2a482ea06ffa557` |
| run-result.json | `d0fea94b4abe3e7bb6a795afa7498d3074d6df3a177ff28423d0184ccd145764` |
| comparison.json | `a520c74e04da470052a5b031a0e732091f2ea63c2fd9f6fa8bac6688203240df` |

## Next work

Prepare full-week decision packets from executable development proposals with
source-bound intent, evidence, selected themes, deferred demands and compiled
sessions. Include valid and flawed decisions involving competing priorities,
partial context and unsupported claims. Deterministic checks continue to own exact
coverage, time, protocol identity and numerical authority; JEV checks semantic
justification. Generate human review from the same packet and preserve the baseline.

This preparation can proceed offline. Further paid calls need a new named allowance.
Runtime shadow integration belongs alongside the P3 demand/theme adapter, after
its P2 acceptance dependency. The focused v2 result does not satisfy broader P0/P2
adjudication, complete-week P5 evaluation or release gates. The frozen baseline and
sealed holdout remain untouched. No automatic decision routing is approved.
