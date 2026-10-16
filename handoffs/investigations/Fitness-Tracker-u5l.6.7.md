# W5 reviewed storage and per-set evidence

Outcome and proof: `docs/verification/programming-quality/reviewed-set-storage-2026-09-27.md`.
Local-only migration applied once; do not replay the bootstrap against the live
synthetic stack. New helper refuses an already-applied migration.

Resolved failures:
- First database test used invalid program status `paused`; actual schema allows
  `archived`. Corrected fixture; rerun passed.
- First typecheck found three untyped PGlite result reads. Added result types;
  subsequent full typecheck passed.
- Independent review found enum coercion and date rollover in TS, plus a legacy
  child under a reviewed parent. Fixed and covered; final review no blockers.
- apply_patch reported a context error after applying two earlier updates.
  Inspected exact file contents before applying only missing additions.
- A few exploratory rg commands used unsupported Windows path globs. No files
  changed; use an existing directory with `-g` instead of globs in path arguments.

No failed real migration or integration attempts in this slice. Real local week
run d461c3bc-e406-4213-a312-ac28de60044a passed 39 checks, including concurrency.
Session run b06c0718-27b8-49b2-9ebe-e54c35843a8b passed 24 checks.

Next: atomic set-preserving completion. Existing old check-in completion trigger
deliberately rejects reviewed sessions; generation/acceptance proposal trigger
also remains fenced. Do not merely remove those guards or relabel reviewed
payloads as legacy. Use immutable actual report revisions, maintain one canonical
workout/receipt, and test retries, corrections, source invalidation and RLS.
