# Whole-week JEV runner: offline verification

Task: `Fitness-Tracker-i40.4.9`, still in progress. This prepares the separate
four-request, six-question dispatch contract for the frozen development packet.
It does not supply human labels, provider token measurements or a paid allowance.

## Delivered behavior

`scripts/programming-whole-week-runner.ts` uses the existing injected transport
interface without a default client, credential lookup or network call. The old
v1/v2 runner, manifests, receipts and exhausted allowances remain unchanged.
Only manifest `21a3dd4cf35f21ec368ccacd47c5775844c867e411d5032ebd8663ddc6ac81a7`
is accepted. All four request snapshots are verified before the run is claimed.

Each human label must match the exact request state, question, hypothesis and
dimension. Six answers must return for every request. New approval must bind the
manifest, reviewed labels, token evidence and separate limits profile. The claim
and dispatch record are written exclusively and flushed before transport. There
are no retries or automatic continuation after interruption; unused allowance is
forfeited. A late unbound receipt requires reconciliation and never triggers resend.

Recovery is read-only. It validates request/receipt/label/token bindings, approval,
profile and reservations. A corrupted earlier result stops subsequent calls. An
attempt directory with a lost dispatch journal remains uncertain and prevents an
accounting-complete claim. Provider errors and uncertain usage are not judgments.

## Token and spend qualification

Official [model documentation](https://docs.typesafe.ai/models), checked
2026-09-26 Chicago, states separate limits for `jev-1.13.0`: 64,000 total input
tokens, and32,000 for state plus the longest question. Input costs USD0.042 per
million; output is free. The [API contract](https://docs.typesafe.ai/api) returns
one typed answer per question. The existing Choice client supports six questions
and a180,000-byte serialized request, but this byte limit does not establish
either provider token limit.

The four-request maximum input reservation is USD0.010752 at that published rate.
The proposed separate approval cap is USD0.02, zero retries. Neither amount is
authorized. Recheck provider limits/pricing before any future live allowance.

`preflightWholeWeek` requires reviewed provider-compatible counts, including
framing, bound to each exact request. No compatible tokenizer or pre-request
counting endpoint was established from the inspected docs/client. The caller must
provide real measurement evidence through `WholeWeekTokenEvidence`; tests inject
explicitly simulated counts and labels. Byte ratios and unrelated tokenizers are
not accepted as verified counts. No context is truncated or silently summarized.

Read-only execution against the actual frozen packet produced:

| Week | Frozen bytes | Compact JSON bytes | Token qualification |
|---|---:|---:|---|
| 01 | 107,487 | 66,561 | Unknown; blocked |
| 02 | 141,252 | 84,175 | Unknown; blocked |
| 03 | 92,524 | 56,711 | Unknown; blocked |
| 04 | 124,106 | 74,918 | Unknown; blocked |

Receipt: ignored
`output/programming-quality-review/jev-whole-week-development-v1/offline-token-preflight.json`.
Qualification is false for all four. No run claim, reviewed-label file, approval
file or provider token evidence was created in the actual packet.

## Verification

- 79 tests passed across the new runner, whole-week packet, previous runner and
  clarified v2 packet suites. Original manifest reproducibility remains covered.
- Independent review found two interrupted-state accounting defects, both fixed
  with regressions: earlier receipt corruption during a later callback, and lost
  dispatch journal with surviving paid receipt. Re-review cleared;32 focused
  tests independently passed.
- Final TypeScript, focused ESLint and whitespace checks passed.
- No paid requests, credential changes, runtime integration, production writes,
  holdout access, commits or pushes. Numerical load policy remains disabled.

## Remaining work

Obtain exact human labels and establish a verifiable token measurement method for
these complete requests. If the context does not fit, explicitly revise and review
the packet while preserving decision-critical context; do not silently trim it.
Only then request a fresh named model/call/spend allowance bound to the artifacts.
Inspect and bind the existing bridge/client source again before live dispatch.
After an approved run, compare all24 judgments, disagreements, false support,
abstentions, latency and measured usage. Synthetic development results cannot
establish general coaching accuracy or replace P0/P2 acceptance.
