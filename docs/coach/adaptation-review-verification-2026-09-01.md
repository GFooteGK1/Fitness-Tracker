# Adaptation Review Verification - 2026-09-01

## Scope

This is local application evidence for `adaptive-review-0.1.0` and
`POST /api/coach/adaptation-reviews`. The layered evidence migrations were later
applied to production after explicit approval. This record does not claim that
the route was deployed or that a proposal was created in production.

## Rule and counterexample proof

The focused evaluator and endpoint tests prove:

- one high or low outlier does not establish a trend;
- one readiness value cannot override improving direct outcomes;
- separate comparability keys and protocol series cannot be combined to meet a
  repeated-exposure requirement;
- repeated compatible direct improvement can recommend progression;
- repeated direct decline plus repeated recovery decline recommends recovery;
- repeated direct contradiction without a recovery concern recommends a
  specificity redirect;
- proxy or training-signal improvement without direct transfer recommends a
  specificity review;
- two recent compatible outcomes must meet an athlete-confirmed target before
  maintenance is recommended;
- concerning pain overrides progression and blocks proposal creation;
- sets within one workout remain one exposure while set decay and velocity loss
  remain visible;
- identical as-of inputs create the same SHA-256 evidence-snapshot identity;
- review-only requests perform no proposal write; and
- an eligible replacement request calls only the draft-proposal RPC, embeds the
  exact evidence snapshot, reports that the active plan did not change, and
  still requires separate acceptance.

Focused adaptive-coach regression passed 11 files and 77 tests. The final full
Vitest run passed 208 files and 2,336 tests; five files and seven
environment-gated tests were skipped. TypeScript and Next.js lint passed. The
production build compiled and generated all 76 routes with non-secret
build-only public Supabase placeholders. `git diff --check` passed.

Production database application and CLI readback completed on September 1,
2026; see
`../migrations/adaptive-coach-production-application-2026-09-01.md`. Proposal
creation, proposal acceptance, application deployment, and the authenticated
synthetic canary remain separate approval gates.
