# Setup freshness repair: coordinated release

Task: `Fitness-Tracker-i40.15`. Status: local candidate verified; commit and push
authorized September27. Production approval remains pending. This releases the clock-freshness
repair, not the unfinished programming strategy or JEV experiments.

## Candidate and scope

The candidate is isolated in `.worktrees/setup-freshness-release` on fresh main
`d3c07c59bae4c7b9782460823381e3e82cd793f2` (merged workout-save recovery PR85).
The programming-quality worktree retains all its existing changes. No earlier
branch merge or production cutover is replayed.

Runtime scope: four weekly routes, `setup-memory-bindings.ts`, context projection,
revision error mapping and additive migration
`20260926010000_coach_setup_memory_bindings.sql`. Include their tests, bootstrap
scope option, migration byte attributes, ADR0030, release documentation and
local artifact exclusions. ADR0029 belongs to the intervening workout-save repair.
Preserve all PR85 files and the deployed numeric workout RPE schema.

New behavior: newly proposed rolling weeks bind the canonical setup records they
read. First acceptance rejects missing, corrected, expired or overdue bindings,
including clock-only changes. Fresh reviews can replace obsolete pending records.
Accepted plans and same-key accepted replay remain immutable. Numerical
`initialDosePolicy` remains false.

The original local migration source had CRLF hash
`6e7cf5a3ca5598bb9cde81cb11452db3d0ebe5316bbcdd78226ade7362875b8b`.
The uninstalled release candidate is normalized to LF and pinned by Git attributes;
its canonical release SHA256 is
`3db1bfa44acfe078af7a0278c8b65b78f92489368b9d19a7a31bc7e8e32c6527`.
This changes no SQL semantics or previously installed migration. Use the canonical
hash for exact release identity, retaining the original as source-copy provenance.

## Publish and verify the exact candidate

Greg authorized committing and pushing ready work on September27. Create
`codex/setup-freshness-release` at this checkout, commit only this scoped candidate
and push that branch. A new draft PR against `main` is the next review step.
Do not update merged PR84. Require independent review,
full tests, TypeScript, lint, production build and maintained mobile journeys on
the exact final SHA. Reconcile a newer main without overwriting user work and
repeat affected checks. Vercel Preview shares production Supabase: no synthetic
write canary is permitted there.

The new `setup-freshness-smoke.test.ts` installs workout recovery first, creates a
real compiled accepted week, commits pause, applies the setup migration, verifies
unchanged accepted replay, resumes, rejects an old writer, accepts a bound proposal
and re-pauses. This is ordered isolated PostgreSQL proof, not hosted or concurrent
session proof. The existing 27 transactional binding tests and route recovery
tests cover conversion, stored reviews, source identity, expiry and ownership.

`build-local-coaching-bootstrap.mjs --revision-only` preserves the historical
pause-rehearsal input contract; default generation includes setup bindings.
Historical cutover smoke must not be presented as setup-upgrade evidence.
Real PG17.6 multi-session rehearsal has now passed on the separate local project
`sociusfit-setup-freshness-local`, using the exact renderer without SQL predicate
replacement. The candidate's local production build also passed14 real HTTP/Auth
checks. Lifecycle checks across all four weekly routes also passed, including
clock-only expiry, stored-review recovery, legacy conversion, fresh confirmation/replacement and
immutable accepted history. The combined
[local receipt](../verification/programming-quality/setup-freshness-local-release-2026-09-26.json)
records this scope; it does not prove hosted transport or mobile browser behavior.

The separate maintained mobile suite subsequently passed all26tests on this
uncommitted candidate. The [mobile/preflight receipt](../verification/programming-quality/setup-freshness-mobile-preflight-2026-09-26.md)
records fixture scope and results. Exact final-commit CI must still run these gates.

## Target and preflight

Prepared transport-free query and classifier:
`scripts/release/setup-freshness-preflight.mjs`, query SHA256
`cadbfca49db645d23a8e01176983d4412f5cf5b24c9008935d18dbf575fe558f`.
Fifteen tests cover target, freshness, ledger, predecessor ACL/definition and full
pause-catalog refusal cases. A read-only execution on the already-upgraded local
PG17 stack succeeded and correctly failed production pre-install qualification.
The query includes both accepted and superseded plan/session content digests.
This validates the query and refusal behavior, not current production state.

`scripts/release/setup-freshness-platform-readback.mjs --read-only` is the reviewed
fixed-project/team CLI fallback. It reads production deployment, aliases, domains
and environment metadata without decryption, and suppresses raw response errors.
Its execution awaits revised-method approval after three connector schema
failures. Two browser inventory timeouts yielded no hosted SQL transport.
No hosted preflight has passed, and neither helper authorizes a rollout.

