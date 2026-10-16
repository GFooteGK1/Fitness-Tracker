# GPT screening integrated with selected-photo review drafts

Date: 2026-10-10. Canonical task: `Fitness-Tracker-1vo.16` under the automatic
meal-photo epic `Fitness-Tracker-1vo`. Branch: `codex/photo-review-drafts`.
Base revision: `5884778a7077ffbd7e1aca61b7ddd728964b2e02`.

## Result and scope

The local selected-photo flow now screens the photo with GPT before macro
analysis. It uses the exact clarified `decisions-food-v2` request qualified in
the approved eight-photo comparison, fixed to `gpt-6-luna` at `/v1/decisions`.
Both confidence and selected probability must reach 0.9 for an automatic route.
These thresholds remain provisional.

- A food candidate reaches the existing Socius macro analyzer and creates an
  owned, recoverable review draft. Only explicit acceptance changes nutrition.
- Non-food and uncertain results stop before macro analysis. The UI explains the
  result and provides manual-entry guidance. No draft or meal is created.
- Consent explicitly names OpenAI screening, including transmission of non-food
  photos, and subsequent Socius macro analysis. Old generic consent is rejected.
- Provider failure, refusal and malformed output stop safely. Each provider call
  has a 45-second timeout and zero automatic retries. Saved results can be
  reconciled after a lost response without resending the image.
- The request ledger retains bounded screening metadata, never photo bytes or
  raw provider text. Existing owner checks, revision checks, RLS and acceptance
  transactions remain authoritative.

No dependency, schema, photo-storage or native Camera change was introduced.
There were zero paid provider calls, hosted database writes, deployments,
commits or pushes during this integration work. Existing qualification artifacts
and unrelated work in the primary checkout were preserved.

## Independent review

The reviewer froze an independent oracle before implementation, reproduced 121
tests across 10 files, and added eight independent checks. Two findings were
fixed and reproduced: account changes during image compression, and cleanup of
a new identity that was canceled before HTTP after an older request resolved.
Previously uncertain identities remain available for exact-request recovery.

The exact qualified request comparison passed. A deliberately permissive routing
mutation was detected. Both installed provider SDKs made exactly one attempt
against a fake 503 when the new per-request retry override was zero. The final
review found no remaining blocking findings in the local candidate.

Ignored evidence directory:
`output/photo-review-drafts/gpt-screening-integration/`.

| Evidence | SHA-256 |
| --- | --- |
| Frozen independent oracle | `b19b6fba65587a2bd90ef4170e56c47a7c63add84ff6823043f8d5d1ea48e6fe` |
| Reviewed tracked diff | `184a64ba20f974293ec0801ae0ad756c72be463a935b9110de20831fecf10fac` |
| Reviewed 20-file manifest | `8f650036d11ff8d387aaf1e4d4e4b15b3175885e73710286d4c06ec14481356b` |
| Independent review report | `054f01c2906293372e377500a30877055ada2b58ae6f8d6df26dc69d4a03c961` |
| Empty-JPEG qualified request fixture | `7062a2347820055a75249b620e48b78a90f0bea13dd070b5258f1a78f2b1e5fd` |

All 20 reviewed file hashes were checked again after final browser execution;
none changed. This verification note is added separately from that candidate pin.

## Verification boundaries

| Final check | Result | Local log |
| --- | --- | --- |
| Independent candidate tests | 121 passed across 10 files, including eight independent checks | `independent-review-report.json` |
| Legacy food flow, provider contract and request identity | 48 passed across three files | `final-regression.log` |
| Mobile browser | Three passed | `final-browser-2.log` |
| Production build, including lint and type checks | Passed with existing image and hook warnings | `final-build-2.log` |
| Full Vitest regression | 3,614 passed, 20 skipped, two failed; not a clean suite | `final-full-vitest.log` |
| Isolated coaching-page recheck | Four passed; no source or timeout changes | `coach-timeout-recheck.log` |
| Unchanged base release-metadata reproduction | Six passed, one failed | `release-baseline-lfs.log` |
| Whitespace and reviewed source hashes | Passed; all 20 reviewed files unchanged | `git diff --check`, `final-candidate-review-pin.json` |

The final full-suite failures were the pre-existing release-metadata qualification
case described below and the unrelated coaching-page preview test exceeding its
five-second timeout during the four-worker run. The coaching file passed in an
isolated one-worker run after the build completed. This narrows the timeout to
the concurrent test run; it does not turn the full-suite result into a clean pass.

The database integration tests execute the actual PostgreSQL functions and RLS
in PGlite with fake provider transport. Browser checks exercise the real local
Next.js UI with intercepted APIs and blocked external services. These establish
local behavior, not live OpenAI responses or hosted/device acceptance.

The final mobile browser run passed all three scenarios: food draft reload,
correction and acceptance; non-food stop; uncertain stop. It also checks explicit
consent, cleared file selection, and layouts at 320 and 390 pixels. Screenshots
were inspected in `output/playwright/photo-screening/`.

An earlier browser rerun timed out after an overlapping build used the same
`.next` directory. That build was canceled. The final browser run was executed
before the final build, and passed. An adapter compatibility failure found in the
first full suite was fixed by preserving the original single-argument provider
call when neither timeout nor retry overrides are supplied; 48 targeted legacy,
provider-contract and request-identity checks then passed.

The release-metadata qualification failure reproduces against an isolated clean
Git archive of the unchanged base revision. Its saved query hash differs from
the generated query hash. The source and retained receipts were not changed or
relaxed. Follow-up: `Fitness-Tracker-sdq`. The exact cause needs separate
investigation; line endings alone were not established as the cause.

## Remaining feature work

The selected-photo integration is not deployed. The current hosted preview and
TestFlight build remain unchanged. Next release qualification must exercise the
new OpenAI consent and screening routes on the authenticated iPhone preview.

Automatic Camera-close ingestion still needs a native upload bridge, explicit
consent for unattended cloud screening, and broader compression and edge-case
qualification. The larger automatic meal-photo epic and representative-evaluation
work remain open. No claim of calibrated classification accuracy or automatic
meal logging is made by these local checks.

Architecture decision: `docs/decisions/ADR-0031-gpt-screening-before-photo-drafts.md`.
