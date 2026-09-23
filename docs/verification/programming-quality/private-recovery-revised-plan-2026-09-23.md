# Private recovery correction plan — September 23, 2026

Status: proposed; blocked pending Greg's approval under GUARDRAILS section 8.
Issue: `Fitness-Tracker-i40.11`. Complexity: 3, operational/security boundary.

## Recommendation and evidence

Reuse completed encrypted capture `backup-20260923220856-d35a0ccf`. Correct the
restore's role-setting and schema-grant handling, qualify only demonstrated
logical representation differences, and establish actual collation runtime
compatibility before another real private restore. Confidence is high in the
two diagnosed defects and moderate in full completion because locale evidence
is missing. No application behavior or production schema change is proposed.

All 93 included physical table digests matched in `restore-abb072d3-e2a`, but six
catalog sections differed. The [investigation](../../../handoffs/investigations/programming-quality-private-recovery.md)
records three substantive failures and the independent retained-evidence review.
Archive authentication and data equality do not override schema/security failures.

| Approach | Benefit | Cost and failure mode | Decision |
| --- | --- | --- | --- |
| Fortress: reproduce the entire hosted runtime and physical catalog layout | Closest platform reproduction | Root/platform keys and hosted service internals are unavailable; logical archives do not retain dropped-column slots. Significant platform-specific work, with no demonstrated path under current authority | Reject as the immediate method |
| Avant-Garde: use a general semantic comparator and treat all six differences as equivalent | Potentially broad portability | Would conceal the proven search-path and schema-access defects; a general SQL equivalence engine greatly expands scope and maintenance | Reject |
| Synthesizer: repair serialization and grants, use narrow proven comparisons, resolve locale first, then reuse archive | Keeps existing authenticated evidence and isolates each causal issue | Requires focused regressions and may remain blocked on runtime compatibility | Recommend |

The stricter platform-reproduction route becomes preferable if the objective
expands to hosted Auth/Storage/Vault service recovery and approved resources and
keys exist. That is outside this database release gate.

## Ordered execution after approval

1. **Resolve the missing locale fact before another private restore.** Prepare
   and locally review one bounded read-only metadata query on the already
   authorized production project `auolnfwetmfcwhtvakzy`: database identity,
   provider/locale, recorded version and `pg_database_collation_actual_version`.
   Use existing explicit transaction controls and encrypted diagnostics. Allow
   one source connection attempt, with no table rows, new export or automatic
   retry. Any official temporary CLI login refresh remains within the previously
   approved access route. Timestamp this evidence; it cannot retroactively prove
   the runtime at the archive timestamp. Read the corresponding version from a
   separate synthetic local database created with the exact captured ICU
   provider and locale on the pinned candidate image, not the default database
   locale. If actual versions differ, stop this
   branch and identify a pinned compatible no-cost runtime before proceeding;
   do not refresh version metadata, guess compatibility or run a real restore
   with an unexplained mismatch. If the source's stored version is stale, record
   that finding explicitly and retain the stored difference in the final report.
   Name this recorded-version-only exception; do not report raw catalog equality.

2. **Repair the local restore and its focused verification.** Work only in
   `scripts/release/private-recovery-roles.mjs`, the restore runner, manifest/
   comparison helpers and their focused tests. Preserve all archive entries.
   For search_path, use a transaction-local, safely quoted setting and
   `ALTER ROLE ... SET search_path FROM CURRENT`; qualify all helper references
   through pg_catalog. Verify exact stored values, multiple schemas, quoted
   commas and caller-setting restoration in synthetic PostgreSQL. Do not apply
   source-config values as arbitrary SQL or enable executable preload settings.
   Reconstruct source schema ACLs in the private restore, including owner,
   grantor, recipient and grant option; order delegated grants by authority.
   Compare exact effective privileges and reject missing or extra access.
   Exercise both missing-grant and unexpected-public-access negative controls.

3. **Constrain comparison changes.** Compare surviving columns in their original
   logical order with all other properties exact; a reorder must fail. Expand
   NULL table ACL only to PostgreSQL's documented built-in owner defaults for
   the same object kind and owner; lost third-party grants must still fail.
   For the three CHECK expressions, require a bounded structural proof that
   only associative AND grouping differs while retaining identical ordered
   operands, identifiers, casts and operators. Add negative cases for OR,
   changed bounds/casts and grouping that changes meaning, plus synthetic
   NULL/boundary evaluation. Blanket parenthesis stripping is forbidden. If
   proof is unavailable, leave the constraint comparison failing. Retain raw
   encrypted catalogs and disclose each applied equivalence rule separately.

4. **Independent review, then one private restore of the same complete archive.**
   Review the real setting/ACL corrections, negative controls, locale evidence
   and comparison scope before execution. Use a fresh network-disabled RAM
   container with the existing authentication-before-staging, ACL, inactive
   worker/event-trigger, no-port and cleanup controls. Require all 93 data
   digests, accepted-plan and migration coverage, role/membership/configuration,
   effective grants, schema/functions/extensions/RLS, and justified catalog
   comparisons to pass. Any unexpected difference fails closed. Emit a sanitized
   receipt and preserve encrypted full comparisons. Stop the container and
   record cleanup on success or failure.

## Attempt budget, authority and rollback

Independent plan review passed after clarifying the exact synthetic locale and
the disclosed recorded-version exception. This is technical review, not Greg's
approval to resume. No probes, SQL or corrective code ran during that review.

Approval starts one new cycle with at most **three substantive failed attempts**
against this recovery gate, counted across local remedies, source diagnostics,
tools and agents. Reassess after two; stop after three. Additionally cap the
cycle at **one production metadata connection attempt and one real private
restore invocation**; there is no automatic source or restore retry. An unmet
locale prerequisite stops the dependent restore without spending that invocation.
The prior three end-to-end failures and earlier connection cycles remain recorded.

Keep the old archive, encrypted manifests and diagnostic packages unchanged.
Local code edits are reversible through ordinary reviewed edits; no destructive
Git commands or deletion of retained evidence is needed. Private containers are
stopped through the existing cleanup path. Never put real data into the synthetic
canary, Git, ordinary logs or test fixtures. Same-user DPAPI and host-memory
limitations remain; this is not off-device recovery or hosted-service parity.

Requested authority is to restart this bounded method only. It includes the
local corrections/checks, single source metadata check and single private
restore described above. It does not authorize production deployment, migration,
pause/resume, restore, configuration/grant changes, paid resources or new
off-device storage. Complete verified recovery before the separate production
rollback-artifact and release-approval gates.

## Primary references

PostgreSQL documents `SET FROM CURRENT` as saving the current setting for future
role sessions: [ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html).
Default owner privileges explain the narrow NULL-ACL equivalence; they do not
justify dropping other grants: [Privileges](https://www.postgresql.org/docs/17/ddl-priv.html).
Collation version refresh updates recorded metadata and does not prove affected
objects were rebuilt: [ALTER COLLATION](https://www.postgresql.org/docs/17/sql-altercollation.html).
