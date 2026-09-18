# Independent W6 database review

Reviewer: separate W2 database implementation agent. Reviewed the W6 migration and executable tests without editing the W6 implementation. The implementation owner repaired findings. The parent independently reviews this reviewer's W2 changes.

Disposition: no important finding remains in the reviewed W6 SQL scope. Current checks pass; true simultaneous-connection behavior remains for the separate W9 PostgreSQL harness.

## Findings and repairs

| Finding | Repair verified |
| --- | --- |
| Invalidation referenced a revision UUID without its owner. | Composite `(activity_revision_id,user_id)` FK now enforces same-owner revision references, with owner-qualified review/group references and restricted grants. |
| Proposal creation/acceptance checked workout revision but not retracted observation/import/value eligibility; standalone observations were omitted. | Assertions lock included imports, groups and exact value IDs and reject current retracted/incomplete sources. Status/verification changes append invalidation. Standalone group and linked value retraction tests reject acceptance and allow successor review. |
| Deleted observation values caused acceptance failure but left the review unable to refresh. | Value DELETE invalidates its included reviews using the old owner/group. The executable deletion case confirms rejection and successor creation. |
| Timestamp ordering could select an ancestor under transaction-start timestamp inversion or ties. | Source lookup selects the successor-chain leaf under the program lock, with monotonic `review_revision` and unique constraints. |
| The new W2 deletion path locks workout before observation groups, conflicting with W6's original order. | W6 acquires sorted workout shared locks before import/group/value eligibility locks, matching canonical deletion order. Actual race behavior still needs the separate multi-connection tests. |
| The integration deletion test exposed the existing observation workout FK preventing supported manual workout deletion. | Parent assigned the repair to W2: terminal capture revision, immutable original source identity, excluded group and narrow canonical FK detach. W6 receives execution-deleted and measurement-retracted invalidations; original values are retained. The parent reviews this repair independently. |

Reviews retain their original rationale and input links. A correction/retraction appends invalidation, a new review references its predecessor, and unaccepted stale proposals expire without modifying accepted plans. Exact old review replay remains available. An already accepted proposal replays its accepted result after a later source correction. A stale new review or proposal acceptance fails atomically.

The new invalidation table has FORCE RLS, owner-only authenticated reads, same-owner references and no direct anonymous/authenticated/service-role writes. Definer helpers use an empty search path and no external execute grants. Existing review recording grants and legacy accepted replay remain unchanged.

## Executed checks

```powershell
npm test -- --root . --exclude '**/.worktrees/**' test/database/targeted-review-sources.test.ts test/coach/weekly-review.test.ts test/api/coach-weekly-review.test.ts
```

Result: **29 tests passed across three files** (8 executable W6 SQL cases plus current weekly review core/API checks). The broader W1/W2/W6 database and independent W2 server regression run passed **113 tests across seven files**. `node scripts/verify-training-intent.mjs` passed **9 tests** against the actual W1/W2/W3 SQL chain after the W2 detach change.

Limitations: PGlite supplies real PostgreSQL constraints/functions/privileges, but these runs do not establish simultaneous-connection locking or visual behavior. No provider, hosted database or production calls occurred. Import eligibility checks were inspected directly; separate group/value retraction cases execute the same invalidation boundary. Full app/UI acceptance and W9 contention tests remain coordinator-owned.

Final upgrade delta: reviewed the `legacy_source_unverified` marker and its executable pre-W6 upgrade simulation. The migration appends an idempotent review-only invalidation for legacy adjust-dose/recover reviews, without fabricated measurement IDs or edits to old decision content. Old replay stays intact, unverified pending acceptance fails, and a verified successor can expire the unaccepted proposal. **9 W6 database tests pass** after this addition; scoped independent review remains clear.
