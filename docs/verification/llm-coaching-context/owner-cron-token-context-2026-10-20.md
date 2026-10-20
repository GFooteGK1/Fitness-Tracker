# Owner-only WHOOP cron token context

Scope approved October 20, 2026: the authenticated fixed-owner GET only. The ordinary October 20 request reached the owner sync but failed token validation before provider data fetching. HTTP 200 wrapped a failed per-owner result; it was not ingestion proof.

The owner GET now uses an explicit incremental owner-cron entrypoint. The already authenticated service client reaches owner token lookup, guarded rotation persistence, sync status and domain writes. An absent/mismatched owner cannot enter this path. No global privileged fallback, new setting, credential, permission, schedule or schema is introduced. Normal sync-all POST and user-session token APIs retain their existing paths.

Expired access may be refreshable. The owner path refreshes below the existing five-minute threshold, including fully expired access, and persists encrypted rotated credentials before fetching data. Persistence updates the existing owner row only while its prior encrypted refresh value still matches; it cannot recreate a disconnect or overwrite a replacement grant. Missing/unreadable credentials and refresh/persistence failure produce no domain writes or credential deletion. Unexpected token-operation errors are sanitized.

The boundary test uses the real route, sync and token implementation with stateful database doubles, synthetic crypto and mocked WHOOP. It forbids unmocked network access. CI uses a synthetic feature-selector double; separate private local verification uses the unchanged real selector and an independently read owner identity vector kept outside this public repository. No real tokens or health values are test fixtures.

Local candidate checks: focused behavior/regression tests, TypeScript and lint. Independent review, sensitivity mutations and required CI bind the final candidate separately. These checks prove bounded code behavior; actual refreshed-token validity, future scheduled ingestion and retained provider timestamps require a later ordinary run. No manual sync or live token refresh is part of release verification.

Rollback is a normal code revert retaining records, permissions, credentials and the schedule. Do not reconnect the owner solely because access has expired or a cookie-scoped lookup returned no rows.
