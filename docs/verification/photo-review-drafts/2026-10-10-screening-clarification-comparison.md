# Eight-photo clarification comparison

Canonical issue: `Fitness-Tracker-1vo.15`. Greg explicitly approved this comparison
after the exact eight existing photos and purpose were explained. Reuse the
approved Meal Logging key. No further key or image collection is required.

## Frozen change and oracles

Append only the following to the existing choice question instructions:

> An incidental hand holding a plate, bowl or drink, incidental feet or clothing,
> printed cartoons on food packaging, and background monitors do not by themselves
> make a prominent person, sensitive scene or photo of a screen. Judge the main
> subject. Keep uncertain for actual prominent people, sensitive mixed scenes,
> screenshots and photos whose main subject is screen content.

Model `gpt-6-luna`, fixed choices, original image/text input, parser and both 0.9
thresholds remain unchanged. This is an isolated evaluation prompt change, not a
deployed application change. The existing sensitive-person and screenshot rules
remain in force. The exact fixture SHA values come from the frozen twelve-photo
manifest; originals remain unedited and bounded at 3 MiB.

| Order / original photo | Role | Expected label / route |
| --- | --- | --- |
| 1 | recovery: sandwiches | food / food_candidate |
| 12 | recovery: drink can | food / food_candidate |
| 2 | regression: desk meal | food / food_candidate |
| 4 | regression: cookie packaging | food / food_candidate |
| 6 | regression: bowl near monitor | food / food_candidate |
| 7 | regression: prominent people | uncertain / review |
| 8 | regression: ordinary objects | non_food / non_food_candidate |
| 11 | regression: screenshot | uncertain / review |

Acceptance requires both food misses to recover and all six regression cases to
retain their expected label AND route. A label match alone is insufficient.
These previously observed cases are recovery/regression examples, not a fresh
holdout. A single observed improvement cannot establish cause, generalization,
calibration or production readiness.

## Bounded execution

Maximum eight sequential new `POST /v1/decisions` image attempts, one per exact
original, 45-second timeout and 64 KiB response bound. No lookup, retry, fallback,
redirect, second prompt change, threshold tuning or macro call. Transport, HTTP,
refusal and schema failures stop; valid mismatches continue to the fixed remaining
examples. A failed dispatch consumes its attempt. This is a request ceiling, not
a dollar or token cap.

The new recorder hashes the actual clarified request before sending it; the old
recorder is frozen because it constructs the old prompt. Exclusive run/request
markers prevent replay, and safe receipts omit images, raw bodies, exception text
and credentials. Separate ignored evidence:
`output/photo-review-drafts/decisions-screening-clarification-v2/{dry,live}`.

Before dispatch, verify the previous source/report pins, including the twelve-photo
failure SHA `9ccd309c919c88f5c1ada162626f345b05801aa60fb29af9e731c4b903376489`.
The newly approved allowance does not reset or erase the original 12 attempts.
No app/provider routing, camera automation, database, storage, credential change,
commit, push or deployment is in scope.

[Official Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
was fetched again on 2026-10-10. Existing native REST contract is unchanged.

## Verification and outcome

All 24 combined offline checks passed, including four new comparison tests.
The tests exercise the exact append-only prompt delta, original image payloads,
unchanged oracle/thresholds, failure-consumed eight-call allowance, all-photo
preflight, stop rules, valid-regression detection, replay and safe receipts.
Node syntax and `git diff --check` passed. One fake-transport dry run passed eight
mechanical grades with zero actual network requests; it is not recovery evidence.

Runner SHA-256:
`46e448ca720f009d81f62172c3d250f5e246c5392bc5c23b8a32110c6130543c`.
Test SHA-256:
`b1885b219ad431a3da24b10e56e26a6adad2ce35ab9f1b27307ddc75bf5f37e6`.
Fixture manifest SHA-256:
`e77136f813c464d6be70fd44c871fec02dc6c2ee027249d183ef157e00100a7b`.

The separate `decisions_qualification_review` context retained the visual oracle
before candidate code. Independent pre-live review reproduced all 24 tests and
checked the exact append against a separately supplied literal, original payload
hashes, all-photo preflight mutations, sequential fixed eight-call dispatch, stops,
safe receipts, concurrent replay prevention and comparison grading. A weakened
label-only grader was detected. No blocking findings remained. An initial review
assertion conflated eight preservation artifacts with six runtime dependency pins;
the reviewer checked both scopes separately. No candidate change or extra live
request resulted. No prior prompt, failed report or receipt was modified.

## Observed live comparison

The single approved batch completed at `2026-10-10T19:45:49.629Z`. Exactly eight
new POSTs returned HTTP 200 and valid typed answers. All eight matched BOTH the
expected label and route. Both recovery photos passed, and all six regression
cases retained their expected results. The original twelve-photo failure remains
unchanged; this is a separate successful comparison, not a revision of its result.

| Photo | Previous confidence / route | New confidence / route | Result |
| --- | --- | --- | --- |
| 1: sandwiches | 0.53 / review | 1.00 / food_candidate | recovered |
| 12: drink | 0.52 / review | 1.00 / food_candidate | recovered |
| 2: desk meal | 0.99 / food_candidate | 1.00 / food_candidate | retained |
| 4: cookie package | 1.00 / food_candidate | 1.00 / food_candidate | retained |
| 6: bowl near monitor | 0.91 / food_candidate | 1.00 / food_candidate | retained |
| 7: prominent people | 1.00 / review | 1.00 / review | retained |
| 8: ordinary objects | 1.00 / non_food_candidate | 1.00 / non_food_candidate | retained |
| 11: screenshot | 0.97 / review | 0.99 / review | retained |

Both 0.9 gates are unchanged. Reported confidence/probability estimates are not
calibrated accuracy. The observed improvement with the clarified prompt does not
prove why the earlier scores were low or establish generalization. All selected
cases were evaluated; zero regressions is accompanied by `completed: true`.

Reported input and total tokens: 39,392; output tokens: zero. These are provider
counters, not billing or efficiency evidence. No new calls using the original
prompt were made; before-values come from the preserved baseline report. No lookup, redirect,
retry, fallback, second prompt variant, macro call or threshold adjustment.

Provider request IDs in approved order:

- `req_1380e8f61ca2421e9877b12bc980f9ab`
- `req_5db551e9ea104c589997af32f7b4cee6`
- `req_447a98257f9740cab8be8e3368ca317e`
- `req_49247b8d96764809bb72f98309a13c77`
- `req_1a958fdc33184afab3b6342714e37b9e`
- `req_6863cb4259f54600989f008ff554ac88`
- `req_a6614af7855a429e972a143a5293ea56`
- `req_c53b6431a65c425f9219bc1914b19bd0`

Live evidence has 18 immutable records: attempt, eight starts, eight receipts and
report. Final independent audit reconciled all 18 records, original photo and
actual candidate request hashes against the separately supplied literal, sequential
POST-only timing and eight distinct HTTP 200 request IDs, both thresholds, all
eight grades and baseline comparisons, recovered 2 / regressions 0 with completion,
token sums, unchanged sources and all eight prior preservation artifacts. It found
no image/key/environment payload in receipts and no material finding. Final report
SHA-256: `0ed9a8555e9a2c6c2d8c77162746f7b3bde6b4131ba2028bc4b75b818b9131d5`.
`Fitness-Tracker-1vo.15` is complete within this approved comparison.

The working app, Claude macro
analyzer and Camera-close automation are unchanged. This result qualifies the
approved recovery/regression comparison only. Compression, untouched holdout,
automatic cloud opt-in and integration with review drafts remain later work.
