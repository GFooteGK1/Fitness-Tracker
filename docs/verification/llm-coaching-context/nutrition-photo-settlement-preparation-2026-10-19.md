# Trusted nutrition usage settlement: inactive preparation, 2026-10-19

## Implemented boundary

The owner provider path now retains original full reservations and settles only
after a valid complete provider response, durable valid result acknowledgement
and fresh verified owner identity. Counts come directly from Decisions HTTP usage
and x-request-id, or Responses original usage/id/standard tier. Generic adapter
missing-usage-to-zero defaults are never financial authority. Missing or invalid
usage keeps the full reserve; it does not invent zero cost or trigger another
paid request. Only the internal trusted server composition uses the existing
service-role client; no HTTP/MCP input exposes settlement.

The unapplied SQL adds one service-role-only settlement function with empty search
path, fixed owner/capture/stage/policy/model/rate and receipt checks. Authenticated
and anonymous EXECUTE is revoked, including PUBLIC inheritance. Owner result
transitions no longer set financial completion timestamps. The existing admission
lock serializes settlement and paid admission; confirmed charges use integer
premium ceilings with upward rounding. Original reservations and usage evidence
remain. Identical evidence replays return the original receipt; changed evidence
or a reused provider receipt conflicts. Confirmed charges age after trusted DB
settlement plus24h60s; unknown reserves never age out during the pilot. Initial
period totals use every confirmed charge plus every unresolved full reservation.
There is no period reset, timeout release, refund API, fallback, retry or job.
A deliberately underreserved fixture returns bound_violation and durably halts
new admission instead of clamping/refunding. Historical settlement after period
end cannot authorize new calls. Both existing false gates remain false; the new
settlement function has an additional literalfalse gate. No SQL was applied.

The same approved existing OpenAI key stays server-side in place. The existing
server service-role capability is reused via the established reviewed-proposal
pattern; only the new narrow RPC receives EXECUTE for service_role in the draft.
No credential was read/exported or new role/bucket/storage/global permission added.
Service-role holders and DB administrators remain trusted privileged actors.

## Practical synthetic capacity

Specified fixture:3,000 screening input tokens ->660microUSD;5,000 estimate input
plus1,024 output ->4,778microUSD using conservative long-context/cache-write/region
premium ceilings and upward rounding, with no caching discounts. Full reserves
of250,000/600,000microUSD are still taken BEFORE dispatch.

The full capture integration exercises private synthetic Storage transport,
actual SQL capture/RLS/canonical operations and service-only settlement, with inert
provider transports. Ten sequential captures in one rolling day yield ten meals,
20 provider attempts,54,380microUSD confirmed exposure. Before the tenth estimate,
rolling exposure is649,602microUSD including its full600,000 reservation. The
existing independent ten-capture admission ceiling remains enforced.

A disposable SQL copy replaces only pilot clock_timestamp() with an authoritative
test-database clock (not client-supplied time). Thirty groups of ten captures are
spaced24h61s apart, within one fixed720h interval.300 captures yield300 canonical
meals and1,631,400microUSD total confirmed exposure. Before the final estimation,
period exposure including the full reserve is2,226,622microUSD. New calls stop at
period end. These are specified-usage synthetic results, not live food/photo
accuracy, actual invoices or a guarantee that arbitrary photos cost this amount.
Larger usage or unresolved attempts reduce capacity. One fully unresolved capture
retains850,000microUSD and blocks subsequent paid stages even after25h. No budget
increase or uncertainty release was used to pass capacity acceptance.

Failure tests cover lost settlement acknowledgment (confirmed DB record survives,
no estimate dispatch), rejected settlement (full reserve remains), and canonical
commit failure after confirmed provider usage (known cost survives unrelated meal
failure). Role tests deny owner/anon execution despite forged JWT-role claims and
direct amount/time/delete/truncate mutation. Reused receipts and changed evidence
conflict; malformed/negative/fractional/unsafe/overbound/missing counts do not settle.

## Verification and exact outstanding release scope

Builder and independent receipts outside the repo bind revision/raw hashes and
check results. Independent review/mutation must complete before this slice is
considered reviewed. The new capacity acceptance is intended to reject the prior
no-refund behavior rather than merely mirror implementation outputs.

No permitted multi-session PostgreSQL environment was found: native binaries and
Docker/Podman are absent; WSL inventory returned E_ACCESSDENIED and was not retried
or bypassed. Installed PGlite is one queued connection. These tests do not prove
independent PostgreSQL transaction scheduling. No package was installed and no
hosted production schema/data was touched to obtain proof.

Hosted OpenAI key/model/project/pricing/data-control qualification remains pending.
Configured sensitive key presence is not credential qualification. A separately
inactive fixed-model metadata diagnostic is being prepared; metadata GET success
alone cannot prove paid endpoint permission, billing or retention controls.

Before any activation: qualify existing hosted key/rate/endpoint contract in place,
obtain real concurrency and private Storage runtime proof, inspect existing deployed
canonical capture function compatibility, and obtain exact approval for the final
SQL hash and all literal gate flips. The migration creates the policy period at
application time, the three prepared tables and owner/service transition functions.
No cron/job/global LLM setting, storage policy, new credential or permanent deletion
is part of that scope. A separately approved single selected synthetic photo canary
would reserve up to$0.85, make at most one screening and one estimation, verify
private owner isolation/provenance/idempotence/settlement/correction, and never
imply permission for more photos or production adoption.
