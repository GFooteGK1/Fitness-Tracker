# Reviewed proposal transactions: local checkpoint

September 27 Chicago / September 28 UTC. `Fitness-Tracker-u5l.6.11` remains in progress.

Private database registration and atomic acceptance now work for exact reviewed
same-week replacements before work starts. A service-only RPC stores an immutable
packet and reserves proposal/plan IDs. The athlete selects only that registration
ID and a retry key. Copying a registration ID into an older caller-content RPC
does not confer numerical authority.

Issuance stores the exact reviewed intent, source snapshot and ordered full session
manifest. Registration also checks that its manifest equals the complete compiled
week. The proposal guard checks reserved IDs, owner/base, complete envelope and
child manifest. The existing acceptance RPC retains its transaction and retry
behavior; its late guard accounts for the legitimate base/active-pointer changes
already made inside that transaction. Failure rolls every transition back.

The combined open-window index is replaced with separate proposed and accepted
uniqueness. This permits an accepted week and one pending same-week revision to
coexist without changing the accepted week. Source revision, exact accepted base,
memory lifecycle, local source date, validity deadline, intent/setup and version
checks run under the existing lock discipline. Session NOWAIT checks avoid waiting
in reverse order against session writers. Exact response-loss retries preserve
issued IDs and accepted content without reauthorizing a new mutation.

## Scope still unfinished

Started or terminal work currently requires review: set reports, old session
signals, check-ins and terminal session states all block replacement. This keeps
the original execution intact but does not implement carrying that execution into
a changed week. Target dates/sequence must match the exact current reviewed week.
Next-week profile/date reconciliation, carrying execution forward, application
issuance integration, and route/UI lifecycle remain. No task closure or broader
W5 completion is claimed. Numerical activation remains off; there is no default
registry, generation route or production change. All work remains uncommitted.

## Verification

- Final local Auth/PostgreSQL run `f91912ae-9741-4cfd-85b2-e56956d82343` passed
  105 checks. Its receipt is under
  `output/app-quality-release/reviewed-proposal-f91912ae-9741-4cfd-85b2-e56956d82343/receipt.json`.
- Verified service-only registration/private table, foreign denial, unchanged-ID
  registration replay, conflicting payload/key rejection, legacy-RPC copied-ID
  denial, incomplete manifests, concurrent identical issuance and acceptance,
  full old/new intent readback, accepted replay after later actual work, source
  correction and clock-expiry conflicts, altered-content rollback and duplicate
  child rejection by existing uniqueness.
- Begun reviewed work blocks acceptance. Legacy actual signals also block it while
  their session still says planned. A concurrent legacy signal and acceptance
  cannot both commit; the active pointer matches the winning transaction.
- 188 regressions passed across reviewed source/compiler, set/completion storage,
  context revision, setup bindings and stored review proposal API. Full current-
  source TypeScript and focused ESLint passed.
- Independent review found the missing legacy-signal guard; fixed before applying.
  Recheck found no blockers for the restricted path and passed 137 tests. Final
  full-manifest change received another read-only review with no blockers.
- After both migrations, prior loopback flows passed: session 24 checks
  (`da40c64a-195a-49bb-acf2-85e49d545f37`), week 52
  (`7fd56784-14b2-4478-9e17-168e36f76c20`), full week 57
  (`70c9a23a-015a-4b40-98e0-f255ac0780b2`).

## Local schema and resolved failures

Applied `20260928030000_reviewed_proposal_registration.sql` once to the verified
loopback container. First transaction run
`56e7de13-48b7-46fa-b6f3-15b94cadb6a8` failed with SQLSTATE 42883:
`function public.assert_coach_setup_memories_current(uuid, jsonb, jsonb) does not exist`.
The proposal transaction rolled back. Readback confirmed the missing prerequisite;
applied existing `20260926010000_coach_setup_memory_bindings.sql` once locally
(hash `6E7CF5A3CA5598BB9CDE81CB11452DB3D0EBE5316BBCDD78226ADE7362875B8B`).
Reruns passed. This is unrelated to the separately gated hosted release.

An added duplicate-child fixture then failed because existing session uniqueness
correctly returned 23505. The test now asserts that protection and successful
acceptance of the unchanged valid proposal. Added independent incomplete-packet
manifest validation and a service-registration rejection case. Applied only the
updated registration function locally, without replaying the migration.

Final registration migration source hash:
`67C1D728A14E273AEBEAE7F7AF740DBA42B8F0D248923B4FC4F9828E230C08EC`.
The local application helper now checks the setup prerequisite and refuses replay
of all four stages. Do not reset/bootstrap or reapply these migrations.
Board checkpoint delivered/read back at version 76, event
`ee78221a-1e38-475c-ad0e-c32a3e23d363`. `.11` remains in progress.
