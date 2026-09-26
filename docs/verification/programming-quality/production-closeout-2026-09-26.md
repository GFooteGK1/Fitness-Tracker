# Completed programming-quality batch integration

September 26, 2026. Beads: `Fitness-Tracker-i40.14`.

PR #84 merged at 16:37:09 UTC as `a9373b4fc108f65dc43052f0fdf31359d87b47ac`.
Vercel's normal Git integration deployed that exact main commit to production:
`dpl_FDUA3myrStJpKmcPFk4iKHU1wvim`, build `S-ZHoJzhSQW6IpgPdEbSt`.
The merge tree equals the reviewed candidate `afa6e1769a3acc5403fd11be79aec6734cf8f650`.
No production migration, coaching pause/resume, synthetic account/write,
manual deployment or numerical activation occurred in this closeout.

## Verification

- Candidate CI [36255450735](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36255450735)
  passed: 313 test files, 3,506 tests, 19 skipped; TypeScript, lint, build and
  all 26 mobile browser journeys. Six test files were skipped.
- Main CI [36256099306](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36256099306)
  passed for the exact merge SHA.
- Independent full-PR review, including a separate migration/security review,
  found no material issues. Fresh focused verification passed 619 Vitest tests
  and 58 operator-tool tests. Historical generated report rows and athlete
  programming effectiveness were outside this engineering review.
- Read-only production SQL at 16:30:10 UTC matched both exact migration ledger
  hashes and the complete selected catalog: 14 functions, 16 triggers, two
  relations, including metadata/privileges/policies. Catalog JSONB MD5:
  `be096d617047c0e5e3c69275fac5b5af`. Coaching remained unpaused at generation 8.
- The 17:04:11 UTC production readback verified project/owner, READY production
  target, exact main SHA, all three aliases, unchanged 31 runtime bindings,
  unchanged domain redirects and no rolling release.
- An existing Vercel-authenticated browser read the exact READY deployment URL.
  The canonical site matched its Flight build identity and all ten entrypoint
  script paths. One observed stylesheet matched byte-for-byte: 58,505 bytes,
  SHA256 `b17811d44cfc968287fb01c62161296f1ed91b750d26cb26bed299f183260179`.
  This is sampled asset verification, not a hash of every deployment file.
- Existing owner-session GET `/api/coach/weekly` at 17:02:35 UTC succeeded:
  same active program, same accepted plan, identical full serialized accepted
  plan contents, and two history plans. The program UI loaded successfully.
  No review, acceptance or workout-write action was invoked.
- The deployment-specific log query at 17:02:56 UTC returned zero 5xx rows
  since the merge. This bounded observation is not a long-term monitoring claim.
- `initialDosePolicy` remains `false`. Previously verified local profile and
  named Podman VM restart results remain applicable; these tools did not change
  during the closeout.

## Recovery and retained evidence

The verified compatible prior deployment `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`
remains the fallback. No rollback was needed. The old unstamped application
remains incompatible with this rollback contract; do not reverse migrations.

Sanitized machine receipt: [production-closeout-2026-09-26.json](production-closeout-2026-09-26.json).
Private/working evidence remains ignored under `output/app-quality-release/`.
The original asset reference and failed comparison are preserved alongside the
corrected result. The mismatch came from comparing hydrated DOM script nodes
to server-rendered entrypoints; the exact deployment's observed resource
inventory resolved it. See the [verification investigation](../../../handoffs/investigations/programming-quality-closeout-verification.md).

The browser stylesheet capture took roughly 22 minutes inside one tool call.
It made no production mutation. It is not suitable as a time-critical rollback
mechanism. The rollback path remains the installed Vercel CLI, pinned to the
compatible prior deployment and the approved project scope.

This closes the completed batch, not the whole programming QPlan. The i40 epic
and unfinished packages remain open. Resume i40.1/P0 baseline adjudication and
sealed holdout next, preserving Greg's six accepted qualitative judgments.
Project-board reporting remains unmapped; no board event was saved.
