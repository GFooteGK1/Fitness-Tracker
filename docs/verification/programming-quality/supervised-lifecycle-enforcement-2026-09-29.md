# Supervised lifecycle enforcement — September 29, 2026

Canonical task: `Fitness-Tracker-i40.17.2`, under active milestone `i40.17`.
Status: local implementation accepted after independent review and 117 passing
tests across eight suites. No hosted or retained migration applied.

## Verified adapter boundary

`supervised-lifecycle-recovery.ts` reads a saved issue, acceptance, actual-set or
completion receipt through one owner-authenticated getter. It checks the exact
program, operation, original request identity and saved result, and checks the
account again after the asynchronous lookup. Historical acceptance returns the
original accepted target; it does not claim that target is still active.

No receipt means unconfirmed. Recovery does not resend a mutation, mint another
identity, clear pending work or create a no-write fence. Transport failures and
conflicts preserve the original request. Historical payloads are not normalized
through a newer write schema.

`supervised-review-http.ts` provides an unwired HTTP factory for candidate
submission, bounded reads, authenticated review decisions and receipt recovery.
It authenticates before reading request content, validates the expected account,
limits request size, projects response fields and uses private/no-store caching.
The private approved-packet resolver is not exposed.

Both suites pass in implementation and independent review: 15 recovery checks
and 11 HTTP checks. Full nonincremental TypeScript and scoped lint pass. The
initial TypeScript union-narrowing error was corrected without changing the RPC
contract; see `handoffs/investigations/Fitness-Tracker-i40.17.2.md`.

## Database enforcement

Migration `20260930020000` adds an explicit immutable initial-base anchor,
permanent program-lineage enforcement, exact approval checks, scoped execution
and read-only receipt lookup. Twenty disposable SQL cases pass, including two
complete approval/acceptance/set/correction/completion cycles and a subsequent
review containing the corrected actual RIR. Source evidence uses a 90-day window
that includes the fixture workouts; changed actuals are asserted in the packet.
Independent review verified the initial-base reactivation/NULL-pointer,
accepted-proposal identity/status, execution-slot and alternate correction fixes.

The completed-work correction path must retain the existing canonical amendment
contract while checking current enrollment and original accepted authority.
Revocation cannot be bypassed by amending linked workout evidence through a
different API. Standalone and nonpilot corrections keep their existing behavior.

Additional checks cover pause, revoked/expired/replaced enrollment, original
receipt recovery after disablement, direct writes, actual legacy proposal RPCs,
and an unchanged nonpilot qualitative lifecycle. An upgrade case installs this
migration over a foundation candidate and approval, explicitly anchors the real
current accepted base, preserves candidate/decision JSON, and still refuses stale
issuance. Provisioning cannot invent acceptance or replace the initial anchor.

## Maintainable private issuer

Candidate preparation now retains the exact detached draft inside its private
input snapshot. The bounded reviewer packet does not expose that draft. The
unwired issuer accepts IDs only, recovers an existing receipt first, and reads
an existing owned registration before attempting new compilation. A fresh
registration requires authenticated approval, retained-draft hash binding,
recompilation from current owned source, and equality of the entire private and
review packets. Older approvals without retained input require a new review.
No timestamp tolerance, source refresh or developer registry edit substitutes for
approval. SQL revalidates exact authority at each new write.

Independent issuer review found and closed an existing-registration nonpilot
bypass: the shared SQL issuer supports legacy programs, so this supervised server
factory requires a matching immutable supervised candidate before issuing any
registration. Unavailable candidate reads preserve the original request as
retry-required. Eighteen issuer tests and 32 candidate/service tests pass.
Response loss stops the attempt; explicit retries retain the same identities.
Committed receipts remain readable while disabled without recompilation.

The unmocked integration uses actual candidate submission, reviewer decision,
private resolution, owned-source compilation, registration and issuance against
SQL. Exact packet equality survives the database roundtrip. After revocation,
global pause and server disablement, recovery invokes only the getter. A valid
pre-existing nonpilot registration is refused by this issuer while the legacy
SQL path remains usable. The fixture serializes role/JWT operations; it is not a
real Auth transport or concurrent database test. Independent final run: eight
suites, 117 tests. Full nonincremental TypeScript and scoped ESLint pass.

Checked SHA-256 hashes (local evidence, not a release manifest):

| File | SHA-256 |
| --- | --- |
| `supervised-candidate-server.ts` | `9cbf34115c818323c126e90c628b0edada1cbc3efa6dd0ac0e2211e90bb56cd2` |
| `supervised-proposal-issuer.ts` | `f0ed27d9e4774dc40dfdce6582f7e7eb51bdd4d4b6d6fc572859e675cbd0ab25` |
| `supervised-lifecycle-recovery.ts` | `332e2ef96da7f3323fe431417c2eab6b3c16e050ff75db54cf1b0c435175f30e` |
| `supervised-review-http.ts` | `663f8622d460d447bca15be43738784e45de9042ebc1fd9664f2c0aa64cc74b9` |
| `20260930020000_supervised_programming_lifecycle.sql` | `47042e27c1011d9a8d44286dc34c9973a36692e6d3af662caccf2d16b65b1c9d` |

## Remaining qualification

Real multi-connection PostgreSQL concurrency, retained Auth/PostgREST and browser
cycles remain subsequent proof. Disposable SQL role simulation is not actual
authentication. The maintainable UI and scoped runtime are tracked in dependent
`Fitness-Tracker-i40.17.3`. Named athlete and accepted base remain unconfirmed.
No new
migration is applied to retained or hosted Supabase, no new HTTP route is wired,
and global numerical policy remains disabled.
