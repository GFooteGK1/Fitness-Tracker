# Cache property fixture correction — September 23, 2026

CI run 35927882780 on e7d1506 failed Property 8.5 in
test/sheets/tab-cache.property.test.ts: 1 failed, 3,483 passed, 19 skipped.
The fixture's beforeEach creates one cache for the whole property test, while
all generated cases share it. A later supposedly absent key can be present from
an earlier case. Production uses Map; this was not a prototype-key cache defect.

The callback now creates a fresh TabCache for each generated case. The three-line
test-only change preserves the property and does not alter application behavior.
Verification passed the recorded seed -661996668 with 100 generated runs, the
exact CI counterexample, and the normal full file's ten tests. Temporary replay
parameters were removed. Root reviewed the final diff; whitespace checks passed.

The targeted runs excluded output/** retained source copies. Recovery tooling
has separate 51-check evidence. Final published-checkpoint CI remains a separate
result and must not be inferred from this focused replay.