Production targets are Supabase `auolnfwetmfcwhtvakzy` and Vercel project
`prj_RocmjxStsTrtmrDaqMddMnb29ENh` (`fitness-tracker`), serving `www.sociusfit.com`
and the project's currently attached production aliases. Enumerate and freeze
the exact aliases and current deployment from live readback before approval.
Do not inherit the old fallback deployment: it predates later application fixes.

Record fresh schema/ledger, current function definitions and ACLs, pause generation,
accepted-plan/session digests, production source/deployment identity and runtime
bindings. Confirm workout migration `20260926120000` is installed. Confirm setup
migration `20260926010000` is absent and record its exact candidate SHA256.
Check that installed proposal/review functions match the expected fresh-main
predecessors. Unknown drift stops the rollout for review.

The setup migration sorts before the already installed workout migration. Apply
only this exact reviewed migration and its ledger record in one transaction; do
not use broad `supabase db push --include-all`. Prepare and test the wrapper against
the observed ledger schema, with short lock timeout, exact precondition checks,
duplicate-install refusal and post-commit readback before production approval.

`scripts/release/setup-freshness-install.mjs` now prepares that atomic transaction
without executing it. It pins source bytes and rechecks the paused generation,
exact prior pause/revision ledger bytes, workout-recovery ledger, and three
predecessor definition hashes. Before rendering for production, compare captured
hashes to the reviewed PostgreSQL 17 baseline: capturing current hashes alone
does not establish correctness. The isolated test verifies rollback on stale
generation/catalog, duplicate refusal and exact atomic ledger contents. Actual
PostgreSQL17 transport/rehearsal has passed; hosted readback remains pending.

The local bootstrap normalizes historical source CRLF to LF. Its three captured
definition MD5s are local reference values, not necessarily hosted raw hashes.
For each exact signature in `SETUP_PREDECESSORS`, fresh hosted preflight must
compare `md5(replace(pg_get_functiondef(to_regprocedure(signature)), E'\r\n', E'\n'))`
with the reviewed local reference MD5 in the combined receipt. Only this line-ending
normalization is allowed; any other mismatch requires definition/source review.
Retain the fresh unnormalized definition MD5 separately and pass that raw hash
to the install renderer so its in-transaction check still detects any actual drift.
Do not substitute the local normalized hash for the observed raw installation hash.

## Ordered hosted rollout (separate explicit approval required)

1. Freeze the candidate SHA, migration hash, exact deployment/alias targets,
   bounded synthetic-owner smoke contract and recovery operations. Current
   production approval is absent. Do not create users, invoke coaching writes,
   migrate, merge or promote while preparing this contract.
2. Through the existing operator-only CAS, commit coaching pause using the fresh
   expected generation. Read back the new paused generation; a dispatched call
   alone is not proof of drain. Confirm normal noncoaching logging remains healthy.
3. While paused, apply the exact migration and ledger transaction. Keep pause
   active on timeout or uncertain outcome and inspect ledger/catalog before any
   decision. No blind mutation retry. Verify exact definitions, revoked helper
   privileges, search paths and retained one-second review RPC lock timeout.
4. Merge the reviewed candidate only under release approval, keeping writes paused
   while the normal Vercel Git deployment reaches READY. Confirm the expected
   merged source, build identity, every frozen production alias and unchanged
   runtime bindings. If no normal deployment occurs, diagnose before requesting
   any manual deployment action.
5. Verify read-only accepted-plan history and same-key replay. For write smoke,
   use only the separately approved isolated/synthetic identity and exact request
   set. The global pause cannot permit synthetic HTTP writes while denying every
   other writer. Explicitly approve any bounded reopen interval, or complete
   writes in an isolated environment and report production write coverage as
   unverified. Never imply that Preview is isolated.
6. Verify initial, conversion, current-review and stored-review recovery; stale
   binding rejection; fresh replacement; first acceptance and immutable replay.
   Re-pause immediately if a required check fails. Record exact outcomes and
   accepted-history digests. Resume normal coaching only after the approved
   acceptance gates pass, with fresh generation CAS and committed readback.

## Recovery

Before migration, retain the current verified deployment. After installing the
guard, old writers omit required bindings and are incompatible. Do not roll back
only the app, remove guards, rewrite accepted snapshots or reverse migrations.
Keep coaching paused and deploy a reviewed forward repair using the new binding
contract. Returning aliases to a compatible candidate is allowed only if that
exact target was independently verified and approved. A failed/uncertain migration
requires transaction/ledger/catalog inspection, not automatic reapplication.

## Authority and remaining evidence

Approved September27 publication scope is one branch, scoped commit and push.
It does not authorize merge, migration, pause/resume, manual deploy, user creation,
paid calls or numerical activation. The broader remaining-steps goal authorizes
continued local preparation; hosted steps require the exact reviewable target
and action approval described in the repository contract.

Finish local release rehearsal and exact-head CI/review, then present one concrete
production execution packet. Leave P0/P2/P3 and the JEV review work open under their
existing tracker items. Board connection remains deferred.
