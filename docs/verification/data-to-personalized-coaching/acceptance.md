# Capture and personalized coaching — local acceptance evidence

Updated 2026-09-18. W9 local verification is complete for the supported engineering contracts; eight original decision labels remain explicitly unvalidated under Fitness-Tracker-u5l.13. This is a local engineering record, not a production release or numerical-coaching approval.

## Candidate and fixture identity

Worktree: `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/data-to-personalized-coaching`; branch `codex/data-to-personalized-coaching`; base `61d04df9dad3dfe88a9594fff28be06a72899741`. Changes remain uncommitted. Dirty original root and unrelated worktrees are preserved.

The initial integrated candidate was frozen at `2026-09-18T05:58:22Z`: source identity `67a411eba9e6ccf25fd116a971453a5562c2e04886729a80380e31838e6df4a4`; tracked patch SHA256 `7dbf55103f000790be41f8b7cf1074480844ffb448e17dd47840ba73a9f0bc9f`. The complete 741-file content manifest, including new files, and tracked patch are in `output/app-quality-release/personalized-coaching/source-2026-09-18T05-58-22-184Z/`. The tracked patch alone cannot reconstruct untracked files. Source identity deliberately excludes narrative evidence, environment files, screenshots and generated output. Final candidate identity follows adapter work below.

Original engineering fixture hashes remain unchanged: development `32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278`; original heldout `ea26eb6d3c6fc288330826ec906c288c61566f82f3a7eb2aa7e3a18afc10bc24`. Integrity checks pass for 42 distinct synthetic athletes, 30 development cases plus paired variants, and 12 original reserved cases plus paired variants. All coaching labels are unreviewed.

## Final integrated verification

| Check | Actual result | Limits |
| --- | --- | --- |
| `npm test -- --root . --exclude '**/.worktrees/**' --maxWorkers 4` | 286 suites / 3,018 tests passed; six suites and 19 tests skipped; exit 0 | 15 skips are opt-in live/data/baseline checks; four are explicit unsupported development decision labels |
| `node scripts/verify-training-intent.mjs` | Nine actual W1–W3 SQL-chain tests passed | Synthetic local PGlite, not hosted PostgREST |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Passed | Current local checkout |
| `npm run lint` | Passed | Existing `app/v2/page.tsx` loadChatHistory dependency warning and nested-worktree lockfile warning remain |
| `CI=1 npm run test:browser` | All 22 tests passed, exit 0; automatic owned-server teardown completed | Intercepted synthetic services; includes retained coach logging, capture receipts, optional feedback and personalized coaching |
| `npm run build` with explicit synthetic public Supabase URL/key | Passed, exit 0 | Local production build; no hosted deployment or credentials |
| Parent rendered review | Inspected 320px light, 390px dark, 1280px light and unavailable screenshots | Browser exercised both themes at all three sizes; no physical-device or live-account claim |
| `git diff --check` | Passed | Git reports expected LF/CRLF warnings |

Final logs are `full-vitest-integrated.log`, `browser-final.log`, and `build-synthetic.log`. Stable rendered artifacts are in `screenshots/` (39 PNGs; this does not claim manual inspection of every image). Additional manual inspection covered mobile optional feedback, the capture receipt and desktop program setup. Complete logs are under `output/app-quality-release/personalized-coaching/`. The initial unrestricted-worker regression was interrupted after a Node heap failure and reported fixture failures. Review also found and fixed an unstable CaptureRecovery effect dependency. The bounded rerun exposed three further old fixture-contract failures, all repaired and rerun before the passing result above. Changes preserve meaningful legacy behavior and explicitly test retirement of unsupported claims; they do not accept removed assertions as current advice.

The first `npm run build` compiled but could not prerender `/v2` without public Supabase configuration. The subsequent build passed with NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co and NEXT_PUBLIC_SUPABASE_ANON_KEY=local-build-test-anon-key. Browser verification initially exposed three obsolete fixture contracts; repaired targeted checks and the final complete 22-test run passed. No credentials were copied into this checkout.

## Holdout exposure and disposition

At `2026-09-18 00:58:48 America/Chicago`, the coordinator ran the original reserved set against the frozen candidate and adapter. **All 24 variants were unsupported by the adapter; zero decisions were accepted.** The tool's successful exit reflects explicit skips, not successful heldout coverage. Preserve `heldout-first.log` and `heldout-first-report.json` as the first-run evidence.

The original 12 cases are now **consumed development material**. Their immutable original file is retained for audit instead of erased or relabeled as unseen. The coordinator, adapter reviewer and SQL reviewer inspected their facts/failures to add real runtime/SQL adapters. Subsequent execution of that original file is regression coverage only. A separate fixture author prepared 12 distinct replacement cases using the public adapter input contract without inspecting adapter source/results during authoring. The author had previously reviewed W7/W8; this is bounded author independence, not complete project blindness. Bodies and labels stayed hidden from implementation owners until the final candidate/adapter freeze. The consumed original set subsequently passed 20 variants; four decision labels remain unvalidated. These results do not overwrite the first run.

The initial development run accepted 56 of 60 variants. The remaining four RPE/range solicitation labels do not identify an existing complete declared decision gate. Real provenance and quantity-preservation predicates pass; those decision labels remain unvalidated. No threshold or mandatory optional-feedback request was invented to make the fixtures pass. See [adapter dispositions](w9-verification-plan.md).


