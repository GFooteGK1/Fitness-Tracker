# Durable high-low requirements: local compatibility proof

The existing `training_constraints` prose contract is sufficient for an athlete's
high-low training requirement. No new schema, enum, scheduling engine, global
Saturday default or coaching-reference publication is needed. The selected LLM
authors programming under ADR-0039; retrieval supplies the exact saved requirement
alongside availability, history, recovery and accepted programming. These tests
prove software compatibility, not the quality of a generated training week.

Candidate: branch `codex/high-low-context`, worktree
`C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/high-low-context`, baseline
`19be1b4a445b68b62eafecbed2411f9879f86d71` (`origin/main` at preparation).
PRs #86 and #88 were inspected as existing draft setup/programming efforts;
neither was modified or used as a competing feature branch. Unrelated worktrees
and root changes were preserved.

## Remote reconciliation and integration qualification

At preparation, this baseline was verified against the locally cached
`origin/main`; this worker did not freshly fetch or independently read remote
main. The local remote-tracking reflog records its last fetch as
2026-10-22 20:07:21 -0500.

The parent subsequently supplied fresh authorized GitHub connector evidence:
at **2026-11-04 23:57 UTC**, a read of
`https://api.github.com/repos/GFooteGK1/Fitness-Tracker/branches/main` returned
remote main **`19be1b4a445b68b62eafecbed2411f9879f86d71`**, commit date
2026-10-23T01:01:19Z. Canonical commit:
[19be1b4](https://github.com/GFooteGK1/Fitness-Tracker/commit/19be1b4a445b68b62eafecbed2411f9879f86d71).
This is parent-observed remote evidence, not an independent remote read by this
worker. Follow-up local `git rev-parse HEAD` and `git rev-parse origin/main` both
match that full SHA exactly. No rebase is needed against that observed main.

The reviewed tracked code/test diff remains
`4b810ebc8567632f6e3b1dcc290dbea4f510cc55`; the untracked synthetic fixture remains
SHA-256 `25efc73ecb018c7d49941187642ea235d4097d66c610bb48a25a6d7f627e5b2f`.
Only this verification document changed during remote reconciliation.
`git diff --check` passes. No conflict is observed against the identical baseline;
no merge or rebase was attempted, and this does not qualify integration of the
separate draft PRs #86 or #88.

On November 5 this worker independently reread the GitHub branches/main endpoint
and confirmed the same full SHA and required `verify` check. The release package
now includes the necessary test-only lifecycle repair described below, in
addition to the original seven files. Draft publication is authorized; approval,
merge, manual deployment and production changes remain outside scope. No
deployment is required to represent high-low requirements in existing prose.

## Lifecycle fixture repair (November 5)

The unchanged-main failure in `Fitness-Tracker-pzh` was reproduced before repair.
Its completed synthetic session was dated August 4, while supervised preparation
uses today's date and an explicit 90-day history window. By November 4 that
session was outside the window. The reader correctly excluded it; this was a
fixture aging defect, not evidence of lost product history.

`reviewedRollingWeek` now accepts an optional fixture start date and rebuilds
profile/recipe hashes before normal compilation. The SQL lifecycle fixture
forwards that optional date. This lifecycle suite uses the Monday three weeks
before today's UTC date so all three training weeks remain in the past and
inside the real window. The related legacy-review negative case uses its actual
accepted base date. Other fixture consumers retain the original default dates.
No production clock, retention, provenance, source-history or authorization gate
changed. Freezing only JavaScript Date was avoided because PostgreSQL records
capture timestamps using its real clock.

The original two-cycle RIR, approval and exact history assertions remain. Added
checks verify the retrieval ends today and contains the session's date. Two
separate fixture cases in November 2026 and January 2030 verify date rebinding,
parser roundtrip, unchanged session content and unchanged default dates.
An independent informed reviewer reproduced 138 passes across six suites,
including all 20 lifecycle cases and both dated-fixture regressions, plus strict
TypeScript and diff-check. Reviewed tracked code/test diff:
`5d407b7521a41256a6b175cc1014bd0f9131a7f7`. No timeout or CI configuration was relaxed.

## Storage and consumption

- `parseReviewedConstraintMemory` preserves prose up to 4,000 characters and the
  existing optional flags. High-low remains prose; it does not become a flag.
  This is the reviewed-editor parser contract, not a claim that every legacy
  API/SQL writer imposes that same field-level bound.
- The existing trust correction route passes the owned requirement to
  `correct_coach_memory_with_review`. A synthetic API test verifies exact content
  delivery to that existing RPC.
- A disposable PostgreSQL test exercises real confirmation, correction and exact
  correction replay. An owner-bound latest-memory read feeds `projectRequirement`,
  the same projection used by the external coach. Original memory history and
  complete accepted-plan/session rows remain unchanged.
- A separate verified-identity MCP adapter test exercises `readCoachingContext`
  through its real query filters and checks identical structured/text outputs.
  The synthetic requirement retains five total 60-minute days including Saturday,
  workload substitution, fresh speed/power, recovery/performance adjustments,
  APEX priorities and complementary training-day isometrics. The event date
  remains unconfirmed prose; missing `training_intent` remains an explicit gap.
- Legacy, empty, missing and withdrawn constraints do not acquire this policy.
  Accepted sessions remain the exact saved prescriptions.

The SQL and MCP proofs are separate layers. The SQL setup fixture does not model
all WHOOP/profile domains needed by a full context read. No hosted Auth,
PostgREST, live model response or training-week generation was exercised.

## Separate performed-work diagnostic correction

The external reader already supports segmented logged events. Unreviewed imported
or copied blocks are intentionally excluded even when occurrence is athlete
confirmed. The shared numeric reader's unsupported-shape messages previously
survived that external provenance exclusion and could misidentify its cause.

The runtime change accounts for supported blocks excluded by provenance and
removes only their redundant shared shape diagnostics. Explicit
`unreviewed_template_or_import` omissions remain, no performance is admitted,
and coverage stays incomplete. Unsupported sibling blocks and other sources
retain their shape errors. Synthetic mixed-source tests cover these boundaries;
shared numeric/planning output, source records and the published general reference
remain unchanged. All fixture identities and workout amounts are invented.

## Verification scope

The four focused suites pass 91 tests, including disposable SQL persistence and
the external MCP adapter. A separate informed reviewer reproduced all 91 passes,
found no remaining findings, and verified the tracked diff fingerprint
`4b810ebc8567632f6e3b1dcc290dbea4f510cc55`. The two new provenance-diagnostic cases
fail on unchanged main specifically because its redundant shape errors survive;
the candidate passes them without admitting any blocked performance.

Strict TypeScript, lint and the production build pass; lint reports existing
image and hook warnings. The aggregate run passed 6,188 tests, skipped 44, and
failed two tests in `test/database/supervised-programming-lifecycle.test.ts`.
An isolated rerun passed the timeout case but retained the line 133 history
assertion failure. An unchanged-main detached worktree at the baseline above
reproduced that same assertion with 19 tests passing and one failing. This
baseline issue was tracked separately as `Fitness-Tracker-pzh` and was not repaired
at that checkpoint. The existing mobile browser gate (`npm run test:browser`) passed
all 32 journeys in six minutes using synthetic data and intercepted external
services. It is not hosted verification of the athlete's saved requirements.

Commands: `npm test -- test/database/reviewed-setup-memory.test.ts
test/coach/coaching-context-tool.test.ts test/api/coach-trust.test.ts
test/coach/external-performed-work-context.test.ts`; `node
node_modules/typescript/bin/tsc --noEmit --pretty false`; `npm run lint`;
`npm test`; `npm run build`; and the isolated failure reproduction
`npm test -- test/database/supervised-programming-lifecycle.test.ts --maxWorkers=1`.
Logs are under `C:/Users/foote/AppData/Local/Temp/socius-high-low-*.log`.

The default Windows sandbox prevented Vite
temporary-file renames before tests executed; focused verification succeeded
with local sandbox escalation. Locked dependencies were installed offline with
scripts disabled; no dependency or lockfile was changed.

No live record, accepted plan, migration, grant, credential, flag or production
deployment was changed by this work. The separate operator's live constraint
save is outside this candidate's local verification claim. The earlier aggregate
failure account above records the pre-repair checkpoint; final release checks
are recorded below and in the draft PR.

## Final release-candidate checks (November 5)

After the fixture repair, `npm test -- --maxWorkers=2` passed all 451 runnable
files: **6,192 tests passed, 44 skipped, zero failed** (472 total files including
21 skipped). Local concurrency was bounded without dropping tests or changing
timeouts; hosted CI retains its normal `npm test` command. Both previously
failing lifecycle cases passed. Strict TypeScript, lint and the production build
passed on the same code; existing image/hook/deprecation/workspace-root warnings
remain. Final logs use the local Temp prefix `socius-release-`.
The final `npm run test:browser` rerun also passed all **32 journeys** in 6.1
minutes with synthetic intercepted services. No timeout changes were necessary.
Publication consists only of the original seven scoped files plus
`test/database/supervised-programming-lifecycle.test.ts`,
`test/database/supervised-lifecycle-fixture.ts`,
`test/fixtures/reviewed-rolling-week.ts` and
`test/coach/reviewed-rolling-week.test.ts`. Required hosted `verify` results are
bound to the exact published commit in the draft PR and delivery report.
