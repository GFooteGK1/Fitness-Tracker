# Approved inactive settlement slice, 2026-10-19

Greg's implementation approval and tested-slice standard authorize normal inactive
releases; final activation, migration, paid calls and permanent deletion remain
separately gated. Parent explicitly directed synthetic trusted-usage settlement
and realistic capacity development. This accepts the previously proposed trusted
settlement plan; no additional permission is inferred for live operations.

## Decision before implementation

The problem is capacity: full-context reservations without releasing confirmed
excess allow only one full photo/day and five total. Owner result JSON also must
not establish financial completion timestamps. Goals: ten sequential synthetic
captures/day under unchanged $1rolling24h/$5initial720h limits, retaining all unknown
exposure; an independently verified, server-only settlement boundary.

Three approaches were considered:
- Full reserves forever: simplest and conservative, but fails daily food tracking.
- Exact preflight token counts: Responses supports exact request counts including
  images; equivalent Decisions question counting and endpoint billing were not
  qualified. Adding another provider request is unnecessary for this slice.
- Trusted confirmed-usage settlement: keep full reserves before every dispatch,
  then replace only confirmed exposure using provider-response usage and worst
  qualified rate multipliers. Existing service-role composition/RPC patterns make
  this the narrowest viable route. Selected; parent directed this development.

The server gets counts directly from each actual successful provider response,
requires complete valid output and explicit usage (never generic zero defaults),
and binds a unique provider receipt, stage/model/capture/owner/policy. Owner JSON,
MCP arguments and persisted estimate values cannot invoke settlement. A single
service-only RPC validates and serializes settlement under the admission lock,
retains original reservation/evidence, rounds charge upward in integer microUSD,
returns identical replays and rejects conflicts/reused receipts. A confirmed bound
violation halts new admissions. Owner result transitions lose all financial time
authority. Unknown/missing/error outcomes keep their full reserve indefinitely.

Implementation order: add strict response evidence; service-only atomic settlement;
wire only the two internal provider paths after durable valid result acknowledgement
and fresh owner verification; synthetic role/failure/capacity tests; independent
oracle/review/mutation; separate tested local commit/PR. All gates stay false and
SQL remains outside the migration runner. Existing key, service role and fixed
OpenAI endpoints are reused in place; no new credentials or broader role capability.
Rollback while inactive is code rollback; no live data/schema exists to reverse.

A separate literal-false diagnostic will prepare owner-authenticated fixed model
metadata GETs only, with no photo, prompt, arbitrary URL/model, raw body or secret
returned. Enabling/invoking it requires exact approval. Model metadata visibility
cannot establish paid endpoint access, project billing, prices or data controls.

Multi-session environment inventory: no native PostgreSQL/docker/podman command
or known installation found; WSL inventory returned E_ACCESSDENIED and was not
retried or bypassed. Only installed PGlite (single user/connection) is available.
True independent-session lock scheduling remains a release proof gap.

Primary sources: OpenAI Decisions create reference (explicit usage), token-counting
guide, model pricing and reasoning/output ceiling docs; Supabase database-functions
and secure-function guidance. The Supabase changelog Markdown fetch was unavailable
through the web reader (unsupported content type); no current SDK API change or
new dependency is needed. No live Supabase query/schema mutation or paid provider
request is part of synthetic implementation.
