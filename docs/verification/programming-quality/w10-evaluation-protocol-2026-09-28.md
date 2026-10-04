# W10 compiled-program evaluation protocol

Status: development harness preparation. W10 remains in progress. This protocol
does not approve numerical activation, a fresh athlete prescription or a release.

## Decision and scope

Determine whether the bounded reviewed-option compiler faithfully carries an
explicitly approved complete week into an executable program, and whether
qualified review finds that program suitable within its supported context.
Policy `initial-dose-0.2.0` supplies exact reviewed references, not a generalized
numerical progression rule. A fresh numerical case requires its own qualified
option and complete-week approval before the compiler receives a trusted
registration. The evaluator must not manufacture or repair this authority.

Greg is the assigned coaching reviewer. His accepted C2-R and developmental
week judgments stand. Do not ask him to repeat those approvals or infer all six
rubric scores from them. Review records and engineering outcomes are separate.

## Phases and evidence identity

1. Development adapter: use the exposed C2-R and developmental references and
   ten exact-context counterfactuals to verify the harness. They are deliberately
   labeled exposed development; changes to IDs do not make them holdouts.
2. Fresh evaluation preparation: an independent custodian prepares substantively
   new supported contexts and grouped counterfactuals. Obtain qualified numerical
   option/week approval separately from withheld grading expectations. Freeze
   the roster, support classes, review sources and expected differences before
   execution. Do not reclassify failures as unsupported after seeing output.
3. Execute actual compilation against unchanged approved registrations; preserve
   complete inputs, facts, bindings, output, abstentions, exceptions and failures.
4. Review actual output, record dimension scores and disagreements, and resolve
   important engineering findings before W10 acceptance. Missing review remains
   unvalidated. An all-abstention result cannot demonstrate numerical quality.

The current adapter implements phase 1 only and rejects any holdout label. P5's
separate sealed 16-case package stays sealed; its missing adapter/calibration
is not supplied by this development run. f4k's exposed comparisons remain useful
historical preparation, not new quality evidence or renewed paid-call authority.

## Rubric and failure taxonomy

Use the existing six dimensions in `baseline-and-rubric.md`; retain its 0/1/2
definitions. The JSON packet starts every score at null (unreviewed).

| Dimension | Qualified judgment | Deterministic supporting evidence |
| --- | --- | --- |
| Evidence fidelity | Distinguish actuals, targets, estimates and unknowns | Full context/source snapshots and hash bindings |
| Athlete fit | Goals, history, equipment and limitations support the choice | Exact reviewed-context correspondence |
| Prescription suitability | Complete dose and progression fit the current limiter | Full sets, reps, load, effort, rest and instructions |
| Whole-week feasibility | Spacing, competing work and recovery are workable | Complete dates, content and conditional time estimates |
| Monitoring judgment | Measurements and follow-up suit the decision | Preserve protocols and actual-versus-target separation |
| Executable consistency | Athlete can carry out the intended work | Lossless read contract and complete recipe correspondence |

Score 2 means usable within the stated scope; 1 means material correction or
clarification; 0 means unacceptable. Null never means pass. A correct abstention
is reported separately from a usable compiled week. Authority/provenance or
constraint violations block acceptance regardless of averages. Examples include
an unapproved load, changed source/context accepted under old review, omitted
preparation/rest, silent schedule changes, unknown history treated as absence,
or a failed expected candidate being removed from the denominator.

The development harness checks expected disposition, complete prescription
content, source binding, profile/direction preservation, estimated time budget,
lossless readback, authority flags and input immutability. Rejections on changed
context mean fresh review is needed; they do not prescribe what a coach should
do in that new context. The checks do not claim to prove server ownership,
database behavior or physiological appropriateness.

## Runner and artifacts

From this worktree, run `node scripts/programming-w10-runner.mjs prepare`, then
`node scripts/programming-w10-runner.mjs run <returned UUID>`.
Preparation bundles the actual compiler and exposed fixture adapter with the
installed esbuild; no dependency installation or model call is needed.
Preparation can compile the already-exposed references and is not a blind phase.

Each new preparation freezes transitive source-file bytes, policy/rubric/reference
documents, this protocol, runner, package lock, TypeScript configuration, Node
version, complete input roster and bundle. Execution verifies those hashes before
its exclusive start fence. Changed code requires a new development preparation;
never overwrite a failed attempt. These hashes detect drift, not malicious local
editing or reviewer impersonation. Same-account procedural custody is not a
cryptographic proof of blindness or human qualification.

Artifacts under `output/app-quality-release/programming-w10/<UUID>/`:
`manifest.json`, `runner.cjs`, `suite.json`, `started.json`, `report.json`,
`review-packet.json`, `receipt.json`, and `failure.json` if execution throws.
The report retains every complete input/output and separate case hashes.
The review packet binds to the report and leaves scores empty. It is preparation
for explicit sourced review, not an ingestion path for unverified score edits.
There is no automatic human-quality pass or W10 closure in this runner.

Before a fresh numerical-quality run, extend the adapter under review for the
approved new roster, source authority and withheld expectations. Bind submitted
human reviews to input/output/rubric hashes, validate calibration and reviewer
provenance, and preserve disagreements. No standalone scalar average can close
W10. Runtime numerical policy remains disabled and the production registry empty.
