# ADR-0041 - Authenticate the owner-only WHOOP cron GET

- Status: Approved scope; isolated implementation under review, release/runtime acceptance pending.
- Date: 2026-10-19.
- Decider: Greg, explicit approval at16:19:36UTC.

Vercel delivers cron requests as GET. The existing production GET returns405; the separate POST already checks the existing bearer secret before creating the service-role client and synchronizes every connected owner. The unchanged hosted definition matches `vercel.json`: daily `30 10 * * *` UTC. A GET-to-POST alias would activate writes for inactive retained connections, exceeding the single-owner pilot.

Use a private shared handler with server-controlled scope. POST supplies all-connected scope and retains its previous production/development authentication, lookup, iteration, aggregation and errors. GET always checks the same existing CRON_SECRET/bearer validation before privileged work, selects only `user_id` from the existing connection list, and applies the existing fixed verified-owner predicate. It chooses at most one connected match, never falls back to another account, and uses the existing incremental sync/client. GET responses are no-store. Caller headers/query/body/environment cannot select an owner or change scope.

This changes scheduled GET behavior only. It adds no credentials, permissions, registry, schema, schedule, provider fetch window, health/date calculation, timing mapper or reader. The fixed hash filter is a feature scope, not authentication. An encrypted secret entry's presence does not prove its value or a successful future invocation. Existing ordinary-sync concurrency and partial-batch limits remain.

Rejected alternatives: an all-connected GET alias; a new owner selector/configuration or account flag; a second scheduler; manual authenticated sync to prove deployment. Release follows PR98 through normal required CI/protected merge/Git deployment. Validate source/config and unauthenticated guard behavior without invoking a successful authenticated sync; actual owner retention requires separate ordinary scheduled evidence. Rollback restores GET405 through the same protected path and retains all timing/health records and columns.
