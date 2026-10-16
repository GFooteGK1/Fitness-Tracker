# Full-session evidence readback

September27 Chicago / September28 UTC. Canonical task `Fitness-Tracker-u5l.6.9`.

The reviewed compiler previously reused the conversational factual-context
projection's16,000-character limit. A complete reviewed session exceeded it,
leaving the compiler correctly refusing partial evidence. The limit served the
wrong consumer; increasing model context globally would not fix that boundary.

`buildPerformedWorkEvidence` now uses the same factual projection with an explicit
8,000,000-character internal record ceiling. `fetchReviewedDoseContext` consumes
that complete bounded evidence. Any cap, retrieval gap, ownership conflict,
superseded completion or unsupported source still requires review. Raw source
bindings and revision invalidation stay unchanged. This is a resource bound,
not a training-policy threshold or permission to prescribe. It bounds serialized
record output after normalization, not peak process memory.

`buildPerformedWorkContext` retains the16,000-character chat limit. Typed purpose
separates these packets, and the renderer rejects internal compiler evidence.
The internal packet has no model/HTTP route consumer. All raw per-set fields
already supported by the factual projection remain unchanged; no aggregation,
load inference or fabricated actual is introduced.

## Proof

- 144 focused regressions passed across factual context, dose evidence, authenticated
  adapter, reviewed-week readers, decision readback and planning history.
- Full TypeScript and focused ESLint passed.
- Independent review found no blocker and passed95 focused tests. Its two
  precision suggestions were addressed: output-budget wording and exact unique
  report-ID equality in the full-week readback check.
- Internal90-set test preserves all fields while the chat projection is explicitly
  partial. Internal8M overflow remains partial; foreign ownership and incomplete
  retrieval retain their existing guards. Renderer refuses the wrong packet.
- Real loopback run `6f231f50-1e2a-4da1-94e8-eb8343a2d3ec`:53 checks passed.
  Five accepted reviewed session shapes generated105 explicit synthetic actual
  reports:29/19/18/23/16 across the week, covering nested preparation, monitoring,
  side-specific sets, working sets, running and cooldown. Each session includes a
  correction before completion. Synthetic values intentionally differ from targets.
- All105 latest reports reach authenticated factual readback, with252,758 record
  characters and zero omissions. Every report's quantities, missingness, effort,
  rest, raw sensor values/method, side, symptoms, note and revision match its source.
  Prescribed protocol references survive while actual setup remains unknown.
- A fresh server-owned synthetic registration compiles the reviewed week offline;
  this is transport/registration proof, not validation of a new coaching decision.
  A subsequent canonical completed-workout amendment invalidates that registration.
  The accepted original plan stays unchanged. Chat remains explicitly partial.

After independent review, the strengthened unique-manifest check also passed in
run `61fb1394-96b3-4278-bb31-455e35088f49`:53 checks,105 reports,252,739 record
characters. Final receipt:
`output/app-quality-release/reviewed-dose-61fb1394-96b3-4278-bb31-455e35088f49/receipt.json`.
No migration or hosted write in this slice. Numerical activation remains disabled.
W5 still requires canonical movement/equipment eligibility, trusted numerical
proposal and source-current atomic acceptance, route/UI lifecycle and broader
W10/release evidence. This does not establish arbitrary-sized history support.
Canonical child `.9` is closed; `.10` tracks canonical eligibility. Board report
delivered/read back version73, event `731d1c10-a1f9-432a-90b2-14b4ee4ef0df`.

## Resolved fixture failure

First full-week run `ea8e5110-cffb-4c98-a4b9-766494692e25` preserved105 reports but
failed its final amendment with22023. The test sent one projection envelope for
29 canonical blocks; the existing validator correctly requires matching counts.
Corrected the fixture to send one envelope per block. Subsequent full-week runs
`ebb86cf5-dd82-424d-a936-dbc09908a2e5` and the final run above passed. No uncertain
write was retried; failed fixture state remains preserved.
