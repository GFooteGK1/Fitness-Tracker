# Independent compatibility review — Fitness-Tracker-txs

Outcome: no actionable code finding remained after one assessment, builder response and evidence-based resolution. This is local candidate qualification, not deployment or live-capability acceptance.

Review context: `/root/vbt_review`; base `666ab8daf084cc3eff3260f8db1226f0725021cb` plus the uncommitted files hashed below. The reviewer did not author candidate code/tests. The full parent context was inherited, so this is an informed independent execution, not a blind assessment. The prior baseline-only oracle came from `/root/vbt_oracles`, `vbt-independent-oracles.md`, SHA256 `8CA35CC98FF8BD518020F1C64BD601160E832F1E993A8FC4F25A2680CECA1302`.

Instructions read: repository `AGENTS.md` (SHA256 `172424F085AEA130C3F17ED247EE1B0848E17ADB6CC8AC7430B2C86CE12DD57B`), COS check/review lenses, canonical SOFTWARE_DELIVERY and GUARDRAILS, Supabase skill, ADR-0044 and relevant architecture/source/migration contracts. Scope excluded candidate edits, publication, production access, grants, credentials, merge/deployment/activation/canary.

## Findings and resolution

No confirmed correctness, authorization or data-integrity defect survived source tracing and reproduced tests.

One test-strength concern was reported: an entire projection snapshot changing is insufficient to establish that PR values/history were recomputed, because block-score ID churn alone could satisfy that assertion. The builder strengthened the committed synthetic test with actual weight, achieved-at and eligibility assertions. The reviewer independently reproduced the strengthened file and independently derived a separate actual-value/history control. The concern is resolved; no additional review cycle was opened.

## Reproduced checks

- `npx vitest run test/coach/activity-measurement-patch.test.ts test/coach/activity-record-tools.test.ts --maxWorkers=2`: 2 files, 20 tests passed. This includes source JSON/provenance, baseline churn sensitivity, OID/owner/ACL/security/search_path preservation across repeated migration application, nonempty projection identity with fail-on-write guards, malformed paths/units, atomic failure/recovery, owner isolation and gate behavior.
- Independent reviewer-authored synthetic probe: `npx vitest run output/app-quality-release/vbt-review-positive-control.test.ts --maxWorkers=1`: 1 file, 1 test passed. Its expected values were independently specified: initial weight PR history 10/null then 20/previous10; VBT-only correction preserved complete PR rows; supported event load 30 changed history to 10/null then 30/previous10; moving 30 before the first workout produced only 30/null; making the 30 workout ineligible restored only 10/null. This demonstrates real PR refresh behavior rather than only changed row IDs. The local probe was renamed to `.probe` after execution to keep it outside aggregate test discovery. SHA256 `E29E4F0A4B0D06DF30FC01E64F44F5D1D3B8A7B93FBF672182BBECADC6E3AF93`.
- Final bounded resolution: `npx vitest run test/coach/activity-measurement-patch.test.ts --maxWorkers=1`: 1 file, 10 tests passed after the builder's stronger actual-value assertions.

Only the existing Vite configuration warning appeared. No tests failed in this review execution. Aggregate/native-backend results from the builder were not independently rerun by this reviewer and must be reported separately.

## Source conclusions and limits

The typed closed contract binds exact existing performed-set positions to the expected owned revision and rejects replacement-block mixtures, duplicate targets, malformed scalar/unit/timestamp/provenance shapes and occurrence promotion. Patching preserves array spelling, absent/existing IDs, unknown JSON and unrelated provenance. Every supplied velocity scalar receives its exact source-path provenance; estimates are not promoted merely by review.

The SQL decision executes after the original owner/revision locks using stored and validated new canonical facts, not caller projection placeholders. Only named readiness and nested velocity context are stripped for comparison. Other retained block data, workout date and qualifying quantity provenance remain conservatively significant. Existing snapshot, receipt, recommendation and completed-program authority paths remain. The recovered numeric RPE writer is retained. The migration refuses to create a missing function and replaces the existing signature in place; catalog checks establish unchanged OID, owner, ACL, SECURITY DEFINER and search_path. No persistent permission changes are introduced by this prepared SQL.

Boolean `vbt` true/false is retained as source context; invalid scalar shapes are diagnosed. It does not infer velocity or numeric-policy authority. General write and additional workout-correction gates stay default-off. Legacy untyped/wrapped blocks and missing meal macros retain their explicit unsupported boundaries.

No hosted migration state, OAuth/PostgREST runtime, plugin tool refresh, production mutation or owner canary was tested. Owner approval is still required for migration application, merge/deployment, write/correction activation and exact real-record canary actions. There was no denied, pending or uncertain external action in this review.

## Candidate SHA256 binding

| File | SHA256 |
| --- | --- |
| app/lib/coach/activity-measurement-patch.ts | BEB56203BFFFA32B220C6339B6215FEC8487545A7A2E2681235CB3407BA224E9 |
| app/lib/coach/activity-record-contract.ts | 69FF6C558C3BE8D9C109C06348636FD2B5671093384D554AD800D500BB192FDA |
| app/lib/coach/activity-record-tools.ts | C127A7E3363CD01EAC1C168EBE1248B319187ABECD32C31AC59AD5CB956F9517 |
| app/lib/coach/external-performed-work-context.ts | 3118E77891E8E18CE3B73A291A79CF32E934FA0BD1A03D6AF7ED93103495438D |
| supabase/migrations/20261022131056_activity_measurement_corrections.sql | E96A699B6CA62B005E54A9AAAB47FBDE8B648A3544DA4947699E5602D3CD5ED3 |
| test/coach/activity-measurement-patch.test.ts | 72BFBB8892B02EA0A302E6BE164CBDE561F73A6ABE5F6C6FFA0F4CF44F236710 |
| test/database/mcp-activity-concurrency.test.ts (source inspection only) | D3DC24F442D23F0D836F295934557DFFD4B0F62C87FC2517509E760CFF9BACEB |
