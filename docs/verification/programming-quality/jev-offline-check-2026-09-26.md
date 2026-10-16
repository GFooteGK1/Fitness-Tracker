# Offline JEV decision-check prototype

Tracking: `Fitness-Tracker-i40.4.3`. Local preparation complete; P3 remains open.

## Implemented

`scripts/programming-decision-check.ts` builds bounded Choice requests from synthetic
goal demands, dispositions, evidence and individual claims. Every independently
supplied demand needs exactly one disposition. Missing references and mismatched
evidence ownership stop evaluation. Missing measurement information can remain
explicit and receive an insufficient-evidence judgment.

Each request contains at most eight independent checks. Unchecked dimensions and
demands remain visible; an evaluated receipt is not an overall program pass.
The request allowlist excludes local labels, owner IDs and complete baseline
programs. Packet, proposal and acceptance hashes bind results to source/intent
revisions, policy, question version and pinned model. Changed inputs invalidate
receipt reuse; a response becoming stale during evaluation retains usage but is
marked not evaluated.

`scripts/jev-choice-contract.ts` ports only the existing coaching-layer client's
Choice interfaces and pure response validation, with sanitized local errors. It
does not create another authenticated client. An explicit callback is required;
there is no default transport, credential access, route integration or persistence.
No evaluator, invalid input, malformed response and service failure all return
not evaluated. Errors are sanitized and no automatic retry occurs. A future live
adapter must use the existing accounted dispatcher and bounded transport; this
prototype does not provide live dispatch recovery or service deadlines itself.

The caller supplies a typed local packet. This is not an untrusted HTTP input
validator, RLS implementation or proof of evidence ownership in a live database.
The caller must derive evidence and confirmed demands from authoritative sources
when runtime integration is implemented. Hashes record supplied content; they do
not prove its completeness, truth or correspondence to a compiled program.

## Verification

Command:

```powershell
npx vitest run test/coach/programming-decision-check.test.ts test/coach/programming-goal-demand-trace.test.ts
```

49 tests passed across two files: 42 new prototype checks and seven existing
goal-demand trace checks. Full TypeScript checking and scoped ESLint passed.
The initial run caught an incorrect test reference to the capability helper;
calling the helper fixed it, and the final run passed.

Eight synthetic development cases cover demand mapping, proxy overreach,
maintenance, uncertain introduction, temporary deferral, unknown protocols and
contradictory evidence. Their verdicts are scripted test inputs, not JEV results
or human-calibrated labels. Tests verify prompt state and response handling;
they do not measure coaching accuracy or prompt-injection resistance.

Failure checks cover invalid references/owners, omitted dispositions, duplicate
scope, excessive size, aliases, malformed distributions, incorrect model/answer
sets, service failures, callback mutation and stale evaluations. Tests preserve
conflicting verdicts separately and expose partial review scope.

The real deterministic development-week compiler and stored-format serializer
are exercised with supported, contradicted, insufficient-evidence and service
failure callbacks. Proposal/session payloads and supplied acceptance state remain
unchanged. Accepted-history input is also unchanged. This proves the offline seam
does not mutate those inputs; no acceptance RPC or hosted workflow was exercised.
All tests stub global fetch and assert zero calls. Source search found no app import
of either new script. `personalizedCoachingCapabilities().initialDosePolicy`
remains false. Focused main-thread review covered authority isolation, response
validation, source binding and the limits of scripted model results.

## Next boundary

Prepare human-reviewed development labels and a named provider/model, call limit
and spend limit for the first live shadow comparison. Preserve the existing
dispatch accounting/no-resend behavior when wiring that runner. Neither runtime
activation nor automatic review routing is included in this prototype. The P3
demand/theme adapter and its P2 acceptance dependency remain separate unfinished
work. Frozen baseline and sealed holdout were not changed or consumed; no private
athlete data was transmitted. Board connection remains deferred.
