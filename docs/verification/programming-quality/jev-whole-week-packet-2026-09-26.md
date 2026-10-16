# Whole-week decision review: offline preparation

Tracking: `Fitness-Tracker-i40.4.8`. Four synthetic development weeks now contain
24 proposed judgments tied to full compiler output. No model calls or human
adjudications were made. This completes packet preparation, not P3 runtime work.

## Prepared review

| Week | Context | Proposed supported / contradicted / unknown |
|---|---|---|
| 01 | Acceleration and upright speed; incomplete upright tolerance history | 3 / 1 / 2 |
| 02 | Strength with a secondary upright-speed goal omitted by compilation | 4 / 1 / 1 |
| 03 | Two running outcomes with explicit 1500 meter priority | 3 / 2 / 1 |
| 04 | Running development and retained strength; unknown outside conditioning | 4 / 1 / 1 |

The questions cover demand relevance, evidence fidelity, current emphasis and
tradeoffs. They are independent hypotheses, including deliberate errors. They
are not six simultaneous coaching instructions or rationales produced by the
compiler. The evidence narratives and labels are synthetic development material.
They have not been scored by a domain reviewer or JEV.

Each request includes the independently supplied confirmed intent, evidence and
unknowns, candidate dispositions, and the complete generated plan: profile,
direction, coverage, scheduled sessions, exercises, dose, effort, rest and stop
conditions. Request and provenance hashes bind these together. Review text uses
the exact model state and questions. Reviewer labels, deterministic findings and
owner IDs are excluded from model requests.

The full exact review is in ignored local output:
`output/programming-quality-review/jev-whole-week-development-v1/review.md`.
Sibling files contain frozen requests, proposed labels and deterministic findings.
The tracked scripts and synthetic fixtures reproduce them without private data.

## Findings and verification

All four weeks pass the existing weekly-dose validator, stored-format roundtrip
and time arithmetic checks. Week 02 still omits the explicitly requested maximum
velocity demand, with no corresponding compiler gap. The separate scoped
target-presence check catches that omission. The application defect is preserved
for the P3 adapter repair; this packet does not fix it.

Target presence proves only that mapped priority-work blocks exist. It does not
prove appropriate emphasis, sufficient dose, event specificity or correct
allocation between two goals sharing a domain. Two dimensions of the secondary
demand remain unreviewed in each case, explicitly listed in the output. No overall
pass score is produced. Numerical load authority remains disabled.

- 96 tests passed across the five focused packet, runner, decision and compiler
  trace suites. This includes 13 new tests. The export reran those 13 successfully.
- TypeScript and scoped ESLint passed. An initial test-only TypeScript error was
  corrected before the successful final check.
- Negative checks detect corrupted time budgets/block sums and removal of priority
  work while coverage assignments remain. Exact request hashes change with dose,
  evidence or priority edits. Original v1/v2 request manifests remain unchanged.
- Requests are 107,487; 141,252; 92,524; and 124,106 UTF-8 bytes. Each has six
  questions. These pass the local 180,000-byte preparation ceiling; this is not a
  provider token-limit or live transport verification.
- Exported files were read back; the directory is git-ignored. No network calls,
  holdout reads, accepted-plan writes, production changes, commits or pushes.

Frozen SHA-256 identities:

| Artifact | SHA-256 |
|---|---|
| Manifest | `21a3dd4cf35f21ec368ccacd47c5775844c867e411d5032ebd8663ddc6ac81a7` |
| Proposed labels and exact review context | `7fd855a89823344ce24862632069e108d1a3a62eec5f2fbcf1c0068c4e3e08d8` |

## Remaining work

Follow-up `Fitness-Tracker-i40.4.9`: review these exact claims and proposed labels, then prepare the full-week dispatch
contract: four requests with six independent questions, provider token preflight,
updated size bounds, immutable request/receipt bindings and no-resend accounting.
The existing eight-request, one-question runner cannot dispatch this packet.
Reusing it or its exhausted prior allowance would be incorrect. Any live comparison
requires a new named model/call/spend approval after that preparation is reviewable.

Runtime shadow integration still belongs alongside the demand/theme adapter under
P3 and its P2 acceptance dependency. Passing synthetic checks does not close P0/P2,
approve a program, or authorize numerical activation. Board connection remains deferred.
