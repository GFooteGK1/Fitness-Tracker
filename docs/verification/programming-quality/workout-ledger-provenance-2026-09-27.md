# Workout recovery ledger provenance

Task: `Fitness-Tracker-i40.15`. This is a local preflight correction, not a
production migration or permission to rewrite history.

## Observed failure

The authorized one-attempt hosted preflight ran at 2026-09-27T15:10:44Z using
TLS verify-full and a read-only repeatable-read transaction. Run:
`setup-preflight-20260927151037-c2d49ce6`. All checks except `ledger` passed,
including target, PostgreSQL17.6, exact coaching catalog/ACLs, predecessor
functions, numeric workout RPE and accepted-history digest shape. Control was
unpaused at generation8. Client shutdown was verified. No application RPC,
database write, backup, merge or deployment occurred.

Only the workout recovery row differed. Its version/name and single-statement
cardinality matched, but the classifier incorrectly expected the rehearsal's
source-file hash instead of the historical production ledger representation.

## Reproduced cause

Original release artifacts remain under
`C:/Users/foote/.codex/worktrees/workout-save-recovery/Fitness-Tracker/output/playwright/workout-save-recovery/`:
`prepare-release.mjs`, `production-apply.sql`, and `migration-manifest.json`.
The preparer inserted the migration into the ledger using a JavaScript
`String.replace` replacement string. Its four `$$` function delimiters each
became a single `$` in the stored copy. The executable migration body was outside
that replacement and retained its delimiters.

| Evidence | SHA256 |
| --- | --- |
| Approved original source,8856bytes | `cee30f2d144bb4355732edab5ee0eef25b9c50e922ef5e2d64d859234253faf8` |
| Source normalized only from CRLF to LF | `f6ce733589ae3614286218ceeed4fb707b96a7fa3b8054635a68fc12c57dcfc1` |
| Historical ledger copy,8852bytes | `c7319057d6d0d56d9135940d0b603442c43374468bb7218b357593a200ae92c6` |
| Exact original apply artifact | `3273d7ca7ac40464bb2dd8e2a74f3e5a48c700c4d2c7fb7341b5cb605e823e7c` |
| Local rehearsal source | `24e90df68d59eb265060198f7e7377d4190bb1188ee6b255230f0ad9d88cc20f` |

Extracting the ledger copy from the original apply artifact exactly matches the
new hosted hash. Restoring only those four delimiters reproduces the approved
manifest's source hash and byte length. The restored source equals the current
migration after line-ending normalization. Re-running the original preparer's
string transformations on that source reproduces the entire apply artifact
byte-for-byte. No alternate database query was required for this diagnosis.

## Correction and limits

The classifier now pins the exact historical workout ledger hash. It does not
accept arbitrary hashes, the rehearsal source hash, or even the approved source
hash as substitutes. Pause/revision ledger checks and all other guards remain.
The malformed historical ledger text must never be replayed as migration SQL.
The existing setup installer constructs SQL by slicing and concatenation and
escapes ledger literals; it does not repeat the historical replacement bug.

Keep the original failed receipt unchanged. Any reclassification of retained
evidence must use its original observation time and be labeled historical; it
cannot establish a fresh installation baseline. A later rollout still requires
fresh preflight and separate target-specific authorization. This ledger analysis
does not establish every workout function's current deployed definition.

Validation:16 classifier tests and14 operator transport/cleanup tests passed.
Independent review reproduced the cause and confirmed the proposed correction.
Retrospective classification at the original 15:10:44.723441Z observation passes
all12 checks. Its receipt explicitly records `freshHostedProof:false`,
`rolloutAuthorized:false`, and `originalFailurePreserved:true` in
`output/setup-freshness-release/retrospective-preflight-classification.json`.
No second hosted query was attempted. Changes remain local and uncommitted;
the existing80bef CI result does not cover the classifier correction.
