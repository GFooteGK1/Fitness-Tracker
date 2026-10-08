# W10 sourced review records and new authority question

W10 remains in progress. This checkpoint adds record-integrity checks and one
independently prepared coaching-review proposal. It supplies no new numerical
authority, human score, unseen result or activation approval.

## Review records

`scripts/programming-w10-adjudication.ts` creates a pending ledger and validates
explicitly sourced partial/complete judgments. It binds the full report to its
retained execution receipt, the execution manifest to that report, and the rubric
to its original pre-execution source hash. Each review binds the complete case
input/output, reviewer attribution, date, exact source quote and source hash,
scores, expected decision, prohibited inferences, critical errors and unresolved
disagreements. A quote/hash is provenance evidence, not proof of reviewer identity,
professional qualification or semantic authorization of every recorded field.

No missing dimension is assigned a score. Partial judgments remain partial.
Abstentions, exceptions and usable compiled weeks are separate. A failed
mechanical case or unresolved finding cannot count as a recorded usable program.
Contradictory known scores are rejected even when the review is partial.
Calibration records require source evidence and already complete referenced
reviews. Complete recordkeeping can include negative judgments; it is not W10
acceptance. Development origin and zero unseen cases remain explicit.

The local helper supports:

```
node scripts/programming-w10-review-records.mjs prepare <completed run UUID>
node scripts/programming-w10-review-records.mjs check <completed run UUID> <review UUID>
```

Preparation writes a new, uniquely named ledger with every review null. It does
not edit the original run or create coaching labels. A separate `sources.json`
index explicitly lists review-document IDs and paths; only Markdown files under
the programming-quality verification directory are permitted. Ledger fields do
not cause arbitrary file reads. Checks use the frozen validator bundle/source
manifest and write no judgment or activation state. Changed validator source
requires a new preparation; preserve earlier ledgers.

Final empty review ledger:
`output/app-quality-release/programming-w10-adjudication/bc56a14a-2ea3-4d18-ac9e-bde15da8cddc/`.
Bound program run: `11ddc38b-d152-44fa-b086-7d7f24622e22`.
Actual helper preparation/check passed:12 cases, zero complete/partial reviews,
zero recorded usable weeks, calibration absent, W10 incomplete, activation false.

Verification:24 focused tests, full nonincremental typecheck, scoped lint and
helper syntax pass. Independent review reproduced all24 and both adversarial
probes. Initial review found partial-score conflict and original-rubric binding
gaps; both were fixed and reverified. Preliminary empty ledger
`689840be-ed92-495a-8aa3-04cd42c930b7` is preserved and superseded. No real human
review records were written or altered during either preparation.

## Pending coaching decision

An independent author prepared `w10-fresh-context-review-1.md` and its author
receipt. It proposes lower-body hypertrophy in two40-minute home slots, limited
2–20kg adjustable dumbbells, no accepted source plan and no completed-set history.
All numerical work is proposed, never treated as performance. The complete
calendar, preparation, per-set effort/rest, load conventions, side counts,
outside walking commitment and overrun response are explicit.

Coordinator arithmetic independently matches the author's calculation:
2,250seconds (37:30) each session,150seconds of conditional margin,11 individual
working efforts per session. This is arithmetic, not observed duration, equipment
load sufficiency or coaching approval.

Draft SHA256 at presentation:
`d29f9754ae41c57209a053fa8a8be908b4496769330b292c64ea9c5d1923e089`.
An async question asks Greg whether to approve this starting week, clarify recent
training/load details first, or revise it. No answer has yet been recorded in this
checkpoint. Keep the question pending; do not infer approval from elapsed time or
the earlier C2-R approval. No candidate compilation or trusted registration exists.

The packet is now exposed to the implementation author and Greg. It is an
authority/calibration proposal, not an untouched holdout. For the eventual fresh
scored roster, preserve separation: freeze the adapter before a custodian prepares
the payload/expectations, show the designated human reviewer the authority packet,
and do not open that hidden roster in the implementation thread before execution.
Record any exposure honestly. P5's separate sealed package remains untouched.

The next action after Greg's response is to record the exact judgment, resolve
any requested clarification/correction, and determine applicability to initial
planning. Do not invent an accepted base to force this initial-week case through
the existing replacement path. P0/P1 and broader P2-P6/release gates remain open.