## Final freeze and first replacement exposure

The final candidate/adapter was frozen at `2026-09-18T06:16:32Z`, before replacement execution at `01:16:43 America/Chicago`. Identity: `33aba965c5d3cca187459e04352a8548bd63bf79ceedac8bdd701bf1556fcfbe`; tracked patch SHA256: `15b53b6cf00b089e939bab6de162289017ce7b1934341b781aa10dc65208dbc6`; 747-file manifest and patch: `output/app-quality-release/personalized-coaching/source-2026-09-18T06-16-32-218Z/`. Application and migration contents match the first freeze; the later identity includes verification adapters and tests. No executable source, test or fixture was changed after this final freeze.

Replacement fixture SHA256: `80b386b42b87098e27edc5a13b5a5947df0ad15fedc9a792bb717ca19ebbd3ee`; schema `engineering-scenarios-v2`; source `replacement-synthetic-v1`; exposure `replacement-blind-v1`. The first strict run (`RUN_PERSONALIZED_REPLACEMENT=1 REQUIRE_ALL_ENGINEERING_CASES=1 npx vitest run test/personalized-coaching/engineering-scenarios.test.ts --maxWorkers 2`) passed **24/24 variants, zero unsupported and zero decision mismatches**, exit 0. Evidence: `replacement-first.log` and `replacement-heldout-engineering-engineering-report.json`. No tuning followed exposure. Coordinator readback checked reported decisions/assertions, including bounded nutrition coverage and estimate lineage, exact goal priority and source-bound proposal destinations. This is scoped engineering evidence, not a general semantic or physiological grader.

Across 54 distinct synthetic athletes and 108 paired variants, 100 applicable decisions pass: 56 development, 20 consumed-original and 24 fresh replacement. Eight original labels remain unvalidated: optional RPE solicitation (2), range/exact solicitation (2), historical replay recommendation identity (2), and hardest-set versus session-effort solicitation (2). Their underlying preservation/validation predicates pass; that does not establish the unspecified decision gates. [Exact dispositions](w9-verification-plan.md) and `Fitness-Tracker-u5l.13` retain these limits. Supported core engineering is locally verified within this boundary; full original-fixture acceptance and numerical personalization are not claimed.

## Integrated behavior and independent review

The actual-SQL application journey covers capture → durable decision → idempotent response → protocol-bound baseline → observed/unknown/reported follow-up → correction invalidation. Lost acknowledgements reuse the original parent/child request, and Done creates no canonical activity. Source snapshots and accepted plans remain immutable. The additional lifecycle tests cover correction invalidating coverage and both precommit and postcommit uncertain-photo outcomes, including original-request replay and exact request-bound client certainty.

See [storage and race inventory](w9-storage-inventory.md), [actual lifecycle evidence](w9-engineering-lifecycle.md), [event recovery review](w9-event-recovery-review.md), [W8 independent review](w8-app-review.md), and [W8 browser evidence](w8.md). Earlier package evidence includes real loopback PostgreSQL 17.11 independent-connection tests: four capture races; ten recommendation races with eight observed lock waits; a 16-write synthetic burst of 745 ms. These are local transaction/contention evidence, not production performance measurements.

All six new SQL migrations and documentation mirrors are ordered and hashed in the [release packet](w11-release-packet.md); an [independent readback](w11-release-packet-review.md) confirms their identities, authority boundaries and rollback compatibility. All rollout defaults remain off; numerical initial-dose capability is hard false regardless of environment.

## Product measurement and release limits

No real-athlete effectiveness measurement has been made. An authorized canary should report correct-log completion time per completed attempt, corrections per input/origin, explicit feedback per eligible completion, supported goals with confirmed baseline status per supported goal, proposals using relevant evidence per proposal, shown actions and abstentions per eligible visit, useful/not-applicable responses per shown action, and comparable matched follow-ups per due decision. Preserve the denominator and unknown/noncomparable states. Clicks and completion counts do not establish causal benefit. Do not collect raw athlete text or add an analytics vendor for these measures.

Qualified policy review (`Fitness-Tracker-qsp`, W5/W10), subsequent authorized model evaluation, hosted CI/deployment/canary authority and live evidence remain outside this completed local work. Diversification preparation `Fitness-Tracker-f4k` is complete: [offline comparison and future protocol](f4k-evaluation-preparation.md), 12 substantive inputs and 28 fixed-choice old/repaired compiler comparisons; it does not establish model or numerical coaching quality. Existing account-delete FK issue `Fitness-Tracker-24x` and dormant runner issue `Fitness-Tracker-ykg` remain explicitly tracked release limitations. No commits, pushes, hosted migrations, production settings, real-athlete writes, paid model evaluations or outreach occurred. W11 local packet preparation is complete; activation and hosted CI remain unperformed. The isolated PostgreSQL verification server was stopped after testing, and the browser server completed automatic teardown. The full epic remains open.

Final original-label clarification: [documented source disposition](original-label-disposition.md) completes Fitness-Tracker-u5l.13 as contract clarification. All eight original advice labels remain unvalidated and predicate-only; closure does not change acceptance counts. Existing gates require missing hypothesis/protocol/series/review authority; historical replay is a source operation. No new runtime behavior or policy was added.
