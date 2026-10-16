# Qualitative preparation recovery — local representation proof

Task `Fitness-Tracker-u5l.6.14`, still in progress. September 28, 2026.

The weekly compiler, stored-session reader and session card now preserve an
explicit preparation prescription to rest as needed. Its positive finite time
estimate contributes once to arithmetic and is visibly identified as an estimate,
not a recovery limit. A source-bound instruction for insufficient time is required.

Schema 1 stays numeric-only and existing fixed-rest snapshots round-trip without
content changes. Schema 2 is emitted only for qualitative preparation recovery.
Working/monitoring/cooldown activities, fixed preparation windows, hidden unused
between-set rest, malformed estimates and missing timing instructions reject.
Actual-rest reports remain numeric or unknown; estimates do not fill actuals.

## Verification

Final focused run: **163 tests passed across 7 suites**, covering conditional
recovery, offline weeks, rolling-week readback, actual reports, session display,
actual-session UI and disposable storage. Full nonincremental TypeScript and
scoped ESLint passed. Independent review found no material representation blocker
and independently passed77 tests before the additional storage checks.
The reviewer subsequently inspected the new storage and actual-rest assertions.

Disposable PGlite verified schema-2 storage/readback, exact parent-session equality,
prescription versus actual separation, foreign-owner denial and legacy behavior.
It loads reviewed migrations `.01`, `.02`, `.09`; it does not establish the final
installed registration/continuity writer chain. Two new fixture mistakes (readback
column name and foreign-owner expected SQLSTATE) were inspected and corrected;
the final suite passes. Details: `handoffs/investigations/Fitness-Tracker-u5l.6.14.md`.

**Subsequent complete reviewed-sequence check:**
`test/database/reviewed-conditional-lifecycle.test.ts` loads every reviewed
migration `.01` through `.09` together on the disposable test foundation.
Four lifecycle tests pass, also independently reproduced4/4. Full tsc and scoped
lint pass. Service registration, protected issue/accept replay, exact complete
week/effective-session readback and immutable original base all pass. Foreign
recovery/issuance/acceptance are denied; a changed source revision blocks acceptance
without replacing the active base. Actual set correction and completion replay
retain one workout, and its canonical actual rest is245 seconds, not the180-second
preparation estimate or the earlier unknown value.

The packet's base and execution slots come from actual SQL reads; its source
envelope is hand-built for this mechanical test. This is not proof of the full
authenticated source-reader adapter, real Supabase Auth/PostgREST, concurrent
transactions, deployed schema compatibility or a reviewed C2-R coaching decision.
It supersedes the earlier partial reviewed-migration coverage limit only.

Prepared migration: `20260928090000_reviewed_qualitative_recovery.sql`, SHA256
`BAD7735DCA6EAB25EF0F9FE0CDF8DFCBB3415F15D2366830E502B206EB7F794B`.
It only expands supported reviewed session versions in the existing constraint;
parent-plan and registration guards remain unchanged. It was **not applied** to
the retained local Auth/PostgreSQL database or any hosted database. No historical
rows were changed. ADR-0031 records the representation decision.

## Still required

The pending C2-R weekly-context judgment is unchanged. Mechanical schema fixtures
are not coaching approval. After that judgment, bind the accepted dose and exact
preparation to the complete week with immutable before/after provenance. Verify
the new path through the full current SQL chain, actual local Auth/PostgreSQL,
registration/acceptance/readback and actual Next routes; include qualification
counterfactuals and stale-source rejection. No schema-2 browser proof is claimed.

Canonical numerical capability remains false and production registry empty.
No retained fixture reset, live database application, hosted writes, paid calls,
new trusted positive registration, commit or push. W5/W10/P0/P1 remain open.
